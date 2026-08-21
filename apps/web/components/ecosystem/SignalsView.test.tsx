import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EcosystemChange, WatchHealth } from '@platform/data';

// jsdom doesn't implement the <dialog> methods the Modal effect calls on mount;
// stub them so rendering (with the note modal closed) doesn't throw. Same stub
// as CollectionEditor.test.tsx.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

const { flagClientRelevant, setChangeStatus } = vi.hoisted(() => ({
  flagClientRelevant: vi.fn(),
  setChangeStatus: vi.fn(),
}));
vi.mock('@/app/actions/ecosystem', () => ({
  acknowledgeChange: vi.fn(async () => ({ success: true })),
  setChangeStatus,
  pinChange: vi.fn(async () => ({ success: true })),
  setCuratorNote: vi.fn(async () => ({ success: true })),
  flagClientRelevant,
}));

const toastError = vi.fn();
vi.mock('@platform/ui/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn() }),
}));

const { SignalsView } = await import('./SignalsView');

function change(overrides: Partial<EcosystemChange> = {}): EcosystemChange {
  return {
    id: 'ch1',
    changeType: 'release',
    title: 'firmware v6.3.4',
    summary: 'Coldcard released firmware 6.3.4 on 12 July 2026.',
    severity: 'medium',
    materiality: 40,
    complianceClass: 'neutral',
    status: 'new',
    pinned: false,
    clientRelevant: false,
    curatorNote: null,
    occurredAt: '2026-07-12T02:00:00Z',
    detectedAt: '2026-07-12T03:00:00Z',
    externalUrl: 'https://example.invalid/r',
    entityName: 'Coldcard',
    productServiceId: 'p1',
    advisorPartnerId: null,
    productSlug: 'coldcard',
    advisorSlug: null,
    watchLabel: 'Coldcard firmware',
    watchType: 'github_release',
    ...overrides,
  };
}

const health: WatchHealth[] = [
  {
    id: 'w1',
    label: 'Coldcard firmware',
    watchType: 'github_release',
    health: 'failing',
    checkFrequency: 'daily',
    consecutiveFailures: 6,
    lastCheckedAt: '2026-07-12T03:00:00Z',
    lastChangeAt: null,
    daysSinceCheck: 3,
    entityName: 'Coldcard',
    ownerName: 'Chris',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SignalsView', () => {
  it('lists changes with their entity and summary', () => {
    render(<SignalsView changes={[change()]} watchHealth={[]} />);

    // The entity is a link back to its register row (and also appears in the
    // filter options, hence the role query).
    expect(screen.getByRole('link', { name: 'Coldcard' })).toHaveAttribute('href', '/products/coldcard');
    expect(screen.getByText('firmware v6.3.4')).toBeInTheDocument();
    expect(screen.getByText(/released firmware 6\.3\.4/)).toBeInTheDocument();
  });

  it('says so when a change has not been summarised, rather than showing a gap', () => {
    render(<SignalsView changes={[change({ summary: null })]} watchHealth={[]} />);

    expect(screen.getByText('Not yet summarised.')).toBeInTheDocument();
  });

  it('shows the curator note inline', () => {
    render(
      <SignalsView
        changes={[change({ curatorNote: 'Only affects the Mk3; most clients are on the Q.' })]}
        watchHealth={[]}
      />,
    );

    expect(screen.getByText(/Only affects the Mk3/)).toBeInTheDocument();
  });

  it('narrows the list by entity', async () => {
    const user = userEvent.setup();
    render(
      <SignalsView
        changes={[
          change({ id: 'ch1', entityName: 'Coldcard', title: 'firmware v6.3.4' }),
          change({ id: 'ch2', entityName: 'Acme Legal', title: 'Terms updated' }),
        ]}
        watchHealth={[]}
      />,
    );

    expect(screen.getByText('firmware v6.3.4')).toBeInTheDocument();
    expect(screen.getByText('Terms updated')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Entity'), 'Acme Legal');

    expect(screen.queryByText('firmware v6.3.4')).not.toBeInTheDocument();
    expect(screen.getByText('Terms updated')).toBeInTheDocument();
  });

  it('narrows the list by search text', async () => {
    const user = userEvent.setup();
    render(
      <SignalsView
        changes={[
          change({ id: 'ch1', title: 'firmware v6.3.4' }),
          change({ id: 'ch2', entityName: 'Acme Legal', title: 'Terms updated', summary: null }),
        ]}
        watchHealth={[]}
      />,
    );

    await user.type(screen.getByLabelText('Filter changes'), 'terms');

    expect(screen.getByText('Terms updated')).toBeInTheDocument();
    expect(screen.queryByText('firmware v6.3.4')).not.toBeInTheDocument();
  });

  it('offers a way back when a filter matches nothing', async () => {
    const user = userEvent.setup();
    render(<SignalsView changes={[change()]} watchHealth={[]} />);

    await user.selectOptions(screen.getByLabelText('Severity'), 'critical');

    expect(screen.getByText('No changes match')).toBeInTheDocument();
    expect(screen.getByText('Try clearing a filter.')).toBeInTheDocument();
  });

  it('distinguishes an empty feed from an over-filtered one', () => {
    render(<SignalsView changes={[]} watchHealth={[]} />);

    expect(screen.getByText('Nothing has changed yet')).toBeInTheDocument();
  });

  it('drops a dismissed change from the list', async () => {
    const user = userEvent.setup();
    setChangeStatus.mockResolvedValue({ success: true });
    render(<SignalsView changes={[change()]} watchHealth={[]} />);

    await user.click(screen.getByLabelText('Dismiss firmware v6.3.4'));

    expect(setChangeStatus).toHaveBeenCalledWith('ch1', 'dismissed');
    expect(screen.queryByText('firmware v6.3.4')).not.toBeInTheDocument();
  });

  // The compliance gate lives in the server action; the UI's job is to surface
  // its reason verbatim rather than flatten it into a generic failure.
  it('surfaces the compliance refusal when flagging is blocked', async () => {
    const user = userEvent.setup();
    flagClientRelevant.mockResolvedValue({
      error: 'This change has not been classified for compliance yet, so it cannot be flagged for clients.',
    });
    render(<SignalsView changes={[change({ complianceClass: null })]} watchHealth={[]} />);

    await user.click(screen.getByLabelText('Flag firmware v6.3.4 for clients'));

    expect(toastError).toHaveBeenCalledWith(
      'This change has not been classified for compliance yet, so it cannot be flagged for clients.',
    );
  });

  it('shows failing watches on the health tab with a count on the tab itself', async () => {
    const user = userEvent.setup();
    render(<SignalsView changes={[change()]} watchHealth={health} />);

    await user.click(screen.getByRole('tab', { name: /Watch health/ }));

    expect(screen.getByText('Coldcard firmware')).toBeInTheDocument();
    expect(screen.getByText('6 consecutive failures')).toBeInTheDocument();
    expect(screen.getByText('failing')).toBeInTheDocument();
  });
});
