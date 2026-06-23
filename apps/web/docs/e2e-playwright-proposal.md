# Proposal: Playwright E2E + Visual Regression for `apps/web`

**Status:** Draft for review — not yet implemented.
**Author:** scoped alongside the Vitest unit/component setup.
**Decision needed from the team:** see [Open questions](#open-questions) at the end.

-----

## 1. Why — the gap the current suite leaves

The Vitest suite (`pnpm --filter @platform/web test`) covers pure logic, component
behaviour, and server-component data wiring — all in **jsdom**, with Supabase and
child components mocked. That is fast and CI-cheap, but jsdom has **no layout
engine and no CSS cascade**, so three things are structurally untestable there:

1. **Real rendering / CSS** — does the page actually lay out, are design tokens
   applied, is anything visually broken. (This is what the earlier "can we test
   the styling?" question was really after — the answer lives here, not in jsdom.)
2. **Full user journeys across real navigation** — login → land on a page →
   create/edit a record → see it persist, through the real Next.js server,
   middleware, and Supabase round-trips.
3. **Middleware/auth behaviour** — the redirect gate in `middleware.ts` only
   runs in a real server, never in a unit test.

Playwright drives a real Chromium/WebKit/Firefox against a running build, so it
closes exactly that gap. **It complements, not replaces, Vitest** — the dividing
line is in §3.

## 2. What this app makes hard (read before estimating)

Two app-specific realities dominate the design:

- **Auth is a hard gate.** `middleware.ts` calls `supabase.auth.getUser()` and
  redirects *every* route except `/login` to `/login?redirect=…` when there's no
  session. Auth is email+password via Supabase, cookie-based (`@supabase/ssr`).
  So every test that isn't the login test needs an authenticated browser context.
- **Every page depends on Supabase data.** Server components fetch from Supabase
  on render (e.g. `app/(app)/crm/companies/page.tsx`). There is no "static" page
  to smoke-test. An E2E run therefore needs *a backend that answers* — with auth
  and with seed rows — OR those network calls stubbed at the browser boundary.

Good news: the web app's only required env is `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.example`). It does **not** need the agents
server, Signal, Railway, or any of the integration secrets. So the E2E surface is
"Next.js + Supabase", nothing more.

## 3. Scope — what to test vs. what NOT to

**In scope (a handful of high-value journeys, not exhaustive coverage):**
- Auth gate: unauthenticated visit to a deep link redirects to
  `/login?redirect=…`; successful login lands on the original path; logout returns
  to `/login`.
- One representative CRUD journey end-to-end, e.g. **Companies**: create via the
  modal form → row appears in the table → edit → delete (confirm dialog) → gone.
  This exercises a server action, optimistic UI, and a real DB write.
- One read-heavy page renders its list from real data (Activity or Companies).
- **Visual regression** on the design-system surfaces (see §5).

**Explicitly out of scope for E2E (already covered by Vitest, or not worth the cost):**
- Pure logic (`lib/*`), variant→class mapping, prop wiring — stays in Vitest.
- Every page / every field — E2E is slow and flaky at volume; keep it to journeys
  that would actually hurt if broken.
- Agent/Signal/email flows — those live in `apps/agents` and its mocked suite.

Rule of thumb: **if jsdom can prove it, it belongs in Vitest.** Playwright is for
"only a real browser + real server can prove it."

## 4. The central decision: how E2E gets its backend

This is the call that determines effort, speed, and flakiness. Three options:

### Option A — Browser-level network stubbing (`page.route`) ✅ recommended to start
Run the real Next.js build, but intercept Supabase REST/Auth calls in the browser
and return fixtures. Seed an authed state by injecting Supabase's auth cookies/
localStorage via a Playwright `storageState` fixture.
- **Pros:** No live database, fully deterministic, fast, safe to run on every PR,
  no secrets in CI. Same philosophy as our mocked Vitest suite.
- **Cons:** Stubs must mirror Supabase's wire format; doesn't catch real RLS/SQL
  or migration drift. Auth-cookie injection needs a one-time helper.
- **Best for:** the auth-gate and rendering journeys, and all visual regression.

### Option B — Local Supabase stack (`supabase start`) — recommended *if* we want true DB coverage
Spin up the local Supabase Docker stack, apply `supabase/migrations/`, seed a
fixture user + rows, point the app at `http://localhost:54321`.
- **Pros:** Real auth, real RLS, real SQL — catches migration/schema regressions.
  Highest fidelity.
- **Cons:** Heaviest setup; needs Docker in CI; slower; seed/teardown lifecycle to
  maintain. More moving parts = more flake surface.
- **Best for:** the one true-CRUD journey, run on a schedule or pre-release rather
  than every PR.

### Option C — Shared remote staging Supabase project
Point E2E at a dedicated cloud project.
- **Pros:** Zero local infra.
- **Cons:** Shared mutable state across runs → flaky and order-dependent; secrets
  in CI; data pollution. **Not recommended.**

**Recommendation:** start with **A** for the PR-blocking suite (auth gate +
rendering + visual), and add **B** later as a separate, non-blocking "full-stack
E2E" job for the single CRUD journey if we decide DB-level coverage earns its
keep. Avoid C.

## 5. Visual regression (the "is the CSS right" coverage)

Playwright has built-in screenshot assertions (`expect(page).toHaveScreenshot()`).
Proposed approach:
- Snapshot the **design-system primitives** and a couple of representative pages,
  not every screen.
- Pin a single browser+viewport for snapshots (e.g. Chromium @ 1280×800) to keep
  baselines stable; cross-browser functional tests can run separately without
  screenshots.
- Commit baseline PNGs under `apps/web/e2e/__screenshots__/`; CI fails on diff and
  uploads the diff image as an artifact; baselines are updated deliberately via
  `--update-snapshots`.
- **Flake control:** disable animations (`@media (prefers-reduced-motion)` /
  Playwright's `animations: 'disabled'`), freeze any time-based UI, mask avatars/
  dynamic text. Font rendering differs across OSes, so baselines should be
  generated in the **same container image CI uses** (the Playwright Docker image),
  never from a dev laptop.

> Lighter-weight alternative worth weighing: **Storybook + a component-level visual
> tool** (e.g. Chromatic) renders primitives in isolation and is less flaky than
> full-page screenshots — but it's another toolchain. If visual coverage is the
> *primary* goal, Storybook is arguably a better fit than Playwright; if journeys
> are the primary goal, do Playwright and add a few screenshots to it. Flagging as
> a fork in the road.

## 6. Proposed shape (if approved)

```
apps/web/
  playwright.config.ts        # webServer: `next build && next start`, baseURL, projects
  e2e/
    fixtures/
      auth.ts                 # storageState helper → authed browser context
      supabase.ts             # Option A: page.route Supabase stubs + fixtures
    auth.spec.ts              # gate + login + logout
    companies.spec.ts         # render + (Option B) CRUD journey
    visual.spec.ts            # toHaveScreenshot on primitives + a page or two
    __screenshots__/          # committed baselines
```

- **Deps (dev):** `@playwright/test`. Browsers installed via
  `npx playwright install --with-deps` (cached in CI).
- **Scripts:** `test:e2e` (`playwright test`), `test:e2e:ui`, `test:e2e:update`.
  Keep these **separate from `pnpm test`** so the fast Vitest suite stays the
  default and Turborepo's `test` task isn't slowed.
- **App lifecycle:** Playwright's `webServer` builds and boots the app itself, so
  there's nothing to orchestrate by hand locally.

## 7. CI strategy

- **Do not** fold E2E into the existing `Tests` workflow — it would slow every PR
  and import browser/flake risk into the gate that's currently ~14s.
- Add a **separate workflow** (`e2e.yml`) using the official
  `mcr.microsoft.com/playwright` image (browsers preinstalled), running the
  Option-A suite. Decide whether it's **required** (blocking) or **advisory**
  (informational) — recommend advisory at first while baselines settle, then
  promote auth/CRUD specs to required once stable.
- Option-B full-stack job (if pursued): nightly `schedule:` + manual
  `workflow_dispatch`, never on every PR.
- Upload Playwright HTML report + screenshot diffs as artifacts on failure.

## 8. Effort & phasing

| Phase | Deliverable | Rough effort |
|------|-------------|--------------|
| 1 | Playwright installed, `playwright.config.ts`, authed `storageState` fixture, **auth-gate spec** green locally | ~0.5–1 day |
| 2 | Option-A Supabase stubs + **render spec** for Companies/Activity | ~0.5–1 day |
| 3 | **Visual regression** spec + committed baselines + CI image wiring | ~0.5–1 day |
| 4 | `e2e.yml` workflow (advisory), report/diff artifacts | ~0.5 day |
| 5 *(optional, later)* | Option-B local-Supabase job + **true CRUD journey** | ~1–2 days |

Phases 1–4 are the recommended first cut (~2–3 days). Phase 5 only if DB-level
fidelity proves worth the maintenance.

## 9. Risks / watch-items

- **Flake** is the perennial E2E tax — budget for `animations: 'disabled'`,
  network stubbing, deterministic seed data, and retries (`retries: 2` in CI only).
- **Screenshot baselines must be generated in the CI container**, or they'll diff
  on every run due to font/AA differences.
- **Auth-cookie injection** for Option A depends on Supabase's session-cookie
  format; if `@supabase/ssr` changes it, the fixture needs updating. Pin and
  document it.
- **Maintenance cost** scales with surface — keep the suite intentionally small.

## 10. Open questions

1. **Primary goal — journeys or visuals?** If visuals dominate, consider Storybook
   + Chromatic instead of/alongside Playwright (§5).
2. **DB fidelity — do we want Option B at all,** or is browser-level stubbing
   (Option A) enough for now?
3. **CI posture — blocking or advisory** for the E2E job initially?
4. **Browser matrix** — Chromium-only to start, or also WebKit/Firefox?
5. **Visual scope** — primitives only, or a few full pages too?

Once these are answered I can implement Phase 1 and put up the auth-gate spec as a
first vertical slice.
