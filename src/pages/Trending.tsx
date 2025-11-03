import { useState, useEffect } from "react";
import MovieCard from "../components/MovieCard";
import { TrendingUp, Search } from "lucide-react";
import { Input } from "../components/ui/input";
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

const Trending = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredMovies, setFilteredMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTrendingMovies();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      // Search movies via TMDB API
      searchMovies(searchTerm);
    } else {
      setFilteredMovies(movies);
    }
  }, [searchTerm, movies]);

  const fetchTrendingMovies = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('tmdb-movies', {
        body: { endpoint: 'trending' }
      });

      if (error) throw error;

      setMovies(data.results || []);
      setFilteredMovies(data.results || []);
    } catch (error) {
      console.error('Error fetching trending movies:', error);
      toast({
        title: 'Error loading trending movies',
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
      const { data, error } = await supabase.functions.invoke('tmdb-movies', {
        body: { 
          endpoint: 'search',
          query: query.trim()
        }
      });

      if (error) throw error;

      setFilteredMovies(data.results || []);
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
          <TrendingUp className="text-primary animate-float" size={32} />
          <h1 className="text-3xl font-bold font-poppins">Trending Now</h1>
        </div>
        
        <p className="text-muted-foreground mb-4">
          What's hot in cinema right now
        </p>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
          <Input
            placeholder="Search trending movies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-card border-border focus:border-primary"
          />
        </div>
      </div>

      {/* Trending Badge */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full border border-primary/30">
          <TrendingUp size={16} className="text-primary" />
          <span className="text-sm font-medium">
            {filteredMovies.length} trending movies
          </span>
        </div>
      </div>

      {/* Movies Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filteredMovies.map((movie, index) => (
          <MovieCard 
            key={movie.id} 
            movie={movie}
            className="animate-scale-in hover:animate-glow"
            style={{ animationDelay: `${index * 0.1}s` }}
          />
        ))}
      </div>

      {filteredMovies.length === 0 && !loading && (
        <div className="text-center py-12">
          <TrendingUp className="mx-auto mb-4 text-muted-foreground" size={48} />
          <p className="text-muted-foreground">
            {searchTerm ? `No trending movies found matching "${searchTerm}"` : 'No trending movies available'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Trending;