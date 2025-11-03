import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { Sun, Moon, CheckCircle2, XCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { clearAllHistory } from "@/utils/history";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => setMounted(true), []);

  const isDark = (mounted ? resolvedTheme : theme) === "dark";
  const isVerified = useMemo(() => {
    // Consider multiple possible flags to be robust
    // @ts-ignore - tolerate optional fields on Supabase user
    return Boolean(user?.email_confirmed_at || user?.confirmed_at || user?.identities?.some((i: any) => i?.identity_data?.email_verified));
  }, [user]);

  const resendVerification = async () => {
    if (!user?.email) return;
    try {
      const { data, error } = await (supabase as any).auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/` }
      });
      if (error) throw error;
      toast({ title: 'Verification Email Sent', description: `A verification link was sent to ${user.email}` });
    } catch (e: any) {
      toast({ title: 'Failed to send email', description: e?.message || 'Please try again later.', variant: 'destructive' });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-3xl font-bold">Settings</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/profile')}>Back to Profile</Button>
        </div>
      </div>

      <div className="max-w-xl space-y-6">
        <div className="p-4 border rounded-lg flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Account Verification</h2>
            <p className="text-sm text-muted-foreground">Verify your email to unlock AI Assistant and full functionality.</p>
            <div className="flex items-center gap-2 mt-2">
              {isVerified ? (
                <>
                  <CheckCircle2 className="text-green-600" size={18} />
                  <span className="text-sm">Your account is verified</span>
                </>
              ) : (
                <>
                  <XCircle className="text-red-600" size={18} />
                  <span className="text-sm">Your account is not verified</span>
                </>
              )}
            </div>
          </div>
          {!isVerified && (
            <Button
              variant="outline"
              onClick={resendVerification}
              disabled={loading}
              aria-label="Resend verification email"
            >
              <Mail size={16} className="mr-2" /> Send verification
            </Button>
          )}
        </div>
        <div className="p-4 border rounded-lg flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Appearance</h2>
            <p className="text-sm text-muted-foreground">Toggle Light/Dark mode. Your preference is saved.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {isDark ? (
              <span className="flex items-center gap-2"><Sun size={16} /> Light Mode</span>
            ) : (
              <span className="flex items-center gap-2"><Moon size={16} /> Dark Mode</span>
            )}
          </Button>
        </div>
        <div className="p-4 border rounded-lg flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Privacy & History</h2>
            <p className="text-sm text-muted-foreground">Reset watched movies, opened items, search queries, and external browser search clicks.</p>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              try { clearAllHistory(); } catch {}
              toast({ title: 'History cleared', description: 'Your local viewing and search history has been reset.' });
            }}
            aria-label="Clear all history"
          >
            Clear all history
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
