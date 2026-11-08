-- ============================================================
-- platform-files storage: team members only
-- ============================================================
-- The bucket's four policies (20260428120000) admitted any `authenticated`
-- session. Minute subscribers are `authenticated` too, so one could list and
-- read every object in the bucket — team files, and since the social post
-- image step, unpublished draft images. Every table is already gated on
-- is_team_member() (20260910000000_rls_hardening); this brings the bucket in
-- line, in the same form as the papers and product-images buckets.
--
-- Unaffected, by design:
--   * the agents server writes with the service-role key, which bypasses RLS;
--   * signed URLs (the draft email's 7-day image links, page previews,
--     downloads) carry their own token and are not checked against these
--     policies when fetched — only when minted, which team pages do;
--   * public share links (/share/<id>) keep platform_files_objects_public_select,
--     the anon policy for files marked public, which is not touched here.
-- Minute (apps/client) reads no storage at all.
-- ============================================================

DROP POLICY IF EXISTS "platform_files_objects_insert" ON storage.objects;
CREATE POLICY "platform_files_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'platform-files' AND is_team_member());

DROP POLICY IF EXISTS "platform_files_objects_select" ON storage.objects;
CREATE POLICY "platform_files_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'platform-files' AND is_team_member());

DROP POLICY IF EXISTS "platform_files_objects_update" ON storage.objects;
CREATE POLICY "platform_files_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'platform-files' AND is_team_member())
  WITH CHECK (bucket_id = 'platform-files' AND is_team_member());

DROP POLICY IF EXISTS "platform_files_objects_delete" ON storage.objects;
CREATE POLICY "platform_files_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'platform-files' AND is_team_member());
