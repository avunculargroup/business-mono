import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toBrandVisual } from '@platform/shared';
import type { ContentImage, ContentImageRequest } from '@platform/data';

const actions = {
  selectImageCandidate: vi.fn(),
  getImageDownloadUrl: vi.fn(),
  requestImageRegenerate: vi.fn(),
  requestImageRender: vi.fn(),
  saveImageAltText: vi.fn(),
  removeImage: vi.fn(),
  promoteImageToStyleAnchor: vi.fn(),
};
vi.mock('@/app/actions/contentImages', () => ({
  getImageDownloadUrl: (...a: unknown[]) => actions.getImageDownloadUrl(...a),
  selectImageCandidate: (...a: unknown[]) => actions.selectImageCandidate(...a),
  requestImageRegenerate: (...a: unknown[]) => actions.requestImageRegenerate(...a),
  requestImageRender: (...a: unknown[]) => actions.requestImageRender(...a),
  saveImageAltText: (...a: unknown[]) => actions.saveImageAltText(...a),
  removeImage: (...a: unknown[]) => actions.removeImage(...a),
  promoteImageToStyleAnchor: (...a: unknown[]) => actions.promoteImageToStyleAnchor(...a),
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@platform/ui/ToastProvider', () => ({ useToast: () => toast }));
const router = { refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { ImageSlot } from './ImageSlot';

// jsdom doesn't implement the <dialog> methods the Modal effect calls; same stub
// as SignalsView.test.tsx and CollectionEditor.test.tsx.
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

const ITEM = 'ci-1';
const GROUP = 'g-1';

const CANON = toBrandVisual({
  id: 'bv-1',
  version: '1.2',
  style_block: 'A hand-drawn sketch.',
  palette: [{ role: 'Paper', hex: '#FAFAF8', usage: 'warm off-white' }],
  composition_block: 'Leave the bottom-right corner empty.',
  prohibited_block: 'Never include text.',
  prohibited_terms: ['rocket', 'coin'],
  motifs: [{ key: 'timepiece', label: 'Timepiece', description: 'An hourglass', use_when: 'Time', is_active: true }],
  layouts: [
    { key: 'left_third', label: 'Left third', description: 'Subject in the left third.', is_active: true },
    { key: 'low_horizon', label: 'Low horizon', description: 'One horizon line, low.', is_active: true },
  ],
});

const PIER = {
  tension: 'Nobody knows the trigger, only that the safe ground is shorter than it looks.',
  symbol: 'A lighthouse',
  twist: 'One solid gold beam cuts through the fog',
  subject: 'A lighthouse throwing one solid gold beam through fog',
  layout: 'left_third',
  alt_text: 'A linocut of a lighthouse with a gold beam through fog.',
};

function image(overrides: Partial<ContentImage & { url: string | null }> = {}): ContentImage & { url: string | null } {
  return {
    id: 'img-1',
    source: 'ai_generated',
    storagePath: `social-images/2026-11-08/${GROUP}/linkedin-1200x627.png`,
    masterPath: `social-images/2026-11-08/${GROUP}/master-16x9.png`,
    generationGroupId: GROUP,
    altText: 'A linocut of a lighthouse with a gold beam through fog.',
    platformCrop: 'linkedin_1200x627',
    brief: PIER,
    tension: PIER.tension,
    layout: 'left_third',
    motifKey: null,
    reviewNote: null,
    candidateSetId: 'set-1',
    candidateIndex: 0,
    isSelected: true,
    assembledPrompt: 'PROMPT',
    brandVisualVersion: '1.1',
    modelId: 'google/gemini-2.5-flash-image',
    costUsd: 0.039,
    isStyleAnchor: false,
    altTextVerdict: { classification: 'educational', rationale: 'plain', checkedAt: '2026-11-08T00:00:00Z' },
    createdAt: '2026-11-08T00:00:00Z',
    url: 'https://signed.example/li.png',
    ...overrides,
  };
}

function request(overrides: Partial<ContentImageRequest> = {}): ContentImageRequest {
  return { id: 'req-1', action: 'regenerate', status: 'working', error: null, createdAt: '2026-11-08T01:00:00Z', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(actions)) fn.mockResolvedValue({ success: true });
});

describe('ImageSlot', () => {
  it('shows the image with its alt text and provenance line', () => {
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    expect(screen.getByRole('img', { name: 'A linocut of a lighthouse with a gold beam through fog.' })).toHaveAttribute('src', 'https://signed.example/li.png');
    expect(screen.getByText('Left third · google/gemini-2.5-flash-image · canon v1.1 · $0.04')).toBeInTheDocument();
    expect(screen.getByText(PIER.tension)).toBeInTheDocument();
    // A clear verdict shows no chip.
    expect(screen.queryByText(/alt text implies/i)).not.toBeInTheDocument();
  });

  it('shows Lex\'s chip and rationale when the alt text is not educational, and "checking" while it is pending', () => {
    const { rerender } = render(
      <ImageSlot
        contentItemId={ITEM}
        image={image({ altTextVerdict: { classification: 'general_advice', rationale: '"rising" implies a direction', checkedAt: null } })}
        request={null}
        canon={CANON}
      />,
    );
    expect(screen.getByText('Alt text implies an outcome')).toBeInTheDocument();
    expect(screen.getByText('"rising" implies a direction')).toBeInTheDocument();

    rerender(<ImageSlot contentItemId={ITEM} image={image({ altTextVerdict: null })} request={null} canon={CANON} />);
    expect(screen.getByText('Checking alt text')).toBeInTheDocument();
  });

  it('saves edited alt text for the group', async () => {
    const user = userEvent.setup();
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    const save = screen.getByRole('button', { name: 'Save alt text' });
    expect(save).toBeDisabled();

    const field = screen.getByLabelText('Alt text');
    await user.clear(field);
    await user.type(field, 'A sketch of a vault door.');
    await user.click(save);

    expect(actions.saveImageAltText).toHaveBeenCalledWith({ contentItemId: ITEM, generationGroupId: GROUP, altText: 'A sketch of a vault door.' });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('downloads the platform crop through a freshly signed link', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    actions.getImageDownloadUrl.mockResolvedValue({ url: 'https://signed/download.png' });
    try {
      render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
      await user.click(screen.getByRole('button', { name: 'Download image' }));
      expect(actions.getImageDownloadUrl).toHaveBeenCalledWith(`social-images/2026-11-08/${GROUP}/linkedin-1200x627.png`);
      expect(assign).toHaveBeenCalledWith('https://signed/download.png');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('says so when the download link cannot be made, and is available while a render runs', async () => {
    const user = userEvent.setup();
    actions.getImageDownloadUrl.mockResolvedValue({ error: 'That image could not be found.' });
    render(<ImageSlot contentItemId={ITEM} image={image()} request={request()} canon={CANON} />);
    const download = screen.getByRole('button', { name: 'Download image' });
    expect(download).toBeEnabled();
    await user.click(download);
    expect(toast.error).toHaveBeenCalledWith('That image could not be found.');
  });

  it('queues a regenerate', async () => {
    const user = userEvent.setup();
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    await user.click(screen.getByRole('button', { name: 'Regenerate image' }));
    expect(actions.requestImageRegenerate).toHaveBeenCalledWith(ITEM);
  });

  it('shows progress and disables actions while a request is open', () => {
    render(<ImageSlot contentItemId={ITEM} image={image()} request={request()} canon={CANON} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rendering a new set of images');
    expect(screen.getByRole('button', { name: 'Regenerate image' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit brief' })).toBeDisabled();
  });

  it('says why the last request failed', () => {
    render(
      <ImageSlot contentItemId={ITEM} image={image()} request={request({ status: 'failed', error: 'Image render timed out after 120s.' })} canon={CANON} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Image render timed out after 120s.');
  });

  it('asks before removing, then removes the group', async () => {
    const user = userEvent.setup();
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove this image?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove image' }));
    expect(actions.removeImage).toHaveBeenCalledWith({ contentItemId: ITEM, generationGroupId: GROUP });
  });

  it('asks before promoting to a style anchor, and hides the action once it is one', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    await user.click(screen.getByRole('button', { name: 'Use as style anchor' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Use as style anchor' }));
    expect(actions.promoteImageToStyleAnchor).toHaveBeenCalledWith({ contentItemId: ITEM, generationGroupId: GROUP });

    rerender(<ImageSlot contentItemId={ITEM} image={image({ isStyleAnchor: true })} request={null} canon={CANON} />);
    expect(screen.queryByRole('button', { name: 'Use as style anchor' })).not.toBeInTheDocument();
  });

  it('edits the concept (symbol and twist) with a live prompt preview and lint, then renders', async () => {
    const user = userEvent.setup();
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    await user.click(screen.getByRole('button', { name: 'Edit brief' }));

    // v1.2 fields, prefilled from the selected image; no drawn/undrawn, no motif.
    expect(screen.queryByLabelText('Construction lines only')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Motif')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tension')).toHaveValue(PIER.tension);
    expect(screen.getByLabelText('Symbol')).toHaveValue('A lighthouse');
    expect(screen.getByLabelText('Twist')).toHaveValue('One solid gold beam cuts through the fog');
    const prompt = screen.getByText(/^A hand-drawn sketch\./);
    expect(prompt).toHaveTextContent('The symbol: A lighthouse');
    expect(prompt).toHaveTextContent('The twist: One solid gold beam cuts through the fog');
    expect(prompt).not.toHaveTextContent(PIER.tension);

    const symbol = screen.getByLabelText('Symbol');
    await user.clear(symbol);
    await user.type(symbol, 'A rocket');
    expect(screen.getByText('symbol names prohibited imagery: rocket.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render with this brief' })).toBeDisabled();

    await user.clear(symbol);
    await user.type(symbol, 'A rubber stamp');
    const twist = screen.getByLabelText('Twist');
    await user.clear(twist);
    await user.type(twist, 'a rubber stamp');
    expect(screen.getByText(/twist only restates the symbol/)).toBeInTheDocument();
    await user.clear(twist);
    await user.type(twist, 'Poised above a blank sheet');
    expect(screen.getByText(/twist leans on a moment in time \(poised\)/)).toBeInTheDocument();
    await user.clear(twist);
    await user.type(twist, 'Giant, its print in gold on a blank sheet');
    const subject = screen.getByLabelText('Subject');
    await user.clear(subject);
    await user.type(subject, 'A giant rubber stamp beside its gold print');
    await user.selectOptions(screen.getByLabelText('Layout'), 'low_horizon');
    expect(screen.getByText(/^A hand-drawn sketch\./)).toHaveTextContent('Layout: Low horizon: One horizon line, low.');
    await user.click(screen.getByRole('button', { name: 'Render with this brief' }));
    expect(actions.requestImageRender).toHaveBeenCalledWith(
      ITEM,
      expect.objectContaining({ layout: 'low_horizon', symbol: 'A rubber stamp', twist: 'Giant, its print in gold on a blank sheet' }),
    );
  });

  it('shows the run\'s other candidates with their tension, and switches to one', async () => {
    const user = userEvent.setup();
    const bridge = image({
      id: 'img-2',
      generationGroupId: 'g-2',
      candidateIndex: 1,
      isSelected: false,
      tension: 'Everyone is building toward a far side nobody has surveyed.',
      altText: 'A pencil sketch of a half-built footbridge.',
      url: 'https://signed.example/bridge.png',
    });
    render(<ImageSlot contentItemId={ITEM} image={image()} candidates={[bridge]} request={null} canon={CANON} />);

    expect(screen.getByText('Other options')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'A pencil sketch of a half-built footbridge.' })).toHaveAttribute('src', 'https://signed.example/bridge.png');
    expect(screen.getByText('Everyone is building toward a far side nobody has surveyed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Use option 1: Everyone is building/ }));
    expect(actions.selectImageCandidate).toHaveBeenCalledWith({ contentItemId: ITEM, generationGroupId: 'g-2' });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows the reviewer\'s note under the tension, for the selected image and each candidate', () => {
    const other = image({ id: 'img-2', generationGroupId: 'g-2', candidateIndex: 1, isSelected: false, tension: 'A turnstile.', reviewNote: 'Recognisable, but off the hook.' });
    render(<ImageSlot contentItemId={ITEM} image={image({ reviewNote: 'A pun on the exact words.' })} candidates={[other]} request={null} canon={CANON} />);
    expect(screen.getByText('A pun on the exact words.')).toBeInTheDocument();
    expect(screen.getByText('Recognisable, but off the hook.')).toBeInTheDocument();
  });

  it('shows no note when the reviewer did not score the image', () => {
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    expect(screen.queryByText(/pun/)).not.toBeInTheDocument();
  });

  it('still offers the candidates after the selected image is removed', () => {
    const bridge = image({ id: 'img-2', generationGroupId: 'g-2', isSelected: false, tension: 'Far side.' });
    render(<ImageSlot contentItemId={ITEM} image={null} candidates={[bridge]} request={null} canon={CANON} />);
    expect(screen.getByText('No image on this draft.')).toBeInTheDocument();
    expect(screen.getByText('Options')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use option 1/ })).toBeEnabled();
  });

  it('disables switching while a render runs', () => {
    const bridge = image({ id: 'img-2', generationGroupId: 'g-2', isSelected: false });
    render(<ImageSlot contentItemId={ITEM} image={image()} candidates={[bridge]} request={request()} canon={CANON} />);
    expect(screen.getByRole('button', { name: /Use option 1/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Rendering a new set of images');
  });

  it('labels a v1.0 image by its motif', () => {
    render(
      <ImageSlot
        contentItemId={ITEM}
        image={image({ brief: null, tension: null, layout: null, motifKey: 'timepiece', brandVisualVersion: '1.0', candidateSetId: null })}
        request={null}
        canon={CANON}
      />,
    );
    expect(screen.getByText(/^Timepiece · /)).toBeInTheDocument();
  });

  it('offers a brief when there is no image, and points to the canon when there is none', () => {
    const { rerender } = render(<ImageSlot contentItemId={ITEM} image={null} request={null} canon={CANON} />);
    expect(screen.getByText('No image on this draft.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write an image brief' })).toBeEnabled();

    rerender(<ImageSlot contentItemId={ITEM} image={null} request={null} canon={null} />);
    expect(screen.getByRole('link', { name: 'Brand Hub → Visual' })).toHaveAttribute('href', '/brand');
  });
});
