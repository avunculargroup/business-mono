import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fakeNewsItemDetail } from '@/test/mocks/repositories';

vi.mock('./ReportPanel', () => ({ ReportPanel: () => null }));

import { NewsItemDetail } from './NewsItemDetail';

describe('NewsItemDetail', () => {
  it('links to the original when its URL is clean', () => {
    render(<NewsItemDetail item={fakeNewsItemDetail({ url: 'https://afr.com/story' })} body={null} />);
    expect(screen.getByRole('link', { name: /view original/i })).toHaveAttribute('href', 'https://afr.com/story');
  });

  it.each([
    'https://email-st.seekingalpha.com/click/1.2/aHR0cHM6Ly9leGFtcGxlLmNvbS8=/sig',
    'https://example.ghost.io/r/0a1b2c3d?m=00000000-0000-0000-0000-000000000000',
  ])('offers no "View original" for a subscriber-scoped URL: %s', (url) => {
    render(<NewsItemDetail item={fakeNewsItemDetail({ url })} body={null} />);
    expect(screen.queryByRole('link', { name: /view original/i })).toBeNull();
  });

  it('shows the server-rendered body it is given', () => {
    render(<NewsItemDetail item={fakeNewsItemDetail()} body={<p>Rendered body</p>} />);
    expect(screen.getByText('Rendered body')).toBeInTheDocument();
  });

  it('says no full text was stored when there is no body', () => {
    render(<NewsItemDetail item={fakeNewsItemDetail()} body={null} />);
    expect(screen.getByText(/no full text was stored/i)).toBeInTheDocument();
  });
});
