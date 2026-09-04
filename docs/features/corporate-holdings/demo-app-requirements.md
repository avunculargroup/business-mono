# Corporate Research — Demo App Requirements

**Companion to:** `corporate-research-spec.md`
**Target:** `apps/demo`, consuming `@bts/data-fixtures`
**Audience:** recruiters and technical evaluators, not CFOs
**Status:** Draft

---

## The decision that governs everything else

**Fixtures are wholly fictional entities. They are not anonymised, degraded or lightly renamed versions of real companies.**

This is not a stylistic preference. Four reasons, in descending order of seriousness:

1. **Publishing approximate data about real listed entities is precisely the harm this feature exists to prevent.** A public demo showing "Locate Technologies, 12.3 BTC" with fixture-drifted numbers is a worse artefact than the crypto-Twitter leaderboard the section was designed to avoid. The dossiers exist because three credible sources got Locate's first purchase wrong by fifty per cent.
2. **BTS operates as an Authorised Representative.** A publicly reachable page presenting research about named real securities is arguably promotional material about financial products, regardless of the "demo" label on it. The internal Lex gate does not travel with a static build.
3. **Real data goes stale.** A demo whose credibility rests on accuracy acquires a maintenance obligation the moment it ships. Fictional data has no correct value to drift from.
4. **Evaluators are not checking the facts.** They are checking whether the system handles hard cases. Fictional entities do that as well as real ones.

**But the fixtures must be structurally real.** Fictional companies, real pathologies. Every fixture exists to demonstrate a specific failure mode discovered in the dossiers. A fixture set of clean, well-behaved records tests nothing and demonstrates nothing.

### Identifier discipline

Fixture identifiers must be incapable of resolving to a real entity, and must fail validation if they ever leak into production ingest:

- **ABN / ACN** — deliberately invalid check digits.
- **ISIN** — reserved `XX` country prefix with a failing check digit.
- **Tickers** — four-letter codes; ASX and NZX codes are three.
- **Slugs** — prefixed `demo-`.
- **Document URLs** — resolve to a local static PDF, never an external host.

Every fixture company carries `is_fixture: true`. The Supabase adapter's insert path rejects any row with that flag set. That is a cheap guard against the one genuinely bad outcome, which is fixture data reaching the real register.

---

## What the demo has to demonstrate

Ordered by what a technical evaluator will actually take away.

| # | Claim | Fixture that carries it |
|---|---|---|
| 1 | The system refuses to compare things that are not comparable | Basis mismatch across two companies |
| 2 | Source class is enforced, not documented | Custody conflict — web copy vs regulated document |
| 3 | The pipeline commits facts before it narrates | Trace replay with a rejected extraction |
| 4 | Saying nothing is a valid output | Quiet-day run |
| 5 | Staleness is measured against the issuer's own cadence | Stale monthly reporter |
| 6 | Compliance is architecture, not a disclaimer | Restricted panel rendering withheld fields |

Claim 3 is the one that separates this from a CRUD app with a nice theme, and it is the least visible without the annotation layer. Weight the annotations accordingly.

---

## Fixture roster

Five companies. Each is a shape, not a company.

### 1. `demo-meridian-freight` — Meridian Freight Group Ltd
**Shape:** the Locate case. Operating logistics business, treasury allocation that self-describes as a treasury company.
**Demonstrates:** rename and cross-venue migration (`MFGX:ASX` → `MFGX:NZX`), covenant amended to admit bitcoin, capital posture change (idle ATM alongside an active buyback), source conflict on custody, `regulated_disclosure` outranking `company_web`.
**This is the flagship record.** It is the one an evaluator lands on first and the only one with a complete qualitative panel.

### 2. `demo-kestrel-dam` — Kestrel Digital Asset Management Ltd
**Shape:** the DigitalX case. Funds manager, `native_exposure`.
**Demonstrates:** look-through holdings including units in a fund it manages itself (`is_related_party_vehicle: true`), multi-asset treasury, zero debt so `covenant_change` returns structural absence, monthly disclosure cadence.
**Pairs with Meridian** to demonstrate archetype-gated comparison refusal.

### 3. `demo-nyala-payments` — Nyala Payments Inc.
**Shape:** the Block case. US issuer, `operational_integration`, ASX quotation via CDI foreign exempt.
**Demonstrates:** customer assets custodied alongside corporate treasury, US GAAP fair-value-through-income against the other two records' IFRS revaluation model, and exclusion from the regional register despite an ASX quotation.

### 4. `demo-tarra-holdings` — Tarra Holdings Ltd
**Shape:** nothing happening. A small regional register entry with a policy, one acquisition eighteen months ago, and silence since.
**Demonstrates:** the quiet-day path, and that a record with a thin ledger renders as a legitimate record rather than a broken page.

### 5. `demo-orrey-capital` — Orrey Capital Ltd
**Shape:** a monthly reporter that has gone quiet for ninety days.
**Demonstrates:** `v_research_freshness` flagging staleness against `expected_disclosure_cadence` rather than a fixed window — the same silence is normal for Tarra and abnormal for Orrey.

---

## Trace replay

Fixtures include one recorded `TraceBundle` per the existing BTS-owned schema — no `@mastra/core` type imports, so `apps/demo` never takes a dependency on the agent runtime.

**The recorded run must include a rejection.** The most persuasive thing in the whole demo is `validateNumerics` catching an extracted figure that does not appear in the source text and refusing to commit it, followed by the pipeline continuing with the remaining events. A trace where everything succeeds demonstrates that the code runs. A trace with a caught error demonstrates that the design works.

Recommended recorded run, against Meridian:

1. `resolveDocuments` — three refs, one already fetched by sha, skipped
2. `fetchDocument` — one 404 recorded as `retrieval_error`, not a silent skip
3. `extractEvents` — six candidates from the offer document
4. `validateNumerics` — **five validated, one rejected**: a consideration figure the extractor rounded, not present in source
5. `reconcile` — one delta at 0.04%, below the materiality floor, logged and suppressed
6. `score` — two findings, one `covenant_change`
7. `classify` — the covenant finding classified `internal`, not `publishable`
8. `persist` — committed
9. `approvalGate` — suspended, awaiting a director

Step 9 should render as suspended in the demo and stay that way. Showing a workflow parked at a human gate is more honest than showing it auto-approve, and it is the clearest expression of the hub-and-spoke model.

---

## Annotation layer

The demo's annotation overlay is a second toggle sitting beside the provenance rail. Provenance answers "where did this fact come from." Annotation answers "why is the interface shaped like this."

Each annotation is at most three sentences and ties a visible element to the evidence that produced it. No annotation should be a description of what the element does — evaluators can see that.

Minimum set:

- **On the masthead** — why there is no large holdings number. Three research records produced three unrelated mechanisms by which a headline bitcoin figure overstates the corporate position.
- **On a `basis` chip** — why every holdings row carries one, and why rows without a comparable basis are excluded from aggregates.
- **On the custody conflict panel** — why marketing copy cannot populate a controls field, and that this rule was written after getting it wrong.
- **On the restricted panel** — why the withheld list is rendered rather than silently omitted.
- **On the trace rejection step** — why the numeric validator is deterministic rather than a second model call.
- **On the archetype pair** — why two fields, and why the comparison refuses across them.

**Tone.** Annotations describe decisions and the evidence behind them. They do not sell. "This rule exists because revision 2 of the research recorded the wrong custody arrangement by trusting a marketing page" is worth reading. "Our sophisticated provenance architecture ensures data integrity" is not.

---

## Shared conformance suite

One test suite in `packages/data`, run against both implementations. Drift surfaces as a test failure rather than as a discrepancy someone notices later.

```ts
describeRepository('ResearchRepository', (repo) => {
  it('never returns a ledger entry without provenance');
  it('excludes non-comparable bases from position aggregates');
  it('returns structural absence, not empty, for a company with no debt');
  it('flags staleness against cadence, not a fixed window');
  it('refuses a cross-archetype comparison');
  it('returns only publishable rows when publishableOnly is set');
});
```

The fixture implementation must pass the same suite as the Supabase one. If a test can only pass against fixtures, the fixture is lying about the shape of the data.

---

## Generation, not authoring

Fixtures are produced by a seeded generator in `packages/data-fixtures/src/generate.ts`, deterministic from a fixed seed, with the output committed. Hand-authored fixtures drift from the schema silently; generated ones fail to compile when the types change, which is the drift detection the monorepo already relies on.

The generator takes the shape definitions above as input and emits typed objects. Prose fields — headlines, detail, curator notes — are authored by hand inside the shape definitions, because generated prose reads like generated prose and this is a portfolio piece.

---

## Build order

Slot into the existing three sessions rather than adding a fourth.

- **Session 1** — define fixture types alongside the schema. The `ResearchRepository` interface and the conformance suite are written here, before either implementation.
- **Session 2** — record the trace bundle from the real ingest run against Meridian's fixture documents. Recording it from an actual run rather than authoring it by hand is what makes it trustworthy.
- **Session 3** — `apps/demo` pages and the annotation layer, sharing `packages/ui` with `apps/hq`.

---

## Out of scope

- Live data of any kind in `apps/demo`
- Any real company name, ticker, or document
- Interactive ingest — the trace is replayed, never executed
- Write paths — the demo is read-only, and the absence of a write path is itself worth annotating
