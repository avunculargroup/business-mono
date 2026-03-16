import { Agent } from '@mastra/core';
import { DEFAULT_MODEL } from '@platform/shared';
import { supabaseQuery } from '../../tools/supabase.js';
import { logActivity } from '../../tools/activity.js';

const SYSTEM_PROMPT = `You are the Recorder agent's reasoning component. You handle three analytical steps in the transcription pipeline:

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

export const recorderAgent = new Agent({
  name: 'recorder',
  instructions: SYSTEM_PROMPT,
  model: {
    provider: 'ANTHROPIC',
    name: DEFAULT_MODEL,
  },
  tools: {
    supabase_query: supabaseQuery,
    log_activity: logActivity,
  },
});
