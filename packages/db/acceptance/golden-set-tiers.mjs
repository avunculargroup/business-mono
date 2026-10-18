#!/usr/bin/env node
// Prints SQL that loads the library papers golden set into the papers schema
// and checks refresh_paper_access() against every hand label.
//
// Each entry's copies[] are the copies after reconciliation — what
// paperResolve should write once it has applied the spec's rules — so this
// tests the deterministic tier, not OpenAlex. Repository copies are loaded as
// verified_at_host (rule 3), because the labels were checked at the repository.
// An entry whose expectedResolution merges it into another (gs-37) is not
// loaded as a paper; the check is instead that its DOI is a copy of the target.
//
//   node packages/db/acceptance/golden-set-tiers.mjs | psql -d papers_check -v ON_ERROR_STOP=1
//
// Run after library-papers.sql's stubs and the migration, on a fresh database.
// See docs/features/client-app/library-papers-build-progress.md#checking-it-locally

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(
  new URL('../../../apps/agents/evals/library-papers/golden-set.json', import.meta.url),
);
const entries = JSON.parse(readFileSync(path, 'utf8'));

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const id = (gs) => `'00000000-0000-0000-0000-${gs.replace('gs-', '').padStart(12, '0')}'`;

const out = [
  'CREATE TEMP TABLE golden_result (entry text, field text, expected text, actual text);',
];

for (const e of entries) {
  if (e.expectedResolution) continue;
  const ids = e.identifiers ?? {};
  out.push(
    `INSERT INTO papers (id, doi, openalex_id, handle, source_url, title, peer_review_status) VALUES (` +
      [id(e.id), q(ids.doi?.toLowerCase()), q(ids.openalexId), q(ids.handle), q(ids.url), q(e.title),
        q(e.expected.peerReviewStatus)].join(', ') + ');',
  );
  e.copies.forEach((c, i) => {
    const isOa = c.isOa ?? c.licence != null;
    const url = c.url ?? `https://golden.invalid/${e.id}/${i}`;
    out.push(
      `INSERT INTO paper_locations (paper_id, host_type, source_name, landing_url, doi, version, licence, is_oa, reported_by, verified_at_host) VALUES (` +
        [id(e.id), q(c.host), q(c.source), q(url), q(c.doi?.toLowerCase()), q(c.version), q(c.licence),
          isOa, `'manual'`, c.host === 'repository'].join(', ') + ');',
    );
  });
  out.push(
    `INSERT INTO golden_result SELECT ${q(e.id)}, 'accessTier', ${q(e.expected.accessTier)}, access_tier FROM papers WHERE id = ${id(e.id)};`,
    `INSERT INTO golden_result SELECT ${q(e.id)}, 'bestLicence', ${q(e.expected.bestLicence)}, best_licence FROM papers WHERE id = ${id(e.id)};`,
  );
}

for (const e of entries.filter((x) => x.expectedResolution?.as === 'copy')) {
  const target = e.expectedResolution.mergeInto;
  out.push(
    `INSERT INTO golden_result SELECT ${q(e.id)}, 'copyOf', ${q(target)}, ` +
      `CASE WHEN EXISTS (SELECT 1 FROM paper_locations WHERE paper_id = ${id(target)} AND doi = ${q(e.identifiers.doi.toLowerCase())}) ` +
      `THEN ${q(target)} END;`,
  );
}

out.push(
  `SELECT entry, field, expected, actual FROM golden_result WHERE expected IS DISTINCT FROM actual ORDER BY entry;`,
  `DO $$ DECLARE n int; total int; BEGIN
     SELECT count(*) FILTER (WHERE expected IS DISTINCT FROM actual), count(*) INTO n, total FROM golden_result;
     IF n > 0 THEN RAISE EXCEPTION 'GOLDEN SET: % of % checks disagree (listed above)', n, total; END IF;
     RAISE NOTICE 'GOLDEN SET: all % checks agree', total;
   END $$;`,
);

process.stdout.write(out.join('\n') + '\n');
