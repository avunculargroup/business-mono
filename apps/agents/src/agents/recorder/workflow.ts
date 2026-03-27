import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { roger } from './agent.js';
import { telnyxDownload } from './tools.js';
import { deepgramTranscribe } from '../../tools/deepgram.js';
import { logActivity } from '../../tools/activity.js';

const DEEPGRAM_CALLBACK_BASE = process.env['RAILWAY_PUBLIC_DOMAIN']
  ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}`
  : 'http://localhost:3000';

// ─── Step 1: Ingest audio ───────────────────────────────────────────────────
const ingestAudio = createStep({
  id: 'ingest_audio',
  inputSchema: z.object({
    source: z.enum(['telnyx', 'zoom', 'signal', 'manual']),
    recordingUrl: z.string(),
    callControlId: z.string().optional(),
    meetingUuid: z.string().optional(),
    channels: z.enum(['dual', 'single']),
  }),
  outputSchema: z.object({
    audioUrl: z.string(),
    source: z.string(),
    channels: z.string(),
    externalId: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    let audioUrl = inputData.recordingUrl;
    let externalId: string | undefined;

    if (inputData.source === 'telnyx' && inputData.callControlId) {
      const result = await telnyxDownload.execute({
        context: {
          recordingUrl: inputData.recordingUrl,
          callControlId: inputData.callControlId,
        },
        runId: '',
        mastra: undefined as never,
        runtimeContext: undefined as never,
      });
      audioUrl = result.audioUrl;
      externalId = result.callControlId;
    } else if (inputData.source === 'zoom') {
      externalId = inputData.meetingUuid;
    }

    return { audioUrl, source: inputData.source, channels: inputData.channels, externalId };
  },
});

// ─── Step 2: Transcribe via Deepgram (suspends awaiting callback) ───────────
const transcribeAudio = createStep({
  id: 'transcribe_audio',
  inputSchema: z.object({
    audioUrl: z.string(),
    source: z.string(),
    channels: z.string(),
    externalId: z.string().optional(),
  }),
  outputSchema: z.object({
    transcript: z.string(),
    requestId: z.string(),
    channels: z.unknown(),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  execute: async ({ inputData, suspend }) => {
    const multichannel = inputData.channels === 'dual';
    const callbackUrl = `${DEEPGRAM_CALLBACK_BASE}/webhooks/deepgram`;

    const result = await deepgramTranscribe.execute({
      context: {
        audioUrl: inputData.audioUrl,
        callbackUrl,
        multichannel,
        diarize: !multichannel,
      },
      runId: '',
      mastra: undefined as never,
      runtimeContext: undefined as never,
    });

    // Suspend — workflow will be resumed by the Deepgram webhook handler
    const resumeData = await suspend({ requestId: result.requestId });

    return {
      transcript: (resumeData as { transcript: string }).transcript,
      requestId: result.requestId,
      channels: (resumeData as { channels: unknown }).channels,
      source: inputData.source,
      externalId: inputData.externalId,
    };
  },
});

// ─── Step 3: Identify speakers ──────────────────────────────────────────────
const identifySpeakers = createStep({
  id: 'identify_speakers',
  inputSchema: z.object({
    transcript: z.string(),
    source: z.string(),
    channels: z.unknown(),
    requestId: z.string(),
    externalId: z.string().optional(),
  }),
  outputSchema: z.object({
    transcript: z.string(),
    speakerMap: z.record(z.string()),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    // Fetch team members for director identification
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, name, signal_number');

    const prompt = `Given this transcript from a ${inputData.source} recording, identify who is speaking.

${inputData.source === 'telnyx'
  ? 'This is a dual-channel recording: Channel 0 = director/team member, Channel 1 = external contact.'
  : 'This is a single-channel recording with speaker diarisation. Match speaker labels to known participants if possible.'
}

Team members: ${JSON.stringify(teamMembers)}
Transcript: ${inputData.transcript}

Return a JSON object mapping speaker labels to names: { "Channel 0": "Alice", "Channel 1": "Bob Smith" }`;

    const response = await roger.generate([{ role: 'user', content: prompt }]);
    let speakerMap: Record<string, string> = {};

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) speakerMap = JSON.parse(jsonMatch[0]) as Record<string, string>;
    } catch {
      speakerMap = {};
    }

    return {
      transcript: inputData.transcript,
      speakerMap,
      source: inputData.source,
      externalId: inputData.externalId,
    };
  },
});

// ─── Step 4: Extract entities ───────────────────────────────────────────────
const extractEntities = createStep({
  id: 'extract_entities',
  inputSchema: z.object({
    transcript: z.string(),
    speakerMap: z.record(z.string()),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  outputSchema: z.object({
    extractedData: z.record(z.unknown()),
    transcript: z.string(),
    speakerMap: z.record(z.string()),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const prompt = `Extract structured data from this transcript.

Speaker map: ${JSON.stringify(inputData.speakerMap)}
Transcript: ${inputData.transcript}

Return a JSON object with:
- decisions: Array of { text, context, timestamp? }
- action_items: Array of { text, assignee?, deadline?, context }
- topics: Array of strings
- sentiment: "positive" | "neutral" | "negative" | "mixed"
- bitcoin_signals: Array of { contact, current_level?, inferred_level?, evidence }
- commitments: Array of { who, what, by_when?, context }
- mentioned_entities: Array of { name, type: "person"|"company"|"org", confidence }`;

    const response = await roger.generate([{ role: 'user', content: prompt }]);
    let extractedData: Record<string, unknown> = {};

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) extractedData = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      extractedData = { decisions: [], action_items: [], topics: [], sentiment: 'neutral', bitcoin_signals: [], commitments: [], mentioned_entities: [] };
    }

    return {
      extractedData,
      transcript: inputData.transcript,
      speakerMap: inputData.speakerMap,
      source: inputData.source,
      externalId: inputData.externalId,
    };
  },
});

// ─── Step 5: CRM match ──────────────────────────────────────────────────────
const crmMatch = createStep({
  id: 'crm_match',
  inputSchema: z.object({
    extractedData: z.record(z.unknown()),
    transcript: z.string(),
    speakerMap: z.record(z.string()),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  outputSchema: z.object({
    extractedData: z.record(z.unknown()),
    crmMatches: z.array(z.record(z.unknown())),
    lowConfidenceMatches: z.array(z.record(z.unknown())),
    transcript: z.string(),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  execute: async ({ inputData, suspend }) => {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_id');

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name');

    const mentionedEntities = (inputData.extractedData['mentioned_entities'] as Array<{ name: string; type: string; confidence: number }>) ?? [];

    const prompt = `Match these extracted entities against CRM records.

Extracted entities: ${JSON.stringify(mentionedEntities)}
Existing contacts: ${JSON.stringify(contacts)}
Existing companies: ${JSON.stringify(companies)}

Return JSON: { "matches": [{ "entity_name": "...", "type": "contact"|"company", "record_id": "...", "confidence": 0.95, "is_new": false }] }`;

    const response = await roger.generate([{ role: 'user', content: prompt }]);
    let allMatches: Array<Record<string, unknown>> = [];

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { matches: Array<Record<string, unknown>> };
        allMatches = parsed.matches ?? [];
      }
    } catch {
      allMatches = [];
    }

    const lowConfidenceMatches = allMatches.filter((m) => (m['confidence'] as number) < 0.8);

    // Suspend for human review if there are low-confidence matches
    if (lowConfidenceMatches.length > 0) {
      await suspend({ lowConfidenceMatches, allMatches });
    }

    return {
      extractedData: inputData.extractedData,
      crmMatches: allMatches,
      lowConfidenceMatches,
      transcript: inputData.transcript,
      source: inputData.source,
      externalId: inputData.externalId,
    };
  },
});

// ─── Step 6: Create interaction record ─────────────────────────────────────
const createInteraction = createStep({
  id: 'create_interaction',
  inputSchema: z.object({
    extractedData: z.record(z.unknown()),
    crmMatches: z.array(z.record(z.unknown())),
    lowConfidenceMatches: z.array(z.record(z.unknown())),
    transcript: z.string(),
    source: z.string(),
    externalId: z.string().optional(),
  }),
  outputSchema: z.object({
    interactionId: z.string(),
    extractedData: z.record(z.unknown()),
    crmMatches: z.array(z.record(z.unknown())),
    source: z.string(),
  }),
  execute: async ({ inputData }) => {
    const contactMatch = inputData.crmMatches.find((m) => m['type'] === 'contact');

    const { data, error } = await supabase
      .from('interactions')
      .insert({
        type: inputData.source === 'telnyx' ? 'call' : 'zoom',
        contact_id: (contactMatch?.['record_id'] as string) ?? null,
        transcript: inputData.transcript,
        extracted_data: inputData.extractedData,
        source: 'recorder_agent',
        external_id: inputData.externalId ?? null,
        occurred_at: new Date().toISOString(),
      } as never)
      .select()
      .single();

    if (error) throw new Error(`Failed to create interaction: ${error.message}`);
    const interactionId = (data as { id: string }).id;

    await logActivity.execute({
      context: {
        agentName: 'recorder',
        action: `Created interaction record ${interactionId}`,
        status: 'auto',
        triggerType: 'call_transcript',
        entityType: 'interaction',
        entityId: interactionId,
      },
      runId: '',
      mastra: undefined as never,
      runtimeContext: undefined as never,
    });

    return {
      interactionId,
      extractedData: inputData.extractedData,
      crmMatches: inputData.crmMatches,
      source: inputData.source,
    };
  },
});

// ─── Step 7: Propose CRM updates ────────────────────────────────────────────
const proposeCrmUpdates = createStep({
  id: 'propose_crm_updates',
  inputSchema: z.object({
    interactionId: z.string(),
    extractedData: z.record(z.unknown()),
    crmMatches: z.array(z.record(z.unknown())),
    source: z.string(),
  }),
  outputSchema: z.object({
    interactionId: z.string(),
    extractedData: z.record(z.unknown()),
    proposedUpdates: z.array(z.record(z.unknown())),
  }),
  execute: async ({ inputData }) => {
    const newEntities = inputData.crmMatches.filter((m) => m['is_new'] === true);
    const proposedUpdates: Array<Record<string, unknown>> = [];

    for (const entity of newEntities) {
      proposedUpdates.push({
        type: entity['type'],
        name: entity['entity_name'],
        action: 'create',
        confidence: entity['confidence'],
      });
    }

    // Log proposed actions for approval
    if (proposedUpdates.length > 0) {
      await supabase.from('agent_activity').insert({
        agent_name: 'recorder',
        action: 'Propose CRM updates from interaction',
        status: 'pending',
        entity_type: 'interaction',
        entity_id: inputData.interactionId,
        proposed_actions: proposedUpdates,
      } as never);
    }

    return {
      interactionId: inputData.interactionId,
      extractedData: inputData.extractedData,
      proposedUpdates,
    };
  },
});

// ─── Step 8: Propose tasks ───────────────────────────────────────────────────
const proposeTasks = createStep({
  id: 'propose_tasks',
  inputSchema: z.object({
    interactionId: z.string(),
    extractedData: z.record(z.unknown()),
    proposedUpdates: z.array(z.record(z.unknown())),
  }),
  outputSchema: z.object({
    interactionId: z.string(),
    proposedTaskCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const actionItems = (inputData.extractedData['action_items'] as Array<{ text: string; deadline?: string; assignee?: string }>) ?? [];

    for (const item of actionItems) {
      await supabase.from('agent_activity').insert({
        agent_name: 'recorder',
        action: `Propose task: ${item.text}`,
        status: 'pending',
        entity_type: 'interaction',
        entity_id: inputData.interactionId,
        proposed_actions: [{ type: 'create_task', title: item.text, due_date: item.deadline, assignee: item.assignee }],
      } as never);
    }

    return {
      interactionId: inputData.interactionId,
      proposedTaskCount: actionItems.length,
    };
  },
});

// ─── Step 9: Propose reminders ──────────────────────────────────────────────
const proposeReminders = createStep({
  id: 'propose_reminders',
  inputSchema: z.object({
    interactionId: z.string(),
    proposedTaskCount: z.number(),
  }),
  outputSchema: z.object({
    interactionId: z.string(),
    proposedTaskCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    // Reminders are proposed via agent_activity — PM and Simon pick them up
    return inputData;
  },
});

// ─── Step 10: Report to Simon ────────────────────────────────────────────────
const reportToSimon = createStep({
  id: 'report_to_simon',
  inputSchema: z.object({
    interactionId: z.string(),
    proposedTaskCount: z.number(),
  }),
  outputSchema: z.object({
    done: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    await supabase.from('agent_activity').insert({
      agent_name: 'recorder',
      action: `Recorder workflow complete. Interaction ${inputData.interactionId} created. ${inputData.proposedTaskCount} tasks proposed. Awaiting director review via Simon.`,
      status: 'auto',
      entity_type: 'interaction',
      entity_id: inputData.interactionId,
    } as never);

    return { done: true };
  },
});

// ─── Assemble workflow ───────────────────────────────────────────────────────
export const recorderWorkflow = createWorkflow({
  id: 'recorder',
  inputSchema: z.object({
    source: z.enum(['telnyx', 'zoom', 'signal', 'manual']),
    recordingUrl: z.string(),
    callControlId: z.string().optional(),
    meetingUuid: z.string().optional(),
    channels: z.enum(['dual', 'single']),
  }),
})
  .then(ingestAudio)
  .then(transcribeAudio)
  .then(identifySpeakers)
  .then(extractEntities)
  .then(crmMatch)
  .then(createInteraction)
  .then(proposeCrmUpdates)
  .then(proposeTasks)
  .then(proposeReminders)
  .then(reportToSimon)
  .commit();
