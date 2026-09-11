# `apps/client` — Minute

**Minute, by Bitcoin Treasury Solutions.** An invite-only paid subscription app for Australian
CFOs and SMSF trustees. The first surface BTS charges for, and the first one anyone outside the
founding team logs into.

The product is **Minute**; the directory is `apps/client`. The monorepo names apps by role —
`web`, `demo`, `client` — and a product name in the tree would break that and age badly if the
product is ever renamed. Same for the `client_*` tables. Product name in user-facing copy, page
titles and exports; role name in paths, table names and imports.

Spec bundle: [`docs/features/client-app/`](../../docs/features/client-app/). Read
[`build-progress.md`](../../docs/features/client-app/build-progress.md) first — three of the
bundle's assumptions were wrong, one by an order of magnitude, and bundle 0.4.0 later removed
the licensing premise the first build rested on.

**BTS does not give financial advice and holds no AFS authorisation.** Every structural rule
below exists to keep that true as the product grows. With an authorisation these rules would
keep you inside a lane you are allowed to drive in; without one, they are the position
itself.

---

## Status

Sessions 1–3 are built. **Every migration is written and not applied**, and the two things
blocking first login are documents rather than code:

- **No Service Statement exists**, and `compliance_documents` did not exist either until this
  work created it. The gate blocks every route and serves the active Service Statement, so
  until one is written and loaded, nobody can pass. That is the correct failure, and the gate
  says which it is rather than showing a blank page.
- **The not-advice position has not been confirmed against Minute specifically** (assumption
  A1) — a narrated brief, a register of named entities, monitoring of custody providers, rather
  than the education and consulting business.

Also outstanding: publishing the two seeded templates (they ship as drafts and need a Lex
reviewer named against each), the `is_financial_product` backfill (24 rows, human judgement
each), the Lex approval queue in `apps/web`, print fidelity in Safari, and four of the six
`/prepare` templates.

---

## Routes

Eight authenticated, four outside the shell. Anything not listed is out of MVP scope.

| Route | Purpose |
|---|---|
| `/` | The Brief. Narrated findings; three states, not two — see below |
| `/signals` | What changed at the vendors and registers that matter |
| `/indicators` | Macro and on-chain series, as reference data |
| `/register` · `/register/[slug]` | Precedent research. Implementation facts only, each row citable into a pack |
| `/directory` | Service providers, free listing, no call to action on a financial product |
| `/directory/how-we-make-money` | Generated from `commercial_relationships`, never hand-maintained |
| `/library` | Reference layer, sectioned by `client_type` |
| `/prepare` · `/prepare/[slug]` | Board papers, trustee minutes, auditor evidence packs |
| `/account` | Seats, subscription, disclosure history. Deliberately thin |

Outside the authenticated shell, because neither gate applies yet:

| Route | Purpose |
|---|---|
| `/login` | Magic link. No password, no sign-up form |
| `/invite/[token]` | Accepting an invitation |
| `/auth/callback` | Where a magic link lands; redeems an invitation if one rode along |
| `/disclosure` | The blocking gate. Serves the Service Statement |
| `/no-access` | Signed in, but not an active seat |
| `/logout` | Reachable from the gate — a gate with no exit is a trap |

---

## The three things that are not obvious

### The write surface is two methods, and that is the control

Minute never captures a subscriber's personal circumstances — not fund balance, not age, not
member details, not risk tolerance, not holdings. This is enforced by there being **no columns
to put them in**, and by `ClientWriteRepository` having exactly two methods, neither of which
accepts free text: acknowledging a disclosure, and recording that a pack was generated.

Personal circumstances are the ingredient that turns information into advice. A service that
cannot receive them cannot give it, and "we have no facility for you to tell us" is a true
statement about the schema rather than a promise about behaviour.

`lib/boundary.test.ts` asserts no source file writes to a table directly.

### Composed prose never leaves the device

`/prepare` splits everything into **facts** (BTS's, fetched, snapshotted, regenerable) and
**prose** (the subscriber's, in IndexedDB, never transmitted). Facts refresh; prose persists.

The consequence that matters: BTS's servers never hold the composed document, so the
not-advice boundary stops being a policy anyone has to remember and becomes a fact about where
bytes live.

`lib/prepare/prose.test.ts` asserts the modules holding prose contain no `fetch`, no
`sendBeacon`, no server action — there is no request body for a sentence to end up in. It is the
spec's manual network-tab check, made automatic.

### Three layers hold the Service Statement gate, not one

1. `middleware.ts` redirects an un-acknowledged session to `/disclosure`
2. every repository read throws `DisclosureRequiredError`
3. RLS policies filter on `current_client_account_id()`

The middleware runs on the edge and a matcher is an easy thing to get subtly wrong, so it is not
the only enforcement. The gate decision itself is a pure function in `lib/gates.ts`, tested
without a request — the rules are the part that must not be wrong and they do not need I/O to
exercise.

---

## Layout

```
app/
  (app)/              # the authenticated shell — nav, and the standing information-only notice
  actions/            # server actions: auth, invite, disclosure
  auth/callback/      # magic-link landing, invitation redemption
  disclosure/         # the blocking gate
  invite/[token]/     # accepting an invitation
  login/ logout/ no-access/
components/           # Lockup, Nav, Markdown, EmptyDay, Freshness, DirectoryCard, …
lib/
  gates.ts            # the two gates, as a pure decision
  repositories.ts     # per-request client context
  supabase/           # cookie-authed clients, anon key only
  prepare/            # store (IndexedDB), compose (pure), and their tests
middleware.ts
```

---

## Design rules this app inherits

Not restated per route. They apply everywhere, and several are asserted by tests.

- **Neutral delta colour.** No green-up, no red-down, on any metric, in any diff. Colouring a
  rising indicator as good is an implied view, and an implied view served to a paying
  subscriber is the thing the whole design avoids.
- **Implementation facts, not outcome facts.** `/register` answers how an entity did this, never
  how it went for them. Enforced by `field_source_minimums.client_fact_class` and the RLS
  policy that reads it; an unclassified field key is invisible rather than visible.
- **Gold is freshness only.** It appears in `Freshness` and nowhere else. A colour that also
  means "good" means neither.
- **Absence is a fact.** State what is missing rather than leaving a gap — a stated absence on
  a register entry is often more useful than the facts around it.
- **The quiet-day path is mandatory**, and is built before the populated state on every surface
  that has one.
- **Ticker is never a key.** Display only, and an entity may have none.
- **Deterministic before LLM.** Nothing here calls a model at request time. If a task seems to
  need one, the work belongs upstream in the ingest pipeline.
- **Australian English.** Bitcoin capitalised for the network, bitcoin lowercase for the unit.
  No exclamation marks.

Copy and naming rules are in
[`.claude/skills/bts-design/references/naming.md`](../../.claude/skills/bts-design/references/naming.md) —
including the prohibited word list, which is longer than it looks.

---

## Running it

```bash
pnpm turbo build --filter=@platform/client   # always through Turborepo, never --filter alone
pnpm --filter @platform/client dev
pnpm --filter @platform/client test
pnpm --filter @platform/client typecheck
```

Two environment variables, both public, both anon:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL            # optional; the magic-link redirect origin
```

**There is no service-role key here and there must not be.** It bypasses RLS, and every tenancy
guarantee this app makes is an RLS policy — one key in one server action would make the
hardening migration decorative. The invite flow needs a privileged insert and gets it from a
`SECURITY DEFINER` function instead, whose whole body is readable in a migration diff.

Deployment target is `minute.btreasury.com.au`, alongside `hq.btreasury.com.au`.
