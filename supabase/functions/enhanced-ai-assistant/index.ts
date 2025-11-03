import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface ChatRequest {
  message: string;
  conversationId?: string;
  userId: string;
}

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  vote_average: number;
  poster_path: string;
}

// Fetch movie data from TMDB
async function searchTMDBMovies(query: string): Promise<TMDBMovie[]> {
  const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
  if (!TMDB_API_KEY) return [];

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.results?.slice(0, 5) || [];
  } catch (error) {
    console.error('TMDB search error:', error);
    return [];
  }
}

// Get trending movies from TMDB
async function getTrendingMovies(): Promise<TMDBMovie[]> {
  const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
  if (!TMDB_API_KEY) return [];

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}`
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.results?.slice(0, 5) || [];
  } catch (error) {
    console.error('TMDB trending error:', error);
    return [];
  }
}

// Enhanced prompt with movie context
function createEnhancedPrompt(userMessage: string, movieContext: TMDBMovie[]): string {
  const movieData = movieContext.map(movie => 
    `${movie.title} (${movie.release_date?.split('-')[0]}) - Rating: ${movie.vote_average}/10 - ${movie.overview}`
  ).join('\n');

  return `You are CineFlix's AI movie assistant. You help users discover amazing movies and shows.

Current trending movies for reference:
${movieData}

User message: "${userMessage}"

Guidelines:
- If user asks for recommendations, provide 3-5 specific movie titles with brief reasons
- Include release years when mentioning movies
- If user mentions mood/genre, suggest movies that match
- For "hello" or greetings, respond warmly and ask about their movie preferences
- Keep responses conversational but informative
- If you mention a movie, briefly explain why it's good
- Focus on popular and well-regarded films

Respond naturally and enthusiastically about movies:`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'AI assistant temporarily unavailable',
        message: 'Hi! I\'m having trouble connecting right now, but I\'d love to help you find great movies. Try browsing our Popular and Trending sections for amazing recommendations!'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, conversationId, userId }: ChatRequest = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'Authentication required',
        message: 'Please sign in to use the AI assistant.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get conversation history from database
    let conversationHistory: any[] = [];
    if (conversationId) {
      const { data: historyData } = await supabase
        .from('chat_messages')
        .select('message, response, created_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(10);

      if (historyData) {
        conversationHistory = historyData.flatMap(row => [
          { role: 'user', content: row.message },
          { role: 'assistant', content: row.response }
        ]).filter(msg => msg.content);
      }
    }

    // Get movie context for enhanced responses
    let movieContext: TMDBMovie[] = [];
    
    // Extract movie-related keywords for TMDB search
    const movieKeywords = message.toLowerCase().match(/\b(?:movie|film|show|series|watch|recommend|comedy|drama|action|horror|sci-fi|romance|thriller|documentary)\b/g);
    
    if (movieKeywords) {
      // Search for movies based on user input
      const searchResults = await searchTMDBMovies(message);
      if (searchResults.length > 0) {
        movieContext = searchResults;
      } else {
        // Fallback to trending movies
        movieContext = await getTrendingMovies();
      }
    } else if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
      // For greetings, include trending context
      movieContext = await getTrendingMovies();
    }

    // Create enhanced prompt with movie context
    const enhancedPrompt = createEnhancedPrompt(message, movieContext);

    const messages = [
      {
        role: 'system',
        content: enhancedPrompt
      },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    console.log('Sending request to OpenAI with', messages.length, 'messages');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 500,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    console.log('AI Assistant response:', assistantMessage);

    // Store conversation in database
    const currentConversationId = conversationId || crypto.randomUUID();
    
    const { error: dbError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        message: message,
        response: assistantMessage,
        conversation_id: currentConversationId,
        metadata: {
          movie_context: movieContext.length > 0,
          tmdb_movies: movieContext.map(m => ({ id: m.id, title: m.title }))
        }
      });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    return new Response(JSON.stringify({ 
      message: assistantMessage,
      conversationId: currentConversationId,
      movieSuggestions: movieContext.slice(0, 3).map(movie => ({
        id: movie.id,
        title: movie.title,
        year: movie.release_date?.split('-')[0],
        rating: movie.vote_average,
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in enhanced-ai-assistant function:', error);
    
    // Provide contextual fallback responses
    const fallbackResponses = [
      "I'd love to help you find something amazing to watch! While I'm having technical difficulties, I recommend checking out our Popular Movies section - it's filled with incredible films that are trending right now. What genre are you in the mood for?",
      "Hey there, movie lover! I'm experiencing some connectivity issues, but don't let that stop your movie discovery journey. Our Trending section has fantastic recommendations, and you can always browse by genre to find your perfect match!",
      "Greetings, cinema enthusiast! Although I can't access my full recommendation database right now, I suggest exploring our curated Popular and Trending sections. They're packed with amazing films across all genres. What type of story are you looking for today?"
    ];
    
    const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    
    return new Response(JSON.stringify({ 
      message: randomResponse,
      conversationId: crypto.randomUUID(),
      movieSuggestions: []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});