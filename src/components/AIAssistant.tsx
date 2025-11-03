import { useState, useRef, useEffect, useMemo } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, Lightbulb, Minimize2, Maximize2, Trash2, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const AIAssistant = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const INITIAL_MESSAGES: Message[] = [
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI movie assistant powered by Groq. Ask me about movies, actors, plots, recommendations, or anything cinema-related! 🎬'
    }
  ];
  const STORAGE_PREFIX = 'ai_assistant_v1';
  const userSuffix = user?.id ? `_${user.id}` : '';
  const STORAGE_KEY = `${STORAGE_PREFIX}_messages${userSuffix}`;
  const STORAGE_KEY_OPEN = `${STORAGE_PREFIX}_open${userSuffix}`;
  const STORAGE_KEY_MIN = `${STORAGE_PREFIX}_min${userSuffix}`;
  const STORAGE_KEY_INPUT = `${STORAGE_PREFIX}_input${userSuffix}`;
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);

  const isVerified = useMemo(() => {
    // Consider multiple possible flags for verification status
    // @ts-ignore allow optional fields
    return Boolean(user?.email_confirmed_at || user?.confirmed_at || user?.identities?.some((i: any) => i?.identity_data?.email_verified));
  }, [user]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const rawMsgs = localStorage.getItem(STORAGE_KEY);
      if (rawMsgs) {
        const parsed = JSON.parse(rawMsgs) as Message[];
        if (Array.isArray(parsed) && parsed.every(m => typeof m.role === 'string' && typeof m.content === 'string')) {
          setMessages(parsed);
        }
      }

      const rawOpen = localStorage.getItem(STORAGE_KEY_OPEN);
      if (rawOpen !== null) setIsOpen(rawOpen === 'true');

      const rawMin = localStorage.getItem(STORAGE_KEY_MIN);
      if (rawMin !== null) setIsMinimized(rawMin === 'true');

      const rawInput = localStorage.getItem(STORAGE_KEY_INPUT);
      if (rawInput !== null) setInputMessage(rawInput);
    } catch (e) {
      console.warn('Failed to load AI assistant state from storage', e);
    }
    // re-hydrate when user changes to use their scoped storage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to persist AI assistant messages to storage', e);
    }
  }, [messages, STORAGE_KEY]);

  // Load from Supabase for authenticated user
  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      try {
        const { data, error } = await (supabase as any)
          .from('assistant_conversations')
          .select('messages, updated_at')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) return;
        const msgs = (data as any)?.messages as Message[] | undefined;
        if (msgs && Array.isArray(msgs)) setMessages(msgs);
      } catch {}
    };
    load();
  }, [user?.id]);

  // Persist open/minimized/input state
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_OPEN, String(isOpen)); } catch {}
  }, [isOpen, STORAGE_KEY_OPEN]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_MIN, String(isMinimized)); } catch {}
  }, [isMinimized, STORAGE_KEY_MIN]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_INPUT, inputMessage); } catch {}
  }, [inputMessage, STORAGE_KEY_INPUT]);

  // Debounced save to Supabase for authenticated user
  useEffect(() => {
    if (!user?.id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await (supabase as any).from('assistant_conversations').upsert({
          user_id: user.id,
          messages,
        }, { onConflict: 'user_id' });
      } catch {}
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [messages, user?.id]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const sendMessage = async (customMessage?: string) => {
    if (!isVerified) {
      toast({ title: 'Email not verified', description: 'Please verify your account in Settings to use the AI assistant.', variant: 'destructive' });
      return;
    }
    const messageToSend = customMessage || inputMessage.trim();
    if (!messageToSend || isLoading) return;

    setInputMessage('');
    setIsLoading(true);

    // Add user message to chat
    const newMessages = [...messages, { role: 'user' as const, content: messageToSend }];
    setMessages(newMessages);

    try {
      const { data, error } = await supabase.functions.invoke('groq-assistant', {
        body: {
          message: messageToSend,
          conversation: newMessages,
        },
      });

      if (error) throw error;

      // Add assistant response
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);
    } catch (error) {
      console.error('Error calling AI assistant:', error);
      // Add fallback response
      setMessages([...newMessages, {
        role: 'assistant',
        content: 'I apologize, but I\'m having trouble connecting right now. Try browsing our Popular and Trending sections for great movie recommendations!'
      }]);
      toast({
        title: "Connection Error",
        description: "Unable to reach AI assistant. Please try again.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  const clearChat = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear AI assistant storage', e);
    }
    setMessages(INITIAL_MESSAGES);
    if (user?.id) {
      try {
        await (supabase as any).from('assistant_conversations').delete().eq('user_id', user.id);
      } catch {}
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 h-14 w-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg z-50"
        size="icon"
        aria-label="Open AI Assistant"
      >
        <Bot size={24} />
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <Card className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-64 shadow-2xl border-primary/20 z-50">
        <CardHeader className="flex-row items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <Bot className="text-primary" size={20} />
            <CardTitle className="text-sm">AI Assistant</CardTitle>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(false)}
              className="h-8 w-8 p-0"
              aria-label="Maximize"
            >
              <Maximize2 size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0"
              aria-label="Close"
            >
              <X size={16} />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-80 md:w-96 h-[500px] shadow-2xl border-primary/20 z-50 flex flex-col">
      <CardHeader className="flex-row items-center justify-between py-3 border-b">
        <div className="flex items-center gap-2">
          <Bot className="text-primary" size={20} />
          <CardTitle className="text-lg">AI Movie Assistant</CardTitle>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(true)}
            className="h-8 w-8 p-0"
            aria-label="Minimize"
          >
            <Minimize2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
            className="h-8 w-8 p-0"
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8 p-0"
            aria-label="Close"
          >
            <X size={16} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {!isVerified && (
          <div className="px-4 py-2 bg-amber-50 text-amber-900 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock size={16} />
              <span className="text-xs">Verify your email to use the AI assistant.</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => navigate('/settings')}>
              Open Settings
            </Button>
          </div>
        )}
        <ScrollArea className="flex-1 p-4 overflow-y-auto" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isVerified ? "Ask about movies, actors, plots..." : "Verify your account to start chatting"}
              className="flex-1"
              disabled={isLoading || !isVerified}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!inputMessage.trim() || isLoading || !isVerified}
              size="icon"
              className="bg-primary hover:bg-primary/90"
              aria-label="Send message"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIAssistant;