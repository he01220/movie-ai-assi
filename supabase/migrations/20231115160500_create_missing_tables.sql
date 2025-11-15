-- Create trailer_plays table
CREATE TABLE IF NOT EXISTS public.trailer_plays (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    movie_id integer NOT NULL,
    movie_title text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create search_logs table
CREATE TABLE IF NOT EXISTS public.search_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    query text NOT NULL,
    result_count integer NOT NULL,
    searched_at timestamp with time zone DEFAULT now()
);

-- Create movie_opens table
CREATE TABLE IF NOT EXISTS public.movie_opens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    movie_id integer NOT NULL,
    movie_title text NOT NULL,
    opened_at timestamp with time zone DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trailer_plays_user_id ON public.trailer_plays(user_id);
CREATE INDEX IF NOT EXISTS idx_trailer_plays_movie_id ON public.trailer_plays(movie_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_user_id ON public.search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_movie_opens_user_id ON public.movie_opens(user_id);
CREATE INDEX IF NOT EXISTS idx_movie_opens_movie_id ON public.movie_opens(movie_id);
