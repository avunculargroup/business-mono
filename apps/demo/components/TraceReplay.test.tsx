import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { variantGateWebTrace } from '@platform/agent-traces';
import { TraceReplay } from './TraceReplay';

const trace = variantGateWebTrace;

/** The index of the gate suspend, which every "across the boundary" case needs. */
const suspendIndex = trace.steps.findIndex((step) => step.kind === 'suspend');

async function stepForward(times: number) {
  const button = screen.getByRole('button', { name: /Step forward/ });
  for (let i = 0; i < times; i += 1) {
    await userEvent.click(button);
  }
}

describe('the replay opens before the run', () => {
  it('starts at step zero of the run, not inside it', () => {
    // -1 is a real state: the run had a beginning, and dropping the reader into
    // the middle of step one loses it.
    render(<TraceReplay trace={trace} />);

    expect(screen.getByText(`step 0 of ${trace.steps.length}`)).toBeInTheDocument();
  });

  it('cannot step back from the start', () => {
    render(<TraceReplay trace={trace} />);

    expect(screen.getByRole('button', { name: /Step back/ })).toBeDisabled();
  });
});

describe('stepping', () => {
  it('advances one step at a time', async () => {
    render(<TraceReplay trace={trace} />);
    await stepForward(2);

    expect(screen.getByText(`step 2 of ${trace.steps.length}`)).toBeInTheDocument();
  });

  it('steps back across the gate boundary', async () => {
    // The named verify item for this phase, and the reason position is a step
    // index rather than a timer offset: going back across the suspend is the
    // same operation as going forward, so there is no seek path that can
    // disagree with playback.
    render(<TraceReplay trace={trace} />);
    await stepForward(suspendIndex + 1);
    expect(screen.getByText(`step ${suspendIndex + 1} of ${trace.steps.length}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Step back/ }));
    await userEvent.click(screen.getByRole('button', { name: /Step back/ }));

    expect(screen.getByText(`step ${suspendIndex - 1} of ${trace.steps.length}`)).toBeInTheDocument();
  });

  it('cannot step past the end', async () => {
    render(<TraceReplay trace={trace} />);
    await stepForward(trace.steps.length);

    expect(screen.getByRole('button', { name: /Step forward/ })).toBeDisabled();
  });

  it('offers a replay once the run has finished', async () => {
    render(<TraceReplay trace={trace} />);
    await stepForward(trace.steps.length);

    await userEvent.click(screen.getByRole('button', { name: /Replay/ }));
    expect(screen.getByText(`step 0 of ${trace.steps.length}`)).toBeInTheDocument();
  });
});

describe('what the run shows', () => {
  it('draws the boundary between the committed payload and the agent', () => {
    // The pair that carries the architecture. Drawn between the two steps
    // rather than on either, because the claim is about what crosses it.
    render(<TraceReplay trace={trace} />);

    expect(
      screen.getByText(/Everything above was computed and committed/),
    ).toBeInTheDocument();
  });

  it('shows the compliance verdict with its reason', async () => {
    render(<TraceReplay trace={trace} />);

    const verdict = trace.steps.find((step) => step.kind === 'compliance_verdict');
    if (verdict?.kind !== 'compliance_verdict') throw new Error('expected a verdict step');

    expect(screen.getByText(verdict.rationale)).toBeInTheDocument();
  });

  it('names the column a web gate decision travels through', () => {
    // The mechanism, not a simplified version of it. The agent server is not
    // reachable over HTTP from the browser, and that constraint is the reason
    // the boundary is real rather than conventional.
    render(<TraceReplay trace={trace} />);

    expect(screen.getByText(/content_items\.pending_decision/)).toBeInTheDocument();
  });

  it('renders a web decision without inventing a reply', () => {
    // A web gate decision is not a message; a chat bubble here would be a
    // fabrication.
    render(<TraceReplay trace={trace} />);

    expect(screen.getByText(/Director approved it, via the web gate/)).toBeInTheDocument();
    expect(screen.queryByText(/“/)).not.toBeInTheDocument();
  });
});

describe('provenance', () => {
  it('says outright that this bundle was authored, not recorded', () => {
    // The value of a trace over a mockup is that it is a real run. Letting a
    // reader assume this one was recorded would take that value dishonestly.
    render(<TraceReplay trace={trace} />);

    expect(screen.getByText(/Authored against the workflow source/)).toBeInTheDocument();
  });

  it('does not claim a synthetic recording kept data out of scope', async () => {
    // Zero redactions means two different things. On a recorded run it is a
    // claim about scope; on an authored bundle it is a claim about nothing.
    render(<TraceReplay trace={trace} />);

    expect(screen.getByText(/nothing was recorded, so there was nothing to redact/)).toBeInTheDocument();
    expect(screen.queryByText(/no client data was in scope/)).not.toBeInTheDocument();
  });

  it('says how long the real run took, separately from the replay', () => {
    render(<TraceReplay trace={trace} />);

    expect(screen.getByText('4h 12m')).toBeInTheDocument();
  });
});
