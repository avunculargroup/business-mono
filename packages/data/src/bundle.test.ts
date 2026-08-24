import { describe, expect, it } from 'vitest';
import { DEMO_DOMAINS } from './bundle';
import type { Bundle, DemoBundle, DemoDomain, RepositoryBundle, RepositoryDomain } from './bundle';

/**
 * The splittable-bundle guard, in the same spirit as `context.test.ts`: the
 * type system does the real work and these cases exist so that undoing it goes
 * red rather than merely reading oddly.
 */
describe('the demo slice', () => {
  it('is a strict subset of the domains — the demo does not render everything', () => {
    // If this ever equals the full set, `data-fixtures` has to fixture every
    // domain the internal app has, which is exactly what decision 2 split the
    // bundle to avoid.
    const all: RepositoryDomain[] = [
      'agentActivity',
      'research',
      'content',
      'campaigns',
      'companies',
      'marketReports',
      'indicators',
      'ecosystem',
    ];

    expect(DEMO_DOMAINS.length).toBeLessThan(all.length);
    for (const domain of DEMO_DOMAINS) {
      expect(all).toContain(domain);
    }
  });

  it('leaves campaigns out', () => {
    // `/campaigns/*` is behind the seam in apps/web but is not a demo route.
    // The slice is what lets that be true without a stub that throws.
    expect(DEMO_DOMAINS).not.toContain('campaigns' as DemoDomain);
  });

  it('names one domain per demo surface', () => {
    // Seven surfaces in demo-app-spec.md § Routes, seven domains. A surface
    // added without a domain is a fixture nobody can read.
    expect(DEMO_DOMAINS).toHaveLength(7);
  });
});

describe('bundle assignability', () => {
  it('accepts a full bundle wherever a demo bundle is wanted, but not the reverse', () => {
    // The whole point of the slice, stated as types. A full bundle has every
    // demo domain, so it satisfies DemoBundle; a demo bundle is missing
    // `campaigns`, so it does not satisfy RepositoryBundle. The two lines below
    // are the assertion — @ts-expect-error fails the build if the second one
    // ever starts compiling.
    const fullSatisfiesDemo: (b: RepositoryBundle) => DemoBundle = (b) => b;

    // @ts-expect-error a demo bundle has no `campaigns`
    const demoDoesNotSatisfyFull: (b: DemoBundle) => RepositoryBundle = (b) => b;

    expect(typeof fullSatisfiesDemo).toBe('function');
    expect(typeof demoDoesNotSatisfyFull).toBe('function');
  });

  it('lets a component ask for the slice it uses and no more', () => {
    // What `useRepositories<'research'>()` produces. A component typed this way
    // compiles against either app's bundle, which is what makes a shared
    // component shareable.
    const takesResearchOnly: (b: Bundle<'research'>) => void = () => {};
    const fromFull: (b: RepositoryBundle) => void = (b) => takesResearchOnly(b);
    const fromDemo: (b: DemoBundle) => void = (b) => takesResearchOnly(b);

    expect(typeof fromFull).toBe('function');
    expect(typeof fromDemo).toBe('function');
  });
});
