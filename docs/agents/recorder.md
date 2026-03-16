# The Recorder — Transcribe & Act

**Mastra type**: Workflow + Agent (hybrid)
**Model**: `anthropic/claude-sonnet-4-5` (for agent steps)

## Purpose

Processes audio/video recordings from phone calls (Telnyx) and video calls (Zoom), producing structured transcripts, CRM updates, and task proposals. Phone calls recorded via Telnyx Voice API with dual-channel audio. All transcription via Deepgram Nova-3.

## Triggers

- **Telnyx webhook** (`call.recording.saved`): Phone call ended, recording available. Dual-channel MP3/WAV download URL + call metadata (caller, callee, duration).
- **Zoom webhook** (recording-ready): Video call recording available for download.
- **Signal file upload**: Director shares audio file via Simon.
- **Manual**: Web interface upload.

## Workflow Steps

Steps marked `[Agent]` use LLM reasoning. All others are deterministic.

1. **Ingest**: Accept audio from Telnyx (download from recording URL), Zoom (download from webhook URL), or manual upload. For Telnyx: extract caller/callee phone numbers from webhook payload.

2. **Transcribe**: Send audio to Deepgram Nova-3 with callback URL (`/webhooks/deepgram`). For Telnyx dual-channel recordings: set `multichannel=true` so each speaker is transcribed on their own channel. Deepgram responds with `request_id`. **Workflow suspends**. Deepgram POSTs transcript to callback. Workflow resumes.

3. **Identify speakers** `[Agent]`: For Telnyx calls — channel A is always the director (known), channel B's phone number is matched against `contacts.phone` in CRM. For Zoom/manual — match Deepgram speaker labels to contacts using contextual clues. Flag uncertain matches for human confirmation.

4. **Extract entities** `[Agent]`: Parse transcript for companies, contacts, action items, decisions, commitments, deadlines, topics, sentiment, bitcoin literacy signals.

5. **CRM match** `[Agent]`: For each entity, query `companies` and `contacts`. Fuzzy match on name, score confidence. High confidence → auto. Low confidence → human review. **Workflow may suspend** for confirmation.

6. **Create interaction record**: Store in `interactions` table — `raw_content` (full transcript), `summary` (agent-generated), `extracted_data` (structured JSONB), `type`, `direction`, `occurred_at`, `participants`, `duration_seconds`.

7. **Propose CRM updates**: New companies/contacts → propose creation. Updated info (job title, sentiment, bitcoin literacy) → propose update.

8. **Propose tasks**: Extract action items, route to PM for project alignment.

9. **Propose reminders**: Specific follow-up dates mentioned → propose reminders.

10. **Report to Simon**: Summary back to Simon for director relay.

## extracted_data JSONB Shape

```typescript
{
  decisions: Array<{ text: string; context: string; timestamp?: string }>;
  action_items: Array<{ text: string; assignee?: string; deadline?: string; context: string }>;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  bitcoin_signals: Array<{ contact: string; current_level?: string; inferred_level?: string; evidence: string }>;
  commitments: Array<{ who: string; what: string; by_when?: string; context: string }>;
  mentioned_entities: Array<{ name: string; type: 'person' | 'company' | 'org'; confidence: number }>;
}
```

## Suspend/Resume Points

1. After sending audio to Deepgram — waiting for callback POST with transcript
2. At CRM match confirmation — waiting for human approval of low-confidence matches

## Tools

- `telnyx_download` — download recording MP3/WAV from Telnyx URL
- `deepgram_transcribe` — send audio to Deepgram with callback URL and multichannel flag
- `supabase_query` — read companies, contacts, team_members
- `supabase_insert` — create interaction records, propose CRM records
- `supabase_update` — update existing CRM records
- `notify_simon` — send results/status back to Simon
- `create_reminder` — create time-triggered reminders
- `log_activity` — write to agent_activity

## Schema Dependencies

**Reads**: `companies`, `contacts`, `team_members`
**Writes**: `interactions`, `agent_activity`
**Proposes writes to**: `companies`, `contacts` (via approval), `tasks` (via PM), `reminders`

## Voice Profiles (Phase 2 Exploration)

For Telnyx calls, speaker ID is largely solved via dual-channel + phone number matching. Voice profiles are primarily useful for Zoom and multi-party calls. Approach: extract audio embedding fingerprints from known contacts' speech segments across multiple calls, then compare on subsequent calls.
