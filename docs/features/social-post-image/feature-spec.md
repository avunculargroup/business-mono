# Feature Spec — Daily Social Post Images

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** An image generation step for `social_post_from_news` (see `docs/daily-social-posts.md`)
**Status:** Sessions 1–3 built; step 0 bake-off outstanding (see Build notes)
**Last updated:** 2026-11-08 (canon v1.1)
**Suggested repo path:** `docs/features/social-post-image/feature-spec.md`

-----

## Overview

Each morning the daily routine produces a LinkedIn draft and an X draft for each founder. This feature adds on-brand illustrations to the run: up to three candidates, one selected, which both drafts share. The founder reviews the selected image with the copy and can switch to another candidate.

The hard part is not generating an image. It is making image #40 look like it belongs with image #1. Image models drift: each prompt is read fresh, and a model fills any gap in the prompt with its own defaults (gold coins, rocket ships, a blue gradient). This spec treats consistency as a data problem rather than a prompting trick. It has three layers:

1. **A versioned brand visual canon.** This is the base prompt, the palette, layout presets, a house visual device and a prohibited list. It lives in a `brand_visual` table next to `brand_voice`, not in code.
2. **A structured brief per post.** An LLM step reads the post for its **tension** (the uneasy or unresolved idea, not the topic) and proposes up to three concepts that carry it. It never writes the final prompt.
3. **Deterministic assembly.** A pure function joins the canon, the brief and the platform format into the exact prompt the image model receives. That prompt is stored with the image as its audit trail.

**Style anchors** add to this: approved images go back into the model as reference images. The voice work taught us that showing an example beats describing it. The `voice_snippets` library exists because the `example_posts` JSONB described a voice without showing it. Style anchors apply the same lesson to images.

The style is a deliberately **unfinished sketch**: what the post treats as known is drawn in full, and what is uncertain is left as construction lines (canon v1.1). Each run renders up to three candidates, each cropped per platform. Code corrects the paper colour of each render, then places the **BTS mark** in the bottom-right corner of each crop. The model never draws the mark.

**Canon v1.1 (2026-11-08)** replaced v1.0's closed motif list after the first real post. "Twenty years ... The trigger? Nobody knows ... rethinking what 'safe' means" came back as a pencil hourglass with gold sand, centred in a wide frame on yellowed paper. The motif list mapped the post's topic to a stock symbol and ignored its point. The fix was art direction, not a better model: a better model would only draw a nicer hourglass.

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
| ~~Closed motif vocabulary~~ **(retired in v1.1)** | v1.0 used a short list of on-brand metaphors as the defence against cliché. In practice it mapped topics to stock symbols: the first real post ("Twenty years ... nobody knows the trigger") became a centred hourglass. Replaced by the device and layouts below. | The 2026-11-08 example, recorded in the Overview |
| The brief finds the **tension**, not the topic | The interesting idea in a post is what is surprising, uneasy or unresolved. An image of the topic is filler. | The hourglass ignored "nobody knows the trigger" and "what 'safe' means" |
| **Drawn vs not yet drawn** is the house device | Consistency comes from a visual device instead of a symbol list: the known part in full, the uncertain part as construction lines. It also gives every image a point of view. | Canon v1.1 style block |
| **Layout presets**, chosen per concept | v1.0's "asymmetric balance" was ignored; a named layout is followed | The hourglass sat dead centre in a 16:9 frame |
| **Stock-symbol terms** in the linter | Hourglass, clock, compass and the rest are what a model reaches for first | Linter only; never sent to the image model |
| **Paper correction in code** | "Warm off-white" rendered as aged parchment. Sampling the empty corner and scaling each channel fixes it deterministically. | The hourglass's paper was yellow, not `#FAFAF8` |
| **Three candidates, founder picks** | One render is a lottery. Three distinct concepts, each with its tension shown, let the founder judge the idea. | Unpicked candidates are the signal a later feedback step learns from |
| Deterministic brief linter, one re-brief, then skip | Same shape as the AI-tell gate: flag, one rewrite pass, never loop | `socialPost/aiTell.ts` |
| Style anchors as reference images | Showing beats describing | `voice_snippets` replaced `example_posts` for the same reason |
| Image runs **after** copy is persisted | A failure cannot lose drafts, and the brief can read the actual post | Existing rule: email is best-effort and drafts save first |
| `skip` is a valid brief outcome | Forcing an image onto a story that doesn't suit one produces filler | Principle: the quiet-day path is mandatory |
| No text in generated images | Image models garble text. Image text also never passes Lex, and screen readers can't read it. | Lex reviews copy only |
| No directional charts, arrows, price imagery | An up-and-to-the-right picture says what the copy is careful not to say | Principle: state facts, never conclusions; neutral delta colour rule |
| Each render cropped per platform; selection is per run | Keeps the two posts visually identical, while each platform still gets its native ratio | `content_images` spec: "same upload can be reused across variants"; `platform_specs.image_specs` ratios |
| Sketch style | A sketch reads as human and considered, not machine-made, and sits well beside founder-voice copy. Its slightly rough quality also hides small model artefacts that clean vector line art would show. | Decided by Chris 2026-11-07; within the design skill's "simple line art in the warm palette, not playful or cartoon" |
| BTS mark composited by code, never generated | Image models redraw logos inaccurately. Placing the real SVG by code gives the exact mark at the exact size and position every time. | Text policy, same reasoning |
| Style anchors stored **without** the mark | If anchors carried the logo, the model would learn to draw its own version of it | Reference images are imitated closely |
| Prompt, brief, model, canon version and cost stored per image | Provenance-first: any image can be explained later | `generated_documents.variable_values` audit pattern |

-----

## The base prompt (brand visual canon v1.1)

This is the content of the active `brand_visual` row: the v1.0 seed (`20261108000000_add_brand_visual.sql`), updated in place to v1.1 by `20261108100000_brand_visual_v1_1.sql`. It is derived from the BTS design skill (`.claude/skills/bts-design/README.md` → Visual foundations, Imagery vibe), which is the visual canon. The legacy `DESIGN_BRIEF.md` is not used.

**Light only (decided 2026-11-07).** The earlier charcoal-ground, gold-gradient social graphic style is retired for generated images. There is no dark variant and no second canon profile.

**Sketch style (decided 2026-11-07).** The canon describes a confident hand-drawn sketch, the kind an architect or engineer draws in a good notebook. It is not a doodle, a cartoon or a polished vector illustration.

**Deliberately unfinished (decided 2026-11-08, v1.1).** What the post treats as known is drawn in full; what is uncertain is left as construction lines. See "The house device" below.

### Style block

```
A hand-drawn sketch in graphite pencil and fine ink on bright, fresh cartridge
paper. Every drawing is deliberately unfinished. The part of the subject that is
known or certain is drawn in full: confident line, light cross-hatching, and the
single gold accent. The part that is uncertain, unbuilt or unknown is left as
faint construction lines only: guidelines, measured marks, an outline that stops
partway. The edge where finished drawing gives way to construction lines is the
point of the picture. It should look like an architect's working sketch, drawn by
a skilled hand to think something through, not to decorate. Considered and
quietly confident, with a clear point of view.
```

### Palette block

```
Use only these colours:
- Paper #FAFAF8: Bright near-white paper. Not cream, not aged, not yellowed, not parchment. Clean and even.
- Main linework #1A1915: warm near-black graphite and ink.
- Lighter strokes and hatching #6B6860: warm grey.
- Accent #C9A84C: a single light wash or stroke of muted gold on ONE element only.
No other colour. No gradients, no glow, no metallic sheen, no drop shadows.
```

### Composition block

```
Follow the layout given below exactly. Never centre a single upright object in a
wide frame. Prefer subjects with a horizontal extent that suit a landscape frame.
Keep every important element inside the central 80% of the frame. Leave the
bottom-right corner (roughly the lowest and rightmost 15% of the frame) as empty
paper.
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

### Subject block (filled from one concept)

```
Subject: {{concept.subject}}
Draw in full: {{concept.drawn}}
Leave as construction lines only: {{concept.undrawn}}
Layout: {{layout.label}}: {{layout.description}}
Format: {{format.aspect_ratio}} landscape.
```

The concept's **tension** is not sent: it is the reasoning, and the subject, drawn and undrawn lines are how it reaches the picture. It is stored with the image and shown to the founder.

**Assembly order** is style, palette, composition, subject, prohibited. The prohibited block goes last on purpose: it is the part most often lost when a model weights the subject heavily.

### The house device: drawn and not yet drawn

Every image is an architect's working sketch, deliberately unfinished. The brief decides, per concept, which part of the subject is **drawn** in full (what the post treats as known or certain) and which is **undrawn**: left as faint construction lines (what is unknown, unbuilt or in doubt). The edge between them is the point of the picture. `undrawn` is mandatory; the linter rejects an empty one or "none".

For the post that prompted v1.1, a concept that uses the device: a timber pier drawn in full near the viewer, its planks thinning into pencil guidelines over open water. The safe ground is shorter than it looks, and nobody knows where it ends.

### Layouts

The brief must choose one active layout per concept. They are data, in `brand_visual.layouts`; founders add, retire or reword them in `/brand` → Visual.

| `key` | Label | Description |
|---|---|---|
| `left_third` | Left third | Subject sits in the left third; open paper runs to the right, so the eye travels into space. |
| `low_horizon` | Low horizon | One horizon line in the lower third; the subject is small on it, with wide open paper above. |
| `close_detail` | Close detail | A tight close-up of one part of an object, running off at least one edge of the frame. |
| `small_in_space` | Small in space | A small subject placed well off-centre in a large empty field. |

### Stock symbols (linter only)

v1.1 adds these to `prohibited_terms`, on top of the v1.0 terms: hourglass, clock, stopwatch, calendar, compass, chess, chessboard, lightbulb, light bulb, puzzle, jigsaw, scales, balance scale, padlock, key, keyhole, ladder, summit, mountain peak, crossroads, signpost, umbrella, piggy bank, vault door, safe. Matched case-insensitively on whole words ("keystone" is not "key"). Founders edit the list in `/brand`.

### Retired: the v1.0 motif vocabulary

v1.0 asked the brief to pick one of ten motifs (`ledger`, `vault`, `balance`, `architecture`, `timepiece`, `survey`, `network`, `instrument`, `document`, `horizon`). It is no longer a pick. `brand_visual.motifs` is kept, unchanged, because images made under v1.0 reference it: the image slot labels them by motif. The Visual tab hides it rather than show a menu that no longer does anything.

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
| `motifs` | JSONB | `[{ key, label, description, use_when, is_active }]`. Retired as a pick in v1.1; kept for v1.0 images. |
| `layouts` | JSONB | `[{ key, label, description, is_active }]`. Added in v1.1. |
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
| `generation_group_id` | UUID | Shared by every row from one render (LinkedIn crop + X crop), so selecting, removing and promoting act on the group |
| `image_brief` | JSONB | The concept the image was rendered from, tension included (v1.1+). v1.0 rows hold `{ motif_key, subject, metaphor, ... }`; `readStoredBrief` reads both |
| `candidate_set_id` | UUID | Shared by every group from one run or one regenerate (v1.1) |
| `candidate_index` | SMALLINT | Concept order from the brief, 0–2; an Edit brief render takes the next index |
| `is_selected` | BOOLEAN | NOT NULL, default `true`, which backfills pre-v1.1 rows. Exactly one group per set is selected; everything that consumes an image reads `is_selected = true` only |
| `assembled_prompt` | TEXT | The exact prompt sent. This is the audit trail. |
| `brand_visual_version` | TEXT | Canon version used |
| `model_id` | TEXT | e.g. `google/gemini-2.5-flash-image` |
| `generation_ref` | TEXT | OpenRouter generation id, where returned |
| `cost_usd` | NUMERIC(8,4) | From the response `usage.cost` |
| `is_style_anchor` | BOOLEAN | Default `false`. Set when promoted. Mirrors `brand_visual.style_anchor_paths`. |
| `review_outcome` | TEXT | `kept`, `regenerated`, `removed`, `not_chosen`, NULL while pending. `not_chosen` marks candidates a founder passed over when picking another. Feeds a later distil step (deferred). |
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
  generation_group_id?: string;   // the selected candidate's group
  candidate_set_id?: string;
  candidates?: number;            // how many rendered
  layout?: string;                // the selected candidate's layout
  motif_key?: string;             // v1.0 results only
  reason?: string;                // skip reason or error summary
  cost_usd?: number;              // across every candidate
}
```

### Storage

The existing `platform-files` private bucket, under `social-images/{yyyy-mm-dd}/{generation_group_id}/`:

- `master-16x9.png`: the render, paper-corrected, **without the mark**. Kept for promoting to a style anchor, so anchors carry the corrected paper too.
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
   5b.1  load active brand_visual + recent subjects and layouts
   5b.2  image brief          (LLM, structured)      scope social_post.image_brief   up to three concepts
   5b.3  lint per concept     (pure)                 drop flagged; re-brief once if none clean, then skip
   per clean concept, in parallel (Promise.allSettled), each its own generation group:
   5b.4  assemble prompt      (pure)                 buildImagePrompt()
   5b.5  render               (OpenRouter Image API) scope social_post.image_render
   5b.6  paper correction, crop + mark + upload (sharp → Storage)
   5b.7  Lex on alt text      (LLM, structured)      scope social_post.compliance_check
   5b.8  persist content_images rows (unselected) + agent_activity
   then: select the lowest successful candidate
6  email founder (each post preview now shows its image when 5b succeeded)
```

### 5b.1 Load canon and image history

- `brand_visual where is_active = true limit 1`. If no row exists, image status is `disabled` and the step ends.
- Recent `content_images` rows for this founder's accounts where `source = 'ai_generated'`, reduced to the **selected** image of each of the last 5 runs (deduped by candidate set, falling back to generation group for pre-v1.1 rows): their subjects and layouts (`recentImageHistory`). Reads both stored brief shapes.

### 5b.2 Image brief

The input is the story (title, summary, key points) when known, the chosen `form`, the **persisted LinkedIn copy** (or X if LinkedIn is absent), the active layouts, the canon's prohibited terms, and the recent subjects and layouts. The brief works out, in order, for each concept: the **tension** (the surprising, uneasy or unresolved idea, not the topic), a concrete **subject** that carries it, what is **drawn** in full, what is left **undrawn**, a **layout**, and **alt text**. It returns three concepts with different subjects using at least two layouts. It is told not to repeat a recent subject, and not to use a layout the last two runs both used.

Output schema (`socialPost/imageBrief.ts`; the shared `ImageBrief` interface matches it, guarded at compile time):

```ts
const conceptSchema = z.object({
  tension: z.string().max(200),
  subject: z.string().max(200),
  drawn: z.string().max(200),     // rendered in full
  undrawn: z.string().max(200),   // left as construction lines only
  layout: z.string(),             // validated against active layouts by the linter
  alt_text: z.string().max(300),
});
export const imageBriefSchema = z.object({
  skip: z.boolean(),
  skip_reason: z.string().max(200).nullable(),
  concepts: z.array(conceptSchema).max(3),
});
```

Structured output uses `errorStrategy: 'fallback'` with `{ skip: true, skip_reason: 'Brief generation failed.', concepts: [] }`. This matches `generateDraft`.

### 5b.3 Linter (pure: `lintImageConcept`, `lintImageBrief`, in `@platform/shared`)

Per concept:

- `layout` must be an active layout.
- `tension`, `subject`, `drawn` and `alt_text` are required.
- `undrawn` is required and must not be empty or "none". The device is mandatory.
- No term from `prohibited_terms` (stock symbols included) may appear in `subject`, `drawn` or `undrawn` (case-insensitive, whole words; symbols such as `$` match as substrings).
- No digits in `subject`, `drawn` or `undrawn`. Numbers invite rendered text.

A flagged concept is dropped, not the brief; so is one repeating an earlier concept's subject. If none survive: one re-brief carrying every flag (`imageBriefRewriteInstruction`, the same shape as `aiTellRewriteInstruction`), then status `skipped` with a reason. It never loops.

### 5b.4 Prompt assembly (pure: `buildImagePrompt`)

```ts
buildImagePrompt(canon: BrandVisual, concept: ImageConcept, format: { aspectRatio: string }): string
```

Lives in `@platform/shared` so the web previews use it too. Concatenates the blocks in the order above and fills the subject block. It has no IO and no randomness, so it can be snapshot-tested. Changing the canon changes the snapshot, which forces a version bump in review.

### 5b.5 Render

`POST https://openrouter.ai/api/v1/images` through a thin client in `apps/agents/src/lib/openrouterImage.ts`. The request builder is pure and the fetch is separate. The request body carries:

- `model` from the `social_post.image_render` scope
- `prompt` (the assembled prompt)
- `aspect_ratio: '16:9'`, `n: 1`
- reference images: up to 4 signed URLs from `style_anchor_paths`, **only when** the chosen endpoint supports reference input (check `GET /api/v1/images/models/{id}/endpoints`, cached daily)

**Verify at build time:** read the current OpenRouter Image API reference for exact field names (reference images, `image_config`, seed) before writing the client. The API is new and field names may have moved. This is the same standing rule as reading installed Mastra docs before writing framework code.

Timeout: 120 s. Generations of about 90 s have been observed for high-quality 16:9 renders. No retry on timeout: status is `failed` and the run continues. OpenRouter bills image generation all-or-nothing, so a failed call costs nothing.

### 5b.6 Paper correction, crop, mark and upload (`imageCompose.ts`)

Order matters: **correct the paper, then crop, then mark**, so every crop shares the corrected paper and the mark sits in the same place on every crop.

1. Decode `b64_json` and keep it as the unmarked master.
1. **Paper correction** (`correctPaper`, with the maths in the pure `paperGains(sampleRgb, targetHex)`). Sample the bottom-right 12% × 12% of the master (the canon keeps it empty; the mark is not on yet) and take the per-channel median. If the sample's luma is below 0.80, the corner holds drawing: skip, and record why. Otherwise gains = palette paper hex (fallback `#FAFAF8`) / sample, per channel, clamped to [0.90, 1.15], applied with `sharp().linear(gains, [0,0,0])`. The record `{ sample, gains, applied, reason }` goes into the `social_image_generated` activity's `proposed_actions`. The corrected master is the one stored.
2. Crop for each platform from `platform_specs.image_specs`, using a `sharp` centre crop and resize:
   - X: 16:9 → 1600×900, a resize only.
   - LinkedIn: 1.91:1 → 1200×627. A 16:9 frame loses about 3.5% at the top and bottom, which sits inside the composition block's 80% safe area.
3. Rasterise `bts-logo.svg` at the computed height and composite it bottom-right with the `brand_mark` margins (`sharp().composite([{ input, top, left }])`). The placement maths is a pure function (`markPlacement(width, height, brandMark)`) so it can be unit-tested without images.
4. Upload all three objects. Insert rows only after all three succeed.

Each candidate does this independently; a failed candidate leaves nothing behind and does not affect the others.

`sharp` is new to `apps/agents`; add it as a dependency. `sharp` rasterises SVG through librsvg, so the gradient renders correctly. Confirm this in the bake-off contact sheet.

### 5b.7 Lex on alt text

A small, separate Lex call classifies the alt text alone (`buildAltTextLexPrompt`, pure). It reuses the `social_post.compliance_check` scope and `lexVerdictSchema`, with no disclaimer keys offered: alt text never carries a disclaimer, so the question is only whether it editorialises. Like the copy check, it is **advisory and never blocks**. Its fail-safe fallback is `general_advice` with a rationale saying the check was unavailable.

The verdict is stored in `content_images.alt_text_verdict`. Anything other than `educational` shows as a compliance chip on the image slot, so the founder rewrites the alt text before posting.

The pipeline order does not change. Copy goes through Lex before persist exactly as it does today, and the alt-text check runs inside step 5b.

### 5b.8 Persist

- Per candidate: one `content_images` row per persisted `content_item`, all with the same `generation_group_id`, the run's `candidate_set_id`, its `candidate_index`, and `is_selected = false`. `platform_crop` is `linkedin_1200x627` or `x_1600x900`.
- Once every candidate has settled, the lowest successful `candidate_index` is selected (`planCandidateSelection` in `@platform/shared`, the same rule the web's "Use this image" applies). If every candidate failed, the outcome is `failed` and the run still succeeds. `sort_order` is 0 and `thread_segment_id` is NULL. On X threads the image attaches to the post, which in practice means the first segment.
- `agent_activity`: `agent_name = 'charlie'` (already in the CHECK), `action = 'social_image_generated'`, `status = 'pending'`, `trigger_type = 'scheduled'`, `entity_type = 'content_item'`, and `proposed_actions` carrying the candidate set and index, `layout`, `subject`, `tension`, `model_id`, `cost_usd` and the paper correction. One row per candidate. A skip logs `action = 'social_image_skipped'` with the reason, so the quiet path is visible in the audit trail.
- A second row for the alt-text check: `agent_name = 'lex'`, `action = 'compliance_checked'`, `proposed_actions: [{ type: 'image_alt_text', classification }]`.

### Compliance

Lex reviews copy, not pixels. The image's compliance surface is the **brief** and the **alt text**, which are text:

- The deterministic linter enforces the prohibited terms and stock symbols, the main way an image could imply returns.
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
- The selected image's **tension** shows beneath it.
- **Other options**: the run's other candidates in their own row beneath, each with its tension as a caption and a **Use this image** action. Choosing one selects its group on every draft that shares it and marks the others `not_chosen`.
- **Regenerate** runs a fresh brief and renders a fresh set of three, then marks the old set `regenerated`. It is labelled "Regenerate image" in sentence case. Without a recorded story, the brief works from the post alone.
- **Edit brief** opens a slide-over with one concept's fields (tension, subject, drawn in full, construction lines only, layout, alt text), then "Render with this brief". The new image joins the run's set and is selected. The assembled prompt shows read-only beneath it in JetBrains Mono, so a founder can see exactly what was sent.
- **Remove image** sets `review_outcome = 'removed'` and deletes the rows and objects.
- **Use as style anchor** copies the **unmarked master** to `anchors/` and appends to `brand_visual.style_anchor_paths` (max 8 stored, 4 sent). It asks "Use this image to guide future images?" as a conversational confirm, per the design skill.
- Caption-style metadata line: `layout · model · canon v1.1 · $0.04` (v1.0 images show their motif instead of a layout).

Regenerate and edit-brief call the agents server, following the existing web → agents on-demand pattern. They log `agent_activity` with `trigger_type = 'manual'`.

Mobile: actions and candidates sit in their own rows (nothing hover-revealed), with tap targets of 44px or more, per the design skill's Mobile section. Checked at 375px and 320px.

### `/content/[id]/copy`: copy-out

Add **Download image**, which serves the platform's marked crop, with the alt text shown beside it and a copy button.

### `/brand`: new Visual tab

Next to Voice. Sections: Style, Palette (swatches with hex in mono), Composition, Prohibited (block + terms), Layouts (key, label, description, active; the retired motifs are hidden), Brand mark (enabled, size and margin, with a live preview on a sample crop), Style anchors (grid, with remove). Saving bumps `version` and asks "Save as v1.1?". **Preview prompt** renders `buildImagePrompt` against a sample brief so edits can be checked without spending a render.

### Draft email

The email already shows each draft as a post-style card inside a 600px column (`socialDraftEmail.ts`). When 5b succeeded, each card shows **its own platform's crop at full card width**, between the post body and the Review link, where the image sits in a real post. The LinkedIn card shows the 1200×627 crop and the X card shows the 1600×900 crop, so the email previews what will actually be posted.

- Markup: `<img width="100%" style="display:block;width:100%;height:auto;border-radius:8px;">` inside the card cell, with the brief's alt text as `alt`.
- Source: the full-resolution crop, so it is sharp on retina screens. At about 1600px wide this is a few hundred KB per image, which is fine for email.
- Each card shows the **selected** candidate. When others exist, one plain line under the image: "2 more image options to choose from in Review".
- Delivery: a signed URL with a 7-day expiry. If the URL has expired or the mail client blocks remote images, the alt text shows in its place and the Review link still works. See Open question 1.

-----

## Failure modes

| Situation | Behaviour |
|---|---|
| `generate_image` set to `false` | Image status `disabled`; nothing runs |
| No active `brand_visual` row | `disabled`; logged once per run |
| Brief call errors | Fallback brief → `skipped` |
| Brief returns `skip: true` | `skipped` with reason; logged as `social_image_skipped` |
| Some concepts fail lint | They are dropped; the clean ones render, with no re-brief |
| No concept passes lint, twice | `skipped` with the flags as the reason |
| One candidate's render errors, times out or is refused | That candidate is dropped; the others are kept and the lowest success is selected |
| Every candidate's render fails | `failed`; nothing billed; drafts and email unaffected |
| Paper sample is not empty paper (luma < 0.80) | Correction skipped and recorded; the render is used as returned |
| Reference images unsupported by endpoint | Render prompt-only; noted in `proposed_actions` |
| Crop, mark composite or upload fails | `failed`; no partial `content_images` rows (insert only after all three objects upload). An unmarked image never reaches a founder. |
| Lex alt-text check errors | Fail-safe verdict (`general_advice`, "check unavailable"); image still persists with a chip |
| Every image path fails | Run still **succeeds**. Image failure never changes run status. |

-----

## Cost

About 180 renders a month (2 founders × 3 candidates a day × 30), from canon v1.1. For reference, OpenRouter's docs show a high-quality 16:9 render on a top-tier model at about US$0.13, which is about US$23 a month at that price. Cheaper models land well under that. Regenerations add to it. `cost_usd` per row makes the real figure a simple query, and the existing OpenRouter credits panel on the dashboard already shows spend.

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
| 2026-11-08 | **Canon v1.1: the motif list is retired.** It mapped topics to stock symbols; the first real post became a centred hourglass on yellowed paper. The brief finds the post's tension instead. `motifs` is kept for v1.0 images. |
| 2026-11-08 | **The drawn/undrawn device.** What is known is drawn in full; what is uncertain is left as construction lines. Mandatory in every concept. |
| 2026-11-08 | **Layout presets.** Four seeded (`left_third`, `low_horizon`, `close_detail`, `small_in_space`), editable in `/brand`. A layout used twice in a row is rested. |
| 2026-11-08 | **Paper correction in code.** The empty corner is sampled and each channel scaled toward the palette paper, clamped, before crop and mark. |
| 2026-11-08 | **Three candidates, founder picks.** Up to three concepts render in parallel; the lowest success is selected; selection is per run, not per platform. Unpicked candidates are kept as `not_chosen`. |

-----

## Build notes

Where the build departs from this spec, and why.

| Spec says | Built | Why |
|---|---|---|
| `apps/agents/assets/bts-logo.svg` | `workflows/socialPost/brandMark.ts`, a string constant, with a test that it is byte-identical to the skill's SVG | `mastra build` bundles source and leaves loose asset files behind |
| Check `/images/models/{id}/endpoints` for reference-image support | Send references; on a 400, retry once prompt-only and record `references_dropped` | A failed call is not billed, and the endpoint's response shape could not be verified from the build sandbox |
| Linter requires alt text | Also requires a subject | The subject block cannot be assembled without one |
| Image slot below the copy editor | In the editor's side panel, above Feedback | The copy column is a full-height textarea; a 16:9 preview below it would squash it |
| Remove deletes rows and objects | Deletes the objects; marks the rows `removed` | The prompt, model and cost are the provenance record, and `review_outcome` is the signal the deferred distil step reads |
| Regenerate "replaces the group" | Writes a new group, then marks the old rows `regenerated` | Same reason; the page shows the newest live group |
| Regenerate and edit-brief call the agents server | Through a `content_image_requests` queue and `contentImageRequestListener` | The web app has no HTTP route to the agents server; this is the platform's web → DB → agents pattern |
| `buildImagePrompt` in `apps/agents` | In `@platform/shared` (`brandVisual.ts`), with `lintImageBrief` | The brief slide-over and the Visual tab preview with the same function the render uses |
| v1.1: insert a new canon row and deactivate v1.0 | The migration updates the active row in place and bumps its version, guarded to run once | That is what the `/brand` Visual tab's save action does; each image already records its version and exact prompt |
| v1.1: paper correction threshold is "relative luminance" below 0.80 | Luma over gamma-encoded values (Rec. 709 weights), not linear-light luminance | Moderately yellowed paper, the case being corrected, falls under 0.80 in linear light and would be skipped; ink in the corner still falls well below 0.80 either way |
| v1.1: concepts use "at least two different layouts" | Asked for in the brief prompt; the linter drops repeated subjects but does not reject a brief whose clean concepts share one layout | Rejecting would force a re-brief and could lose good concepts over composition alone |
| v1.1: the Visual tab may keep motifs read-only or hide them | Hidden, and never written by the save action | A retired menu beside the live controls invites edits that do nothing |
| v1.1: remove | Removes the selected group only; the run's other candidates stay and the slot offers them | The founder may want one of the alternatives; nothing is auto-selected |

-----

## Open questions

1. **Email image delivery.** A signed URL (specced) expires after 7 days and depends on the mail client loading remote images. An inline attachment (CID, through JMAP) is permanent and always displays, but adds about 0.5–1 MB to each email. **Recommended default:** signed URL. Switch to inline if images regularly fail to show in your mail client.
