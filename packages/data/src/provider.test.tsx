import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepositoryProvider, useRepositories } from './provider';
import type { RepositoryBundle } from './bundle';

function ModeProbe() {
  const { mode } = useRepositories();
  return <span>{mode}</span>;
}

describe('RepositoryProvider', () => {
  it('hands its bundle to client components', () => {
    // Only `mode` is read here — the provider is context plumbing and knows
    // nothing about domains. Asserted through a cast rather than by stubbing
    // every repository, which would make this test grow with each vertical
    // while testing nothing more than it does now.
    const bundle = { mode: 'demo' } as RepositoryBundle;

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
