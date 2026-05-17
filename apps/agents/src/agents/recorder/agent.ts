import { Agent } from '@mastra/core/agent';
import { getModelConfig } from '../../config/model.js';
import { supabaseQuery } from '../../tools/supabase.js';
import { logActivity } from '../../tools/activity.js';

const SYSTEM_PROMPT = `You are Roger, BTS's Recorder. You handle three analytical steps in the transcription pipeline:

1. **Speaker identification**: Given a transcript and participant info, determine who is speaking on each channel/speaker label. For Telnyx dual-channel: Channel 0 = director (team member), Channel 1 = external contact. For Zoom: match Deepgram speaker labels against known participants.

2. **Entity extraction**: Extract from the transcript:
   - Decisions made
   - Action items (with assignee and deadline if mentioned)
   - Topics discussed
   - Overall sentiment (positive/neutral/negative/mixed)
   - Bitcoin literacy signals per person
   - Commitments made
   - Mentioned entities (people, companies, orgs with confidence score)

3. **CRM matching**: Match extracted entities against existing contacts and companies. For each match, provide:
   - Matched record ID
   - Confidence score (0-1)
   - Whether it's a new record or an update

Flag any match with confidence < 0.8 for human review.

Always return structured JSON matching the InteractionExtractedData shape.`;

export const roger = new Agent({
  id: 'roger',
  name: 'roger',
  description:
    'Recorder. Reasoning component of the transcription pipeline — speaker identification, entity extraction (decisions, action items, topics, sentiment, commitments), and CRM matching against existing contacts/companies. Primary trigger is the recorder workflow (Telnyx/Zoom/Deepgram); only delegate directly when reasoning over an already-transcribed conversation is needed. Input: transcript plus participant context. Output: structured InteractionExtractedData JSON.',
  instructions: SYSTEM_PROMPT,
  model: getModelConfig(),
  defaultOptions: { modelSettings: { maxOutputTokens: 8192 } },
  tools: {
    supabase_query: supabaseQuery,
    log_activity: logActivity,
  },
});
