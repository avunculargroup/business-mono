import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { Sidebar } from './Sidebar';

// The component reads the route, the signed-in user and a server action. None
// of the three is what this file is about, so they are stubbed rather than
// staged.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/providers/UserProvider', () => ({
  useCurrentUser: () => ({ full_name: 'Ada Lovelace' }),
}));
vi.mock('@/app/actions/auth', () => ({ logout: vi.fn() }));

/**
 * The sidebar carries two hand-maintained nav structures: `workNav`/`systemNav`
 * render the desktop rail, `moreNav` renders the mobile bottom sheet. Below
 * 768px the rail is `display: none` and the sheet is the only way through, so a
 * destination missing from `moreNav` is unreachable on a phone.
 *
 * That is not hypothetical — `/clients` and `/compliance` were added to the
 * desktop rail and not to the sheet, which left Minute's subscriber
 * administration reachable only by typing the URL. Nothing was watching, because
 * the two structures are duplicated literals with no shared source.
 */
const hrefsWithin = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')!);

function renderNav() {
  render(<Sidebar pendingCount={0} />);

  const rail = screen.getByRole('complementary');
  const sheet = screen.getByRole('dialog', { name: 'More navigation' });
  // Two nav landmarks exist: the rail's own, and the mobile tab bar. The tab
  // bar is the one that is not inside the rail.
  const tabBar = screen.getAllByRole('navigation').find((nav) => !rail.contains(nav))!;

  return { rail, sheet, tabBar };
}

describe('Sidebar', () => {
  it('exposes every desktop destination somewhere on mobile', () => {
    const { rail, sheet, tabBar } = renderNav();

    // The tab bar counts: Dashboard and Simon are permanent tabs and are
    // deliberately absent from the sheet.
    const reachableOnMobile = new Set([...hrefsWithin(sheet), ...hrefsWithin(tabBar)]);
    const missing = hrefsWithin(rail).filter((href) => !reachableOnMobile.has(href));

    expect(missing).toEqual([]);
  });

  it('offers Subscribers and Compliance review in the mobile sheet', () => {
    const { sheet } = renderNav();

    expect(within(sheet).getByRole('link', { name: 'Subscribers' })).toHaveAttribute(
      'href',
      '/clients',
    );
    expect(within(sheet).getByRole('link', { name: 'Compliance review' })).toHaveAttribute(
      'href',
      '/compliance',
    );
  });
});
