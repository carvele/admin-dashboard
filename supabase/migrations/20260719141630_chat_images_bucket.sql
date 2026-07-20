INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read access to chat-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload to own chat-images folder" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete own chat-images" ON storage.objects;

CREATE POLICY "Public read access to chat-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-images');

CREATE POLICY "Auth upload to own chat-images folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Auth delete own chat-images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
