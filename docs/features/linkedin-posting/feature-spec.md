# Feature Spec — LinkedIn Scheduling & Posting

**Branch:** `claude/linkedin-scheduling-posting-plan-0iuzew`
**Status:** Phases 1–2 built and tested; awaiting Phase 0 LinkedIn app setup to connect real accounts. See [Progress / Status](#progress--status).

## Overview

BTS publishes social content to LinkedIn directly from the platform: schedule and post via the LinkedIn API across three configurable accounts — Chris's profile, Carri's profile, and the BTS company page.

The drafting side already exists: the `social_post_from_news` routine has Charlie draft per-account posts daily with Lex compliance checks into `content_items`, and the `/content` Kanban already has a `scheduled` column and a `content_items.scheduled_for` timestamp. But "publishing" today is a human copy-pasting into LinkedIn and recording the URL (`markVariantPosted`). This feature adds the three missing pieces:

1. **OAuth account connection + token storage** (net-new — no OAuth exists anywhere in the repo)
2. **A real LinkedIn publishing client** in `apps/agents`
3. **A scheduler that acts on `scheduled_for`** (LinkedIn's API has no native scheduling)

Plus, per review feedback: **manual editing of drafts before publishing** (the current `ContentEditor` textarea never persists edits) and **LinkedIn formatting correctness** (preview, length guards, API-time escaping).

## LinkedIn API constraints (verified July 2026)

- **Posting**: versioned Posts API — `POST https://api.linkedin.com/rest/posts` with a `Linkedin-Version: YYYYMM` header. Author is a URN: `urn:li:person:{id}` (member) or `urn:li:organization:{id}` (company page). Member id comes from `GET /v2/userinfo` (`sub` claim) via the `openid profile` scopes.
- **No native scheduling** — every API post publishes immediately. We run our own scheduler.
- **OAuth 2.0, 3-legged.** `w_member_social` (personal posts) is self-serve ("Share on LinkedIn" product). `w_organization_social` (company page) requires the **Community Management API product with a LinkedIn review (~2–4 weeks)** — an external dependency; founders go live first.
- **Tokens last 60 days; no refresh tokens** for standard apps (partner-only). Design needs expiry tracking, reconnect warnings, and one-click re-auth.
- LinkedIn has no threads — `thread_segments` stay X-only. Images are a later phase (upload via `/rest/images`, then reference the URN).

## Scope

### In scope

- OAuth connect/reconnect/disconnect for the three LinkedIn accounts, from `/settings/integrations/linkedin`
- Token storage keyed to the existing `social_accounts` rows
- Scheduling UX on `/content` (datetime picker + Post now), publish executor with double-post protection
- Manual body/title editing with persistence, compliance re-review on edit
- Formatting correctness: char-count preview with "see more" fold marker, server-side length guards, Little Text Format escaping
- Human-approval gating (public content never auto-graduates, per CLAUDE.md)

### Out of scope (later)

- Image/video posts
- X/Twitter publishing
- Company-account auto-drafting in `social_post_from_news`
- A Simon `schedule_social_post` tool (schedule via Signal chat)
- Post metrics ingestion

## Data Model

One migration: `supabase/migrations/2026XXXXXXXXXX_add_social_credentials.sql` (idempotent, per `packages/db/MIGRATIONS.md`; also update `schema.sql`, `docs/schema-changes.md`, regenerate types via `pnpm db:generate-types`).

### `social_credentials` (new)

Separate from `social_accounts` so token columns are never selected by existing UI queries; extensible to X later.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `social_account_id` | UUID NOT NULL UNIQUE → `social_accounts(id)` ON DELETE CASCADE | one credential per account |
| `provider` | TEXT NOT NULL DEFAULT 'linkedin' CHECK IN ('linkedin') | |
| `access_token` | TEXT NOT NULL | plaintext, matching `fastmail_accounts.token` precedent (RLS-protected, never returned to the browser) |
| `author_urn` | TEXT NOT NULL | `urn:li:person:…` or `urn:li:organization:…` |
| `scopes` | TEXT[] | |
| `expires_at` | TIMESTAMPTZ NOT NULL | 60-day LinkedIn token lifetime |
| `connected_by` | UUID → `team_members(id)` | |
| `last_error`, `last_error_at`, `consecutive_failures` | TEXT / TIMESTAMPTZ / INT DEFAULT 0 | mirrors Fastmail error tracking |
| `created_at` / `updated_at` | TIMESTAMPTZ | + `update_updated_at()` trigger |

RLS policy identical to `fastmail_accounts_all`.

### `content_items` additions

- `publish_error TEXT`
- `publish_attempts INT NOT NULL DEFAULT 0`
- `publish_locked_at TIMESTAMPTZ` — atomic claim marker against double-posting

### `oauth_states` (new)

`state TEXT PK, social_account_id UUID, created_at TIMESTAMPTZ` — short-lived CSRF state persisted server-side so the callback can validate and map to the right account across Vercel invocations.

`social_accounts.api_credentials_ref` stays untouched (pre-existing placeholder).

## OAuth connect flow (apps/web)

Env vars (Vercel): `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (client secret lives only in apps/web).

- `apps/web/app/api/integrations/linkedin/start/route.ts` — GET `?accountId=<social_accounts.id>`, auth-gated. Generates random `state`, inserts `oauth_states`, 302-redirects to `https://www.linkedin.com/oauth/v2/authorization` with scopes `openid profile w_member_social` (+ `w_organization_social` for `account_type='company'`, Phase 3).
- `apps/web/app/api/integrations/linkedin/callback/route.ts` — validates + deletes the state row, exchanges the code at `/oauth/v2/accessToken`, fetches `/v2/userinfo` → `urn:li:person:{sub}`; for a company account (Phase 3) queries `organizationAcls?q=roleAssignee` for the admin'd org URN. Upserts `social_credentials` (keyed on `social_account_id`), sets `expires_at`, resets failure counters, redirects to `/settings/integrations/linkedin?connected=1` (or `?error=…`).
- `apps/web/lib/linkedin/oauth.ts` — pure helpers (authorize-URL builder, token exchange, userinfo fetch) + co-located test.

Re-auth = the same Connect button; the upsert overwrites the expired token.

## Publish executor (apps/agents)

### LinkedIn client — `apps/agents/src/lib/linkedin.ts`

- `createLinkedInPost({ accessToken, authorUrn, text }): Promise<{ postUrn }>` → `POST https://api.linkedin.com/rest/posts` with `Linkedin-Version` (module const) and `X-Restli-Protocol-Version: 2.0.0`. Post URL derives as `https://www.linkedin.com/feed/update/{postUrn}`.
- `escapeLinkedInText(text)` — the `commentary` field uses Little Text Format; the characters `` \ | { } @ [ ] ( ) < > # * _ ~ `` are reserved and must be backslash-escaped or the API mangles/rejects the text. Applied to every post body.
- Typed auth error (like `JmapAuthError`) so 401s are distinguishable from transient failures. pino logger (`createLogger('linkedin')`).

### Poller — `apps/agents/src/listeners/socialPublishListener.ts`

Started from `apps/agents/src/mastra/index.ts` alongside the other `start*Listener()` calls; mirrors `fastmailListener` (immediate run + `setInterval`, 60s). A routine `action_type` was considered and rejected: `routines.frequency` only supports daily/weekly/fortnightly, and this is infrastructure, not a user-configured routine.

Each tick:

1. Select due items: `status='scheduled' AND scheduled_for <= now() AND type='linkedin' AND publish_locked_at IS NULL`, joined to active `social_accounts` + `social_credentials`.
2. **Guards** (public content is ALWAYS human-approved): require `approved_by IS NOT NULL` and `compliance_status IN ('cleared','overridden')`; skip `is_thread` rows (X-only) and rows without a connected credential — record a human-readable `publish_error` rather than silently skipping. Re-check length against `platform_specs.max_chars` before calling the API.
3. **Atomic claim** (double-post is the worst failure mode): `UPDATE content_items SET publish_locked_at = now() WHERE id = $id AND publish_locked_at IS NULL AND status='scheduled'`; proceed only if exactly one row updated.
4. Success → `status='published'`, `published_at`, `published_url`, clear `publish_error`; insert an `agent_activity` audit row (`action_type: 'social_published'`, `status: 'auto'`).
5. Failure → clear `publish_locked_at`, increment `publish_attempts`, set `publish_error`; retry on later ticks up to 3 attempts, then hold in `scheduled` with the error surfaced on the card. 401s also increment `social_credentials.consecutive_failures` with Fastmail-style auto-disable at 3.

**Expiry warnings**: a daily check in the poller writes an `agent_activity` notice when a credential is <14 days from `expires_at`; the settings page shows a live "expires in N days / reconnect" badge.

## Web UI

### Settings — `apps/web/app/(app)/settings/integrations/linkedin/`

Server `page.tsx` + `LinkedInSettingsClient.tsx` + module CSS (invoke the `bts-design` skill during implementation). Lists the LinkedIn `social_accounts` rows with connection status from `social_credentials` (never selecting `access_token`): Connect / Reconnect (links to the start route), expiry badge, last-error display, Disconnect via `apps/web/app/actions/socialCredentials.ts`. Add a dynamic LinkedIn card to `settings/integrations/page.tsx` following the Fastmail card pattern. Seed/verify the three `social_accounts` rows (Chris `founder`, Carri `founder`, BTS `company`, all `platform='linkedin'`).

### Manual editing before publish

`ContentEditor` (`apps/web/components/content/ContentEditor.tsx`) already renders an editable textarea but never persists — it only imports `updateContentStatus`. Add:

- `updateContentBody(id, { title, body })` server action in `apps/web/app/actions/content.ts` + a Save button. Allowed for `draft/review/approved/scheduled`; blocked once `published` or while `publish_locked_at` is set.
- Editing a compliance-cleared item resets `compliance_status='pending'` and clears `compliance_checked_at`, feeding the existing Lex recheck listener (`apps/agents/src/listeners/complianceRecheck.ts`). That listener currently early-returns for rows without a `campaign_id` — relax the guard to also recheck rows with a `social_account_id`. The publish guard then automatically holds an edited scheduled post until Lex re-clears it.
- The poller reads `body` at publish time, so pre-fire edits are always what gets posted.

### LinkedIn formatting correctness

1. **Author-time preview** in `ContentEditor` for `type='linkedin'`: live char count against `platform_specs.max_chars` (over-limit highlighted); a "…see more" fold marker at ~210 characters; a warning when the body contains markdown syntax (`**`, `##`, `[text](url)`) — LinkedIn renders plain text only (line breaks preserved, markdown not).
2. **Server-side guard**: `scheduleContent`/`postContentNow` reject bodies exceeding `platform_specs.max_chars`.
3. **API-time escaping**: `escapeLinkedInText` (above), with unit tests asserting literal round-trips (e.g. `(AUD)`, `#Bitcoin`).

### Scheduling UX

Schedule panel in the content detail page for `type='linkedin'`: datetime picker (default timezone Australia/Melbourne) writing `scheduled_for` + `status='scheduled'`, and a **Post now** button (`scheduled_for = now()` + `status='scheduled'`, picked up within a minute — the settled DB-write web→agents handoff; the web app never calls Railway over HTTP). New server actions `scheduleContent(id, when)` and `postContentNow(id)` in `apps/web/app/actions/content.ts` — both enforce `status='approved'` + `approved_by` + a connected account, following the `getAuthedClient`/`humanizeError`/`revalidatePath` shape. Kanban: dragging a LinkedIn card into `scheduled` without a time is blocked with a prompt to use the detail page. `publish_error` is shown on cards/detail when set.

## Phasing

- **Phase 0 (external, founder action — start immediately)**: create the LinkedIn developer app, add "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" products, register the callback URL, associate/verify the app with the BTS company page, and **apply for the Community Management API now** (2–4 week review).
- **Phase 1**: migration + OAuth connect flow + settings UI → Chris & Carri connected.
- **Phase 2**: publish executor + scheduling/editing UX on `/content` → live posting for founders.
- **Phase 3**: company page (same code path; adds `w_organization_social` scope + org URN selection) once LinkedIn approves.

## Verification

- `pnpm --filter @platform/agents test` + `typecheck`, `pnpm --filter @platform/web test`. New co-located tests: OAuth helpers (mocked fetch), poller claim/guard/retry + auth-failure auto-disable (via `test/mocks/supabase.ts` + `test/factories.ts`), server-action gating (approved-only scheduling, over-limit rejection, edit-locked-when-published), `escapeLinkedInText` cases, ContentEditor save + char-count/fold-preview rendering.
- Manual end-to-end (needs the real LinkedIn app): connect Chris's account → approve a draft → Post now → post appears on LinkedIn, card shows `published` with a working `published_url`; then a scheduled post 5 minutes out; then confirm an unapproved item cannot be scheduled.
- Failure drills: revoke the token on LinkedIn → next attempt surfaces `publish_error`, increments failures, settings page shows reconnect.

## Open Questions

Answers not needed to start Phase 1 code, but needed before go-live.

1. **LinkedIn developer app**: does one already exist? Who creates it? It must be associated with (and verified by) the BTS company page — requires a page admin.
2. **Page admin roles**: does Chris or Carri hold the ADMINISTRATOR role on the BTS LinkedIn page? Required for app verification and later for the company-page token.
3. **Community Management API application**: OK to apply immediately (2–4 week review)? Someone needs to fill in the use-case form on the LinkedIn developer portal.
4. **Token storage**: plaintext in Supabase behind RLS (matches the Fastmail precedent, two-person team) — acceptable, or encrypted storage (e.g. Supabase Vault) now? Spec assumes plaintext.
5. **Carri's consent flow**: each person authorizes their own profile by clicking Connect while logged into their LinkedIn account — fine for Carri to do this herself from the settings page?
6. **Scheduling granularity**: poller runs every 60s, so posts land within ~1 minute of the scheduled time — acceptable?
7. **Kanban drag-to-scheduled**: block without a time (planned) or default to e.g. next 9:00 AEST?
8. **Failure notifications**: on publish failure / token expiring, is the settings badge + card error enough, or should Simon also send a Signal message?
9. **Company-page drafting**: the daily `social_post_from_news` routine drafts only for founder accounts. Extend it to also draft for the company page (separate follow-up), or keep company posts manual/campaign-driven?
10. **Approval loosening**: posting is gated on human approval + compliance clearance (per CLAUDE.md this never graduates for public content) — confirm no autonomous posting is ever wanted, even for pre-approved evergreen content.

## Progress / Status

Update this section as each phase lands.

- [ ] **Phase 0 — LinkedIn app setup** (founder action, blocks go-live): developer app created, "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" products added, callback URL `<app-origin>/api/integrations/linkedin/callback` registered, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` set in Vercel, app associated with the BTS page, Community Management API application submitted
- [x] **Phase 1 — Accounts & OAuth** (code complete): migration `20260725000000_add_social_credentials.sql` (`social_credentials`, `oauth_states`, `content_items` publish cols) + `schema.sql` + changelog + types; `lib/linkedin/oauth.ts` (+ test); `app/api/integrations/linkedin/{start,callback}/route.ts`; `settings/integrations/linkedin/` page + client + dynamic integrations card; `actions/socialCredentials.ts`
  - Still needs Phase 0 before Chris & Carri can actually connect; the three `social_accounts` rows must exist (`platform='linkedin'`)
- [x] **Phase 2 — Publish & schedule** (code complete): `apps/agents/src/lib/linkedin.ts` client + `escapeLinkedInText` (+ test); `socialPublishListener` poller registered in `mastra/index.ts` (+ test); `updateContentBody`/`scheduleContent`/`postContentNow` (+ test); `ContentEditor` save, char-count vs `platform_specs`, fold preview, markdown warning, schedule panel, Post now (+ tests); `complianceRecheck` guard relaxed to account-linked drafts (+ test); `ContentBoard` publish-error surfacing + drag-to-scheduled block (+ tests)
- [ ] **Phase 3 — Company page**: `w_organization_social` scope + `fetchOrganizationUrn` are already wired in the callback; needs LinkedIn approval, then connect the BTS page and verify a post
- [ ] **Post-launch**: migration applied on merge to `main`; end-to-end connect → approve → Post now verified against the real API; expiry-warning flow observed; open questions above resolved and recorded here

### Verification run (2026-07-25)

- `pnpm --filter @platform/agents test` — 949 tests / 116 files pass
- `pnpm --filter @platform/agents typecheck` — clean
- `pnpm --filter @platform/web test` — 426 tests / 62 files pass
- Not yet run: end-to-end against the live LinkedIn API (blocked on Phase 0)
