#!/usr/bin/env node
// Checks that every relative link in the repo's README-class docs resolves to a
// file on disk. Offline only — external URLs are not fetched, so this is
// deterministic and safe to gate CI on.
//
// Scope is deliberately the entry-point docs rather than all of docs/: those
// are the ones a visitor lands on, and a broken link there is the failure that
// matters. Widen TARGETS when a folder's links are known good.
//
// Usage: node scripts/check-doc-links.mjs

import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'README.md',
  'CLAUDE.md',
  'apps/*/README.md',
  'packages/*/README.md',
  'packages/db/MIGRATIONS.md',
  'infra/*/README.md',
  'docs/README.md',
  'docs/features/*/README.md',
  // Build-progress docs cite their spec bundle heavily and are the files most
  // likely to outlive the text they cite. They were outside this check until
  // 2026-08-19, which is how 57 citations in the demo-app bundle went stale
  // without anything going red.
  'docs/features/*/build-progress.md',
];

// The three forms that carry a path. The angle-bracket form matters here: it is
// how a link to a Next.js route group — app/(app)/… — survives markdown, since
// the bare parens would otherwise close the link early.
const ANGLE_LINK = /\[[^\]]*\]\(\s*<([^>]+)>\s*\)/g;
const INLINE_LINK = /\[[^\]]*\]\((?!\s*<)([^)\s]+)(?:\s+"[^"]*")?\)/g;
const REFERENCE_LINK = /^\s*\[[^\]]+\]:\s*(\S+)/gm;

function isExternal(target) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // http:, https:, mailto:, skill: …
    target.startsWith('//') ||
    target.startsWith('#')
  );
}

/** Resolve a link target to an absolute path, or null for a pure anchor. */
function resolvePath(fromFile, target) {
  const path = decodeURIComponent(target.split('#')[0]);
  if (path === '') return null; // pure anchor — same file
  return path.startsWith('/') ? join(repoRoot, path) : resolve(dirname(fromFile), path);
}

/** Resolve a link target the way a reader clicking it in GitHub would. */
function resolves(fromFile, target) {
  const absolute = resolvePath(fromFile, target);
  if (absolute === null) return true;
  if (!existsSync(absolute)) return false;
  // A link to a directory is fine — GitHub renders its listing (or README).
  return statSync(absolute).isFile() || statSync(absolute).isDirectory();
}

/**
 * GitHub's heading-to-anchor slug: lowercase, drop everything that is not
 * alphanumeric/space/hyphen/underscore, then spaces to hyphens. Repeats of the
 * same slug in one file get `-1`, `-2`, … as GitHub does.
 */
function slugify(heading) {
  return heading
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

const slugCache = new Map();

function headingSlugs(absolutePath) {
  const cached = slugCache.get(absolutePath);
  if (cached) return cached;

  const slugs = new Set();
  const seen = new Map();
  let inFence = false;

  for (const line of readFileSync(absolutePath, 'utf8').split('\n')) {
    // Headings inside a fenced code block are not headings.
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!match) continue;

    const base = slugify(match[2]);
    if (!base) continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }

  slugCache.set(absolutePath, slugs);
  return slugs;
}

/**
 * A `#fragment` on a link to a markdown file has to name a real heading.
 *
 * This is what makes a section citation worth more than the line numbers it
 * replaced: a line number rots silently when the target is edited, while a
 * renamed or deleted heading turns this red. Only markdown targets are checked
 * — a fragment on anything else is not ours to interpret.
 */
function anchorResolves(fromFile, target) {
  const fragment = target.split('#').slice(1).join('#');
  if (!fragment) return true;

  const absolute = resolvePath(fromFile, target) ?? fromFile;
  if (!absolute.endsWith('.md') || !existsSync(absolute)) return true;
  if (!statSync(absolute).isFile()) return true;

  return headingSlugs(absolute).has(decodeURIComponent(fragment).toLowerCase());
}

/**
 * Expand a TARGETS pattern. Only a single `*` standing for one whole path
 * segment is supported — that is all the patterns above need, and hand-rolling
 * it keeps this script runnable on Node 20 (`fs/promises.glob` landed in 22 and
 * is still experimental there).
 */
async function expand(pattern) {
  const segments = pattern.split('/');
  let candidates = [repoRoot];
  for (const segment of segments) {
    const next = [];
    for (const base of candidates) {
      if (segment === '*') {
        let entries;
        try {
          entries = await readdir(base, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.isDirectory()) next.push(join(base, entry.name));
        }
      } else {
        const candidate = join(base, segment);
        if (existsSync(candidate)) next.push(candidate);
      }
    }
    candidates = next;
  }
  return candidates.filter((path) => statSync(path).isFile());
}

const files = [];
for (const pattern of TARGETS) {
  files.push(...(await expand(pattern)));
}
files.sort();

let broken = 0;
let checked = 0;

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const relative = file.slice(repoRoot.length + 1);
  // Scan line by line so each occurrence reports its own true line number.
  source.split('\n').forEach((text, index) => {
    const targets = [
      ...[...text.matchAll(ANGLE_LINK)].map((m) => m[1]),
      ...[...text.matchAll(INLINE_LINK)].map((m) => m[1]),
      ...[...text.matchAll(REFERENCE_LINK)].map((m) => m[1]),
    ];
    for (const target of new Set(targets)) {
      if (isExternal(target)) continue;
      checked += 1;
      if (!resolves(file, target)) {
        broken += 1;
        console.error(`${relative}:${index + 1}  broken link → ${target}`);
      } else if (!anchorResolves(file, target)) {
        broken += 1;
        console.error(`${relative}:${index + 1}  no such heading → ${target}`);
      }
    }
  });
}

console.log(
  `Checked ${checked} relative link(s) across ${files.length} doc(s); ${broken} broken.`
);
process.exit(broken > 0 ? 1 : 0);
