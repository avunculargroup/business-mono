import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toBrandVisual } from '@platform/shared';
import type { ContentImage, ContentImageRequest } from '@platform/data';

const actions = {
  requestImageRegenerate: vi.fn(),
  requestImageRender: vi.fn(),
  saveImageAltText: vi.fn(),
  removeImage: vi.fn(),
  promoteImageToStyleAnchor: vi.fn(),
};
vi.mock('@/app/actions/contentImages', () => ({
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
  prohibited_terms: ['rocket'],
  motifs: [
    { key: 'vault', label: 'Vault', description: 'A strongbox', use_when: 'Custody', is_active: true },
    { key: 'horizon', label: 'Horizon', description: 'A low line', use_when: 'Macro', is_active: true },
  ],
});

function image(overrides: Partial<ContentImage> = {}): ContentImage & { url: string | null } {
  return {
    id: 'img-1',
    source: 'ai_generated',
    storagePath: `social-images/2026-11-08/${GROUP}/linkedin-1200x627.png`,
    masterPath: `social-images/2026-11-08/${GROUP}/master-16x9.png`,
    generationGroupId: GROUP,
    altText: 'A pencil sketch of an open strongbox.',
    platformCrop: 'linkedin_1200x627',
    brief: {
      skip: false,
      skip_reason: null,
      motif_key: 'vault',
      subject: 'An open strongbox on a desk',
      metaphor: 'custody is a habit',
      composition: null,
      alt_text: 'A pencil sketch of an open strongbox.',
    },
    assembledPrompt: 'PROMPT',
    brandVisualVersion: '1.0',
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
    expect(screen.getByRole('img', { name: 'A pencil sketch of an open strongbox.' })).toHaveAttribute('src', 'https://signed.example/li.png');
    expect(screen.getByText('Vault · google/gemini-2.5-flash-image · canon v1.0 · $0.04')).toBeInTheDocument();
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

  it('queues a regenerate', async () => {
    const user = userEvent.setup();
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    await user.click(screen.getByRole('button', { name: 'Regenerate image' }));
    expect(actions.requestImageRegenerate).toHaveBeenCalledWith(ITEM);
  });

  it('shows progress and disables actions while a request is open', () => {
    render(<ImageSlot contentItemId={ITEM} image={image()} request={request()} canon={CANON} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rendering a new image');
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

  it('edits the brief with a live prompt preview and lint, then renders', async () => {
    const user = userEvent.setup();
    render(<ImageSlot contentItemId={ITEM} image={image()} request={null} canon={CANON} />);
    await user.click(screen.getByRole('button', { name: 'Edit brief' }));

    const prompt = screen.getByText(/^A hand-drawn sketch\./);
    expect(prompt).toHaveTextContent('Visual metaphor: Vault — custody is a habit');

    const subject = screen.getByLabelText('Subject');
    await user.clear(subject);
    await user.type(subject, 'A rocket on a desk');
    expect(screen.getByText('subject names prohibited imagery: rocket.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render with this brief' })).toBeDisabled();

    await user.clear(subject);
    await user.type(subject, 'A low horizon line');
    await user.selectOptions(screen.getByLabelText('Motif'), 'horizon');
    expect(screen.getByText(/^A hand-drawn sketch\./)).toHaveTextContent('Visual metaphor: Horizon — custody is a habit');
    await user.click(screen.getByRole('button', { name: 'Render with this brief' }));
    expect(actions.requestImageRender).toHaveBeenCalledWith(ITEM, expect.objectContaining({ motif_key: 'horizon', subject: 'A low horizon line' }));
  });

  it('offers a brief when there is no image, and points to the canon when there is none', () => {
    const { rerender } = render(<ImageSlot contentItemId={ITEM} image={null} request={null} canon={CANON} />);
    expect(screen.getByText('No image on this draft.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write an image brief' })).toBeEnabled();

    rerender(<ImageSlot contentItemId={ITEM} image={null} request={null} canon={null} />);
    expect(screen.getByRole('link', { name: 'Brand Hub → Visual' })).toHaveAttribute('href', '/brand');
  });
});
