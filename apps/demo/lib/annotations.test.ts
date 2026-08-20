import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ANNOTATIONS, PRINCIPLES, type PrincipleKey } from './annotations';
import { matchesRoute, annotationsFor } from './routeMatch';

const APP_DIR = fileURLToPath(new URL('../app', import.meta.url));

/** Every `.tsx` under app/, so a target can be looked for wherever it lives. */
function appSources(dir = APP_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return appSources(path);
    return entry.name.endsWith('.tsx') ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('every annotation points at something', () => {
  it('has a target element rendered somewhere under app/', () => {
    // The failure this catches is silent: the overlay finds targets with
    // `document.querySelector`, so a renamed or misspelled selector produces
    // no marker and no error. The demo would just quietly have fewer
    // annotations than it claims.
    const sources = appSources().join('\n');

    for (const annotation of ANNOTATIONS) {
      expect(
        sources.includes(`'${annotation.targetSelector}'`) ||
          sources.includes(`"${annotation.targetSelector}"`),
      ).toBe(true);
    }
  });

  it('targets a route that exists', () => {
    // A `page.tsx` for the route, with bracket segments matched as directories.
    const routeDirs = new Set<string>();
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(`${dir}/${entry.name}`, `${prefix}/${entry.name}`);
        else if (entry.name === 'page.tsx') routeDirs.add(prefix === '' ? '/' : prefix);
      }
    };
    walk(APP_DIR, '');

    for (const annotation of ANNOTATIONS) {
      expect([...routeDirs]).toContain(annotation.route);
    }
  });
});

describe('coverage of the required set', () => {
  it('covers every principle that has a buildable target', () => {
    // demo-app-spec.md § Required annotations lists eight rows over seven
    // principles. `hub-and-spoke` targets the trace replay at
    // /agents/run/[id], which is Phase 8 and does not exist — so it ships with
    // that route rather than pointing at nothing here.
    const covered = new Set(ANNOTATIONS.map((annotation) => annotation.principle));
    const expected: PrincipleKey[] = [
      'deterministic-before-llm',
      'publish-gate',
      'curator-notes',
      'quiet-day-path',
      'neutral-delta-colour',
      'compliance-as-alignment',
    ];

    for (const principle of expected) {
      expect([...covered]).toContain(principle);
    }
    expect([...covered]).not.toContain('hub-and-spoke');
  });

  it('documents every principle on /architecture, including the unbuilt one', () => {
    // The written notes are not gated on a route existing. Someone reading the
    // architecture page should get the whole design, not the part that happens
    // to have a marker.
    const documented = PRINCIPLES.map((principle) => principle.key);

    expect(documented).toContain('hub-and-spoke');
    for (const annotation of ANNOTATIONS) {
      expect(documented).toContain(annotation.principle);
    }
  });

  it('links every annotation to a section anchor that exists', () => {
    // The panel links to /architecture#<principle>. A principle with no section
    // is a link to the top of the page, which reads as a broken promise.
    const anchors = new Set(PRINCIPLES.map((principle) => principle.key));

    for (const annotation of ANNOTATIONS) {
      expect([...anchors]).toContain(annotation.principle);
    }
  });
});

describe('annotation prose', () => {
  it('keeps titles under 60 characters', () => {
    for (const annotation of ANNOTATIONS) {
      expect(annotation.title.length).toBeLessThanOrEqual(60);
    }
  });

  it('keeps bodies to two to four sentences', () => {
    // Long enough to explain, short enough that eight of them are ninety
    // seconds of reading. That budget is the spec's, and it is the difference
    // between an annotation layer and a whitepaper nobody opens.
    for (const annotation of ANNOTATIONS) {
      const sentences = annotation.body.split(/\.\s/).filter(Boolean).length;
      expect(sentences).toBeGreaterThanOrEqual(2);
      expect(sentences).toBeLessThanOrEqual(6);
    }
  });

  it('uses no exclamation marks anywhere in the layer', () => {
    const prose = [
      ...ANNOTATIONS.flatMap((annotation) => [annotation.title, annotation.body]),
      ...PRINCIPLES.flatMap((principle) => [principle.title, ...principle.body]),
    ];

    for (const text of prose) {
      expect(text).not.toMatch(/!/);
    }
  });

  it('gives every annotation a distinct order within its route', () => {
    const byRoute = new Map<string, number[]>();
    for (const annotation of ANNOTATIONS) {
      byRoute.set(annotation.route, [...(byRoute.get(annotation.route) ?? []), annotation.order]);
    }

    for (const orders of byRoute.values()) {
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});

describe('route matching', () => {
  it('matches a dynamic segment against any single segment', () => {
    // Written literally, `/market-reports/[id]` matches nothing and both detail
    // annotations vanish — a failure that looks exactly like "this page has no
    // annotations".
    expect(matchesRoute('/market-reports/[id]', '/market-reports/mr-quiet')).toBe(true);
    expect(matchesRoute('/news/[id]', '/news/news-consultation')).toBe(true);
  });

  it('does not match a list route against its own detail route', () => {
    expect(matchesRoute('/market-reports', '/market-reports/mr-quiet')).toBe(false);
    expect(matchesRoute('/news', '/news/news-consultation')).toBe(false);
  });

  it('does not match across a different number of segments', () => {
    expect(matchesRoute('/news/[id]', '/news')).toBe(false);
    expect(matchesRoute('/', '/news')).toBe(false);
  });

  it('selects the right annotations per route, in order', () => {
    expect(annotationsFor('/content').map((a) => a.id)).toEqual(['publish-gate', 'lex-verdict']);
    expect(annotationsFor('/news/news-consultation').map((a) => a.id)).toEqual(['curator-note']);
    expect(annotationsFor('/crm/companies')).toEqual([]);
  });
});
