import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The last check in the session plan, as a test.
 *
 * > Open the network tab, complete a full board paper, export it. If any
 * > request body contains a sentence the subscriber typed, the two-layer model
 * > has leaked and the not-advice boundary is no longer architectural.
 *
 * A network tab is a thing someone has to remember to open. This is the same
 * check made structural: the modules that hold subscriber prose are asserted to
 * contain no transport at all, so there is no request body for a sentence to
 * end up in.
 *
 * Weaker than the manual check in one way — it cannot see a leak introduced in
 * a component rather than in these modules — and stronger in another, because
 * it runs on every commit. The component side is covered by the write-surface
 * case in `lib/boundary.test.ts`, which asserts the app performs no writes of
 * its own at all.
 */
const PREPARE_LIB = fileURLToPath(new URL('.', import.meta.url));
const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Anything that could put bytes on a wire.
 *
 * `fetch` and `XMLHttpRequest` are the obvious ones; `sendBeacon` is the one
 * that would be added for the best of reasons ("just autosave telemetry") and
 * is the most dangerous, because it is fire-and-forget and nothing would look
 * broken. A server action import is here too: in Next, calling one is a POST.
 */
const TRANSPORT = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /navigator\.sendBeacon/,
  /new WebSocket/,
  /EventSource/,
  /'use server'/,
  /from '@\/app\/actions/,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('the modules that hold subscriber prose', () => {
  it('contain no transport of any kind', () => {
    for (const file of sourceFiles(PREPARE_LIB)) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of TRANSPORT) {
        expect(
          pattern.test(source),
          `${file.replace(APP_ROOT, '')} matches ${pattern}. Composed prose lives on the `
            + `subscriber's device; a transport in this directory is how that stops being true.`,
        ).toBe(false);
      }
    }
  });

  it('reach no storage outside IndexedDB', () => {
    // localStorage and sessionStorage are not the hazard IndexedDB is — but a
    // pack drafted into localStorage would be a second store with different
    // rules, and the honest claim is "one store, on this device".
    for (const file of sourceFiles(PREPARE_LIB)) {
      const source = readFileSync(file, 'utf8');
      expect(/localStorage|sessionStorage|document\.cookie/.test(source)).toBe(false);
    }
  });

  it('include a store module, so this test is asserting something', () => {
    // Guards against the whole directory being moved or renamed, which would
    // make every case above vacuously pass.
    const files = sourceFiles(PREPARE_LIB).map((file) => file.replace(PREPARE_LIB, ''));

    expect(files).toContain('store.ts');
    expect(files).toContain('compose.ts');
  });

  it('keeps the composer pure — no clock, no randomness, no environment', () => {
    // composePack takes `now` as an argument rather than calling Date.now().
    // That is what makes the export reproducible and the tests exhaustive, and
    // it is easy to lose to one convenience call.
    const source = readFileSync(join(PREPARE_LIB, 'compose.ts'), 'utf8');

    expect(/Date\.now\(\)/.test(source)).toBe(false);
    expect(/Math\.random\(\)/.test(source)).toBe(false);
    expect(/process\.env/.test(source)).toBe(false);
  });
});
