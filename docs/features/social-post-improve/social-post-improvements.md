# Proposal — Making Daily Social Posts Sound Less Like an AI

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** `social_post_from_news` (see `docs/daily-social-posts.md`)
**Status:** Proposal
**Last updated:** 2026-07-12

---

## Context

The daily social routine works. It picks a story, drafts LinkedIn and X copy in a founder's voice, runs compliance, and emails for review — with sane fallbacks throughout. The gap is quality: the drafts are competent but read as machine-written. This proposal targets that specific problem without disturbing the pipeline's structure. Every change slots between the editor pick (step 4) and Charlie's draft (step 5), or sits as a deterministic gate after it.

## Diagnosis

The "AI smell" is not mainly word choice — em-dashes and the like are a symptom, not the cause. Three root causes, in order of impact:

1. **Structural sameness.** `share_with_context` and `teach` are both the same skeleton: hook → context → tidy points → takeaway. Charlie reproduces that scaffold daily. Repeated structure is a louder tell than any single phrase.
2. **No memory across days.** Charlie drafts fresh each morning with no record of yesterday's copy, so he converges on the same openers and closers over time.
3. **Ungrounded generalisation.** Without concrete anchors, the model reaches for vague filler ("many Australian businesses are exploring…"). Vagueness is the strongest single signal of machine authorship.

Notably, we have already solved (2) and (3) elsewhere — in the news-email pipeline — and can reuse those patterns here.

---

## Primary proposals

### 1. Expand and rotate the `form` vocabulary

**What:** Grow beyond two forms to five or six, including shapes that deliberately lack the essay skeleton — a flat single observation, a contrarian one-liner with one supporting reason, a "small thing worth noting" fragment, a numbers-first post with no windup. Then bias the `editor` away from whichever forms it chose over the last few days.

**Why:** This is the highest-leverage change. Humans post shapes, not templates; varying the shape breaks the sameness that makes a feed feel automated.

**Where:** `form` enum + editor-selection prompt in `prompts.ts`; the recent-form check reads the account's last few `content_items`. Effort: prompt-layer, low.

### 2. Give Charlie anti-repetition memory

**What:** Before drafting, read that `social_account_id`'s last ~10 drafts, extract the opening lines, and pass Charlie a "you have opened with these — do not again; these phrases are banned" block. This is the banned-phrase gate from the news-email fix, pointed at social.

**Why:** Left unconstrained, the model settles into a handful of stock openers and closers. An explicit "don't repeat yourself" signal is cheap and directly attacks the day-to-day monotony.

**Where:** New helper reading `content_items` filtered by account; injected into `buildSocialPostPrompt`. Effort: low; one cheap read per run.

### 3. Anchor the draft in hard specifics

**What:** Run the two-stage extraction we built for the news email (entity, action, number, date, source) against the chosen story before Charlie writes, and require the post to reference at least one extracted specific.

**Why:** Grounding is the single biggest lever on "sounds like a person." A concrete number or name rounds off the vagueness the model otherwise defaults to.

**Where:** New extraction step between selection and generation, feeding `buildSocialPostPrompt`; reuse the news-email extraction schema. Effort: medium; reuses existing code.

---

## Supporting proposals

### 4. Retrieve voice for cadence, not just topic

Seeding the `@platform/voice` query purely on the story keeps pulling the same on-topic cluster, which homogenises rhythm even when vocabulary is right. Mix in a couple of exemplars retrieved for *shape* — how this founder opens, how they close — so Charlie borrows cadence, not only words. Effort: low; a second retrieval pass in the voice-resolution step.

### 5. A deterministic AI-tell linter

A pure function — no model call, in keeping with the deterministic-before-LLM principle — that scores a draft on em-dash density, rule-of-three lists, "not just X but Y" constructions, question-openers, stock phrases ("in today's landscape"), hedge-word count, and hashtag stuffing. Above a threshold, trigger a single rewrite pass carrying the specific flags. Because it fires only on offenders, there is no latency cost on clean drafts. Effort: low-to-medium; drop it beside `select.ts` as a pure module with its own test.

### 6. Permit short posts and opinions

Charlie defaults to a fully-developed LinkedIn essay because that is the safe median. A confident two-liner reads human precisely because it is unhedged. Vary the target length per day, and for Chris's voice specifically — builder and peer, self-deprecating — encode permission to *not* teach and to hold a view. The `teach` form is where the copy turns preachy; the self-deprecation is meant to brake that, so bake the brake into the form definition. Effort: prompt-layer, low.

---

## Recommended sequencing

1. **Forms (1) + anti-repetition memory (2)** — best ratio of effect to effort, both mostly prompt-layer.
2. **Specificity anchor (3)** — reuses the news-email extraction.
3. **AI-tell linter (5)** — the permanent backstop.

Proposals 4 and 6 can ride alongside as they touch adjacent code.

## Deliberately deferred

A dedicated voice-editor agent (as in the newsletter workflow) is tempting but held back for now. The linter-gated single rewrite in proposal 5 captures most of the benefit without adding a standing per-post model cost or latency to a routine that is currently a clean async handler. Revisit only if the linter proves insufficient.

## Out of scope

No change to the news pipeline, Rex's scoring, the compliance model, the approval philosophy (public content stays human-approved), or the `campaign_id`/`beat_id = NULL` daily-vs-campaign split. This proposal only enriches the context Charlie receives and adds one deterministic quality gate.
