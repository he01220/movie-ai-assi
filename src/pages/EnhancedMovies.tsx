import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Star, Calendar, Heart, Bookmark, Play, Globe, ArrowUp, List, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import VideoPlayerModal from "@/components/VideoPlayerModal";
import { logQuery, logExternalSearch, logTrailerPlay, logMovieOpen, readHistory, hydrateHistoryFromSupabase } from "@/utils/history";
import { rankCandidates } from "@/utils/reco";

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  genre_ids: number[];
  popularity: number;
}

interface Genre {
  id: number;
  name: string;
}

// Movie and TV genre maps
const MOVIE_GENRES: { [key: number]: string } = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};
const TV_GENRES: { [key: number]: string } = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western",
};

const EnhancedMovies = () => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"popular" | "search">("popular");
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [watchlist, setWatchlist] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedMovie, setSelectedMovie] = useState<{ title: string; id: number } | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  // Content category selector
  const [contentType, setContentType] = useState<'movie' | 'tv'>('movie');
  // Ratings: per-user and aggregated per content
  const [userRatings, setUserRatings] = useState<Record<number, number>>({});
  const [avgRatings, setAvgRatings] = useState<Record<number, { avg: number; count: number }>>({});
  const [showToGenres, setShowToGenres] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const genresRef = useRef<HTMLDivElement | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    // Do not call fetchPopularMovies here to avoid duplicate initial fetch; handled by the debounced effect below
    if (user) {
      fetchUserPreferences();
    }
    (async () => { try { if (user?.id) await hydrateHistoryFromSupabase(); } catch {}; })();
  }, [user]);

  // Smooth scroll to Genres when URL has #genres
  useEffect(() => {
    if (location.hash === '#genres') {
      const el = document.getElementById('genres');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [location.hash]);

  // (Recommendations removed from Movies; section lives in Trending)

  // Load initial state from URL (?q=...&genre=...)
  useEffect(() => {
    const q = searchParams.get('q');
    const g = searchParams.get('genre');
    const p = Number(searchParams.get('page'));
    if (q !== null) setSearchQuery(q);
    if (g !== null) setSelectedGenre(g ? Number(g) : null);
    if (!Number.isNaN(p) && p > 0) setCurrentPage(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep URL in sync with state
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (searchQuery && searchQuery.trim()) next.set('q', searchQuery.trim()); else next.delete('q');
    if (selectedGenre !== null) next.set('genre', String(selectedGenre)); else next.delete('genre');
    if (currentPage && currentPage > 1) next.set('page', String(currentPage)); else next.delete('page');
    setSearchParams(next, { replace: true });
  }, [searchQuery, selectedGenre, currentPage]);

  // Ensure new query/genre starts from page 1
  useEffect(() => {
    setCurrentPage((p) => (p !== 1 ? 1 : p));
  }, [searchQuery, selectedGenre]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery) {
        searchMovies();
      } else {
        fetchPopularMovies();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, selectedGenre, currentPage, contentType]);

  // Show Back-to-Top button on scroll
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setShowTop(y > 400);
      setShowToGenres(y > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch ratings (user's and averages) for a set of visible TV items
  const fetchRatingsFor = async (ids: number[]) => {
    if (!ids || ids.length === 0) return;
    try {
      const idsText = ids.map(String);
      const { data, error } = await (supabase as any)
        .from('user_ratings')
        .select('content_id, user_id, rating')
        .in('content_id', idsText)
        .eq('content_type', 'tv');
      if (error) return;
      const avgMap: Record<number, { sum: number; count: number }> = {};
      const userMap: Record<number, number> = {};
      for (const row of (data || [])) {
        const idNum = parseInt(row.content_id);
        if (!Number.isFinite(idNum)) continue;
        if (!avgMap[idNum]) avgMap[idNum] = { sum: 0, count: 0 };
        avgMap[idNum].sum += row.rating || 0;
        avgMap[idNum].count += 1;
        if (user && row.user_id === user.id) {
          userMap[idNum] = row.rating || 0;
        }
      }
      const nextAvg: Record<number, { avg: number; count: number }> = {};
      Object.entries(avgMap).forEach(([k, v]) => {
        const id = parseInt(k);
        nextAvg[id] = { avg: v.count ? v.sum / v.count : 0, count: v.count };
      });
      setAvgRatings(nextAvg);
      if (user) setUserRatings(prev => ({ ...prev, ...userMap }));
    } catch {}
  };

  // Set rating for a TV item
  const setRating = async (id: number, rating: number) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to rate', variant: 'destructive' });
      return;
    }
    try {
      await (supabase as any)
        .from('user_ratings')
        .upsert({
          user_id: user.id,
          content_id: String(id),
          content_type: 'tv',
          rating
        }, { onConflict: 'user_id,content_id,content_type' });
      setUserRatings(prev => ({ ...prev, [id]: rating }));
      const current = avgRatings[id];
      if (current) {
        const prevUser = userRatings[id];
        let sum = current.avg * current.count;
        let count = current.count;
        if (prevUser) {
          sum = sum - prevUser + rating;
        } else {
          sum = sum + rating;
          count = count + 1;
        }
        setAvgRatings(prev => ({ ...prev, [id]: { avg: sum / count, count } }));
      } else {
        setAvgRatings(prev => ({ ...prev, [id]: { avg: rating, count: 1 } }));
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to save rating', variant: 'destructive' });
    }
  };

  // Keep prev/next button state in sync with horizontal scroll position
  useEffect(() => {
    const el = genresRef.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update as any);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [genresRef.current]);

  // Simple local cache for TMDB responses
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

  const fetchFromTMDB = async (endpoint: string, opts?: { retries?: number; timeoutMs?: number }) => {
    const retries = opts?.retries ?? 2;
    const timeoutMs = opts?.timeoutMs ?? 9000;
    const invoke = () => supabase.functions.invoke('tmdb-movies', { body: { endpoint } });

    const withTimeout = <T,>(p: Promise<T>): Promise<T> => {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
      });
    };

    let lastErr: any = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const { data, error } = await withTimeout(invoke());
        if (error) throw error;
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

  const fetchPopularMovies = async (genreOverride: number | null = selectedGenre, pageOverride: number = currentPage) => {
    setLoading(true);
    setError(null);
    setLastAction("popular");
    const endpoint = genreOverride != null 
      ? `discover/${contentType}?with_genres=${genreOverride}&page=${pageOverride}&sort_by=popularity.desc`
      : `${contentType}/popular?page=${pageOverride}`;
    // Prefill from cache for instant UI if available
    const cachedPrefill = readCached(endpoint) || (genreOverride != null ? readCached(`${contentType}/popular?page=${pageOverride}`) : null);
    if (cachedPrefill && movies.length === 0) {
      const results = (cachedPrefill.results || []) as TMDBMovie[];
      const ranked = rankCandidates(results, readHistory());
      setMovies(ranked as TMDBMovie[]);
      setTotalPages(Math.min(cachedPrefill.total_pages || 1, 500));
    }
    // Try live first
    let data = await fetchFromTMDB(endpoint);
    // Fallback to popular if discover by genre failed
    if (!data && selectedGenre) {
      data = await fetchFromTMDB(`${contentType}/popular?page=${currentPage}`);
    }
    // Cross-type fallback to movie popular to avoid empty UI
    if (!data) {
      data = await fetchFromTMDB(`movie/popular?page=${currentPage}`);
    }
    // Fallback to cache if still failing
    if (!data) {
      const cached =
        readCached(endpoint) ||
        (selectedGenre ? readCached(`${contentType}/popular?page=${currentPage}`) : null) ||
        readCached(`movie/popular?page=${currentPage}`);
      if (cached) data = cached;
    }
    
    if (data) {
      const results = (data.results || []) as TMDBMovie[];
      const ranked = rankCandidates(results, readHistory());
      setMovies(ranked as TMDBMovie[]);
      setTotalPages(Math.min(data.total_pages || 1, 500)); // Limit to 500 pages
      if (contentType === 'tv') { try { await fetchRatingsFor((ranked as TMDBMovie[]).map(m => m.id)); } catch {} }
    } else {
      // Only show error if we have nothing to show
      if (movies.length === 0) {
        setError('Unable to load movies. Please try again.');
        setMovies([]);
      }
    }
    setLoading(false);
  };

  const searchMovies = async (
    queryOverride: string = searchQuery,
    genreOverride: number | null = selectedGenre,
    pageOverride: number = currentPage
  ) => {
    if (!queryOverride.trim()) return;
    
    setLoading(true);
    setError(null);
    setLastAction("search");
    const endpoint = `search/${contentType}?query=${encodeURIComponent(queryOverride)}&page=${pageOverride}`;
    // Prefill from cache for instant UI
    const cachedPrefill = readCached(endpoint);
    if (cachedPrefill && movies.length === 0) {
      let results = (cachedPrefill.results || []) as TMDBMovie[];
      if (genreOverride != null) results = results.filter(m => m.genre_ids?.includes(genreOverride));
      const ranked = rankCandidates(results, readHistory());
      setMovies(ranked as TMDBMovie[]);
      setTotalPages(Math.min(cachedPrefill.total_pages || 1, 500));
      if (contentType === 'tv') { try { await fetchRatingsFor((ranked as TMDBMovie[]).map(m => m.id)); } catch {} }
    }
    let data = await fetchFromTMDB(endpoint);
    // Fallback to popular if search fails
    if (!data) {
      data = await fetchFromTMDB(`${contentType}/popular?page=${currentPage}`);
    }
    // Cross-type fallback to movie search/popular
    if (!data) {
      data = await fetchFromTMDB(`search/movie?query=${encodeURIComponent(queryOverride)}&page=${pageOverride}`);
    }
    if (!data) {
      data = await fetchFromTMDB(`movie/popular?page=${currentPage}`);
    }
    if (!data) {
      const cached =
        readCached(endpoint) ||
        readCached(`${contentType}/popular?page=${currentPage}`) ||
        readCached(`search/movie?query=${encodeURIComponent(queryOverride)}&page=${pageOverride}`) ||
        readCached(`movie/popular?page=${currentPage}`);
      if (cached) data = cached;
    }
    
    if (data) {
      let results = (data.results || []) as TMDBMovie[];
      // Apply client-side genre filter during search
      if (genreOverride != null) {
        results = results.filter(m => m.genre_ids?.includes(genreOverride));
      }
      const ranked = rankCandidates(results, readHistory());
      setMovies(ranked as TMDBMovie[]);
      setTotalPages(Math.min(data.total_pages || 1, 500));
      if (contentType === 'tv') { try { await fetchRatingsFor((ranked as TMDBMovie[]).map(m => m.id)); } catch {} }
    } else {
      if (movies.length === 0) {
        setError('Unable to load search results. Please try again.');
        setMovies([]);
      }
    }
    setLoading(false);
  };

  const fetchUserPreferences = async () => {
    if (!user) return;

    try {
      // Fetch user favorites
      const { data: favoritesData } = await supabase
        .from('user_favorites')
        .select('movie_id')
        .eq('user_id', user.id);

      if (favoritesData) {
        setFavorites(new Set(favoritesData.map(f => parseInt(f.movie_id))));
      }

      // Fetch user watchlist
      const { data: watchlistData } = await supabase
        .from('user_watchlist')
        .select('movie_id')
        .eq('user_id', user.id);

      if (watchlistData) {
        setWatchlist(new Set(watchlistData.map(w => parseInt(w.movie_id))));
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

  const getMovieGenres = (genreIds: number[]) => {
    const map = contentType === 'tv' ? TV_GENRES : MOVIE_GENRES;
    return genreIds.slice(0, 3).map(id => map[id]).filter(Boolean);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const page = 1;
    setCurrentPage(page);
    try { logQuery(searchQuery); } catch {}
    searchMovies(searchQuery, selectedGenre, page);
  };

  const handlePlayMovie = async (movieId: number, movieTitle: string) => {
    try {
      const genres = movies.find(m => m.id === movieId)?.genre_ids;
      logTrailerPlay(movieId, movieTitle, genres);
    } catch {}
    setSelectedMovie({ title: movieTitle, id: movieId });
    
    // Fetch trailer from TMDB
    const data = await fetchFromTMDB(`${contentType}/${movieId}/videos`);
    
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

  if (loading && movies.length === 0) {
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

      {/* Floating Scroll Controls */}
      {showTop && (
        <>
          <button
            onClick={() => {
              const el = document.getElementById('genres');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="fixed bottom-6 right-20 h-10 w-10 rounded-full bg-secondary text-secondary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
            aria-label="Scroll to genres"
            title="Scroll to Genres"
          >
            <List size={18} />
          </button>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
            aria-label="Back to top"
            title="Back to Top"
          >
            <ArrowUp size={18} />
          </button>
        </>
      )}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 mb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">CinemaEase</h1>
        
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder="Search for movies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={loading}>
            Search
          </Button>
        </form>

        {/* Category + Genre Filter (Sticky) */}
        <div className="sticky top-16 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b overflow-hidden">
          <div className="relative overflow-hidden">
            {/* Category toggle */}
            <div className="flex gap-2 px-4 pt-3">
              <Button
                variant={contentType === 'movie' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { if (contentType !== 'movie') { setContentType('movie'); setCurrentPage(1); setSelectedGenre(null); } }}
              >
                Movies
              </Button>
              <Button
                variant={contentType === 'tv' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { if (contentType !== 'tv') { setContentType('tv'); setCurrentPage(1); setSelectedGenre(null); } }}
              >
                TV
              </Button>
            </div>
            {/* Scrollable genres row (directly scrollable element) */}
            <div
              id="genres"
              ref={genresRef}
              className="w-full flex gap-2 py-3 px-4 overflow-x-auto whitespace-nowrap scroll-smooth snap-x snap-mandatory"
              role="region"
              aria-label="Genres"
              tabIndex={0}
              onKeyDown={(e) => {
                const el = genresRef.current;
                if (!el) return;
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  const delta = Math.round(el.clientWidth * 0.8);
                  el.scrollBy({ left: delta, behavior: 'smooth' });
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const delta = Math.round(el.clientWidth * 0.8);
                  el.scrollBy({ left: -delta, behavior: 'smooth' });
                }
              }}
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
                <Button
                  variant={selectedGenre === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const page = 1;
                    setSelectedGenre(null);
                    setCurrentPage(page);
                    if (searchQuery.trim()) {
                      searchMovies(searchQuery, null, page);
                    } else {
                      fetchPopularMovies(null, page);
                    }
                  }}
                  className="snap-start"
                  aria-pressed={selectedGenre === null}
                >
                  All Genres
                </Button>
                {Object.entries(contentType === 'tv' ? TV_GENRES : MOVIE_GENRES).map(([id, name]) => (
                  <Button
                    key={id}
                    variant={selectedGenre === parseInt(id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const genreId = parseInt(id);
                      const page = 1;
                      setSelectedGenre(genreId);
                      setCurrentPage(page);
                      if (searchQuery.trim()) {
                        searchMovies(searchQuery, genreId, page);
                      } else {
                        fetchPopularMovies(genreId, page);
                      }
                    }}
                    className="snap-start"
                    aria-pressed={selectedGenre === parseInt(id)}
                  >
                    {name}
                  </Button>
                ))}
            </div>
          </div>
        </div>

        
      </div>

      {/* Recommended section removed from Movies; it is available in Trending */}

      {/* Movies Grid / Empty & Error States */}
      {movies.length === 0 ? (
        <div className="text-center py-12">
          <Search size={64} className="mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">
            {error ? 'Something went wrong' : 'No movies found'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {error ? error : 'Try adjusting your search or browse by genre'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => {
              if (lastAction === 'search') {
                searchMovies();
              } else {
                fetchPopularMovies();
              }
            }}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {movies.map((movie) => (
            <Card key={movie.id} className="group hover:shadow-lg transition-shadow overflow-hidden">
              <div className="relative aspect-[2/3] overflow-hidden">
                <img
                  src={movie.poster_path 
                    ? (movie.poster_path.startsWith('http') 
                      ? movie.poster_path 
                      : `https://image.tmdb.org/t/p/w500${movie.poster_path}`)
                    : 'https://images.unsplash.com/photo-1489599735734-79b4169f2a78?w=500&h=750&fit=crop'
                  }
                  alt={movie.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                
                {/* Overlay Actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="flex gap-2">
                    <Button 
                      size="icon" 
                      variant="secondary"
                      onClick={() => handlePlayMovie(movie.id, movie.title)}
                      title="Play Trailer"
                    >
                      <Play size={16} />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={() => { try { logExternalSearch(movie.title, movie.id); } catch {}; window.open(`https://www.google.com/search?q=${encodeURIComponent(`Watch ${movie.title} full movie`)}`,'_blank'); }}
                      title="Watch Full Movie"
                    >
                      <Globe size={16} />
                    </Button>
                    <Button 
                      size="icon" 
                      variant={favorites.has(movie.id) ? "default" : "secondary"}
                      onClick={() => toggleFavorite(movie.id)}
                      title="Add to Favorites"
                    >
                      <Heart size={16} className={favorites.has(movie.id) ? "fill-current" : ""} />
                    </Button>
                    <Button 
                      size="icon" 
                      variant={watchlist.has(movie.id) ? "default" : "secondary"}
                      onClick={() => toggleWatchlist(movie.id)}
                      title="Add to Watchlist"
                    >
                      <Bookmark size={16} className={watchlist.has(movie.id) ? "fill-current" : ""} />
                    </Button>
                  </div>
                </div>

                {/* Rating Badge */}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="bg-black/70 text-white">
                    <Star size={12} className="mr-1 fill-current text-yellow-500" />
                    {movie.vote_average.toFixed(1)}
                  </Badge>
                </div>
              </div>

              <CardContent className="p-4">
                <h3 className="font-semibold mb-2 line-clamp-2">{(movie as any).title || (movie as any).name}</h3>
                
                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                  <Calendar size={12} />
                  <span>{(movie as any).release_date?.split('-')[0] || (movie as any).first_air_date?.split('-')[0] || 'N/A'}</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {getMovieGenres(movie.genre_ids).map((genre) => (
                    <Badge key={genre} variant="outline" className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </div>

                <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                  {movie.overview}
                </p>

                {contentType === 'tv' && (
                  <div className="mb-4">
                    <div className="flex items-center gap-1">
                      {([1,2,3,4,5] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`Rate ${n} star${n>1?'s':''}`}
                          onClick={() => setRating(movie.id, n)}
                          className="p-0.5"
                          title={`Rate ${n}`}
                        >
                          <Star
                            size={16}
                            className={
                              (userRatings[movie.id] ?? 0) >= n
                                ? 'fill-yellow-500 text-yellow-500'
                                : 'text-muted-foreground'
                            }
                          />
                        </button>
                      ))}
                      <span className="text-xs text-muted-foreground ml-2">
                        {avgRatings[movie.id]?.avg ? `${avgRatings[movie.id].avg.toFixed(1)} (${avgRatings[movie.id].count})` : 'No ratings yet'}
                      </span>
                    </div>
                  </div>
                )}

                {contentType === 'movie' ? (
                  <Button 
                    onClick={() => { try { logMovieOpen(movie.id, (movie as any).title, movie.genre_ids); } catch {}; navigate(`/movie/${movie.id}`); }}
                    className="w-full"
                    size="sm"
                  >
                    View Details
                  </Button>
                ) : (
                  <Button 
                    onClick={() => { try { logExternalSearch((movie as any).name || (movie as any).title, movie.id); } catch {}; window.open(`https://www.google.com/search?q=${encodeURIComponent(`Watch ${(movie as any).name || (movie as any).title} full series`)}`,'_blank'); }}
                    className="w-full"
                    size="sm"
                    variant="secondary"
                  >
                    Find to Watch
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || loading}
          >
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const page = Math.max(1, currentPage - 2) + i;
              if (page > totalPages) return null;
              
              return (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  onClick={() => setCurrentPage(page)}
                  disabled={loading}
                  size="sm"
                >
                  {page}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || loading}
          >
            Next
          </Button>
        </div>
      )}

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

export default EnhancedMovies;