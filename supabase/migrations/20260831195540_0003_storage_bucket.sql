/*
# Create media storage bucket

Creates a public storage bucket for media/document uploads.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;
