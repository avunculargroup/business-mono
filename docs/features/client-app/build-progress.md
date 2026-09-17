# Client App — verification pass and build progress

Reconciliation of the [`client-app`](./README.md) spec bundle against the live repository and
the live database, and what has been built since. Same purpose and same shape as
[`docs/features/demo-app/build-progress.md`](../demo-app/build-progress.md).

**Status:** Built against bundle 0.3.0, revised for **0.4.0** (which removed the licensing
premise the first build rested on) and again for **0.5.0** (which supplied the Service
Statement the gate had been waiting on) — see
[What 0.4.0 changed](#what-040-changed-and-what-it-cost) and
[What 0.5.0 added](#what-050-added-the-statement). Sessions 1–3 are built. Every migration is
**written and not applied** — see [Applying the migrations](#applying-the-migrations). Three of
the bundle's twelve assumptions were wrong, one of them by an order of magnitude.
**Last updated:** 2026-09-16

---

## Picking this up cold

1. **This file** — what was verified, what was wrong, what each phase shipped, and what the
   0.4.0 change of approach cost.
2. **[`changelog.md`](./changelog.md)** — what changed in the bundle and why. 0.4.0 is the one
   that matters: it removed every licensing and authorisation assumption.
3. **[`assumptions.md`](./assumptions.md)** — the twelve assumptions. A2, A3 and A4 now carry
   verified answers. A1 was rewritten by 0.4.0 and is still outstanding, though it is no longer
   a deed to read.
4. The spec docs, which were written without the repository to hand. Where they disagree with
   this file, this file is the one that was checked.

---

## What 0.5.0 added: the statement

0.4.0 deleted the FSG and made the gate depend on its replacement without supplying one, which
left the app unable to admit anyone. 0.5.0 supplies it: a twelve-section Service Statement,
drafted, with a variable schema sourced from `company_profile`.

It is **seeded as a draft**, so the gate — which serves only an active document — still admits
nobody. That is the intended state: sections 2, 4 and 6 belong in front of whoever advised on
the not-advice position, and section 8's subscription terms and the privacy URL came from
conversation rather than from a document.

### The statement made three demands on the schema

- **`company_profile` gained nine fields.** Registered address, state and postcode; public
  phone, email and website; and the three complaints fields. Sections 11 and 12 give a
  subscriber somewhere to send a complaint and someone to contact, and a statement naming
  neither has not been finished. The `contact_email` and `website` columns invented earlier
  were dropped in favour of the variable schema's `public_email` and `public_website` — two
  fields for one thing drift apart.
- **Variables resolve at render, and a missing one blocks the gate.** The body is stored with
  `{{placeholders}}` and resolved from `company_profile` by
  [`packages/shared/src/complianceDocument.ts`](../../../packages/shared/src/complianceDocument.ts).
  It never partially substitutes: if anything is missing the body comes back empty and the
  caller is told which keys. A half-resolved document looks finished and is not, and the one
  thing this document has to be is accurate.
- **`client_accounts` gained a tripwire comment.** Section 3 says "Minute has no facility for
  you to tell us", and that is a verifiable claim about that table rather than a promise about
  conduct. Adding a column capable of holding a subscriber's financial position makes a
  document every subscriber has acknowledged misleading. The comment says so, at the place
  someone would be about to do it.

### Two deliberate deviations from the bundle's schema note

The note describes a `compliance_documents` table that did not exist — it was created by this
work — so both of its instructions land differently:

- **The column is `doc_type`, not `document_type`.** Renaming it now would churn the adapter,
  the pending types and the app for no gain.
- **`'fsg'` is not in the CHECK constraint, and stays out.** The bundle says to keep the unused
  licensing values because removing them "buys tidiness and no capability" — an argument
  against churning an *existing* enum. This constraint was written after the no-authorisation
  position was settled, and adding `fsg` to it would add exactly the capability that position
  says must not be used. The constraint rejects it, and a test asserts the rejection.

### What the statement is now checked against

`apps/client/lib/serviceStatement.test.ts` reads the seeded body out of the migration and
asserts two things. First, that every placeholder is one the resolver can source — the failure
mode otherwise is the gate refusing to render on launch day. Second, that the document's claims
still match the product: that it states the not-advice position without hedging, claims no
facility for personal circumstances, promises prepared documents stay on the device, describes
the register as precedent rather than investment research, and does not point a subscriber at
AFCA.

That last one matters more than it looks. Every subscriber acknowledges this document before
using the service, so a statement that drifts from what the app does is worse than no statement
at all.

---

## What 0.4.0 changed, and what it cost

The first build was made against bundle 0.3.0, which assumed BTS operated as an Authorised
Representative under someone else's AFS licence. **0.4.0 removed that premise entirely.** BTS
has never held an AFS authorisation and has never needed one; it does not give financial
advice, and bitcoin is not a financial product.

That is a change of position rather than a change of wording, and it reached further into the
build than a rename would have.

### The migrations were amended in place, not corrected forward

They had never run anywhere — unapplied, on a feature branch. Writing a migration to drop a
column that has never existed in any database would leave a permanent record of a decision
that was never enacted, and anyone reading the schema later would have to reconstruct why.
What changed:

| Change | Why |
|---|---|
| `client_classification`, `classification_evidence`, `classification_set_by`, `classification_set_at` dropped | Retail and wholesale are distinctions inside a regime this service is not in |
| `smsf_wholesale_needs_evidence` dropped | It constrained a column that no longer exists |
| `company_profile.ar_number`, `.licence_holder`, `.licence_number` dropped; `.acn` added | A licence field could only ever be empty, and an empty one on an export invites the reader to wonder which kind of empty |
| `compliance_documents.doc_type` retyped | `service_statement` and `information_notice` in; **`fsg` rejected by the CHECK constraint**, because publishing one would imply an authorisation BTS does not hold |
| `no_fees_mvp` rationale rewritten | Product reason first — independence is the inventory — with INFO 269 as the structural backstop rather than conflicted remuneration |

### The register grew a second gate

Rule 4 changed from "dated, sourced and framed as fact" to **implementation facts, not outcome
facts**, and that is not a copy change — it decides which rows reach a client surface.

`field_source_minimums` gained `client_fact_class`, and the RLS policy on
`research_company_facts` admits only `implementation`. The seven live field keys were
classified in the migration: six implementation, and `operating_metric` — "funding runway",
"operating context" — marked `outcome`, because how an entity is faring is performance rather
than precedent.

A key nobody has classified has no row and is invisible. That direction is deliberate: a
missing implementation fact is a gap, while a leaked outcome fact is the product changing
shape. A pipeline coining `unrealised_gain` tomorrow reaches subscribers when someone
classifies it, and not before.

### Cite in a pack was built, and needed a template to land in

The register and `/prepare` are the same feature at two stages, and 0.4.0 joined them. A fact
row on a register entry can be dropped into the precedent section of a pack in progress,
carrying its provenance, and the export lists cited facts apart from bound ones — because the
author selected those and the template supplied the others.

Three decisions inside it worth recording:

- **The citation carries no section id.** It is made from `/register`, which has never seen
  the pack's template and cannot know its sections. Storing one would mean guessing, and
  freezing a decision the template is allowed to change when it is next versioned. The
  precedent section is resolved at render, from whichever section declares
  `accepts_citations`, and the validator allows at most one.
- **`StoredPack` records whether its template accepts citations.** So `/register` can answer
  "which of my packs can take this" without loading templates it has no other reason to fetch,
  and a pack that cannot hold a citation is not offered rather than accepting one that would
  render nowhere.
- **A board paper template was seeded.** Without one, Cite in a pack was a mechanism with
  nowhere to put a fact — the register would have offered no pack, the action would never have
  fired, and the feature that makes the register's purpose legible would have been dead on
  arrival. The board paper is also the only template a corporate subscriber had. It ships as a
  draft, like the trustee minute, and its section 5 is the precedent section.

A test asserts at least one seeded template has a precedent section, so this cannot silently
regress.

### Everything else was naming, and naming was load-bearing

"General advice warning" became **information-only notice** everywhere — component, app shell,
export front matter and its heading. The phrase implies licensed general advice, which is a
different thing from factual information, and a notice claiming a licence you do not hold is
worse than no notice because it asserts something untrue about the service.

The FSG became the **Service Statement** at the gate, in the middleware, in the account
history and in the adapter's disclosure check. `client_disclosures` did not change: the gate,
the versioning and the re-block behaviour all carry over, which is what the bundle predicted.

A test asserts no export contains the words "afsl", "licence", "license" or "authorised
representative", so a field for one cannot creep back into `CompanyIdentity` unnoticed.

### What 0.4.0 did not change

The structural rules all survived, and each does more work than before. With an authorisation,
these rules keep you inside a lane you are allowed to drive in; without one, they are the
position itself. The two-method write surface, prose never leaving the device, the absence of
any column for personal circumstances, no conclusions in templates, no call to action on a
financial product — none of it moved.

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

**It did not apply the first time, and the reason is worth keeping.** The hardening migration
was originally dated `20260911000000`, which a migration on another branch
(`20260911000000_seed_digitalx_and_block.sql`) had already taken and already applied. The
ledger keys on those 14 digits alone, so the two files were one row as far as Supabase was
concerned; `db push` hit the duplicate, aborted, and took the remaining sixteen migrations with
it. Nothing about that was visible from the pull request — CI was green, the merge was clean,
and the failure was a red run in a workflow nobody watches. The schema simply did not change,
and every new page in `apps/web` sat on its empty state looking like a query bug. Renaming to
`20260910000000` fixed it, and `packages/db/src/migrations.test.ts` now fails on a duplicate
timestamp so the next collision is caught by the PR that causes it.

Order, and what each does:

| Migration | What it does |
|---|---|
| `20260910000000_rls_hardening.sql` | `is_team_member()`, all 114 policy rewrites, the two deliberate exceptions, the regression guard |
| `20260911010000_compliance_documents.sql` | The two tables A4 assumed existed. No seed data. |
| `20260911020000_client_tables.sql` | `client_accounts`, `client_users`, `client_disclosures`, `client_invites`, the disjointness triggers, `current_client_account_id()`, `v_client_subscriptions` |
| `20260911030000_directory_and_signals.sql` | Financial product classification, client notes, `commercial_relationships` and `no_fees_mvp`, client read policies on the spine tables |
| `20260911040000_prepare.sql` | `prepare_templates`, `prepare_generations`, `v_prepare_template_reviews` |
| `20260911050000_client_library.sql` | `client_library_sections` and `client_library_entries` — a third table the bundle assumed rather than specified |
| `20260911060000_invite_redemption.sql` | `redeem_client_invite()` and `client_invite_details()`, both `SECURITY DEFINER` |
| `20260911070000_seed_trustee_minute_template.sql` | The trustee minute template, as a **draft** |
| `20260911080000_seed_board_paper_template.sql` | The board paper template, as a **draft**. The only one with a precedent section |
| `20260911090000_seed_service_statement.sql` | The Service Statement, as a **draft** |

All ten were applied to a throwaway local Postgres mirroring the live table catalogue, and
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
2. **Review and activate the Service Statement**, which is seeded as a draft, and fill
   `company_profile` so its variables resolve. The gate serves only an active document and
   refuses to render a partially-resolved one, so both are required before anyone can pass.
   Still the single thing blocking first login. The information notice also needs writing —
   the app carries a hard-coded fallback so no export ships without one, but the library
   version is what should be served.
3. Publish the two seeded templates, which ship as drafts. Each needs a Lex reviewer named
   against it — `active_requires_lex_review` enforces that, and the migration headers carry
   the `UPDATE`.

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

### Session 4 — the remaining four templates

All six artefacts from the spec are now seeded: the audit committee briefing note and the
treasury policy skeleton for corporates, the investment strategy addendum and the auditor
evidence checklist for SMSFs. Every one is a draft, for the same reason the first two were, and
each migration header carries the `UPDATE` that publishes it.

The bundle's outline was followed section for section. Three places where it could not be, all
of them about which sections bind facts:

- **The audit committee note's section 2 is marked "(facts)" and binds none.** The fact meant is
  the AASB position, and `FACT_SOURCES` cannot express it: the registry serves observed and
  reported series with a provenance rail and an expected cadence, and an accounting standard is
  neither. The measurement basis is the subscriber's answer; `regulatory_reference` on the
  section is what points them at the standard. `btc_spot_aud` binds to the valuation section
  instead, because a price is evidence about methodology and not about classification.
- **The auditor checklist's item 8 is marked "(facts)" and binds none either.** A custody
  provider's regulatory status as at a date is a `/signals` entry with a Lex-gated compliance
  class, not an indicator series. Routing it through `facts` would strip that gate, so the
  subscriber reads it on `/signals` and states it here. The as-at date is the whole of the item
  and the signals page is where the as-at date lives.
- **The treasury policy binds nothing at all**, and is the only seeded template of which that is
  true. A policy states standing rules; a fact is true as at a timestamp. A spot price inside a
  standing instruction is stale within the week, and worse than stale — it reads as the figure
  the limits were set against.

Section 4 of the treasury policy is the one to re-read at review. It is a limits framework —
position limit, concentration limit, rebalancing trigger — containing no figures at all,
because the right numbers depend on a balance sheet Minute has deliberately never seen. Nothing
enforces the absence of digits there and nothing can: a constraint rejecting digits would reject
a clause number too. The template test's bare-percentage check is the nearest thing, and it is a
backstop rather than a guarantee.

The six SIS Reg 4.09(2) heads in the investment strategy addendum are reproduced as the
regulation puts them. That is the safest writing in the whole feature — BTS is quoting the
regulation at the trustee and the trustee is answering it — and it is worth noticing that the
diversification head cannot be answered from anything BTS holds, because it asks about the
fund's investments as a whole.

**Verified**: all six bodies through the real parser and validator, all four migrations against
the local mirror, and `active_requires_lex_review` exercised both ways on the treasury policy —
rejected with no reviewer, accepted once one is named, rolled back.

---

### Session 4 — the Lex approval queue

`/compliance` in `apps/web`. Two tables gate what a paying subscriber can see, both carry a
CHECK constraint saying nothing goes live without a named reviewer, and until this page existed
the only way to satisfy either was an `UPDATE` written by hand into a migration header. That is
a workable answer once and an unworkable one every quarter.

**The two review views are not an approval queue, and it took building one to notice.**
`v_prepare_template_reviews` and `v_client_library_reviews` both filter to rows that are already
live — they were written to feed a review calendar, and they do that well. The queue needs the
opposite set, the drafts nothing has published yet, so the page reads the base tables and the
views stay what they are. `apps/web/lib/compliance/queue.ts` holds the rules as pure functions
because they are the part that must not be wrong, and the awkward one is that the two tables
spell the live state differently: a template is `active` and a library entry is `published`.
Getting that backwards would leave published entries sitting in the review queue for ever, so
it has a test of its own.

**Review and publication are one action, not two.** Both constraints already make review the
precondition of publication, and template bodies live in migrations — so a reviewer who finds a
problem does not fix it on this page, they change the migration. That leaves publication as the
only outcome the surface produces, and two buttons would invite exactly the state the
constraints exist to prevent: reviewed, and quietly never published.

**`client_library_entries` gained `lex_notes`, and the migration was amended in place.** Writing
the action exposed the gap: it required a note before publishing and then had nowhere to put one
for a library entry. `prepare_templates` had the column and the library table did not, which
made a library review a timestamp and a name — nothing a person reading the row in eighteen
months could use. Amended rather than corrected forward, for the reason recorded above: these
migrations have never run anywhere.

**`apps/web`'s Supabase client is now typed against `ClientDatabase`.** It is `Database` plus the
pending-types bridge, so it is a superset and every existing query kept its types — the whole
workspace typechecks unchanged. It reverts when the migrations are applied and the bridge is
deleted. *(It has since reverted — see "The bridge came down" below.)*

**Verified**: 38 new tests (21 on the pure queue rules, 6 on the page's bucketing, 11 on the
action), the whole workspace green at 604 web tests and clean typecheck, and the publish flow run
against the local mirror as the exact statements the action issues — the row goes active with its
note, and a second active version of the same slug raises `23505` on
`idx_prepare_templates_one_active`, which is the code the action translates into a sentence
naming the fix.

---

### Session 4 — the client fixture adapter

`@platform/data-fixtures` now implements the ten client read domains and the two writes, and
`describeClientContract` runs against it as a second adapter. The reason to want one was recorded
as outstanding from the first session: a contract suite that only ever meets one implementation
gets shaped around that implementation's habits, and nobody notices until the second one arrives.

**Two assertions stopped being partial.** The Supabase side runs against a canned-response fake
that cannot honour a `.eq()` or an `.in()`, so assertion 5 (no unpromoted signal) and assertion 7
(no cross-type template) were each split into "the fake hands back pre-filtered rows" plus "a
separate case checks the adapter issues the filter". The fixture adapter holds the unpromoted
signal and all three client types' templates in its data and filters in TypeScript, so each is
one whole check again.

**The suite was mutation-tested rather than trusted.** Assertion 7 passed vacuously once already
in this build, so a green suite against a new adapter is not evidence on its own. Three
deliberate breaks were introduced one at a time — drop the promoted filter, drop the client-type
filter, remove the disclosure gate — and each was caught (1, 2 and 1 failures respectively), then
reverted. The suite is testing the adapter, not the fixtures.

**Two things the typechecker found that a reviewer would not have.** The fixture set had no
`client_type = 'both'` template, which the column allows and the live adapter serves — a template
nobody sees is a template nobody tests, so one was added and assertion 7 got harder. And the
fixture template rows carry their own `clientType`, which now wins over the body's, mirroring the
live adapter: there it matters because the RLS policy filters on the column, so a body claiming
`both` while the column says `smsf` must not widen who gets it.

**`DisclosureRequiredError` moved to `@platform/data`.** It was defined in the Supabase adapter,
and two adapters throwing two classes for one contract condition would make an `instanceof` check
right against one and silently wrong against the other. `@platform/data-supabase` re-exports it,
so every existing import still resolves.

What this does **not** do is give the client app a demo surface. There is no fixture-backed
Minute, and nothing here asks for one — the adapter exists so the contract has two implementations
to be a contract between.

---

### Session 4 — publishing a compliance document

`/compliance` gained the two things that stood between a filled database and a working gate: the
`company_profile` singleton as a form, and the compliance documents with a resolve-preview and a
publish action.

**The interesting part is a partial unique index.** `idx_compliance_documents_one_active` is on
`(doc_type) WHERE status = 'active'`, so publishing a new version means superseding the incumbent
and activating the successor, and the state in between is zero active Service Statements — which
locks every subscriber out of Minute. The obvious single statement does not work:

```sql
UPDATE compliance_documents
   SET status = CASE WHEN id = p_id THEN 'active' ELSE 'superseded' END
 WHERE doc_type = ... AND (id = p_id OR status = 'active');
```

Postgres maintains the index as each row is updated, so whether that succeeds depends on which
row the executor reaches first. Tested both ways against the mirror: incumbent-first succeeds,
successor-first raises `23505`. **A statement that passes or fails on physical row order is worse
than one that always fails, because it passes in testing.** So
`activate_compliance_document(p_id)` does it as two statements in one function body — the index is
checked at the end of each — and it is `SECURITY INVOKER`, because it needs no elevated rights and
a definer function here would be a way to change what a subscriber acknowledges without passing
RLS.

**Publication is refused server-side when the document cannot resolve**, not merely disabled in
the UI. The action re-reads the profile and re-runs `resolveDocument` before calling the RPC,
because the button that got you there can be stale — someone else may have blanked a field since
the page rendered — and an active statement whose variables do not resolve is the same lockout as
no statement at all, with a more confusing error.

**No body editing, deliberately**, matching the `/prepare` templates: bodies live in migrations,
the migration is the reviewed artefact, and a textarea saving over one would put the two into
silent disagreement. The page previews the *resolved* body in monospace rather than rendering the
markdown, because what matters at this moment is that every `{{variable}}` became a value, and
rendered prose makes a stray brace easy to miss.

**The profile form names only the fields the statement actually uses.** Which those are is a
property of the body, not a constant — reporting the terms of service blocked on a complaints
phone number no document mentions would be a lie.

**Verified**: 29 new tests, the whole workspace green, and the real flow run against the local
mirror — profile filled, seeded statement activated through the RPC, exactly one active row, and
the RPC raising rather than silently no-opping on an unknown id.

---

### Session 4 — editing, and the rule underneath it

Both compliance documents and `/prepare` templates are now edited from `/compliance`. The
previous session had declined to build this, on the grounds that bodies live in migrations and a
textarea saving over one puts the reviewed artefact and the database into silent disagreement.
That reasoning was half right, and the missing half turned out to be the more important rule.

**Two denormalised columns decide it.** `client_disclosures.document_version` records what a
subscriber acknowledged, and `prepare_generations.template_version` records what a pack was built
from. Neither is a foreign key — both are copies of the version string, because the row they
describe gets superseded and the record has to outlive it. So editing the body of a *live* row
does not create a documentation drift problem, it silently invalidates evidence: someone
acknowledged text that no longer exists anywhere, and nothing in either table would show it,
because both store the version string and the version string did not change.

The rule, therefore, is not "no editing". It is:

- **Editable while unpublished** — draft, under review, approved.
- **Frozen once live**, and frozen when retired: a superseded Service Statement is the exact text
  someone was given, which is what makes it evidence.
- **Changing a live one means cutting a new version**, which gets its own acknowledgements.
- **Editing a template body clears its Lex review**, because a review describes specific text.

All four are triggers in `20260912050000_frozen_bodies.sql`, not app code, because this is the
kind of rule an app forgets — a second surface, a script, a console session at 11pm all go through
Postgres. Clearing the review rather than rejecting the edit is deliberate: rejecting would mean a
reviewer who spots a typo has to get the review unpicked first, and the likely outcome of that
friction is the typo shipping. Clearing costs a re-review, which is the correct price and the same
bargain a new commit strikes with a code-review approval. `active_requires_lex_review` then
composes with it — verified — so a freshly edited template cannot be activated at all.

**Template saves run the validator and refuse.** This is the check
`packages/shared/src/prepare.ts` has always said belonged in `apps/web` — "validates on save
before a founder can set a template active" — and until there was an editor there was nothing to
validate. It refuses rather than warns: a template that saves and will not render is discovered
by a subscriber halfway through a board paper, and a warning is the shape of thing that gets
clicked past. Every problem is listed, not just the first, and the same parse writes
`facts_required`, so the column and the body cannot come to disagree about what the body says.

Library entries are **not** editable here. Their bodies are prose with no parser behind them, so
an editor would be one with no validation — a different thing, worth building deliberately rather
than by extension.

**What this does not solve** is the original concern, and it should not be claimed as solved: a
migration that has been applied is history, the database is then the live copy, and a fresh
environment seeded from `supabase/migrations/` gets the seeded text rather than the edited text.
That is correct for staging and wrong for nothing in particular today, but it is drift, and it is
the reason to keep substantive rewrites in migrations rather than typing them into the box.

**Verified**: 48 new tests, the whole workspace green, and every trigger branch exercised against
the local mirror — live body rejected, live version rename rejected, other columns on a live row
still writable, a draft edit clearing the review, `active_requires_lex_review` then blocking
activation, a no-op body write leaving an untouched review standing, and the new-version copy run
against the real seeded board paper with its front matter bumped and the duplicate rejected.

---

### Session 4 — a UI coverage sweep, and what it found

A sweep across routes, tests, tokens and accessibility turned up one thing that
outweighed everything else: **the client-facing gates had no team-side UI at all**, so
`/signals`, `/register`, `/directory` and `/library` would have shipped permanently empty. Not
broken — empty with no error, which is worse, because an empty page reads as a quiet day. Only
the Brief worked, because `market_reports` is produced by an existing routine.

And underneath that, **nothing anywhere inserted a `client_invites` row.** There was a redemption
function and no issuance path. Minute had a front door and no way to hand anyone a key. That is
now `/clients`: accounts, seats, and invitations whose token is minted and hashed in Node so the
plaintext never reaches Postgres, shown once and unrecoverable by construction.

**The sharpest find was not a gap but a break.** `flagClientRelevant` already existed, worked, and
was tested — and it sets only `client_relevant`. The client-app migrations add
`promotion_needs_approver`, which rejects that. So applying the migrations would have broken a
shipped feature, and nothing caught it: the migration is unapplied, and the action's test mocks
the repository, so neither side could see the other. The fix is in the adapter rather than the
app, taking the promoter from the principal bound at construction — no contract change, no
signature change, and the one place it could go wrong is now the one place it is tested.

That reframed the work. The first instinct was a `promoteSignal` action alongside the existing
one, which would have left two paths to the same state — worse than none. What was actually
missing on that surface was the **client-safe note**, a second column with a second author:
`curator_note` is written for a director and is allowed to editorialise, and a programmatic copy
would eventually carry "we would move off this custodian" onto a subscriber's screen. Promotion
is an act of authorship, not a filter.

`setRegisterClearance` and `classifyProduct` are genuinely new, and both refuse before the
constraint does — `classification_has_reasoning` would reject a classification with no note, and
a sentence explaining why beats a constraint violation.

**Still outstanding from the sweep**, and not yet done: the controls for register clearance and
product classification are actions without a surface; `/library` has no sections, no entries and
no editor; `apps/web` carries 214 accessibility warnings, 192 of them one unassociated-label
pattern; 15 raw hex values sit outside the token system, which `globals.test.ts` cannot catch
because it guards the token *set* and not its *use*; and UI test coverage is 15/72 pages in
`apps/web` and 0/15 in `apps/client`.

---

### Session 4 — what operating Minute actually needs

The sweep asked whether the UI was covered and answered in terms of launch: could a subscriber
be onboarded, could each gate be passed. Running it is a different question, and three of its
answers were missing.

**Blast radius had no reader.** `prepare_generations` exists, in its own table comment, so that
"if a template is later found to be wrong, this answers who received it." Nothing queried it. The
compliance capability the table was built for could not be exercised — and it is the kind that
only gets asked for in a bad week, when nobody has time to write the query. It now sits beside
each live template's review date, scoped to that **version**: a recall is of specific text, and
counting every version would send someone chasing packs built from wording that was never in
question. It counts `created` only, because a pack exported three times is one document in one
subscriber's hands and overstating a recall is the specific way this number does harm.

**Nobody could see who was locked out.** Publishing a Service Statement version puts every
subscriber back at the gate until they re-acknowledge — and `/compliance` had just made that one
click. A self-inflicted outage with no visibility, introduced two commits earlier by the button
that causes it. `/clients` now names the people sitting at the gate per account. A superseded
acknowledgement does not count, which is the point: it is a record of agreeing to different
words.

**No usage signal.** `last_seen_at` sat on every seat and nothing aggregated it. "Never opened"
is kept distinct from "dormant" because they are different problems — onboarding that stalled
versus interest that faded — and pre-revenue, with a handful of accounts, that distinction is
most of the signal.

The thresholds (14 days, 42 days) are not rules from anywhere and the code says so. Two weeks is
long enough that a busy fortnight does not trip it; six is long enough that calling an account
dormant is a statement rather than a guess.

**A test caught an ordering bug** in the page wiring — `generationRows` used above its
declaration, which typecheck accepted and the runtime did not. Worth noting only because it is
the second time this session that a page test earned itself on a mistake typecheck could not see.

---

### Session 4 — the advisor grant, closed

A question about whether Minute's `/directory` shows the same products as the internal ecosystem
register turned up a second source nobody was reading. `20260911030000` granted subscribers
`advisors_partners` where `active = TRUE`, on the reading that the spec's "every listed entity"
covers both ecosystem registers. `ClientDirectoryRepository` never queried it.

The grant should not be opened, and the reason is not squeamishness about listing people.

`advisors_partners` holds **named individuals** — `type IN ('advisor','partner')`, with `bio`,
`linkedin_url`, `rate_notes` and `specialization`. There is **no classification gate** on it: the
directory's no-call-to-action rule hangs entirely off `products_services.is_financial_product`,
and advisors have no equivalent, so nothing structural stops an advisor card carrying an outbound
link. "Advisor" is **restricted under s923C**, so a subscriber-facing list headed from that column
uses the word in the one context `naming.md` forbids.

**The deciding one is the fee.** `engagement_model` allows `'revenue_share'`, and `no_fees_mvp`
does not reach it — that constraint is on `commercial_relationships`, forcing
`fee_basis = 'none'`. So an advisor on a revenue share could appear in the directory while
`/directory/how-we-make-money` truthfully reported no fees, because the fee lives in a table that
page does not read. Accurate and misleading at once, which is worse than either, and it defeats
the disclosure route's whole purpose.

Closed **pending a decision**, not forever. Re-granting is one policy; the preconditions are the
work — a classification gate of its own, `engagement_model` brought under the fee rule or
surfaced in the disclosure, and a heading that is not a restricted term. All three are named in
the migration header and in the test's failure message.

`apps/client/lib/boundary.test.ts` now asserts the migrations leave no client-read policy on the
table, and that `CLIENT_READ_DOMAINS` has no `advisors` — the runtime and compile-time halves of
one rule, failing together. Mutation-tested: removing the `DROP` fails the guard with the three
preconditions in the message.

**The general lesson is the shape, not the table.** A live grant on an unread table is the worst
state for a permission to be in, because wiring it up later reads as using something that already
exists rather than as making a decision. Worth checking the other client policies against what
the contract actually reads.

---

### Session 4 — the final sweep

**Closing the advisor grant broke the disclosure route, and the sweep caught it.**
`ClientDirectoryRepository.disclosures()` resolves entity names for both `entity_type`s, so with
no grant at all an advisor relationship rendered as **"Unnamed entity"** — disclosing that an
arrangement exists while hiding who it is with, on the one page whose entire purpose is candour
about BTS's own revenue. Worse than the blanket grant it replaced.

The answer is neither grant. `advisors_partners_client_disclosure_read` exposes exactly the rows
an active `commercial_relationships` row names, and nothing else: an advisor BTS has an
arrangement with can be named because BTS is obliged to name them; one it does not stays
invisible. Verified against the mirror as a subscriber — two advisors, one disclosed, only one
readable.

**The rest of the grant audit came out clean.** Of the tables granted to subscribers,
`company_listings`, `research_company_facts`, `treasury_events`, `onchain_observations` and
`indicator_observations` are all reached through embedded selects, so the grants are load-bearing
even though no query names them. `holding_bases` and `source_classes` are reference lookups with
no entity identity, granted for a rendering path the adapter does not yet take — worth knowing,
not worth closing.

**Three bugs in this session's own code**, all in `/clients`, and the first is the worst thing
written all session:

- **The copy button lied.** `void navigator.clipboard?.writeText(link)` followed by an
  unconditional `setCopied(true)`. Outside a secure context the API is absent; when permission is
  refused the promise rejects and `void` swallows it. Either way the button said "Copied" and
  nothing was on the clipboard — and the token is shown once and unrecoverable, so the sequence
  copy, "Copied", Done loses an invitation permanently. It now awaits the write, claims nothing
  it did not do, and on failure says the link is about to be lost.
- **Disabling a seat failed silently.** The action's result was discarded, so a refusal looked
  identical to success. That is access revocation: believing it worked when it did not is the
  dangerous direction.
- **Changing a subscription status** did the same thing, less dangerously.

All three are mutation-tested — each fix reverted, each caught.

---

### Session 4 — the bridge came down

The migrations applied (see "It did not apply the first time" above for the detour), the
migrate workflow regenerated `packages/db/src/types/database.ts` from the live schema, and
`packages/db/src/types/pendingClientTables.test.ts` went red on the next run — which is what it
was written to do. All eleven bridged tables were in the generated types, along with the four
sets of added columns and all five functions, so the bridge had become a hand-written override
of a generator that now knew better. It is deleted, and `ClientDatabase` is gone with it: the
five consumers (`apps/client`'s three clients, its middleware, and the client adapter's
`ClientSupabaseClient`) type against `Database` like everything else.

Two things worth recording.

**The types commit was pushed with `[skip ci]`, so nothing checked it.** The regenerated types
landed on `main` and took the test red with them; the failure was only visible to someone
running the suite locally. That is the same shape as the migration collision — a workflow
writing to `main` without anything gating what it writes — and it is why the bridge test was
worth having: without it, the drift between a hand-written type and a generated one would have
been silent instead of loud.

The `[skip ci]` is now gone. That commit rewrites a type every package compiles against, so it
can break the build by itself, and letting `Tests` run on it costs a few minutes per migration
deploy. It cannot loop: `migrate.yml` triggers only on `supabase/migrations/**` and its own
file, and the types commit touches neither.

**`test.yml` gained a `workflow_dispatch`,** for a reason found the same morning. GitHub did not
deliver the `pull_request` event for the PR that removed the bridge: its head commit got no run
at all, while the checks GitHub *displayed* against the PR were runs from two earlier commits on
the same branch — a green tick attached to code nobody had tested. With no dispatch handle the
only ways to get a run were an empty commit or closing and reopening the PR. There is a button
now.

**One narrowing was lost, deliberately.** The bridge typed
`field_source_minimums.client_fact_class` as `'implementation' | 'outcome' | null`; the
generator emits `string | null`, because that column is a CHECK constraint rather than a
Postgres enum and no generator can see through one. The single consumer is the
`.eq('client_fact_class', 'implementation')` filter in the register repository, and
`conformance.test.ts` pins that literal, so a typo is caught at test time rather than compile
time. Keeping a one-column bridge to preserve it would have re-created the exact problem the
bridge test exists to prevent — a hand-written type overriding the generated one — for a string
that is already asserted.

---

### Session 5 — the Brief said "streak" and nothing else

Session 4 recorded that "only the Brief worked, because `market_reports` is produced by an
existing routine." The route worked. What it rendered did not, and nothing caught it because
both sides were tested against their own vocabulary.

`market_reports.findings` is written by the agent-side findings engine, whose shape is `Finding`
in `@platform/shared`: `metric_key`, `observed`, `baseline`, `narration_hint`, `evidence_refs`.
The client adapter's `toBrief` read `headline`, `detail` and `provenance`. **Nothing has ever
written any of the three.** So every live finding reached the page as an empty headline, an
empty paragraph and "Source not attached" under a type chip — a subscriber saw the word
"streak" and no other content. The fixture adapter's briefs were authored in the read model's
own vocabulary, so the page test passed against data no production row could produce; the
conformance suite asks only whether a quiet day is a column rather than an inference, which it
was. Two green suites, one unrenderable page.

The translation now lives in `packages/data-supabase/src/client/briefFindings.ts`, on the way
out rather than at write time, so every brief already published becomes legible — a new column
would only have fixed the next one. `narration_hint.means` is the headline (the engine already
writes a plain-language sentence: "Volatility (30d) has held between 46.9 and 51.8 for 10
consecutive days"), `noise_note` the detail, `observed` and `baseline` the evidence rows, and
the indicator catalogue behind `metric_key` the provenance.

Four things that reading the computors changed, none of which were obvious from the read model:

- **`observed` is not the series' value.** Each computor picks whatever quantity suits its
  question: an anomaly measures a period-over-period percentage change against the distribution
  of those changes, a divergence a trailing correlation, a streak a count of periods held. Only
  a threshold crossing reports the level. The first draft applied the indicator's own units
  uniformly, which would have printed an anomaly's `-3.43` as a Mayer Multiple ratio and called
  a percentage something else. The `SHAPES` table names the space per type. Inflection has three
  code paths — run length, forecast level, or moving-average spread, by series — so it claims no
  unit at all, because mirroring the computor's key lists here would put a second copy of the
  engine's internals in the adapter and the two would disagree the first time either moved.
- **The invariant that made the evidence strip possible** is that `observed` and the `baseline`
  percentiles are always in the same space as each other, whatever that space is. So a card can
  always show the figure against its own band; what it must not do is assume which units those
  are.
- **A derived metric carries no provider,** because the schema forbids it one. The Mayer
  Multiple is a ratio of BTC/USD to its own 200-day average, and the average is derived too, so
  provenance walks `derivation_spec` to the fetched series underneath. Stopping at the first hop
  is what "Source not attached" was, over perfectly good provenance.
- **`basis` describes the quantity, not the series.** Coin Metrics publishes BTC/USD; it does
  not publish "fell 3.4% over the day". `reported` is claimed only where the observed figure is
  the series' own published value on a series someone fetched, and everything else is `derived`,
  which the rail prints as "computed from this source".

**The rail was also dating findings wrong.** The stored key is `as_of`; the adapter read only
`as_at`, so it fell through to the report's publication date. A report published on the 17th
narrating an observation from the 16th said "As at 2026-09-17".

`Finding` gained `evidence: FindingEvidence[]`, pre-formatted strings for the same reason
`Fact.value` is one. The strip is the card's substance — a subscriber paying to be told what
changed is owed the measurement, not only the sentence about it. The recent-days list now shows
each day's first headline instead of a count: "3 findings" says how much was missed without
saying whether any of it mattered.

Verified against production rather than against fixtures: five published `market_reports` rows
covering all four live finding types were run through the projection and read by eye, and the
unit tests were mutation-checked one rule at a time — no chain walk, no hint fallback, series
units on an anomaly, `as_at` only — each of which takes the suite red.

One thing left alone. `packages/data-supabase/src/client/facts.ts` formats a percentage on
`unit === '%'`, and the live indicator tables spell it `percent`, so `/prepare` renders a cash
rate as `3.85` rather than `3.85%`. Pre-existing, adjacent, and not this change.

---

## Open, and deliberately so

- **A1, now "was the not-advice position assessed against Minute specifically".** Outstanding,
  and no longer a deed to read — it is a question about whether whoever advised saw a narrated
  brief, a register of named entities and provider monitoring, or saw the education and
  consulting business.
- **The Service Statement.** Drafted and seeded; **not reviewed and not active**, and it
  blocks first login. Sections 2, 4 and 6 need the eye of whoever advised on the position;
  section 8's terms and the privacy URL came from conversation. Reviewing it is still a human
  act, but publishing it is no longer a hand-written `UPDATE` — `/compliance` in `apps/web` does
  it, and refuses while the document cannot fully resolve.
- **The Supabase redirect allow-list.** Sign-in links still land on `localhost:3000`, and the
  app is no longer the reason: both send paths pass `emailRedirectTo` through
  [`lib/siteUrl.ts`](../../../apps/client/lib/siteUrl.ts), and both have since the fix. What
  remains is a project setting. GoTrue matches redirect URLs exactly and treats an unregistered
  one as absent rather than invalid — it drops the callback, falls back to the project's Site
  URL, and returns no error, so a correct `emailRedirectTo` and a missing allow-list entry are
  indistinguishable from the app's side. A fresh project's Site URL is `http://localhost:3000`.
  Fixing it means setting Site URL to `https://minute.btreasury.com.au` and adding
  `https://minute.btreasury.com.au/auth/callback` to Redirect URLs, neither with a trailing
  slash, under Authentication → URL Configuration. Nothing in this repository can do it: the
  migrate workflow runs `supabase db push`, and `supabase/config.toml` configures
  `supabase start` only — it now registers the loopback callbacks so local dev works, which is
  the most the repo can reach. Like the privacy URL was until `20260916010000`, this is the
  shape of problem that costs a day: every artefact in the diff is correct and the feature is
  still broken. That one was fixable by moving the value into the database. This one is not.

- **`company_profile` is eight fields short.** It was thirteen. Migration
  `20260916000000_consolidate_company_identity.sql` copied the five that already existed as
  `company_records` rows — legal name, trading name, ABN, ACN, website — and retired those
  record types, so the company's legal identity now has one home rather than two. The other
  eight (registered address, state and postcode, public phone and email, and the three
  complaints fields) existed nowhere in the schema and are still blank; the gate fails closed
  until they are filled, on the `/compliance` form, which marks each blank field the Service
  Statement actually uses. **Nine now**, and the ninth is the one that caught someone:
  `bts_privacy_policy_url` was `NEXT_PUBLIC_PRIVACY_POLICY_URL`, read by **both** apps — the
  gate in `apps/client` and the publish page in `apps/web` — on separate Vercel projects, so a
  complete profile plus an unset variable still blocked the gate, and the natural move was to
  set it on Minute and then read `/compliance` in `apps/web` insisting it was unset. Migration
  `20260916010000` made it `company_profile.privacy_policy_url`, a field on the same form as
  the other thirteen. Nothing reads the variable now; delete it wherever it is still set. Note
  that no SQL can backfill it, so a project that already had the variable starts with an empty
  column — the value has to be typed in once.
- **`is_financial_product` backfill.** 24 rows, human judgement each. A reading pass over all
  twenty-four is drafted in
  [`compliance/directory-classification-worksheet.md`](./compliance/directory-classification-worksheet.md)
  — eleven proposed `true`, thirteen `false`, five flagged as genuinely arguable — but nothing
  is written and the database still requires a person to name themselves against each row.
- **Print fidelity in Safari (A9).** The export is not an export feature until it has been
  tested there, and it has not been.
- **Co-editing (A10).** Two individual trustees on one minute is the normal case, not an edge
  case, and the working-copy JSON hand-off is a workaround.
- **The seasonal 30 June valuation pack.** All six artefacts are now seeded; the seventh is the
  seasonal variant, which is items 6, 7 and 8 of the auditor evidence checklist run standalone
  between 1 May and 31 July. It is deliberately not a seventh body: a copied subset drifts from
  its parent, and the drift is invisible until a subscriber assembles a valuation pack that
  asks an older question than the checklist does. It should be generated from the checklist.
- **Cited-fact staleness**, the open question 0.4.0 added. A fact cited in March and refreshed
  in May may carry a newer date and a changed value while the prose around it still argues the
  old one. The export states both dates so a reader can see it; nothing detects the stale
  sentence, and the spec is right that it is probably unsolvable.

