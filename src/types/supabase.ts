import { Database as DatabaseGenerated } from '@/integrations/supabase/types';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type CustomTables = {
  tmdb_cache: {
    Row: {
      id: string
      key: string
      data: Json
      expires_at: string
      created_at: string
    }
    Insert: {
      id?: string
      key: string
      data: Json
      expires_at: string
      created_at?: string
    }
    Update: {
      id?: string
      key?: string
      data?: Json
      expires_at?: string
      created_at?: string
    }
  }
  
  trailer_plays: {
    Row: {
      id: string
      user_id: string
      movie_id: number
      movie_title: string
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      user_id: string
      movie_id: number
      movie_title: string
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      movie_id?: number
      movie_title?: string
      created_at?: string
      updated_at?: string
    }
  }
  
  search_logs: {
    Row: {
      id: string
      user_id: string
      query: string
      result_count: number
      searched_at: string
    }
    Insert: {
      id?: string
      user_id: string
      query: string
      result_count: number
      searched_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      query?: string
      result_count?: number
      searched_at?: string
    }
  }
  
  movie_opens: {
    Row: {
      id: string
      user_id: string
      movie_id: number
      movie_title: string
      opened_at: string
    }
    Insert: {
      id?: string
      user_id: string
      movie_id: number
      movie_title: string
      opened_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      movie_id?: number
      movie_title?: string
      opened_at?: string
    }
  }
  user_ratings: {
    Row: {
      id: string
      user_id: string
      movie_id: number
      rating: number
      content_type: 'movie' | 'tv'
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      user_id: string
      movie_id: number
      rating: number
      content_type?: 'movie' | 'tv'
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      movie_id?: number
      rating?: number
      content_type?: 'movie' | 'tv'
      created_at?: string
      updated_at?: string
    }
  }
  user_activity: {
    Row: {
      id: string
      user_id: string
      type: string
      movie_id: number | null
      title: string | null
      genres: number[] | null
      query: string | null
      metadata: Json | null
      content_type: string | null
      created_at: string
    }
    Insert: {
      id?: string
      user_id: string
      type: string
      movie_id?: number | null
      title?: string | null
      genres?: number[] | null
      query?: string | null
      metadata?: Json | null
      content_type?: string | null
      created_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      type?: string
      movie_id?: number | null
      title?: string | null
      genres?: number[] | null
      query?: string | null
      metadata?: Json | null
      content_type?: string | null
      created_at?: string
    }
  }
  user_taste_memory: {
    Row: {
      id: string
      user_id: string
      movie_id: number
      content_type: 'movie' | 'tv'
      emotions: string[]
      description: string
      created_at: string
    }
    Insert: {
      id?: string
      user_id: string
      movie_id: number
      content_type?: 'movie' | 'tv'
      emotions: string[]
      description: string
      created_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      movie_id?: number
      content_type?: 'movie' | 'tv'
      emotions?: string[]
      description?: string
      created_at?: string
    }
  }
  chat_messages: {
    Row: {
      id: string
      user_id: string
      conversation_id: string
      message: string
      response: string | null
      emotion_tags: string[] | null
      metadata: Json | null
      created_at: string
    }
    Insert: {
      id?: string
      user_id: string
      conversation_id: string
      message: string
      response?: string | null
      emotion_tags?: string[] | null
      metadata?: Json | null
      created_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      conversation_id?: string
      message?: string
      response?: string | null
      emotion_tags?: string[] | null
      metadata?: Json | null
      created_at?: string
    }
  }
}

type ExtendedDatabase = Omit<DatabaseGenerated, 'public'> & {
  public: Omit<DatabaseGenerated['public'], 'Tables' | 'Functions'> & {
    Tables: DatabaseGenerated['public']['Tables'] & CustomTables
    Functions: DatabaseGenerated['public']['Functions'] & {
      get_average_rating: {
        Args: {
          p_movie_id: number
          p_content_type: string
        }
        Returns: { avg: number; count: number } | null
      }
    }
    Enums: {}
    CompositeTypes: {}
  }
}

export type Database = ExtendedDatabase
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
