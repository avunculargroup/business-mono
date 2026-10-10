-- Session 1 acceptance for 20261010100000_library_papers.sql.
-- Every check raises on failure, so a clean run ends with ALL ACCEPTANCE CHECKS PASSED.
-- See docs/features/client-app/library-papers-build-progress.md#checking-it-locally
\set ON_ERROR_STOP 1
-- Each expectation raises on failure, so the script stops at the first broken rule.
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

-- PA: an I4OA member, undecided. PB: neither a member nor decided.
INSERT INTO paper_publishers (id, name, joined_i4oa) VALUES
  ('00000000-0000-0000-0000-00000000ee01', 'Open Publisher', true),
  ('00000000-0000-0000-0000-00000000ee02', 'Closed Publisher', false);
SELECT pg_temp.expect((SELECT abstract_policy FROM paper_publishers WHERE name = 'Closed Publisher') = 'summary_only',
  'a new publisher starts at summary_only');
SELECT pg_temp.raises($$UPDATE paper_publishers SET abstract_policy = 'display' WHERE name = 'Closed Publisher'$$,
  'display_is_decided', 'display needs a decision');
SELECT pg_temp.raises($$UPDATE paper_publishers SET abstract_policy = 'display', decided_at = now(), decided_by = '00000000-0000-0000-0000-0000000000a1' WHERE name = 'Closed Publisher'$$,
  'decision_complete', 'a decision needs a reason');

INSERT INTO paper_venues (id, name, venue_type, reputation, publisher_id) VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'Ledger', 'journal', 'accepted', '00000000-0000-0000-0000-00000000ee01'),
  ('00000000-0000-0000-0000-00000000aa02', 'Closed Journal', 'journal', 'accepted', '00000000-0000-0000-0000-00000000ee02'),
  ('00000000-0000-0000-0000-00000000aa03', 'Unvetted Journal', 'journal', 'unreviewed', NULL);

SELECT pg_temp.raises($$INSERT INTO papers (doi, title) VALUES ('https://doi.org/10.5195/ledger.2020.1', 'x')$$,
  'papers_doi_check', 'DOI with URL prefix rejected');
SELECT pg_temp.raises($$INSERT INTO papers (arxiv_id, title) VALUES ('2101.00001v2', 'x')$$,
  'arxiv_id_check', 'versioned arXiv id rejected');
SELECT pg_temp.raises($$INSERT INTO papers (title) VALUES ('x')$$, 'papers_has_identifier', 'identifier required');
SELECT pg_temp.expect((SELECT array_agg(code ORDER BY code) FROM paper_licences WHERE rehost_in_paid_product)
  = ARRAY['cc-by','cc-by-nd','cc-by-sa','cc0','public-domain'], 'seed approves exactly the Session 0 set');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM paper_licences WHERE code LIKE '%-nc%' AND rehost_in_paid_product),
  'no NC licence approved');
SELECT pg_temp.raises($$UPDATE paper_licences SET rehost_in_paid_product = true WHERE code = 'cc-by-nc'$$,
  'rehost_is_decided', 'approval needs a named decider');
-- The tier checks below walk cc-by from unapproved to approved, so start it unapproved.
UPDATE paper_licences SET rehost_in_paid_product = false WHERE code = 'cc-by';
\set P1 '\'00000000-0000-0000-0000-0000000000b1\''
\set P2 '\'00000000-0000-0000-0000-0000000000b2\''
\set P3 '\'00000000-0000-0000-0000-0000000000b3\''
\set P4 '\'00000000-0000-0000-0000-0000000000b4\''
-- P1: open paper at PA. P2: closed paper at PB. P3: candidate in an unvetted venue. P4: closed paper at PA.
INSERT INTO papers (id, doi, title, venue_id, peer_review_status, relevance_tier, status) VALUES
  (:P1, '10.5195/ledger.2020.1', 'Bitcoin accounting', '00000000-0000-0000-0000-00000000aa01', 'peer_reviewed', 'core', 'draft'),
  (:P2, '10.1016/j.jcf.2021.2', 'Bitcoin hedge', '00000000-0000-0000-0000-00000000aa02', 'peer_reviewed', 'substantial', 'draft'),
  (:P3, '10.9999/predatory.1', 'Bitcoin moon', '00000000-0000-0000-0000-00000000aa03', 'peer_reviewed', 'core', 'candidate'),
  (:P4, '10.5195/ledger.2020.4', 'Bitcoin custody', '00000000-0000-0000-0000-00000000aa01', 'peer_reviewed', 'core', 'draft');

SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'metadata_only', 'new paper is metadata_only');
INSERT INTO paper_abstracts (paper_id, abstract, source) VALUES
  (:P1, 'We study...', 'crossref'), (:P2, 'We test...', 'crossref'), (:P4, 'We survey...', 'publisher_page');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'abstract_only', 'I4OA member + Crossref deposit -> abstract_only');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P2) = 'metadata_only', 'no permission signal -> metadata_only');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P4) = 'metadata_only', 'I4OA member, abstract not from Crossref -> metadata_only');
UPDATE paper_abstracts SET source = 'crossref' WHERE paper_id = :P4;
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P4) = 'abstract_only', 'same abstract from Crossref -> abstract_only');

INSERT INTO paper_locations (id, paper_id, host_type, landing_url, version, licence, oa_status, is_oa, reported_by) VALUES
  ('00000000-0000-0000-0000-0000000000d1', :P1, 'preprint_server', 'https://arxiv.org/abs/2001.1', 'submittedVersion', 'arxiv-default', 'green', true, 'arxiv');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_at_source', 'arXiv preprint -> read_at_source');
INSERT INTO paper_locations (id, paper_id, host_type, landing_url, pdf_url, version, licence, oa_status, is_oa, reported_by) VALUES
  ('00000000-0000-0000-0000-0000000000d2', :P1, 'publisher', 'https://ledger.pitt.edu/1', 'https://ledger.pitt.edu/1.pdf', 'publishedVersion', 'cc-by', 'diamond', true, 'openalex');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_at_source', 'cc-by unapproved -> still read_at_source');
SELECT pg_temp.expect((SELECT best_oa_url FROM papers WHERE id = :P1) = 'https://ledger.pitt.edu/1', 'published version preferred as best copy');
SELECT pg_temp.raises($$INSERT INTO paper_locations (paper_id, host_type, landing_url, reported_by) VALUES ('00000000-0000-0000-0000-0000000000b1', 'publisher', 'https://ledger.pitt.edu/1', 'manual')$$,
  'paper_locations_copy_key', 'duplicate copy rejected');

UPDATE paper_licences SET rehost_in_paid_product = true, decided_by = '00000000-0000-0000-0000-0000000000a1', decided_at = now() WHERE code = 'cc-by';
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_here', 'approving cc-by -> read_here');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :P1 AND event_type = 'access_changed') = 3, 'every tier change logged');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM v_licence_audit WHERE paper_id = :P1 AND issue = 'read_here_without_file'), 'audit: read_here without file');

SELECT pg_temp.raises($$INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256) VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', 'cc-by-nc', 'publishedVersion', 'a.pdf', repeat('a', 64))$$,
  'not approved for rehosting', 'SPEC ACCEPTANCE: cc-by-nc file raises');
SELECT pg_temp.raises($$INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256) VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'cc-by', 'acceptedVersion', 'a.pdf', repeat('a', 64))$$,
  'does not match', 'file mislabelled as cc-by against an arXiv copy raises');
INSERT INTO paper_files (paper_id, location_id, licence, version, storage_path, content_sha256)
VALUES (:P1, '00000000-0000-0000-0000-0000000000d2', 'cc-by', 'publishedVersion', 'ledger/1.pdf', repeat('a', 64));
INSERT INTO storage.objects (bucket_id, name) VALUES ('papers', 'ledger/1.pdf'), ('papers', 'orphan.pdf');

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
UPDATE papers SET summary = '{}', summary_plain = 's', slug = 'bitcoin-hedge', lex_reviewed_at = now(),
  lex_reviewed_by = '00000000-0000-0000-0000-0000000000a1', status = 'published' WHERE id = :P2;

-- Subscriber session
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-0000000000f2', false);
SELECT pg_temp.expect((SELECT count(*) FROM papers WHERE status = 'candidate') = 0, 'SPEC ACCEPTANCE: subscriber sees no candidates');
SELECT pg_temp.expect((SELECT count(*) FROM papers) = 2, 'subscriber sees both published papers');
SELECT pg_temp.expect((SELECT count(*) FROM v_minute_papers) = 2, 'subscriber reads v_minute_papers');
SELECT pg_temp.expect((SELECT count(*) FROM paper_abstracts) = 1, 'summary_only abstract hidden from direct reads');
SELECT pg_temp.expect((SELECT abstract FROM v_minute_papers WHERE id = :P1) = 'We study...', 'display abstract shown');
SELECT pg_temp.expect((SELECT abstract IS NULL AND NOT abstract_displayable FROM v_minute_papers WHERE id = :P2),
  'summary_only paper: abstract NULL, flagged for the publisher link');
SELECT pg_temp.expect((SELECT count(*) FROM paper_publishers) = 2, 'subscriber sees only publishers of published papers');
SELECT pg_temp.expect((SELECT count(*) FROM paper_venues) = 2, 'subscriber sees only venues with published papers');
SELECT pg_temp.expect((SELECT count(*) FROM paper_files) = 1, 'subscriber sees the live file');
SELECT pg_temp.expect((SELECT count(*) FROM storage.objects) = 1, 'subscriber can sign only the paper file');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events) = 0, 'events team-only');
SELECT pg_temp.expect((SELECT count(*) FROM paper_chunks) = 0, 'chunks team-only');

-- Anonymous / staff-less session sees nothing
SELECT set_config('test.uid', '', false);
SELECT pg_temp.expect((SELECT count(*) FROM papers) = 0, 'no session sees nothing');
RESET ROLE;

-- A publisher decision opens one up, logged once against the publisher
UPDATE paper_publishers SET abstract_policy = 'display', decided_at = now(),
  decided_by = '00000000-0000-0000-0000-0000000000a1', reason = 'Permission granted by email' WHERE name = 'Closed Publisher';
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P2) = 'abstract_only', 'publisher decided display -> abstract_only');
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-0000000000f2', false);
SELECT pg_temp.expect((SELECT count(*) FROM paper_abstracts) = 2, 'subscriber now reads the decided abstract');
RESET ROLE;

-- A takedown: one row, one publisher event. It beats the I4OA signal, not a licence.
UPDATE paper_publishers SET abstract_policy = 'summary_only', decided_at = now(),
  decided_by = '00000000-0000-0000-0000-0000000000a1', reason = 'Takedown request' WHERE name = 'Open Publisher';
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE publisher_id = '00000000-0000-0000-0000-00000000ee01') = 1,
  'takedown logs one publisher event');
SELECT pg_temp.expect((SELECT to_value FROM paper_events WHERE publisher_id = '00000000-0000-0000-0000-00000000ee01') = 'summary_only',
  'event records the new policy');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P4) = 'metadata_only', 'takedown overrides I4OA signal');
SELECT pg_temp.expect((SELECT abstract FROM v_minute_papers WHERE id = :P1) = 'We study...', 'CC BY abstract survives a takedown');

-- Revoking cc-by
UPDATE paper_licences SET rehost_in_paid_product = false WHERE code = 'cc-by';
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :P1) = 'read_at_source', 'revoking cc-by drops tier');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM v_licence_audit WHERE issue = 'file_licence_not_approved'), 'audit: stored file under revoked licence');
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-0000000000f2', false);
SELECT pg_temp.expect((SELECT count(*) FROM storage.objects) = 0, 'revoked file no longer signable');
RESET ROLE;
UPDATE paper_files SET withdrawn_at = now() WHERE paper_id = :P1;
SELECT pg_temp.raises($$UPDATE paper_files SET withdrawn_at = NULL$$, 'not approved', 'un-withdrawing re-runs the gate');

-- Deleting a paper cascades without tripping the refresh triggers
DELETE FROM papers WHERE id = :P2;
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM paper_abstracts WHERE paper_id = :P2), 'delete cascades cleanly');
SELECT 'ALL ACCEPTANCE CHECKS PASSED';
