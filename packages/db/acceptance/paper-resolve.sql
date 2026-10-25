-- Session 2 acceptance for 20261025000000_paper_resolve.sql (commit_paper_resolve).
-- Run after stubs.sql and both papers migrations, on a fresh database.
-- Every check raises on failure, so a clean run ends with ALL RESOLVE CHECKS PASSED.
-- See docs/features/client-app/library-papers-build-progress.md#checking-it-locally
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'ok: %', label; END $$;

-- A peer-reviewed CC BY paper with a closed repository duplicate, two authors, one reconciliation verdict.
\set Y '''{"identifiers":{"doi":"10.3390/jrfm14090427","openalex_id":"W3198344353"},"title":"The Ascent of Bitcoin","publication_year":2021,"work_type":"article","venue":{"openalex_source_id":"S1","name":"JRFM","venue_type":"journal","issn_l":"1911-8066","issns":["1911-8066"],"publisher":"MDPI","is_in_doaj":true},"peer_review_status":"peer_reviewed","peer_review_basis":"venue:journal+type:article","relevance_tier":"core","relevance_basis":{"rex_status":"confirmed"},"topics":["adoption"],"funders":[],"cited_by_count":12,"abstract":{"text":"We map bitcoin research.","source":"openalex_index"},"locations":[{"host_type":"publisher","source_name":"JRFM","landing_url":"https://www.mdpi.com/x","pdf_url":null,"doi":"10.3390/jrfm14090427","version":"publishedVersion","licence":"cc-by","oa_status":null,"is_oa":true,"reported_by":"openalex","verified_at_host":false},{"host_type":"preprint_server","source_name":"Preprints.org","landing_url":"https://www.preprints.org/manuscript/202108.0555","pdf_url":null,"doi":"10.20944/preprints202108.0555.v1","version":"submittedVersion","licence":"cc-by","oa_status":null,"is_oa":true,"reported_by":"openalex","verified_at_host":false}],"authors":[{"openalex_author_id":"A1","orcid":null,"display_name":"A. Aysan","position":1,"raw_affiliation":null,"is_corresponding":false},{"openalex_author_id":null,"orcid":null,"display_name":"M. Saraç","position":2,"raw_affiliation":null,"is_corresponding":false}],"updates":[],"reconciled":[{"rule":4,"input":"Preprints.org reported as acceptedVersion","verdict":"submittedVersion"}],"published_version_doi":null}'''::jsonb

SELECT commit_paper_resolve(:Y) AS y_id \gset
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :'y_id') = 'read_here', 'new paper lands with its tier');
SELECT pg_temp.expect((SELECT status FROM papers WHERE id = :'y_id') = 'candidate', 'new paper is a candidate');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :'y_id' AND event_type = 'discovered') = 1, 'discovered once');
SELECT pg_temp.expect((SELECT count(*) FROM paper_abstracts WHERE paper_id = :'y_id') = 1, 'abstract stored');
SELECT pg_temp.expect((SELECT topics FROM papers WHERE id = :'y_id') = ARRAY['adoption'], 'topics stored');

-- Re-running the same result creates nothing new (spec Session 2: zero duplicates).
SELECT commit_paper_resolve(:Y) AS y_again \gset
SELECT pg_temp.expect(:'y_again' = :'y_id', 'same paper on re-run');
SELECT pg_temp.expect((SELECT count(*) FROM papers) = 1, 'no duplicate paper');
SELECT pg_temp.expect((SELECT count(*) FROM paper_locations) = 2, 'no duplicate copies');
SELECT pg_temp.expect((SELECT count(*) FROM paper_authors) = 2, 'no duplicate authors, with or without an id');
SELECT pg_temp.expect((SELECT count(*) FROM paper_venues) = 1, 'no duplicate venue');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE event_type = 'reconciled') = 1, 'a verdict is logged once');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE event_type IN ('discovered', 'access_changed')) = 2, 'no repeated events');

-- A copy whose URL moves but whose DOI does not is the same copy.
SELECT commit_paper_resolve(jsonb_set(:Y, '{locations,0,landing_url}', '"https://www.mdpi.com/1911-8074/14/9/427"'));
SELECT pg_temp.expect((SELECT count(*) FROM paper_locations WHERE paper_id = :'y_id' AND host_type = 'publisher') = 1, 'a moved copy is matched on its DOI');
SELECT pg_temp.expect((SELECT landing_url FROM paper_locations WHERE paper_id = :'y_id' AND host_type = 'publisher') = 'https://www.mdpi.com/1911-8074/14/9/427', 'and takes the new URL');

-- Found again by OpenAlex id alone, a copy dropped, a manual copy kept.
INSERT INTO paper_locations (paper_id, host_type, landing_url, is_oa, reported_by)
VALUES (:'y_id', 'other', 'https://example.org/by-hand', false, 'manual');
SELECT commit_paper_resolve(jsonb_set(jsonb_set(:Y, '{identifiers}', '{"openalex_id":"W3198344353"}'),
                                      '{locations}', ((:Y)->'locations') - 1)) AS y_by_oa \gset
SELECT pg_temp.expect(:'y_by_oa' = :'y_id', 'matched on OpenAlex id without a DOI');
SELECT pg_temp.expect((SELECT doi FROM papers WHERE id = :'y_id') = '10.3390/jrfm14090427', 'DOI kept when absent from a later result');
SELECT pg_temp.expect((SELECT count(*) FROM paper_locations WHERE paper_id = :'y_id' AND host_type = 'preprint_server') = 0, 'an unreported pipeline copy is removed');
SELECT pg_temp.expect((SELECT count(*) FROM paper_locations WHERE reported_by = 'manual') = 1, 'a manual copy is kept');

-- Rule 4: the draft is its own record, linked to its published version.
\set X '''{"identifiers":{"doi":"10.20944/preprints202108.0555.v1","openalex_id":null},"title":"The Ascent of Bitcoin (preprint)","work_type":"article","venue":null,"peer_review_status":"preprint","peer_review_basis":"draft+type:article","relevance_tier":"core","relevance_basis":{},"topics":[],"funders":[],"locations":[{"host_type":"preprint_server","source_name":"Preprints.org","landing_url":"https://www.preprints.org/manuscript/202108.0555","pdf_url":null,"doi":null,"version":"submittedVersion","licence":"cc-by","oa_status":null,"is_oa":true,"reported_by":"openalex","verified_at_host":false}],"authors":[],"updates":[],"reconciled":[],"published_version_doi":"10.3390/jrfm14090427"}'''::jsonb
SELECT commit_paper_resolve(:X) AS x_id \gset
SELECT pg_temp.expect(:'x_id' <> :'y_id', 'the draft is a second paper');
SELECT pg_temp.expect((SELECT openalex_id FROM papers WHERE id = :'x_id') IS NULL, 'the draft does not take the published work''s OpenAlex id');
SELECT pg_temp.expect((SELECT access_tier FROM papers WHERE id = :'x_id') = 'read_here', 'the draft is judged on its own copies');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM paper_relations WHERE from_paper_id = :'y_id' AND to_paper_id = :'x_id' AND relation = 'published_version_of'), 'published_version_of edge');
SELECT commit_paper_resolve(:X);
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :'x_id' AND event_type = 'published_version_found') = 1, 'the edge is logged once');

-- Notices: a retraction is one-way and logged once; a correction once per notice.
SELECT commit_paper_resolve(jsonb_set(:Y, '{updates}', '[{"kind":"retracted","notice_doi":"10.1016/j.irfa.2026.105078","source":"crossref"},{"kind":"corrected","notice_doi":"10.1000/c","source":"crossref"}]'));
SELECT commit_paper_resolve(jsonb_set(:Y, '{updates}', '[{"kind":"retracted","notice_doi":"10.1016/j.irfa.2026.105078","source":"crossref"},{"kind":"corrected","notice_doi":"10.1000/c","source":"crossref"}]'));
SELECT pg_temp.expect((SELECT is_retracted FROM papers WHERE id = :'y_id'), 'retracted');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :'y_id' AND event_type = 'retracted') = 1, 'retraction logged once');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :'y_id' AND event_type = 'corrected') = 1, 'correction logged once');
SELECT commit_paper_resolve(:Y);
SELECT pg_temp.expect((SELECT is_retracted FROM papers WHERE id = :'y_id'), 'a later run never un-retracts');

-- Classification: re-run while a candidate moves the tier and logs it; an override or a later status freezes it.
SELECT commit_paper_resolve(jsonb_set(:Y, '{relevance_tier}', '"substantial"'));
SELECT pg_temp.expect((SELECT relevance_tier FROM papers WHERE id = :'y_id') = 'substantial', 'a candidate is re-classified');
SELECT pg_temp.expect((SELECT count(*) FROM paper_events WHERE paper_id = :'y_id' AND event_type = 'tier_changed') = 1, 'tier change logged');
UPDATE papers SET relevance_basis = relevance_basis || '{"override": {"tier": "core", "by": "a person"}}', relevance_tier = 'core' WHERE id = :'y_id';
SELECT commit_paper_resolve(jsonb_set(:Y, '{relevance_tier}', '"peripheral"'));
SELECT pg_temp.expect((SELECT relevance_tier FROM papers WHERE id = :'y_id') = 'core', 'an override stands');
UPDATE papers SET relevance_basis = '{}', status = 'draft' WHERE id = :'y_id';
SELECT commit_paper_resolve(jsonb_set(:Y, '{relevance_tier}', '"peripheral"'));
SELECT pg_temp.expect((SELECT relevance_tier FROM papers WHERE id = :'y_id') = 'core', 'a draft is not re-classified');
SELECT pg_temp.expect((SELECT cited_by_count FROM papers WHERE id = :'y_id') = 12, 'metadata still refreshes');

-- A work with only a handle (gs-38).
SELECT commit_paper_resolve('{"identifiers":{"handle":"10197/7168"},"title":"Bitcoin, Gold and the Dollar (working paper)","peer_review_status":"not_peer_reviewed","peer_review_basis":"venue:repository","relevance_tier":"core","locations":[],"authors":[],"updates":[],"reconciled":[]}'::jsonb) AS h_id \gset
SELECT pg_temp.expect((SELECT handle FROM papers WHERE id = :'h_id') = '10197/7168', 'a handle-only work lands');

-- Only the service role may call it.
SELECT pg_temp.expect(NOT has_function_privilege('anon', 'commit_paper_resolve(jsonb)', 'EXECUTE'), 'anon cannot execute');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated', 'commit_paper_resolve(jsonb)', 'EXECUTE'), 'authenticated cannot execute');
SELECT pg_temp.expect(has_function_privilege('service_role', 'commit_paper_resolve(jsonb)', 'EXECUTE'), 'service_role can execute');

-- Seeds
SELECT pg_temp.expect((SELECT count(*) FROM routines WHERE action_type = 'paper_watch' AND NOT is_active) = 1, 'the watch routine is seeded inactive');
SELECT pg_temp.expect((SELECT count(*) FROM paper_watches WHERE is_active) = 1, 'the default watch is seeded');
SELECT 'ALL RESOLVE CHECKS PASSED';
