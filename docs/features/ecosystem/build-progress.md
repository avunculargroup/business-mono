# Ecosystem Signals — build progress

Running record of what has shipped against
[`ecosystem-signal-feature.md`](./ecosystem-signal-feature.md), and what is
deliberately still open. Same purpose as
`docs/news-source-email-build-progress.md`.

**Status:** phases 1–3 shipped. One adapter blocked, five not yet started.

---

## Shipped

### Phase 1 — data layer + watch management

- `supabase/migrations/20260729000000_add_ecosystem_signals.sql` — `ecosystem_watches`,
  `ecosystem_changes`, `v_ecosystem_feed`, `v_ecosystem_watch_health`.
- `packages/shared/src/ecosystem.ts` — watch/change discriminators, per-type config
  and payload shapes, display labels, `isClientPromotable`.
- `apps/web/app/actions/ecosystem.ts` — watch CRUD and change curation.
- Watches card on `/products/[id]` and `/advisors/[id]`, with a per-`watch_type`
  form.

### Phase 2 — detection and enrichment

`apps/agents/src/lib/ecosystem/`, driven by `ecosystemScanWorkflow` on an hourly
cron (`20 * * * *`). Watch-level `check_frequency` decides what is actually due.

- **Adapters shipped:** `github_release` (releases and tags), `attestation`.
- **Phase A** claims each watch, runs its adapter, upserts changes against the
  `(watch_id, dedup_key)` index, and updates anchor/health/backoff.
- **Phase B** sweeps `summary IS NULL`: deterministic materiality, one fenced
  narration call, Lex classification.

### Phase 3 — the feed

- `/signals` reading `v_ecosystem_feed`, with filters and row actions.
- Watch health tab reading `v_ecosystem_watch_health`.
- Read-only "What's changed" card on both register detail pages.

---

## Blocked: the `regulatory_register` adapter

**This is the spec's highest-value signal and it is not built.** The spec
sequenced it first; it is the only adapter whose feasibility could not be
established, so it was deliberately deferred rather than guessed at.

### What blocks it

The AUSTRAC and ASIC hosts are not reachable from the development sandbox. The
egress gateway refuses the CONNECT outright:

```
https://online.austrac.gov.au/ao/public/rsregister.seam   curl: (56) CONNECT tunnel failed, response 403
https://www.austrac.gov.au                                 403
https://connectonline.asic.gov.au                          403
```

The proxy reports these as `connect_rejected` — *"gateway answered 403 to CONNECT
(policy denial or upstream failure)"* — i.e. a network policy decision, not a
transient outage. `api.github.com` resolves normally from the same shell, so
this is specific to those hosts.

Nothing about the register's actual structure can be established from here, and
writing a parser against an unseen page is exactly the failure mode this adapter
cannot afford.

### What the spike has to answer, from Railway

1. Does either register expose a **structured lookup** (JSON/CSV/API) keyed by
   identifier, or is the only access path an HTML search form?
2. For a **known-good** AUSTRAC DCE enrolment number and a known-good ASIC
   AFSL/ACN, what exactly comes back, and where in it is the status?
3. For a **deliberately wrong** identifier, how does the register respond? This
   is the important one — an adapter must be able to tell "this identifier is
   not on the register" apart from "the lookup did not work", and if the
   register answers both the same way, the adapter cannot emit at all.
4. Do the terms of use permit automated access, and at what rate?

### The precision bar it must clear before it can emit

From the spec, and non-negotiable: given a known-good identifier the adapter
returns the current status; given a wrong identifier it returns **"cannot
determine", never "not found"**. A false de-listing is a quiet defamation of a
counterparty, and it is the one failure in this feature with real-world
consequences.

The contract already has the vocabulary for this: `EcosystemAdapterError` carries
an `indeterminate` kind, and returning it degrades the watch instead of emitting.
`applyFloor` in `classify.ts` already pins every `regulatory_change` at
`solvency_adjacent`, so the compliance gate is in place waiting for the adapter.

---

## Not yet started

Five adapters, all behind the shipped contract (`lib/ecosystem/types.ts`) — each
is a new file plus a registry line, with no changes to detection or enrichment:

| Adapter | Shape | Notes |
|---|---|---|
| `github_advisory` | version | `/security-advisories`; diff by GHSA id. Closest to a copy of `githubRelease`. |
| `status_page` | state | Statuspage/Instatus JSON, degrading to the provider's RSS. Some vendors will not be watchable — record that on the watch rather than pretending. |
| `policy_diff` | state | Extract, normalise, hash. `content_kind: 'pricing'` emits `pricing_change` off the same detection. Noise calibration (`min_change_ratio`) is empirical. |
| `rss` | state | Diff by item guid. Defaults to `mention`; `config.event_terms` elevates to `corporate_event`. |
| `newsletter` | state | No polling — reads what the existing Fastmail research-folder path already ingested, keyed on recipient local-part. |

Also open, all from the spec's own list: the Simon digest (deferred by decision),
the live Lex suspend/resume promotion gate (dormant until a client surface
exists), and `ecosystem_watch_checks` per-check logging (deferred until
debugging pain appears).
