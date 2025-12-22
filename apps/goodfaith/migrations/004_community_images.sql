-- Add image_url column to communities for AI-generated community images
ALTER TABLE communities ADD COLUMN image_url TEXT;
