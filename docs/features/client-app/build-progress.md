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
**Last updated:** 2026-09-11

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
deleted.

**Verified**: 38 new tests (21 on the pure queue rules, 6 on the page's bucketing, 11 on the
action), the whole workspace green at 604 web tests and clean typecheck, and the publish flow run
against the local mirror as the exact statements the action issues — the row goes active with its
note, and a second active version of the same slug raises `23505` on
`idx_prepare_templates_one_active`, which is the code the action translates into a sentence
naming the fix.

---

---

## Open, and deliberately so

- **A1, now "was the not-advice position assessed against Minute specifically".** Outstanding,
  and no longer a deed to read — it is a question about whether whoever advised saw a narrated
  brief, a register of named entities and provider monitoring, or saw the education and
  consulting business.
- **The Service Statement.** Drafted and seeded; **not reviewed and not active**, and it
  blocks first login. Sections 2, 4 and 6 need the eye of whoever advised on the position;
  section 8's terms and the privacy URL came from conversation.
- **`company_profile` is empty.** Thirteen fields, none of them inventable — the gate fails
  closed until they are filled.
- **`is_financial_product` backfill.** 24 rows, human judgement each.
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
- **A fixture adapter for the client domains.** There is none, which is why conformance
  assertion 5 is two partial checks rather than one whole one. If `apps/client` ever gets a demo
  surface, the harness is already parameterised for it.
