import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepositoryProvider, useRepositories } from './provider';
import type { Bundle } from './bundle';

function ModeProbe() {
  // `never` is the empty slice: this component needs no domain at all, only
  // the mode every bundle carries.
  const { mode } = useRepositories<never>();
  return <span>{mode}</span>;
}

describe('RepositoryProvider', () => {
  it('hands its bundle to client components', () => {
    // Only `mode` is read here — the provider is context plumbing and knows
    // nothing about domains. `Bundle<never>` is the honest type for that, and
    // it needs no cast: since the bundle became splittable, "carries no
    // domains" is expressible rather than something to assert around.
    const bundle: Bundle<never> = { mode: 'demo' };

    render(
      <RepositoryProvider bundle={bundle}>
        <ModeProbe />
      </RepositoryProvider>,
    );

    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('throws rather than returning null outside a provider', () => {
    // A null bundle would surface as "cannot read property of null" deep inside
    // whichever component read it first. Fail at the hook instead.
    expect(() => render(<ModeProbe />)).toThrow(/within a RepositoryProvider/);
  });
});
