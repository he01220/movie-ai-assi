// CineFlix Enhanced Service Worker for PWA offline functionality

const CACHE_NAME = 'cineflix-v2';
const STATIC_CACHE = 'cineflix-static-v2';
const API_CACHE = 'cineflix-api-v2';
const IMAGE_CACHE = 'cineflix-images-v2';
const VIDEO_CACHE = 'cineflix-videos-v2';

// Core app files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/create-logo-for-movie-CineFlix-format-svg_1.svg'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/movies',
  '/api/trending',
  '/api/popular'
];

// Install event - cache critical resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(API_CACHE),
      caches.open(IMAGE_CACHE),
      caches.open(VIDEO_CACHE)
    ]).then(() => {
      console.log('Core caches created');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== API_CACHE && 
                cacheName !== IMAGE_CACHE && 
                cacheName !== VIDEO_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Handle different types of requests
  if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else if (isAPIRequest(request)) {
    event.respondWith(handleAPIRequest(request));
  } else if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
  } else if (isVideoRequest(request)) {
    event.respondWith(handleVideoRequest(request));
  } else {
    event.respondWith(handleOtherRequest(request));
  }
});

// Handle static assets (Cache First strategy)
async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Static asset fetch failed:', error);
    // Return offline page if available
    return cache.match('/') || new Response('Offline', { status: 503 });
  }
}

// Handle API requests (Network First with cache fallback)
async function handleAPIRequest(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache successful responses
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('API request failed, checking cache:', error);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Return offline indicator
    return new Response(JSON.stringify({
      error: 'offline',
      message: 'You are offline. Some content may not be available.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle images (Cache First with network fallback)
async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Only cache smaller images to save space
      const contentLength = response.headers.get('content-length');
      if (!contentLength || parseInt(contentLength) < 1024 * 1024) { // 1MB limit
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch (error) {
    console.log('Image fetch failed:', error);
    // Return placeholder image or cached fallback
    return cache.match('/placeholder.svg') || new Response('', { status: 404 });
  }
}

// Handle video requests (Network Only with selective caching)
async function handleVideoRequest(request) {
  const cache = await caches.open(VIDEO_CACHE);
  
  // Check if it's a small video file or thumbnail
  if (request.url.includes('thumbnail') || request.url.includes('preview')) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
  }
  
  try {
    const response = await fetch(request);
    
    // Cache thumbnails and small videos
    if (response.ok && (request.url.includes('thumbnail') || request.url.includes('preview'))) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('Video fetch failed:', error);
    const cached = await cache.match(request);
    return cached || new Response('Video unavailable offline', { status: 503 });
  }
}

// Handle other requests (Network First)
async function handleOtherRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.log('Request failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Utility functions
function isStaticAsset(request) {
  return request.method === 'GET' && (
    request.url.includes('/static/') ||
    request.url.includes('/assets/') ||
    request.url.endsWith('.js') ||
    request.url.endsWith('.css') ||
    request.url.endsWith('.html') ||
    request.url.endsWith('/') ||
    request.url.includes('manifest.json')
  );
}

function isAPIRequest(request) {
  return request.method === 'GET' && (
    request.url.includes('/api/') ||
    request.url.includes('supabase.co') ||
    request.url.includes('themoviedb.org')
  );
}

function isImageRequest(request) {
  return request.method === 'GET' && (
    request.url.includes('.jpg') ||
    request.url.includes('.jpeg') ||
    request.url.includes('.png') ||
    request.url.includes('.gif') ||
    request.url.includes('.webp') ||
    request.url.includes('.svg') ||
    request.url.includes('image.tmdb.org')
  );
}

function isVideoRequest(request) {
  return request.method === 'GET' && (
    request.url.includes('.mp4') ||
    request.url.includes('.webm') ||
    request.url.includes('.mov') ||
    request.url.includes('video') ||
    request.url.includes('.m3u8')
  );
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions());
  }
});

async function syncOfflineActions() {
  try {
    // This would integrate with the OfflineSyncManager
    // to sync pending actions when back online
    console.log('Syncing offline actions...');
    
    // Send message to all clients to trigger sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'SYNC_OFFLINE_ACTIONS' });
    });
  } catch (error) {
    console.error('Failed to sync offline actions:', error);
  }
}

// Handle push notifications (for future features)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/create-logo-for-movie-CineFlix-format-svg_1.svg',
      badge: '/create-logo-for-movie-CineFlix-format-svg_1.svg',
      data: data.data || {}
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

console.log('CineFlix Service Worker loaded');