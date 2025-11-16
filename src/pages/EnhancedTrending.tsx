import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar, Clock, Heart, Bookmark, Play, Star, Film, Tv, TrendingUp, Image as ImageIcon, Info } from "lucide-react";
import VideoPlayerModal from "@/components/VideoPlayerModal";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database['public']['Tables'];
type Profile = Tables['profiles']['Row'];

type UserActivity = {
  id: string;
  user_id: string;
  content_id: string;
  activity_type: string;
  content_type: string;
  metadata: Record<string, any>;
  created_at: string;
};
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// Types
type TMDBMovie = {
  id: number;
  title: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_type?: 'movie' | 'tv';
  first_air_date?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  adult?: boolean;
  video?: boolean;
  popularity?: number;
};

type TrendingPeriod = 'day' | 'week';

interface TrendingPeriodOption {
  label: string;
  value: TrendingPeriod;
  icon: React.ReactNode;
}

// Cache configuration
const CACHE_KEY = 'trending_tmdb_cache_v2';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB

// In-memory cache for faster access
const memoryCache = new Map<string, { data: any; expires: number }>();

// Genre mapping
const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  53: "Thriller", 10752: "War", 37: "Western"
};

// Type for the movie card props
interface MovieCardProps {
  movie: TMDBMovie;
  isFavorite: boolean;
  isInWatchlist: boolean;
  onFavorite: (id: number) => void;
  onWatchlist: (id: number) => void;
  onPlay: (movie: TMDBMovie) => void;
  onViewDetails: (movie: TMDBMovie) => void;
}

// Movie Card Component
const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  isFavorite,
  isInWatchlist,
  onFavorite,
  onWatchlist,
  onPlay,
  onViewDetails
}) => (
  <div className="px-2 py-1 h-full">
    <Card className="h-full overflow-hidden transition-transform hover:scale-105 flex flex-col">
      <div className="relative flex-1 flex flex-col">
        <div className="w-full h-64 bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
          {movie.poster_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
              alt={movie.title || movie.name || 'Movie poster'}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = '/placeholder.svg';
              }}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center text-gray-500 dark:text-gray-400">
              <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
              <span className="text-sm">No poster available</span>
            </div>
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-black/50 hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(movie.id);
            }}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-black/50 hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation();
              onWatchlist(movie.id);
            }}
          >
            <Bookmark className={`h-4 w-4 ${isInWatchlist ? 'fill-blue-500 text-blue-500' : ''}`} />
          </Button>
        </div>
      </div>
      <CardContent className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold line-clamp-1">{movie.title || movie.name}</h3>
        <div className="flex items-center gap-2 mt-1 mb-2">
          <Star className="h-4 w-4 text-yellow-500" />
          <span className="text-sm">{movie.vote_average?.toFixed(1)}</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-auto">
          {movie.genre_ids?.slice(0, 3).map((genreId) => (
            <Badge key={genreId} variant="outline" className="text-xs">
              {GENRE_MAP[genreId] || 'Unknown'}
            </Badge>
          ))}
        </div>
        <div className="flex flex-col gap-2 mt-4">
          <Button 
            className="w-full"
            onClick={() => onPlay(movie)}
          >
            <Play className="h-4 w-4 mr-2" /> Смотреть трейлер
          </Button>
          <Button 
            variant="outline"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(movie);
            }}
          >
            <Info className="h-4 w-4 mr-2" /> Подробнее
          </Button>
          <Button 
            variant="outline"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              const searchQuery = encodeURIComponent(`${movie.title || movie.name} смотреть онлайн`);
              window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank', 'noopener,noreferrer');
            }}
          >
            <Film className="h-4 w-4 mr-2" /> Смотреть фильм
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);

// Utility functions
const getTopGenresFromHistory = (history: any[]): string[] => {
  const genreCounts = new Map<number, number>();
  
  history.forEach(item => {
    if (item.genre_ids) {
      item.genre_ids.forEach((genreId: number) => {
        genreCounts.set(genreId, (genreCounts.get(genreId) || 0) + 1);
      });
    }
  });

  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genreId]) => GENRE_MAP[genreId] || '')
    .filter(Boolean);
};

const readHistory = (): any[] => {
  try {
    const history = localStorage.getItem('watchHistory');
    return history ? JSON.parse(history) : [];
  } catch (e) {
    console.error('Error reading history:', e);
    return [];
  }
};

const EnhancedTrending = () => {
  // State
  const [period, setPeriod] = useState<TrendingPeriod>('day');
  const [activeTab, setActiveTab] = useState<'movies' | 'tv' | 'recommendations'>('recommendations');
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [recommendedMovies, setRecommendedMovies] = useState<TMDBMovie[]>([]);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState<boolean>(false);
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);
  const [videoKey, setVideoKey] = useState<string>('');
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [tvShows, setTvShows] = useState<TMDBMovie[]>([]);
  
  // Hooks
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Handle view details
  const handleViewDetails = useCallback((movie: TMDBMovie) => {
    navigate(`/movie/${movie.id}`, { state: { movie } });
  }, [navigate]);

  // Trending period options
  const trendingPeriods: TrendingPeriodOption[] = useMemo(() => [
    { label: 'Today', value: 'day', icon: <Clock size={16} /> },
    { label: 'This Week', value: 'week', icon: <Calendar size={16} /> }
  ], []);

  // Fetch trending movies and TV shows
  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch movies
      const moviesResponse = await fetch(
        `https://api.themoviedb.org/3/trending/movie/${period}?api_key=${import.meta.env.VITE_TMDB_API_KEY}`
      );
      const moviesData = await moviesResponse.json();
      setMovies(moviesData.results || []);

      // Fetch TV shows
      const tvResponse = await fetch(
        `https://api.themoviedb.org/3/trending/tv/${period}?api_key=${import.meta.env.VITE_TMDB_API_KEY}`
      );
      const tvData = await tvResponse.json();
      setTvShows(tvData.results || []);
    } catch (err) {
      console.error('Error fetching trending content:', err);
      setError('Failed to load trending content');
      toast({
        title: 'Error',
        description: 'Failed to load trending content',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [period, toast]);

  // Fetch movies and TV shows
  useEffect(() => {
    const loadData = async () => {
      await fetchTrending();
      if (user?.id) {
        try {
          await fetchUserHistory();
          await fetchRecommendations();
        } catch (err) {
          console.error('Error loading user data:', err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      }
    };
    
    loadData();
  }, [period, activeTab, user?.id]);
  
  // Fetch user's watch history
  const fetchUserHistory = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { data: history } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (history) {
        setUserHistory(history);
      }
    } catch (error) {
      console.error('Error fetching user history:', error);
    }
  }, [user?.id]);
  
  // Fetch personalized recommendations
  const fetchRecommendations = useCallback(async () => {
    const fetchWithFallback = async (url: string) => {
      try {
        console.log('Fetching from:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log('Fetched data from', url, ':', data.results?.length || 0, 'items');
        return data.results || [];
      } catch (error) {
        console.error(`Failed to fetch from ${url}:`, error);
        return [];
      }
    };

    // Helper to normalize movie data
    const normalizeMovie = (item: any): TMDBMovie | null => {
      if (!item || !item.id) return null;
      
      return {
        id: item.id,
        title: item.title || item.name || 'Unknown Title',
        overview: item.overview || '',
        poster_path: item.poster_path || null,
        backdrop_path: item.backdrop_path || null,
        release_date: item.release_date || item.first_air_date || '',
        vote_average: item.vote_average || 0,
        vote_count: item.vote_count || 0,
        genre_ids: item.genre_ids || [],
        media_type: item.media_type || (item.title ? 'movie' : 'tv'),
        popularity: item.popularity || 0
      };
    };

    try {
      setLoading(true);
      setError(null);
      
      // Common fetch operations - always fetch both to have fallbacks
      const [popularMovies, trendingContent] = await Promise.all([
        fetchWithFallback(`https://api.themoviedb.org/3/movie/popular?api_key=${import.meta.env.VITE_TMDB_API_KEY}&language=ru-RU&page=1`),
        fetchWithFallback(`https://api.themoviedb.org/3/trending/all/day?api_key=${import.meta.env.VITE_TMDB_API_KEY}&language=ru-RU`)
      ]);
      
      // For non-logged in users or if we can't get user data
      if (!user?.id) {
        console.log('No user ID, showing default recommendations');
        const combined = [
          ...(popularMovies || []).map(normalizeMovie).filter(Boolean),
          ...(trendingContent || []).map(normalizeMovie).filter(Boolean)
        ];
        
        console.log('Combined movies before filtering:', combined.length);
        
        const uniqueMovies = Array.from(
          new Map(
            combined
              .filter(movie => movie && movie.id && movie.poster_path)
              .map(movie => [movie.id, movie])
          ).values()
        ) as TMDBMovie[];
        
        console.log('Unique movies after filtering:', uniqueMovies.length);
        
        const shuffled = uniqueMovies
          .sort(() => 0.5 - Math.random())
          .slice(0, 20);
        
        console.log('Final movies to show:', shuffled.length);
        setRecommendedMovies(shuffled);
        setActiveTab('recommendations');
        return;
      }
      
      // For logged-in users, try to get personalized recommendations
      try {
        console.log('User is logged in, fetching personalized recommendations');
        
        // Get user's watch history
        const { data: watchHistory = [] } = await (supabase as any)
          .from('watch_history')
          .select('movie_id, watched_at')
          .eq('user_id', user.id)
          .order('watched_at', { ascending: false })
          .limit(10)
          .catch((error: any) => {
            console.error('Error fetching watch history:', error);
            return { data: [] };
          });
        
        console.log('User watch history:', watchHistory);
        
        let recommended = [];
        
        if (watchHistory.length > 0) {
          console.log('Found watch history, fetching similar movies');
          // Get similar movies for watched content
          const similarPromises = watchHistory.slice(0, 3).map(entry => 
            fetchWithFallback(`https://api.themoviedb.org/3/movie/${entry.movie_id}/similar?api_key=${import.meta.env.VITE_TMDB_API_KEY}&language=ru-RU&page=1`)
          );
          
          const similarResults = await Promise.all(similarPromises);
          const similarMovies = similarResults.flat().map(normalizeMovie).filter(Boolean);
          
          console.log('Found similar movies:', similarMovies.length);
          
          recommended = [
            ...similarMovies,
            ...(popularMovies || []).map(normalizeMovie).filter(Boolean),
            ...(trendingContent || []).map(normalizeMovie).filter(Boolean)
          ];
        } else {
          console.log('No watch history, showing popular and trending');
          // For new users, show a mix of popular and trending
          recommended = [
            ...(popularMovies || []).slice(0, 15).map(normalizeMovie).filter(Boolean),
            ...(trendingContent || []).slice(0, 15).map(normalizeMovie).filter(Boolean)
          ];
        }
        
        // Filter and deduplicate
        const validMovies = recommended
          .filter(movie => movie?.id && movie.poster_path && (movie.title || movie.name))
          .reduce((acc: any[], movie) => {
            if (!acc.some(m => m.id === movie.id)) {
              acc.push(movie);
            }
            return acc;
          }, [])
          .slice(0, 20);
        
        setRecommendedMovies(validMovies);
      } catch (error) {
        console.error('Error in personalized recommendations:', error);
        // Fallback to basic recommendations using already fetched data
        const fallbackMovies = [
          ...popularMovies.slice(0, 10),
          ...trendingContent.slice(0, 10)
        ].filter(movie => movie?.id);
        
        setRecommendedMovies(Array.from(new Map(fallbackMovies.map(m => [m.id, m])).values()));
      }
    } catch (error) {
      console.error('Error in fetchRecommendations:', error);
      setError('Failed to load recommendations');
      // Fallback to trending
      fetchTrending();
    } finally {
      setLoading(false);
    }
  }, [user, fetchTrending]);

  // Handle favorite toggle
  const handleFavorite = useCallback(async (movieId: number) => {
    if (!user) {
      toast({
        title: 'Please sign in',
        description: 'You need to be signed in to add to favorites',
        variant: 'default',
      });
      return;
    }

    const newFavorites = new Set(favorites);
    const isFavorite = newFavorites.has(movieId);

    try {
      if (isFavorite) {
        // Remove from favorites
        await supabase
          .from('notifications')
          .delete()
          .match({ 
            user_id: user.id, 
            content_id: movieId.toString(),
            type: 'favorite'
          });
        newFavorites.delete(movieId);
      } else {
        // Add to favorites
        await supabase
          .from('notifications')
          .insert({
            user_id: user.id,
            content_id: movieId.toString(),
            type: 'favorite',
            title: 'Added to favorites',
            message: `Added movie ${movieId} to your favorites`,
            created_at: new Date().toISOString()
          });
        newFavorites.add(movieId);
      }
      
      setFavorites(newFavorites);
    } catch (error) {
      console.error('Error updating favorites:', error);
      toast({
        title: 'Error',
        description: 'Failed to update favorites',
        variant: 'destructive',
      });
    }
  }, [user, favorites, toast]);

  // Handle watchlist toggle
  const handleWatchlist = useCallback(async (movieId: number) => {
    if (!user?.id) {
      toast({
        title: 'Please sign in',
        description: 'You need to be signed in to add to watchlist',
        variant: 'default',
      });
      return;
    }
    
    const isInWatchlist = watchlist.has(movieId);
    const updatedWatchlist = new Set(watchlist);
    
    if (isInWatchlist) {
      updatedWatchlist.delete(movieId);
    } else {
      updatedWatchlist.add(movieId);
    }
    
    setWatchlist(updatedWatchlist);
    
    try {
      await supabase
        .from('notifications')
        .upsert({
          user_id: user.id,
          content_id: movieId.toString(),
          type: 'watchlist',
          is_read: false,
          data: { is_watchlist: !isInWatchlist },
          updated_at: new Date().toISOString(),
        } as any, {
          onConflict: 'user_id,content_id',
        });
    } catch (error) {
      console.error('Error updating watchlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to update watchlist',
        variant: 'destructive',
      });
      // Revert UI on error
      setWatchlist(watchlist);
    }
  }, [user, watchlist, toast]);

  // Handle play button click
  const handlePlay = useCallback(async (movie: TMDBMovie) => {
    if (!movie) return;
    
    setSelectedMovie(movie);
    setIsPlayerOpen(true);
    
    const logActivity = async () => {
      if (!user?.id) return;
      
      try {
        // Log the movie watch in watch_history
        const { error } = await (supabase as any)
          .from('watch_history')
          .insert([{
            user_id: user.id,
            movie_id: movie.id,
            watched_at: new Date().toISOString()
          }]);
        
        if (error) throw error;
        
        // Refresh user history and recommendations
        await fetchUserHistory();
        await fetchRecommendations();
      } catch (dbError: any) {
        console.error('Error logging activity:', dbError);
        setError(dbError.message);
      }
    };

    const fetchTrailer = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${process.env.VITE_TMDB_API_KEY}`
        );
        const data = await response.json();
        const trailer = data.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
        
        if (trailer?.key) {
          setVideoKey(trailer.key);
        } else {
          toast({
            title: 'No trailer available',
            description: 'Sorry, no trailer is available for this movie',
            variant: 'default',
          });
        }
      } catch (fetchError) {
        console.error('Error fetching trailer:', fetchError);
        setError('Failed to load trailer');
      } finally {
        setLoading(false);
      }
    };

    try {
      await Promise.all([
        logActivity(),
        fetchTrailer()
      ]);
    } catch (error) {
      console.error('Error in handlePlay:', error);
      toast({
        title: 'Error',
        description: 'Failed to process your request',
        variant: 'destructive',
      });
    }
  }, [user, toast, fetchRecommendations]);

  // Get content genres as a string
  const getContentGenres = useCallback((genreIds: number[]): string => {
    if (!genreIds || !Array.isArray(genreIds)) return '';
    const genreMap: Record<number, string> = GENRE_MAP || {};
    return genreIds
      .slice(0, 2)
      .map(id => genreMap[id] || '')
      .filter(Boolean)
      .join(' • ');
  }, []);

  // Derived state
  const hasMovies = Array.isArray(movies) && movies.length > 0;
  const hasTvShows = Array.isArray(tvShows) && tvShows.length > 0;
  const isLoading = loading && !hasMovies && !hasTvShows;
  const hasError = error !== null && !hasMovies && !hasTvShows;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error || 'An error occurred'}</p>
        <Button 
          className="mt-4"
          onClick={fetchTrending}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Trending Now</h1>
          <div className="flex items-center text-muted-foreground">
            <TrendingUp className="h-4 w-4 mr-1" />
            <span className="text-sm">Discover what's popular</span>
          </div>
        </div>
        
        <div className="mt-4 md:mt-0">
          <Tabs 
            value={period}
            onValueChange={(value) => setPeriod(value as TrendingPeriod)}
            className="w-[200px]"
          >
            <TabsList className="grid w-full grid-cols-2">
              {trendingPeriods.map(({ value, label, icon }) => (
                <TabsTrigger key={value} value={value} className="flex items-center gap-2">
                  {icon}
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as 'movies' | 'tv' | 'recommendations')} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger 
            value="recommendations" 
            className="flex items-center gap-2"
            onClick={() => setActiveTab('recommendations')}
          >
            <Star className="h-4 w-4" />
            Для вас ({recommendedMovies.length})
          </TabsTrigger>
          <TabsTrigger value="movies" className="flex items-center gap-2">
            <Film className="h-4 w-4" />
            Movies ({movies.length})
          </TabsTrigger>
          <TabsTrigger value="tv" className="flex items-center gap-2">
            <Tv className="h-4 w-4" />
            TV Shows ({tvShows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="mt-4">
          {recommendedMovies.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {recommendedMovies.map((movie) => (
                <MovieCard
                  key={`rec-${movie.id}`}
                  movie={movie}
                  isFavorite={favorites.has(movie.id)}
                  isInWatchlist={watchlist.has(movie.id)}
                  onFavorite={handleFavorite}
                  onWatchlist={handleWatchlist}
                  onPlay={handlePlay}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No recommendations yet. Start watching movies to get personalized recommendations.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="movies">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {movies.map((movie) => (
              <MovieCard
                key={`movie-${movie.id}`}
                movie={movie}
                isFavorite={favorites.has(movie.id)}
                isInWatchlist={watchlist.has(movie.id)}
                onFavorite={handleFavorite}
                onWatchlist={handleWatchlist}
                onPlay={handlePlay}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tv">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {tvShows.map((show) => (
              <MovieCard
                key={`tv-${show.id}`}
                movie={show}
                isFavorite={favorites.has(show.id)}
                isInWatchlist={watchlist.has(show.id)}
                onFavorite={handleFavorite}
                onWatchlist={handleWatchlist}
                onPlay={handlePlay}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <VideoPlayerModal
        isOpen={isPlayerOpen}
        onClose={() => {
          setIsPlayerOpen(false);
          setVideoKey('');
          setSelectedMovie(null);
        }}
        videoKey={videoKey || null}
        movieTitle={selectedMovie?.title || selectedMovie?.name || ''}
      />

      {selectedMovie && (
        <div className="mt-4 flex justify-center">
          <button
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            onClick={() => {
              const query = `${selectedMovie.title || selectedMovie.name} full movie`;
              window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
            }}
          >
            Watch Full Movie
          </button>
        </div>
      )}
    </div>
  );
};

export default EnhancedTrending;
