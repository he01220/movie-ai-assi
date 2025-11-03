import { Star, Calendar, Search, Play } from "lucide-react";
import { Button } from "./ui/button";
import { logExternalSearch, logTrailerPlay } from "@/utils/history";

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
  overview: string;
}

interface MovieCardProps {
  movie: Movie;
  className?: string;
  style?: React.CSSProperties;
}

const MovieCard = ({ movie, className = "", style }: MovieCardProps) => {
  const releaseYear = new Date(movie.release_date).getFullYear();

  const handleSearchInBrowser = () => {
    const searchQuery = encodeURIComponent(movie.title + " movie");
    try { logExternalSearch(movie.title, movie.id); } catch {}
    window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
  };

  const handleOpenTrailer = () => {
    const q = encodeURIComponent(`${movie.title} trailer`);
    try { logTrailerPlay(movie.id, movie.title); } catch {}
    window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
  };

  return (
    <div 
      className={`movie-card group ${className}`} 
      style={style}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
        <img
          src={movie.poster_path}
          alt={movie.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Rating Badge */}
        <div className="absolute top-3 right-3 rating-badge">
          <Star size={12} className="fill-current" />
          <span>{movie.vote_average.toFixed(1)}</span>
        </div>
        
        {/* Movie Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <h3 className="font-bold text-lg mb-2 line-clamp-2">{movie.title}</h3>
          <div className="flex items-center gap-2 mb-2 text-sm">
            <Calendar size={14} />
            <span>{releaseYear}</span>
          </div>
          <p className="text-sm text-white/80 line-clamp-2 mb-3">{movie.overview}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleOpenTrailer} size="sm" variant="secondary" className="w-full">
              <Play size={14} className="mr-2" />
              Trailer
            </Button>
            <Button onClick={handleSearchInBrowser} size="sm" className="w-full">
              <Search size={14} className="mr-2" />
              Web Search
            </Button>
          </div>
        </div>
      </div>
      
      {/* Title below poster (always visible) */}
      <div className="mt-3 px-1">
        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
          {movie.title}
        </h3>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">{releaseYear}</span>
          <div className="flex items-center gap-1 text-xs">
            <Star size={12} className="text-accent fill-current" />
            <span className="text-muted-foreground">{movie.vote_average.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;