-- Create video_likes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.video_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

-- Enable RLS for likes
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.video_likes;
DROP POLICY IF EXISTS "Authenticated users can like videos" ON public.video_likes;
DROP POLICY IF EXISTS "Users can remove their own likes" ON public.video_likes;

-- Likes policies
CREATE POLICY "Likes are viewable by everyone" ON public.video_likes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like videos" ON public.video_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own likes" ON public.video_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Create video_comments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.video_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for comments
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.video_comments;
DROP POLICY IF EXISTS "Authenticated users can add comments" ON public.video_comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.video_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.video_comments;

-- Comments policies
CREATE POLICY "Comments are viewable by everyone" ON public.video_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can add comments" ON public.video_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments" ON public.video_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.video_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Add missing columns to videos table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'movie_title') THEN
    ALTER TABLE public.videos ADD COLUMN movie_title TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'movie_id') THEN
    ALTER TABLE public.videos ADD COLUMN movie_id INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'likes_count') THEN
    ALTER TABLE public.videos ADD COLUMN likes_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'comments_count') THEN
    ALTER TABLE public.videos ADD COLUMN comments_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'views_count') THEN
    ALTER TABLE public.videos ADD COLUMN views_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Function to update like counts
CREATE OR REPLACE FUNCTION public.update_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = likes_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS video_likes_count_trigger ON public.video_likes;

-- Create trigger for like counts
CREATE TRIGGER video_likes_count_trigger
  AFTER INSERT OR DELETE ON public.video_likes
  FOR EACH ROW EXECUTE PROCEDURE public.update_video_likes_count();

-- Function to update comment counts
CREATE OR REPLACE FUNCTION public.update_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET comments_count = comments_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS video_comments_count_trigger ON public.video_comments;

-- Create trigger for comment counts
CREATE TRIGGER video_comments_count_trigger
  AFTER INSERT OR DELETE ON public.video_comments
  FOR EACH ROW EXECUTE PROCEDURE public.update_video_comments_count();