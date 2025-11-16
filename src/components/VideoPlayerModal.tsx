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

  if (typeof window !== 'undefined') {
    const testElement = document.createElement('div');
    testElement.style.position = 'fixed';
    testElement.style.top = '20px';
    testElement.style.left = '50%';
    testElement.style.transform = 'translateX(-50%)';
    testElement.style.backgroundColor = 'red';
    testElement.style.color = 'white';
    testElement.style.padding = '20px';
    testElement.style.zIndex = '99999';
    testElement.style.fontSize = '24px';
    testElement.style.border = '3px solid white';
    testElement.style.boxShadow = '0 0 20px rgba(255,255,255,0.8)';
    testElement.textContent = 'ROOT LEVEL TEST ELEMENT';
    document.body.appendChild(testElement);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full p-0 bg-transparent border-0 overflow-visible">
        <div className="relative pt-[56.25%] w-full bg-black overflow-visible">
          <Button 
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="absolute -top-10 right-0 z-50 text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </Button>
          
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-white">Загрузка трейлера...</p>
              </div>
            </div>
          ) : videoKey ? (
            <div className="absolute inset-0 flex flex-col">
              {/* Video container */}
              <div className="relative" style={{ height: '100%' }}>
                <iframe
                  key={videoKey}
                  src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=0`}
                  className="absolute top-0 left-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={movieTitle}
                  loading="eager"
                />
                
                {/* Test element - positioned absolutely over the video */}
                <div style={{
                  position: 'fixed',
                  bottom: '50px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'red',
                  color: 'white',
                  padding: '20px 40px',
                  borderRadius: '10px',
                  zIndex: 9999,
                  fontSize: '24px',
                  fontWeight: 'bold',
                  border: '3px solid white',
                  boxShadow: '0 0 20px rgba(255,255,255,0.8)'
                }}>
                  CAN YOU SEE THIS TEXT?
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
