import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";
import { logExternalSearch } from "@/utils/history";

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  videoKey: string | null;
}

const VideoPlayerModal = ({ isOpen, onClose, movieTitle, videoKey }: VideoPlayerModalProps) => {
  const handleSearchInBrowser = () => {
    try { logExternalSearch(movieTitle); } catch {}
    window.open(`https://www.google.com/search?q=Watch+${encodeURIComponent(movieTitle)}+full+movie+online`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>{movieTitle}</DialogTitle>
          <DialogDescription>
            {videoKey ? "Watch the official trailer" : "No trailer available"}
          </DialogDescription>
        </DialogHeader>
        <AspectRatio ratio={16 / 9} className="bg-muted">
          {videoKey ? (
            <iframe
              id="youtube-player"
              src={`https://www.youtube.com/embed/${videoKey}?enablejsapi=1&autoplay=1`}
              title={movieTitle}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full rounded-md"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No trailer available for this movie</p>
            </div>
          )}
        </AspectRatio>
        
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            onClick={handleSearchInBrowser}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Globe className="w-4 h-4" />
            Search in Browser
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoPlayerModal;
