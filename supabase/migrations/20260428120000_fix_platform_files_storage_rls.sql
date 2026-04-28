-- ============================================================
-- Fix: platform-files storage bucket and storage.objects RLS
-- createSignedUploadUrl checks storage.objects INSERT policy
-- before issuing a token, so uploads fail without these.
-- ============================================================

-- Create the bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('platform-files', 'platform-files', false, 52428800, null)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for platform-files bucket
CREATE POLICY IF NOT EXISTS "platform_files_objects_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'platform-files');

CREATE POLICY IF NOT EXISTS "platform_files_objects_select" ON storage.objects
  FOR SELECT TO authenticated, service_role
  USING (bucket_id = 'platform-files');

CREATE POLICY IF NOT EXISTS "platform_files_objects_update" ON storage.objects
  FOR UPDATE TO authenticated, service_role
  USING (bucket_id = 'platform-files')
  WITH CHECK (bucket_id = 'platform-files');

CREATE POLICY IF NOT EXISTS "platform_files_objects_delete" ON storage.objects
  FOR DELETE TO authenticated, service_role
  USING (bucket_id = 'platform-files');
