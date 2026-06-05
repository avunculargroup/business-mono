# Feature Spec — Brand Voice Migration

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Migrate company brand voice from `docs/brand-voice.md` into tables; introduce per-account voice
**Status:** Draft
**Last updated:** 2026-06-04

-----

## Overview

Voice currently lives in a markdown doc, `docs/brand-voice.md`, routed via `CLAUDE.md`. The Social Media Campaigns feature needs **per-account voice** — the company writes differently from each founder, and each founder writes differently on X than on LinkedIn — and founders need to edit their own voice **without a redeploy**. A version-controlled doc can’t do that.

So voice moves into tables. This is a small, focused migration done **before** the campaigns feature is built, so a change to canon isn’t smuggled inside a feature build.

The model is **umbrella + override**:

- `brand_voice` — a singleton row holding the company canon (what `brand-voice.md` is today). The thing every piece of BTS content answers to.
- `social_accounts.voice_profile` — the per-account *application* of that canon (defined in the campaigns spec). A founder’s account voice is the company voice, filtered through a specific human on a specific platform.

Margot and Charlie read the company `brand_voice` as the umbrella and the account `voice_profile` as the specific, resolving the two at generation time.

This migration is deliberately scoped to **just the voice move**. It does not touch the visual system — that already has its canonical home in the **BTS design skill** (a Claude Code skill, same pattern as the Mastra skill), which **supersedes** the legacy `DESIGN_BRIEF.md` markdown. The source-of-truth boundary in `CLAUDE.md` separates the visual system (the design skill) from content/tone (today `brand-voice.md`); this migration moves the content/tone side into the database and leaves the visual side alone. Note the asymmetry, because it’s deliberate: the visual canon lives in a **skill** (authoritative, version-current, agent-loaded at design time), whereas voice moves into **tables** (founder-editable in-app, no redeploy). Different homes because they have different editors — designers and agents work the visual system through the skill; founders edit their own voice through the app.

-----

## Scope

### In scope

- A `brand_voice` singleton table holding company voice canon
- A `voice_snippets` table — the embeddable exemplar library (phrases, openers, full posts) demonstrating each voice
- Schema alignment so `brand_voice` and `social_accounts.voice_profile` share a shape (write the editor/validation once, reuse)
- A one-time content migration: `brand-voice.md` → seed the `brand_voice` row
- Agent voice-resolution logic (umbrella + override)
- `CLAUDE.md` boundary-table update so voice queries route to the table, not the doc
- Retiring `docs/brand-voice.md` (kept in git history; removed from the active routing)
- A Brand Hub editing surface for the company voice (founder-editable, friendly form)

### Out of scope

- Per-account `voice_profile` table and editing — specified in `docs/features/social-campaigns-spec.md` (this migration only establishes the shared shape it inherits)
- The visual system — its canon is the **BTS design skill**, which supersedes `DESIGN_BRIEF.md`; untouched by this migration
- Semantic retrieval of voice *profiles* — the `brand_voice` / `voice_profile` structured fields are loaded as context, not embedded. (Voice *snippets*, by contrast, **are** embedded and retrieved — that’s the point of the `voice_snippets` table.)
- Versioned voice history beyond a single `version` string — defer until needed

-----

## User Stories

**As a founder, I need to:**

- Edit BTS’s company voice in the app, in a friendly form, and have agents pick it up immediately — no redeploy
- Trust that every agent writing content reads the same single source of voice truth
- Keep the company voice as the canon that my own account voice inherits from, rather than redefining tone from scratch per account

**As Margot / Charlie (content agents), I need to:**

- Read the company `brand_voice` as the baseline for any content
- Layer the relevant account `voice_profile` on top when writing for a specific account
- Resolve the two deterministically so output is consistently on-brand

-----

## Data Model

### `brand_voice`

Singleton. One row representing BTS’s company voice canon. Singleton is enforced at the application layer (same pattern as `company_profile`).

|Column                       |Type       |Notes                                                                          |
|-----------------------------|-----------|-------------------------------------------------------------------------------|
|`id`                         |UUID       |PK                                                                             |
|`profile`                    |JSONB      |The voice definition — shares the `voice_profile` shape (see below)            |
|`mission_summary`            |TEXT       |One-paragraph statement of what BTS sounds like and why                        |
|`bitcoin_capitalisation_rule`|TEXT       |Canonical reminder: `Bitcoin` = network/protocol, `bitcoin` = the currency/unit|
|`version`                    |TEXT       |Semver-style: `1.0`, `1.1`                                                     |
|`is_active`                  |BOOLEAN    |Default `true`                                                                 |
|`updated_by`                 |UUID       |FK → `team_members`                                                            |
|`created_at`                 |TIMESTAMPTZ|                                                                               |
|`updated_at`                 |TIMESTAMPTZ|Auto-updated                                                                   |

**`profile` shape** — identical to `social_accounts.voice_profile` so one editor and one validator serve both:

```json
{
  "persona": "A highly competent advisor who speaks plainly — the rigour of a private wealth manager, the polish of Stripe.",
  "tone_attributes": ["trustworthy", "approachable", "calm", "authoritative without being cold"],
  "vocabulary_do": ["treasury horizon", "balance sheet", "allocation", "custody"],
  "vocabulary_avoid": ["HODL", "to the moon", "rocket emojis", "diamond hands", "crypto-hype framing"],
  "signature_devices": ["explain jargon when used", "no exclamation marks", "let the point do the work"],
  "format_notes": "Plain, confident language. Never oversells, never shouts, never speculative."
}
```

> **Note:** the old `example_posts` array is gone. Exemplar phrases, openers, and full posts now live in the dedicated, embeddable `voice_snippets` table (below) — a flat JSONB array can’t be typed, tagged, filtered, or retrieved semantically by an agent, which is exactly what good exemplars need to be.

The `bitcoin_capitalisation_rule` is broken out as its own column rather than buried in `profile` because it’s a hard editorial rule enforced across *all* agent output, not a soft tone preference — agents should be able to read it directly without parsing the JSON.

**Why the shapes match:** The campaigns spec gives `social_accounts.voice_profile` this exact structure. Sharing it means the Brand Hub voice editor, the placeholder-validation, and the agent-injection logic are written once and reused — the same “write once, reuse” principle already applied to document templates in the Compliance and Contracts features.

-----

### `voice_snippets`

The exemplar library — phrases, openers, closers, and full posts that *demonstrate* a voice rather than describe it. This is the highest-leverage input to on-voice generation: concrete few-shot examples beat any number of tone adjectives. Embeddable so agents retrieve the snippets semantically closest to the beat they’re writing.

Same **umbrella + override** logic as voice profiles: a snippet with `social_account_id = NULL` is company-canon (serves every voice); a snippet scoped to an account is specific to it. At retrieval an agent pulls *both* the account’s own snippets and the company-canon snippets.

|Column                  |Type        |Notes                                                                              |
|------------------------|------------|-----------------------------------------------------------------------------------|
|`id`                    |UUID        |PK                                                                                 |
|`social_account_id`     |UUID        |FK → `social_accounts`. **NULL = company canon** (applies to all voices)           |
|`snippet_type`          |TEXT        |`phrase`, `opener`, `closer`, `transition`, `paragraph`, `full_post`, `cta`        |
|`body`                  |TEXT        |The snippet text                                                                   |
|`curator_note`          |TEXT        |**First-class** — *why* this demonstrates the voice. The differentiator.           |
|`platform`              |TEXT        |`linkedin`, `twitter_x`, or NULL for platform-agnostic                             |
|`topic_tags`            |TEXT[]      |e.g. `['custody', 'volatility']` — lets retrieval match the beat                   |
|`embedding`             |VECTOR(1536)|OpenAI `text-embedding-3-small`. Generated on save; regenerated when `body` changes|
|`is_starred`            |BOOLEAN     |Default `false`. Best-of-the-best — agents prefer/weight these                     |
|`source`                |TEXT        |`manual`, `promoted_from_post`, `agent`. Default `manual`                          |
|`source_content_item_id`|UUID        |FK → `content_items` ON DELETE SET NULL — set when promoted from a published post  |
|`created_by`            |UUID        |FK → `team_members`                                                                |
|`created_at`            |TIMESTAMPTZ |                                                                                   |
|`updated_at`            |TIMESTAMPTZ |Auto-updated                                                                       |

**`curator_note` is the whole point.** “We opened with the balance-sheet number because finance leaders trust specifics over adjectives” is what turns a stored post into a *teaching* example — for the agent’s prompt context and for a founder browsing the library later. This is the same curator-notes-as-first-class principle applied across RAG, file storage, and SOPs.

**Embedding generation:** Snippets are embedded on save (and re-embedded when `body` changes), via the same `text-embedding-3-small` path used elsewhere. Unlike the publish-wall rule for SOPs/content, there’s no draft/publish gate here — a snippet exists to be used the moment it’s saved, so it embeds immediately. The embedding indexes `body` (optionally `body` + `curator_note` concatenated — see Open Questions).

**Source provenance:** `promoted_from_post` with `source_content_item_id` closes the loop with the campaigns metrics — a high-performing published post becomes a permanent exemplar with one action, carrying a curator note explaining *why* it worked.

-----

## Agent Voice Resolution

When an agent writes content for a specific account, it resolves voice in this order:

1. **Load company canon** — the active `brand_voice` row. This is always the baseline.
1. **Load account override** — the target `social_accounts.voice_profile`.
1. **Merge** — the account profile takes precedence on any overlapping key; the company canon fills gaps. `vocabulary_avoid` is **unioned**, not overridden — a word the company bans stays banned even if an account profile doesn’t repeat it. The `bitcoin_capitalisation_rule` is **always** applied and never overridable.
1. **Retrieve exemplars** — pull top-N `voice_snippets` by embedding similarity to the beat’s `core_message`, filtered to `social_account_id = <account> OR social_account_id IS NULL` (the account’s own + company canon), platform-matched (`= <platform> OR NULL`), with `is_starred` snippets weighted up. These go into the prompt as few-shot examples — the single biggest lever on on-voice output.

For non-account content (a blog post, a newsletter) there is no account override — the company `brand_voice` plus company-canon (`NULL`-scoped) snippets are the voice.

This resolution lives in a small shared helper (suggested: `packages/voice`) so agents never hand-merge voice inline, mirroring the `packages/signal` and `packages/storage` pattern. The exemplar retrieval (step 4) lives here too — one call returns the merged profile *and* the relevant snippets, so an agent gets a complete voice context in a single hop.

-----

## Migration Steps

A one-time, ordered migration. Reversible up to the doc-retirement step.

1. **Create the tables.** Add `brand_voice` and `voice_snippets` to `schema.sql` with the columns above, `update_updated_at` triggers, RLS policies, and (for `voice_snippets`) the pgvector embedding index. Confirm the `vector` extension is enabled (it already is — pgvector is in the stack).
1. **Extract canon from the doc.** Read `docs/brand-voice.md` and map its content into the `profile` JSONB and `mission_summary`. The `bitcoin_capitalisation_rule` comes straight from the project’s existing “Bitcoin vs bitcoin” convention.
1. **Seed the singleton row.** Insert one `brand_voice` row, `version = '1.0'`, `is_active = true`.
1. **Migrate exemplars.** Any example posts in `docs/brand-voice.md` (and any `example_posts` arrays that existed in early `voice_profile` drafts) become `voice_snippets` rows: `social_account_id = NULL` (company canon), `snippet_type = 'full_post'`, with a `curator_note` written for each explaining what it demonstrates. Generate embeddings on insert.
1. **Add the resolution helper.** Create `packages/voice` with the umbrella + override merge **and** the snippet retrieval.
1. **Point agents at the helper.** Update Margot, Charlie, and any other content-writing agent to read voice via `packages/voice` instead of the doc.
1. **Update `CLAUDE.md`.** Change the source-of-truth boundary table: content/tone voice now lives in the `brand_voice` table, `social_accounts.voice_profile`, and `voice_snippets`, not `brand-voice.md`. The visual-system row should point at the **BTS design skill** rather than `DESIGN_BRIEF.md` (if it doesn’t already), so the markdown brief is clearly the superseded reference, not the canon.
1. **Build the Brand Hub editor.** Friendly form for the company voice, plus the snippets panel (see UI below).
1. **Retire the doc.** Remove `docs/brand-voice.md` from active routing. Keep it in git history. (Optionally leave a one-line stub pointing to the table, so anyone who opens the old path isn’t confused.)

**Verification before retiring the doc:** generate one piece of content per writing agent and confirm the table-sourced voice — profile *and* retrieved snippets — matches what the doc produced. Don’t delete the doc until output parity is confirmed.

-----

## UI — Brand Hub

Company voice editing lives in **Brand Hub**, its natural home. A **friendly form**, never raw JSON:

- **Persona** — a short free-text field
- **Tone attributes** — chip input (add/remove)
- **Vocabulary** — two lists, *use* and *avoid*, each chip-based
- **Signature devices** — chip or short-line list
- **Format notes** — free text
- **Snippets** — not a form field but a linked **snippets panel** for this voice (list/add/star exemplars from `voice_snippets`). The exemplar library replaces the old paste-in “example posts” field; see the Brand Hub UX flow for the panel and the promote-from-post loop.
- **Bitcoin capitalisation rule** — shown as a locked/always-on reminder, editable but with a note that it’s enforced across all output
- **Version** — auto-incremented or manually bumped on save

The same form component is reused for per-account `voice_profile` editing in the campaigns feature — the only difference is which row it writes to. Founders editing their own account voice get the identical, familiar surface.

-----

## RLS Policy

```sql
ALTER TABLE brand_voice ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_voice_all" ON brand_voice
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE voice_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_snippets_all" ON voice_snippets
  FOR ALL USING (auth.role() = 'authenticated');
```

## Indexes (voice_snippets)

```sql
CREATE INDEX idx_voice_snippets_account ON voice_snippets(social_account_id);
CREATE INDEX idx_voice_snippets_type    ON voice_snippets(snippet_type);
CREATE INDEX idx_voice_snippets_tags    ON voice_snippets USING GIN (topic_tags);
CREATE INDEX idx_voice_snippets_starred ON voice_snippets(is_starred) WHERE is_starred;

-- Vector similarity (HNSW recommended for read-heavy retrieval; verify against
-- the installed pgvector version's supported index types before applying)
CREATE INDEX idx_voice_snippets_embedding ON voice_snippets
  USING hnsw (embedding vector_cosine_ops);
```

-----

## Open Questions

- **Voice version history:** A single `version` string captures the current state but not what changed. If founders want to see “what did the voice say in March,” a `brand_voice_revisions` history table (snapshot-on-save) is the lightweight answer. Defer until the requirement is real.
- **Should the visual system follow voice into tables?** No — and the asymmetry is intentional. Voice moves to tables because *founders* edit it and need no-redeploy changes. The visual system’s canon is the **BTS design skill**, which is the right home precisely because the visual system is worked by designers and agents *at design/build time*, not edited live in-app by founders. The skill supersedes `DESIGN_BRIEF.md`; the markdown brief is legacy reference. Revisit only if a founder-facing visual-token editing surface is ever wanted — at which point tokens (not the whole brief) might move to a table, while the skill stays the canonical guidance.
- **Doc stub vs hard delete:** Whether to leave a one-line `brand-voice.md` stub pointing at the table, or remove it entirely. A stub is friendlier to anyone (or any agent) still referencing the old path. Low stakes — recommend the stub.
- **What gets embedded for a snippet:** `body` alone, or `body` + `curator_note` concatenated? Embedding the note too means a snippet surfaces when a beat is semantically near the *reason* it was saved, not just its text — richer retrieval, slightly noisier. Lean `body` only to start; revisit if retrieval feels thin.
- **Retrieval count + weighting:** How many snippets (N) go into a generation prompt, and how heavily `is_starred` outweighs raw similarity. Too many exemplars and the model apes them; too few and the voice is thin. Start small (≈3–5) and tune. A starred snippet might be force-included regardless of similarity — decide during workflow build.
- **Snippet decay:** A `promoted_from_post` exemplar reflects what worked *then*. Should old snippets fade in retrieval weight, or is starring/un-starring enough manual control? Defer — manual curation is fine until the library is large.