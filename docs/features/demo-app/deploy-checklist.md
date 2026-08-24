# Demo — deploy checklist

Everything between "phases 0–9 have shipped" and "the link is safe to paste into an
application". [`build-progress.md`](./build-progress.md) records what each phase shipped and
why; this records what is left.

**This file is the source of record.** Where it is rendered elsewhere, that rendering follows
this file.

---

## 1. Must be true before the link is shared

Not ordered — these are independent, and all three need a person rather than a build step.

- [ ] **ASIC-search every invented company name.** They were chosen to be implausible as real
      businesses, which is not the same as verified, and no test can substitute — the check is
      a search against a register. Replace anything that resolves.
      - Client companies: **Kestrel Freight**, **Marrowbone Engineering**, **Tolquist
        Partners**, **Ardenne Pastoral**
      - Watched entities: **Orrery Signer**, **Lachlan Vault**
      - Mastheads (lower risk, same rule): **Southern Ledger**, **Harbourline Wire**,
        **Antipodean Monetary Review**, **Custody Brief**
      - People (a plain search, not ASIC): **Wren Halloway**, **Douglas Ferrymead**,
        **Adaeze Okonkwo**
      - Source: `packages/data-fixtures/src/fixtures/entities.ts`, which carries the same
        warning at the top of the file.

- [ ] **Run the Lex classification pass over the whole fixture set**, and record the outcome in
      `agent_activity` on the live platform so the review is auditable. Needs the agents server
      against the real database. The market-report narration is the highest-risk prose in the
      set and is exactly what the pass is for; a `flagged` verdict on any of it is a signal to
      rewrite rather than override.
      **Expect one deliberate flag:** the content draft `cnt-flagged` is written to fail, so the
      compliance gate has something real to point at. If Lex clears *that*, the pass is the
      thing that is wrong.

- [ ] **Read the seven annotations cold**, and check the architecture is describable from them
      alone. This is the one Phase 7 verify item still open, and it needs a reader who did not
      write them — a judgement about someone else's comprehension cannot be self-assessed.

---

## 2. Deploy

Ordered. Settings are from
[`demo-app-spec.md` § Deployment](./demo-app-spec.md#deployment); mirror `apps/web` rather than
inventing a second pattern.

1. [ ] **New Vercel project**, separate from `apps/web`. Root Directory `apps/demo`. A separate
       project is what makes cross-app build interference structurally impossible rather than
       merely unlikely.
2. [ ] **Include source files outside Root Directory: on.** A pnpm-workspace app cannot build
       without `packages/*`.
3. [ ] **Build Command:** `cd ../.. && pnpm turbo run build --filter=@platform/demo`
4. [ ] **Ignored Build Step:** `npx turbo-ignore @platform/demo`. Without it, every push to
       `main` rebuilds both projects.
5. [ ] **Node 22**, matching `.github/workflows/test.yml`. A mismatch means CI green and Vercel
       red.
6. [ ] **Zero environment variables.** Not an empty Supabase key — no entries at all. Then the
       "no database" claim is enforced by the platform rather than asserted by us.
7. [ ] **Point `demo.btreasury.com.au`** (verified unclaimed). Not under `hq.`, which already
       resolves to Vercel — the hostname split is part of the security story.
8. [ ] **Confirm `/robots.txt` and the `noindex` meta both serve on the real host.** Both ship
       in the app (`app/robots.ts`, `app/layout.tsx`) and were verified locally. Two layers on
       purpose: a meta tag is only seen by a crawler that already fetched the page.
9. [ ] **Audit the environment variables after the first deploy.** If a Supabase key is set,
       something has gone wrong.
10. [ ] **Open Graph card**, showing the annotated trace replay. This matters *more* with
        indexing off, not less: link-pasting is then the only distribution channel, so the
        preview does all the work.
11. [ ] **Enable Turborepo Remote Caching** across both projects. They compile the same
        packages now, so the second downloads that work instead of repeating it.

---

## 3. Quality — worth doing, does not block the link

- [ ] **Bootstrap the screenshot baselines.** Run the Visual regression workflow with
      `update_baselines`, or `pnpm test:visual:update` on a machine with Docker, then commit
      `e2e/**-snapshots/`. They can only be generated inside
      `mcr.microsoft.com/playwright:v1.62.1-noble` — font hinting differs enough elsewhere that
      foreign baselines diff on every run. Until then those cases skip rather than fail.
- [ ] **Record a real trace and replace the authored bundle.** The shipped bundle is
      `provenance: 'authored'` and the replay says so on screen. Run
      `TRACE_RECORDER_TRACE_ID=variant-gate-web` against a **seeded synthetic campaign**, never
      production data — the recorder is new code and redaction is its first live exercise.
- [ ] **Replay with the network actually down.** The dependency-closure test
      (`apps/demo/lib/boundary.test.ts`) and the no-external-requests spec are the structural
      and behavioural versions of this claim, but neither is the same as pulling the interface.
- [ ] **Promote the demo E2E specs from advisory to blocking**, once baselines have settled. The
      behavioural specs are the ones to promote first: no baselines, so they cannot flake on
      antialiasing.

---

## 4. Deferred deliberately

Not oversights. Each has a reason recorded in `build-progress.md`.

- **Phase 4 background verticals** — 4.2c–d, 4.6b–d, 4.7–4.11. Roughly 150 `.from(` calls the
  demo never renders. Deferred until the client app is real; the directors have it as expected
  but not yet committed.
- **Six of the seventeen staging rows** need fields no read model carries — `opsFindings`, the
  research `rubric`, `complianceStatus` on `ContentCard`, a last-interaction date, podcast
  transcript segments. Each belongs to the vertical that owns it, not to a demo-driven widening.
- **A sweep of the stale `as any` casts** whose "not in the generated types yet" comments turned
  out to be false. Four found so far, an hour's work.
- **Sidebar responsive collapse** on `apps/web`. A real gap — people do open links on phones —
  but it is `apps/web` work that should be justified on its own merits.

### Known and not fixed

Found while working, left alone because fixing them was outside the change in hand.

- `CompaniesList` discards `totalCount` and paginates on `companies.length` with a no-op
  `onPageChange`, so `/crm/companies` is capped at 25 with no way to reach page 2. The
  repository now returns a real `total` and `hasMore` for whoever fixes it.
- `/news` has a "Show archived" toggle that does nothing.
- Campaign account replacement runs without a transaction.

---

## Adjacent, worth a minute while in the Vercel settings

- [ ] **Deployment Protection on the `apps/web` project.** Preview deployments get public URLs
      by default, which for an internal tool holding real CRM data is a larger exposure than
      this demo will ever be. Vercel Authentication on previews closes it. Out of scope for the
      demo build; noted because the settings visit is already happening.
