# Client App — verification pass and build progress

Reconciliation of the [`client-app`](./README.md) spec bundle against the live repository and
the live database, and what has been built since. Same purpose and same shape as
[`docs/features/demo-app/build-progress.md`](../demo-app/build-progress.md).

**Status:** Session 1 and session 2 are built, session 3 is built through `/prepare`. Every
migration is **written and not applied** — see [Applying the migrations](#applying-the-migrations).
Three of the bundle's twelve assumptions were wrong, one of them by an order of magnitude, and
two of the four documents the bundle said to read before session 1 describe things that do not
exist.
**Last updated:** 2026-09-11

---

## Picking this up cold

1. **This file** — what was verified, what was wrong, and what each phase shipped.
2. **[`assumptions.md`](./assumptions.md)** — the twelve assumptions. A2, A3 and A4 now carry
   verified answers. A1 is still outstanding and is not a code task.
3. The four spec docs, which were written without the repository to hand. Where they disagree
   with this file, this file is the one that was checked.

---

## The verification pass

Run against project `bts-internal` on 2026-09-11, read-only, before any code was written. The
bundle asked for exactly this in its *First three actions* and it was worth doing first: two of
the three findings change the build plan.

### A2 — the RLS hole is roughly ten times the stated size

The bundle says eleven policies and ships a migration that rewrites eleven named policies.

The live database carries **114 permissive policies across 107 tables**, in two classes:

| Class | Count | Detected by the bundle's audit query? |
|---|---|---|
| `USING (auth.role() = 'authenticated')` | 100, over 95 tables | Yes |
| `USING (true)` granted to `authenticated` | 14, over 14 tables | **No** |

The second class is the one that matters for how much to trust the bundle. Its audit query
greps for `auth.role()`, so a policy reading `USING (true)` — which is *more* permissive, not
less — returns nothing and reads as clean. `documents`, `document_versions`, `personas`,
`model_configs`, `platform_files`, `assets`, `decks`, `deck_slides`, `company_records`,
`company_domains`, `company_record_types` and `company_subscriptions` are all in that class.

Fixing the bundle's eleven and then letting a subscriber authenticate would have left about
98 tables readable, including the CRM, the agent activity log and every transcript.

**What was built instead:** one hardening migration covering all 114, generated from the live
policy catalogue rather than from `schema.sql`. Two policies are deliberately preserved:

- `form_submissions_insert` — `WITH CHECK (true)` for `public`, insert-only, so the marketing
  site can post forms. Intended, and it leaks no reads.
- `platform_files_public_select` — `anon` may select where `is_public = true`. Intended; it is
  what share links run on.

The migration also carries a **regression guard**: a test-callable function that runs the audit
and a widened version of it, so a future permissive policy fails a test rather than waiting to
be discovered by the next person who thinks to look.

**`apps/agents` is unaffected.** It authenticates with the service role key
(`packages/db/src/client.ts`), which bypasses RLS entirely. Both founders' `team_members.id`
match their `auth.users.id`, so `is_team_member()` returns true for a founder session — checked,
not assumed, because the whole internal app stops working if it does not.

### A3 — the ecosystem and directory names are correct

The bundle flagged this as the most likely thing to fail on first execution. It does not fail.
Verified present with the assumed names and types:

- `ecosystem_changes` — `client_relevant` (`boolean NOT NULL`), `compliance_class` (`text`),
  `curator_note` (`text`), plus `entity_name`, `change_type`, `payload`, `occurred_at`,
  `detected_at`, `external_url`, `severity`, `materiality`, `status`
- `products_services` — `australian_owned` (`boolean NOT NULL`), `category`, `slug`, `name`
- `advisors_partners` — `slug`, `name`, `type`, `active`
- `update_updated_at()` — exists, and is the name the triggers reference

One correction to the bundle's SQL: `ecosystem_changes.client_relevant` is `NOT NULL`, so the
promotion constraint is written `client_relevant IS NOT TRUE OR (…)` rather than anything
three-valued. The bundle got this right; it is noted because it reads like an oversight and is
not one.

### A4 — there is no FSG, and no library to hold one

The bundle assumed `compliance_documents` holds an active FSG, and described `contracts` and
`compliance_documents` as "from `schema.sql` extensions and more likely correct".

**None of the four tables the bundle depends on exist**, in `schema.sql` or in the live
database:

| Table | Depended on by | Resolution |
|---|---|---|
| `compliance_documents` | `client_disclosures.document_id` FK; the whole disclosure gate; the general advice warning on every `/prepare` export | **Created**, minimally |
| `company_profile` | The identity block in `/prepare` export front matter; the three registers of the company name in `naming.md` | **Created**, as a singleton |
| `contracts` | `commercial_relationships.related_contract_id` FK | **FK dropped**, column kept and commented |
| `compliance_obligations` | Template `review_due_date` "feeds" it; library review cycle | **Deferred** — `review_due_date` and `v_prepare_template_reviews` exist, nothing consumes them yet |

Creating two tables the bundle assumed into existence is an invention, and it is flagged as
one. The reasoning for doing it rather than stubbing: the disclosure gate is a blocking gate on
every route, it is the thing that makes the app lawful to show anyone, and it cannot be built
against a table that does not exist. `contracts` earned the opposite answer — nothing is blocked
by its absence, so the FK goes and a comment records why.

**Neither new table is populated.** `compliance_documents` has no FSG row and
`company_profile` has no ABN, because both are documents to be drafted rather than data to be
invented. A seed with a placeholder ABN in it is worse than an empty table: the empty table
fails loudly at the gate, and the placeholder ships.

### What was not verified

**A1 — the AR appointment deed.** Still outstanding, still not a code task, still the
assumption with the largest blast radius. Everything in the compliance architecture assumes
general-advice-only and no authorisation to arrange. Nothing built so far depends on that being
true in a way that could not be relaxed; the `no_fees_mvp` constraint is the only thing that
would need a migration if the deed says something unexpected.

**A7 — the Coin Metrics community tier catalogue.** Unchanged and still outstanding. It matters
more now than it did, because a series that silently stops updating becomes a stale fact in a
board paper rather than a gap on an internal dashboard.

---

## Applying the migrations

The migrations are written, committed, and **have not been run against the live database.**

`supabase/migrations/` applies automatically on push to `main`
([`packages/db/MIGRATIONS.md`](../../../packages/db/MIGRATIONS.md)), so merging this work *is*
applying it. That is deliberate and it is the thing to think about before merging, because the
hardening migration rewrites every policy in the database in one transaction. It is correct,
it has been generated from the live catalogue rather than hand-listed, and it still deserves a
founder reading it once.

Order, and what each does:

| Migration | What it does |
|---|---|
| `20260911000000_rls_hardening.sql` | `is_team_member()`, all 114 policy rewrites, the two deliberate exceptions, the regression guard |
| `20260911010000_compliance_documents.sql` | The two tables A4 assumed existed. No seed data. |
| `20260911020000_client_tables.sql` | `client_accounts`, `client_users`, `client_disclosures`, `client_invites`, the disjointness triggers, `current_client_account_id()`, `v_client_subscriptions` |
| `20260911030000_directory_and_signals.sql` | Financial product classification, client notes, `commercial_relationships` and `no_fees_mvp`, client read policies on the spine tables |
| `20260911040000_prepare.sql` | `prepare_templates`, `prepare_generations`, `v_prepare_template_reviews` |
| `20260911050000_client_library.sql` | `client_library_sections` and `client_library_entries` — a third table the bundle assumed rather than specified |
| `20260911060000_invite_redemption.sql` | `redeem_client_invite()` and `client_invite_details()`, both `SECURITY DEFINER` |
| `20260911070000_seed_trustee_minute_template.sql` | The trustee minute template, as a **draft** |

All eight were applied to a throwaway local Postgres mirroring the live table catalogue, and
every constraint was exercised behaviourally rather than assumed: `no_fees_mvp` rejects a fee
and accepts a zero-fee row, `active_requires_lex_review` rejects an unreviewed active template,
the one-active-per-slug index rejects the second, `promotion_needs_approver` rejects an
unapproved promotion, `client_clearance_needs_approver` rejects an unapproved clearance,
`smsf_wholesale_needs_evidence` rejects an undocumented wholesale SMSF, the disjointness
trigger rejects a founder as a subscriber, and `audit_permissive_policies()` returns zero rows.

That run caught three things a review would probably not have:

- **A policy ordering bug.** `research_companies_client_read` referenced `client_cleared`
  before the `ALTER TABLE` that adds it. The migration would have failed halfway.
- **`report_segments` belongs to `reports`, not `market_reports`.** A read policy joining the
  two would have matched nothing while looking correct. The Brief's findings are a JSONB column
  on `market_reports`, so the policy was removed rather than fixed.
- **`research_classifications` has no `company_id`.** It is keyed `subject_table`/`subject_id`
  per *field*, so the register's clearance flag went on `research_companies` instead — which is
  also the right place for it, since clearing an entry is a decision about the whole entry.

After applying, the two manual steps the bundle calls for and no migration can do:

1. Assess every `products_services` row against the DAP and TCP definitions, then
   `ALTER COLUMN is_financial_product SET NOT NULL`. 24 rows today. Until then unassessed rows
   are invisible to subscribers by policy, which is the safe direction.
2. Draft and load the FSG and the general advice warning, and fill `company_profile`. The
   disclosure gate serves nothing until this is done, so no subscriber can pass it.

---

## What shipped

### Session 1 — data layer and the security fix

- The five migrations above.
- `@platform/data` — the client repository contracts from the bundle, unchanged in shape:
  `ClientSessionRepository`, `ClientBriefRepository`, `ClientSignalRepository`,
  `ClientIndicatorRepository`, `ClientRegisterRepository`, `ClientDirectoryRepository`,
  `ClientLibraryRepository`, `ClientPrepareRepository`, `ClientWriteRepository`.
- `Principal` gained its `client` variant, and `CLIENT_DOMAINS` its bundle slice, both of which
  the seam was already written to expect — see the comments in
  [`packages/data/src/bundle.ts`](../../../packages/data/src/bundle.ts). Nothing in the seam had
  to change, which is the return on having settled the scoping rule before the verticals landed.
- The conformance suite, parameterised over an adapter in the shared
  [`@platform/data/testing`](../../../packages/data/src/testing/) harness, asserting the bundle's
  eight numbered assertions.

**Deviation from the bundle:** the suite lives in `packages/data/src/testing/client.ts` rather
than the proposed `packages/data/src/__tests__/client-conformance.ts`. The repository already
has a parameterised contract harness that both the live and fixture adapters run; a second
mechanism next to it would have been the second place that pattern lives.

**Assertion 5 is weaker than specified and says so.** The bundle asks that unpromoted signals be
tested "against a real RLS session rather than a mock". There is no test database in this
repository and no fixture adapter for the client domains, so the suite asserts the adapter
issues the filtered query, and the RLS policy itself is asserted by the regression guard in the
hardening migration. That is two partial checks where the bundle asked for one whole one. It is
recorded here rather than quietly downgraded.

### Session 2 — shell, auth and the compliance gate

- `apps/client`, Next.js 15 App Router, dependency-boundary test written before the app
  compiled.
- `middleware.ts` with the two gates in sequence: authenticated, then disclosure-current. A
  session failing the second reaches only `/disclosure`.
- The disclosure gate, serving the active FSG from `compliance_documents` and recording the
  acknowledgement with document version, timestamp and IP.
- The app shell with the standing general advice warning in the layout rather than per route.

**Deviation:** the invite flow needed a privileged insert — a subscriber cannot hold an
`INSERT` policy on `client_users`, because a seat that can create seats is not a seat. The
obvious way out is a service-role key in `apps/client`, and it is the wrong way out: the service
role bypasses RLS, so one key in one server action would make the hardening migration
decorative. The privilege went into two `SECURITY DEFINER` functions instead, each with one job
and a body readable in a migration diff. `redeem_client_invite` refuses an invitation redeemed
by an address other than the one it was issued to, and returns the same message for every
failure mode so it cannot be used to guess tokens.

**Not built:** the Lex client-promotion gate and its approval queue in `apps/web` (session 2
tasks 7 and 8). The schema half is in place — promotion cannot happen without
`client_promoted_by` and `client_promoted_at`, enforced by `promotion_needs_approver` — so no
unpromoted row can reach a subscriber. What is missing is the interface a founder works the
queue from, which is `apps/web` work rather than `apps/client` work.

**Queue sizing, as session 2 asks for before promising anything:** `ecosystem_changes` holds 2
rows in total. There is no ninety-day history to size a weekly approval load from, and the
honest answer is that the load is unknown because the signal engine has barely run. Size it
again when the table has a quarter of data in it.

### Session 3 — surfaces

Built: `/`, `/signals`, `/indicators`, `/register`, `/directory`,
`/directory/how-we-make-money`, `/library`, `/prepare`, `/account`. Quiet-day and empty states
were built before their populated counterparts on every route that has one.

`/prepare` carries the template parser and validator including the prohibited-conclusion
blocklist, the IndexedDB store, fact resolution with absence-as-fact, the trustee minute
template end to end, and export with generated front matter and provenance appendix.

**The last check is a test, not a ritual.** The session plan asks someone to open the network
tab, complete a board paper, export it, and look for a typed sentence in a request body.
`apps/client/lib/prepare/prose.test.ts` makes that structural instead: the modules holding
subscriber prose are asserted to contain no `fetch`, no `XMLHttpRequest`, no `sendBeacon`, no
WebSocket and no server action, so there is no request body for a sentence to end up in. Weaker
than the manual check in one way — it cannot see a leak introduced in a component — and stronger
in another, because it runs on every commit. The component side is covered by the write-surface
case in `lib/boundary.test.ts`.

**The trustee minute ships as a draft.** `active_requires_lex_review` would reject an active row
with no reviewer, and the right response to that constraint is to respect it rather than name a
reviewer who has not read the template. The migration header carries the `UPDATE` that publishes
it. A test runs every seeded template through the real parser and validator, so one cannot be
seeded broken, and asserts no template body contains a bare percentage — which in a template is
almost certainly a suggested allocation.

**Two additional deviations, both places where writing a test changed the design:**

- The boundary test's write rule originally matched `.insert(` anywhere and caught
  `lib/prepare/store.ts`, which does nothing but write — to IndexedDB, on the subscriber's own
  device, which is the entire two-layer model working. A test that has to be suppressed on the
  file it was most meant to protect is the wrong test, so it now matches the query-builder
  shape, with a case proving it still catches a real table write.
- Conformance assertion 7 was passing vacuously, because the templates fixture was defined and
  never wired in. Fixing it exposed a flaw in the harness rather than the fixture: it assumed
  one context could answer as both a corporate and an SMSF subscriber, which no real adapter
  does, because tenancy is bound at construction. `createContext` now takes a client type.

---

## Open, and deliberately so

- **A1, the AR deed.** Outstanding.
- **The FSG.** Outstanding, and it blocks first login.
- **`is_financial_product` backfill.** 24 rows, human judgement each.
- **Print fidelity in Safari (A9).** The export is not an export feature until it has been
  tested there, and it has not been.
- **Co-editing (A10).** Two individual trustees on one minute is the normal case, not an edge
  case, and the working-copy JSON hand-off is a workaround.
- **The Lex approval queue in `apps/web`.**
- **The remaining five `/prepare` templates.** The trustee minute was built first on the
  bundle's reasoning that it is the most constrained and surfaces every problem the others will
  have. It did: the SIS Reg 4.09(2) heads are the reason `facts: []` had to be legal on a
  section, and the reason the validator checks that every prompt ends in a question mark rather
  than trusting the author.
- **A fixture adapter for the client domains.** There is none, which is why conformance
  assertion 5 is two partial checks rather than one whole one. If `apps/client` ever gets a demo
  surface, the harness is already parameterised for it.
