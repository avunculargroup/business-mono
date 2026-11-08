import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toBrandVisual } from '@platform/shared';

const saveBrandVisual = vi.fn();
const removeStyleAnchor = vi.fn();
vi.mock('@/app/actions/brandVisual', () => ({
  saveBrandVisual: (...a: unknown[]) => saveBrandVisual(...a),
  removeStyleAnchor: (...a: unknown[]) => removeStyleAnchor(...a),
}));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@platform/ui/ToastProvider', () => ({ useToast: () => toast }));
const router = { refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { VisualTab } from './VisualTab';

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

const CANON = toBrandVisual({
  id: 'bv-1',
  version: '1.2',
  style_block: 'A hand-drawn sketch.',
  palette: [{ role: 'Paper', hex: '#FAFAF8', usage: 'warm off-white' }],
  composition_block: 'Leave the corner empty.',
  prohibited_block: 'Never include text.',
  prohibited_terms: ['rocket'],
  motifs: [
    { key: 'retired', label: 'Retired', description: 'old', use_when: 'never', is_active: false },
    { key: 'balance', label: 'Balance', description: 'A scale', use_when: 'Trade-offs', is_active: true },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  saveBrandVisual.mockResolvedValue({ success: true, version: '1.3' });
  removeStyleAnchor.mockResolvedValue({ success: true });
});

describe('VisualTab', () => {
  it('previews the assembled prompt against a sample brief using the first active motif', () => {
    render(<VisualTab canon={CANON} notes={null} anchors={[]} />);
    const prompt = screen.getByLabelText('Assembled prompt');
    expect(prompt).toHaveTextContent('A hand-drawn sketch.');
    expect(prompt).toHaveTextContent('Visual metaphor: Balance');
    expect(prompt).toHaveTextContent('Never include text.');
  });

  it('updates the preview as the canon is edited, before anything is saved', async () => {
    const user = userEvent.setup();
    render(<VisualTab canon={CANON} notes={null} anchors={[]} />);
    const style = screen.getByLabelText('Style block');
    await user.clear(style);
    await user.type(style, 'A confident ink drawing.');
    expect(screen.getByLabelText('Assembled prompt')).toHaveTextContent(/^A confident ink drawing\./);
    expect(saveBrandVisual).not.toHaveBeenCalled();
  });

  it('asks to save as the next version, then saves the whole canon', async () => {
    const user = userEvent.setup();
    render(<VisualTab canon={CANON} notes="Why." anchors={[]} />);
    await user.click(screen.getByRole('button', { name: 'Save canon' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Save as v1.3?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save as v1.3' }));

    expect(saveBrandVisual).toHaveBeenCalledWith({
      style_block: 'A hand-drawn sketch.',
      composition_block: 'Leave the corner empty.',
      prohibited_block: 'Never include text.',
      prohibited_terms: ['rocket'],
      palette: CANON.palette,
      motifs: CANON.motifs,
      brand_mark: { enabled: true, height_pct: 9, margin_pct: 4 },
      notes: 'Why.',
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('v1.3'));
  });

  it('shows anchors and removes one after confirming', async () => {
    const user = userEvent.setup();
    render(
      <VisualTab
        canon={CANON}
        notes={null}
        anchors={[{ path: 'social-images/anchors/g1.png', url: 'https://signed/g1.png' }]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Style anchor 1' })).toHaveAttribute('src', 'https://signed/g1.png');
    expect(screen.getByText('Sent with every render')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove anchor' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove anchor' }));
    expect(removeStyleAnchor).toHaveBeenCalledWith('social-images/anchors/g1.png');
  });

  it('places the mark preview from the percentages, with the right margin converted to a share of width', () => {
    render(<VisualTab canon={CANON} notes={null} anchors={[]} />);
    const mark = screen.getByRole('img', { name: /where the mark sits/ }).querySelector('img')!;
    expect(mark.style.height).toBe('9%');
    expect(mark.style.bottom).toBe('4%');
    expect(parseFloat(mark.style.right)).toBeCloseTo((4 * 627) / 1200, 3);
  });

  it('explains when there is no canon', () => {
    render(<VisualTab canon={null} notes={null} anchors={[]} />);
    expect(screen.getByText(/There is no visual canon yet/)).toBeInTheDocument();
  });
});
