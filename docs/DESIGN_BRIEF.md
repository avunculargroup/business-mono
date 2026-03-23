# Design Brief — BTS Internal Platform

**Company:** Bitcoin Treasury Solutions (BTS)  
**Platform:** Internal Operations Platform  
**Audience:** Internal team only (founders)  
**Version:** 1.0

-----

## What This Is

This is the design specification for the BTS internal web interface — the Next.js frontend that sits on top of the Supabase database and Mastra agent layer. It is not a public product. It is the daily operational environment for two people running a Bitcoin treasury consulting business.

The design job here is different from a marketing or public-facing product. The goal is not to impress — it’s to get out of the way. Every screen should help a founder move faster, trust what the AI agents have done, and make a decision with confidence. Clarity beats beauty. Speed beats delight. Though ideally, it’s both.

-----

## Brand Essence

This platform is an internal tool that carries the BTS identity — not because clients will see it, but because the founders live in it every day. A tool that looks and feels considered signals that the business it runs is considered too.

The aesthetic borrows from the BTS brand: warm, authoritative, never flashy. But it leans harder into the functional precision of tools like Linear and Raycast than the editorial warmth of a public-facing product. Think: the private dashboard of a fund manager who has excellent taste and no patience for clutter.

The platform handles CRM, tasks, content, brand assets, and AI agent workflows. The agent layer (Simon and the specialist agents) surfaces data and proposed actions into this UI for human review. The design must make that human-in-the-loop moment feel natural, fast, and trustworthy — not bureaucratic.

-----

## Personality

**Primary traits:** Focused, Trustworthy  
**Secondary traits:** Calm, Precise, Quietly confident

The interface should feel like a highly organised colleague who has already done the prep work and is presenting it clearly. It doesn’t draw attention to itself. It makes the human feel competent, not assisted.

**What it should never feel like:**

- A generic admin panel or CRUD dashboard (no Bootstrap tables, no grey sidebars, no blue link underlines)
- Crypto-native or hype-adjacent (no dark mode by default, no neon, no motion-heavy UI)
- Bloated SaaS (no purple gradients, no confetti on task completion, no growth-hacking micro-interactions)
- Cold or robotic — particularly in agent output surfaces, which should feel collaborative, not automated

-----

## Information Architecture

The platform maps to these primary areas, which should inform navigation and component design:

|Section           |Description                                                           |Key views                           |
|------------------|----------------------------------------------------------------------|------------------------------------|
|**Dashboard**     |Daily summary — open tasks, recent agent activity, upcoming follow-ups|At-a-glance, not a KPI wall         |
|**CRM**           |Companies and contacts, pipeline stages, interaction history          |List, detail, interaction timeline  |
|**Tasks**         |Team tasks, linked to contacts or projects, agent-created or manual   |Kanban or list, filtered by assignee|
|**Projects**      |Named initiatives with linked tasks and companies                     |List, detail                        |
|**Content**       |Content pipeline — ideas through to published                         |Status board, draft editor          |
|**Agent Activity**|Audit log of what agents have proposed and done                       |Feed, approval interface            |
|**Brand Hub**     |Assets, tone of voice, style guide reference                          |Asset library                       |
|**Settings**      |Team members, integrations, preferences                               |Standard settings layout            |

-----

## Visual Identity

### Colour Palette

|Role          |Value    |Usage                                                |
|--------------|---------|-----------------------------------------------------|
|Background    |`#FAFAF8`|Primary page background — warm off-white             |
|Surface       |`#FFFFFF`|Cards, panels, modals                                |
|Surface subtle|`#F4F4F1`|Sidebar, secondary sections, input backgrounds       |
|Border        |`#E8E6E0`|Dividers, card borders, table rules                  |
|Text primary  |`#1A1915`|Headings, body — near-black with warmth              |
|Text secondary|`#6B6860`|Supporting text, labels, captions                    |
|Text tertiary |`#9E9C96`|Placeholder text, disabled states, timestamps        |
|Accent        |`#C9A84C`|Primary accent — active states, CTAs, highlights     |
|Accent light  |`#F0E4C0`|Accent backgrounds, tags, badges                     |
|Accent dark   |`#9A7A2E`|Hover states, pressed states                         |
|Success       |`#3D7A5E`|Completion states, approved actions, positive signals|
|Warning       |`#B8860B`|Caution states, pending items                        |
|Destructive   |`#B04040`|Errors, rejected actions, destructive operations     |

**Principle:** The palette is warm, not cold. Avoid pure `#FFFFFF` backgrounds and `#000000` text — always use the warm-tinted versions. The accent reads as BTS gold; use it sparingly so it retains signal value — particularly in the agent approval flow where it draws the eye to actionable items.

#### Semantic Colour Layer

Always reference semantic tokens in component code — never raw hex values. This is the layer Claude Code should use when building components.

|Semantic token          |Maps to                                               |
|------------------------|------------------------------------------------------|
|`--color-accent`        |`--color-accent-base`                                 |
|`--color-accent-hover`  |`--color-accent-dark`                                 |
|`--color-accent-subtle` |`--color-accent-light`                                |
|`--color-surface-hover` |`--color-surface-subtle`                              |
|`--color-focus-ring`    |`--color-accent-base`                                 |
|`--color-agent-proposed`|`--color-accent-light`                                |
|`--color-agent-approved`|`#E8F4EE` (success-tinted surface)                    |
|`--color-agent-rejected`|`#F8ECEC` (destructive-tinted surface)                |
|`--color-agent-pending` |`--color-surface-subtle` with `--color-warning` border|

The `--color-agent-*` tokens are specific to the agent activity surfaces. They give proposed/approved/rejected states a distinct but non-alarming visual identity.

-----

### Typography

**Display / Headings:** `Playfair Display` — serif, editorial, authoritative. Used sparingly in an internal tool — page titles, section headers, empty state headings.

**Body / UI:** `DM Sans` — the workhorse of this platform. Labels, navigation, table data, button text, body copy, everything.

**Monospace (data):** `JetBrains Mono` — numerical data, percentages, financial figures, timestamps in detail views, any data that benefits from alignment.

**Scale (base 16px):**

- H1 (page title): 28px, Playfair Display, weight 600
- H2 (section heading): 20px, Playfair Display, weight 600
- H3 (card/panel title): 16px, DM Sans, weight 600
- H4 (label heading): 14px, DM Sans, weight 600
- Body: 15px, DM Sans, weight 400, line-height 1.6
- Small: 13px, DM Sans, weight 400
- Caption: 11px, DM Sans, weight 500, letter-spacing 0.04em uppercase
- Data: 14px, JetBrains Mono, weight 400

**Internal tool note:** Display-size text (48px+) is rarely appropriate here. Playfair Display should appear at H1–H2 scale, not hero scale. This isn’t a landing page.

**Principle:** Headings use the serif for identity. Body stays in the sans for density and readability at small sizes. Never mix two serifs or two sans-serifs.

-----

### Spacing & Layout

- Base unit: `4px` — all spacing is a multiple of this
- Standard spacing scale: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80px`
- Content area padding: `32px` on desktop
- Card padding: `20px` (tighter than a public product — this is a dense UI)
- Sidebar width: `240px` expanded, `64px` icon-only collapsed
- Max content width: `1200px` within content area, centred
- Whitespace is still a feature — resist the urge to fill every column

#### Layout Pattern

The platform uses a standard app shell:

```
┌──────────┬───────────────────────────────┐
│          │  Page header (title + actions)│
│  Sidebar │───────────────────────────────│
│  nav     │  Content area                 │
│  240px   │  (scrolls independently)      │
│          │                               │
└──────────┴───────────────────────────────┘
```

- Sidebar: fixed, left, `--color-surface-subtle` background, `--color-border` right border
- Page header: sticky, `--color-surface` background, `--color-border` bottom border, 64px height
- Content area: scrollable, `--color-bg` background

#### Responsive Breakpoints

This platform is primarily desktop — the founders use it on their machines. Mobile is secondary but should still be usable for quick checks.

|Name |Min-width|Behaviour                          |
|-----|---------|-----------------------------------|
|`md` |`768px`  |Sidebar collapses to icon-only     |
|`lg` |`1024px` |Standard layout — sidebar + content|
|`xl` |`1280px` |Comfortable content width          |
|`2xl`|`1536px` |Max-width kicks in, content centres|

Below `768px`: sidebar becomes a bottom tab bar (5 primary sections only), content goes full-width.

-----

### Border Radius

- Cards, panels, modals: `12px`
- Buttons: `8px`
- Inputs, small elements: `6px`
- Badges, tags, pipeline chips: `4px`
- Avoid pill shapes except for status badges

-----

### Shadows

Warm, soft shadows — not cool grey:

```css
--shadow-sm: 0 1px 3px rgba(26, 25, 21, 0.06), 0 1px 2px rgba(26, 25, 21, 0.04);
--shadow-md: 0 4px 12px rgba(26, 25, 21, 0.08), 0 2px 4px rgba(26, 25, 21, 0.04);
--shadow-lg: 0 12px 32px rgba(26, 25, 21, 0.10), 0 4px 8px rgba(26, 25, 21, 0.06);
```

In an internal tool, `--shadow-sm` is the default. `--shadow-md` for modals and floating elements. `--shadow-lg` sparingly.

-----

## Components

### Buttons

- **Primary:** `--color-accent` background, `--color-text-primary` text, 8px radius. On hover: `--color-accent-hover`.
- **Secondary:** `--color-surface` background, `--color-border` border, `--color-text-primary` text. On hover: `--color-surface-subtle`.
- **Ghost:** Transparent, `--color-text-primary` text. On hover: `--color-surface-subtle`.
- **Destructive:** `--color-destructive` background, white text.
- All buttons: DM Sans, weight 500, 13–14px, horizontal padding `16–20px`, height `36px`
- All buttons must have a visible `:focus-visible` ring

**Button sizing in this platform:**

- Default: `36px` height — appropriate for dense UI
- Large (primary CTAs, empty states): `40px`
- Small (inline actions, table rows): `28px`

### Cards

- `--color-surface` background, `--color-border` border (1px), `12px` radius, `--shadow-sm`
- On hover (if interactive): `--shadow-md`, `translateY(-1px)` — subtler lift than a public product
- No lift on non-interactive cards

### Navigation (Sidebar)

- `--color-surface-subtle` background, `--color-border` right border (1px)
- Logo mark at top: “BTS” in Playfair Display, weight 700, `--color-text-primary`
- Nav items: DM Sans, 14px, weight 500, `--color-text-secondary`
- Active item: `--color-accent-subtle` background, `--color-accent` left border (3px), `--color-text-primary` text
- Hover: `--color-surface` background
- Icons: Lucide, 18px, `stroke-width: 1.5`
- Section groupings with `--color-text-tertiary` uppercase caption labels (11px)

### Data Tables

Tables are a primary UI pattern here — CRM lists, task lists, interaction history.

- Header row: `--color-surface-subtle` background, DM Sans 11px uppercase caption, `--color-text-secondary`
- Data rows: `--color-surface` background, `--color-border` bottom border
- Row hover: `--color-surface-subtle` background
- Zebra striping: avoid — prefer hover-only highlighting
- Sticky header on scroll
- Numeric data: right-aligned, `--font-mono`
- Sortable columns: Lucide `ArrowUpDown` icon at 14px; active sort column uses `--color-accent`
- Pagination: simple previous/next with page count, DM Sans 13px

### Pipeline Stage Chips

Used on contact records and CRM lists to show `lead / warm / active / client / dormant`.

|Stage    |Background              |Text                    |
|---------|------------------------|------------------------|
|`lead`   |`--color-surface-subtle`|`--color-text-secondary`|
|`warm`   |`#FEF3C7`               |`#92400E`               |
|`active` |`--color-accent-light`  |`--color-accent-dark`   |
|`client` |`#E8F4EE`               |`#1E5C3F`               |
|`dormant`|`--color-surface-subtle`|`--color-text-tertiary` |

- `4px` radius, DM Sans 12px, weight 500, `6px` horizontal padding, `2px` vertical padding
- Never use colour alone — always include the label text

### Agent Activity Feed

This is one of the most important UI surfaces in the platform. Simon and the specialist agents propose actions here, and the founders approve, reject, or request clarification. The design must make this feel like a trusted briefing, not a spam queue.

**Feed item anatomy:**

- Agent name + action type (e.g. “Simon · Proposed 3 actions”)
- Timestamp: `--font-mono`, `--color-text-tertiary`, 12px
- Trigger context: what caused this (e.g. “From call transcript · Marcus Chen · 22 Mar”)
- Proposed actions: listed clearly, one per line, with the specific record they will affect
- Approval controls: “Approve all”, “Review individually”, “Reject” — prominent, not buried

**Status surfaces:**

- `pending`: `--color-agent-pending` background, `--color-warning` left border (3px)
- `approved`: `--color-agent-approved` background, `--color-success` left border (3px)
- `rejected`: `--color-agent-rejected` background, `--color-destructive` left border (3px)
- `auto` (no approval needed): `--color-surface` background, no border accent

**Approval UX note:** Approval responses should be parsed flexibly — “yeah go ahead”, “looks good”, “do it” are all valid approval signals. The UI should make this feel natural, not like filling out a form. Provide quick-response buttons but also accept free-text input in the same field.

### Forms & Inputs

- Border: `--color-border`, radius `6px`, background `--color-surface`
- Height: `36px` for standard inputs (matches button height)
- Focus: `--color-accent` border (2px), `rgba(201, 168, 76, 0.12)` glow
- Labels: DM Sans, 13px, weight 500, `--color-text-primary`
- Helper text: 12px, `--color-text-secondary`, below input
- Error state: `--color-destructive` border, inline error message in 12px below field
- Error messages linked via `aria-describedby`

### Empty States

Every list view will be empty at some point — new instance, cleared filters, genuinely empty sections.

- Lucide icon at 48px, `--color-text-tertiary`
- Heading: H3, Playfair Display, `--color-text-primary` — contextual, not generic (“No tasks yet” not “Nothing here”)
- Subtext: 14px, DM Sans, `--color-text-secondary` — explain why and what to do
- CTA: Primary button — give a clear next action
- Never: a blank broken-looking state or cutesy copy

### Component States

Every interactive component must account for all five states. Don’t design only the happy path.

|State       |Visual treatment                                                   |
|------------|-------------------------------------------------------------------|
|**Default** |As specified per component                                         |
|**Hover**   |Subtle background shift or shadow lift                             |
|**Focus**   |2px solid `--color-focus-ring`, 2px offset — never remove          |
|**Disabled**|40% opacity, `cursor: not-allowed`, no hover effects               |
|**Loading** |Skeleton in `--color-surface-subtle`, or 24px spinner for short ops|
|**Error**   |`--color-destructive` border/icon, inline descriptive message      |
|**Empty**   |See Empty States above                                             |

-----

## Motion & Interaction

- Subtle and purposeful — this is a productivity tool, not a product demo
- Page/section transitions: simple fade (`150ms ease`)
- Card hover lift: `translateY(-1px)`, shadow increase (`200ms ease`)
- Button press: `scale(0.98)`, `100ms ease`
- Sidebar collapse/expand: `200ms ease-in-out`
- Modal enter: fade + `translateY(8px)` → `translateY(0)`, `200ms ease-out`
- No bouncy, elastic, or decorative animations
- Agent activity feed: new items slide in from top, `200ms ease-out`
- Always respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

-----

## Imagery & Icons

### Icons

- **Library:** Lucide — consistent throughout, no mixing with other icon sets
- **Stroke width:** `1.5` — refined, not heavy
- **Sizing:** 16px inline/UI, 18px navigation, 20px feature actions, 24px section headers, 48px empty states
- Icon-only buttons must have `aria-label` and a tooltip on hover
- Agent identity icons: each agent can have a small identifying icon (e.g. Simon = a coordination-style symbol). Keep them in the Lucide family.

### No Stock Photography

This is an internal tool — no imagery needed beyond icons and optional geometric illustrations. If illustration is used (empty states, onboarding): simple line art in the warm palette, not playful or cartoon-style.

-----

## Accessibility

This is a daily-driver internal tool. Accessibility is both the right thing to do and a practical concern — fatigue and speed matter when you’re using something for hours.

### Contrast

- Text on background: minimum 4.5:1 (WCAG AA), target 7:1 for body text
- Large text (18px+ or 14px+ bold): minimum 3:1
- UI components and focus rings: minimum 3:1
- The defined palette passes AA at all primary pairings. Verify any new combinations before shipping.

### Focus Management

- All interactive elements: visible `:focus-visible` ring — `2px solid --color-focus-ring`, `2px offset`
- Never `outline: none` without an equivalent custom indicator
- Tab order matches visual reading order
- Modal/drawer open: focus moves to first interactive element inside
- Modal/drawer close: focus returns to the trigger element

### Semantics

- Semantic HTML: `<button>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<table>`
- `aria-label` on all icon-only buttons
- Form inputs always paired with `<label>` — never use `placeholder` as a substitute
- Error messages linked to inputs via `aria-describedby`
- Agent activity feed: `role="feed"`, `aria-label` per item

-----

## Voice & Microcopy (design-adjacent)

This is an internal tool, so tone can be slightly more direct than a public product — but it still reflects BTS brand voice: authoritative, calm, plain.

- No exclamation marks in UI copy
- Action labels: specific and outcome-oriented — “Add contact” not “Create”, “Mark complete” not “Done”
- Agent-generated text (summaries, proposed actions) should read like a competent briefing, not a bot output. If the agent layer produces poor prose, flag it — the UI should not paper over it with pretty chrome
- Approval prompts: conversational — “Does this look right?” not “Confirm action”
- Error messages: explain what happened and what to do — never just “Something went wrong”
- Empty states: helpful and action-oriented, not generic
- Banned terms in UI copy (mirrors BTS brand voice rules): “crypto”, “HODL”, “to the moon”, “guaranteed returns”, “blockchain” (unless technically necessary)

-----

## Design Tokens (CSS Variables)

Single source of truth. Never hard-code hex values in component code.

```css
:root {
  /* ── Primitive colours ── */
  --color-bg: #FAFAF8;
  --color-surface: #FFFFFF;
  --color-surface-subtle: #F4F4F1;
  --color-border: #E8E6E0;
  --color-text-primary: #1A1915;
  --color-text-secondary: #6B6860;
  --color-text-tertiary: #9E9C96;
  --color-accent-base: #C9A84C;
  --color-accent-light: #F0E4C0;
  --color-accent-dark: #9A7A2E;
  --color-success: #3D7A5E;
  --color-warning: #B8860B;
  --color-destructive: #B04040;

  /* ── Semantic colour aliases ── */
  --color-accent: var(--color-accent-base);
  --color-accent-hover: var(--color-accent-dark);
  --color-accent-subtle: var(--color-accent-light);
  --color-surface-hover: var(--color-surface-subtle);
  --color-focus-ring: var(--color-accent-base);

  /* ── Agent activity surfaces ── */
  --color-agent-proposed: var(--color-accent-light);
  --color-agent-approved: #E8F4EE;
  --color-agent-rejected: #F8ECEC;

  /* ── Typography ── */
  --font-display: 'Playfair Display', Georgia, serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 28px;

  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.6;

  /* ── Spacing ── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* ── Layout ── */
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --header-height: 64px;
  --content-max-width: 1200px;

  /* ── Border radius ── */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* ── Shadows ── */
  --shadow-sm: 0 1px 3px rgba(26, 25, 21, 0.06), 0 1px 2px rgba(26, 25, 21, 0.04);
  --shadow-md: 0 4px 12px rgba(26, 25, 21, 0.08), 0 2px 4px rgba(26, 25, 21, 0.04);
  --shadow-lg: 0 12px 32px rgba(26, 25, 21, 0.10), 0 4px 8px rgba(26, 25, 21, 0.06);

  /* ── Animation ── */
  --duration-fast: 100ms;
  --duration-base: 200ms;
  --duration-slow: 300ms;
  --ease-default: ease;
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  /* ── Z-index scale ── */
  --z-base: 0;
  --z-raised: 10;      /* dropdowns, tooltips, popovers */
  --z-sticky: 100;     /* sidebar, sticky header */
  --z-overlay: 200;    /* modals, drawers */
  --z-toast: 300;      /* toast notifications */
}
```

-----

## What Good Looks Like

A well-executed screen in this platform should feel like:

- A fund manager’s private dashboard — no marketing, no decoration, just clarity
- Dense enough to show information, spacious enough to read quickly
- The agent activity feed reads like a trusted colleague’s message, not a notification centre
- Accent used so sparingly that when it appears, it means something

When in doubt: more whitespace, less colour, let the content speak.

-----

## How to Use This Brief

### With Claude Code

1. **Always read this file before making any UI changes** — it is the design authority
1. **Check `CLAUDE.md` first** — it maps task types to which docs to read
1. **Implement CSS custom properties first** — update the tokens block before touching components
1. **Use semantic tokens in component code** — `--color-accent` not `#C9A84C`
1. **Reference the IA table** when building nav, routing, or page structure
1. **Every new component needs all five states** — default, hover, focus, disabled, error/empty
1. **Agent activity surfaces use the `--color-agent-*` tokens** — do not improvise new colours for proposed/approved/rejected states
1. **Personality check:** does this screen feel focused and trustworthy? If it feels like a SaaS landing page, dial it back

### With Figma / Design Tools

- CSS tokens are source of truth — Figma variables should mirror them, not lead them
- If a design decision deviates from this brief, update the brief first and document the rationale

-----

## Changelog

|Version|Date|Changes                                              |
|-------|----|-----------------------------------------------------|
|1.0    |2025|Initial brief for BTS internal platform web interface|