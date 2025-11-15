import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Globe, Play, X } from "lucide-react";
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
            <iframe
              key={videoKey}
              src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=0`}
              className="absolute top-0 left-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={movieTitle}
              loading="eager"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-4 text-center">
              <p className="text-xl font-medium mb-2">Трейлер не найден</p>
              <p className="mb-6 text-gray-300">К сожалению, трейлер для этого фильма недоступен.</p>
              <div className="flex flex-col space-y-3 w-full max-w-xs">
                <Button 
                  onClick={() => handleSearchInBrowser(true)}
                  variant="default"
                  className="bg-red-600 hover:bg-red-700 text-white py-2"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Найти трейлер
                </Button>
                <Button
                  onClick={() => handleSearchInBrowser(false)}
                  variant="outline"
                  className="text-white border-white/30 hover:bg-white/10 py-2"
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
