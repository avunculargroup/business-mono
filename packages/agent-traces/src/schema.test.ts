import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COMPRESSION_CAP_MS,
  COMPRESSION_FLOOR_MS,
  MAX_TOTAL_MS,
  SUSPEND_REPLAY_MS,
  compress,
  fitToBudget,
  getTrace,
  listTraces,
  replayDurationMs,
} from './index';

describe('the package depends on nothing', () => {
  it('never imports from @mastra/core', () => {
    // The whole reason this schema is BTS-owned. A public demo that breaks on
    // an unrelated framework upgrade fails silently, at the moment someone is
    // looking at it. The recorder translates; this package does not know Mastra
    // exists.
    const dir = fileURLToPath(new URL('.', import.meta.url));
    // Test files excluded: this one names the forbidden import in its own
    // regex, and a scanner that matches its own source proves nothing.
    const read = (path: string): string[] =>
      readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? read(`${path}/${entry.name}`)
          : entry.name.endsWith('.test.ts')
            ? []
            : [readFileSync(`${path}/${entry.name}`, 'utf8')],
      );

    expect(read(dir).length).toBeGreaterThan(0);

    for (const source of read(dir)) {
      expect(source).not.toMatch(/from '@mastra/);
    }
  });

  it('declares no runtime dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    );
    expect(manifest.dependencies).toBeUndefined();
  });
});

describe('compress', () => {
  it('caps a long gap', () => {
    expect(compress(4 * 60 * 60 * 1000)).toBe(COMPRESSION_CAP_MS);
  });

  it('floors an instant step', () => {
    // The half people leave out. A step that fires in two milliseconds is
    // invisible in replay, and an invisible step teaches nothing.
    expect(compress(2)).toBe(COMPRESSION_FLOOR_MS);
    expect(compress(0)).toBe(COMPRESSION_FLOOR_MS);
  });

  it('passes a middling gap through unchanged', () => {
    expect(compress(600)).toBe(600);
  });
});

describe('fitToBudget', () => {
  it('leaves a replay that already fits alone', () => {
    const delays = [200, 300, 400];
    expect(fitToBudget(delays)).toEqual(delays);
  });

  it('scales proportionally rather than dropping steps', () => {
    // A shorter replay showing the whole run beats a punctual one that skips
    // the part someone needed.
    const delays = Array.from({ length: 100 }, () => 1200);
    const fitted = fitToBudget(delays);

    expect(fitted).toHaveLength(delays.length);
    expect(fitted.reduce((sum, d) => sum + d, 0)).toBeLessThanOrEqual(MAX_TOTAL_MS);
  });

  it('never scales a step below the visibility floor', () => {
    const fitted = fitToBudget(Array.from({ length: 2000 }, () => 1200));
    expect(Math.min(...fitted)).toBeGreaterThanOrEqual(COMPRESSION_FLOOR_MS);
  });
});

describe('every bundle', () => {
  it('is retrievable by its own id, and nothing else is', () => {
    for (const bundle of listTraces()) {
      expect(getTrace(bundle.traceId)).toBe(bundle);
    }
    expect(getTrace('no-such-trace')).toBeNull();
  });

  it('numbers its steps contiguously from zero', () => {
    // The replayer indexes into `steps` by step index. A gap would silently
    // skip a step.
    for (const bundle of listTraces()) {
      expect(bundle.steps.map((step) => step.index)).toEqual(
        bundle.steps.map((_, position) => position),
      );
    }
  });

  it('states its provenance', () => {
    // Load-bearing. The value of a trace over a mockup is that it is a real
    // run; a bundle claiming to be recorded when it was authored would be the
    // fabricated record this project refuses to ship anywhere else.
    for (const bundle of listTraces()) {
      expect(['recorded', 'authored']).toContain(bundle.provenance);
    }
  });

  it('replays inside the viewer budget', () => {
    for (const bundle of listTraces()) {
      expect(replayDurationMs(bundle.steps)).toBeLessThanOrEqual(MAX_TOTAL_MS);
    }
  });

  it('holds the suspend open rather than compressing it to a tick', () => {
    // The gate is the most important moment in the trace: the machine stopped
    // and waited for a person. Rendering that as another 1200ms tick says the
    // opposite of what happened.
    for (const bundle of listTraces()) {
      for (const step of bundle.steps) {
        if (step.kind === 'suspend') {
          expect(step.replayDelayMs).toBe(SUSPEND_REPLAY_MS);
          expect(step.replayDelayMs).toBeGreaterThan(COMPRESSION_CAP_MS);
        }
      }
    }
  });

  it('shows a deterministic payload immediately before the agent that consumed it', () => {
    // The pair that carries the architecture. If a bundle loses it, the trace
    // has stopped demonstrating the thing it exists for.
    for (const bundle of listTraces()) {
      const boundary = bundle.steps.findIndex(
        (step) => step.kind === 'deterministic_compute',
      );
      expect(boundary).toBeGreaterThanOrEqual(0);
      expect(bundle.steps[boundary + 1]?.kind).toBe('agent_invocation');
    }
  });

  it('hands the agent nothing that was not in the committed payload', () => {
    // The claim the boundary makes, checked rather than asserted: every key the
    // agent received exists in the payload committed immediately before it.
    for (const bundle of listTraces()) {
      const boundary = bundle.steps.findIndex((step) => step.kind === 'deterministic_compute');
      const committed = bundle.steps[boundary];
      const invocation = bundle.steps[boundary + 1];
      if (committed?.kind !== 'deterministic_compute' || invocation?.kind !== 'agent_invocation') {
        throw new Error('expected a compute/invocation pair');
      }

      const payloadKeys = Object.keys(committed.payload as Record<string, unknown>);
      for (const key of Object.keys(invocation.inputPayload as Record<string, unknown>)) {
        expect(payloadKeys).toContain(key);
      }
    }
  });

  it('records a rationale on every compliance verdict', () => {
    // A verdict with no reason is a checkbox, which is the thing this workflow
    // is meant to show it is not.
    for (const bundle of listTraces()) {
      for (const step of bundle.steps) {
        if (step.kind === 'compliance_verdict') {
          expect(step.rationale.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('names the decision column when a gate went through the web', () => {
    for (const bundle of listTraces()) {
      for (const step of bundle.steps) {
        if (step.kind === 'suspend' && step.channel === 'web') {
          expect(step.decisionColumn).toBeTruthy();
        }
      }
    }
  });

  it('leaves a web decision body null rather than inventing a reply', () => {
    // A web gate decision is not a message. Rendering it as a chat bubble would
    // be a fabrication, so there is nothing to render.
    for (const bundle of listTraces()) {
      for (const step of bundle.steps) {
        if (step.kind === 'human_decision' && step.channel === 'web') {
          expect(step.body).toBeNull();
        }
      }
    }
  });
});
