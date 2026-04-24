---
name: bts-design
description: Use this skill to generate well-branded interfaces and assets for BTS (Bitcoin Treasury Solutions), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

- **Voice:** Calm authority. Precise nouns over adjectives. Write to peers, not prospects. No emoji. No exclamation marks. Never refer to assets as "crypto." See `README.md` → Content Fundamentals.
- **Colors:** Warm cream background (`#FAFAF8`), single amber accent (`#C9A84C`), warm greys for text. Tokens in `colors_and_type.css`. Never neon, never purple, never dark-by-default.
- **Type:** Playfair Display (serif, for H1/H2 only), Inter (body), JetBrains Mono (data). All from Google Fonts — see `colors_and_type.css`.
- **Feel:** A highly organised colleague who has already done the prep work. Trustworthy, focused, calm, precise. Not a bloated SaaS, not crypto hype.

## Files in this skill

- `README.md` — full brand, voice, visual, and iconography guidance
- `colors_and_type.css` — CSS variables: colours, type, spacing, radii, shadows, motion
- `assets/bts-logo.svg` — the brand mark
- `ui_kits/platform/` — JSX components + `index.html` for the internal platform
- `preview/` — individual design-system cards (colour swatches, type specimens, components)

## Starting a new artifact

1. Link `colors_and_type.css` from your HTML.
2. Use the CSS variables directly — never hard-code hexes or fonts.
3. For React prototypes, copy the components out of `ui_kits/platform/`.
4. If you need an icon that isn't in the kit, use Lucide icons with stroke width 1.5 at 18px default (matches the existing set).
5. When in doubt, leave white space. The system is deliberately quiet.
