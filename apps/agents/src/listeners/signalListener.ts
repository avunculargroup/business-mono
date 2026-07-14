import { SignalClient } from '@platform/signal';
import type { IncomingMessage } from '@platform/signal';
import { supabase } from '@platform/db';
import { simon } from '../agents/simon/index.js';
import { findSuspendedRun, resumeFromReply } from './newsletterGate.js';
import { simonFailureMessage } from '../lib/simonFailureMessage.js';
import { createLogger } from '../lib/logger.js';
import type { ConvMessage } from './types.js';

const log = createLogger('signal-listener');
const client = new SignalClient();

// Bound Simon's reply so a hung model or runaway tool chain can't leave a
// director waiting forever with a typing indicator and no answer. Mirrors the
// web path (webDirectives.ts). Mastra forwards abortSignal into subagent calls,
// so this also cancels any in-flight specialist work.
const SIMON_TIMEOUT_MS = 240_000;

async function resolveSenderName(phoneNumber: string | null | undefined, signalId: string): Promise<string> {
  // Try phone number lookup in contacts
  if (phoneNumber) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name')
      .eq('phone', phoneNumber)
      .single();
    if (contact) return `${contact.first_name} ${contact.last_name}`;

    // Try team members by signal_number
    const { data: member } = await supabase
      .from('team_members')
      .select('full_name')
      .eq('signal_number', phoneNumber)
      .single();
    if (member) return member.full_name;
  }

  // No phone number (Signal "hide number" feature) — try Signal UUID lookup
  const { data: contactByUuid } = await supabase
    .from('contacts')
    .select('first_name, last_name')
    .eq('signal_uuid', signalId)
    .single();
  if (contactByUuid) return `${contactByUuid.first_name} ${contactByUuid.last_name}`;

  // Fall back: if it looks like a UUID (no + prefix), label it unknown
  if (!signalId.startsWith('+')) return 'unknown contact';
  return signalId;
}

async function handleMessage(envelope: IncomingMessage): Promise<void> {
  const dm = envelope.envelope.dataMessage;
  if (!dm?.message) return; // skip receipts, typing indicators, etc.

  const sourceNumber = envelope.envelope.sourceNumber;
  const senderNumber = sourceNumber || envelope.envelope.source;
  if (!senderNumber) return;

  const userMessage = dm.message.trim();
  if (!userMessage) return;

  const senderName = await resolveSenderName(sourceNumber, senderNumber);

  log.info({ senderName, senderNumber, preview: userMessage.slice(0, 80) }, 'message received');

  // Newsletter gate intercept: if this sender has a newsletter run suspended at
  // a human gate, treat the reply as the gate response and resume that run
  // rather than routing it through Simon's general handler.
  try {
    const suspendedRun = await findSuspendedRun(senderNumber);
    if (suspendedRun) {
      log.info({ runId: suspendedRun.runId }, 'routing reply to suspended newsletter run');
      void client.sendTypingIndicator(senderNumber).catch(() => {});
      const ack = await resumeFromReply(suspendedRun, userMessage);
      await client.sendMessage({ recipients: [senderNumber], message: ack });
      return;
    }
  } catch (err) {
    log.error({ err }, 'newsletter gate handling failed, falling through to Simon');
  }

  // Ensure agent_conversations row exists for dual-write
  let { data: conv } = await supabase
    .from('agent_conversations')
    .select('id, messages')
    .eq('signal_chat_id', senderNumber)
    .single();

  if (!conv) {
    const { data: created, error } = await supabase
      .from('agent_conversations')
      .insert({
        signal_chat_id: senderNumber,
        thread_type: 'direct',
        messages: [],
      })
      .select('id, messages')
      .single();

    if (error || !created) {
      log.error({ error }, 'failed to create conversation');
      return;
    }
    conv = created;
  }

  // Fire-and-forget typing indicator — failure must not block message processing
  void client.sendTypingIndicator(senderNumber).catch((err) => {
    log.warn({ err }, 'typing indicator failed (non-fatal)');
  });

  // Generate Simon's response via Mastra Memory (handles history retrieval, token limiting, etc.)
  // On failure we still reply — with a humane apology — so the director never
  // gets silence after their typing indicator clears.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIMON_TIMEOUT_MS);
  let responseText: string;
  try {
    const result = await simon.generate(userMessage, {
      abortSignal: controller.signal,
      memory: {
        resource: senderNumber,
        thread: `signal-${senderNumber}`,
      },
    });
    responseText = result.text;
    log.info({ length: responseText.length, preview: responseText.slice(0, 300) }, 'Simon response');
  } catch (err) {
    log.error({ err }, 'Simon error');
    responseText = simonFailureMessage(err, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }

  // Send reply via Signal
  try {
    await client.sendMessage({ recipients: [senderNumber], message: responseText });
  } catch (err) {
    log.error({ err }, 'send error');
  }

  // Dual-write: keep agent_conversations populated for web UI
  const existingMessages: ConvMessage[] = Array.isArray(conv.messages)
    ? (conv.messages as unknown as ConvMessage[])
    : [];

  const newUserMessage: ConvMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date(dm.timestamp).toISOString(),
    source: senderNumber,
  };

  const simonMessage: ConvMessage = {
    role: 'assistant',
    content: responseText,
    timestamp: new Date().toISOString(),
    source: 'simon',
  };

  await supabase
    .from('agent_conversations')
    .update({ messages: [...existingMessages, newUserMessage, simonMessage] })
    .eq('id', conv.id);

  // Audit log — failure must never affect the Signal conversation
  try {
    const { error: auditError } = await supabase.from('agent_activity').insert({
      agent_name: 'simon',
      action: `Signal message from ${senderName}: ${userMessage.slice(0, 120)}`,
      status: 'auto',
      trigger_type: 'signal_message',
      workflow_run_id: null,
      entity_type: null,
      entity_id: null,
      proposed_actions: null,
      approved_actions: null,
      clarifications: null,
      notes: null,
    });
    if (auditError) log.error({ error: auditError }, 'failed to insert audit log');
  } catch (err) {
    log.error({ err }, 'failed to insert audit log');
  }
}

export function startSignalListener(): void {
  if (process.env['SIGNAL_LISTENER_ENABLED'] === 'false') {
    log.info('disabled via SIGNAL_LISTENER_ENABLED=false');
    return;
  }
  log.info('connecting to Signal via WebSocket');
  client.subscribe(handleMessage, (err) => {
    log.error({ err }, 'WebSocket error');
  });
}
