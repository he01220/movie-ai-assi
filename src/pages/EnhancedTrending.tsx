import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Calendar, Star, Play, Heart, Bookmark, Clock, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import VideoPlayerModal from "@/components/VideoPlayerModal";
import { Skeleton } from "@/components/ui/skeleton";
import { readHistory, logTrailerPlay, logExternalSearch, logMovieOpen, getTopGenresFromHistory, hydrateHistoryFromSupabase } from "@/utils/history";
import { rankCandidates } from "@/utils/reco";
import type { Candidate as RecoCandidate } from "@/utils/reco";

// Types
interface TMDBMovie extends Omit<RecoCandidate, 'title' | 'name' | 'genre_ids' | 'vote_average' | 'vote_count' | 'popularity' | 'media_type'> {
  id: number;
  title: string;
  name?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity: number;
  media_type?: 'movie' | 'tv';
  first_air_date?: string;
  original_language?: string;
  original_title?: string;
  video?: boolean;
  adult?: boolean;
}

interface TrendingPeriodOption {
  label: string;
  value: 'day' | 'week';
  icon: React.ReactNode;
}

interface CacheEntry {
  ts: number;
  data: any;
}

interface CacheBucket {
  [key: string]: CacheEntry;
}

interface Candidate {
  id: number;
  title?: string;
  name?: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  media_type?: 'movie' | 'tv';
  // Add other properties that might be used in ranking
}

const TRENDING_PERIODS: TrendingPeriodOption[] = [
  { label: 'Today', value: 'day', icon: <Clock size={16} /> },
  { label: 'This Week', value: 'week', icon: <Calendar size={16} /> }
];

const GENRE_MAP: { [key: number]: string } = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  53: "Thriller", 10752: "War", 37: "Western"
};

const EnhancedTrending: React.FC = () => {
  // State
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [tvShows, setTvShows] = useState<TMDBMovie[]>([]);
  const [period, setPeriod] = useState<'day' | 'week'>('week');
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [selectedMovie, setSelectedMovie] = useState<{ title: string; id: number } | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [recoMovies, setRecoMovies] = useState<TMDBMovie[]>([]);
  const [recoPage, setRecoPage] = useState(1);
  const [recoCount, setRecoCount] = useState<number>(8);

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMounted = useRef(true);

  // Cache configuration
  const CACHE_KEY = 'tmdb_cache_v4';
  const CACHE_LIMIT = 50;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Cache utilities
  const getCacheBucket = useCallback((): CacheBucket => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  }, []);

  const setCacheBucket = useCallback((bucket: CacheBucket) => {
    try {
      const entries = Object.entries(bucket);
      if (entries.length > CACHE_LIMIT) {
        const sorted = entries
          .sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0))
          .slice(0, CACHE_LIMIT);
        bucket = Object.fromEntries(sorted);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(bucket));
    } catch (e) {
      console.error('Cache error:', e);
    }
  }, []);

  const readCached = useCallback((endpoint: string, maxAgeMs: number = CACHE_DURATION) => {
    const bucket = getCacheBucket();
    const entry = bucket[endpoint];
    if (!entry) return null;
    if (Date.now() - (entry.ts || 0) > maxAgeMs) return null;
    return entry.data;
  }, [getCacheBucket]);

  const writeCached = useCallback((endpoint: string, data: any) => {
    const bucket = getCacheBucket();
    bucket[endpoint] = { ts: Date.now(), data };
    setCacheBucket(bucket);
  }, [getCacheBucket, setCacheBucket]);

  // TMDB API fetch with retry logic
  const fetchFromTMDB = useCallback(async <T = any>(
    endpoint: string,
    retries = 3,
    delay = 1000
  ): Promise<T | null> => {
    const cacheKey = `tmdb_${endpoint}`;
    const cached = readCached(cacheKey);
    if (cached) return cached as T;

    try {
      const response = await fetch(`/api/tmdb/${endpoint}`);
      if (!response.ok) throw new Error('Failed to fetch from TMDB');
      const data = await response.json();
      writeCached(cacheKey, data);
      return data;
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchFromTMDB(endpoint, retries - 1, delay * 2);
      }
      console.error('Error fetching from TMDB:', error);
      return null;
    }
  }, [readCached, writeCached]);

  // Fetch trending content from TMDB
  const fetchTrendingContent = useCallback(async () => {
    setLoading(true);
    const epMovie = `trending/movie/${period}`;
    const epTV = `trending/tv/${period}`;
    
    try {
      // Load from cache first for instant display
      const [cachedMovie, cachedTV] = await Promise.all([
        readCached(epMovie),
        readCached(epTV)
      ]);

      if (cachedMovie) setMovies(cachedMovie.results || []);
      if (cachedTV) setTvShows(cachedTV.results || []);

      // Then fetch fresh data
      const [movieRes, tvRes] = await Promise.all([
        fetchFromTMDB(epMovie),
        fetchFromTMDB(epTV)
      ]);

      if (movieRes?.results) {
        setMovies(movieRes.results);
      }
      if (tvRes?.results) {
        setTvShows(tvRes.results);
      }
    } catch (error) {
      console.error('Error fetching trending content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load trending content',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [period, fetchFromTMDB, readCached, toast]);

  // Fetch user preferences (favorites and watchlist)
  const fetchUserPreferences = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const [favoritesRes, watchlistRes] = await Promise.all([
        supabase.from('user_favorites').select('movie_id').eq('user_id', user.id),
        supabase.from('user_watchlist').select('movie_id').eq('user_id', user.id)
      ]);

      if (favoritesRes.data) {
        setFavorites(new Set(favoritesRes.data.map(f => parseInt(f.movie_id))));
      }

      if (watchlistRes.data) {
        setWatchlist(new Set(watchlistRes.data.map(w => parseInt(w.movie_id))))
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your preferences',
        variant: 'destructive',
      });
    }
  }, [user, toast]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (movieId: number) => {
    if (!user?.id) {
      navigate('/login');
      return;
    }

    const isFavorite = favorites.has(movieId);
    const newFavorites = new Set(favorites);
    
    if (isFavorite) {
      newFavorites.delete(movieId);
    } else {
      newFavorites.add(movieId);
    }

    setFavorites(newFavorites);

    try {
      const { error } = await supabase
        .from('user_favorites')
        .upsert({
          user_id: user.id,
          movie_id: movieId.toString(),
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,movie_id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating favorites:', error);
      toast({
        title: 'Error',
        description: 'Failed to update favorites',
        variant: 'destructive',
      });
      // Revert on error
      setFavorites(new Set(favorites));
    }
  }, [user, favorites, navigate, toast]);

  // Toggle watchlist
  const toggleWatchlist = useCallback(async (movieId: number) => {
    if (!user?.id) {
      navigate('/login');
      return;
    }

    const isInWatchlist = watchlist.has(movieId);
    const newWatchlist = new Set(watchlist);
    
    if (isInWatchlist) {
      newWatchlist.delete(movieId);
    } else {
      newWatchlist.add(movieId);
    }

    setWatchlist(newWatchlist);

    try {
      const { error } = await supabase
        .from('user_watchlist')
        .upsert({
          user_id: user.id,
          movie_id: movieId.toString(),
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,movie_id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating watchlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to update watchlist',
        variant: 'destructive',
      });
      // Revert on error
      setWatchlist(new Set(watchlist));
    }
  }, [user, watchlist, navigate, toast]);

  // Get trending icon based on index
  const getTrendingIcon = useCallback((index: number) => {
    if (index === 0) return <TrendingUp className="text-green-500" size={16} />;
    if (index < 3) return <TrendingUp className="text-yellow-500" size={16} />;
    return <TrendingDown className="text-red-500" size={16} />;
  }, []);

  // Get content genres as string array
  const getContentGenres = useCallback((genreIds: number[]): string[] => {
    if (!genreIds) return [];
    return genreIds.slice(0, 2).map(id => GENRE_MAP[id] || '').filter(Boolean);
  }, []);

  // Handle movie play
  const handlePlayMovie = useCallback(async (movieId: number, movieTitle: string) => {
    try {
      const movie = [...movies, ...tvShows].find(m => m.id === movieId);
      if (movie) {
        logTrailerPlay(movieId, movieTitle, movie.genre_ids);
      }
    } catch (error) {
      console.error('Error logging trailer play:', error);
    }
    
    setSelectedMovie({ title: movieTitle, id: movieId });
    
    try {
      // Fetch trailer from TMDB
      const data = await fetchFromTMDB(`movie/${movieId}/videos`);
      
      if (data?.results?.length > 0) {
        // Find official trailer or teaser
        const trailer = data.results.find((video: any) => 
          video.type === "Trailer" && video.site === "YouTube"
        ) || data.results.find((video: any) => 
          video.type === "Teaser" && video.site === "YouTube"
        ) || data.results[0];
        
        setVideoKey(trailer?.key || null);
      } else {
        setVideoKey(null);
      }
    } catch (error) {
      console.error('Error fetching video:', error);
      setVideoKey(null);
    }
    
    setIsPlayerOpen(true);
  }, [movies, tvShows, fetchFromTMDB]);

  useEffect(() => {
    let mounted = true;
    fetchTrendingContent();
    if (user) {
      fetchUserPreferences();
    }
    (async () => {
      try {
        try { if (user?.id) await hydrateHistoryFromSupabase(); } catch {}
        if (!mounted) return;
        const top = getTopGenresFromHistory();
        const totalEvents = (readHistory().events || []).length;
        const desired = Math.max(6, Math.min(24, 8 + Math.floor(totalEvents / 20) * 4));
        if (desired !== recoCount) setRecoCount(desired);
        const genreParam = top.slice(0, 3).join(',');
        const endpoint = genreParam
          ? `discover/movie?with_genres=${genreParam}&page=${recoPage}&sort_by=popularity.desc`
          : `movie/popular?page=${recoPage}`;
        // Prefill from cache for instant recommendations
        const cached = readCached(endpoint);
        if (mounted && cached?.results && (recoMovies.length === 0)) {
          const ranked = rankCandidates((cached.results as TMDBMovie[]), readHistory());
          setRecoMovies((ranked as TMDBMovie[]).slice(0, desired));
        }
        const data = await fetchFromTMDB(endpoint);
        let list: TMDBMovie[] = [];
        if (data?.results) {
          list = (data.results as TMDBMovie[]);
        } else {
          // Fallback to popular if discover failed
          const pop = await fetchFromTMDB(`movie/popular?page=${recoPage}`);
          if (pop?.results) list = (pop.results as TMDBMovie[]);
        }
        if (mounted && list.length > 0) {
          const ranked = rankCandidates(list, readHistory());
          setRecoMovies((ranked as TMDBMovie[]).slice(0, Math.max(6, Math.min(24, desired))));
        }
      } catch (e) {
        // swallow errors for reco; do not affect rest of Trending
      }
    })();
    return () => { mounted = false; };
  }, [period, user, recoPage, recoCount]);

  // Recalculate recoCount when localStorage history changes (e.g., cleared in Settings)
  useEffect(() => {
    const recompute = async () => {
      const h = readHistory();
      const totalEvents = (h.events || []).length;
      const desired = Math.max(6, Math.min(24, 8 + Math.floor(totalEvents / 20) * 4));
      setRecoCount(desired);
      const top = getTopGenresFromHistory();
      const genreParam = top.slice(0, 3).join(',');
      const endpoint = genreParam
        ? `discover/movie?with_genres=${genreParam}&page=${recoPage}&sort_by=popularity.desc`
        : `movie/popular?page=${recoPage}`;
      const cached = readCached(endpoint);
      if (cached?.results) {
        const ranked = rankCandidates((cached.results as TMDBMovie[]), readHistory());
        setRecoMovies((ranked as TMDBMovie[]).slice(0, Math.max(6, Math.min(24, desired))));
      }
      const data = await fetchFromTMDB(endpoint);
      let list: TMDBMovie[] = [];
      if (data?.results) list = (data.results as TMDBMovie[]);
      if (list.length === 0) {
        const pop = await fetchFromTMDB(`movie/popular?page=${recoPage}`);
        if (pop?.results) list = (pop.results as TMDBMovie[]);
      }
      if (list.length > 0) {
        const ranked = rankCandidates(list, readHistory());
        setRecoMovies((ranked as TMDBMovie[]).slice(0, Math.max(6, Math.min(24, desired))));
      }
    };
    const onStorage = () => { recompute(); };
    const onCustom = () => { recompute(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('cinepulse_history_changed', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cinepulse_history_changed', onCustom as EventListener);
    };
  }, [recoPage, fetchFromTMDB]);

  // Movie card component
  const MovieCard = useCallback(({ content, index }: { content: TMDBMovie; index: number }) => (
    <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={content.poster_path 
            ? `https://image.tmdb.org/t/p/w500${content.poster_path}`
            : 'https://images.unsplash.com/photo-1489599735734-79b4169f2a78?w=500&h=750&fit=crop'
          }
          alt={content.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        
        {/* Ranking Badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="bg-black/80 text-white font-bold">
            #{index + 1}
          </Badge>
        </div>

        {/* Rating Badge */}
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="bg-black/80 text-white">
            <Star size={12} className="mr-1 fill-current text-yellow-500" />
            {content.vote_average.toFixed(1)}
          </Badge>
        </div>

        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="flex gap-2">
            <Button 
              size="icon" 
              variant="secondary"
              onClick={() => handlePlayMovie(content.id, content.title)}
              title="Play Trailer"
            >
              <Play size={16} />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={() => { try { logExternalSearch(content.title, content.id); } catch {}; window.open(`https://www.google.com/search?q=${encodeURIComponent(`Watch ${content.title} full movie`)}`,'_blank'); }}
              title="Watch Full Movie"
            >
              <Globe size={16} />
            </Button>
            <Button 
              size="icon" 
              variant={favorites.has(content.id) ? "default" : "secondary"}
              onClick={() => toggleFavorite(content.id)}
              title="Add to Favorites"
            >
              <Heart size={16} className={favorites.has(content.id) ? "fill-current" : ""} />
            </Button>
            <Button 
              size="icon" 
              variant={watchlist.has(content.id) ? "default" : "secondary"}
              onClick={() => toggleWatchlist(content.id)}
              title="Add to Watchlist"
            >
              <Bookmark size={16} className={watchlist.has(content.id) ? "fill-current" : ""} />
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold line-clamp-2 flex-1">{content.title}</h3>
          {getTrendingIcon(index)}
        </div>

        <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
          <Calendar size={12} />
          <span>{content.release_date?.split('-')[0] || 'N/A'}</span>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {getContentGenres(content.genre_ids).map((genre) => (
            <Badge key={genre} variant="outline" className="text-xs">
              {genre}
            </Badge>
          ))}
        </div>

        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
          {content.overview}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <TrendingUp size={12} />
            <span>{Math.round(content.popularity)}</span>
          </div>
          
          <Button 
            onClick={() => { try { logMovieOpen(content.id, content.title, content.genre_ids); } catch {}; navigate(`/movie/${content.id}`); }}
            size="sm"
          >
            Details
          </Button>
        </div>
      </CardContent>
    </Card>
  ), [handlePlayMovie, toggleFavorite, toggleWatchlist, favorites, watchlist, user, navigate, toast]);

  // Handle loading state
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(12)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-[2/3] bg-muted rounded-t-lg"></div>
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 mb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Trending Now</h1>
          <p className="text-muted-foreground">
            Discover what's hot in movies and TV shows
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2">
          {TRENDING_PERIODS.map((periodOption) => (
            <Button
              key={periodOption.value}
              variant={period === periodOption.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(periodOption.value)}
              className="flex items-center gap-2"
            >
              {periodOption.icon}
              {periodOption.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Recommended for you */}
      {recoMovies.length > 0 ? (
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Recommended for you</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recoMovies.map((m) => (
              <button
                key={m.id}
                className="text-left group"
                onClick={() => { try { logMovieOpen(m.id, m.title, m.genre_ids); } catch {}; navigate(`/movie/${m.id}`); }}
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
                  <img
                    src={m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'https://images.unsplash.com/photo-1489599735734-79b4169f2a78?w=500&h=750&fit=crop'}
                    alt={m.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePlayMovie(m.id, m.title); }}
                      >
                        <Play size={14} className="mr-1" /> Trailer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { logExternalSearch(m.title, m.id); } catch {}; window.open(`https://www.google.com/search?q=${encodeURIComponent(`Watch ${m.title} full movie`)}`,'_blank'); }}
                      >
                        <Globe size={14} className="mr-1" /> Browser
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-sm font-medium line-clamp-2 tv-card-title">{m.title}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            {[1,2,3,4].map((p) => (
              <Button
                key={p}
                variant={recoPage === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRecoPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRecoCount((c) => Math.min(24, c + 6))}
            >
              More
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecoPage(prev => (prev >= 4 ? 1 : prev + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Popular Now</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...movies, ...tvShows].slice(0, 12).map((m) => (
              <button
                key={m.id}
                className="text-left group"
                onClick={() => { try { logMovieOpen(m.id, m.title, m.genre_ids); } catch {}; navigate(`/movie/${m.id}`); }}
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
                  <img
                    src={m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'https://images.unsplash.com/photo-1489599735734-79b4169f2a78?w=500&h=750&fit=crop'}
                    alt={m.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="mt-2 text-sm font-medium line-clamp-2 tv-card-title">{m.title}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content Tabs */}
      <Tabs defaultValue="movies" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="movies" className="flex items-center gap-2">
            🎬 Movies ({movies.length})
          </TabsTrigger>
          <TabsTrigger value="tv" className="flex items-center gap-2">
            📺 TV Shows ({tvShows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movies">
          {movies.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp size={64} className="mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold mb-2">No trending movies</h2>
              <p className="text-muted-foreground">
                Check back later for trending content
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {movies.map((movie, index) => (
                <MovieCard key={movie.id} content={movie} index={index} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tv">
          {tvShows.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp size={64} className="mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold mb-2">No trending TV shows</h2>
              <p className="text-muted-foreground">
                Check back later for trending content
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tvShows.map((show, index) => (
                <MovieCard key={show.id} content={show} index={index} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Trending Stats */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 text-center">
          <TrendingUp className="mx-auto text-green-500 mb-2" size={32} />
          <h3 className="font-semibold mb-1">Most Popular</h3>
          <p className="text-sm text-muted-foreground">
            {movies[0]?.title || 'Loading...'}
          </p>
        </Card>
        
        <Card className="p-6 text-center">
          <Star className="mx-auto text-yellow-500 mb-2" size={32} />
          <h3 className="font-semibold mb-1">Highest Rated</h3>
          <p className="text-sm text-muted-foreground">
            {[...movies].sort((a, b) => b.vote_average - a.vote_average)[0]?.title || 'Loading...'}
          </p>
        </Card>
        
        <Card className="p-6 text-center">
          <Calendar className="mx-auto text-blue-500 mb-2" size={32} />
          <h3 className="font-semibold mb-1">Latest Release</h3>
          <p className="text-sm text-muted-foreground">
            {[...movies].sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())[0]?.title || 'Loading...'}
          </p>
        </Card>
      </div>

      {/* Video Player Modal */}
      <VideoPlayerModal
        isOpen={isPlayerOpen}
        onClose={() => {
          setIsPlayerOpen(false);
          setSelectedMovie(null);
          setVideoKey(null);
        }}
        movieTitle={selectedMovie?.title || ""}
        videoKey={videoKey}
      />
    </div>
  );
};

export default EnhancedTrending;