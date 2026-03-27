import { SignalClient } from '@platform/signal';
import type { IncomingMessage } from '@platform/signal';
import { supabase } from '@platform/db';
import type { CoreMessage } from 'ai';
import { simon } from '../agents/simon/index.js';

const client = new SignalClient();

type ConvMessage = {
  role: string;
  content: string;
  timestamp?: string;
  source?: string;
};

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

  console.log(`[signal-listener] Message from ${senderName} (${senderNumber}): ${userMessage.slice(0, 80)}`);

  // Get or create conversation thread keyed by sender's phone number
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
      console.error('[signal-listener] Failed to create conversation:', error);
      return;
    }
    conv = created;
  }

  const messages: ConvMessage[] = Array.isArray(conv.messages) ? conv.messages : [];

  const newUserMessage: ConvMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date(dm.timestamp).toISOString(),
    source: senderNumber,
  };

  const updatedMessages = [...messages, newUserMessage];

  // Generate Simon's response
  let responseText: string;
  try {
    const messagesForSimon: CoreMessage[] = updatedMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const result = await simon.generate(messagesForSimon);
    responseText = result.text;
    console.log(
      `[signal-listener] Simon response (${responseText.length} chars):`,
      responseText.slice(0, 300),
    );
  } catch (err) {
    console.error('[signal-listener] Simon error:', err);
    return;
  }

  // Send reply via Signal
  try {
    await client.sendMessage({ recipients: [senderNumber], message: responseText });
  } catch (err) {
    console.error('[signal-listener] Send error:', err);
  }

  const simonMessage: ConvMessage = {
    role: 'assistant',
    content: responseText,
    timestamp: new Date().toISOString(),
    source: 'simon',
  };

  // Persist conversation
  await supabase
    .from('agent_conversations')
    .update({ messages: [...updatedMessages, simonMessage] })
    .eq('id', conv.id);

  // Audit log
  await supabase.from('agent_activity').insert({
    agent_name: 'simon',
    action: `Signal message from ${senderName}: ${userMessage.slice(0, 120)}`,
    status: 'auto',
    trigger_type: 'manual',
    workflow_run_id: null,
    entity_type: null,
    entity_id: null,
    proposed_actions: null,
    approved_actions: null,
    clarifications: null,
    notes: null,
  });
}

export function startSignalListener(): void {
  console.log('[signal-listener] Connecting to Signal via WebSocket');
  client.subscribe(handleMessage, (err) => {
    console.error('[signal-listener] WebSocket error:', err);
  });
}
