# @platform/ui

Design tokens and the shared presentational components. Consumed by `apps/web` today; written to
be consumed by a second app (`apps/demo`) without change.

## What's in here

| Path | What it is |
|---|---|
| `src/tokens.css` | **The canonical design tokens.** 75 custom properties — colour, type, spacing, radii, shadows, motion, z-index |
| `src/*.tsx` | 24 presentational components, each with its `*.module.css` and `*.test.tsx` alongside |
| `src/cn.ts` | Class-name joiner |
| `src/useFocusTrap.ts` | Focus trap for modals and slide-overs |
| `src/ToastProvider.tsx` | Toast context and `useToast` |

There is no barrel file. Import the exact module: `import { Button } from '@platform/ui/Button'`.
That matches the rest of the repo, which has no `index.ts` re-exports anywhere in its component
trees.

## Tokens

`src/tokens.css` is the source of truth. `apps/web/app/layout.tsx` imports it ahead of
`globals.css`, which carries app-level base styles only and defines no tokens of its own.

`.claude/skills/bts-design/colors_and_type.css` carries the same token set as a **deliberate
copy**, not an `@import`. That skill's documented workflow is to copy its assets out of the repo to
build standalone artifacts, and its specimen pages load the CSS directly over `file://` — a path
reaching into `packages/` would break both the moment anything left the repo.

The two are held identical mechanically. `apps/web/app/globals.test.ts` fails if they diverge by so
much as a hex, and separately fails if the skill copy ever grows an `@import` of this package.
**Change a token in one, change it in the other in the same commit.**

## Constraints

- **Never import from `apps/*`.** A second consumer is the whole point; a dependency on app code
  defeats it. `@platform/shared` is the only workspace dependency.
- React and `lucide-react` are **peer** dependencies, so each app supplies one copy.
- No data fetching, no Supabase, no server actions. Components take props and render.

## Tests

```bash
pnpm --filter @platform/ui test
```

jsdom throughout — there is no node/jsdom project split as in `apps/web`, because every module here
renders. Setup mirrors `apps/web/test/setup.ts` and is kept as a copy rather than shared: a package
reaching into its consumer's test helpers is the coupling this package exists to remove.

Visual regression lives at the repo root in `e2e/` and is **advisory**, run separately from
`pnpm test`. See the root README and `.github/workflows/e2e.yml`.

## Consuming it

`apps/web` wires it in three places, and a new consumer needs the same:

- `next.config.ts` → `transpilePackages` (this package ships raw `.tsx` and CSS Modules, unbuilt)
- `vitest.config.ts` → a `resolve.alias` entry, so tests resolve source without a prior build
- `app/layout.tsx` → `import '@platform/ui/tokens.css'` before any other stylesheet

CSS Modules are internal by default. `Form.module.css` is exported explicitly because 14 `apps/web`
components share it; anything else consumed across the boundary should get its own explicit
`exports` entry rather than a wildcard, so sharing stays a deliberate decision.
