import { useState, useEffect, useCallback } from "react";
import { LogOut, Edit, Bookmark, Star, Calendar, Plus, Film } from "lucide-react";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "../components/ui/skeleton";

interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date: string;
  [key: string]: any;
}

interface UserProfile {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  created_at?: string;
  updated_at?: string;
}

const Profile = () => {
  // Hooks
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [watchlistMovies, setWatchlistMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  
  // Constants
  const PAGE_SIZE = 8;

  // Fetch user profile
  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      setProfile(null);
      toast({ title: 'Failed to load profile', description: String(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user, fetchProfile]);

  // Fetch watchlist with pagination
  const fetchWatchlist = useCallback(async (loadMore = false) => {
    if (!user) return;
    
    try {
      const currentPage = loadMore ? page + 1 : 1;
      
      if (!loadMore) {
        setLoading(true);
        setWatchlistMovies([]);
      } else {
        setLoadingMore(true);
      }

      // Get paginated movie IDs from watchlist
      const { data: watchlistData, error, count } = await supabase
        .from('user_watchlist')
        .select('movie_id', { count: 'exact' })
        .eq('user_id', user.id)
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (error) throw error;

      // Check if there are more movies to load
      const totalCount = count || 0;
      setHasMore(currentPage * PAGE_SIZE < totalCount);
      
      if (loadMore) {
        setPage(currentPage);
      }

      // If there are movies, fetch their details in a batch
      if (watchlistData?.length > 0) {
        const movieIds = watchlistData.map(item => item.movie_id).join(',');
        
        // Single API call for movies on the current page
        const { data } = await supabase.functions.invoke('tmdb-movies', {
          body: { 
            endpoint: 'discover/movie',
            params: {
              with_ids: movieIds,
              page: 1,
              sort_by: 'popularity.desc',
              language: 'ru-RU'
            }
          }
        });

        if (data?.results) {
          setWatchlistMovies(prev => loadMore 
            ? [...prev, ...data.results]
            : data.results
          );
        }
      } else if (!loadMore) {
        setWatchlistMovies([]);
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить список ожидания",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, page, toast]);

  // Remove movie from watchlist
  const removeFromWatchlist = async (movieId: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('movie_id', movieId.toString());

      if (error) throw error;

      // Update local state
      setWatchlistMovies(prev => prev.filter(movie => movie.id !== movieId));
      
      toast({
        title: "Успех",
        description: "Фильм удален из списка ожидания",
      });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить фильм из списка ожидания",
        variant: "destructive",
      });
    }
  };

  // Save profile changes
  const saveProfileChanges = async () => {
    if (!user || !profile) return;

    try {
      const displayName = editDisplayName.trim();
      const username = editUsername.trim().toLowerCase();
      const bio = editBio.trim();
      
      // Set language to Russian
      const language = 'ru-RU';

      if (!displayName) {
        toast({
          title: "Ошибка",
          description: "Имя пользователя не может быть пустым",
          variant: "destructive",
        });
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        toast({
          title: "Ошибка",
          description: "Имя пользователя может содержать только буквы, цифры и подчеркивания",
          variant: "destructive",
        });
        return;
      }

      // Check if username is already taken
      if (username !== profile.username) {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .neq('id', user.id)
          .single();

        if (existingUser) {
          toast({
            title: "Ошибка",
            description: "Это имя пользователя уже занято",
            variant: "destructive",
          });
          return;
        }
      }

      const updates = {
        id: user.id,
        username: username,
        display_name: displayName,
        bio: bio,
        language: language,
        preferred_language: language,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' });

      if (error) throw error;

      // Update local state
      setProfile(prev => ({
        ...prev!,
        username: updates.username,
        display_name: updates.display_name,
        bio: updates.bio,
        updated_at: updates.updated_at
      }));
      
      setEditing(false);
      
      toast({
        title: "Успех",
        description: "Профиль успешно обновлен",
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить профиль: " + (error instanceof Error ? error.message : 'Неизвестная ошибка'),
        variant: "destructive",
      });
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut(); // Use signOut from useAuth
      
      // Clear any local state if needed
      setProfile(null);
      setWatchlistMovies([]);
      
      // Navigate to auth page
      navigate('/auth');
      
      // Show success message
      toast({
        title: "Успешный выход",
        description: "Вы успешно вышли из аккаунта",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось выйти из аккаунта: " + (error instanceof Error ? error.message : 'Неизвестная ошибка'),
        variant: "destructive",
      });
    }
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    if (editing) {
      // If already in edit mode, cancel and reset to original values
      setEditDisplayName(profile?.full_name || '');
      setEditUsername(profile?.username || '');
      setEditBio(profile?.bio || '');
      setEditing(false);
    } else {
      // Enter edit mode with current values
      setEditDisplayName(profile?.full_name || '');
      setEditUsername(profile?.username || '');
      setEditBio(profile?.bio || '');
      setEditing(true);
    }
  };

  // Initial load
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    // Set document language to Russian
    document.documentElement.lang = 'ru';
    
    fetchProfile();
    fetchWatchlist();
  }, [user, navigate, fetchProfile, fetchWatchlist]);

  // Skeleton loader for movies
  const renderMovieSkeletons = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Пожалуйста, войдите в систему</p>
      </div>
    );
  }

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const displayName = (profile?.full_name && profile.full_name !== 'user') ? profile.full_name : user?.email || 'Unknown User';
  const username = (profile?.username && profile.username !== 'user') ? profile.username : user?.email?.split('@')[0] || 'unknown';

  return (
    <div className="min-h-screen bg-background">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-primary/10 to-muted/20">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center sm:flex-row gap-8">
            <div className="relative group">
              <Avatar className="h-32 w-32 border-4 border-background">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={displayName} />
                ) : (
                  <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <button 
                onClick={toggleEditMode}
                className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Edit className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col h-full">
              <div className="flex-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="text-center sm:text-left">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {displayName}
                  </h1>
                </div>
                <div className="flex gap-2 justify-center sm:justify-start">
                  <Button variant="outline" onClick={toggleEditMode}>
                    <Edit className="mr-2 h-4 w-4" />
                    {editing ? 'Отменить' : 'Редактировать'}
                  </Button>
                  <Button variant="outline" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Выйти
                  </Button>
                </div>
              </div>
              <div className="flex justify-center mt-2">
                <div className="flex items-center gap-1 bg-muted/50 px-3 py-1 rounded-full">
                  <span className="text-muted-foreground">@</span>
                  <span className="text-muted-foreground font-medium">{username}</span>
                </div>
              </div>
              
              {editing ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="displayName" className="block text-sm font-medium text-muted-foreground mb-1">
                        Имя
                      </label>
                      <Input
                        id="displayName"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="w-full"
                        placeholder="Ваше имя"
                      />
                    </div>
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-muted-foreground mb-1">
                        Имя пользователя
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground">@</span>
                        <Input
                          id="username"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                          className="w-full pl-7"
                          placeholder="username"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="bio" className="block text-sm font-medium text-muted-foreground mb-1">
                      О себе
                    </label>
                    <Textarea
                      id="bio"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full min-h-[100px]"
                      placeholder="Расскажите о себе..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={toggleEditMode}>
                      Отмена
                    </Button>
                    <Button onClick={saveProfileChanges}>
                      Сохранить изменения
                    </Button>
                  </div>
                </div>
              ) : (
                profile?.bio && (
                  <p className="mt-4 text-muted-foreground">
                    {profile.bio}
                  </p>
                )
              )}
              
              <div className="mt-6 flex flex-wrap gap-4 justify-center sm:justify-start">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    На сайте с {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('ru-RU') : 'недавно'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Bookmark className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {watchlistMovies.length} в списке ожидания
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-12 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Bookmark className="h-6 w-6 text-primary" />
              Мой список ожидания
            </h2>
            <Button variant="outline" onClick={() => navigate('/movies')}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить фильмы
            </Button>
          </div>
          
          {loading ? (
            renderMovieSkeletons()
          ) : watchlistMovies.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {watchlistMovies.map((movie) => (
                  <div key={movie.id} className="group relative">
                    <Card className="h-full overflow-hidden transition-transform duration-200 hover:shadow-lg">
                      <div 
                        className="aspect-[2/3] bg-cover bg-center cursor-pointer"
                        style={{ 
                          backgroundImage: movie.poster_path 
                            ? `url(https://image.tmdb.org/t/p/w500${movie.poster_path})` 
                            : 'linear-gradient(to bottom, #f3f4f6, #e5e7eb)'
                        }}
                        onClick={() => navigate(`/movie/${movie.id}`)}
                      >
                        {!movie.poster_path && (
                          <div className="h-full flex items-center justify-center bg-muted/50">
                            <Film className="h-12 w-12 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate" title={movie.title}>
                              {movie.title}
                            </h3>
                            {movie.release_date && (
                              <p className="text-sm text-muted-foreground">
                                {movie.release_date ? new Date(movie.release_date).getFullYear() : 'Год не указан'}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-medium">
                              {movie.vote_average?.toFixed(1) || 'N/A'}
                            </span>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(movie.id);
                          }}
                        >
                          Удалить
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
              
              {hasMore && (
                <div className="mt-8 text-center">
                  <Button 
                    onClick={() => fetchWatchlist(true)}
                    disabled={loadingMore}
                    variant="outline"
                    className="min-w-[150px]"
                  >
                    {loadingMore ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Загрузка...
                      </>
                    ) : (
                      'Загрузить еще'
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 border rounded-lg">
              <Bookmark className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Список ожидания пуст</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Добавьте фильмы, чтобы они отображались здесь
              </p>
              <Button className="mt-4" onClick={() => navigate('/movies')}>
                Найти фильмы
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
