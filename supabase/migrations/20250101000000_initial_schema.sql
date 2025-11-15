-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- User ratings table
create table if not exists public.user_ratings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  movie_id integer not null,
  rating smallint not null check (rating between 1 and 5),
  content_type text not null default 'movie',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, movie_id, content_type)
);

-- User activity log
alter table public.user_activity 
add column if not exists metadata jsonb,
add column if not exists content_type text default 'movie';

-- Create index for faster lookups
create index if not exists idx_user_ratings_user_movie 
on public.user_ratings(user_id, movie_id, content_type);

-- Chat history
alter table public.chat_messages
add column if not exists metadata jsonb,
add column if not exists emotion_tags text[];

-- User taste profile
create table if not exists public.user_taste_memory (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  movie_id integer,
  content_type text default 'movie',
  emotions text[],
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, movie_id, content_type)
);

-- Enable Row Level Security
alter table public.user_ratings enable row level security;
alter table public.user_activity enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_taste_memory enable row level security;

-- Create RLS policies
create policy "Users can manage their own ratings"
on public.user_ratings
for all
using (auth.uid() = user_id);

create policy "Users can manage their own activity"
on public.user_activity
for all
using (auth.uid() = user_id::uuid);

create policy "Users can manage their own chat messages"
on public.chat_messages
for all
using (auth.uid() = user_id::uuid);

create policy "Users can manage their own taste profile"
on public.user_taste_memory
for all
using (auth.uid() = user_id);

-- Create function to update timestamps
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create or replace trigger update_user_ratings_updated_at
before update on public.user_ratings
for each row execute function update_updated_at_column();
