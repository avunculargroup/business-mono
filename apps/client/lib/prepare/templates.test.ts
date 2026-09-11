import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplate, validateTemplate } from '@platform/shared';
import { KNOWN_FACT_KEYS } from '@platform/data-supabase';

/**
 * Every `/prepare` template seeded into the repository, run through the real
 * parser and the real validator.
 *
 * A template is a string in a migration. Nothing about writing one is
 * type-checked, and the failure mode is not a crash — it is a pack that renders
 * with a missing section, or a fact block that never resolves, discovered by a
 * subscriber assembling a board paper. The validator exists to catch that; this
 * test is what points it at the templates that actually ship.
 *
 * It also closes the loop on assumption A6. `facts_required` is validated
 * against the fact registry, so a template referencing a key no source provides
 * fails here rather than rendering as a stated absence in every pack generated
 * from it, for ever.
 */
const MIGRATIONS = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));

/** Bodies are stored between `$template$` dollar-quoted delimiters. */
function seededTemplates(): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = [];

  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const parts = sql.split('$template$');
    // A body is every odd-indexed part: open, body, close.
    for (let index = 1; index < parts.length; index += 2) {
      out.push({ file, body: parts[index]! });
    }
  }

  return out;
}

describe('seeded prepare templates', () => {
  const templates = seededTemplates();

  it('finds the templates, so the cases below are asserting something', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates.map((t) => [t.file, t.body] as const))(
    '%s parses and validates with no problems',
    (_file, body) => {
      const parsed = parseTemplate(body);
      const problems = validateTemplate(parsed, body, KNOWN_FACT_KEYS);

      expect(
        problems.map((problem) => `${problem.where}: ${problem.message}`),
      ).toEqual([]);
    },
  );

  it.each(templates.map((t) => [t.file, t.body] as const))(
    '%s binds every fact it declares to at least one section',
    (_file, body) => {
      // A declared-but-unbound fact is dead weight: it is resolved on every
      // open, snapshotted into every pack, and rendered nowhere.
      const parsed = parseTemplate(body);
      const bound = new Set(parsed.sections.flatMap((section) => section.facts));

      for (const key of parsed.factsRequired) {
        expect(bound.has(key), `${key} is declared but bound to no section`).toBe(true);
      }
    },
  );

  it.each(templates.map((t) => [t.file, t.body] as const))(
    '%s asks a question in every section',
    (_file, body) => {
      // The validator checks this too. Asserted separately because it is the
      // single rule the whole feature rests on: the pack asks questions and
      // states facts, and it never states conclusions.
      for (const section of parseTemplate(body).sections) {
        expect(section.prompt.trim().endsWith('?'), `${section.id} does not ask`).toBe(true);
      }
    },
  );

  it.each(templates.map((t) => [t.file, t.body] as const))(
    '%s suggests no allocation, percentage or target',
    (_file, body) => {
      // Beyond the prohibited-conclusion list: a bare percentage anywhere in a
      // template is almost certainly a suggested allocation, and the right
      // number depends on a balance sheet BTS has deliberately never seen.
      const percentages = body.match(/\b\d+(\.\d+)?\s?%/g) ?? [];

      expect(percentages, 'a figure with a percent sign in a template body').toEqual([]);
    },
  );
});
