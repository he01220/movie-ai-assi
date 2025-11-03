import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB API key not configured');
    }

    // Handle both GET query params and POST body
    let endpoint = 'popular';
    if (req.method === 'POST') {
      const body = await req.json() as { endpoint?: string };
      endpoint = body.endpoint || 'popular';
    } else {
      const url = new URL(req.url);
      endpoint = url.searchParams.get('endpoint') || 'popular';
    }

    // Build TMDB URL dynamically
    let tmdbUrl = `https://api.themoviedb.org/3/${endpoint}`;
    
    // Add API key
    if (endpoint.includes('?')) {
      tmdbUrl += `&api_key=${TMDB_API_KEY}`;
    } else {
      tmdbUrl += `?api_key=${TMDB_API_KEY}`;
    }

    console.log('Fetching from TMDB:', tmdbUrl);

    const response = await fetch(tmdbUrl);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      results?: Array<Record<string, unknown>>;
      poster_path?: string | null;
      backdrop_path?: string | null;
      [key: string]: unknown;
    };

    // Add full poster URLs
    if (data.results) {
      data.results = data.results.map((movie: any) => ({
        ...movie,
        poster_path: movie.poster_path 
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : null,
        backdrop_path: movie.backdrop_path 
          ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
          : null,
      }));
    } else if (data.poster_path) {
      // Single movie result
      data.poster_path = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      data.backdrop_path = data.backdrop_path 
        ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
        : null;
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in tmdb-movies function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});