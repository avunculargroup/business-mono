# UX Flow — Brand Hub: Editing Voice & Brand

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Brand Hub — company voice, per-account voice, asset management, visual-system boundary
**Status:** Draft
**Last updated:** 2026-06-04

-----

## Overview

Brand Hub is where founders manage the *content* side of brand — the **voice** that every agent writes in. It is deliberately **not** where the visual system is edited; that canon lives in the BTS design skill. This doc describes the journeys, states, and the one genuinely hard piece of interaction design here: making the **umbrella + override** relationship between company voice and per-account voice legible without confusing anyone.

The data behind it: a singleton `brand_voice` row (company canon) and one `social_accounts.voice_profile` per account, sharing an identical JSONB shape so a single form component serves both. (See `brand-voice-migration-spec.md` and `social-campaigns-spec.md`.)

The design problem in one sentence: *a founder editing “Chris on X” needs to see, at a glance, what that voice inherits from the company canon, what it overrides, and what it can’t override — without it feeling like configuring a build system.* Inheritance UIs go wrong when inherited and overridden values look identical, or when “reset to default” is hidden. This flow solves that with **ghosted inherited values, solid overrides, and an always-visible reset.**

### What this covers

- The Brand Hub information architecture
- The umbrella + override mental model and how it’s shown
- Flow: edit company voice
- Flow: edit an account voice (the inheritance case)
- Flow: add a new social account and its voice
- The shared voice form, field by field
- The preview / parity-check affordance
- States, validation, mobile behaviour
- The visual-system boundary signpost

### What this does not cover

- The visual system — governed by the BTS design skill, not edited in-app (a read-only signpost only)
- Voice resolution logic at generation time — that’s `packages/voice` in the migration spec
- Brand asset *files* beyond a light treatment (logos etc. — existing `brand_assets` behaviour)

-----

## Information Architecture

`/brand-hub` — three sections, presented as tabs on desktop, a stacked list on mobile:

1. **Voice** — the company voice and every account voice. The heart of this doc.
1. **Assets** — downloadable brand files (logos, wordmarks) from `brand_assets`. Light, mostly existing.
1. **Visual System** — a **read-only signpost**, not an editor (see final section).

The Voice tab opens on the **company voice** by default — it’s the canon, the thing everything else inherits from, so it earns the first position. Account voices sit beneath it as a list.

```
Brand Hub ▸ Voice
┌─────────────────────────────────────────────┐
│  Company Voice            [canon · v1.2]      │  ← always first
│  The umbrella every account inherits from     │
├─────────────────────────────────────────────┤
│  Account Voices                                │
│   • BTS — Company · LinkedIn                    │
│   • BTS — Company · X                            │
│   • Chris · LinkedIn        (3 overrides)       │
│   • Chris · X               (5 overrides)       │
│   • [Co-founder] · LinkedIn (inherits all)      │
└─────────────────────────────────────────────┘
```

Each account row shows an at-a-glance **override count** (“3 overrides” / “inherits all”) so a founder can see which voices have diverged from canon without opening each one.

-----

## The Mental Model: Umbrella + Override

This is the centrepiece. Every account voice is the company canon **plus** its own overrides. The UI makes three states visually distinct on every field:

|State         |Looks like                                                        |Meaning                                                   |
|--------------|------------------------------------------------------------------|----------------------------------------------------------|
|**Inherited** |Value shown **ghosted** (text-secondary), tagged `inherited`      |Comes straight from company canon; not set on this account|
|**Overridden**|Value shown **solid** (text-primary), small gold dot, `reset` link|Set specifically on this account; differs from canon      |
|**Locked**    |Value shown solid with a **lock icon**, no reset                  |Company-level rule the account cannot remove (see below)  |

**Two non-overridable rules**, surfaced as locked everywhere:

- **Bitcoin capitalisation rule** — always on, never removable. `Bitcoin` (network) vs `bitcoin` (unit). Shown locked on every voice, company and account alike.
- **`vocabulary_avoid` is unioned, not replaced** — a word the company bans stays banned on every account. In an account’s avoid-list, company-banned chips appear **locked** (can’t be deleted here) and the account can *add* its own on top. This prevents an account voice quietly un-banning “to the moon.”

The principle, stated in the UI itself via a one-line helper at the top of any account voice: *“This voice inherits from Company Voice. Edit a field to override it for this account; banned words and the Bitcoin rule always carry through.”* Calm, one sentence, dismissable.

-----

## Flow 1 — Edit Company Voice

The canonical case. Read-only by default (matching the `company_profile` pattern), unlocked to edit.

1. **Land.** Brand Hub ▸ Voice opens on Company Voice in **read view** — a clean rendered summary: persona paragraph, tone attributes as chips, the two vocabulary lists, signature devices, format notes, a **snippets panel** (the exemplar library, below), and the version (`v1.2`) in `JetBrains Mono`. No edit affordances visible — it reads like a brand document, not a form.
1. **Unlock.** A single **Edit voice** button (gold, top-right). Fields become editable in place; the button becomes **Save** + **Cancel**.
1. **Edit.** Founder works the shared voice form (next section). Chip fields add/remove inline; text fields expand.
1. **Preview (optional).** A **Preview voice** affordance generates a short sample post in this voice so the founder sees the effect before committing (the parity-check, below).
1. **Save.** On save: validate (soft), bump `version` (auto-increment patch, or a “minor/major” choice on a dropdown for deliberate bumps), write `updated_by`/`updated_at`, return to read view. A quiet success toast — no fanfare.
1. **Ripple awareness.** Because accounts *inherit* unset fields, editing the company canon changes every account that inherits that field. The save confirmation names this plainly: *“Saved. This updates 4 account voices that inherit these fields.”* — so the ripple is never a surprise.

-----

## Flow 2 — Edit an Account Voice (the inheritance case)

The harder journey, because of inheritance.

1. **Land.** Tap an account row (e.g. *Chris · X*). Opens in read view showing the **resolved** voice — what this account actually sounds like once canon + overrides are merged — with each field tagged `inherited` / `overridden` / `locked` per the model above.
1. **Unlock.** **Edit voice** → fields editable.
1. **The inheritance interaction:**
- An **inherited** field shows the ghosted company value. The founder can start typing / adding chips — the moment they do, the field flips to **overridden** (solid, gold dot, `reset` link appears). It now stores a value on this account’s `voice_profile`.
- **Reset** on an overridden field clears the account value and reverts to ghosted inherited — a one-tap undo of a divergence.
- **Locked** items (company-banned avoid-words, Bitcoin rule) can’t be removed; the account can only add alongside them.
1. **Preview.** Same parity affordance — generate a sample in *this account’s* resolved voice, so Chris-on-X reads punchy where the company voice reads measured.
1. **Save.** Writes only the **overridden** fields to `voice_profile` (inherited fields stay empty on the account, so future canon edits still flow through). Version is account-scoped if we choose to version account voices (open question — see migration spec); otherwise just `updated_at`.

**Why store only overrides, not a full copy:** if an account copied the whole canon at edit time, a later company-voice improvement would never reach it. Storing only the deltas keeps inheritance live. The UI’s ghosting is the visible expression of this — ghosted = “still wired to canon.”

-----

## Flow 3 — Add a New Social Account + Voice

1. From Brand Hub ▸ Voice (or the campaigns Accounts tab — same destination), **Add account**.
1. **Account details:** platform (`linkedin` / `twitter_x`), type (`company` / `founder`), display name, handle, profile URL, and — for founder accounts — link to a `team_member`.
1. **Voice:** the new account starts **inheriting everything** from company canon (the friendliest default — a usable voice from moment one). The voice form shows entirely ghosted values with the helper line. The founder overrides only what makes this account distinct.
1. **Save.** Creates the `social_accounts` row with a `voice_profile` containing only whatever was overridden (often nothing at first).

This means a newly added founder account is immediately writable-against — it sounds like the company until the founder shapes it — rather than starting blank and broken.

-----

## The Shared Voice Form

One component, used for company canon and account voices alike. Friendly throughout — **never raw JSON** (founders editing JSON is how voices silently break).

|Field                           |Control                   |Notes                                                                                                                      |
|--------------------------------|--------------------------|---------------------------------------------------------------------------------------------------------------------------|
|**Persona**                     |Multi-line text           |One short paragraph. Placeholder shows a good example.                                                                     |
|**Tone attributes**             |Chip input                |Add/remove; type-and-enter. e.g. `calm`, `plain-spoken`.                                                                   |
|**Vocabulary — use**            |Chip input                |Words/phrases to favour.                                                                                                   |
|**Vocabulary — avoid**          |Chip input                |On accounts: company-banned chips render **locked**; founder adds more.                                                    |
|**Signature devices**           |Chip or short-line list   |e.g. “opens with a number”, “ends with a question”.                                                                        |
|**Format notes**                |Multi-line text           |Platform-shaping notes.                                                                                                    |
|**Example posts** → **Snippets**|Linked snippets panel     |Replaced the old paste-in field. Exemplars now live in the `voice_snippets` library — see the Snippets Panel section below.|
|**Bitcoin capitalisation rule** |Locked, always-on reminder|Editable text but flagged “enforced across all output”.                                                                    |
|**Version**                     |Display + bump control    |`JetBrains Mono`. Company voice only (account versioning is an open question).                                             |

Interaction detail that matters: **chips, not commas.** A `vocabulary_avoid` field that’s a comma-string invites “to the moon, HODL” pasted as one chip. Discrete chips make each banned term a real, removable (or locked) object — which is what the union logic needs.

-----

## The Snippets Panel — exemplar library

The exemplar library is where voice gets *shown* rather than described, and it’s the highest-leverage thing a founder can curate — concrete examples drive on-voice generation far harder than tone adjectives. It backs the `voice_snippets` table and follows the same **umbrella + override** model as everything else here: company-canon snippets (`social_account_id = NULL`) appear on every voice; account snippets are specific to one account.

### On a voice (read & edit)

Each voice — company or account — has a **Snippets** panel. In read view it’s a scannable list; in edit view it gains add/star/edit controls.

```
Snippets                                   [+ Add snippet]
┌──────────────────────────────────────────────────────┐
│ ★ opener · X · #volatility            inherited(canon)  │
│   "Your balance sheet doesn't care about a bad week."   │
│   note: leads with the reframe, not the asset           │
├──────────────────────────────────────────────────────┤
│   full_post · LinkedIn · #custody          this account │
│   "When a CFO asks me about custody, the first…"        │
│   note: the measured, walk-through register that works  │
│   on LinkedIn                          [edit] [★] [↓note]│
└──────────────────────────────────────────────────────┘
   Filter: [type ▾] [platform ▾] [topic ▾] [★ starred]
```

Each row shows: a **star** toggle (best-of-the-best), the **type** chip (`opener`, `full_post`, `cta`…), **platform** and **topic tags**, the snippet **body**, and the **curator note** — collapsible, because the note is the teaching content and deserves room when you want it. On an account voice, canon snippets are tagged `inherited (canon)` and are **read-only here** (edit them on the company voice); the account’s own snippets are editable. Same ghosting logic as the voice fields — inheritance stays visible.

### Adding a snippet

A small form: paste the **body**, pick a **type**, set **platform** (or “any”), add **topic tags**, and — required, because it’s the point — write the **curator note** (*why does this demonstrate the voice?*). On save, the embedding generates in the background; the snippet is immediately available to agents. No draft/publish gate — a snippet exists to be used the moment it’s saved.

### The promote-from-post loop

This is the loop that makes the library grow itself from what actually worked, closing back to the campaigns metrics:

1. On any **published** post (in the campaign view or content pipeline) that performed well — visible via its `post_metrics` — a **“Save to voice snippets”** action appears.
1. Tapping it opens the add-snippet form **pre-filled**: body from the post, platform and account inferred, `source = promoted_from_post`, `source_content_item_id` linked. Type defaults to `full_post` (editable — a founder might promote just the opener).
1. The founder writes the **curator note** — the one thing that can’t be auto-filled, because *why it worked* is human judgement — and saves.
1. The snippet now feeds future generation for that voice (and, if scoped to canon, every voice).

The result: a high-performing post becomes a permanent teaching example with one action and one sentence of judgement. The library compounds — each campaign leaves the next one better exemplars to write from. (This is the resolved version of what was previously a vague “example-post sourcing” open question.)

### Where snippets surface for the founder elsewhere

- In the **Preview** affordance (below), the sample is generated using the retrieved snippets — so a founder can see the exemplars *doing their job*.
- In the **variant editor** (campaigns feature), a small “exemplars used” disclosure can show which snippets informed a draft — useful when a post feels off and the founder wants to see what it was anchored to. (Optional; flagged in that spec.)

-----

## Preview / Parity Check

The affordance that makes voice editing feel safe, and doubles as the migration’s parity gate.

- A **Preview voice** button on any voice (company or account) sends the resolved voice **and its retrieved snippets** to a lightweight generation call and returns **one short sample post** rendered in the platform-mimic preview chrome (the same component the variant editor uses).
- For an account voice, the sample uses *that account’s* platform and resolved voice — so the founder literally sees Chris-on-X vs the company-on-LinkedIn difference before saving.
- During the migration (per `brand-voice-migration-spec.md`), this same preview is how output parity is confirmed before `brand-voice.md` is retired: generate a sample from the table-sourced voice, eyeball it against what the doc produced.

Kept deliberately small — one sample, fast, disposable. Not a content studio; a sanity check.

-----

## States, Validation & Feedback

- **Read-by-default.** Voices open read-only; editing is a deliberate unlock. Protects canon from accidental edits.
- **Validation is soft.** A voice is “valid” with at least a persona and one tone attribute; everything else is optional. No hard gates — a thin voice is a usable voice. Warn, don’t block.
- **Unsaved-changes guard.** Navigating away mid-edit prompts to save or discard. Voice edits are the kind of thing you don’t want to lose to a stray back-swipe on mobile.
- **Save feedback.** Quiet success toast. For company voice, the ripple note (“updates N inheriting accounts”). No modal celebrations — this is a serious tool.
- **Loading.** Skeleton screens in surface-subtle, per the design system — not spinners.

-----

## Mobile Behaviour

The whole of Brand Hub must work on a phone (Chris works on the go).

- Tabs collapse to a **stacked section list**; tap to drill in, back to return.
- The voice form is **single-column** — chip inputs and text areas stack naturally and are touch-friendly.
- Inheritance tags (`inherited` / `overridden` / `locked`) stay visible on mobile — they’re small chips, not hover-only states, so the model survives the small screen. (Hover-only inheritance cues would vanish on touch — a common inheritance-UI failure.)
- Preview renders the sample post below the form rather than beside it.
- The unsaved-changes guard matters more here, given accidental navigation.

-----

## Visual System Boundary — the Signpost

The **Visual System** tab is a **read-only signpost**, deliberately not an editor. It exists so nobody opens Brand Hub looking for a colour picker, finds nothing, and assumes it’s missing.

It shows, read-only: the palette swatches, type stack (Playfair / DM Sans / JetBrains Mono), and a one-line statement — *“The visual system is governed by the BTS design skill, the canonical source for colour, type, spacing, and components. It’s applied at design and build time, not edited here.”* — with a pointer to the skill.

This closes the loop on the earlier correction: voice is editable in-app because founders own it and need no-redeploy changes; the visual system is governed by the skill because it’s worked by designers and agents at build time. The signpost makes that division of labour visible rather than implicit, so the absence of visual editing reads as *intentional*, not broken.

-----

## Open Questions

- **Account-voice versioning:** Company voice carries a `version`. Do account voices need their own version string, or is `updated_at` enough? Leaning `updated_at` only — account voices are deltas, not standalone canon. (Mirrors the migration spec’s deferred-history question.)
- **Bulk override view:** With several founder accounts, a founder may want one screen showing *every* override across all accounts (“where has anyone diverged from canon?”). Nice-to-have; defer until there are enough accounts to warrant it.
- **Snippet panel density on mobile:** The snippets list with collapsible curator notes is comfortable on desktop; on a phone, decide whether notes default collapsed and whether filters live behind a sheet. Lean collapsed-by-default on mobile.
- **Asset tab scope:** This doc treats brand *files* (logos) lightly. If asset management needs real workflow (versioned logos, usage guidance), it warrants its own short flow. Out of scope here.