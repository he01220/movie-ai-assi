import { useMemo, useState } from "react";
import { readHistory, type HistoryEvent, deleteEventAt, deleteEventsWhere } from "@/utils/history";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Search as SearchIcon, Play, Globe, Film, Trash2, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import VideoPlayerModal from "@/components/VideoPlayerModal";

const formatTime = (ts: number) => {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
};

const typeLabel = (t: HistoryEvent["type"]) => {
  if (t === "movie_open") return "Opened";
  if (t === "trailer_play") return "Trailer";
  if (t === "external_search") return "Browser Search";
  return "Query";
};

const typeIcon = (t: HistoryEvent["type"]) => {
  if (t === "movie_open") return <Film size={14} />;
  if (t === "trailer_play") return <Play size={14} />;
  if (t === "external_search") return <Globe size={14} />;
  return <SearchIcon size={14} />;
};

type TType = HistoryEvent["type"];
const ALL_TYPES: TType[] = ["movie_open", "trailer_play", "query", "external_search"];

const Activity = () => {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Record<TType, boolean>>({
    movie_open: true,
    trailer_play: true,
    query: true,
    external_search: true,
  });
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<{ title: string; id: number } | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);

  const history = readHistory();
  const rawEvents = useMemo(() => {
    const list = [...(history.events || [])];
    list.sort((a, b) => b.ts - a.ts);
    return list;
  }, [history.events, tick]);

  const events = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawEvents.filter(e => {
      if (!activeTypes[e.type]) return false;
      if (!q) return true;
      const hay = `${e.title || ''} ${e.query || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rawEvents, query, activeTypes]);

  const toggleType = (t: TType) => setActiveTypes(s => ({ ...s, [t]: !s[t] }));

  const onDeleteIndex = (indexInFiltered: number) => {
    // Map filtered index back to absolute index in rawEvents
    const evt = events[indexInFiltered];
    const absoluteIndex = rawEvents.findIndex(e => e === evt);
    if (absoluteIndex >= 0) {
      deleteEventAt(absoluteIndex);
      setTick(x => x + 1);
    }
  };

  const onClearFiltered = () => {
    deleteEventsWhere(e => {
      if (!activeTypes[e.type]) return false; // фильтруем только видимые типы
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const hay = `${e.title || ''} ${e.query || ''}`.toLowerCase();
      return hay.includes(q);
    });
    setTick(x => x + 1);
  };

  const openInBrowser = (title?: string) => {
    if (!title) return;
    const q = encodeURIComponent(`Watch ${title} full movie`);
    window.open(`https://www.google.com/search?q=${q}`, '_blank');
  };

  const openDetails = (movieId?: number) => {
    if (!movieId) return;
    navigate(`/movie/${movieId}`);
  };

  const playTrailer = async (movieId?: number, title?: string) => {
    if (!movieId || !title) return;
    setSelectedMovie({ title, id: movieId });
    const { data } = await supabase.functions.invoke('tmdb-movies', {
      body: { endpoint: `movie/${movieId}/videos` }
    });
    const results = (data as any)?.results || [];
    const trailer = results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
      || results.find((v: any) => v.type === 'Teaser' && v.site === 'YouTube')
      || results[0];
    setVideoKey(trailer?.key || null);
    setIsPlayerOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Activity</h1>

      {/* Controls */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in activity..."
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={() => setActiveTypes({ movie_open: true, trailer_play: true, query: true, external_search: true })}>
            <Filter size={16} className="mr-2" />
            Reset filters
          </Button>
          <Button variant="destructive" onClick={onClearFiltered} disabled={events.length === 0}>
            <Trash2 size={16} className="mr-2" />
            Clear shown
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((t) => (
            <Button
              key={t}
              variant={activeTypes[t] ? "default" : "outline"}
              size="sm"
              onClick={() => toggleType(t)}
            >
              {typeIcon(t)}
              <span className="ml-2">{typeLabel(t)}</span>
            </Button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <p>No activity yet. Start exploring movies!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {events.map((e, idx) => (
            <Card key={idx} className="overflow-hidden">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="mt-1 text-muted-foreground">{typeIcon(e.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{typeLabel(e.type)}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar size={12} /> {formatTime(e.ts)}
                    </span>
                  </div>
                  <div className="mt-1 truncate">
                    {e.type === 'query' && (
                      <span>Query: <span className="font-medium">{e.query}</span></span>
                    )}
                    {(e.type === 'movie_open' || e.type === 'trailer_play') && (
                      <span>
                        Movie{e.movieId ? ` #${e.movieId}` : ''}: <span className="font-medium">{e.title || 'Unknown'}</span>
                      </span>
                    )}
                    {e.type === 'external_search' && (
                      <span>
                        Browser search: <span className="font-medium">{e.title || 'Unknown'}</span>{e.movieId ? ` (movie #${e.movieId})` : ''}
                      </span>
                    )}
                  </div>
                  {/* Actions bottom bar */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {e.type === 'external_search' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => openInBrowser(e.title || undefined)}>
                          <Globe size={14} className="mr-1" /> Open in Browser
                        </Button>
                        {!!e.movieId && (
                          <Button size="sm" variant="outline" onClick={() => openDetails(e.movieId!)}>
                            <Film size={14} className="mr-1" /> Details
                          </Button>
                        )}
                      </>
                    )}
                    {e.type === 'trailer_play' && (
                      <>
                        {!!e.movieId && (
                          <Button size="sm" variant="secondary" onClick={() => playTrailer(e.movieId!, e.title || undefined)}>
                            <Play size={14} className="mr-1" /> Play Trailer
                          </Button>
                        )}
                        {!!e.movieId && (
                          <Button size="sm" variant="outline" onClick={() => openDetails(e.movieId!)}>
                            <Film size={14} className="mr-1" /> Details
                          </Button>
                        )}
                      </>
                    )}
                    {e.type === 'movie_open' && (
                      !!e.movieId && (
                        <Button size="sm" variant="outline" onClick={() => openDetails(e.movieId!)}>
                          <Film size={14} className="mr-1" /> Details
                        </Button>
                      )
                    )}
                    {e.type === 'query' && (
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/movies?q=${encodeURIComponent(e.query || '')}`)}>
                        <SearchIcon size={14} className="mr-1" /> Search
                      </Button>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <Button variant="outline" size="sm" onClick={() => onDeleteIndex(idx)} aria-label="Delete entry">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Trailer Player Modal */}
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

export default Activity;
