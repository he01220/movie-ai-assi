  // Simple local cache for TMDB responses (shared key with Movies page)
  const CACHE_KEY = 'tmdb_cache_v1';
  const getCacheBucket = (): Record<string, { ts: number; data: any }> => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
  };
  const setCacheBucket = (bucket: Record<string, { ts: number; data: any }>) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(bucket)); } catch {}
  };
  const readCached = (endpoint: string, maxAgeMs = 30 * 60 * 1000) => {
    const bucket = getCacheBucket();
    const entry = bucket[endpoint];
    if (!entry) return null;
    if (Date.now() - entry.ts > maxAgeMs) return null;
    return entry.data;
  };
  const writeCached = (endpoint: string, data: any) => {
    const bucket = getCacheBucket();
    bucket[endpoint] = { ts: Date.now(), data };
    setCacheBucket(bucket);
  };

import { useState, useEffect } from "react";
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
import { readHistory, logTrailerPlay, logExternalSearch, logMovieOpen, getTopGenresFromHistory, hydrateHistoryFromSupabase } from "@/utils/history";
import { rankCandidates } from "@/utils/reco";

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  popularity: number;
  genre_ids: number[];
}

interface TrendingPeriod {
  label: string;
  value: 'day' | 'week';
  icon: React.ReactNode;
}

const TRENDING_PERIODS: TrendingPeriod[] = [
  { label: 'Today', value: 'day', icon: <Clock size={16} /> },
  { label: 'This Week', value: 'week', icon: <Calendar size={16} /> }
];

const GENRE_MAP: { [key: number]: string } = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  53: "Thriller", 10752: "War", 37: "Western"
};

const EnhancedTrending = () => {
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

  useEffect(() => {
    fetchTrendingContent();
    if (user) {
      fetchUserPreferences();
    }
    (async () => {
      try { if (user?.id) await hydrateHistoryFromSupabase(); } catch {}
      const top = getTopGenresFromHistory();
      const totalEvents = (readHistory().events || []).length;
      const desired = Math.max(6, Math.min(24, 8 + Math.floor(totalEvents / 20) * 4));
      if (desired !== recoCount) setRecoCount(desired);
      const genreParam = top.slice(0, 3).join(',');
      const endpoint = genreParam
        ? `discover/movie?with_genres=${genreParam}&page=${recoPage}&sort_by=popularity.desc`
        : `movie/popular?page=${recoPage}`;
      const data = await fetchFromTMDB(endpoint);
      if (data && data.results) {
        const ranked = rankCandidates((data.results as TMDBMovie[]), readHistory());
        setRecoMovies((ranked as TMDBMovie[]).slice(0, recoCount));
      } else {
        setRecoMovies([]);
      }
    })();
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
      const data = await fetchFromTMDB(endpoint);
      if (data && data.results) {
        const ranked = rankCandidates((data.results as TMDBMovie[]), readHistory());
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
  }, [recoPage]);

  const fetchFromTMDB = async (endpoint: string, opts?: { retries?: number; timeoutMs?: number }) => {
    const retries = opts?.retries ?? 2;
    const timeoutMs = opts?.timeoutMs ?? 8000;
    const invoke = () => supabase.functions.invoke('tmdb-movies', { body: { endpoint } });

    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        p.then((v) => { clearTimeout(t); resolve(v); })
         .catch((e) => { clearTimeout(t); reject(e); });
      });

    let lastErr: any = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const { data, error } = await withTimeout(invoke());
        if ((error as any)) throw error;
        try { writeCached(endpoint, data); } catch {}
        return data as any;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 300 * (i + 1)));
      }
    }
    console.error('TMDB API error after retries:', lastErr);
    return null;
  };

  const fetchTrendingContent = async () => {
    setLoading(true);
    const epMovie = `trending/movie/${period}`;
    const epTV = `trending/tv/${period}`;
    // Prefill from cache to avoid empty UI on slow networks
    const cachedMovie = readCached(epMovie);
    const cachedTV = readCached(epTV);
    if (cachedMovie?.results && movies.length === 0) {
      const ranked = rankCandidates((cachedMovie.results as TMDBMovie[]), readHistory());
      setMovies(ranked as TMDBMovie[]);
    }
    if (cachedTV?.results && tvShows.length === 0) {
      const raw = (cachedTV.results || []) as any[];
      const normalized = raw.map((it) => ({ ...(it as any), title: (it as any).title || (it as any).name })) as TMDBMovie[];
      const ranked = rankCandidates(normalized, readHistory());
      setTvShows(ranked as TMDBMovie[]);
    }

    const [moviesData, tvData] = await Promise.all([
      fetchFromTMDB(epMovie),
      fetchFromTMDB(epTV)
    ]);

    let movieList: TMDBMovie[] = [];
    let tvList: TMDBMovie[] = [];
    if (moviesData?.results) movieList = (moviesData.results || []) as TMDBMovie[];
    if (tvData?.results) {
      const raw = (tvData.results || []) as any[];
      tvList = raw.map((it) => ({ ...(it as any), title: (it as any).title || (it as any).name })) as TMDBMovie[];
    }

    // Fallback to popular if trending fails
    if (movieList.length === 0) {
      const pop = await fetchFromTMDB('movie/popular?page=1');
      if (pop?.results) movieList = (pop.results as TMDBMovie[]);
    }
    if (tvList.length === 0) {
      const pop = await fetchFromTMDB('tv/popular?page=1');
      if (pop?.results) {
        const raw = (pop.results || []) as any[];
        tvList = raw.map((it) => ({ ...(it as any), title: (it as any).title || (it as any).name })) as TMDBMovie[];
      }
    }

    // Preserve previous lists if still empty
    if (movieList.length === 0 && movies.length > 0) {
      // keep existing
    } else {
      const ranked = rankCandidates(movieList, readHistory());
      setMovies(ranked as TMDBMovie[]);
    }
    if (tvList.length === 0 && tvShows.length > 0) {
      // keep existing
    } else {
      const ranked = rankCandidates(tvList, readHistory());
      setTvShows(ranked as TMDBMovie[]);
    }

    setLoading(false);
  };

  const fetchUserPreferences = async () => {
    if (!user) return;

    try {
      const [favoritesData, watchlistData] = await Promise.all([
        supabase.from('user_favorites').select('movie_id').eq('user_id', user.id),
        supabase.from('user_watchlist').select('movie_id').eq('user_id', user.id)
      ]);

      if (favoritesData.data) {
        setFavorites(new Set(favoritesData.data.map(f => parseInt(f.movie_id))));
      }

      if (watchlistData.data) {
        setWatchlist(new Set(watchlistData.data.map(w => parseInt(w.movie_id))));
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
    }
  };

  const toggleFavorite = async (movieId: number) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to add favorites",
        variant: "destructive"
      });
      return;
    }

    try {
      const isFavorited = favorites.has(movieId);
      
      if (isFavorited) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('movie_id', movieId.toString());
        
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(movieId);
          return newSet;
        });
        
        toast({ title: "Removed from favorites" });
      } else {
        await supabase
          .from('user_favorites')
          .insert({
            user_id: user.id,
            movie_id: movieId.toString()
          });
        
        setFavorites(prev => new Set(prev).add(movieId));
        toast({ title: "Added to favorites" });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive"
      });
    }
  };

  const toggleWatchlist = async (movieId: number) => {
    if (!user) {
      toast({
        title: "Sign in required", 
        description: "Please sign in to add to watchlist",
        variant: "destructive"
      });
      return;
    }

    try {
      const isInWatchlist = watchlist.has(movieId);
      
      if (isInWatchlist) {
        await supabase
          .from('user_watchlist')
          .delete()
          .eq('user_id', user.id)
          .eq('movie_id', movieId.toString());
        
        setWatchlist(prev => {
          const newSet = new Set(prev);
          newSet.delete(movieId);
          return newSet;
        });
        
        toast({ title: "Removed from watchlist" });
      } else {
        await supabase
          .from('user_watchlist')
          .insert({
            user_id: user.id,
            movie_id: movieId.toString()
          });
        
        setWatchlist(prev => new Set(prev).add(movieId));
        toast({ title: "Added to watchlist" });
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to update watchlist",
        variant: "destructive"
      });
    }
  };

  const getContentGenres = (genreIds: number[]) => {
    return genreIds.slice(0, 2).map(id => GENRE_MAP[id]).filter(Boolean);
  };

  const getTrendingIcon = (index: number) => {
    if (index === 0) return <TrendingUp className="text-green-500" size={16} />;
    if (index < 3) return <TrendingUp className="text-yellow-500" size={16} />;
    return <TrendingDown className="text-red-500" size={16} />;
  };

  const handlePlayMovie = async (movieId: number, movieTitle: string) => {
    try {
      const genres = movies.find(m => m.id === movieId)?.genre_ids;
      logTrailerPlay(movieId, movieTitle, genres);
    } catch {}
    setSelectedMovie({ title: movieTitle, id: movieId });
    
    // Fetch trailer from TMDB
    const data = await fetchFromTMDB(`movie/${movieId}/videos`);
    
    if (data && data.results && data.results.length > 0) {
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
    
    setIsPlayerOpen(true);
  };

  const MovieCard = ({ content, index }: { content: TMDBMovie; index: number }) => (
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
  );

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