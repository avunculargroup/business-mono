# Assumptions

Everything in this bundle that was inferred rather than verified. Ordered by how much damage
a wrong assumption does. Work down from A1; do not start session 1 with A1–A4 unresolved.

**A2, A3 and A4 were verified against the live database on 2026-09-11** and carry their
answers below. A2 was wrong by roughly an order of magnitude and A4 was wrong outright. The
full record is in [`build-progress.md`](./build-progress.md).

---

## A1 — The not-advice position is settled, and its scope is not documented here

**Stated:** BTS has never held an AFS authorisation and has never needed one. It does not give
financial advice, and bitcoin is not a financial product.

**Why it still appears at the top of this list:** every structural rule in the bundle exists to
keep that true as the product grows — no personal circumstances, no conclusions in templates,
no rankings, no characterisation of a named security. Those rules are load-bearing rather than
prudent, because the fallback of "it was only general advice" is not available.

**Two surfaces touch financial products regardless of bitcoin's status,** and both are already
handled structurally rather than needing new work:

- `/register` covers listed securities. Handled by implementation-facts-not-outcome-facts.
- `/directory` covers DAPs and TCPs, financial products since April 2026. Handled by
  `is_financial_product` stripping the call to action.

**Worth confirming once:** that whoever advised on the position saw the Minute product
specifically — a narrated daily brief, a register of named entities, monitoring of custody
providers — rather than the education and consulting business. Advice is only as good as the
description it was given.

> **Status: outstanding, and not a code task.** Nothing built depends on the answer in a way
> that could not be relaxed. What the build did add is a second structural handle on the
> `/register` half: `field_source_minimums.client_fact_class` splits implementation facts from
> outcome facts, and an unclassified key is invisible to subscribers rather than visible.

---

## A2 — Live RLS policies beyond `schema.sql`

**Assumed:** every table added since the original schema carries the same
`auth.role() = 'authenticated'` policy, because the pattern was copied.

**Why it matters:** migration 001 rewrites eleven named policies. If the live database has
forty tables and thirty of them carry the permissive pattern, fixing eleven and shipping a
client login exposes the other nineteen.

**How to resolve:** run the audit query at the end of `001-rls-hardening.sql`. Every row it
returns is a table a subscriber could read. Fix all of them.

> **Status: resolved, and the assumption was understated.** Not forty tables — **114
> permissive policies across 107 tables**. Worse, the audit query itself misses a whole class:
> 14 policies read `USING (true)` for `authenticated`, which is more permissive than the
> pattern being hunted and returns nothing from a grep for `auth.role()`. The hardening
> migration covers all 114, preserves the two deliberately open policies, and adds a
> regression guard so the next one fails a test instead of waiting to be noticed.

---

## A3 — Ecosystem and directory table and column names

**Assumed, from the feature spec rather than the live schema:**

- `ecosystem_changes` exists with `client_relevant` (boolean) and `compliance_class`
- `products_services` and `advisors_partners` exist with those names
- `compliance_documents` and `contracts` exist as specified — these are from `schema.sql`
  extensions and are more likely correct

**Why it matters:** `003-directory-and-signals.sql` will not run if any name is wrong. This is
the most likely thing in the bundle to fail on first execution.

**How to resolve:**

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ecosystem_changes','ecosystem_watches',
                     'products_services','advisors_partners')
ORDER BY table_name, ordinal_position;
```

> **Status: resolved, and the assumption held.** `ecosystem_changes.client_relevant`,
> `.compliance_class` and `.curator_note` all exist with the assumed types;
> `products_services.australian_owned` and `.slug` exist; `advisors_partners` exists. The
> `update_updated_at()` trigger function exists under that name.
>
> **`compliance_documents` and `contracts` do not exist** — that half belongs to A4 and was
> wrong.

---

## A4 — The Service Statement needs writing

**Assumed:** `compliance_documents` will hold a Service Statement with `status = 'active'`
before session 2 completes.

**What it is:** a plain statement of what the service is and is not — factual information
rather than financial advice, no client assets held, no facility to consider the subscriber's
circumstances, paid by the subscriber and by nobody else.

**What it is not:** an FSG. No FSG is required, and publishing one would wrongly imply an
authorisation BTS does not hold and has never held.

**Why it matters:** the blocking gate has nothing to serve without it, and session 2 cannot
complete. It is also the artefact that evidences the not-advice position if anyone ever asks,
which makes it worth writing carefully rather than quickly.

> **Status: the table now exists; the document does not.** `compliance_documents` was not in
> the live database at all — nor `contracts`, `company_profile` or `compliance_obligations`,
> all four of which the bundle assumed. Two have been created minimally, because the gate
> blocks every route and cannot be built against a table that does not exist; the `contracts`
> FK was dropped instead, since nothing is blocked by its absence.
>
> `doc_type` admits `service_statement` and `information_notice` and **rejects `fsg`** — the
> CHECK constraint is the structural half of "no FSG is required, and publishing one would
> imply an authorisation BTS does not hold".
>
> Nothing is seeded. **Writing the Service Statement is the single thing blocking first
> login.**

---

## A5 — Personas are separable at the account level

**Assumed:** every subscribing account is either corporate or SMSF, and `client_type` is a
single value per account.

**Where it breaks:** a CFO who also runs an SMSF, or an accounting firm subscribing on behalf
of both kinds of client. Neither is exotic.

**Current handling:** none. `client_type` is a single column with a CHECK constraint. If the
first ten accounts include one of these, the answer is probably two accounts rather than a
multi-valued column, but that should be a decision rather than a discovery.

---

## A6 — Fact keys and their sources

**Assumed:** the fact keys referenced in the `/prepare` templates — `btc_spot_aud`,
`btc_realised_vol_90d`, `au_dap_licensing_status` and the rest — either exist in the
indicators spine or can be added.

**Why it matters:** `facts_required` validation rejects a template referencing an unknown key,
so every template is blocked on its facts existing.

**How to resolve:** enumerate the available keys first, write templates against what exists,
and treat missing facts as a backlog rather than a blocker. A template with fewer fact
bindings still works; the subscriber's prose is the substance.

---

## A7 — Coin Metrics community tier catalogue

**Assumed:** the on-chain series currently in use are still available on the community tier.

**Note:** the catalogue shifted in October 2025 and verification was already outstanding
before this bundle. Anything relying on MVRV, realised cap or active addresses needs checking
before it appears on a client surface, because a series that silently stops updating becomes a
stale fact in a board paper.

---

## A8 — `is_financial_product` classification is a human judgement

**Assumed:** a founder assesses each directory entity against the DAP and TCP definitions in
s764A(1) as amended, and records reasoning.

**Why it matters:** the column is `NOT NULL` with no default precisely so this cannot be
skipped, which means the directory cannot ship until every existing row is assessed. That is
real work and it is not in the session plan as a code task.

**Edge cases likely to be contested:** a hardware wallet vendor that also offers a
collaborative custody service; an exchange that has exited custody but retained brokerage; a
provider mid-application whose status changes during the transition period.

---

## A9 — Browser print fidelity

**Assumed:** print-to-PDF via a print stylesheet produces acceptable output across Chrome,
Safari and Firefox.

**Known risk:** Safari handles page breaks inside tables poorly, and the auditor evidence
checklist is mostly tables. Untested. This is not an export feature until it has been tested
on the browsers subscribers actually use, which for this audience skews Safari harder than
usual.

---

## A10 — Local-only storage is acceptable to subscribers

**Assumed:** subscribers accept that packs live on one device, with a JSON working copy as
the backup and hand-off mechanism.

**Where it breaks:** an SMSF with two individual trustees who both need to contribute to a
minute. That is the normal case, not an edge case.

**Honest position:** the working-copy hand-off is a workaround, it will be the first
complaint, and the answer may be that co-editing is worth revisiting local-only for. Do not
discover this from a churned subscriber.

---

## A11 — Manual billing holds

**Assumed:** invite-only means every account is provisioned by hand, so no payment integration
is needed.

**Breaks at:** roughly twenty accounts, or the first time a renewal is missed because nobody
sent an invoice. `subscription_status` and `subscription_renews_at` are the fields a provider
webhook would drive when that day arrives.

---

## A12 — Regulatory currency

The Digital Assets Framework Act received assent in April 2026 and the transition
arrangements run for eighteen months from commencement. Provider licensing status is in flux
for the whole of that period, which is what makes the directory valuable and also what makes
it perishable.

**Everything in this bundle referencing the regime should be re-checked at build time rather
than trusted from the spec.** A spec is a snapshot; this area is not currently holding still.
