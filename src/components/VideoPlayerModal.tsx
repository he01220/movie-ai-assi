import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Globe, Play, X, Film } from "lucide-react";
import { logExternalSearch } from "@/utils/history";
import { useEffect, useState } from "react";

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  videoKey: string | null;
  isLoading?: boolean;
}

const VideoPlayerModal = ({ isOpen, onClose, movieTitle, videoKey, isLoading = false }: VideoPlayerModalProps) => {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSearchInBrowser = (isTrailer: boolean = false) => {
    try { logExternalSearch(movieTitle); } catch {}
    const searchQuery = isTrailer 
      ? `${movieTitle} официальный трейлер`
      : `Смотреть ${movieTitle} ${isTrailer ? 'трейлер' : 'онлайн'}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full p-0 bg-transparent border-0">
        <div className="relative pt-[56.25%] w-full bg-black">
          <Button 
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="absolute -top-10 right-0 z-50 text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </Button>
          
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-white">Загрузка трейлера...</p>
              </div>
            </div>
          ) : videoKey ? (
            <div className="absolute inset-0 flex flex-col">
              <div className="flex-1">
                <iframe
                  key={videoKey}
                  src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=0`}
                  className="absolute top-0 left-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={movieTitle}
                  loading="eager"
                />
              </div>
              {/* Watch Full Movie button - centered at the bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent z-50 p-4">
                <div className="flex justify-center">
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSearchInBrowser(false);
                    }}
                    variant="default"
                    size="lg"
                    className="bg-red-600 hover:bg-red-700 text-white py-4 px-8 flex items-center text-lg font-bold 
                    shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300
                    animate-pulse hover:animate-none w-full max-w-md"
                  >
                    <Film className="w-5 h-5 mr-2" />
                    Смотреть фильм полностью
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-4 text-center">
              <p className="text-xl font-medium mb-2">Трейлер не найден</p>
              <p className="mb-6 text-gray-300">К сожалению, трейлер для этого фильма недоступен.</p>
              
              {/* Action buttons when no video is available */}
              <div className="flex flex-wrap justify-center gap-3">
                <Button 
                  onClick={() => handleSearchInBrowser(true)}
                  variant="default"
                  className="bg-red-600 hover:bg-red-700 text-white py-2 px-6 flex items-center"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Найти трейлер
                </Button>
                <Button
                  onClick={() => handleSearchInBrowser(false)}
                  variant="outline"
                  className="text-white border-white/30 hover:bg-white/10 py-2 px-6 flex items-center"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Смотреть фильм онлайн
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoPlayerModal;
