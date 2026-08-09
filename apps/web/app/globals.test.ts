/**
 * Design-token drift guard.
 *
 * `app/globals.css` is the canonical token source today. `.claude/skills/bts-design/
 * colors_and_type.css` is a second copy that agents read when doing design work, and
 * `docs/DESIGN_BRIEF.md` is a third in prose. They have already drifted apart once —
 * the skill named Inter as the body font while the other two said DM Sans, which
 * silently miscalibrated every UI task that consulted it.
 *
 * These are text-comparison tests on purpose. Token drift is a static property of the
 * files, so it needs no browser: this runs in the fast blocking gate rather than the
 * advisory Playwright workflow, which covers the fuzzier layout and cascade risk.
 *
 * CANONICAL_TOKENS below is a hand-maintained snapshot. Vitest's own file snapshots
 * are not used — they are unused elsewhere in this repo and hit a `SnapshotClient`
 * error under the `test.projects` split in vitest.config.ts. An explicit literal is
 * better here regardless: a 74-entry `.snap` blob is not something anyone reviews
 * carefully, whereas a changed hex in this file shows up in a diff as a changed hex.
 *
 * When a token legitimately changes, update the literal in the same commit. That is
 * the alarm working, not an obstacle.
 *
 * Phase 2 of the demo-app plan (docs/features/demo-app/build-progress.md) moves the
 * canonical set into `@platform/ui` and points the skill copy at it. When that lands,
 * KNOWN_DRIFT below should collapse to empty and this file should read the package
 * rather than globals.css.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const GLOBALS_CSS = join(REPO_ROOT, 'apps/web/app/globals.css');
const SKILL_CSS = join(REPO_ROOT, '.claude/skills/bts-design/colors_and_type.css');

/** Collect every custom property declared in any `:root` block. */
function parseRootTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

function sorted(tokens: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens).sort(([a], [b]) => a.localeCompare(b)));
}

const globalsTokens = parseRootTokens(readFileSync(GLOBALS_CSS, 'utf8'));
const skillTokens = parseRootTokens(readFileSync(SKILL_CSS, 'utf8'));

const CANONICAL_TOKENS: Record<string, string> = {
  '--color-accent': 'var(--color-accent-base)',
  '--color-accent-base': '#C9A84C',
  '--color-accent-dark': '#9A7A2E',
  '--color-accent-glow': 'rgba(201, 168, 76, 0.12)',
  '--color-accent-hover': 'var(--color-accent-dark)',
  '--color-accent-light': '#F0E4C0',
  '--color-accent-subtle': 'var(--color-accent-light)',
  '--color-agent-approved': '#E8F4EE',
  '--color-agent-proposed': 'var(--color-accent-light)',
  '--color-agent-rejected': '#F8ECEC',
  '--color-bg': '#FAFAF8',
  '--color-border': '#E8E6E0',
  '--color-destructive': '#B04040',
  '--color-focus-ring': 'var(--color-accent-base)',
  '--color-stage-client-bg': '#E8F4EE',
  '--color-stage-client-fg': '#1E5C3F',
  '--color-stage-warm-bg': '#FEF3C7',
  '--color-stage-warm-fg': '#92400E',
  '--color-success': '#3D7A5E',
  '--color-surface': '#FFFFFF',
  '--color-surface-active': '#E4E1D9',
  '--color-surface-hover': 'var(--color-surface-subtle)',
  '--color-surface-subtle': '#F4F4F1',
  '--color-text-primary': '#1A1915',
  '--color-text-secondary': '#6B6860',
  '--color-text-tertiary': '#9E9C96',
  '--color-warning': '#B8860B',
  '--color-warning-subtle': '#FEF3C7',
  '--content-max-width': '1200px',
  '--duration-base': '200ms',
  '--duration-fast': '100ms',
  '--duration-slow': '300ms',
  '--ease-default': 'ease',
  '--ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--font-body': "'DM Sans', system-ui, sans-serif",
  '--font-display': "'Playfair Display', Georgia, serif",
  '--font-mono': "'JetBrains Mono', monospace",
  '--header-height': '64px',
  '--leading-normal': '1.5',
  '--leading-relaxed': '1.6',
  '--leading-tight': '1.2',
  '--press-scale': '0.96',
  '--radius-lg': '8px',
  '--radius-md': '6px',
  '--radius-sm': '4px',
  '--radius-xl': '12px',
  '--safe-area-bottom': 'env(safe-area-inset-bottom, 0px)',
  '--shadow-lg': '0 12px 32px rgba(26, 25, 21, 0.10), 0 4px 8px rgba(26, 25, 21, 0.06)',
  '--shadow-md': '0 4px 12px rgba(26, 25, 21, 0.08), 0 2px 4px rgba(26, 25, 21, 0.04)',
  '--shadow-sm': '0 1px 3px rgba(26, 25, 21, 0.06), 0 1px 2px rgba(26, 25, 21, 0.04)',
  '--sidebar-collapsed-width': '64px',
  '--sidebar-width': '240px',
  '--space-1': '4px',
  '--space-12': '48px',
  '--space-16': '64px',
  '--space-2': '8px',
  '--space-20': '80px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '20px',
  '--space-6': '24px',
  '--space-8': '32px',
  '--tap-highlight': 'rgba(201, 168, 76, 0.24)',
  '--text-base': '15px',
  '--text-lg': '20px',
  '--text-md': '16px',
  '--text-sm': '13px',
  '--text-xl': '28px',
  '--text-xs': '11px',
  '--z-base': '0',
  '--z-overlay': '200',
  '--z-raised': '10',
  '--z-sticky': '100',
  '--z-toast': '300',
};

/**
 * Tokens the skill copy is missing, and values on which the two sources disagree.
 * Recorded rather than forbidden — the two files are legitimately separate today.
 * Phase 2 should empty both.
 */
const KNOWN_DRIFT = {
  /** In globals.css, absent from the skill copy. Mostly newer interaction tokens. */
  missingFromSkill: [
    '--color-accent-glow',
    '--color-surface-active',
    '--color-warning-subtle',
    '--press-scale',
    '--safe-area-bottom',
    '--tap-highlight',
  ],
  /** In the skill copy, absent from globals.css. */
  onlyInSkill: ['--color-agent-pending'],
  /**
   * All three font tokens differ, but only in their fallback chains — the skill
   * carries longer stacks. Primary families match, which is asserted separately.
   */
  differingValues: ['--font-body', '--font-display', '--font-mono'],
};

describe('design tokens', () => {
  it('parses a plausible number of tokens from each source', () => {
    // Guards the parser. If a CSS restructure stops the regex matching, every other
    // assertion here would pass vacuously.
    expect(Object.keys(globalsTokens).length).toBeGreaterThan(50);
    expect(Object.keys(skillTokens).length).toBeGreaterThan(50);
  });

  it('globals.css matches the canonical set exactly', () => {
    expect(sorted(globalsTokens)).toEqual(sorted(CANONICAL_TOKENS));
  });

  it('body font is DM Sans in both sources', () => {
    // Named regression guard for the bug this file was written after: the skill's
    // SKILL.md quick reference said Inter while every other source said DM Sans.
    expect(globalsTokens['--font-body']).toContain('DM Sans');
    expect(skillTokens['--font-body']).toContain('DM Sans');
  });
});

describe('token drift between globals.css and the bts-design skill', () => {
  const missingFromSkill = Object.keys(globalsTokens)
    .filter((t) => !(t in skillTokens))
    .sort();
  const onlyInSkill = Object.keys(skillTokens)
    .filter((t) => !(t in globalsTokens))
    .sort();
  const differingValues = Object.keys(globalsTokens)
    .filter((t) => t in skillTokens && globalsTokens[t] !== skillTokens[t])
    .sort();

  it('has not drifted beyond what is already recorded', () => {
    expect(missingFromSkill).toEqual(KNOWN_DRIFT.missingFromSkill);
    expect(onlyInSkill).toEqual(KNOWN_DRIFT.onlyInSkill);
    expect(differingValues).toEqual(KNOWN_DRIFT.differingValues);
  });

  it('agrees exactly on core colours', () => {
    // The drift is at the edges. If it reaches the core palette, the skill has stopped
    // describing the same design system the app implements. Colours are compared
    // exactly — there is no cosmetic difference in a hex.
    for (const token of [
      '--color-bg',
      '--color-surface',
      '--color-surface-subtle',
      '--color-border',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-accent-base',
      '--color-success',
      '--color-warning',
      '--color-destructive',
    ]) {
      expect(globalsTokens[token], `${token} missing from globals.css`).toBeDefined();
      expect(skillTokens[token], `${token} missing from the bts-design skill`).toBeDefined();
      expect(skillTokens[token], `${token} differs between sources`).toBe(globalsTokens[token]);
    }
  });

  it('agrees on the primary family of each font token', () => {
    // Font stacks are compared on the first family only. globals.css has
    // `system-ui, sans-serif` where the skill has `system-ui, -apple-system,
    // 'Segoe UI', sans-serif` — real drift, recorded above, but cosmetic: the
    // fallback only renders if the webfont fails. The primary family is the design
    // decision and must match.
    const primaryFamily = (stack: string) => stack.split(',')[0].trim().replace(/['"]/g, '');
    for (const token of ['--font-body', '--font-display', '--font-mono']) {
      expect(globalsTokens[token], `${token} missing from globals.css`).toBeDefined();
      expect(skillTokens[token], `${token} missing from the bts-design skill`).toBeDefined();
      expect(
        primaryFamily(skillTokens[token]),
        `${token} names a different primary family in each source`,
      ).toBe(primaryFamily(globalsTokens[token]));
    }
  });
});
