import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Calendar, Star, Play, Heart, Bookmark, Clock, Globe, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/types/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import VideoPlayerModal from "@/components/VideoPlayerModal";
import { readHistory, logTrailerPlay, logExternalSearch, logMovieOpen, getTopGenresFromHistory, hydrateHistoryFromSupabase } from "@/utils/history";
import { rankCandidates } from "@/utils/reco";

// Кэширование в Supabase
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Функция для сохранения в кэш Supabase
const saveToCache = async (key: string, data: any) => {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Кэшируем на 1 час

    const { error } = await supabase
      .from('tmdb_cache' as never) // Используем тип never, так как таблица не определена в генерируемых типах
      .upsert({
        key,
        data,
        expires_at: expiresAt.toISOString()
      } as never);

    if (error) {
      console.error('Ошибка при сохранении в Supabase:', error);
    }
  } catch (error) {
    console.error('Неизвестная ошибка при сохранении в кэш:', error);
  }
};

// Функция для получения из кэша Supabase
const getFromCache = async (key: string) => {
  try {
    const { data, error } = await supabase
      .from('tmdb_cache' as never) // Используем тип never, так как таблица не определена в генерируемых типах
      .select('data, expires_at')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return (data as any).data;
  } catch (error) {
    console.error('Ошибка при получении из кэша Supabase:', error);
    return null;
  }
};

// Оптимизированная функция для загрузки данных с кэшированием
const fetchFromTMDB = async (endpoint: string, opts: { retries?: number; timeoutMs?: number } = {}) => {
  const cacheKey = `tmdb_${endpoint}`;
  
  // Пробуем получить из кэша
  const cachedData = await getFromCache(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 5000;
  
  const invoke = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('tmdb-movies', {
        body: { endpoint }
      });
      
      if (error) throw error;
      
      // Сохраняем в кэш
      await saveToCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('TMDB API error:', error);
      throw error;
    }
  };

  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const data = await invoke();
      clearTimeout(timeoutId);
      
      return data;
    } catch (error) {
      if (i === retries) {
        console.error('TMDB API error after retries:', error);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
    }
  }
};

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
  name?: string; // For TV shows
  first_air_date?: string; // For TV shows
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
  // State for movies and TV shows
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [tvShows, setTvShows] = useState<TMDBMovie[]>([]);
  const [period, setPeriod] = useState<'day' | 'week'>('week');
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [selectedMovie, setSelectedMovie] = useState<{ title: string; id: number } | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [recoMovies, setRecoMovies] = useState<TMDBMovie[]>([]);
  const [recoPage, setRecoPage] = useState(1);
  const [recoCount, setRecoCount] = useState<number>(8);
  
  // Refs and hooks
  const isMounted = useRef(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Refs for data processing
  const userPreferencesCache = useRef<Record<string, any>>({});
  const movieListRef = useRef<TMDBMovie[]>([]);
  const tvListRef = useRef<TMDBMovie[]>([]);
  
  // Ensure user is properly typed
  const currentUser = user || null;
  
  // Функция для загрузки пользовательских предпочтений с кэшированием
  const readCached = useCallback(async (key: string) => {
    try {
      const data = await getFromCache(key);
      return data || { results: [] };
    } catch (error) {
      console.error('Error reading from cache:', error);
      return { results: [] };
    }
  }, []);

  // Функция для сохранения данных с кэшированием
  const writeCached = useCallback(async (key: string, data: any) => {
    await saveToCache(key, data);
  }, []);

  // Fetch user preferences
  const fetchUserPreferences = useCallback(async () => {
    if (!currentUser) return {};
    
    const cacheKey = `user_prefs_${currentUser.id}`;
    
    // Return from cache if available
    if (userPreferencesCache.current[cacheKey]) {
      return userPreferencesCache.current[cacheKey];
    }
    
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      // Cache the result
      const result = data || {};
      userPreferencesCache.current[cacheKey] = result;
      return result;
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return {};
    }
  }, [currentUser]);

  // Показать оффлайн-уведомление
  const showOfflineNotification = useCallback(() => {
    if (isMounted.current) {
      toast({
        title: 'Оффлайн режим',
        description: 'Показываем кэшированные данные. Некоторые функции могут быть ограничены.',
        variant: 'default',
        duration: 5000
      });
    }
  }, []);

  // Загрузка трендового контента с кэшированием
  const fetchTrendingContent = useCallback(async () => {
    if (!isMounted.current) return;
    
    const cacheKey = `trending_${period}`;
    const epMovie = `trending/movie/${period}`;
    const epTV = `trending/tv/${period}`;
    
    // Если оффлайн, показываем уведомление
    if (isOffline) {
      showOfflineNotification();
    }
    
    // Show cached data immediately if available
    const showCachedData = async () => {
      const cachedData = await getFromCache(cacheKey);
      if (cachedData && isMounted.current) {
        setMovies(cachedData.movies || []);
        setTvShows(cachedData.tvShows || []);
        return true;
      }
      return false;
    };
    
    // Start loading fresh data in the background
    const loadFreshData = async () => {
      setLoading(true);
      try {
        const [moviesData, tvData] = await Promise.all([
          fetchFromTMDB(epMovie),
          fetchFromTMDB(epTV)
        ]);
        
        if (isMounted.current) {
          const newMovies = moviesData?.results || [];
          const newTvShows = tvData?.results || [];
          
          if (newMovies.length > 0 || newTvShows.length > 0) {
            setMovies(newMovies);
            setTvShows(newTvShows);
            await saveToCache(cacheKey, {
              movies: newMovies,
              tvShows: newTvShows
            });
          }
        }
      } catch (error) {
        console.error('Error loading fresh data:', error);
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };
    
    // Try to show cached data first, then load fresh data
    const hasCachedData = await showCachedData();
    loadFreshData(); // Don't await this, let it run in background
    
    // If no cached data, show loading state
    if (!hasCachedData) {
      setLoading(true);
    }
    
    try {
      const [moviesData, tvData] = await Promise.all([
        fetchFromTMDB(epMovie),
        fetchFromTMDB(epTV)
      ]);
      
      if (isMounted.current) {
        if (moviesData?.results) {
          const ranked = rankCandidates(
            moviesData.results.map(m => ({
              ...m,
              title: m.title || m.name || 'Untitled',
              release_date: m.release_date || m.first_air_date || ''
            })),
            readHistory()
          ) as TMDBMovie[];
          setMovies(ranked);
          
          // Save to cache
          await saveToCache(cacheKey, {
            movies: ranked,
            tvShows: tvData?.results || []
          });
        }
        
        if (tvData?.results) {
          const ranked = rankCandidates(
            tvData.results.map(m => ({
              ...m,
              title: m.title || m.name || 'Untitled',
              release_date: m.release_date || m.first_air_date || ''
            })),
            readHistory()
          ) as TMDBMovie[];
          setTvShows(ranked);
        }
      }
    } catch (error) {
      console.error('Error fetching trending content:', error);
      if (isMounted.current) {
        toast({
          title: 'Error',
          description: 'Failed to load trending content. Please try again later.',
          variant: 'destructive'
        });
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [period, toast]);

  const handlePlayMovie = async (movieId: number, movieTitle: string) => {
    if (!isMounted.current) return;
    
    try {
      setSelectedMovie({ id: movieId, title: movieTitle });
      setVideoKey(null);
      
      // Log movie open
      logMovieOpen(movieId, movieTitle);
      
      // Fetch video key
      const { data } = await supabase.functions.invoke('tmdb-movies', {
        body: { endpoint: `movie/${movieId}/videos` }
      });
      
      if (isMounted.current && data?.results) {
        const trailer = data.results.find(
          (v: any) => v.site === 'YouTube' && v.type === 'Trailer'
        );
        
        if (trailer) {
          setVideoKey(trailer.key);
          logTrailerPlay(movieId, movieTitle);
        }
      }
    } catch (error) {
      console.error('Error playing movie:', error);
      if (isMounted.current) {
        toast({
          title: 'Error',
          description: 'Failed to load video. Please try again.',
          variant: 'destructive'
        });
      }
    }
  };

  // Проверка состояния сети
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    // Установка начального состояния
    setIsOffline(!navigator.onLine);
    
    // Слушатели изменения состояния сети
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize component
  useEffect(() => {
    const initialize = async () => {
      try {
        const history = readHistory();
        const topGenres = getTopGenresFromHistory();
        const totalEvents = (history.events || []).length;
        const desiredCount = Math.max(6, Math.min(24, 8 + Math.floor(totalEvents / 20) * 4));
        
        if (isMounted.current && desiredCount !== recoCount) {
          setRecoCount(desiredCount);
        }
        
        const genreParam = topGenres.slice(0, 3).join(',');
        const recEndpoint = genreParam
          ? `discover/movie?with_genres=${genreParam}&page=${recoPage}&sort_by=popularity.desc`
          : `movie/popular?page=${recoPage}`;
          
        // Prefill from cache for instant recommendations
        const cachedData = await readCached(recEndpoint);
        if (isMounted.current && cachedData?.results && recoMovies.length === 0) {
          const ranked = rankCandidates(
            cachedData.results.map((m: any) => ({
              ...m,
              title: m.title || m.name || 'Untitled',
              release_date: m.release_date || m.first_air_date || ''
            })),
            history
          ) as TMDBMovie[];
          
          if (isMounted.current) {
            setRecoMovies(ranked.slice(0, recoCount));
          }
        }
      } catch (error) {
        console.error('Error initializing:', error);
      }
    };
    initialize();
    
    // Cleanup function
    return () => {
      isMounted.current = false;
    };
  }, [period, currentUser, recoPage, recoCount, fetchTrendingContent]);

  // Toggle favorite status
  const toggleFavorite = useCallback((movieId: number) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(movieId)) {
        newFavorites.delete(movieId);
      } else {
        newFavorites.add(movieId);
      }
      return newFavorites;
    });
  }, []);
  
  // Toggle watchlist status
  const toggleWatchlist = useCallback((movieId: number) => {
    setWatchlist(prev => {
      const newWatchlist = new Set(prev);
      if (newWatchlist.has(movieId)) {
        newWatchlist.delete(movieId);
      } else {
        newWatchlist.add(movieId);
      }
      return newWatchlist;
    });
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg h-64 animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  // Компонент для отображения состояния загрузки/ошибки
  const renderStatusMessage = (message: string, icon: React.ReactNode) => (
    <div className="text-center py-12">
      <div className="mx-auto mb-4">{icon}</div>
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  );

  // Определяем, что показывать в зависимости от состояния
  const renderContent = () => {
    if (loading && movies.length === 0 && tvShows.length === 0) {
      return renderStatusMessage('Загрузка рекомендаций...', <Clock className="h-12 w-12 mx-auto animate-spin" />);
    }
    
    if (isOffline && movies.length === 0 && tvShows.length === 0) {
      return renderStatusMessage(
        'Нет кэшированных данных. Пожалуйста, подключитесь к интернету для загрузки контента.',
        <WifiOff className="h-12 w-12 mx-auto" />
      );
    }
    
    // Return null to render the main content below
    return null;
  };

  // Render loading or offline message if needed
  const statusMessage = renderContent();
  
  // Render the main content
  if (statusMessage) {
    return (
      <div className="container mx-auto px-4 py-8 mb-24">
        {statusMessage}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 mb-24">
      {isOffline && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-md text-sm flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>Вы в оффлайн-режиме. Показываем кэшированные данные.</span>
        </div>
      )}
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
              {movies.map((movie) => (
                <div key={movie.id} className="group relative overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md dark:bg-gray-800">
                  <div className="relative aspect-[2/3] overflow-hidden">
                    <img
                      src={movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://via.placeholder.com/300x450?text=No+Image'}
                      alt={movie.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex h-full items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full bg-white/20 text-white hover:bg-white/30"
                          onClick={() => handlePlayMovie(movie.id, movie.title)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`rounded-full ${favorites.has(movie.id) ? 'text-red-500' : 'text-white/70'} hover:bg-white/20`}
                          onClick={() => toggleFavorite(movie.id)}
                        >
                          <Heart className={`h-4 w-4 ${favorites.has(movie.id) ? 'fill-current' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`rounded-full ${watchlist.has(movie.id) ? 'text-blue-500' : 'text-white/70'} hover:bg-white/20`}
                          onClick={() => toggleWatchlist(movie.id)}
                        >
                          <Bookmark className={`h-4 w-4 ${watchlist.has(movie.id) ? 'fill-current' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="mb-1 line-clamp-2 text-sm font-medium">{movie.title}</h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(movie.release_date).getFullYear() || 'N/A'}</span>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <span>{movie.vote_average?.toFixed(1) || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
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
              {tvShows.map((show) => (
                <div key={show.id} className="group relative overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md dark:bg-gray-800">
                  <div className="relative aspect-[2/3] overflow-hidden">
                    <img
                      src={show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : 'https://via.placeholder.com/300x450?text=No+Image'}
                      alt={show.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex h-full items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full bg-white/20 text-white hover:bg-white/30"
                          onClick={() => handlePlayMovie(show.id, show.title)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`rounded-full ${favorites.has(show.id) ? 'text-red-500' : 'text-white/70'} hover:bg-white/20`}
                          onClick={() => toggleFavorite(show.id)}
                        >
                          <Heart className={`h-4 w-4 ${favorites.has(show.id) ? 'fill-current' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`rounded-full ${watchlist.has(show.id) ? 'text-blue-500' : 'text-white/70'} hover:bg-white/20`}
                          onClick={() => toggleWatchlist(show.id)}
                        >
                          <Bookmark className={`h-4 w-4 ${watchlist.has(show.id) ? 'fill-current' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="mb-1 line-clamp-2 text-sm font-medium">{show.title}</h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(show.first_air_date || '').getFullYear() || 'N/A'}</span>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <span>{show.vote_average?.toFixed(1) || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
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
        onClose={() => setIsPlayerOpen(false)}
        videoKey={videoKey}
        movieTitle={selectedMovie?.title || 'Video'}
          />
    </div>
  );
};

export default EnhancedTrending;