# Build Sessions — Minute (`apps/client`)

Three sessions, following the house pattern: data layer → auth and gates → surfaces. Each has
an explicit definition of done. Do not begin a session with the previous one's checks unmet.

**Before session 1:** resolve A1–A4 in [`assumptions.md`](./assumptions.md). Two of the four are
documents to read rather than code to write, and both have lead times.

**A2, A3 and A4 have been run** — see [`build-progress.md`](./build-progress.md). A2 was
understated by roughly ten times and A4 was wrong outright. A1 is still outstanding.
The bundle's `schema/00N-*.sql` files were reference drafts; the applied migrations live in
[`supabase/migrations/`](../../../supabase/migrations/) and are listed in the build-progress doc.

---

## Session 0 — Not code

Neither of these is optional and neither is a build task.

1. **Read the AR appointment deed.** Confirm what BTS is authorised to do. Everything in the
   compliance architecture assumes general advice only.
2. **Confirm the FSG covers a subscription information service.** If it was drafted for
   consulting engagements it needs revision, and that is a lead time.

---

## Session 1 — Data layer and the security fix

### Tasks

1. **Run the audit query** from `001-rls-hardening.sql`. Record every offending policy. If
   there are tables beyond the eleven in `schema.sql`, extend the migration before running it.
2. **Apply `001-rls-hardening.sql`.** Verify `is_team_member()` returns true for a founder
   session and false otherwise.
3. **Apply `002-client-tables.sql`.** Seed one test account of each `client_type`.
4. **Verify tenancy manually before writing any application code.** Open a subscriber session
   and run the verification block at the end of 002. If `SELECT count(*) FROM contacts`
   returns anything other than zero, stop.
5. **Verify column names** per A3, then apply `003-directory-and-signals.sql`.
6. **Apply `004-prepare.sql`.**
7. **Add the interfaces** from `contracts/repositories.ts` to `@platform/data`.
8. **Write the conformance suite** at `packages/data/src/__tests__/client-conformance.ts`
   against the eight assertions listed at the bottom of the contracts file.
9. **Implement in `@platform/data-supabase`.** Pass the suite.

### Done when

- The audit query returns zero rows
- A subscriber session can read its own account row and nothing else from the internal schema
- The conformance suite passes
- `INSERT` into `commercial_relationships` with a non-zero fee fails on `no_fees_mvp`
- A `prepare_templates` row cannot reach `status = 'active'` without a Lex reviewer

### Do not

- Write any UI
- Backfill `is_financial_product` with a default — every row is a human judgement (A8)

---

## Session 2 — Shell, auth, and the compliance gate

### Tasks

1. **Scaffold `apps/client`.** Next.js 15 App Router, Vercel. Copy the shape of `apps/web`,
   not its contents.
2. **Write `apps/client/lib/boundary.test.ts` first,** before the app compiles. Follow
   `apps/demo/lib/boundary.test.ts`. Assert no import of `@platform/signal`,
   `@platform/voice`, `@platform/agents`, and no service-role key reachable from any import
   path.
3. **Invite flow.** `/invite/<token>` outside the authenticated shell. Token single-use,
   time-limited, creates the `client_users` row on acceptance.
4. **`middleware.ts`** — two gates in sequence. Authenticated, then disclosure-current. A
   session failing the second reaches only `/disclosure`.
5. **Disclosure gate.** Serves the active FSG from `compliance_documents`, blocks, records to
   `client_disclosures` on acknowledgement. A new FSG version re-triggers it.
6. **App shell.** Standing general advice warning in the layout, not per-route — a warning
   added per route is a warning eventually forgotten on a route.
7. **Activate the Lex client-promotion gate.** Suspend/resume on `advice_adjacent` and
   `solvency_adjacent`. Neutral and valuation-adjacent promote on a director's flag.
8. **Build the approval queue in `apps/web`.** This is the human interface to the gate and it
   is real work — a regulatory change classifies `solvency_adjacent` at minimum, so every
   AUSTRAC or ASIC register movement passes through here by hand.

### Done when

- Boundary test passes
- A subscriber cannot reach any route before acknowledging
- Acknowledgement is recorded with document version and timestamp
- Bumping the FSG version re-blocks an existing session
- A `solvency_adjacent` change cannot become `client_relevant` without passing the queue
- The approval queue is usable by a founder on a phone, because that is where it will be used

### Size the queue before promising anything

Count how many ecosystem changes classified `solvency_adjacent` in the last ninety days.
That number is the weekly manual approval load. If it is large, batch the queue — do not
lower the gate.

---

## Session 3 — Surfaces

Order matters. `/` and `/signals` first because they establish the fact-rendering components
everything else reuses.

### Tasks

1. **`/` — The Brief.** Narration, findings, provenance rails. Build the quiet-day state
   first, before the populated state. It is a designed state, not a fallback, and building it
   second guarantees it looks like an afterthought.
2. **`/indicators`.** Neutral deltas, gold reserved for freshness, `JetBrains Mono` values.
3. **`/signals`.** Promoted feed, `client_note` never `curator_note`, absence signals rendered
   as first-class items.
4. **`/register`.** Reuse `ProvenanceRail`, `BasisChip`, `ResearchLedger` from `@platform/ui`
   unchanged. If a component needs a variant, the variant belongs in the package.
5. **Backfill `is_financial_product`,** then set `NOT NULL`.
6. **`/directory`** and `/directory/how-we-make-money`, the latter generated from
   `commercial_relationships`.
7. **`/library`** with `client_type` sectioning.
8. **`/prepare`** — see below.
9. **`/account`.**

### `/prepare` sub-sequence

Its own spec is `prepare-feature-spec.md`. Build in this order:

1. Template parser and validator — YAML front matter, `::section` blocks, the
   prohibited-conclusion blocklist
2. IndexedDB layer, autosave, working-copy export and import
3. Fact resolution and the labelled fact block component
4. One template end to end: **trustee minute**. It is the most constrained and the most
   regulatory, so it surfaces every problem the others will have.
5. Remaining five templates
6. Print stylesheet and export, tested in Safari before it is called done (A9)
7. Refresh semantics and the neutral diff view

### Done when

- Every route renders its empty state deliberately
- No green-up or red-down appears anywhere, on any metric, in any diff
- Gold appears only on freshness indicators
- A directory card with `isFinancialProduct === true` emits no anchor and no contact action
- A generated pack carries front matter, general advice warning and provenance appendix
- No composed subscriber prose exists in any server log, database row, or network request

### The last check

Open the network tab, complete a full board paper, export it. If any request body contains a
sentence the subscriber typed, the two-layer model has leaked and the general advice boundary
is no longer architectural.

---

## Notes for Claude Code

- **Read the installed Mastra docs, not training data.** `node_modules/@mastra/core/dist/docs/`.
  The APIs move. This applies to the Lex gate work in session 2.
- **The design skill is `.claude/skills/bts-design/`.** `DESIGN_BRIEF.md` is archived backing
  material. Where they disagree, the skill wins. Body font is DM Sans; the skill's `SKILL.md`
  has an error listing Inter.
- **The product is Minute; the directory is `apps/client`.** Product name in user-facing
  copy, page titles and exports. Role name in paths, table names and imports.
- **Australian English throughout.** Bitcoin capitalised for the network, bitcoin lowercase
  for the unit. No exclamation marks. No hype.
- **Computed over stored.** Derived metrics belong in views, not columns.
- **Deterministic before LLM.** Nothing in `apps/client` calls a model at request time. If a
  task seems to need one, that is a signal the work belongs upstream in the ingest pipeline.
