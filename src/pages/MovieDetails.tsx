import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Heart, Plus, Share, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { logMovieOpen, readHistory, logExternalSearch, logTrailerPlay } from '@/utils/history';
import { rankCandidates } from '@/utils/reco';
interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  runtime: number;
  genres: { id: number; name: string }[];
  videos?: {
    results: Array<{
      key: string;
      type: string;
      site: string;
      name: string;
    }>;
  };
}


const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [reco, setReco] = useState<Movie[]>([]);
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    if (id) {
      fetchMovieDetails();
      if (user) {
        checkUserStatus();
      }
    }
  }, [id, user]);

  const fetchMovieDetails = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('tmdb-movies', {
        body: { endpoint: `movie/${id}?append_to_response=videos` }
      });

      if (error) throw error;
      setMovie(data);
      try { logMovieOpen(Number(id), data?.title, data?.genres?.map((g: any)=>g.id)); } catch {}
      // fetch similar and rank
      try {
        const { data: sim, error: simErr } = await supabase.functions.invoke('tmdb-movies', {
          body: { endpoint: `movie/${id}/similar` }
        });
        if (!simErr && sim?.results?.length) {
          const ranked = rankCandidates(sim.results.map((m: any)=>({ id: m.id, title: m.title, genre_ids: m.genre_ids, vote_average: m.vote_average, popularity: m.popularity })), readHistory());
          // Map back to minimal Movie for display (poster path via TMDB)
          const byId: Record<number, any> = Object.fromEntries(sim.results.map((m: any)=>[m.id, m]));
          const ordered: Movie[] = ranked.map((r:any)=>{
            const d = byId[r.id];
            return {
              id: d.id,
              title: d.title,
              overview: d.overview,
              poster_path: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : '',
              backdrop_path: d.backdrop_path,
              release_date: d.release_date,
              vote_average: d.vote_average,
              runtime: 0,
              genres: [],
            } as Movie;
          }).slice(0, 8);
          setReco(ordered);
        } else {
          setReco([]);
        }
      } catch {}
    } catch (error) {
      console.error('Error fetching movie details:', error);
      toast({
        title: "Error",
        description: "Failed to load movie details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkUserStatus = async () => {
    if (!user || !id) return;

    try {
      const movieId = id;
      const [favResponse, watchlistResponse] = await Promise.all([
        supabase
          .from('user_favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('movie_id', movieId)
          .single(),
        supabase
          .from('user_watchlist')
          .select('id')
          .eq('user_id', user.id)
          .eq('movie_id', movieId)
          .single()
      ]);

      setIsFavorite(!!favResponse.data);
      setInWatchlist(!!watchlistResponse.data);
    } catch (error) {
      // User doesn't have this movie in favorites/watchlist
    }
  };

  const toggleFavorite = async () => {
    if (!user || !id) return;

    try {
      if (isFavorite) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('movie_id', id);
        setIsFavorite(false);
        toast({ title: "Removed from favorites" });
      } else {
        await supabase
          .from('user_favorites')
          .insert([{ user_id: user.id, movie_id: id }]);
        setIsFavorite(true);
        toast({ title: "Added to favorites" });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    }
  };

  const toggleWatchlist = async () => {
    if (!user || !id) return;

    try {
      if (inWatchlist) {
        await supabase
          .from('user_watchlist')
          .delete()
          .eq('user_id', user.id)
          .eq('movie_id', id);
        setInWatchlist(false);
        toast({ title: "Removed from watchlist" });
      } else {
        await supabase
          .from('user_watchlist')
          .insert([{ user_id: user.id, movie_id: id }]);
        setInWatchlist(true);
        toast({ title: "Added to watchlist" });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update watchlist",
        variant: "destructive",
      });
    }
  };

  const handleTrailerClick = (key: string) => {
    logTrailerPlay(movie?.id || 0, movie?.title || '');
    window.open(`https://www.youtube.com/watch?v=${key}`, '_blank');
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: movie?.title,
          text: `Check out this movie: ${movie?.title}`,
          url: url,
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied to clipboard!" });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to copy link",
          variant: "destructive",
        });
      }
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Фильм не найден</p>
      </div>
    );
  }

  const trailer = movie.videos?.results?.find(
    video => video.type === 'Trailer' && video.site === 'YouTube'
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{movie.title}</h1>
        </div>
        
        {/* Trailer Section */}
        {movie.videos?.results && movie.videos.results.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Трейлеры и видео</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {movie.videos.results
                .filter(video => video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser'))
                .map((video) => (
                  <div 
                    key={video.key} 
                    className="relative cursor-pointer group"
                    onClick={() => handleTrailerClick(video.key)}
                  >
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden relative">
                      <img 
                        src={`https://img.youtube.com/vi/${video.key}/hqdefault.jpg`} 
                        alt={video.name}
                        className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity">
                          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <h3 className="mt-2 text-sm font-medium line-clamp-2">{video.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {video.type === 'Trailer' ? 'Трейлер' : 'Тизер'} • {video.site}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Hero Section */}
      <div className="relative h-96 md:h-[500px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: movie.backdrop_path
              ? `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})`
              : 'none',
          }}
        />
        <div className="absolute inset-0 bg-black/60" />
        
        <div className="relative z-10 p-4 h-full flex flex-col justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="self-start text-white hover:bg-white/20"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          
          <div className="flex items-end gap-6">
            <img
              src={movie.poster_path 
                ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                : '/placeholder.svg'
              }
              alt={movie.title}
              className="w-32 md:w-48 rounded-lg shadow-xl"
            />
            
            <div className="flex-1 text-white">
              <h1 className="text-3xl md:text-5xl font-bold mb-2">{movie.title}</h1>
              <div className="flex items-center gap-4 mb-4">
                {movie.vote_average !== undefined && movie.vote_average !== null && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span>{movie.vote_average.toFixed(1)}</span>
                  </div>
                )}
                <span>{new Date(movie.release_date).getFullYear()}</span>
                {movie.runtime && <span>{movie.runtime} min</span>}
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {movie.genres?.map((genre) => (
                  <Badge key={genre.id} variant="secondary">
                    {genre.name}
                  </Badge>
                ))}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {user && (
                  <>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={toggleFavorite}
                      className="text-white border-white hover:bg-white hover:text-black"
                    >
                      <Heart className={`mr-2 h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                      {isFavorite ? 'Favorited' : 'Favorite'}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={toggleWatchlist}
                      className="text-white border-white hover:bg-white hover:text-black"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {inWatchlist ? 'In Watchlist' : 'Watchlist'}
                    </Button>
                  </>
                )}
                
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleShare}
                  className="text-white border-white hover:bg-white hover:text-black"
                >
                  <Share className="mr-2 h-4 w-4" />
                  Share
                </Button>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Overview */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              {movie.overview || 'No overview available.'}
            </p>
          </CardContent>
        </Card>

        <Separator className="my-8" />
        {/* Recommended for you */}
        {reco.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Recommended for you</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {reco.map((m) => (
                <button
                  key={m.id}
                  className="text-left group"
                  onClick={() => navigate(`/movie/${m.id}`)}
                  aria-label={`Open ${m.title}`}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
                    <img src={m.poster_path || '/placeholder.svg'} alt={m.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white">
                      <div className="text-xs flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {m.vote_average?.toFixed(1)}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium line-clamp-2">{m.title}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieDetails;