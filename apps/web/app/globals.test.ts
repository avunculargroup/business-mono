/**
 * Design-token drift guard.
 *
 * `packages/ui/src/tokens.css` is the canonical token source. `.claude/skills/bts-design/
 * colors_and_type.css` carries the same set as a deliberate copy — that skill's documented
 * workflow is to copy its assets out of the repo to build standalone artifacts, so an
 * @import reaching into packages/ would break the moment that happened.
 *
 * They have already drifted apart once — the skill named Inter as the body font while
 * every other source said DM Sans, which silently miscalibrated every UI task that
 * consulted it. This file is what makes a repeat impossible: the two token blocks must
 * be byte-identical in content, and CI fails if they are not.
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
 * Phase 2 of the demo-app plan (docs/features/demo-app/build-progress.md) moved the
 * canonical set into `@platform/ui` and brought the skill copy to parity. The drift that
 * used to be recorded here is now asserted to be empty.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const TOKENS_CSS = join(REPO_ROOT, 'packages/ui/src/tokens.css');
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

const uiTokens = parseRootTokens(readFileSync(TOKENS_CSS, 'utf8'));
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
  '--color-agent-pending': 'var(--color-surface-subtle)',
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
  '--font-body': "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--font-display': "'Playfair Display', Georgia, 'Times New Roman', serif",
  '--font-mono': "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
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

describe('design tokens', () => {
  it('parses a plausible number of tokens from each source', () => {
    // Guards the parser. If a CSS restructure stops the regex matching, every other
    // assertion here would pass vacuously.
    expect(Object.keys(uiTokens).length).toBeGreaterThan(50);
    expect(Object.keys(skillTokens).length).toBeGreaterThan(50);
  });

  it('@platform/ui matches the canonical set exactly', () => {
    expect(sorted(uiTokens)).toEqual(sorted(CANONICAL_TOKENS));
  });

  it('body font is DM Sans in both sources', () => {
    // Named regression guard for the bug this file was written after: the skill's
    // SKILL.md quick reference said Inter while every other source said DM Sans.
    expect(uiTokens['--font-body']).toContain('DM Sans');
    expect(skillTokens['--font-body']).toContain('DM Sans');
  });
});

describe('the bts-design skill copy', () => {
  it('is identical to @platform/ui, token for token', () => {
    // The strongest form of the guarantee, and the reason the two files are allowed to
    // exist separately at all. Before Phase 2 this pair carried six missing tokens, one
    // orphan, and three differing font stacks. Any reappearance of drift fails here.
    expect(sorted(skillTokens)).toEqual(sorted(uiTokens));
  });

  it('still declares its own Google Fonts import', () => {
    // The copy has to stay self-contained: this skill's documented workflow is to copy
    // its assets out of the repo, and the specimen pages in preview/ load it directly
    // over file://. If someone "tidies" this into an @import of the package, artifacts
    // built outside the repo lose their webfonts silently.
    const raw = readFileSync(SKILL_CSS, 'utf8');
    expect(raw).toContain('fonts.googleapis.com');

    // Checks @import statements specifically, not any mention of the path — the header
    // comment names packages/ui deliberately, to say where the canonical copy lives.
    const imports = [...raw.matchAll(/@import\s+[^;]+;/g)].map((m) => m[0]);
    expect(imports.filter((i) => i.includes('packages/ui'))).toEqual([]);
  });
});
