# Feature Spec — Daily Social Post Images

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** An image generation step for `social_post_from_news` (see `docs/daily-social-posts.md`)
**Status:** Draft
**Last updated:** 2026-11-08
**Suggested repo path:** `docs/features/social-post-image/feature-spec.md`

-----

## Overview

Each morning the daily routine produces a LinkedIn draft and an X draft for each founder. This feature adds one on-brand illustration per run. Both drafts share it, and the founder reviews it with the copy.

The hard part is not generating an image. It is making image #40 look like it belongs with image #1. Image models drift: each prompt is read fresh, and a model fills any gap in the prompt with its own defaults (gold coins, rocket ships, a blue gradient). This spec treats consistency as a data problem rather than a prompting trick. It has three layers:

1. **A versioned brand visual canon.** This is the base prompt, the palette, a closed motif vocabulary and a prohibited list. It lives in a `brand_visual` table next to `brand_voice`, not in code.
2. **A structured brief per story.** An LLM step picks a motif from the closed vocabulary and describes the subject. It never writes the final prompt.
3. **Deterministic assembly.** A pure function joins the canon, the brief and the platform format into the exact prompt the image model receives. That prompt is stored with the image as its audit trail.

**Style anchors** add to this: approved images go back into the model as reference images. The voice work taught us that showing an example beats describing it. The `voice_snippets` library exists because the `example_posts` JSONB described a voice without showing it. Style anchors apply the same lesson to images.

The style is a **sketch**: hand-drawn graphite and ink on warm paper, with one gold accent. Each run makes one render, which is cropped per platform. The **BTS mark** is then placed in the bottom-right corner of each crop by code. The model never draws the mark.

The step is **best-effort**. It runs after both drafts are persisted, and no image failure can sink the routine.

-----

## Scope

### In scope

- `brand_visual` singleton: base prompt, palette, motif vocabulary, prohibited terms, style anchors, version
- Image brief step (LLM, structured output) with a deterministic brief linter
- Deterministic prompt assembly (`buildImagePrompt`, pure)
- Render through OpenRouter's Image API, store the image in Supabase Storage, and insert `content_images` rows (`source = 'ai_generated'`)
- One master render per run (16:9), cropped per platform: 1600×900 for X and 1200×627 for LinkedIn
- BTS mark overlaid bottom-right on every platform crop, by code after render
- Motif rotation across days, reusing the `history.ts` pattern
- An image slot on `/content/[id]`: preview, alt text, regenerate, edit brief, remove, promote to style anchor
- An image download in the copy-out view (`/content/[id]/copy`)
- The image at full width in each post preview in the founder's draft email
- New model scopes for the brief and the render steps
- A `/brand` → Visual tab to edit the canon

### Out of scope

- Images in the campaign variant workflow. The building blocks here are written so campaigns can reuse them later; wiring that up is a separate change.
- Text, logos or wordmarks rendered by the image model (see "Text policy"). The BTS mark is composited by code, never generated.
- A wordmark or any text alongside the mark
- Automated posting with images (LinkedIn `/rest/images` upload, X media upload). This belongs to the posting phase in `docs/features/linkedin-posting/feature-spec.md`.
- Vision-model QA of rendered output → deferred. Human review is the gate.
- Video or animated output

-----

## User stories

**As a founder, I need to:**

- See a draft image beside each morning's draft posts, in the same review flow
- Trust that the image looks like BTS: same palette, same sketch style, the BTS mark in the same corner, no crypto clichés
- Regenerate an image I don't like, or edit its brief and regenerate, without leaving `/content/[id]`
- Edit alt text before posting, with Lex's verdict on it shown as a chip
- Download the right crop for each platform from the copy-out view
- Promote a good image to a style anchor so future images look more like it
- Change the visual canon (palette, motifs, prohibitions) from `/brand` without a deploy
- Know exactly which prompt, model and canon version produced any image

**As the routine, I need to:**

- Produce an image only after the copy exists, so the image fits the post's angle and not just the headline
- Skip the image cleanly when a story has no honest visual (the quiet path)
- Avoid using the same motif several days running
- Never block, delay or fail the drafts because of an image problem

-----

## Design decisions

Each decision traces back to existing evidence or an existing principle.

| Decision | Why | Evidence / precedent |
|---|---|---|
| Canon in a DB table, not in code | Founders tune it without a deploy, and it is versioned like voice | `brand_voice` v1.3 pattern; brand-voice migration moved voice out of markdown |
| The LLM writes a **brief**, never the final prompt | Keeps every image's style fixed and leaves only the subject to vary. An LLM that writes free-form prompts brings back the drift we are trying to remove. | Principle: deterministic before LLM |
| **Closed motif vocabulary** | A short list of on-brand visual metaphors is the main defence against cliché, and it makes images recognisable as a set | Design skill → Imagery: "no finance clichés (gold bars, bitcoin coins, rising chart illustrations)" |
| Deterministic brief linter, one re-brief, then skip | Same shape as the AI-tell gate: flag, one rewrite pass, never loop | `socialPost/aiTell.ts` |
| Style anchors as reference images | Showing beats describing | `voice_snippets` replaced `example_posts` for the same reason |
| Image runs **after** copy is persisted | A failure cannot lose drafts, and the brief can read the actual post | Existing rule: email is best-effort and drafts save first |
| `skip` is a valid brief outcome | Forcing an image onto a story that doesn't suit one produces filler | Principle: the quiet-day path is mandatory |
| No text in generated images | Image models garble text. Image text also never passes Lex, and screen readers can't read it. | Lex reviews copy only |
| No directional charts, arrows, price imagery | An up-and-to-the-right picture says what the copy is careful not to say | Principle: state facts, never conclusions; neutral delta colour rule |
| One render per run, cropped per platform | Halves the cost and keeps the two posts visually identical, while each platform still gets its native ratio | `content_images` spec: "same upload can be reused across variants"; `platform_specs.image_specs` ratios |
| Sketch style | A sketch reads as human and considered, not machine-made, and sits well beside founder-voice copy. Its slightly rough quality also hides small model artefacts that clean vector line art would show. | Decided by Chris 2026-11-07; within the design skill's "simple line art in the warm palette, not playful or cartoon" |
| BTS mark composited by code, never generated | Image models redraw logos inaccurately. Placing the real SVG by code gives the exact mark at the exact size and position every time. | Text policy, same reasoning |
| Style anchors stored **without** the mark | If anchors carried the logo, the model would learn to draw its own version of it | Reference images are imitated closely |
| Prompt, brief, model, canon version and cost stored per image | Provenance-first: any image can be explained later | `generated_documents.variable_values` audit pattern |

-----

## The base prompt (brand visual canon v1.0)

This is the seed content for `brand_visual`. It is derived from the BTS design skill (`.claude/skills/bts-design/README.md` → Visual foundations, Imagery vibe), which is the visual canon. The legacy `DESIGN_BRIEF.md` is not used.

**Light only (decided 2026-11-07).** The earlier charcoal-ground, gold-gradient social graphic style is retired for generated images. There is no dark variant and no second canon profile.

**Sketch style (decided 2026-11-07).** The canon describes a confident hand-drawn sketch, the kind an architect or engineer draws in a good notebook. It is not a doodle, a cartoon or a polished vector illustration.

### Style block

```
A hand-drawn sketch in graphite pencil and fine ink on warm off-white paper.
Loose, confident linework from a skilled hand: some lines drawn twice, light
construction lines left visible, light cross-hatching for shade. It should look
like a page from an architect's or engineer's sketchbook, drawn to think
something through. One focal idea with generous empty paper; the subject fills
no more than about 60% of the frame. Calm, considered and quietly confident.
Warm in tone, never cool.
```

### Palette block

```
Use only these colours:
- Paper: warm off-white #FAFAF8. Clean and even, no visible paper grain, stains or vignette.
- Main linework: warm near-black graphite and ink, #1A1915.
- Lighter strokes and hatching: warm grey #6B6860.
- Accent: a single light wash or stroke of muted gold #C9A84C on ONE element only.
No other colour. No gradients, no glow, no metallic sheen, no drop shadows.
```

### Composition block

```
Front-on or gentle three-quarter view; no dramatic perspective. Asymmetric
balance with clear empty paper on at least one side. Keep every important
element inside the central 80% of the frame, so the image survives platform
crops. Leave the bottom-right corner (roughly the lowest and rightmost 15% of
the frame) as empty paper.
```

### Prohibited block (sent to the model as part of the prompt)

```
Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.
```

### Subject block (filled from the brief)

```
Subject: {{brief.subject}}
Visual metaphor: {{motif.label}} — {{brief.metaphor}}
Composition note: {{brief.composition}}
Format: {{format.aspect_ratio}} landscape.
```

**Assembly order** is style, palette, composition, subject, prohibited. The prohibited block goes last on purpose: it is the part most often lost when a model weights the subject heavily.

### Motif vocabulary (seed)

The brief must choose exactly one `motif_key`. Each motif has a `label`, a `description` the brief step reads, and a `use_when` hint.

| `motif_key` | Label | Description | Use when |
|---|---|---|---|
| `ledger` | Ledger | Ruled ledger lines, columns, a single highlighted entry | Accounting treatment, reporting, disclosure |
| `vault` | Vault | A simple vault door or strongbox in outline | Custody, preservation, security |
| `balance` | Balance | A two-pan balance scale, level or gently weighted | Risk management, trade-offs, policy decisions |
| `architecture` | Architecture | Columns, foundations, an elevation drawing | Treasury structure, governance frameworks |
| `timepiece` | Timepiece | Hourglass, clock face, long time horizons | Time preference, long-term holding, cycles |
| `survey` | Survey | Contour lines, compass, a surveyed boundary | Regulation, navigating unfamiliar ground |
| `network` | Network | Nodes joined by fine lines, evenly distributed | The Bitcoin network, decentralisation, adoption |
| `instrument` | Instrument | A gauge or measuring instrument, needle at rest | Indicators, measurement, monitoring |
| `document` | Document | Folded papers, a seal, a signed page (no legible text) | Policy, standards, legislation, board papers |
| `horizon` | Horizon | A single landscape line with a low sun or moon-free sky | Macro, monetary conditions, the long view |

The vocabulary is data. Founders add, retire or reword motifs in `/brand` → Visual.

### Text policy

The image model never renders text. If a post needs a typographic card (a quote or a figure), that is a deterministic HTML/SVG-to-PNG job using the real fonts. It is a separate feature, not this one.

### Brand mark

The BTS mark (`bts-logo.svg`, the gold-gradient mark, no wordmark) is composited onto each platform crop after rendering. The composition block keeps that corner empty for it.

| Setting | Value | At 1600×900 (X) | At 1200×627 (LinkedIn) |
|---|---|---|---|
| Position | Bottom-right | | |
| Mark height | 9% of crop height | 81px | 56px |
| Right and bottom margin | 4% of crop height | 36px | 25px |
| Opacity | 100% | | |

Sizing from crop height keeps the mark visually the same on both platforms. The settings live in `brand_visual.brand_mark`, so they can be adjusted without a deploy.

-----

## Data model

### `brand_visual` (new)

Singleton at the application layer, the same as `brand_voice` and `company_profile`. One row has `is_active = true`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `version` | TEXT | Semver-style, e.g. `1.0`. Bumped on any edit that changes the assembled prompt. |
| `is_active` | BOOLEAN | Default `true` |
| `style_block` | TEXT | See canon above |
| `palette` | JSONB | `[{ role, hex, usage }]`. Rendered into the palette block, and also used by the deferred palette-drift check. |
| `composition_block` | TEXT | |
| `prohibited_block` | TEXT | Sent to the model |
| `prohibited_terms` | TEXT[] | Used by the **brief linter**, not sent to the model, e.g. `{coin,rocket,moon,chart,candlestick,arrow,₿,$,bull,bear,lambo}` |
| `motifs` | JSONB | `[{ key, label, description, use_when, is_active }]` |
| `style_anchor_paths` | TEXT[] | Storage paths of approved reference images (max 4 sent per call) |
| `default_aspect_ratio` | TEXT | Default `16:9` |
| `brand_mark` | JSONB | `{ enabled: true, position: 'bottom_right', height_pct: 9, margin_pct: 4, opacity: 1 }`. The SVG ships with the agents app (see Key files); this column holds placement only. |
| `notes` | TEXT | Why the canon is the way it is (curator note) |
| `updated_by` | UUID | FK → `team_members` |
| `created_at` / `updated_at` | TIMESTAMPTZ | `update_updated_at` trigger |

RLS: the team-member policy pattern from `20260910000000_rls_hardening.sql`, plus `service_role`.

### `content_images` (extend, additive)

The table already exists (`20260622000000_add_campaigns_schema.sql`) with `source IN ('upload', 'ai_generated')`. These columns are added and are all nullable, so uploads are unaffected.

| Column | Type | Notes |
|---|---|---|
| `generation_group_id` | UUID | Shared by every row from one render (LinkedIn crop + X crop), so regenerate and remove act on the group |
| `image_brief` | JSONB | The validated brief (see schema below) |
| `assembled_prompt` | TEXT | The exact prompt sent. This is the audit trail. |
| `brand_visual_version` | TEXT | Canon version used |
| `model_id` | TEXT | e.g. `google/gemini-2.5-flash-image` |
| `generation_ref` | TEXT | OpenRouter generation id, where returned |
| `cost_usd` | NUMERIC(8,4) | From the response `usage.cost` |
| `is_style_anchor` | BOOLEAN | Default `false`. Set when promoted. Mirrors `brand_visual.style_anchor_paths`. |
| `review_outcome` | TEXT | `kept`, `regenerated`, `removed`, NULL while pending. Feeds a later distil step (deferred). |
| `alt_text_verdict` | JSONB | Lex's verdict on the alt text: `{ classification, needs_disclaimer, rationale, checked_at }`. Advisory only. |

`created_by` stays NULL for agent-generated rows.

### `routines.action_config` (extend `SocialPostFromNewsConfig`)

```jsonc
{
  "founder_team_member_id": "<uuid>",
  "platforms": ["linkedin", "twitter_x"],
  "lookback_hours": 24,
  "generate_image": true          // new; absent is treated as true. Set false to opt a routine out.
}
```

### `SocialPostFromNewsResult` (extend)

```ts
image?: {
  status: 'generated' | 'skipped' | 'failed' | 'disabled';
  generation_group_id?: string;
  motif_key?: string;
  reason?: string;          // skip reason or error summary
  cost_usd?: number;
}
```

### Storage

The existing `platform-files` private bucket, under `social-images/{yyyy-mm-dd}/{generation_group_id}/`:

- `master-16x9.png`: the render as returned, **without the mark**. Kept for regeneration and for promoting to a style anchor.
- `x-1600x900.png`: X crop, with the mark
- `linkedin-1200x627.png`: LinkedIn crop, with the mark
- `anchors/`: copies of promoted style anchors, taken from the unmarked master, so deleting a post never removes an anchor

`content_images.storage_path` points at the marked platform crop.

Agents write with the service-role client. The web app reads through signed URLs, the same as `files.ts`.

-----

## Pipeline placement

The new step sits between the current step 5 (draft → Lex → persist, per platform) and step 6 (email). It runs once per run, not once per platform.

```
4  editor picks story + form
5  per platform: Charlie → AI-tell gate → Lex → persist content_items
5b IMAGE (new, best-effort, once per run)
   5b.1  load active brand_visual + recent motif history
   5b.2  image brief          (LLM, structured)      scope social_post.image_brief
   5b.3  lint brief           (pure)                 one re-brief on hit, then skip
   5b.4  assemble prompt      (pure)                 buildImagePrompt()
   5b.5  render               (OpenRouter Image API) scope social_post.image_render
   5b.6  crop + mark + upload (sharp → Storage)
   5b.7  Lex on alt text      (LLM, structured)      scope social_post.compliance_check
   5b.8  persist content_images rows + agent_activity
6  email founder (each post preview now shows its image when 5b succeeded)
```

### 5b.1 Load canon and motif history

- `brand_visual where is_active = true limit 1`. If no row exists, image status is `disabled` and the step ends.
- The last 10 `content_images` rows for this founder's accounts where `source = 'ai_generated'`, read for `image_brief->>'motif_key'`. This mirrors `history.ts` → `recentForms`.

### 5b.2 Image brief

The input is the story (title, summary, key points), the chosen `form`, the **persisted LinkedIn copy** (or X if LinkedIn is absent), the active motif list, and the last 3 motifs used. The prompt tells the step to avoid the last 3 motifs unless no other motif fits.

Output schema (`socialPost/imageBrief.ts`):

```ts
export const imageBriefSchema = z.object({
  skip: z.boolean(),
  skip_reason: z.string().max(200).nullable(),
  motif_key: z.string().nullable(),         // validated against active motifs at runtime
  subject: z.string().max(200).nullable(),  // what is depicted, concretely
  metaphor: z.string().max(200).nullable(), // how the motif carries the idea
  composition: z.string().max(200).nullable(),
  alt_text: z.string().max(300).nullable(), // describes the image, not the post
});
```

Structured output uses `errorStrategy: 'fallback'` with `{ skip: true, skip_reason: 'Brief generation failed.' }`. This matches `generateDraft`.

### 5b.3 Brief linter (pure: `lintImageBrief`)

- `motif_key` must be an active motif.
- No term from `prohibited_terms` may appear in `subject`, `metaphor` or `composition` (case-insensitive, word-boundary match).
- No digits in `subject` or `metaphor`. Numbers invite rendered text.
- `alt_text` is required when `skip = false`.

On any flag: one re-brief carrying the specific flags (`imageBriefRewriteInstruction`, the same shape as `aiTellRewriteInstruction`). If it is still flagged, status is `skipped` with a reason. It never loops.

### 5b.4 Prompt assembly (pure: `buildImagePrompt`)

```ts
buildImagePrompt(canon: BrandVisual, brief: ImageBrief, format: { aspectRatio: string }): string
```

Concatenates the blocks in the order above and fills the subject block. It has no IO and no randomness, so it can be snapshot-tested. Changing the canon changes the snapshot, which forces a version bump in review.

### 5b.5 Render

`POST https://openrouter.ai/api/v1/images` through a thin client in `apps/agents/src/lib/openrouterImage.ts`. The request builder is pure and the fetch is separate. The request body carries:

- `model` from the `social_post.image_render` scope
- `prompt` (the assembled prompt)
- `aspect_ratio: '16:9'`, `n: 1`
- reference images: up to 4 signed URLs from `style_anchor_paths`, **only when** the chosen endpoint supports reference input (check `GET /api/v1/images/models/{id}/endpoints`, cached daily)

**Verify at build time:** read the current OpenRouter Image API reference for exact field names (reference images, `image_config`, seed) before writing the client. The API is new and field names may have moved. This is the same standing rule as reading installed Mastra docs before writing framework code.

Timeout: 120 s. Generations of about 90 s have been observed for high-quality 16:9 renders. No retry on timeout: status is `failed` and the run continues. OpenRouter bills image generation all-or-nothing, so a failed call costs nothing.

### 5b.6 Crop, mark and upload (`imageCompose.ts`)

Order matters: **crop first, then mark**, so the mark sits in the same place on every crop.

1. Decode `b64_json` and keep it as the unmarked master.
2. Crop for each platform from `platform_specs.image_specs`, using a `sharp` centre crop and resize:
   - X: 16:9 → 1600×900, a resize only.
   - LinkedIn: 1.91:1 → 1200×627. A 16:9 frame loses about 3.5% at the top and bottom, which sits inside the composition block's 80% safe area.
3. Rasterise `bts-logo.svg` at the computed height and composite it bottom-right with the `brand_mark` margins (`sharp().composite([{ input, top, left }])`). The placement maths is a pure function (`markPlacement(width, height, brandMark)`) so it can be unit-tested without images.
4. Upload all three objects. Insert rows only after all three succeed.

`sharp` is new to `apps/agents`; add it as a dependency. `sharp` rasterises SVG through librsvg, so the gradient renders correctly. Confirm this in the bake-off contact sheet.

### 5b.7 Lex on alt text

A small, separate Lex call classifies the alt text alone (`buildAltTextLexPrompt`, pure). It reuses the `social_post.compliance_check` scope and `lexVerdictSchema`, with no disclaimer keys offered: alt text never carries a disclaimer, so the question is only whether it editorialises. Like the copy check, it is **advisory and never blocks**. Its fail-safe fallback is `general_advice` with a rationale saying the check was unavailable.

The verdict is stored in `content_images.alt_text_verdict`. Anything other than `educational` shows as a compliance chip on the image slot, so the founder rewrites the alt text before posting.

The pipeline order does not change. Copy goes through Lex before persist exactly as it does today, and the alt-text check runs inside step 5b.

### 5b.8 Persist

- One `content_images` row per persisted `content_item`, all with the same `generation_group_id`. `platform_crop` is `linkedin_1200x627` or `x_1600x900`. `sort_order` is 0 and `thread_segment_id` is NULL. On X threads the image attaches to the post, which in practice means the first segment.
- `agent_activity`: `agent_name = 'charlie'` (already in the CHECK), `action = 'social_image_generated'`, `status = 'pending'`, `trigger_type = 'scheduled'`, `entity_type = 'content_item'`, and `proposed_actions` carrying `motif_key`, `model_id`, `cost_usd`. A skip logs `action = 'social_image_skipped'` with the reason, so the quiet path is visible in the audit trail.
- A second row for the alt-text check: `agent_name = 'lex'`, `action = 'compliance_checked'`, `proposed_actions: [{ type: 'image_alt_text', classification }]`.

### Compliance

Lex reviews copy, not pixels. The image's compliance surface is the **brief** and the **alt text**, which are text:

- The deterministic linter enforces the prohibited motifs, the main way an image could imply returns.
- Lex classifies the alt text separately (5b.7). It is advisory, the same as the copy check.
- When a founder edits the alt text or the brief on `/content/[id]`, the alt-text check runs again. A clear verdict does not survive an edit, which matches the existing rule for copy.

-----

## Model configuration

Two new scopes in `packages/shared/src/modelScopes.ts`:

| Key | Type | Label | Fallback |
|---|---|---|---|
| `social_post.image_brief` | `workflow_step` | Image brief | `charlie` |
| `social_post.image_render` | `image_step` (new type) | Image render | none: env `OPENROUTER_IMAGE_MODEL`, else the bake-off default |

`image_step` is new because the existing resolver returns a `LanguageModelV4`. An image scope only needs a model id string. `/settings/models` shows `image_step` scopes with a picker filled from `GET /api/v1/images/models`, so only image-capable models can be chosen.

There is no Anthropic fallback for renders. The OpenRouter key-limit failover in `config/model.ts` applies to language models only. If OpenRouter is unavailable, the image step fails and the run carries on.

-----

## UI

### `/content/[id]`: image slot

Below the copy editor, for any item with `content_images`:

- Preview at the item's platform crop, mark included, with a 12px radius and a 1px border. No other decoration.
- **Alt text**: editable field. Saving sets `review_outcome = 'kept'`.
- **Regenerate** reuses the same brief with a new render and replaces the group. It is labelled "Regenerate image" in sentence case.
- **Edit brief** opens a slide-over with the brief fields and the motif select, then "Render with this brief". The assembled prompt shows read-only beneath it in JetBrains Mono, so a founder can see exactly what was sent.
- **Remove image** sets `review_outcome = 'removed'` and deletes the rows and objects.
- **Use as style anchor** copies the **unmarked master** to `anchors/` and appends to `brand_visual.style_anchor_paths` (max 8 stored, 4 sent). It asks "Use this image to guide future images?" as a conversational confirm, per the design skill.
- Caption-style metadata line: `motif · model · canon v1.0 · $0.04`.

Regenerate and edit-brief call the agents server, following the existing web → agents on-demand pattern. They log `agent_activity` with `trigger_type = 'manual'`.

Mobile: actions sit in their own row (not hover-revealed), with tap targets of 44px or more, per the design skill's Mobile section.

### `/content/[id]/copy`: copy-out

Add **Download image**, which serves the platform's marked crop, with the alt text shown beside it and a copy button.

### `/brand`: new Visual tab

Next to Voice. Sections: Style, Palette (swatches with hex in mono), Composition, Prohibited (block + terms), Motifs (table: key, label, use when, active), Brand mark (enabled, size and margin, with a live preview on a sample crop), Style anchors (grid, with remove). Saving bumps `version` and asks "Save as v1.1?". **Preview prompt** renders `buildImagePrompt` against a sample brief so edits can be checked without spending a render.

### Draft email

The email already shows each draft as a post-style card inside a 600px column (`socialDraftEmail.ts`). When 5b succeeded, each card shows **its own platform's crop at full card width**, between the post body and the Review link, where the image sits in a real post. The LinkedIn card shows the 1200×627 crop and the X card shows the 1600×900 crop, so the email previews what will actually be posted.

- Markup: `<img width="100%" style="display:block;width:100%;height:auto;border-radius:8px;">` inside the card cell, with the brief's alt text as `alt`.
- Source: the full-resolution crop, so it is sharp on retina screens. At about 1600px wide this is a few hundred KB per image, which is fine for email.
- Delivery: a signed URL with a 7-day expiry. If the URL has expired or the mail client blocks remote images, the alt text shows in its place and the Review link still works. See Open question 1.

-----

## Failure modes

| Situation | Behaviour |
|---|---|
| `generate_image` set to `false` | Image status `disabled`; nothing runs |
| No active `brand_visual` row | `disabled`; logged once per run |
| Brief call errors | Fallback brief → `skipped` |
| Brief returns `skip: true` | `skipped` with reason; logged as `social_image_skipped` |
| Brief fails lint twice | `skipped` with the flags as the reason |
| Render errors, times out or is refused | `failed`; nothing billed; drafts and email unaffected |
| Reference images unsupported by endpoint | Render prompt-only; noted in `proposed_actions` |
| Crop, mark composite or upload fails | `failed`; no partial `content_images` rows (insert only after all three objects upload). An unmarked image never reaches a founder. |
| Lex alt-text check errors | Fail-safe verdict (`general_advice`, "check unavailable"); image still persists with a chip |
| Every image path fails | Run still **succeeds**. Image failure never changes run status. |

-----

## Cost

About 60 renders a month (2 founders × 1 render a day × 30). For reference, OpenRouter's docs show a high-quality 16:9 render on a top-tier model at about US$0.13, which is about US$8 a month at that price. Cheaper models land well under that. Regenerations add to it. `cost_usd` per row makes the real figure a simple query, and the existing OpenRouter credits panel on the dashboard already shows spend.

-----

## Build sequence

The usual data layer → workflow → UI pattern, with an evidence step first.

**Step 0: Bake-off (evidence before choosing a model).** A script, not a feature. Take 10 recent stories from `news_items` that already produced posts. Write briefs by hand (or run the brief prompt once), assemble prompts with canon v1.0, and render each on 3–4 candidate models: Gemini 2.5 Flash Image, `openai/gpt-image-2`, Seedream 4.5, and a Recraft model for its illustration styles. Run each render through the crop-and-mark step so the contact sheet shows what will actually be posted. Founders rank it on four criteria: reads as a confident sketch (not a doodle, not vector), on-palette, no clichés, looks like a set. Models vary most on the sketch criterion, so expect it to decide the result. The winner becomes the `image_render` default. The best 2–4 outputs become the first style anchors. Record results in `docs/features/social-post-image/bakeoff.md`.

**Session 1: Data layer.** `brand_visual` table + seed v1.0, `content_images` additive columns, RLS, regenerated types (which also removes the `as any` cast for `content_images`), `SocialPostFromNewsConfig` / `Result` type extensions, model scopes + the `image_step` type.

**Session 2: Pipeline.** `imageBrief.ts` (schema, prompt, linter, rewrite instruction), `imagePrompt.ts` (`buildImagePrompt`), `lib/openrouterImage.ts`, `imageCompose.ts` (crop, `markPlacement`, composite), upload, the persist step, and wiring into `runSocialPost` after the platform loop. Tests: snapshot of the assembled prompt, linter cases, a skip path, a render-failure path that still returns `success`, history-based motif rotation, the alt-text Lex fallback, and `markPlacement` at both crop sizes.

**Session 3: UI.** Image slot on `/content/[id]`, copy-out download, `/brand` Visual tab with prompt preview, full-width images in the email cards, `/settings/models` image picker.

Images are **on for both founders from launch**. That makes step 0 a hard prerequisite: it sets the default render model and seeds the first style anchors. Without anchors, the first week of images rests on the prompt alone.

-----

## Key files (new or changed)

| File | Change |
|---|---|
| `supabase/migrations/2026MMDD000000_add_brand_visual.sql` | New table + seed v1.0 |
| `supabase/migrations/2026MMDD000001_extend_content_images.sql` | Additive columns |
| `apps/agents/src/workflows/socialPost/imageBrief.ts` | Brief schema, prompt, linter (pure) |
| `apps/agents/src/workflows/socialPost/imagePrompt.ts` | `buildImagePrompt` (pure) |
| `apps/agents/src/workflows/socialPost/image.ts` | Step 5b orchestration (IO) |
| `apps/agents/src/lib/openrouterImage.ts` | Image API client: pure request builder + fetch |
| `apps/agents/src/workflows/socialPost/imageCompose.ts` | Per-platform crop, `markPlacement` (pure), logo composite |
| `apps/agents/assets/bts-logo.svg` | Guarded copy of `.claude/skills/bts-design/assets/bts-logo.svg`, the same arrangement as `colors_and_type.css` |
| `apps/agents/package.json` | Add `sharp` |
| `.claude/skills/bts-design/README.md` | Imagery vibe: record that social post images use the sketch canon in `brand_visual` |
| `apps/agents/src/workflows/socialPost/index.ts` | Call step 5b; extend result |
| `apps/agents/src/lib/socialDraftEmail.ts` | Full-width platform crop in each post card |
| `packages/shared/src/modelScopes.ts` | Two scopes, `image_step` type |
| `packages/shared/src/routines.ts` | Config + result types |
| `apps/web/app/(app)/content/[id]/…` | Image slot |
| `apps/web/app/(app)/brand/…` | Visual tab |
| `docs/daily-social-posts.md` | Add step 5b; also bring it up to date with `aiTell`, `history`, `guidelines`, which the README predates |

-----

## Deliberately deferred

- **Palette-drift check.** A deterministic pass using `sharp` to extract dominant colours and measure their distance from `brand_visual.palette`, flagging off-palette renders. It is cheap and objective, but wait until the bake-off shows whether drift happens in practice.
- **Feedback distillation for images.** `review_outcome` collects the signal now. Folding it into standing guidance, as `distill_feedback` does for copy, comes later.
- **Campaign reuse.** `buildImagePrompt`, the brief step and the client are written without routine-specific inputs, so the campaign variant workflow can call them later.
- **Vision QA.** A vision model checking for rendered text or prohibited objects. Human review covers this for now.

-----

## Decisions

| Date | Decision |
|---|---|
| 2026-11-07 | **Light canon only.** No dark social variant and no second `brand_visual` profile. The earlier charcoal/gold-gradient graphic style is retired for generated images. |
| 2026-11-07 | **Lex checks alt text separately.** Pipeline order stays as it is. A small advisory Lex call classifies the alt text inside step 5b and is re-run on edit. |
| 2026-11-07 | **One image per run, cropped per platform.** One 16:9 render → 1600×900 for X and 1200×627 for LinkedIn. |
| 2026-11-07 | **BTS mark bottom-right.** Composited by code onto every platform crop. Never generated by the model. Style anchors stay unmarked. |
| 2026-11-07 | **Sketch style.** Canon v1.0 describes a confident hand-drawn graphite and ink sketch on warm paper with one gold accent. |
| 2026-11-08 | **Full-width images in the email.** Each post card shows its own platform crop at full card width. No thumbnail. |
| 2026-11-08 | **Images on by default.** `generate_image` absent means on, for both founders from launch. Step 0 must be complete before launch. |

-----

## Open questions

1. **Email image delivery.** A signed URL (specced) expires after 7 days and depends on the mail client loading remote images. An inline attachment (CID, through JMAP) is permanent and always displays, but adds about 0.5–1 MB to each email. **Recommended default:** signed URL. Switch to inline if images regularly fail to show in your mail client.
