# Review: Next.js Web App (`apps/web`) — Five Improvements

## Context

`apps/web` is the internal BTS operations dashboard (Next.js 15 App Router /
React 19 → Vercel): 57 pages, 34 server actions, ~158 components, ~117 CSS
modules. It is well-architected for its stage — clean server/client boundary,
parallel `Promise.all` fetching in server components, Zod-validated `'use server'`
actions, a strong `humanizeError()` layer, middleware + `(app)` layout auth
gating, and a disciplined CSS-modules-over-design-tokens system (no Tailwind, no
CSS-in-JS).

This document records the five improvements from a thorough review, ranked by
leverage (impact ÷ effort). **Recommendations 1–5 are implemented** on branch
`claude/nextjs-app-review-fnm294`; the deferred follow-ups at the end are not.
Each item is independent and was shipped as its own commit.

### Key files examined
- `apps/web/middleware.ts`, `apps/web/app/(app)/layout.tsx` — auth gating
- `apps/web/app/actions/*.ts` — 34 server actions (mutation surface)
- `apps/web/lib/supabase/{server,browser}.ts`, `apps/web/lib/errors.ts`
- `apps/web/components/ui/*` — shared primitives (Modal, SlideOver, DataTable, …)
- `apps/web/package.json`, `.github/workflows/test.yml` — tooling + CI gates

---

## 1. Real linting + accessibility static analysis — DONE (`3a7c680`)

**Problem.** The `lint` script was `tsc --noEmit` (a duplicate of `typecheck`)
and there was no ESLint config anywhere in the repo, so the CI step named "Lint"
never linted. Unused vars, `react-hooks/exhaustive-deps`, accidental `any`, and
the entire `jsx-a11y` rule set were invisible — the code even carried inert
`// eslint-disable @typescript-eslint/no-explicit-any` comments.

**Shipped.** Added `eslint` + `eslint-config-next` (`next/core-web-vitals`,
`next/typescript`) + `eslint-plugin-jsx-a11y`; `lint` → `next lint` across
`app/components/hooks/lib/providers`. `.eslintrc.json` keeps the noisy
legacy-debt rules (jsx-a11y, `no-explicit-any`, `no-unescaped-entities`) at
**warn** so CI stays green while the backlog is triaged; the error gate is real.

---

## 2. Remove `as any` Supabase casts from server actions — DONE (`4d3e666`)

**Problem.** 15 action files carried ~68 `(supabase as any).from(...)` /
`const db = supabase as any` casts. The generated `Database` types already
covered these tables (regenerated recently), so the casts were stale leftovers
that disabled type-checking for every column on those queries.

**Shipped.** Removed 67 of 68 casts (the lone remainder is the unrelated
`require('mammoth')`). Removing them surfaced genuine latent mismatches the
`any` had masked, each fixed at the action's read/write boundary so consumer
components are untouched: nullable columns normalised (`null → []`/`''`), jsonb
columns asserted to their structured shapes (`content`, `sentiment`,
`content_json`, `research_links`, `VoiceProfile`), and text-as-enum columns
asserted (`content_type`, `payment_type`). `no-explicit-any` warnings dropped
48 → 0. A note discouraging the `as any` workaround was added to
`packages/db/MIGRATIONS.md`.

---

## 3. Accessibility of shared overlay / menu / table primitives — DONE (`f4cf01e`)

**Problem.** The weakest area, but concentrated in a few shared files: Modal /
SlideOver lacked focus management and labelling, icon close buttons had no
accessible name, RowActionsMenu had no menu roles or keyboard nav, and sortable
DataTable headers weren't keyboard-operable.

**Shipped.** New `useFocusTrap` hook (focus-in/trap/restore, used by SlideOver;
Modal relies on native `<dialog>`). Modal/SlideOver get `aria-labelledby` +
named close buttons (SlideOver also `role="dialog"`/`aria-modal` + focus trap).
RowActionsMenu gets `role="menu"`/`"menuitem"`, `aria-haspopup`/`aria-expanded`,
focus-first-item, ArrowUp/Down cycling, and Escape-returns-focus. DataTable
sortable headers render as real `<button>`s with `aria-sort`. Toast gets a named
dismiss button + `role="status"`/`aria-live`. Tests added for RowActionsMenu,
DataTable, and SlideOver.

---

## 4. Server-action tests behind a thin auth helper — DONE (`110dfc0`)

**Problem.** 0 of 34 actions were tested (despite the chainable Supabase mock
existing), and auth was inconsistent — only ~13 of 34 actions called `getUser()`;
mutating actions like `approvals.ts` wrote with no auth assertion.

**Shipped.** `apps/web/lib/action.ts` exposes `getAuthedClient()` — resolves the
cookie-authed client and asserts a signed-in user via a discriminated `{ ok }`
result. Adopted in the highest-risk mutating actions (approvals, tasks,
companies, contacts). The shared mock gained `auth.getUser`/`__setUser` and the
missing chain methods. Tests for approvals/tasks/companies assert Zod rejects bad
input without touching the DB, the right table/columns are written,
`revalidatePath` is called, and the signed-out path returns the auth error.

---

## 5. Data-fetch polish — DONE (`3722d61`)

**Problem.** `crm/contacts/[id]` fetched contact → company → interactions →
tasks in series (4 round-trips), and `AssetPicker` swallowed a failed load with
`.catch(() => {})`.

**Shipped.** Contact, interactions, and tasks now fetch in one `Promise.all`
(the linked company still follows, since it needs `contact.company_id`) — 4
round-trips → 2. AssetPicker surfaces a toast on failure (with `toast`
deliberately kept out of the effect deps to avoid a refetch loop).

---

## Deferred follow-ups (not yet implemented)

Each is a clean, independent change left for its own PR:

1. **Form-label / `FormField` refactor.** 47 components use the
   `styles.label` + bare-`<input>` pattern with no `htmlFor`/`id` association.
   A shared `FormField` wrapper emitting `htmlFor`/`id` + `aria-describedby`
   would wire them up; until then `jsx-a11y/label-has-associated-control` stays
   at warn. Largest remaining a11y item.
2. **`revalidateTag`-based caching.** Invalidation is path-only across ~186
   `revalidatePath` call-sites; tagging hot entities (company/contact) would let
   writes invalidate precisely instead of bluntly. Broad, lower payoff.
3. **Promote a11y lint rules from warn → error.** Once items 1 and the existing
   jsx-a11y backlog (~290 warnings) are cleared, flip the rules to error so
   regressions fail CI.
4. **Per-row authorization.** No authz beyond RLS — correct for a two-person
   internal tool; revisit only if the team or trust boundary grows.
5. **`/share/[id]` link hygiene.** Public links are unguessable + RLS-gated but
   neither expiring nor rate-limited. Acceptable by design; flag if links start
   carrying sensitive files.
6. **Hardcoded `ORG_ID = 'bts'`** in `files.ts` / `company.ts` — harmless
   single-tenant constant today.
