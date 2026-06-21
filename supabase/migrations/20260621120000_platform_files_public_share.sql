-- ============================================================
-- PLATFORM FILES — PUBLIC SHARE ACCESS
-- (migration: 20260621120000_platform_files_public_share)
-- Lets the /share/<id> route resolve a file for unauthenticated
-- (anon) visitors, but ONLY while the file is marked public.
-- Toggling a file back to private immediately revokes access.
-- ============================================================

-- Anon can read a platform_files row only if it is public.
DROP POLICY IF EXISTS "platform_files_public_select" ON platform_files;
CREATE POLICY "platform_files_public_select" ON platform_files
  FOR SELECT TO anon
  USING (is_public = true);

-- Anon can read (and therefore sign URLs for) a storage object only
-- when it backs a public platform_files row. The EXISTS subquery is
-- itself subject to the anon policy above, so private files stay hidden.
DROP POLICY IF EXISTS "platform_files_objects_public_select" ON storage.objects;
CREATE POLICY "platform_files_objects_public_select" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'platform-files'
    AND EXISTS (
      SELECT 1 FROM platform_files pf
      WHERE pf.storage_path = storage.objects.name
        AND pf.is_public = true
    )
  );
