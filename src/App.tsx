import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import Layout from "./components/Layout";
import EnhancedMovies from "./pages/EnhancedMovies";
import EnhancedTrending from "./pages/EnhancedTrending";
import Profile from "./pages/Profile";
import MovieDetails from "./pages/MovieDetails";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import Activity from "./pages/Activity";
import Auth from "./pages/Auth";
import AuthModal from "./components/AuthModal";
import AIAssistant from "./components/AIAssistant";
import { useAuth } from "./hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { hydrateHistoryFromSupabase, syncLocalHistoryToSupabase } from "@/utils/history";
import { enableTVFocus } from "@/utils/tvFocus";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AppContent = () => {
  const { user, loading, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      setShowAuthModal(true);
    } else {
      setShowAuthModal(false);
    }
  }, [user, loading]);

  // If we were just signed out due to unregistered account, show a toast once
  useEffect(() => {
    if (!loading && !user) {
      try {
        const flag = localStorage.getItem('account_not_registered');
        if (flag === '1') {
          toast({ title: 'Account not registered', description: 'Please register first, then sign in.', variant: 'destructive' });
          localStorage.removeItem('account_not_registered');
        }
      } catch {}
    }
  }, [user, loading]);

  // Removed global 'account not registered' guard; handled in Auth Sign In flow

  // Globally hydrate history once the user is signed in
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!loading && user?.id) {
        try {
          // First push any local-only events to server, then hydrate back
          await syncLocalHistoryToSupabase();
          await hydrateHistoryFromSupabase();
        } catch {}
        if (!cancelled) {
          // no-op; local cache is hydrated for all pages
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id, loading]);

  useEffect(() => {
    const disable = enableTVFocus();
    return () => { try { disable?.(); } catch {} };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/movies" replace />} />
          <Route path="/movies" element={<EnhancedMovies />} />
          <Route path="/movie/:id" element={<MovieDetails />} />
          <Route path="/trending" element={<EnhancedTrending />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
      <AIAssistant />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;