# BTS Design System — Claude Code Handoff

This folder is a **drop-in Claude Code skill** plus all the supporting files. Copy the contents into your repo and Claude Code will be able to design and build UI that matches BTS automatically.

---

## What's in this bundle

```
design_handoff_bts_design_system/
├── HANDOFF_README.md                ← you are here
├── SKILL.md                         ← Claude Code auto-loads this
├── README.md                        ← full brand / voice / visual guide
├── colors_and_type.css              ← CSS tokens (colors, type, spacing, radii, shadows, motion)
├── assets/
│   └── bts-logo.svg                 ← gold-gradient mark
├── preview/                         ← design-system cards (colors, type, components)
└── ui_kits/platform/                ← React/JSX component source + interactive demo
    ├── Primitives.jsx               ← Icon, Button, Card, Input, StageChip, AgentBadge, EmptyState
    ├── Shell.jsx                    ← Sidebar, PageHeader
    ├── Surfaces.jsx                 ← AgentActivityCard, DataTable
    ├── Screens.jsx                  ← Dashboard, AgentActivity, ContactsList, ContactDetail
    └── index.html                   ← click-through demo wiring them together
```

---

## Installation (two options)

### Option A — Install as a Claude Code skill (recommended)

From your repo root:

```bash
mkdir -p .claude/skills/bts-design
cp -R design_handoff_bts_design_system/* .claude/skills/bts-design/
```

That's it. Claude Code will auto-discover the skill via its `SKILL.md` front-matter. Test it:

```
> use the bts-design skill and build me a new Simon chat view
```

Claude will load the skill, read the tokens, and match the existing voice and visuals.

### Option B — Drop it in as repo docs

If you don't want the skill layer, put the folder wherever (e.g. `docs/design-system/`) and add one line to your repo-level `CLAUDE.md`:

```md
Design system lives in `docs/design-system/`. Read `SKILL.md` first before touching UI.
```

---

## About the files in this bundle

These files are a **working design system**, not a feature mock. Specifically:

- **`colors_and_type.css` is production-ready** — it's a near-exact mirror of `apps/web/app/globals.css` in `business-mono`, with a couple of additional semantic tokens (agent state surfaces, stage chip colors) pulled up from the design brief. You can import it directly or port the `:root` block into your existing global stylesheet.
- **The JSX components are references, not production code.** They're cosmetically accurate but use inline styles + mocked data so the preview can run standalone in a browser. When implementing, rebuild them in your actual stack (Next.js + CSS Modules, which is what `apps/web` already uses) and wire them to Supabase / Mastra for real.
- **The `preview/` cards are design-system documentation**, not app UI. They're the swatches and specimens that render in the Design System tab. Use them to settle a color question or remind yourself of spacing rules.

---

## Fidelity

**High-fidelity.** Colors, type, spacing, radii, shadows, and motion tokens are exact. Component layouts match the brief and the existing component CSS. Content/copy in the demo matches the voice rules in `README.md` → Content Fundamentals.

The only deliberate gaps:
- **Icons** — 16 inline Lucide-style SVGs in `Primitives.jsx`; your production code should use the real `lucide-react` package (already a dep in `business-mono`).
- **Fonts** — loaded from Google Fonts. `apps/web` already does this; no change needed.
- **Data** — all mocked. The demo is non-destructive.

---

## Design tokens (quick reference)

All tokens live in `colors_and_type.css` under `:root`. These are the values:

### Colors
```
--color-bg:             #FAFAF8   /* warm off-white page */
--color-surface:        #FFFFFF   /* cards */
--color-surface-subtle: #F4F4F1   /* sidebar, inputs, table headers */
--color-border:         #E8E6E0   /* 1px borders everywhere */
--color-text-primary:   #1A1915   /* near-black, never pure black */
--color-text-secondary: #6B6860
--color-text-tertiary:  #9E9C96

--color-accent-base:    #C9A84C   /* BTS gold — CTAs, active nav, signal moments */
--color-accent-light:   #F0E4C0
--color-accent-dark:    #9A7A2E

--color-success:        #3D7A5E
--color-warning:        #B8860B
--color-destructive:    #B04040
```

### Type
```
--font-display: 'Playfair Display', serif         /* H1 (28) / H2 (20) only */
--font-body:    'DM Sans', sans-serif             /* everything else */
--font-mono:    'JetBrains Mono', monospace       /* numerics, timestamps */
```

Scale: 11 / 13 / 15 / 16 / 20 / 28 px. No display-size (48+) text.

### Spacing
4px base. Steps: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 / 80.

### Radii
4 (chips) · 6 (inputs) · 8 (buttons) · 12 (cards).

### Shadows
Three levels, all warm-tinted with `rgba(26, 25, 21, ...)` — never cool grey.

### Motion
100ms fast · 200ms base · 300ms slow. No bouncy, elastic, or decorative animation.

---

## Voice cheat-sheet (full rules in `README.md`)

- Sentence case. No Title Case, no exclamation marks.
- "We" for the company. "You" for the reader. Never "I".
- Capital **B** Bitcoin (network). Lowercase **b** bitcoin (currency).
- Never "crypto", "digital assets", "HODL", "bag".
- "Resilience", "preservation", "informed risk management" > "returns".
- Action labels are specific outcomes ("Add contact" not "Create").
- Empty states are helpful ("No tasks yet" + next step), not cute.
- No emoji in UI copy. Ever.
- Australian English.

---

## Integration with `business-mono`

If you're dropping this into the existing repo, no migration is needed — `apps/web/app/globals.css` is already the source of truth and matches `colors_and_type.css` here. The skill exists so Claude Code can pick up on:

1. **Voice rules** (tone, terminology, Bitcoin stance) that aren't encoded in CSS.
2. **Visual rules** ("never neon", "no hero imagery", "Playfair never at hero scale") that aren't obvious from tokens.
3. **Component patterns** (agent activity card signature, sidebar active state with left-border, 12px card radius) that are easier to recall than to re-derive.

The skill is a thin cognitive layer over the code you already have.

---

## Next steps

1. Copy the folder into `.claude/skills/bts-design/` as shown above.
2. Try prompting Claude Code: `use bts-design to build a Simon chat view with suggested replies`.
3. If anything's missing (Simon chat, Tasks list, Projects detail, Settings, a marketing site) come back to the design workspace and we'll add it.
