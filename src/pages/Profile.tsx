import { useState, useEffect } from "react";
import { User, Settings, LogOut, Edit, Bookmark, Star, Calendar } from "lucide-react";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  language: string | null;
  preferred_language: string | null;
  updated_at: string;
}

// Removed UserVideo interface as 'Your Videos' section is deleted

interface WatchlistMovie {
  id: string;
  movie_id: string;
  created_at: string;
}

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [watchlistMovies, setWatchlistMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchUserProfile();
    fetchWatchlist();
  }, [user, navigate]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfile(data as UserProfile);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error loading profile",
        description: "Could not load your profile data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    if (!profile) return;
    setEditDisplayName(profile.display_name || profile.username || "");
    setEditBio(profile.bio || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveProfileEdits = async () => {
    if (!user) return;
    try {
      const updates: Partial<UserProfile> = {
        display_name: editDisplayName || null,
        bio: editBio || null,
      };
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (error) throw error;
      setProfile((prev) => prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } as UserProfile : prev);
      setEditing(false);
      toast({ title: 'Profile updated' });
    } catch (e) {
      toast({ title: 'Failed to update profile', variant: 'destructive' });
    }
  };

  

  const fetchWatchlist = async () => {
    if (!user) return;
    
    try {
      // Get all movie IDs from watchlist
      const { data: watchlistData, error } = await supabase
        .from('user_watchlist')
        .select('movie_id')
        .eq('user_id', user.id);

      if (error) throw error;

      // If there are movies, fetch their details in a batch
      if (watchlistData?.length > 0) {
        const movieIds = watchlistData.map(item => item.movie_id).join(',');
        
        // Single API call for all movies
        const { data } = await supabase.functions.invoke('tmdb-movies', {
          body: { 
            endpoint: 'discover/movie',
            params: {
              with_ids: movieIds,
              page: 1,
              sort_by: 'popularity.desc'
            }
          }
        });

        if (data?.results) {
          setWatchlistMovies(data.results);
        }
      } else {
        setWatchlistMovies([]);
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить список ожидания",
        variant: "destructive",
      });
    }
  };

  const removeFromWatchlist = async (movieId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('movie_id', movieId);

      if (error) throw error;

      setWatchlistMovies(prev => prev.filter(movie => movie.id.toString() !== movieId));
      toast({
        title: "Removed from watchlist",
        description: "Movie has been removed from your watchlist",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove from watchlist",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logged out successfully",
        description: "See you next time!",
      });
      navigate('/auth');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    }
  };

  // Removed video delete handler as videos feature was removed

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view your profile</p>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username || user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen">
      {/* Profile Header */}
      <div className="bg-gradient-to-b from-primary/20 to-background p-4 sm:p-6 animate-fade-in">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start items-center gap-4 md:gap-6">
            <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-primary/30">
              <AvatarImage src={profile.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="text-2xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 w-full">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2 text-center sm:text-left">
                {editing ? (
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                    <input
                      className="border rounded px-3 py-2 w-full"
                      placeholder="Display name"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                    />
                    <input
                      className="border rounded px-3 py-2 w-full"
                      placeholder="Bio"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                    />
                  </div>
                ) : (
                  <h1 className="text-2xl sm:text-3xl font-bold font-poppins break-all">@{displayName}</h1>
                )}
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  {editing ? (
                    <>
                      <Button variant="default" size="sm" onClick={saveProfileEdits} className="self-center sm:self-auto">Save</Button>
                      <Button variant="outline" size="sm" onClick={cancelEditing} className="self-center sm:self-auto">Cancel</Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={startEditing} className="self-center sm:self-auto">
                      <Edit size={16} className="mr-2" />
                      Edit Profile
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={handleLogout} className="self-center sm:self-auto">
                    <LogOut size={16} className="mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
              
              {!editing && (
                <p className="text-muted-foreground mb-4 text-center sm:text-left">{profile.bio || "No bio yet"}</p>
              )}
              
              <div className="flex items-center justify-center sm:justify-start gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    Joined {new Date(profile.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex md:flex-col gap-2 w-full md:w-auto justify-center md:justify-start">
              <Button variant="outline" size="sm" onClick={() => navigate('/settings')} className="w-full md:w-auto">
                <Settings size={16} className="mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Watchlist Section */}
      <div className="p-4 sm:p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Bookmark className="text-primary" size={24} />
            <h2 className="text-2xl font-bold">My Watchlist</h2>
          </div>
          
          {watchlistMovies.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {watchlistMovies.map((movie, index) => (
                <Card 
                  key={movie.id} 
                  className="group hover:shadow-lg transition-shadow overflow-hidden animate-scale-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="relative aspect-[2/3] overflow-hidden">
                    <img
                      src={movie.poster_path 
                        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                        : 'https://images.unsplash.com/photo-1489599735734-79b4169f2a78?w=500&h=750&fit=crop'
                      }
                      alt={movie.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                      <div className="flex gap-2 flex-col sm:flex-row w-full max-w-xs">
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => navigate(`/movie/${movie.id}`)}
                          className="w-full sm:w-auto"
                        >
                          View Details
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => removeFromWatchlist(movie.id.toString())}
                          className="w-full sm:w-auto"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>

                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-black/70 text-white">
                        <Star size={12} className="mr-1 fill-current text-yellow-500" />
                        {movie.vote_average?.toFixed(1) || 'N/A'}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2 line-clamp-2">{movie.title}</h3>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar size={12} />
                      <span>{movie.release_date?.split('-')[0] || 'N/A'}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bookmark className="mx-auto mb-4 text-muted-foreground" size={48} />
              <p className="text-muted-foreground">Your watchlist is empty. Start adding movies!</p>
            </div>
          )}
        </div>
      </div>

      {/* Your Videos section removed as requested */}
    </div>
  );
};

export default Profile;