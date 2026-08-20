# @platform/agent-traces

The trace format for the demo's replay surface, plus the recorded bundles themselves.

## It imports nothing

Not `@mastra/core`, not anything — the package has no `dependencies` key, and a test enforces
it. Mastra's APIs move quickly, and a public demo that breaks on an unrelated framework
upgrade is the worst kind of maintenance liability: it fails silently, at the moment someone
is looking at it.

The recorder (`apps/agents/src/observability/traceRecorderProcessor.ts`) translates Mastra
spans into these types. So a Mastra upgrade breaks the recorder, and the demo keeps working
from the already-recorded bundle regardless.

## Bundles state their own provenance

`provenance: 'recorded' | 'authored'`. The value of a trace over a mockup is that it is a real
run, and a bundle that let a reader assume it was recorded when it was not would take that
value dishonestly — so the replay says which on screen.

**The shipped bundle is `authored`.** It was written against the workflow source in
`apps/agents/src/workflows/variant/` — real step ids, real payload shapes, real
`agent_activity` writes — because recording needs the agents server, a database and live model
credentials. Record a real run against a seeded synthetic campaign and replace it.

## Timing

`compress()` caps a gap at 1200ms **and floors it at 80ms**. The floor is the half people
leave out: a step that fires in two milliseconds is invisible in replay, and an invisible step
teaches nothing. The gate suspend is deliberately exempt from the cap — it waited hours, and
rendering that as another tick says the opposite of what happened.

Note a tension in the spec: the ~45s target replay length is unreachable for a short trace,
since twelve steps under a 1200ms cap ceiling at 14.4s. Padding offsets would be inventing
latencies, so short traces simply replay quickly and the UI tells the reader to step through.
