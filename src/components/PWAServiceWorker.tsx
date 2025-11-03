import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const PWAServiceWorker = () => {
  const { toast } = useToast();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      console.log('Service Worker registered successfully:', registration);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available
              toast({
                title: "App Updated",
                description: "A new version is available. Refresh to update.",
                action: (
                  <button 
                    onClick={() => window.location.reload()}
                    className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm"
                  >
                    Refresh
                  </button>
                ),
                duration: 10000,
              });
            }
          });
        }
      });

    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  return null; // This component doesn't render anything
};

export default PWAServiceWorker;