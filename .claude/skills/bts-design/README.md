# BTS Design System

**Company:** Bitcoin Treasury Solutions (BTS) — Australia's dedicated, all-in-one Bitcoin business hub
**Product:** Internal operations platform (codename `business-mono`) — Next.js web app that sits on top of Supabase + a Mastra AI agent layer
**Audience:** Two founders running a Bitcoin treasury consulting business; daily-driver internal tool, not a public product

This design system captures the visual and content foundations of the BTS internal platform so they can be re-used when mocking, prototyping, or shipping anything that should *feel like* BTS.

---

## Sources

- **Repo:** `avunculargroup/business-mono` (branch `main`)
- **Design authority:** [`docs/DESIGN_BRIEF.md`](https://github.com/avunculargroup/business-mono/blob/main/docs/DESIGN_BRIEF.md) — colours, typography, components, tokens, IA
- **Voice authority:** [`docs/brand-voice.md`](https://github.com/avunculargroup/business-mono/blob/main/docs/brand-voice.md) — tone, terminology, Bitcoin stance
- **Implementation:** `apps/web/app/globals.css` (CSS tokens), `apps/web/components/*` (React components)
- **Logo source:** `apps/web/components/app-shell/BtsLogo.tsx`

No public marketing site was part of the scope — this system is the *internal* platform.

---

## What this platform is

An internal, human-in-the-loop operations platform for BTS. A central agent (Simon) and specialists (Recorder, Archivist, PM, BA, Content Creator, Researcher, Della) propose actions; the two founders approve, reject, or clarify them through the web UI. The design job is to get out of the way — clarity beats beauty, speed beats delight.

The aesthetic borrows from Linear and Raycast (functional precision) more than editorial warmth: "the private dashboard of a fund manager who has excellent taste and no patience for clutter."

---

## Personality

**Primary traits:** Focused, Trustworthy
**Secondary traits:** Calm, Precise, Quietly confident

The interface should feel like a highly organised colleague who has already done the prep work. It doesn't draw attention to itself. It makes the human feel **competent, not assisted**.

**Never:**
- Generic admin panel / CRUD dashboard (no Bootstrap tables, no grey sidebars, no blue link underlines)
- Crypto-native or hype-adjacent (no dark mode default, no neon, no motion-heavy UI)
- Bloated SaaS (no purple gradients, no confetti, no growth-hacking micro-interactions)
- Cold or robotic — especially in agent output surfaces, which should feel collaborative

---

## Content fundamentals

**How copy is written.** Plain, confident, pragmatic. Authoritative, warm, never flashy. The "dinner party voice" is the quietly confident guest who listens first, then explains clearly. Dry humour is welcome but rare — it's there to connect, never to show off.

**Person.** "We" for the company; "you" for the reader. Never "I".

**Casing.** Sentence case for everything — headings, buttons, labels, nav items. Never Title Case. Never UPPERCASE except for the small-caps caption style (11px, letter-spacing 0.04em) used for section labels and table headers.

**Punctuation.** No exclamation marks in UI copy. Ever. Oxford comma optional, follow surrounding copy. Em dashes used freely in prose for rhythm. Australian English ("organised", "colour", "analyse").

**Action labels are specific and outcome-oriented.**
- ✅ "Add contact", "Mark complete", "Review allocation strategy"
- ❌ "Create", "Done", "Continue", "Submit"

**Approval prompts are conversational.** "Does this look right?" not "Confirm action". Approvals accept free text — "yeah go ahead", "looks good", "do it" are all valid signals.

**Empty states are helpful, not cutesy.** "No tasks yet" + what to do next. Never "Nothing here" or a shruggy emoji.

**Error messages explain what happened and what to do.** Never "Something went wrong" on its own.

**Emoji.** Comfortable on social media. **Never in emails, newsletters, or in-app UI copy.** The platform UI uses Lucide icons, not emoji.

**Bitcoin terminology.**
- Capital **B** "Bitcoin" for the network/protocol. Lowercase **b** "bitcoin" for the currency/unit. Example: "The Bitcoin network secures your bitcoin holdings."
- Never "crypto", "cryptocurrency", "digital assets" (unless strict compliance context), "HODL", "to the moon", "diamond hands", "bag", "whale".
- "Bitcoin treasury strategy" or "reserve management", never "investment strategy".
- "Strategic reserve asset", never "speculative investment".
- "Resilience", "preservation", "informed risk management" — emphasise these over returns.

**Voice calibration snippet (from `brand-voice.md`):**
> "Bitcoin's basically math that refuses to print more of itself, unlike some central banks."

That's the dry humour ceiling. Anything punchier is off-brand.

---

## Visual foundations

**Mood:** warm off-white paper, near-black ink, a single gold accent used so sparingly it retains signal value. Dense but spacious. Editorial serif for identity, geometric sans for density. Light mode by default — dark mode is explicitly off-brand.

### Palette

A three-layer system:

1. **Neutrals** — a warm, paper-toned greyscale (`#FAFAF8` → `#1A1915`). Never pure white, never pure black.
2. **Accent (gold, singular)** — `#C9A84C` base, `#F0E4C0` light, `#9A7A2E` dark. Reads as BTS gold, *not* Bitcoin orange.
3. **Semantic** — success `#3D7A5E`, warning `#B8860B`, destructive `#B04040`. Used for state only.

All tokens in `colors_and_type.css`. **Never hard-code hex values in component code** — always go through `--color-*` CSS custom properties.

### Typography

| Role | Family | Scale |
|---|---|---|
| Display / H1–H2 | **Playfair Display** serif 600 | 28 / 20 px |
| Body / UI / H3–H4 | **DM Sans** 400–600 | 11 / 13 / 14 / 15 / 16 px |
| Data / numerics | **JetBrains Mono** 400 | 12–14 px |

Display-size text (48px+) is explicitly off-brand — Playfair appears at H1–H2, never hero scale. Body stays in the sans for density at small sizes. Never mix two serifs or two sans-serifs.

### Spacing & layout

- 4px base unit. Scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 / 80`.
- Card padding `20px` (tighter than a public product). Content area padding `32px`.
- Sidebar `240px` expanded, `64px` icon-only below `md` (768px).
- Max content width `1200px`, centred.
- **Whitespace is a feature** — resist the urge to fill every column.

### Backgrounds

- **No** full-bleed imagery, **no** hero photography, **no** repeating patterns, **no** gradients on surfaces.
- Backgrounds are flat, warm neutrals: `--color-bg` for pages, `--color-surface` for cards, `--color-surface-subtle` for sidebar and input backgrounds.
- Gradient usage is limited to the logo mark (gold vertical gradient, `#C8A659 → #916024`). Never on buttons, cards, or page backgrounds.

### Borders & corner radii

- Borders are 1px, always `--color-border` (`#E8E6E0` warm grey).
- Radii: `4px` badges/chips · `6px` inputs · `8px` buttons · `12px` cards/panels/modals.
- **No pill shapes** except for status badges. No heavy drop-borders or double-borders.

### Shadows

Warm (tinted with `rgba(26, 25, 21, ...)`, not cool grey). Three levels:

- `--shadow-sm` — default for resting cards.
- `--shadow-md` — modals, floating elements.
- `--shadow-lg` — sparingly.

### Animation & hover states

- **Subtle and purposeful** — this is a productivity tool, not a product demo.
- Page/section transitions: simple fade, `150ms ease`.
- Card hover lift: `translateY(-1px)` + shadow bump to `--shadow-md`, `200ms ease`.
- Button press: `scale(0.98)`, `100ms ease`.
- Sidebar collapse: `200ms ease-in-out`.
- Modal enter: fade + `translateY(8px → 0)`, `200ms ease-out`.
- **No bouncy, elastic, or decorative animation.** No confetti. No celebratory micro-interactions.
- Always respect `prefers-reduced-motion`.

### Hover / press treatment

| State | Treatment |
|---|---|
| Button hover | darker fill (`--color-accent-hover` for primary; `--color-surface-subtle` for secondary/ghost) |
| Card hover (interactive) | `translateY(-1px)` + shadow lift |
| Nav item hover | `--color-surface-hover` background + text shift to `--color-text-primary` |
| Nav item active | `--color-accent-subtle` background + 3px `--color-accent` **left** border + text shift to `--color-accent-hover` |
| Button press | `scale(0.98)`, 100ms |
| Focus | 2px `--color-focus-ring` (gold) outline, 2px offset — never removed |

### Transparency & blur

Rarely used. Backdrop blur only appears on the mobile "More" sheet backdrop (`rgba(26, 25, 21, 0.4)` scrim, no blur). No glassmorphism. No frosted panels.

### Imagery vibe

There is **no stock photography** in this product. No hero images, no finance clichés (gold bars, bitcoin coins, rising chart illustrations). If illustration is ever needed for empty states or onboarding: simple line art in the warm palette, not playful or cartoon. Warm tone, never cool or grainy.

### Cards

- `--color-surface` background, 1px `--color-border`, `12px` radius, `--shadow-sm` default.
- On hover (if interactive): `--shadow-md` + `translateY(-1px)`. No lift on non-interactive cards.
- Agent activity cards add a 3px **left border** in a state colour (`--color-warning` pending / `--color-success` approved / `--color-destructive` rejected).

### Fixed / sticky elements

- Sidebar: fixed left, full height, 240px wide.
- Page header: sticky top, 64px tall, surface background, bottom border.
- Content area: scrolls independently of sidebar.

---

## Iconography

**Library: [Lucide](https://lucide.dev/)** — consistent throughout, no mixing with other icon sets.

- **Stroke width: 1.5** — refined, never heavy. This is the single most important icon rule.
- **Sizes:**
  - `16px` inline / in-button
  - `18px` sidebar navigation
  - `20px` feature actions
  - `24px` section headers
  - `48px` empty states

**Usage rules:**

- Icon-only buttons **must** have `aria-label` and a tooltip on hover.
- Agent identity icons stay in the Lucide family (e.g. `Bot` for Simon). Don't pull mascots or bespoke marks.
- **No emoji** anywhere in the UI. No unicode pictographs as icons.
- **No inline-drawn decorative SVGs** for content imagery. The only bespoke SVG in the system is the BTS logo mark.
- If a needed glyph is missing from Lucide, substitute the closest match and flag it — don't mix in Heroicons, Phosphor, Font Awesome, etc.

Lucide is loaded from CDN in the preview cards (`https://unpkg.com/lucide@latest`) so no font file ships with the system. In production it's installed as an npm dependency (`lucide-react`).

Logo assets live in [`assets/`](./assets/):
- `assets/bts-logo.svg` — full mark with gold gradient (used in sidebar, headers, loading states).

---

## File index

```
BTS Design System/
├── README.md                    This file
├── SKILL.md                     Agent skill manifest (Claude Code compatible)
├── colors_and_type.css          CSS custom properties + base element styles
├── assets/
│   └── bts-logo.svg             BTS logo mark with gold gradient
├── fonts/                       (Webfonts loaded via Google Fonts — see note below)
├── preview/                     Design System tab cards (typography, colors, components)
│   ├── type-display.html
│   ├── type-body.html
│   ├── type-mono.html
│   ├── type-scale.html
│   ├── colors-neutrals.html
│   ├── colors-accent.html
│   ├── colors-semantic.html
│   ├── colors-agent.html
│   ├── stage-chips.html
│   ├── spacing.html
│   ├── radii.html
│   ├── shadows.html
│   ├── buttons.html
│   ├── inputs.html
│   ├── cards.html
│   ├── nav-item.html
│   ├── agent-activity-card.html
│   └── logo.html
└── ui_kits/
    └── platform/                Internal platform UI kit
        ├── README.md
        ├── index.html           Interactive click-thru prototype
        ├── Sidebar.jsx
        ├── PageHeader.jsx
        ├── AgentActivityCard.jsx
        ├── Button.jsx
        ├── Card.jsx
        ├── Input.jsx
        ├── StageChip.jsx
        ├── DataTable.jsx
        ├── EmptyState.jsx
        └── screens/
            ├── Dashboard.jsx
            ├── AgentActivity.jsx
            ├── ContactsList.jsx
            └── ContactDetail.jsx
```

### Fonts

**No TTF/WOFF files are shipped.** The design system references Playfair Display, DM Sans, and JetBrains Mono by name and loads them from Google Fonts via `@import` in `colors_and_type.css`. All three are the canonical Google Fonts versions — this matches what `apps/web` uses in production.

> ⚠️ If you'd prefer self-hosted `.woff2` files for production resilience, drop them in `fonts/` and swap the `@import` at the top of `colors_and_type.css` for a `@font-face` block.

---

## Products covered

The `business-mono` monorepo contains one user-facing product: the internal **platform** web app (`apps/web`). The design system therefore ships a single UI kit, [`ui_kits/platform`](./ui_kits/platform/), which recreates the primary surfaces:

- App shell (sidebar + page header + content area)
- Dashboard
- Agent Activity feed (the platform's signature surface)
- CRM list + detail

The other app in the monorepo (`apps/agents`) is a headless Mastra server with no UI — out of scope.
