import { useState, useRef, useEffect, useMemo } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, Lightbulb, Minimize2, Maximize2, Trash2, Lock, Mic, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
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
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          recognitionRef.current = new SpeechRecognition();
          if (recognitionRef.current) {
            // Set basic properties
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';

            // Set up event handlers
            recognitionRef.current.onresult = (event: any) => {
              const transcript = event.results[0][0].transcript;
              if (transcript) {
                setInputMessage(transcript);
                sendMessage(transcript);
              }
            };

            recognitionRef.current.onerror = (event: any) => {
              console.error('Speech recognition error', event);
              const errorMessage = event.error === 'not-allowed' 
                ? 'Microphone access was denied. Please allow microphone access in your browser settings.'
                : 'Could not process voice input. Please try again.';
              
              toast({
                title: 'Voice input error',
                description: errorMessage,
                variant: 'destructive',
              });
              setIsRecording(false);
            };

            recognitionRef.current.onend = () => {
              setIsRecording(false);
            };
          }
        } catch (error) {
          console.error('Error initializing speech recognition:', error);
          toast({
            title: 'Error',
            description: 'Failed to initialize voice input',
            variant: 'destructive',
          });
        }
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error('Error stopping speech recognition:', error);
        }
      }
    };
  }, [toast]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, or WebP image.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingImage(true);
    
    try {
      // Create a preview URL for the image
      const imageUrl = URL.createObjectURL(file);
      
      // Add the image to the chat
      const newMessages = [
        ...messages, 
        { 
          role: 'user' as const, 
          content: `[Image: ${file.name}]`, 
          imageUrl 
        }
      ];
      setMessages(newMessages);

      // In a real app, you would upload the image to your server here
      // For now, we'll just send a message about the image
      await sendMessage(`I've uploaded an image: ${file.name}. Can you help me find similar movies?`);
      
    } catch (error) {
      console.error('Error processing image:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not process the image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      toast({
        title: 'Voice input not supported',
        description: 'Your browser does not support voice input.',
        variant: 'destructive',
      });
      return;
    }

    if (isRecording) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
      setIsRecording(false);
    } else {
      try {
        setInputMessage('Listening...');
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        toast({
          title: 'Voice input error',
          description: 'Could not start voice recognition. Please try again.',
          variant: 'destructive',
        });
        setIsRecording(false);
        setInputMessage('');
      }
    }
  };

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
                className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {message.imageUrl && (
                  <div className="max-w-[80%] mb-1 rounded-lg overflow-hidden">
                    <img 
                      src={message.imageUrl} 
                      alt="Uploaded content"
                      className="max-h-40 w-auto rounded-lg object-cover"
                      onLoad={(e) => {
                        // Revoke the object URL to free up memory
                        URL.revokeObjectURL(message.imageUrl!);
                      }}
                    />
                  </div>
                )}
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
            <div className="relative flex-1">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isVerified ? "Ask about movies, actors, plots..." : "Verify your account to start chatting"}
                className="pr-24"
                disabled={isLoading || !isVerified}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || !isVerified || isUploadingImage}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Upload image"
                  title="Upload image"
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon size={16} />
                  )}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isUploadingImage}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleVoiceInput}
                  disabled={isLoading || !isVerified || isRecording}
                  className={`h-8 w-8 p-0 ${isRecording ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                  title={isRecording ? 'Stop recording' : 'Start voice input'}
                >
                  <Mic size={16} className={isRecording ? 'animate-pulse' : ''} />
                </Button>
              </div>
            </div>
            <Button
              onClick={() => sendMessage()}
              disabled={!inputMessage.trim() || isLoading || !isVerified || isRecording}
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