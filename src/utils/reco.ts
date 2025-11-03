import type { HistoryState } from './history';

export type Candidate = {
  id: number;
  title: string;
  genre_ids?: number[];
  vote_average?: number;
  popularity?: number;
};

const jaccard = (a: number[] = [], b: number[] = []) => {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...a, ...b]).size || 1;
  return inter / uni;
};

export const rankCandidates = (cands: Candidate[], history: HistoryState) => {
  const seen = history.seenMovieIds || {};
  const topQueries = Object.entries(history.queryCounts || {})
    .sort((a,b) => b[1]-a[1])
    .slice(0, 5)
    .map(([q]) => q);

  // genre preferences from events
  const genreCounts: Record<string, number> = {};
  for (const e of history.events) {
    if (e.genres) for (const g of e.genres) genreCounts[String(g)] = (genreCounts[String(g)] || 0) + 1;
  }
  const totalGenre = Object.values(genreCounts).reduce((a,b)=>a+b,0) || 1;

  // Exploration: punish overconsumed genres, boost underexplored high-quality
  const genreWeight = (gids: number[] = []) => {
    if (!gids.length) return 0.1; // unknown genres small base
    let w = 0;
    for (const g of gids) {
      const c = genreCounts[String(g)] || 0;
      const freq = c / totalGenre;
      // Encourage diversity: use 1 - freq but keep floor
      w += Math.max(0.15, 1 - freq);
    }
    return w / gids.length;
  };

  const timeNow = Date.now();

  const scored = cands.map((m) => {
    const base = (m.vote_average || 0) * 0.4 + (Math.log((m.popularity || 1) + 1)) * 0.15;
    const novelty = genreWeight(m.genre_ids);
    const seenPenalty = seen[String(m.id)] ? Math.max(0.2, 1 - (timeNow - seen[String(m.id)]) / (14*24*3600*1000)) : 0; // penalize items seen recently (2 weeks decay)

    const queryBoost = topQueries.some(q => m.title?.toLowerCase().includes(q)) ? 0.2 : 0;

    // Similarity to last 10 items but with repulsion to avoid loops
    const last = history.events.slice(-10);
    const sim = last.reduce((acc, e) => acc + jaccard(m.genre_ids, e.genres || []), 0) / Math.max(1, last.length);
    const diversity = 0.25 * (1 - sim);

    const score = base + novelty + diversity + queryBoost - 0.5 * seenPenalty;
    return { m, score };
  });

  return scored
    .sort((a,b) => b.score - a.score)
    .map(({ m }) => m);
};
