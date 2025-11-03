import { useState, useEffect } from "react";
import MovieCard from "../components/MovieCard";
import { Film, Search, Globe } from "lucide-react";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "react-router-dom";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
  overview: string;
}

const Movies = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredMovies, setFilteredMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<'movies' | 'series' | 'cartoons' | 'animated_series'>('movies');
  const [country, setCountry] = useState<string>('ALL'); // default no restriction
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // Helper: navigate without preserving hash/text fragments
  const navigateSearch = (params: URLSearchParams, replace = false) => {
    const url = `${location.pathname}?${params.toString()}`;
    navigate(url, { replace });
  };

  useEffect(() => {
    fetchPopularMovies();
  }, [category, country]);

  // Initialize from URL query params (?cat=series&country=TR)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qCat = params.get('cat');
      const qCountry = params.get('country');
      if (qCat && (['movies','series','cartoons','animated_series'] as const).includes(qCat as any)) {
        setCategory(qCat as any);
      }
      setCountry(qCountry ? qCountry.toUpperCase() : 'ALL');
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Respond to URL query change while staying on the page
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const qCat = params.get('cat');
      const qCountry = params.get('country');
      if (qCat && (['movies','series','cartoons','animated_series'] as const).includes(qCat as any)) {
        setSearchTerm('');
        setCategory(qCat as any);
      }
      if (qCountry) {
        setCountry(qCountry.toUpperCase());
      }
    } catch {}
  }, [location.search]);

  // Remove text fragment/hash like #:~:text=... if present and reset scroll
  useEffect(() => {
    if (location.hash) {
      navigate(`${location.pathname}${location.search}`, { replace: true });
      // Cancel browser's auto-scroll to the text fragment
      setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      }, 0);
    }
  }, [location.hash]);

  useEffect(() => {
    if (searchTerm.trim()) {
      // Search movies via TMDB API
      searchMovies(searchTerm);
    } else {
      setFilteredMovies(movies);
    }
  }, [searchTerm, movies]);

  const buildEndpoint = (cat: 'movies' | 'series' | 'cartoons' | 'animated_series', cn: string) => {
    let endpoint = '';
    const origin = cn !== 'ALL' ? `with_origin_country=${cn}` : '';
    if (cat === 'movies') {
      endpoint = origin ? `discover/movie?${origin}&sort_by=popularity.desc` : 'movie/popular';
    }
    if (cat === 'series') {
      endpoint = origin ? `discover/tv?${origin}&sort_by=popularity.desc` : 'tv/popular';
    }
    if (cat === 'cartoons') {
      // Do not restrict by origin to ensure richer results
      endpoint = `discover/movie?with_genres=16&sort_by=popularity.desc`;
    }
    if (cat === 'animated_series') {
      // Do not restrict by origin to ensure richer results
      endpoint = `discover/tv?with_genres=16&sort_by=popularity.desc`;
    }
    return endpoint;
  };

  const fetchPopularMoviesFor = async (cat: 'movies' | 'series' | 'cartoons' | 'animated_series', cn: string) => {
    setLoading(true);
    try {
      const endpoint = buildEndpoint(cat, cn);
      const { data, error } = await supabase.functions.invoke('tmdb-movies', {
        body: { endpoint }
      });

      if (error) throw error;

      const normalized: Movie[] = (data.results || []).map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        release_date: item.release_date || item.first_air_date || '',
        vote_average: item.vote_average || 0,
        overview: item.overview || ''
      }));

      setMovies(normalized);
      setFilteredMovies(normalized);
    } catch (error) {
      console.error('Error fetching popular movies:', error);
      toast({
        title: 'Error loading movies',
        description: 'Please try again later',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPopularMovies = async () => {
    setLoading(true);
    try {
      const endpoint = buildEndpoint(category, country);
      const { data, error } = await supabase.functions.invoke('tmdb-movies', { body: { endpoint } });

      if (error) throw error;

      const normalized: Movie[] = (data.results || []).map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        release_date: item.release_date || item.first_air_date || '',
        vote_average: item.vote_average || 0,
        overview: item.overview || ''
      }));

      setMovies(normalized);
      setFilteredMovies(normalized);
    } catch (error) {
      console.error('Error fetching popular movies:', error);
      toast({
        title: 'Error loading movies',
        description: 'Please try again later',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const searchMovies = async (query: string) => {
    if (!query.trim()) return;

    try {
      let endpoint = '';
      if (category === 'movies') endpoint = `search/movie?query=${encodeURIComponent(query.trim())}`;
      if (category === 'series') endpoint = `search/tv?query=${encodeURIComponent(query.trim())}`;
      if (category === 'cartoons') endpoint = `search/movie?query=${encodeURIComponent(query.trim())}`; // approximate
      if (category === 'animated_series') endpoint = `search/tv?query=${encodeURIComponent(query.trim())}`; // approximate

      const { data, error } = await supabase.functions.invoke('tmdb-movies', {
        body: { endpoint }
      });

      if (error) throw error;

      const normalized: Movie[] = (data.results || []).map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        release_date: item.release_date || item.first_air_date || '',
        vote_average: item.vote_average || 0,
        overview: item.overview || ''
      }));

      setFilteredMovies(normalized);
    } catch (error) {
      console.error('Error searching movies:', error);
      toast({
        title: 'Search failed',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <Film className="text-primary" size={32} />
          <h1 className="text-3xl font-bold font-poppins">Browse</h1>
        </div>

        

        {/* Category Tabs */}
        <Tabs value={category} onValueChange={async (v) => {
          setSearchTerm('');
          setCategory(v as any);
          const params = new URLSearchParams(location.search);
          params.set('cat', String(v));
          navigateSearch(params, false);
          await fetchPopularMoviesFor(v as any, country);
        }} className="mb-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="movies">Movies</TabsTrigger>
            <TabsTrigger value="series">Series</TabsTrigger>
            <TabsTrigger value="cartoons">Cartoons</TabsTrigger>
            <TabsTrigger value="animated_series">Animated Series</TabsTrigger>
          </TabsList>

          

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
            <Input
              placeholder={`Search ${category.replace('_', ' ')}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-card border-border focus:border-primary"
            />
          </div>


          {/* Content */}
          <TabsContent value={category} className="mt-4">
            {/* Grid with Scroll Area */}
            <ScrollArea className="h-[calc(100vh-250px)] w-full rounded-md">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-4">
                {filteredMovies.map((movie, index) => (
                  <MovieCard 
                    key={movie.id} 
                    movie={movie}
                    className="animate-scale-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  />
                ))}
              </div>

              {filteredMovies.length === 0 && !loading && (
                <div className="text-center py-12">
                  <Film className="mx-auto mb-4 text-muted-foreground" size={48} />
                  <p className="text-muted-foreground">
                    {searchTerm ? `No results found for "${searchTerm}"` : 'No content available'}
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Movies;