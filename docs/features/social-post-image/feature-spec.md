# Feature Spec — Daily Social Post Images

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** An image generation step for `social_post_from_news` (see `docs/daily-social-posts.md`)
**Status:** Sessions 1–3 built; canon v1.2. The step 0 bake-off was dropped: tested in production (see Decisions)
**Last updated:** 2026-11-09 (canon v1.2; the hook and the idea review)
**Suggested repo path:** `docs/features/social-post-image/feature-spec.md`

-----

## Overview

Each morning the daily routine produces a LinkedIn draft and an X draft for each founder. This feature adds on-brand illustrations to the run: up to three candidates, one selected, which both drafts share. The founder reviews the selected image with the copy and can switch to another candidate.

The hard part is not generating an image. It is making image #40 look like it belongs with image #1. Image models drift: each prompt is read fresh, and a model fills any gap in the prompt with its own defaults (gold coins, rocket ships, a blue gradient). This spec treats consistency as a data problem rather than a prompting trick. It has three layers:

1. **A versioned brand visual canon.** This is the base prompt, the palette, layout presets and a prohibited list. It lives in a `brand_visual` table next to `brand_voice`, not in code.
2. **A structured brief per post.** An LLM step names the post's **hook** (its most specific phrase), reads it for its **tension** (the uneasy or unresolved idea, not the topic) and proposes up to six concepts about the hook, each a familiar **symbol** with one visible **twist**. A text-only reviewer then shortlists three to render. The brief never writes the final prompt.
3. **Deterministic assembly.** A pure function joins the canon, the brief and the platform format into the exact prompt the image model receives. That prompt is stored with the image as its audit trail.

**Style anchors** add to this: approved images go back into the model as reference images. The voice work taught us that showing an example beats describing it. The `voice_snippets` library exists because the `example_posts` JSONB described a voice without showing it. Style anchors apply the same lesson to images.

The style is a **bold two-colour linocut**: black ink and one flat gold on bright paper, one big iconic subject that reads at phone size (canon v1.2). Each run renders up to three candidates, each cropped per platform. Code corrects the paper colour of each render, then places the **BTS mark** in the bottom-right corner of each crop. The model never draws the mark.

**Canon v1.1 (2026-11-08)** replaced v1.0's closed motif list after the first real post. "Twenty years ... The trigger? Nobody knows ... rethinking what 'safe' means" came back as a pencil hourglass with gold sand, centred in a wide frame on yellowed paper. The motif list mapped the post's topic to a stock symbol and ignored its point. The fix was art direction, not a better model: a better model would only draw a nicer hourglass.

**Canon v1.2 (2026-11-09)** corrected v1.1's overcorrection. Its first three images, for the ASIC CP 392 post ("140 businesses have applied ... Clarity's coming. April 2027."), were a half-drawn bridge pier, fence posts trailing into guidelines, and pipe stumps under scaffolding lines. Each was a clever concept sketch, and each needed a caption to make sense. In a feed nobody reads the caption. v1.2 sets the bar at the **half-second test**: someone scrolling past on a phone recognises the subject and gets the idea without reading the post. So it uses a familiar symbol (stock symbols are allowed again) with one twist, printed big as a linocut.

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
| ~~**Drawn vs not yet drawn** is the house device~~ **(retired in v1.2)** | v1.1 drew the known part in full and left the uncertain part as construction lines. The images were clever but did not read at phone size. | The ASIC CP 392 example, recorded in the Overview |
| **A familiar symbol with one twist** | Recognition must be instant, so the symbol is one everyone already knows; one visible change ties it to this post. Originality comes from the twist, not the symbol. | The half-second test; the brief's worked examples |
| The brief anchors on the post's **hook** | A symbol of the topic illustrates every post on the subject. The hook ("capital buffers", not "regulation") is what makes it this post, and a pun on its words often reads fastest. | The capital-buffers post: a balance scale and a farm gate, both pictures of "regulation" |
| A **text-only reviewer** shortlists before rendering | Judging an idea costs a fraction of a cent; a render costs cents. The brief proposes six, the editor scores them, and only the top three are rendered. Advisory, like Lex: it never stops an image being made. | The capital-buffers post's scale had the weighted pan sitting higher; nothing checked it before the render |
| **Linocut style** | Solid black masses and a flat gold shape read at thumbnail size, where fine pencil lines vanish. It is consistent by construction: few colours, few marks. | Canon v1.2 style block |
| **Layout presets**, chosen per concept | v1.0's "asymmetric balance" was ignored; a named layout is followed | The hourglass sat dead centre in a 16:9 frame |
| ~~**Stock-symbol terms** in the linter~~ **(retired in v1.2)** | v1.1 banned hourglass, clock, compass and the rest. That pushed the brief to obscure subjects. v1.2 wants familiar symbols, with a twist. The finance clichés stay banned: that rule is compliance, not taste. | The ASIC CP 392 example |
| **Bars stripped, legibility gated in code** | Models sometimes letterbox a render, which also fooled the paper sample. A render that is mostly paper or mostly ink fails at phone size. Both are cheap, deterministic checks. | The cream-and-letterbox case, reproduced in `imageCompose.test.ts` |
| **Paper correction in code** | "Warm off-white" rendered as aged parchment. Sampling the empty corner and scaling each channel fixes it deterministically. | The hourglass's paper was yellow, not `#FAFAF8` |
| **Three candidates, founder picks** | One render is a lottery. Three distinct concepts, each with its tension shown, let the founder judge the idea. | Unpicked candidates are the signal a later feedback step learns from |
| Deterministic brief linter, one re-brief, then skip | Same shape as the AI-tell gate: flag, one rewrite pass, never loop | `socialPost/aiTell.ts` |
| Style anchors as reference images | Showing beats describing | `voice_snippets` replaced `example_posts` for the same reason |
| Image runs **after** copy is persisted | A failure cannot lose drafts, and the brief can read the actual post | Existing rule: email is best-effort and drafts save first |
| `skip` is a valid brief outcome | Forcing an image onto a story that doesn't suit one produces filler | Principle: the quiet-day path is mandatory |
| No text in generated images | Image models garble text. Image text also never passes Lex, and screen readers can't read it. | Lex reviews copy only |
| No directional charts, arrows, price imagery | An up-and-to-the-right picture says what the copy is careful not to say | Principle: state facts, never conclusions; neutral delta colour rule |
| Each render cropped per platform; selection is per run | Keeps the two posts visually identical, while each platform still gets its native ratio | `content_images` spec: "same upload can be reused across variants"; `platform_specs.image_specs` ratios |
| ~~Sketch style~~ **(replaced by linocut in v1.2)** | A sketch reads as human and considered, not machine-made, and sits well beside founder-voice copy. Its slightly rough quality also hides small model artefacts that clean vector line art would show. | Decided by Chris 2026-11-07; within the design skill's "simple line art in the warm palette, not playful or cartoon" |
| BTS mark composited by code, never generated | Image models redraw logos inaccurately. Placing the real SVG by code gives the exact mark at the exact size and position every time. | Text policy, same reasoning |
| Style anchors stored **without** the mark | If anchors carried the logo, the model would learn to draw its own version of it | Reference images are imitated closely |
| Prompt, brief, model, canon version and cost stored per image | Provenance-first: any image can be explained later | `generated_documents.variable_values` audit pattern |

-----

## The base prompt (brand visual canon v1.2)

This is the content of the active `brand_visual` row: the v1.0 seed (`20261108000000_add_brand_visual.sql`), updated in place to v1.1 by `20261108100000_brand_visual_v1_1.sql` and to v1.2 by `20261109100000_brand_visual_v1_2.sql`. It is derived from the BTS design skill (`.claude/skills/bts-design/README.md` → Visual foundations, Imagery vibe), which is the visual canon. The legacy `DESIGN_BRIEF.md` is not used.

**Light only (decided 2026-11-07).** The earlier charcoal-ground, gold-gradient social graphic style is retired for generated images. There is no dark variant and no second canon profile.

**Linocut (decided 2026-11-09, v1.2).** Black ink and one flat gold, printed on bright paper. One big, familiar subject with one twist. It replaces the v1.0 sketch and the v1.1 unfinished sketch.

### Style block

```
A bold two-colour linocut print: black ink and one flat gold, printed on bright
off-white paper. Strong, simple shapes cut with confidence: solid black masses,
crisp white gouge lines carved through them, visible carving marks, and the
slightly uneven ink texture of a hand-pulled print. Gold is a second printed
colour laid down in large flat shapes, not a thin accent. One iconic subject,
big and instantly recognisable, with a silhouette that still reads at thumbnail
size. Graphic, confident and striking, like a classic travel poster or a
woodcut book cover.
```

### Palette block

```
Use only these colours:
- Paper #FAFAF8: Bright off-white, unprinted areas clean and even. Not cream, not aged, not yellowed.
- Ink #1A1915: Solid black printed masses and carved line work.
- Gold #C9A84C: A flat second printed colour in large shapes. It may cover up to a third of the image.
No other colour. No gradients or soft shading: tone comes only from carved lines. No glow, no metallic sheen, no drop shadows.
```

### Composition block

```
One subject, and make it big: it fills 60 to 80 percent of the frame height.
Simple and bold enough to recognise in half a second on a phone. Place it
according to the layout below, never small and never lost in empty space. Black
and gold together cover roughly a third to two thirds of the image. Print
full-bleed on the paper: no borders, frames, margins, mounts or black bars. Keep
the bottom-right corner (roughly the lowest and rightmost 15 percent of the
frame) as unprinted paper.
```

### Prohibited block (sent to the model as part of the prompt)

v1.2 appends its last three lines to the existing block, so the v1.0 and v1.1 lines stay:

```
Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.
Pencil sketch, fine hatching, construction or guide lines, unfinished drawing.
Photographs, 3D, gradients, airbrushing. Any colour other than black and gold.
Borders, frames, letterboxing or bars.
```

### Subject block (filled from one concept)

```
Subject: {{concept.subject}}
The symbol: {{concept.symbol}}
The twist: {{concept.twist}}
Layout: {{layout.label}}: {{layout.description}}
Format: {{format.aspect_ratio}} landscape.
```

The concept's **tension** is not sent: it is the reasoning, and the symbol, twist and subject are how it reaches the picture. It is stored with the image and shown to the founder.

**Assembly order** is style, palette, composition, subject, prohibited. The prohibited block goes last on purpose: it is the part most often lost when a model weights the subject heavily.

### Symbol and twist

The brief works out, per concept: the **tension**, a **symbol** everyone already knows (instant recognition matters more than originality), one **twist** that changes the symbol in a way you can see and ties it to the tension, and the **subject**: one sentence describing the symbol with its twist, as it will be printed. The brief prompt carries worked examples:

- Weak, a symbol with no twist: "Twenty years" became an hourglass. True, but it says nothing.
- Weak, no symbol: a half-drawn bridge pier for a regulator's consultation paper. It needs explaining.
- Strong: a regulator's consultation paper became a giant rubber stamp poised just above a blank sheet, about to land. Or a lighthouse throwing one solid gold beam through fog, for "clarity's coming".

Before the symbol, the brief names the **hook**: the post's single most specific, concrete phrase, the thing a reader would quote back ("capital buffers", not "regulation"; "Twenty years", not "US debt"). Every concept must be about it, and visual puns on its words are welcome. If the twist involves weight, balance, light, motion or water, it must read correctly: a weighted pan sits lower. The examples gained the post that prompted this:

- Weak, the topic and not the hook: "capital buffers" became a balance scale. It says "regulation", and this one had the weighted pan sitting higher.
- Weak, the topic and not the hook: "capital buffers" became a closed farm gate.
- Strong, the hook with a pun: "capital buffers" became a heavy railway buffer stop in gold, a black rail running straight into it.

The linter rejects a twist that only restates the symbol, and drops a concept repeating another concept's symbol. The brief is told not to reuse a symbol from the last five runs (see 5b.1).

### Layouts

The brief must choose one active layout per concept. They are data, in `brand_visual.layouts`; founders add, retire or reword them in `/brand` → Visual. v1.2 deactivated v1.1's four (`left_third`, `low_horizon`, `close_detail`, `small_in_space`) rather than deleting them, because older images reference them.

| `key` | Label | Description |
|---|---|---|
| `hero_left` | Hero left | The subject is large and sits left of centre, filling most of the frame height; bold open space to the right. |
| `close_crop` | Close crop | The subject is so close that the frame edges cut it off; it fills the whole frame. |
| `diagonal` | Diagonal | The subject runs on a strong diagonal from lower left to upper right, top to bottom of the frame. |
| `against_gold` | Against gold | A large black silhouette set against one big flat gold shape behind it, such as a disc, a band or a field. |

### Prohibited terms (linter only)

The v1.0 finance clichés and anything implying a price direction (coin, rocket, moon, chart, candlestick, arrow, ₿, $, bull, bear, lambo …) stay: that rule is compliance, not taste. Matched case-insensitively on whole words; symbols such as `$` match as substrings. Founders edit the list in `/brand`.

### Retired: the v1.1 device and stock-symbol ban

v1.1 asked every concept for what is **drawn** in full and what is left **undrawn** as construction lines, and appended 25 stock symbols (hourglass, clock, stopwatch, calendar, compass, chess, chessboard, lightbulb, light bulb, puzzle, jigsaw, scales, balance scale, padlock, key, keyhole, ladder, summit, mountain peak, crossroads, signpost, umbrella, piggy bank, vault door, safe) to `prohibited_terms`. v1.2 removed both. The images were clever but did not pass the half-second test: for the ASIC CP 392 post they were a half-drawn bridge pier, fence posts trailing into guidelines, and pipe stumps under scaffolding lines. v1.1 images keep their stored `drawn`/`undrawn` brief, and the image slot still reads it (`readStoredBrief`).

**Style anchors were cleared in v1.2.** Anchors promoted under v1.0 or v1.1 are pencil sketches and would pull renders back to the old style. Only `style_anchor_paths` was cleared; the objects stay in storage.

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
| `layouts` | JSONB | `[{ key, label, description, is_active }]`. Added in v1.1; v1.1's four deactivated and four added in v1.2. |
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
| `image_brief` | JSONB | The concept the image was rendered from, tension included (v1.1+): `{ tension, symbol, twist, subject, layout, alt_text }` from v1.2, plus `{ hook, review }` once the reviewer ran (`review` is null when its ranking fell back, and both are absent on a founder's Edit brief render); `{ ..., drawn, undrawn }` in v1.1. v1.0 rows hold `{ motif_key, subject, metaphor, ... }`; `readStoredBrief` reads all three |
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
   5b.1  load active brand_visual + recent symbols and layouts
   5b.2  image brief          (LLM, structured)      scope social_post.image_brief   the hook + up to six concepts
   5b.3  lint per concept     (pure)                 drop flagged; re-brief once if none clean, then skip
   5b.3b review + rank        (LLM, structured)      scope social_post.image_critic  editor scores; rankConcepts keeps the top three
   per shortlisted concept, in parallel (Promise.allSettled), each its own generation group, best first:
   5b.4  assemble prompt      (pure)                 buildImagePrompt()
   5b.5  render               (OpenRouter Image API) scope social_post.image_render
   5b.6  strip bars, paper correction, legibility gate, crop + mark + upload (sharp → Storage)
   5b.7  Lex on alt text      (LLM, structured)      scope social_post.compliance_check
   5b.8  persist content_images rows (unselected) + agent_activity
   then: select the lowest successful candidate (the reviewer's top pick, when it rendered)
6  email founder (each post preview now shows its image when 5b succeeded)
```

### 5b.1 Load canon and image history

- `brand_visual where is_active = true limit 1`. If no row exists, image status is `disabled` and the step ends.
- Recent `content_images` rows for this founder's accounts where `source = 'ai_generated'`, reduced to the **selected** image of each of the last 5 runs (deduped by candidate set, falling back to generation group for pre-v1.1 rows): their symbols and layouts (`recentImageHistory`). A pre-v1.2 image has no symbol, so its subject stands in. Reads every stored brief shape.

### 5b.2 Image brief

The input is the story (title, summary, key points) when known, the chosen `form`, the **persisted LinkedIn copy** (or X if LinkedIn is absent), the active layouts, the canon's prohibited terms, and the recent symbols and layouts. The prompt opens with the half-second test. The brief first names the run's **hook** (see "Symbol and twist" above), then works out, in order, for each concept: the **tension** (the surprising, uneasy or unresolved idea, not the topic), a familiar **symbol**, one visible **twist**, the **subject** (the symbol with its twist, as printed), a **layout**, and **alt text**. It then checks each concept against the half-second test, using the worked examples in "Symbol and twist" above. It returns six concepts with six different symbols using at least two layouts: breadth over polish, because a reviewer shortlists them. It is told not to use a recent symbol again, and not to use a layout the last two runs both used.

Output schema (`socialPost/imageBrief.ts`; the shared `ImageBrief` interface matches it, guarded at compile time):

```ts
const conceptSchema = z.object({
  tension: z.string().max(200),
  symbol: z.string().max(200),    // an object, place or tool everyone knows
  twist: z.string().max(200),     // one visible change that ties it to the hook and tension
  subject: z.string().max(200),   // the symbol with its twist, as printed
  layout: z.string(),             // validated against active layouts by the linter
  alt_text: z.string().max(300),
});
export const imageBriefSchema = z.object({
  skip: z.boolean(),
  skip_reason: z.string().max(200).nullable(),
  hook: z.string().max(120),      // the post's most specific, concrete phrase
  concepts: z.array(conceptSchema).max(6),
});
```

The hook is never sent to the image model, so it is exempt from the no-digits lint: "140 applicants" is a fine hook.

Structured output uses `errorStrategy: 'fallback'` with `{ skip: true, skip_reason: 'Brief generation failed.', hook: '', concepts: [] }`. This matches `generateDraft`.

### 5b.3 Linter (pure: `lintImageConcept`, `lintImageBrief`, in `@platform/shared`)

Per concept:

- `layout` must be an active layout.
- `tension`, `symbol`, `twist`, `subject` and `alt_text` are required.
- The twist must not just restate the symbol (compared after normalising case and punctuation).
- No term from `prohibited_terms` may appear in `subject`, `symbol` or `twist` (case-insensitive, whole words; symbols such as `$` match as substrings).
- No digits in `subject`, `symbol` or `twist`. Numbers invite rendered text.

A flagged concept is dropped, not the brief; so is one repeating an earlier concept's symbol. If none survive: one re-brief carrying every flag (`imageBriefRewriteInstruction`, the same shape as `aiTellRewriteInstruction`), then status `skipped` with a reason. It never loops.

### 5b.3b Review and rank (`buildImageCriticPrompt`, `rankConcepts`, pure, in `imageBrief.ts`)

The internal `editor` agent scores every lint-clean concept, text only, under the `social_post.image_critic` scope. It sees the post, the hook and the concepts numbered from 1, is told to be strict, and is calibrated on the capital-buffers post (the scale, the gate and the buffer stop). For each concept it returns `recognisable`, `twist_visible` and `on_hook` (1–5), `physics_ok` and a one-line `note`. A plain symbol with no twist scores 1 on `twist_visible`; a picture of the general topic scores 1 on `on_hook`.

`rankConcepts(concepts, critique, max = 3)` is deterministic:

- Drop a concept with `physics_ok` false or any score of 2 or less.
- Order the rest by total (`recognisable + twist_visible + on_hook`); the brief's order breaks ties. Concepts the reviewer did not score rank after every scored one and are never dropped.
- Take the top three. Their order becomes `candidate_index`, so candidate 0, the default selection, is the reviewer's top pick.
- **Advisory, like Lex.** If the critique is missing or malformed, names an index outside the list or scores one twice, or nothing survives the filter, the shortlist is the top three in brief order (`fallback: true`, logged). The reviewer never stops an image being made, and never triggers a re-brief or a re-render.

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

### 5b.6 Strip bars, paper correction, legibility, crop, mark and upload (`imageCompose.ts`)

Order matters: **strip bars, correct the paper, check legibility, then crop, then mark**, so every crop shares the corrected paper and the mark sits in the same place on every crop.

1. Decode `b64_json` and keep it as the unmarked master.
1. **Strip bars** (`stripBars`, with the decision in the pure `detectBars(rows, cols)`). Models sometimes letterbox a render despite the prompt. Each edge row and column is reduced to its mean luma and standard deviation; a run of near-uniform dark lines from an edge (mean ≤ 0.12, std ≤ 0.04) is a bar and is cropped off. This must run before paper correction: with a bar in place, the bottom-right sample lands on the bar and the correction is skipped, which is how a cream render with letterbox bars got through. If the bars on either axis would take more than 20% of the frame, the candidate is rejected instead (the picture is mostly bar). The record `{ top, bottom, left, right }` goes into `proposed_actions`.
1. **Paper correction** (`correctPaper`, with the maths in the pure `paperGains(sampleRgb, targetHex)`). Sample the bottom-right 12% × 12% of the master (the canon keeps it empty; the mark is not on yet) and take the per-channel median. If the sample's luma is below 0.80, the corner holds drawing: skip, and record why. Otherwise gains = palette paper hex (fallback `#FAFAF8`) / sample, per channel, clamped to [0.90, 1.15], applied with `sharp().linear(gains, [0,0,0])`. The record `{ sample, gains, applied, reason }` goes into the `social_image_generated` activity's `proposed_actions`. The corrected master is the one stored.
1. **Legibility gate** (`legibility`, with the maths in the pure `inkCoverage(histogram)`). The master is downsized to 300px wide (phone-thumbnail scale) in greyscale; ink coverage is the share of pixels with luma below 0.75 (black and gold both count). Coverage outside **0.20–0.75** rejects the candidate: below, the image is mostly empty paper and vanishes in a feed; above, it is a dark mass with no shape. The coverage goes into `proposed_actions`. There is no automatic re-render: a rejected candidate is dropped like a failed render, and the founder can regenerate.
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
- `agent_activity`: `agent_name = 'charlie'` (already in the CHECK), `action = 'social_image_generated'`, `status = 'pending'`, `trigger_type = 'scheduled'`, `entity_type = 'content_item'`, and `proposed_actions` carrying the candidate set and index, `layout`, `subject`, `tension`, `model_id`, `cost_usd` and the paper correction. One row per candidate. When the reviewer ran, each row also carries `hook`, `review_fallback` and `review`: **every** concept the reviewer saw, with its scores, total, rank and outcome (`shortlisted`, `dropped` with the reason, or `not_shortlisted`), so the audit trail shows why an idea did not make it. A skip logs `action = 'social_image_skipped'` with the reason, so the quiet path is visible in the audit trail.
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
| `social_post.image_critic` | `workflow_step` | Image idea review | `editor` |
| `social_post.image_render` | `image_step` (new type) | Image render | none: env `OPENROUTER_IMAGE_MODEL`, else the bake-off default |

`image_step` is new because the existing resolver returns a `LanguageModelV4`. An image scope only needs a model id string. `/settings/models` shows `image_step` scopes with a picker filled from `GET /api/v1/images/models`, so only image-capable models can be chosen.

There is no Anthropic fallback for renders. The OpenRouter key-limit failover in `config/model.ts` applies to language models only. If OpenRouter is unavailable, the image step fails and the run carries on.

-----

## UI

### `/content/[id]`: image slot

Below the copy editor, for any item with `content_images`:

- Preview at the item's platform crop, mark included, with a 12px radius and a 1px border. No other decoration.
- **Alt text**: editable field. Saving sets `review_outcome = 'kept'`.
- The selected image's **tension** shows beneath it, and under that the reviewer's one-line **note** when there is one.
- **Other options**: the run's other candidates in their own row beneath, each with its tension (and the reviewer's note, when present) as a caption and a **Use this image** action. Choosing one selects its group on every draft that shares it and marks the others `not_chosen`.
- **Regenerate** runs a fresh brief and renders a fresh set of three, then marks the old set `regenerated`. It is labelled "Regenerate image" in sentence case. Without a recorded story, the brief works from the post alone.
- **Edit brief** opens a slide-over with one concept's fields (tension, symbol, twist, subject, layout, alt text), then "Render with this brief". The new image joins the run's set and is selected. The assembled prompt shows read-only beneath it in JetBrains Mono, so a founder can see exactly what was sent.
- **Remove image** sets `review_outcome = 'removed'` and deletes the rows and objects.
- **Use as style anchor** copies the **unmarked master** to `anchors/` and appends to `brand_visual.style_anchor_paths` (max 8 stored, 4 sent). It asks "Use this image to guide future images?" as a conversational confirm, per the design skill.
- Caption-style metadata line: `layout · model · canon v1.2 · $0.04` (v1.0 images show their motif instead of a layout).

Regenerate and edit-brief call the agents server, following the existing web → agents on-demand pattern. They log `agent_activity` with `trigger_type = 'manual'`.

Mobile: actions and candidates sit in their own rows (nothing hover-revealed), with tap targets of 44px or more, per the design skill's Mobile section. Checked at 375px and 320px.

### `/content/[id]/copy`: copy-out

Add **Download image**, which serves the platform's marked crop, with the alt text shown beside it and a copy button.

### `/brand`: new Visual tab

Next to Voice. Sections: Style, Palette (swatches with hex in mono), Composition, Prohibited (block + terms), Layouts (key, label, description, active; the retired motifs are hidden), Brand mark (enabled, size and margin, with a live preview on a sample crop), Style anchors (grid, with remove). Saving bumps `version` and asks "Save as v1.3?" (the next version). **Preview prompt** renders `buildImagePrompt` against a sample brief so edits can be checked without spending a render.

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
| Some concepts fail lint | They are dropped; the clean ones go to review, with no re-brief |
| Reviewer errors, returns a malformed critique, or drops every concept | Advisory: the top three clean concepts render in brief order; `review_fallback` is recorded and `review` is stored as null |
| No concept passes lint, twice | `skipped` with the flags as the reason |
| One candidate's render errors, times out or is refused | That candidate is dropped; the others are kept and the lowest success is selected |
| Every candidate's render fails | `failed`; nothing billed; drafts and email unaffected |
| Render has letterbox or pillarbox bars | Stripped before paper correction and recorded; if bars would take more than 20% of either axis, the candidate is rejected |
| Paper sample is not empty paper (luma < 0.80) | Correction skipped and recorded; the render is used as returned |
| Ink coverage at thumbnail size below 0.20 or above 0.75 | Candidate rejected and dropped, with the coverage recorded in a `social_image_rejected` activity; the others are kept. No automatic re-render. If every candidate is rejected, status is `failed` |
| Reference images unsupported by endpoint | Render prompt-only; noted in `proposed_actions` |
| Crop, mark composite or upload fails | `failed`; no partial `content_images` rows (insert only after all three objects upload). An unmarked image never reaches a founder. |
| Lex alt-text check errors | Fail-safe verdict (`general_advice`, "check unavailable"); image still persists with a chip |
| Every image path fails | Run still **succeeds**. Image failure never changes run status. |

-----

## Cost

About 180 renders a month (2 founders × 3 candidates a day × 30), from canon v1.1, unchanged in v1.2. Rejected candidates are billed: the gate runs after the render. For reference, OpenRouter's docs show a high-quality 16:9 render on a top-tier model at about US$0.13, which is about US$23 a month at that price. Cheaper models land well under that. Regenerations add to it. The brief and the idea review are one text call each, a fraction of a cent, against three renders. `cost_usd` per row makes the real figure a simple query, and the existing OpenRouter credits panel on the dashboard already shows spend.

-----

## Build sequence

The usual data layer → workflow → UI pattern, with an evidence step first.

**Step 0: Bake-off (dropped 2026-11-09; see Decisions).** A script, not a feature. Take 10 recent stories from `news_items` that already produced posts. Write briefs by hand (or run the brief prompt once), assemble prompts with canon v1.0, and render each on 3–4 candidate models: Gemini 2.5 Flash Image, `openai/gpt-image-2`, Seedream 4.5, and a Recraft model for its illustration styles. Run each render through the crop-and-mark step so the contact sheet shows what will actually be posted. Founders rank it on four criteria: reads as a confident sketch (not a doodle, not vector), on-palette, no clichés, looks like a set. Models vary most on the sketch criterion, so expect it to decide the result. The winner becomes the `image_render` default. The best 2–4 outputs become the first style anchors. Record results in `docs/features/social-post-image/bakeoff.md`.

**Session 1: Data layer.** `brand_visual` table + seed v1.0, `content_images` additive columns, RLS, regenerated types (which also removes the `as any` cast for `content_images`), `SocialPostFromNewsConfig` / `Result` type extensions, model scopes + the `image_step` type.

**Session 2: Pipeline.** `imageBrief.ts` (schema, prompt, linter, rewrite instruction), `imagePrompt.ts` (`buildImagePrompt`), `lib/openrouterImage.ts`, `imageCompose.ts` (crop, `markPlacement`, composite), upload, the persist step, and wiring into `runSocialPost` after the platform loop. Tests: snapshot of the assembled prompt, linter cases, a skip path, a render-failure path that still returns `success`, history-based motif rotation, the alt-text Lex fallback, and `markPlacement` at both crop sizes.

**Session 3: UI.** Image slot on `/content/[id]`, copy-out download, `/brand` Visual tab with prompt preview, full-width images in the email cards, `/settings/models` image picker.

Images are **on for both founders from launch**. Step 0 was dropped in favour of testing in production: the default render model stays as configured, and style anchors are promoted from real runs. Until then, images rest on the prompt alone.

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
| `.claude/skills/bts-design/README.md` | Imagery vibe: record that social post images use the linocut canon in `brand_visual` |
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
| 2026-11-09 | **Canon v1.2: linocut.** A bold two-colour print (black ink, one flat gold) on bright paper, one big subject filling 60–80% of the frame height, full-bleed. Replaces the v1.1 unfinished pencil sketch, whose images did not read at phone size. |
| 2026-11-09 | **A familiar symbol with one twist.** The brief names a symbol everyone knows and one visible change that ties it to the post, tested against the half-second phone test. The drawn/undrawn device is retired. |
| 2026-11-09 | **Stock-symbol ban lifted.** v1.1's 25 stock-symbol terms are removed from `prohibited_terms`. The v1.0 finance clichés and price-direction terms stay. The brief is told not to reuse a symbol from the last five runs. |
| 2026-11-09 | **Style anchors cleared.** v1.0 and v1.1 anchors are pencil sketches. The array is cleared; the objects stay in storage. |
| 2026-11-09 | **v1.1 layouts deactivated, four added.** `hero_left`, `close_crop`, `diagonal`, `against_gold`. Old layouts are kept inactive because older images reference them. |
| 2026-11-09 | **Bars stripped before paper correction.** Letterbox and pillarbox bars are cropped off; more than 20% of an axis rejects the candidate. |
| 2026-11-09 | **Legibility gate.** Ink coverage at thumbnail size must be 0.20–0.75, or the candidate is rejected. No vision-model QA and no automatic re-render. |
| 2026-11-09 | **The brief anchors on the post's hook; puns welcome.** The capital-buffers post got a balance scale and a closed farm gate: strong prints, both pictures of "regulation". The hook ("capital buffers") is what the post is about; a railway buffer stop says it in half a second. |
| 2026-11-09 | **Six ideas; the editor shortlists three before rendering.** A text-only review scores recognition, twist and hook, and the top three render, best first. Advisory: a failed review falls back to brief order. |
| 2026-11-09 | **Physics must read correctly.** The capital-buffers scale had its weighted pan sitting higher. The brief is told to get weight, balance, light, motion and water right, and the reviewer drops a concept that does not. |
| 2026-11-09 | **Bake-off dropped; tested in production.** Chris prefers to test live unless told otherwise for a given change. The default render model is unchanged; real runs are the evidence. Recorded as a standing preference in `CLAUDE.md`. |

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
| v1.2: bake-off of the new canon on candidate models, with a contact sheet | Not built | Chris asked to test in production instead (see Decisions, 2026-11-09). `openrouterImage.ts` is unchanged |
| v1.2: a new canon row | The migration updates the active row in place and bumps its version, guarded on the v1.1 style block so it never overwrites a founder's edits | Same as v1.1 |
| v1.2: symbol history | A pre-v1.2 image has no symbol; its subject stands in | So the last five runs still count from the first v1.2 run |
| v1.2: legibility rejections are logged | One `social_image_rejected` activity per run, listing each rejected candidate's index, reason and coverage | Rejections are invisible otherwise: a rejected candidate leaves no `content_images` row |

-----

## Open questions

1. **Email image delivery.** A signed URL (specced) expires after 7 days and depends on the mail client loading remote images. An inline attachment (CID, through JMAP) is permanent and always displays, but adds about 0.5–1 MB to each email. **Recommended default:** signed URL. Switch to inline if images regularly fail to show in your mail client.
