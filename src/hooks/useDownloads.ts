import { useEffect, useMemo, useRef, useState } from "react";

// Simple IndexedDB wrapper
const DB_NAME = "cinemaease-downloads";
const DB_VERSION = 1;
const STORE_NAME = "downloads";

export type DownloadStatus = "idle" | "downloading" | "completed" | "locked";

export interface DownloadItem {
  id: string; // movie or series id (string)
  title: string;
  poster?: string | null;
  type: "movie" | "series";
  sourceUrl?: string | null; // direct link if available
  blob?: Blob | null; // stored binary
  progress: number; // 0..1
  status: DownloadStatus;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(): Promise<DownloadItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as DownloadItem[]);
    req.onerror = () => reject(req.error);
  });
}

async function getOne(id: string): Promise<DownloadItem | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as DownloadItem | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function putOne(item: DownloadItem): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function sevenDaysFromNow(): number {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.getTime();
}

export function useDownloads() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const all = await getAll();
      setItems(all);
    })();
  }, []);

  useEffect(() => {
    const onOnline = async () => {
      // Reactivate locked items when online
      const all = await getAll();
      const updated = await Promise.all(
        all.map(async (it) => {
          if (it.status === "locked") {
            it.status = "completed";
            it.expiresAt = sevenDaysFromNow();
            await putOne(it);
          }
          return it;
        })
      );
      setItems(updated);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const refresh = async () => {
    const all = await getAll();
    // Apply expiration
    const now = Date.now();
    for (const it of all) {
      if (it.status === "completed" && now > it.expiresAt) {
        it.status = "locked";
        await putOne(it);
      }
    }
    setItems(await getAll());
  };

  const getStatus = (id: string): DownloadItem | undefined =>
    items.find((x) => x.id === id);

  const startDownload = async (
    id: string,
    title: string,
    type: "movie" | "series",
    url?: string | null,
    poster?: string | null
  ) => {
    await refresh();

    let item: DownloadItem =
      (await getOne(id)) || {
        id,
        title,
        type,
        sourceUrl: url || null,
        poster: poster || null,
        blob: null,
        progress: 0,
        status: "idle",
        createdAt: Date.now(),
        expiresAt: sevenDaysFromNow(),
      };

    item.status = "downloading";
    item.progress = 0;
    await putOne(item);
    setItems(await getAll());

    if (!url) {
      // No direct URL: cannot download, leave as idle and return
      item.status = "idle";
      await putOne(item);
      setItems(await getAll());
      return { ok: false, reason: "no-url" } as const;
    }

    // Stream download with progress
    try {
      controllerRef.current?.abort();
      controllerRef.current = new AbortController();
      const res = await fetch(url, { signal: controllerRef.current.signal });
      if (!res.ok || !res.body) throw new Error("Failed to download");

      const contentLength = Number(res.headers.get("Content-Length")) || 0;
      const reader = res.body.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (contentLength > 0) {
            item.progress = received / contentLength;
            await putOne(item);
            setItems(await getAll());
          }
        }
      }

      const blob = new Blob(chunks, { type: res.headers.get("Content-Type") || "video/mp4" });
      item.blob = blob;
      item.status = "completed";
      item.progress = 1;
      item.expiresAt = sevenDaysFromNow();
      await putOne(item);
      setItems(await getAll());
      return { ok: true } as const;
    } catch (e) {
      item.status = "idle";
      await putOne(item);
      setItems(await getAll());
      return { ok: false, reason: "error" } as const;
    }
  };

  const getObjectUrl = async (id: string): Promise<string | null> => {
    const it = await getOne(id);
    if (!it || !it.blob) return null;
    return URL.createObjectURL(it.blob);
  };

  const getAlternativeSources = (title: string) => {
    const q = encodeURIComponent(title);
    return [
      { label: "Archive.org", url: `https://archive.org/search?media_type=movies&query=${q}` },
      { label: "YouTube", url: `https://www.youtube.com/results?search_query=${q}+full+movie` },
      { label: "PublicDomainMovie.net", url: `https://publicdomainmovie.net/?s=${q}` },
      { label: "Google", url: `https://www.google.com/search?q=${q}+download` }
    ];
  };

  const isOfflineAvailable = (id: string) => {
    const it = items.find((x) => x.id === id);
    return !navigator.onLine && it?.status === "completed";
  };

  return useMemo(
    () => ({ items, getStatus, startDownload, getObjectUrl, refresh, getAlternativeSources, isOfflineAvailable }),
    [items]
  );
}
