import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Create a new Supabase client with the correct types
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Type-safe table access
const getTable = <T extends keyof Database['public']['Tables']>(tableName: T) => {
  return supabase.from(tableName);
};

// Define types based on your database schema
type Rating = {
  movie_id: number;
  rating: number;
  content_type?: 'movie' | 'tv';
};

type ActivityType = 'movie_open' | 'trailer_play' | 'external_search' | 'query' | 'movie_rated' | 'movie_saved' | 'movie_watched';

type Activity = {
  type: ActivityType;
  movie_id?: number;
  title?: string;
  genres?: number[];
  query?: string;
  metadata?: Record<string, any>;
};

type ChatMessage = {
  message: string;
  response?: string;
  metadata?: Record<string, any>;
  emotion_tags?: string[];
};

type TasteMemory = {
  movie_id: number;
  content_type?: 'movie' | 'tv';
  emotions: string[];
  description: string;
};


export const db = {
  // User Ratings
  async getRating(movieId: number, contentType: 'movie' | 'tv' = 'movie') {
    const { data, error } = await getTable('user_ratings')
      .select('rating')
      .eq('movie_id', movieId)
      .eq('content_type', contentType)
      .single();
    
    if (error || !data) return null;
    return (data as { rating: number }).rating;
  },

  async setRating({ movie_id, rating, content_type = 'movie' }: Rating) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error('Not authenticated');

    return (supabase as any).from('user_ratings')
      .upsert(
        { user_id: userData.user.id, movie_id, rating, content_type },
        { onConflict: 'user_id,movie_id,content_type' }
      )
      .select()
      .single();
  },

  async getAverageRating(movieId: number, contentType: 'movie' | 'tv' = 'movie') {
    try {
      const { data } = await (supabase as any).rpc('get_average_rating', { 
        p_movie_id: movieId,
        p_content_type: contentType 
      });
      return data || { avg: 0, count: 0 };
    } catch (error) {
      console.error('Error getting average rating:', error);
      return { avg: 0, count: 0 };
    }
  },

  // User Activity
  async logActivity(activity: Activity) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return null;

    const activityData = {
      user_id: userData.user.id,
      type: activity.type,
      movie_id: activity.movie_id,
      title: activity.title,
      genres: activity.genres,
      query: activity.query,
      metadata: activity.metadata,
      content_type: activity.movie_id ? 'movie' : undefined
    };

    return (supabase as any).from('user_activity').insert(activityData);
  },

  async getWatchedMovies() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    const { data: activities } = await getTable('user_activity')
      .select('movie_id, title')
      .eq('user_id', userData.user.id)
      .eq('type', 'movie_watched')
      .order('created_at', { ascending: false });

    return activities || [];
  },

  async getSavedMovies() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    const { data: activities } = await getTable('user_activity')
      .select('movie_id, title')
      .eq('user_id', userData.user.id)
      .eq('type', 'movie_saved')
      .order('created_at', { ascending: false });

    return activities || [];
  },

  // Chat
  async saveChatMessage(conversationId: string, message: string, response?: string, emotionTags: string[] = []) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error('Not authenticated');

    const messageData = {
      user_id: userData.user.id,
      conversation_id: conversationId,
      message,
      response: response || null,
      emotion_tags: emotionTags.length ? emotionTags : null,
      metadata: { source: 'web' }
    };

    return (supabase as any).from('chat_messages').insert(messageData);
  },

  async getChatHistory(conversationId: string) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    const { data: messages } = await (supabase as any)
      .from('chat_messages')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    return messages || [];
  },

  // Taste Memory
  async saveTasteMemory(tasteMemory: TasteMemory) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error('Not authenticated');

    const memoryData = {
      user_id: userData.user.id,
      movie_id: tasteMemory.movie_id,
      content_type: tasteMemory.content_type || 'movie',
      emotions: tasteMemory.emotions,
      description: tasteMemory.description
    };

    return (supabase as any).from('user_taste_memory')
      .upsert(
        memoryData,
        { onConflict: 'user_id,movie_id,content_type' }
      );
  },

  async getTasteMemory() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return [];

    const { data: memories } = await (supabase as any)
      .from('user_taste_memory')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false });

    return memories || [];
  },

  // Real-time Subscriptions
  async subscribeToRatings(callback: (payload: any) => void) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return { unsubscribe: () => {} };

    const subscription = supabase
      .channel('user_ratings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_ratings',
          filter: `user_id=eq.${userData.user?.id}`
        },
        (payload) => callback(payload)
      )
      .subscribe();

    return {
      unsubscribe: () => {
        subscription.unsubscribe();
      }
    };
  },

  async subscribeToActivities(callback: (payload: any) => void) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return { unsubscribe: () => {} };

    const subscription = supabase
      .channel('user_activities_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_activity',
          filter: `user_id=eq.${userData.user.id}`
        },
        (payload) => callback(payload)
      )
      .subscribe();

    return {
      unsubscribe: () => {
        subscription.unsubscribe();
      }
    };
  }
};
