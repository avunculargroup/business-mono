import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/actions/contentImages', () => ({ getImageDownloadUrl: vi.fn() }));
vi.mock('@platform/ui/ToastProvider', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { SocialDraftCopyView } from './SocialDraftCopyView';

const BASE = {
  platform: 'linkedin' as const,
  accountName: 'Chris',
  body: 'Twenty years. Nobody knows the trigger.',
  isThread: false,
  segments: [],
  disclaimerText: null,
};

describe('SocialDraftCopyView image', () => {
  it('shows a headline card’s headline with its own copy button', () => {
    render(
      <SocialDraftCopyView
        {...BASE}
        image={{ storagePath: 'social-images/x/linkedin-1200x627.png', altText: '“Nobody knows.” — A lighthouse.', headline: 'Nobody knows.', previewUrl: 'https://signed/li.png' }}
      />,
    );
    expect(screen.getByText('Headline')).toBeInTheDocument();
    expect(screen.getByText('Nobody knows.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy headline/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy alt text/ })).toBeInTheDocument();
  });

  it('shows no headline block for an image-only card', () => {
    render(<SocialDraftCopyView {...BASE} image={{ storagePath: 'p', altText: 'A lighthouse.', headline: null, previewUrl: null }} />);
    expect(screen.queryByRole('button', { name: /Copy headline/ })).not.toBeInTheDocument();
  });
});
