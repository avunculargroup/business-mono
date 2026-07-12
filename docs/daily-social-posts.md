# Daily Social Posts — Workflow README

**Feature:** `social_post_from_news` — one daily, per-founder routine that turns the day's news into ready-to-review LinkedIn + X drafts.
**Status:** Implemented and live.
**Handler:** `apps/agents/src/workflows/socialPost/`

-----

## What this is (and what it is not)

Every morning, for each founder, the platform picks the single news story that best fits that founder's voice, drafts a LinkedIn post and an X post **in their voice**, runs each draft past compliance, saves both as drafts in the content pipeline, and emails the founder to review.

This is the **daily, news-driven** path. It is deliberately lightweight: one story, two posts, one founder, no strategy layer.

It is **not** the campaign system. Campaigns (`docs/social-campaigns-spec.md`, `docs/social-campaign-workflows-flow.md`) are the strategic layer — multi-week themes, ordered beats, Margot's strategy, three approval gates, fan-out to many accounts. The daily routine **reuses the campaign building blocks** (voice resolution, Charlie's and Lex's prompts, platform specs, thread segments, the shared `content_items` / `thread_segments` tables) but is driven by a *news story + an editor-chosen form* instead of a campaign beat, and it writes posts with `campaign_id = NULL` and `beat_id = NULL`.

| | Daily social posts (this doc) | Campaigns |
|---|---|---|
| Trigger | Daily routine, 09:00 AEST | On-demand / conversational |
| Idea source | A news story from `news_items` | A campaign beat Margot plans |
| Strategist | The internal `editor` agent picks story + form | Margot synthesises a full strategy |
| Approval | Async — email the founder, review in web UI | Three suspend/resume gates |
| Reach | One founder's own accounts | Many accounts fanned out |
| DB link | `campaign_id` / `beat_id` are `NULL` | Linked to campaign + beat |

-----

## Where it sits in the morning

The routine runs at **09:00 `Australia/Melbourne`**, deliberately after the morning news pipeline so the candidate pool is fresh:

```
06:30  news_source_scan   ─┐
07:00  news_ingest         ├─ populate & score news_items
08:00  news_curation      ─┘
09:00  social_post_from_news   ← this routine (one run per founder)
```

By 09:00 the day's `news_items` are fetched, deduped, and scored (Rex's relevance rubric), so the editor is choosing from a curated pool rather than raw feeds.

-----

## How a founder gets a routine

Routines live in the `routines` table and are executed by Mastra's native scheduler via `executeRoutineWorkflow` (`apps/agents/src/workflows/executeRoutineWorkflow.ts`). The dispatch is a simple branch on `action_type`:

```ts
} else if (routine.action_type === 'social_post_from_news') {
  outcomes.push(await runSocialPost(routine));
}
```

The seed migration `supabase/migrations/20260626000000_add_social_post_routine.sql` creates **one daily routine per founder** — a founder being any `team_member` who owns an active `social_accounts` row with `account_type = 'founder'`. The insert is idempotent: it is keyed on `action_type` + the `founder_team_member_id` inside `action_config`, so re-running the migration never duplicates, and **adding a third founder later re-seeds only the newcomer**.

### `action_config` shape

Defined by `SocialPostFromNewsConfig` in `packages/shared/src/routines.ts`:

```jsonc
{
  "founder_team_member_id": "<uuid>",        // whose founder accounts to post for (required)
  "platforms": ["linkedin", "twitter_x"],    // which platforms to draft (default: both)
  "lookback_hours": 24                        // only consider news fetched this recently (default: 24)
}
```

-----

## The pipeline, step by step

All logic lives in `runSocialPost()` (`apps/agents/src/workflows/socialPost/index.ts`). It is a plain async handler, not a suspend/resume Mastra workflow — there are no in-flight human gates; the review happens later, asynchronously, in the web UI.

### 1. Resolve the founder and their accounts

- Look up the `team_member` by `founder_team_member_id` (fail early if missing).
- Load their **active founder `social_accounts`** for the requested platforms. A founder on X and the same founder on LinkedIn are **separate account rows** — same person, different voice and format.
- If they have no active founder account on any requested platform, the run fails with a clear message.

### 2. Load platform specs and disclaimers

- `platform_specs` — per-platform mechanics: `max_chars`, `max_thread_segments`, `hashtag_guidance`. Editable config, so a platform changing its limits is a row edit, not a code change.
- `compliance_snippets` where `is_active` — the keyed, reusable disclaimers Lex can attach.

### 3. Gather candidate stories

Query `news_items`:

- `fetched_at >= now − lookback_hours`
- `status != 'archived'`
- ordered by `relevance_score` desc, then `published_at` desc
- capped at **30 candidates**.

**If there are no fresh stories, the run succeeds as a no-op** ("No fresh news in the last 24h…") rather than failing — a quiet news day is not an error.

### 4. Editor picks the story + form

The internal **`editor`** agent (from `apps/agents/src/agents/editorial/` — the same agent the newsletter workflow uses; **not** on Simon's roster, **not** in the `agent_activity.agent_name` CHECK) is given the candidate list and the founder's **resolved voice** as the fit signal. It returns:

- `story_index` — which candidate (verbatim index),
- `form` — one of:
  - **`share_with_context`** — share the story with the founder's perspective and what it means for Australian businesses. Best when the news itself is the point.
  - **`teach`** — use the story as a hook to teach the underlying concept a sceptical CFO needs to understand. Best when the story surfaces a principle worth explaining.
- `rationale` — one line, for the audit trail.

Voice for the pick is resolved from the founder's **LinkedIn** account (or the first available) via `resolveVoiceContext` from `@platform/voice`. If the editor call fails or returns an out-of-range pick, `resolveSelection` **falls back to the top-ranked story with `share_with_context`** — the run never dies on a bad pick (see `select.ts`).

### 5. Draft each platform: Charlie → Lex → persist

For **each** of the founder's accounts (LinkedIn and/or X):

1. **Resolve voice for this account/platform**, seeded with the story as the semantic query so the retrieved voice exemplars are topically relevant. Extract the account's `format_config` (e.g. thread style).
2. **Charlie drafts the copy** (`generate_copy` step, agent `charlie`). The prompt (`buildSocialPostPrompt`) carries the story, the chosen form, the platform's format rules, and the resolved voice block — the voice is authoritative for style; the platform's hard limits (char ceiling) still stand. Charlie returns a structured `CharlieVariant`:
   - **LinkedIn** is always a single post.
   - **X** may be a single post **or a thread** — Charlie decides (teaching posts often suit a short thread), unless the account's `format_config` forces single-only. Thread segments go in `segments`; Charlie does not number them (`applyThreadStyle` handles styling).
   - Generation uses structured output with a **fallback value**, so a model hiccup yields a safe empty draft rather than throwing.
3. **Lex classifies advice risk** (`compliance_check` step, agent `lex`). Returns a `LexVerdict`: `classification` (`educational` / `general_advice` / `personal_opinion`), `needs_disclaimer`, the `disclaimer_key` to attach, and a `rationale`. **Lex is advisory — she never blocks.** If the compliance call is unavailable, the fail-safe default is `general_advice` **with** a disclaimer.
4. **Persist** (`persist.ts`):
   - Insert a `content_items` row: `status = 'draft'`, `source = 'charlie'`, `type = <platform>`, `social_account_id = <account>`, `campaign_id = NULL`, `beat_id = NULL`, `is_thread`, `char_count` (single posts only), and the full compliance block (`compliance_status`, `compliance_classification`, `needs_disclaimer`, `disclaimer_snippet_id`, `compliance_rationale`, `compliance_checked_at`).
   - If threaded, insert ordered `thread_segments` rows (1-based `sequence`, per-segment `char_count`).
   - Log **two `agent_activity` rows** (`status = 'pending'`, `trigger_type = 'scheduled'`): one for `charlie` (`social_post_drafted`) and one for `lex` (`compliance_checked`), each carrying `proposed_actions` — this is the audit trail.

A failure drafting one platform is caught and logged; the other platform still proceeds. Only if **every** platform fails does the run fail.

### 6. Email the founder

Best-effort (`sendSocialDraft` → `socialDraftEmail.ts`). The founder gets a platform-mimic email showing each draft, its compliance chip, and — when `WEB_APP_URL` is set — a **Review** link per draft into the web app.

- Recipient is resolved from the founder's **account email** (`team_members.id === auth.users.id`).
- Delivery reuses the **news-digest sender plumbing**: the `avuncular@fastmail.com` login's stored Fastmail token (no separate secret), sending as the `hq@btreasury.com.au` identity. It does **not** create `interactions` and is independent of the CRM/newsletter inbound polls.
- Emailing is best-effort: any failure is logged to `agent_activity` and returns `false`; **it can never sink the routine**. The drafts are already saved regardless.

### 7. Result

The routine returns a `RoutineOutcome` whose `metadata` (`SocialPostFromNewsResult`) records the founder, the chosen `story_id` / `story_url`, the `form`, the drafted `posts` (content-item ids + platform + thread flag), and whether the email sent — persisted to `routines.last_result` for the dashboard and audit.

-----

## Review and publish (the human half)

The drafts land in the normal **content pipeline**, so they appear at **`/content`** in the web app alongside everything else. Because they are `status = 'draft'` written by `charlie`, they follow the existing `idea → draft → review → approved → scheduled → published → archived` state machine.

Approval philosophy applies as everywhere else: **public content is always human-approved — no graduation to autonomous.** A founder opens a draft, edits it, sees Lex's compliance chip and any auto-attached disclaimer, and approves. The **copy-out view** at `/content/[id]/copy` gives frictionless copy for manual posting (segment-by-segment for X threads), after which the founder marks it posted with the live URL. Phase-1 posting is manual; automated dispatch is a campaign-system Phase-2 concern.

> Note: editing a draft that Lex already cleared should re-run compliance — a clear verdict does not survive an edit. That re-run is an application-layer responsibility in the content pipeline, not part of this routine.

-----

## Agents involved

| Agent | Role here | Notes |
|-------|-----------|-------|
| `editor` (editorial) | Picks the story + form that fit the founder | Internal-only — not on Simon's roster, not in the `agent_activity` CHECK |
| `charlie` (Content Creator) | Writes the per-platform copy in the founder's voice | The routine's nominal `agent_name`; logs `social_post_drafted` |
| `lex` (Compliance) | Classifies advice risk, decides on a disclaimer | Advisory only — never blocks; fail-safe defaults to `general_advice` + disclaimer |

Simon is **not** in the loop — this is a scheduled routine, not a Signal-dispatched directive.

Each LLM step is model-configurable via `/settings/models` under the scopes `social_post.editor_select`, `social_post.generate_copy`, and `social_post.compliance_check` (registered in `packages/shared/src/modelScopes.ts`, wired with `stepRequestContext(...)`).

-----

## Data touched

**Reads:** `team_members`, `social_accounts`, `platform_specs`, `compliance_snippets`, `news_items`, plus voice tables via `@platform/voice`, plus `auth.users` (recipient email) and `company_profile` (email footer).

**Writes:** `content_items` (drafts), `thread_segments` (threads only), `agent_activity` (audit), `routines.last_result` (run summary). Sends one email via Fastmail JMAP.

Note: the campaign `content_items` columns (`social_account_id`, `is_thread`, compliance fields, etc.) are not yet in the generated `Database` types, so the handler casts the Supabase client to `any` for those inserts — the same pattern the campaign variant workflow uses.

-----

## Failure modes (and why the routine stays up)

| Situation | Behaviour |
|-----------|-----------|
| No `founder_team_member_id` in config | Run **fails** with a clear message |
| Founder / accounts not found | Run **fails** with a clear message |
| No fresh news in the lookback window | Run **succeeds** as a no-op |
| Editor selection errors or returns a bad index | **Falls back** to top-ranked story + `share_with_context` |
| Charlie generation errors | Structured-output **fallback** draft; that platform may be skipped |
| Lex compliance errors | Fail-safe verdict: `general_advice` **with** a disclaimer |
| One platform's draft throws | Caught and logged; the other platform still runs |
| **Every** platform fails | Run **fails** |
| Email delivery fails | Logged; run still **succeeds** — drafts are already saved |

-----

## Key files

| File | Purpose |
|------|---------|
| `apps/agents/src/workflows/socialPost/index.ts` | `runSocialPost` — the orchestration |
| `apps/agents/src/workflows/socialPost/select.ts` | Candidate mapping + editor-pick resolution (pure) |
| `apps/agents/src/workflows/socialPost/prompts.ts` | Editor-selection + Charlie generation prompts (pure) |
| `apps/agents/src/workflows/socialPost/persist.ts` | `content_items` / `thread_segments` row builders (pure) |
| `apps/agents/src/lib/sendSocialDraft.ts` | Emails one founder their drafts (best-effort) |
| `apps/agents/src/lib/socialDraftEmail.ts` | Branded platform-mimic draft email HTML |
| `apps/agents/src/workflows/executeRoutineWorkflow.ts` | Scheduler dispatch (`social_post_from_news` branch) |
| `supabase/migrations/20260626000000_add_social_post_routine.sql` | `action_type` extension + per-founder seed |
| `packages/shared/src/routines.ts` | `SocialPostFromNewsConfig` / `SocialPostFromNewsResult` types |
| `packages/shared/src/modelScopes.ts` | Model-config scopes for the three LLM steps |
| `apps/agents/src/workflows/variant/prompts.ts`, `variant/persist.ts`, `variant/schemas.ts` | Shared campaign building blocks reused here |

Tests: `index.test.ts`, `prompts.test.ts`, `persist.test.ts` alongside the handler.

-----

## Changing things

- **Add a founder to the daily posts:** give the `team_member` an active `social_accounts` row with `account_type = 'founder'`, then re-run the seed migration (idempotent — it only adds the missing routine).
- **Change a founder's platforms / lookback / cadence:** edit that founder's `routines` row (`action_config`, `time_of_day`, `frequency`).
- **Change the story pool or ranking:** it flows from the upstream news pipeline (`news_items` + Rex's relevance rubric) — tune there, not here.
- **Change post style / voice:** voice lives in the voice tables per account (via `@platform/voice`), not in this code. Platform mechanics live in `platform_specs` rows. Brand voice canon is `docs/brand-voice.md`.
- **Change which model writes/selects/checks:** `/settings/models`, scopes `social_post.*`.
