import { useState } from "react";
import { Heart, MessageCircle, Share, Play, Pause } from "lucide-react";
import { Button } from "./ui/button";

interface Video {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  username: string;
  likes: number;
  comments: number;
  movieTitle: string;
  isLiked: boolean;
}

interface VideoCardProps {
  video: Video;
  onLike: (videoId: string) => void;
  onComment: (videoId: string) => void;
  onShare: (videoId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const VideoCard = ({ video, onLike, onComment, onShare, className = "", style }: VideoCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    // TODO: Implement actual video play/pause functionality
  };

  return (
    <div className={`h-[70vh] w-full relative snap-start ${className}`} style={style}>
      {/* Video/Thumbnail Container - More compact */}
      <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
        <img 
          src={video.thumbnail} 
          alt={video.title}
          className="w-full h-full object-cover"
        />
        
        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/40"
        >
          {isPlaying ? (
            <Pause size={64} className="text-white opacity-80" />
          ) : (
            <Play size={64} className="text-white opacity-80" />
          )}
        </button>

        {/* Video Overlay */}
        <div className="video-overlay" />
        
        {/* Content Overlay */}
        <div className="absolute bottom-4 left-4 right-20 text-white">
          <div className="space-y-2">
            <p className="text-sm font-medium opacity-80">@{video.username}</p>
            <h3 className="text-lg font-semibold line-clamp-2">{video.title}</h3>
            <p className="text-sm opacity-70">from "{video.movieTitle}"</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onLike(video.id)}
            className={`flex flex-col gap-1 p-2 h-auto text-white hover:bg-white/20 ${
              video.isLiked ? "text-red-500" : ""
            }`}
          >
            <Heart 
              size={24} 
              className={video.isLiked ? "fill-current" : ""} 
            />
            <span className="text-xs">{video.likes}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onComment(video.id)}
            className="flex flex-col gap-1 p-2 h-auto text-white hover:bg-white/20"
          >
            <MessageCircle size={24} />
            <span className="text-xs">{video.comments}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShare(video.id)}
            className="flex flex-col gap-1 p-2 h-auto text-white hover:bg-white/20"
          >
            <Share size={24} />
            <span className="text-xs">Share</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;