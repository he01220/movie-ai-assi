import { supabase } from '@/integrations/supabase/client';

export type HistoryEvent = {
  type: 'movie_open' | 'trailer_play' | 'external_search' | 'query';
  ts: number;
  movieId?: number;
  title?: string;
  genres?: number[];
  query?: string;
};

export type HistoryState = {
  events: HistoryEvent[];
  // quick aggregates
  seenMovieIds: Record<string, number>; // movieId -> last ts
  queryCounts: Record<string, number>;
  externalSearchCount: number;
};

const KEY = 'cinepulse_history_v1';
const TABLE = 'user_activity';

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

export const readHistory = (): HistoryState => {
  const state = safeParse<HistoryState>(localStorage.getItem(KEY), {
    events: [],
    seenMovieIds: {},
    queryCounts: {},
    externalSearchCount: 0,
  });
  // guard shape
  return {
    events: Array.isArray(state.events) ? state.events : [],
    seenMovieIds: state.seenMovieIds || {},
    queryCounts: state.queryCounts || {},
    externalSearchCount: typeof state.externalSearchCount === 'number' ? state.externalSearchCount : 0,
  };
};

const writeHistory = (state: HistoryState) => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
};

export const setHistory = (state: HistoryState) => {
  writeHistory(state);
};

const clampEvents = (events: HistoryEvent[], max = 500) => {
  if (events.length <= max) return events;
  return events.slice(events.length - max);
};

const getCurrentUserId = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  } catch {
    return null;
  }
};

const persistToSupabase = async (evt: HistoryEvent) => {
  const userId = await getCurrentUserId();
  if (!userId) return;
  try {
    await (supabase as any).from(TABLE).insert({
      user_id: userId,
      type: evt.type,
      ts: new Date(evt.ts).toISOString(),
      movie_id: evt.movieId ?? null,
      title: evt.title ?? null,
      genres: evt.genres ?? null,
      query: evt.query ?? null,
    });
  } catch {}
};

const upsert = (evt: HistoryEvent) => {
  const s = readHistory();
  const events = clampEvents([...s.events, evt]);
  const seenMovieIds = { ...s.seenMovieIds };
  if (evt.movieId != null) {
    seenMovieIds[String(evt.movieId)] = evt.ts;
  }
  const queryCounts = { ...s.queryCounts };
  if (evt.type === 'query' && evt.query) {
    const key = evt.query.trim().toLowerCase();
    queryCounts[key] = (queryCounts[key] || 0) + 1;
  }
  const externalSearchCount = s.externalSearchCount + (evt.type === 'external_search' ? 1 : 0);
  writeHistory({ events, seenMovieIds, queryCounts, externalSearchCount });
  // Fire-and-forget remote persist for signed-in users
  try { void persistToSupabase(evt); } catch {}
};

export const logMovieOpen = (movieId: number, title?: string, genres?: number[]) => {
  upsert({ type: 'movie_open', ts: Date.now(), movieId, title, genres });
};

export const logTrailerPlay = (movieId: number, title?: string, genres?: number[]) => {
  upsert({ type: 'trailer_play', ts: Date.now(), movieId, title, genres });
};

export const logExternalSearch = (title?: string, movieId?: number) => {
  upsert({ type: 'external_search', ts: Date.now(), title, movieId });
};

export const logQuery = (query: string) => {
  if (!query?.trim()) return;
  upsert({ type: 'query', ts: Date.now(), query: query.trim() });
};

export const clearAllHistory = async () => {
  try { localStorage.removeItem(KEY); } catch {}
  try {
    const userId = await getCurrentUserId();
    if (userId) {
      await (supabase as any).from(TABLE).delete().eq('user_id', userId);
    }
  } catch {}
  try { window.dispatchEvent(new Event('cinepulse_history_changed')); } catch {}
};

export const deleteEventAt = (index: number) => {
  const s = readHistory();
  if (index < 0 || index >= s.events.length) return;
  const events = [...s.events.slice(0, index), ...s.events.slice(index + 1)];
  const seenMovieIds = { ...s.seenMovieIds };
  const queryCounts = { ...s.queryCounts };
  const removed = s.events[index];
  if (removed?.movieId != null) {
    const lastTs = Math.max(
      0,
      ...events.filter(e => e.movieId === removed.movieId).map(e => e.ts)
    );
    if (lastTs > 0) {
      seenMovieIds[String(removed.movieId)] = lastTs;
    } else {
      delete seenMovieIds[String(removed.movieId)];
    }
  }
  if (removed?.type === 'query' && removed.query) {
    const key = removed.query.trim().toLowerCase();
    const c = (queryCounts[key] || 1) - 1;
    if (c > 0) queryCounts[key] = c; else delete queryCounts[key];
  }
  const externalSearchCount = s.externalSearchCount - (removed?.type === 'external_search' ? 1 : 0);
  writeHistory({ events, seenMovieIds, queryCounts, externalSearchCount: Math.max(0, externalSearchCount) });
};

export const deleteEventsWhere = (predicate: (e: HistoryEvent) => boolean) => {
  const s = readHistory();
  const events = s.events.filter(e => !predicate(e));
  const seenMovieIds: Record<string, number> = {};
  const queryCounts: Record<string, number> = {};
  let externalSearchCount = 0;
  for (const e of events) {
    if (e.movieId != null) seenMovieIds[String(e.movieId)] = Math.max(seenMovieIds[String(e.movieId)] || 0, e.ts);
    if (e.type === 'query' && e.query) {
      const k = e.query.trim().toLowerCase();
      queryCounts[k] = (queryCounts[k] || 0) + 1;
    }
    if (e.type === 'external_search') externalSearchCount += 1;
  }
  writeHistory({ events, seenMovieIds, queryCounts, externalSearchCount });
};

export const getTopGenresFromHistory = (fallback: number[] = []) => {
  // Count inferred genres if present on events
  const { events } = readHistory();
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.genres && e.genres.length) {
      for (const g of e.genres) counts[String(g)] = (counts[String(g)] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g]) => Number(g));
  return sorted.length ? sorted : fallback;
};

// Fetch full activity from Supabase for the current user and hydrate local cache
export const hydrateHistoryFromSupabase = async () => {
  const userId = await getCurrentUserId();
  if (!userId) return;
  try {
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select('type, ts, movie_id, title, genres, query')
      .eq('user_id', userId)
      .order('ts', { ascending: true });
    if (error || !data) return;
    const events: HistoryEvent[] = data.map((r: any) => ({
      type: r.type,
      ts: typeof r.ts === 'string' ? Date.parse(r.ts) : Number(r.ts) || Date.now(),
      movieId: r.movie_id ?? undefined,
      title: r.title ?? undefined,
      genres: r.genres ?? undefined,
      query: r.query ?? undefined,
    }));
    // Recompute aggregates and write
    const seenMovieIds: Record<string, number> = {};
    const queryCounts: Record<string, number> = {};
    let externalSearchCount = 0;
    for (const e of events) {
      if (e.movieId != null) seenMovieIds[String(e.movieId)] = e.ts;
      if (e.type === 'query' && e.query) {
        const k = e.query.trim().toLowerCase();
        queryCounts[k] = (queryCounts[k] || 0) + 1;
      }
      if (e.type === 'external_search') externalSearchCount += 1;
    }
    writeHistory({ events, seenMovieIds, queryCounts, externalSearchCount });
    try { window.dispatchEvent(new Event('cinepulse_history_changed')); } catch {}
  } catch {}
};
