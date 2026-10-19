-- Session 1 acceptance for 20261018100000_library_papers.sql.
-- Every check raises on failure, so a clean run ends with ALL ACCEPTANCE CHECKS PASSED.
-- See docs/features/client-app/library-papers-build-progress.md#checking-it-locally
\set ON_ERROR_STOP 1
-- Each expectation raises on failure, so the script stops at the first broken rule.
-- IS NOT TRUE, not NOT: a NULL comparison is a failure, not a pass.
CREATE OR REPLACE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'ok: %', label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.raises(stmt text, pattern text, label text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* pattern THEN RAISE NOTICE 'ok (raised): %', label; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised the wrong error: %', label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: % did not raise', label;
END $$;

INSERT INTO team_members (id, auth_id) VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1');
INSERT INTO client_accounts (id, client_type) VALUES ('00000000-0000-0000-0000-0000000000c1', 'corporate');
INSERT INTO client_users VALUES ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', 'active');

INSERT INTO paper_venues (id, name, venue_type, reputation, publisher) VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'Ledger', 'journal', 'accepted', 'University of Pittsburgh'),
  ('00000000-0000-0000-0000-00000000aa02', 'Closed Journal', 'journal', 'accepted', 'Elsevier'),
  ('00000000-0000-0000-0000-00000000aa03', 'Unvetted Journal', 'journal', 'unreviewed', NULL);

-- Licences: the conservative route
SELECT pg_temp.expect((SELECT array_agg(code ORDER BY code) FROM paper_licences WHERE rehost_in_paid_product)
  = ARRAY['cc-by','cc-by-sa','cc0','public-domain'], 'seed approves exactly CC BY, BY-SA, CC0, public domain');
SELECT pg_temp.expect(NOT (SELECT rehost_in_paid_product FROM paper_licences WHERE code = 'cc-by-nd'), 'BY-ND is link-out');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM paper_licences WHERE code LIKE '%-nc%' AND rehost_in_paid_product),
  'no NC licence approved');
SELECT pg_temp.raises($$UPDATE paper_licences SET rehost_in_paid_product = true WHERE code = 'cc-by-nc'$$,
  'rehost_is_decided', 'approval needs a named decider');

-- Identity
SELECT pg_temp.raises($$INSERT INTO papers (doi, title) VALUES ('https://doi.org/10.5195/ledger.2020.1', 'x')$$,
  'papers_doi_check', 'DOI with URL prefix rejected');
SELECT pg_temp.raises($$INSERT INTO papers (arxiv_id, title) VALUES ('2101.00001v2', 'x')$$,
  'arxiv_id_check', 'versioned arXiv id rejected');
SELECT pg_temp.raises($$INSERT INTO papers (title) VALUES ('x')$$, 'papers_has_identifier', 'identifier required');
INSERT INTO papers (handle, title) VALUES ('10197/7168', 'A working paper with only a handle');
INSERT INTO papers (source_url, title) VALUES ('https://example.org/law-journal/vol4/iss1/3', 'A law note with only a URL');
SELECT pg_temp.expect((SELECT count(*) FROM papers) = 2, 'a handle or a URL is enough to identify a work');

-- The tier walk below starts with cc-by unapproved, then approves it.
UPDATE paper_licences SET rehost_in_paid_product = false WHERE code = 'cc-by';

\set P1 '\'00000000-0000-0000-0000-0000000000b1\''
\set P2 '\'00000000-0000-0000-0000-0000000000b2\''
\set P3 '\'00000000-0000-0000-0000-0000000000b3\''
\set P5 '\'00000000-0000-0000-0000-0000000000b5\''
-- P1: open paper in Ledger. P2: closed paper. P3: candidate in an unvetted venue. P5: a preprint, as its own work.
INSERT INTO papers (id, doi, title, venue_id, peer_review_status, relevance_tier, status) VALUES
  (:P1, '10.5195/ledger.2020.1', 'Bitcoin accounting', '00000000-0000-0000-0000-00000000aa01', 'peer_reviewed', 'core', 'draft'),
  (:P2, '10.1016/j.jcf.2021.2', 'Bitcoin hedge', '00000000-0000-0000-0000-00000000aa02', 'peer_reviewed', 'substantial', 'draft'),
  (:P3, '10.9999/predatory.1', 'Bitcoin moon', '00000000-0000-0000-0000-00000000aa03', 'peer_reviewed', 'core', 'candidate'),
  (:P5, '10.20944/preprints202108.0001.v1', 'Bitcoin preprint', NULL, 'preprint', 'core', 'candidate');

SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'metadata_only', 'new paper is metadata_only');
INSERT INTO paper_abstracts (paper_id, abstract, source) VALUES (:P1, 'We study...', 'crossref'), (:P2, 'We test...', 'crossref');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P2) = 'metadata_only', 'an abstract does not change the tier');

-- Reconciliation rules that are constraints
SELECT pg_temp.raises($$INSERT INTO paper_locations (paper_id, host_type, landing_url, version, is_oa, reported_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'preprint_server', 'https://www.preprints.org/manuscript/1', 'acceptedVersion', true, 'openalex')$$,
  'preprint_server_submitted', 'rule 4: a preprint server copy cannot be an accepted version');
SELECT pg_temp.raises($$INSERT INTO paper_locations (paper_id, host_type, landing_url, version, is_oa, reported_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'repository', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1', 'publishedVersion', true, 'openalex')$$,
  'ssrn_not_published', 'rule 2: SSRN cannot host a published version (by URL)');
SELECT pg_temp.raises($$INSERT INTO paper_locations (paper_id, host_type, pdf_url, doi, version, is_oa, reported_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'repository', 'https://example.org/x.pdf', '10.2139/ssrn.3171204', 'acceptedVersion', true, 'openalex')$$,
  'ssrn_not_published', 'rule 2: SSRN cannot host an accepted version (by DOI)');
INSERT INTO paper_locations (paper_id, host_type, landing_url, doi, version, is_oa, reported_by) VALUES
  (:P1, 'repository', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2', '10.2139/ssrn.2', 'submittedVersion', true, 'openalex');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'metadata_only', 'an SSRN working paper does not lift a published paper');

INSERT INTO paper_locations (paper_id, host_type, landing_url, version, licence, is_oa, reported_by) VALUES
  (:P1, 'preprint_server', 'https://arxiv.org/abs/2001.1', 'submittedVersion', 'arxiv-default', true, 'arxiv');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'metadata_only', 'an arXiv preprint does not lift a published paper');

INSERT INTO paper_locations (id, paper_id, host_type, landing_url, version, is_oa, reported_by) VALUES
  ('00000000-0000-0000-0000-0000000000d3', :P1, 'repository', 'https://eprints.soton.ac.uk/1', 'acceptedVersion', true, 'openalex');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'metadata_only', 'rule 3: an unconfirmed repository copy does not count');
UPDATE paper_locations SET verified_at_host = true, reported_by = 'repository' WHERE id = '00000000-0000-0000-0000-0000000000d3';
INSERT INTO paper_events (paper_id, event_type, detail, source) VALUES
  (:P1, 'reconciled', '{"rule": 3, "input": "openalex is_oa=false", "verdict": "repository export: accepted, public"}', 'paperResolve');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_at_source', 'rule 3: confirmed at the repository -> read_at_source');
SELECT pg_temp.raises($$INSERT INTO paper_events (paper_id, event_type, source) VALUES ('00000000-0000-0000-0000-0000000000b1', 'reconciled', 'x')$$,
  'reconciled_has_detail', 'a reconciled event must name its rule');

INSERT INTO paper_locations (id, paper_id, host_type, landing_url, pdf_url, version, licence, oa_status, is_oa, reported_by) VALUES
  ('00000000-0000-0000-0000-0000000000d2', :P1, 'publisher', 'https://ledger.pitt.edu/1', 'https://ledger.pitt.edu/1.pdf', 'publishedVersion', 'cc-by', 'diamond', true, 'crossref');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_at_source', 'cc-by unapproved -> still read_at_source');
SELECT pg_temp.expect((SELECT best_oa_url FROM papers WHERE id = :P1) = 'https://ledger.pitt.edu/1', 'published version preferred as best copy');
SELECT pg_temp.raises($$INSERT INTO paper_locations (paper_id, host_type, landing_url, reported_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'publisher', 'https://ledger.pitt.edu/1', 'manual')$$,
  'paper_locations_copy_key', 'duplicate copy rejected');

UPDATE paper_licences SET rehost_in_paid_product = true, decided_by = '00000000-0000-0000-0000-0000000000a1', decided_at = now() WHERE code = 'cc-by';
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_here', 'approving cc-by -> read_here');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :P1 AND event_type = 'access_changed') = 2, 'every tier change logged');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM v_licence_audit WHERE paper_id = :P1 AND issue = 'read_here_without_file'), 'audit: read_here without file');

-- A preprint is judged on its own copies; it is its own record, linked to its published version.
INSERT INTO paper_locations (paper_id, host_type, landing_url, doi, version, licence, is_oa, reported_by) VALUES
  (:P5, 'preprint_server', 'https://www.preprints.org/manuscript/202108.0001', '10.20944/preprints202108.0001.v1', 'submittedVersion', 'cc-by', true, 'crossref');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P5) = 'read_here', 'a preprint is judged on its own copies');
-- Rule 4: the draft is its own record, and its copy can also sit on the published paper.
INSERT INTO paper_relations (from_paper_id, to_paper_id, relation, source) VALUES (:P1, :P5, 'published_version_of', 'openalex');
INSERT INTO paper_locations (paper_id, host_type, landing_url, doi, version, licence, is_oa, reported_by) VALUES
  (:P1, 'preprint_server', 'https://www.preprints.org/manuscript/202108.0001/copy', '10.20944/preprints202108.0001.v1', 'submittedVersion', 'cc-by', true, 'openalex');
SELECT pg_temp.expect((SELECT count(*) FROM paper_locations WHERE doi = '10.20944/preprints202108.0001.v1') = 2,
  'rule 4: a draft DOI can be its own record and a copy on the published paper');
SELECT pg_temp.expect((SELECT best_oa_url FROM papers WHERE id = :P1) = 'https://ledger.pitt.edu/1.pdf',
  'the draft copy does not displace the published copy');
SELECT pg_temp.raises($$INSERT INTO paper_locations (paper_id, host_type, landing_url, doi, version, is_oa, reported_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'preprint_server', 'https://www.preprints.org/manuscript/y', '10.20944/preprints202108.0001.v1', 'submittedVersion', true, 'openalex')$$,
  'paper_locations_doi_key', 'a copy DOI appears once per paper');
UPDATE papers SET peer_review_status = 'peer_reviewed' WHERE id = :P5;
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P5) = 'metadata_only', 'the same copy no longer counts once the work is peer reviewed');
UPDATE papers SET peer_review_status = 'preprint' WHERE id = :P5;
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM v_licence_audit WHERE paper_id = :P5), 'audit ignores read_here preprints');

-- Files
SELECT pg_temp.raises($$INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256) VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', 'cc-by-nc', 'publishedVersion', 'a.pdf', repeat('a', 64))$$,
  'not approved for rehosting', 'SPEC ACCEPTANCE: cc-by-nc file raises');
SELECT pg_temp.raises($$INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256) VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d3', 'cc-by', 'acceptedVersion', 'a.pdf', repeat('a', 64))$$,
  'does not match', 'file mislabelled as cc-by against an unlicensed copy raises');
INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256)
VALUES (:P1, '00000000-0000-0000-0000-0000000000d2', 'cc-by', 'publishedVersion', 'ledger/1.pdf', repeat('a', 64));
INSERT INTO storage.objects (bucket_id, name) VALUES ('papers', 'ledger/1.pdf'), ('papers', 'orphan.pdf');

-- Chunks: every kind for both papers
INSERT INTO paper_chunks (paper_id, chunk_kind, chunk_index, content) VALUES
  (:P1, 'abstract', 0, 'a'), (:P1, 'full_text', 0, 'f'), (:P1, 'summary', 0, 's'), (:P1, 'curator_note', 0, 'c'),
  (:P2, 'abstract', 0, 'a'), (:P2, 'full_text', 0, 'f'), (:P2, 'summary', 0, 's'), (:P2, 'curator_note', 0, 'c');

-- Publication gate
SELECT pg_temp.raises($$UPDATE papers SET status = 'published', slug = 'bitcoin-accounting' WHERE id = '00000000-0000-0000-0000-0000000000b1'$$,
  'papers_published_requires_lex', 'publish without Lex raises');
UPDATE papers SET summary = '{"basis":"full_text"}', summary_plain = 'The authors report...', slug = 'bitcoin-accounting',
  lex_reviewed_at = now(), lex_reviewed_by = '00000000-0000-0000-0000-0000000000a1' WHERE id = :P1;
SELECT pg_temp.expect((SELECT count(*) FROM v_minute_papers WHERE id = :P1) = 0, 'SPEC ACCEPTANCE: draft not in v_minute_papers');
UPDATE papers SET status = 'published' WHERE id = :P1;
SELECT pg_temp.expect((SELECT published_at IS NOT NULL FROM papers WHERE id = :P1), 'published_at stamped');
SELECT pg_temp.raises($$UPDATE papers SET summary_plain = 'Bitcoin is safe.' WHERE id = '00000000-0000-0000-0000-0000000000b1'$$,
  'papers_published_requires_lex', 'editing a published summary without review raises');
UPDATE papers SET summary_plain = 'The authors report, in their sample...', lex_reviewed_at = now() WHERE id = :P1;
SELECT pg_temp.expect((SELECT lex_reviewed_by IS NOT NULL FROM papers WHERE id = :P1), 'edit with fresh review stands');

UPDATE papers SET summary = '{}', summary_plain = 's', slug = 'bitcoin-moon', lex_reviewed_at = now(),
  lex_reviewed_by = '00000000-0000-0000-0000-0000000000a1' WHERE id = :P3;
SELECT pg_temp.raises($$UPDATE papers SET status = 'published' WHERE id = '00000000-0000-0000-0000-0000000000b3'$$,
  'not accepted', 'publish in unvetted venue raises');
UPDATE papers SET summary = '{"basis":"abstract"}', summary_plain = 's', slug = 'bitcoin-hedge', lex_reviewed_at = now(),
  lex_reviewed_by = '00000000-0000-0000-0000-0000000000a1', status = 'published' WHERE id = :P2;

-- Team sessions get the same answers from the views
SELECT pg_temp.expect((SELECT abstract FROM v_minute_papers WHERE id = :P2) IS NULL, 'view: closed paper abstract NULL even for the team');
SELECT pg_temp.expect((SELECT count(*) FROM v_minute_paper_chunks WHERE paper_id = :P2) = 2, 'view: closed paper offers summary and curator note only');

-- Subscriber session
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-0000000000f2', false);
SELECT pg_temp.expect((SELECT count(*) FROM papers WHERE status = 'candidate') = 0, 'SPEC ACCEPTANCE: subscriber sees no candidates');
SELECT pg_temp.expect((SELECT count(*) FROM papers) = 2, 'subscriber sees both published papers');
SELECT pg_temp.expect((SELECT count(*) FROM v_minute_papers) = 2, 'subscriber reads v_minute_papers');
SELECT pg_temp.expect((SELECT abstract FROM v_minute_papers WHERE id = :P1) = 'We study...', 'read_here abstract shown');
SELECT pg_temp.expect((SELECT abstract FROM v_minute_papers WHERE id = :P2) IS NULL, 'SPEC ACCEPTANCE: closed paper abstract NULL');
SELECT pg_temp.expect((SELECT count(*) FROM paper_abstracts) = 1, 'closed paper abstract hidden from direct reads');
SELECT pg_temp.expect((SELECT count(*) FROM paper_chunks WHERE paper_id = :P2 AND chunk_kind IN ('abstract','full_text')) = 0,
  'SPEC ACCEPTANCE: no abstract or full-text chunk for a closed paper');
SELECT pg_temp.expect((SELECT count(*) FROM paper_chunks WHERE paper_id = :P2) = 2, 'closed paper: summary and curator note chunks readable');
SELECT pg_temp.expect((SELECT count(*) FROM paper_chunks WHERE paper_id = :P1) = 4, 'read_here paper: every chunk readable');
SELECT pg_temp.expect((SELECT count(*) FROM v_minute_paper_chunks) = 6, 'v_minute_paper_chunks agrees with RLS');
SELECT pg_temp.expect((SELECT count(*) FROM paper_venues) = 2, 'subscriber sees only venues with published papers');
SELECT pg_temp.expect((SELECT count(*) FROM paper_files) = 1, 'subscriber sees the live file');
SELECT pg_temp.expect((SELECT count(*) FROM storage.objects) = 1, 'subscriber can sign only the paper file');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events) = 0, 'events team-only');

-- Anonymous / staff-less session sees nothing
SELECT set_config('test.uid', '', false);
SELECT pg_temp.expect((SELECT count(*) FROM papers) = 0, 'no session sees nothing');
RESET ROLE;

-- Revoking cc-by
UPDATE paper_licences SET rehost_in_paid_product = false WHERE code = 'cc-by';
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_at_source', 'revoking cc-by drops tier');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM v_licence_audit WHERE issue = 'file_licence_not_approved'), 'audit: stored file under revoked licence');
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-0000000000f2', false);
SELECT pg_temp.expect((SELECT count(*) FROM storage.objects) = 0, 'revoked file no longer signable');
SELECT pg_temp.expect((SELECT abstract FROM v_minute_papers WHERE id = :P1) IS NULL, 'abstract withdrawn with the tier');
SELECT pg_temp.expect((SELECT count(*) FROM paper_chunks WHERE paper_id = :P1) = 2, 'full-text chunks withdrawn with the tier');
RESET ROLE;
UPDATE paper_files SET withdrawn_at = now() WHERE paper_id = :P1;
SELECT pg_temp.raises($$UPDATE paper_files SET withdrawn_at = NULL$$, 'not approved', 'un-withdrawing re-runs the gate');

-- Deleting a paper cascades without tripping the refresh triggers
DELETE FROM papers WHERE id = :P2;
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM paper_abstracts WHERE paper_id = :P2), 'delete cascades cleanly');
SELECT 'ALL ACCEPTANCE CHECKS PASSED';
