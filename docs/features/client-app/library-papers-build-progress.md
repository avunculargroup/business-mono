# Library Papers — review and build progress

Checks [`library-papers-spec.md`](./library-papers-spec.md) against the repository and the live
database, and records what has been built. It follows the shape of
[`build-progress.md`](./build-progress.md). Where this file and the spec disagree, trust this
file: it was checked against the repo, and the spec was not.

**Status:** Session 1 (data layer) is built and unapplied. It is one migration,
[`20261010100000_library_papers.sql`](../../../supabase/migrations/20261010100000_library_papers.sql),
and it applies when merged to `main`. Session 0 is still open, and Session 2 should not start
until it closes (see [Session 0](#session-0-what-a-person-has-to-decide)).
**Last updated:** 2026-10-10

---

## The review

The spec holds up: its research, scope and pipeline shape need no changes. The problems were
all in the reference DDL, and three of them would have caused real damage once the feature
went live.

### Would have shipped a defect

| # | Spec said | Problem | What was built |
|---|---|---|---|
| 1 | `abstract` is a column on `papers`; `v_minute_papers` nulls it under `summary_only` | `papers` is readable by subscribers directly through RLS, so `/rest/v1/papers` bypasses the view and returns the abstract. That is exactly the licensing exposure the abstract policy is meant to prevent. | `paper_abstracts` is its own table, and its subscriber policy calls `paper_abstract_displayable()` (see [The abstract policy](#the-abstract-policy)) |
| 2 | The `paper_files` trigger checks `NEW.licence` is approved | The licence is whatever the inserting code claims. A pipeline bug could label an arXiv-default PDF `cc-by` and store it. | The trigger also requires an open location for the same paper with the **same licence and version**. Withdrawing a file always succeeds; un-withdrawing runs the gate again |
| 3 | "The reader gets a short-lived signed URL from a route that checks the subscription first" | Creating a signed URL without a service-role key needs a storage `SELECT` policy for the subscriber, and `apps/client` [never holds a service-role key](./build-progress.md#what-040-changed-and-what-it-cost). Built as written, the route would need that key, or could not sign anything. | `papers_objects_client_select` admits only objects named by a `paper_files` row the subscriber can see: live, under a licence that is still approved, on a published paper |

### Would have stopped the feature working

| # | Gap | What was built |
|---|---|---|
| 4 | The route is `/library/papers/[slug]`, but `papers` had no slug | `slug`, unique, kebab-case, required to publish |
| 5 | "Gold dot on papers added since your last visit", but the only timestamp was `created_at`, which records discovery (often months before publication) | `published_at`, set on first publication |
| 6 | Trigram index on `title`, but `pg_trgm` is not installed on `bts-internal` (checked live) | `CREATE EXTENSION pg_trgm WITH SCHEMA extensions`, with the opclass schema-qualified |
| 7 | "The tier moves up automatically and the change is logged", but nothing did either | `refresh_paper_access()` derives the tier. Triggers on locations, abstracts, a paper's venue, a venue's publisher, a publisher's abstract decision and a licence decision call it. Every tier or licence change writes a `paper_events` row |
| 8 | `UNIQUE (paper_id, landing_url)`, but OpenAlex reports some copies with only a PDF URL, and NULLs never collide | Unique on `(paper_id, COALESCE(landing_url, pdf_url))`, and every location needs at least one URL |
| 9 | DOI "lowercased, no URL prefix", but only as a comment, while deduplication depends on it | `CHECK`s on DOI, OpenAlex ID (`W…`) and versionless arXiv ID |

### Tightened, because the spec's own text asked for it

- **Venue reputation gates publication.** The spec says venue quality needs gating because "the
  field attracts low-quality and predatory journals". Its `CHECK` did not include it, and it
  could not have, because the rule spans tables. A trigger now refuses to publish unless the
  venue is `accepted`.
- **A Lex review covers specific text.** Editing `summary`, `summary_plain` or `curator_note`
  without a new review clears the review, so on a published row the edit fails. This is the
  same rule as published compliance bodies and `/prepare` templates.
- **Publication requires a summary.** The spec says every paper shows one, so publishing needs
  both `summary` and `summary_plain`.
- **Expressions of concern have somewhere to live.** Scope lists them, but neither CHECK did.
  Added `expression_of_concern_on` to the relations and `concern_raised` to the events.
- **`updated_at` triggers**, `papers.discovered_via` as a real foreign key, and
  `from_paper_id <> to_paper_id` on relations.

### Corrections to names and plans

- **There is no agent called Bruno.** The consumers table lists "Margot, Bruno, Charlie".
  Margot (`apps/agents/src/agents/margot/`) and Charlie exist. Bruno does not, so Session 3
  should drop the name or say who was meant.
- **The routine action types do not match the workflows.** Session 1 asks for `paper_watch`,
  `paper_resolve` and `paper_licence_recheck`. But `paperResolve` runs per candidate rather
  than on a schedule, and the weekly workflow is `paperRecheck`. They are **not** added yet: a
  value in the `routines` CHECK with no handler in `executeRoutineWorkflow` lets someone
  schedule a routine that can only fail. Add `paper_watch` and `paper_recheck` in Session 2
  together with their handlers, `RoutineActionType` and `ROUTINE_ACTION_LABELS`.
- **The licence seed carries the Session 0 decision.** Session 0 says to seed
  `paper_licences` "from those decisions", so it does. CC BY, BY-SA, CC0, public domain and
  BY-ND are approved, with Chris Pollard as `decided_by`, and every other code stays link-out.
  A `CHECK` means no licence can be approved without a named decider. BY-ND covers the PDF as
  published and nothing more. Its `allows_adaptation = false` is what the Session 5 reader must
  check before offering anything but the PDF viewer.

### Accepted, with eyes open

- Subscribers can read `papers.lex_notes` and `relevance_basis` directly, as they already can
  with `client_library_entries.lex_notes`. Neither carries anything a subscriber should not
  see, but anything written there is effectively published.
- Revoking a licence lowers the tier of every affected paper straight away, and the file can no
  longer be signed. The stored file itself stays until a person withdraws it, and
  `v_licence_audit` lists it in the meantime. Deleting files automatically on a single click
  seemed worse.
- `paper_chunks` stays team-only. Subscriber search arrives with the Session 5 search RPC, which
  must apply the same rules as the policies here: no `abstract` chunks unless `paper_abstract_displayable()` allows them, and
  `full_text` chunks only for `read_here`.

---

## Session 0: what a person has to decide

None of these are code, and Session 2 depends on all of them.

1. **Licences: decided 2026-10-10.** CC BY, BY-SA, CC0, public domain and BY-ND (PDF only) are
   approved in the seed, decided by Chris Pollard.
2. **CC NC is settled: never rehosted.** Minute is a paid product, which is exactly the
   commercial use NC excludes, so the NC rows stay unapproved and link out.
3. **The abstract policy is decided** (see [The abstract policy](#the-abstract-policy)). Counsel
   confirms it once, as a policy. That is the only counsel item left.
4. **Register an OpenAlex API key** and add it to the agents server's Railway environment.
5. **Hand-label the 40-paper golden set** covering every relevance tier and access tier.

---

## What shipped

### Session 1 — data layer

The migration creates thirteen tables. That is the spec's ten, with authors and authorships as
two tables, plus `paper_abstracts` and `paper_publishers`. It also adds the licence and publication gates, the derived
access tier, RLS, the private `papers` bucket (PDF only, 50 MB) and four `security_invoker`
views.

The spec's three acceptance checks pass, along with 50 more covering the gates above and the abstract policy:

- A `paper_files` row with `cc-by-nc` raises.
- `v_minute_papers` returns nothing for a draft.
- A subscriber session cannot select `candidate` rows.

To confirm the suite catches failures, seven rules were broken one at a time: the file and
location match, the venue gate, the review guard, the abstract RLS rule, and three parts of the
abstract policy (the licence signal, the Crossref condition, and a decision beating I4OA). The
suite failed each time. One of those runs exposed a bug in the test helper: it treated a NULL
result as a pass. The helper is fixed, and the suite has been rerun with the fix.

### The abstract policy

The policy is in the spec under
[Abstract policy for paywalled papers](./library-papers-spec.md#abstract-policy-for-paywalled-papers).
Here is how it was built:

- **`paper_publishers` replaces the venue's `abstract_policy`**, with `decided_by`,
  `decided_at` and `reason`. The policy's table is used as given, plus two `CHECK`s. A decision
  needs all three of name, date and reason. `display` needs a decision, so only a person can
  open a publisher up. `paper_venues.publisher` (free text) became `publisher_id`, because two
  fields for one thing drift apart.
- **`paper_abstract_displayable(paper, source)` is the one place the rule lives.** RLS on
  `paper_abstracts`, the access tier and `v_minute_papers` all call it. It takes the abstract's
  source as an argument rather than reading `paper_abstracts`, because that table's own policy
  calls it and reading the table would recurse.
- **Precedence had to be chosen, and the policy text left it open.** An open licence on the
  paper always wins, because the licence is the permission and a takedown cannot withdraw it.
  Any publisher decision beats the I4OA signal, which is what makes a takedown a single row.
  The I4OA signal only counts while a publisher is undecided, and only for a Crossref abstract.
  The table in the spec spells this out.
- **A takedown is one row and one event.** `paper_events` can now be about a publisher instead
  of a paper (exactly one of the two is set). A policy change logs one `abstract_policy_changed`
  event against the publisher. Each affected paper's tier still moves and is logged against
  that paper, as every tier change is.
- **`v_minute_papers` gained `abstract_displayable`.** `false` tells the page to show "Read the
  abstract at the publisher" instead of the abstract.
- **The overlap linter and scorer are built.** `abstractOverlap()` in
  [`packages/shared/src/papers.ts`](../../../packages/shared/src/papers.ts) finds every run of
  six or more words shared with the abstract. It ignores case and punctuation, skips anything
  inside straight or curly double quotes, and never joins a run across a quotation or across two
  summary fields. The Session 3 linter blocks on any run. The scorer,
  [`evals/scorers/abstractOverlap.ts`](../../../apps/agents/evals/scorers/abstractOverlap.ts),
  reports the copied share, where lower is better. It is unit-tested, but it has nothing to run
  over until the golden set and Charlie's summary step exist.

### Checking it locally

The acceptance script is in [`packages/db/acceptance/`](../../../packages/db/acceptance/). It
runs on a plain Postgres 16. `stubs.sql` stands in for `team_members`, the two RLS helpers,
`auth.uid()` and `storage`. pgvector is not needed, because the column type is rewritten on
the way in:

```bash
sed -e 's/vector(1536)/real[]/' -e '/USING hnsw/d' \
  supabase/migrations/20261010100000_library_papers.sql > /tmp/papers.sql
createdb papers_check
psql -d papers_check -v ON_ERROR_STOP=1 -f packages/db/acceptance/stubs.sql
psql -d papers_check -v ON_ERROR_STOP=1 -f /tmp/papers.sql
psql -d papers_check -v ON_ERROR_STOP=1 -f packages/db/acceptance/library-papers.sql
```

A clean run ends with `ALL ACCEPTANCE CHECKS PASSED`. CI does not run it, so run it by hand
after any change to the migration.

### Not yet built

Sessions 2–5: the discovery and resolve workflows, enrichment and the linter, the HQ review
UI, and the Minute surfaces. No generated types or repository interfaces exist yet, because
nothing reads these tables. They arrive with the first code that does.
