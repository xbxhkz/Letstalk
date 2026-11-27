/**
 * For You recommendation engine.
 *
 * 1. Interest profile — every video the viewer touched gets an engagement score from
 *    explicit signals (like, save, comment) and implicit watch signals (finished it,
 *    rewatched it, watched most of it, or swiped away in the first seconds). Scores
 *    decay with a 7-day half-life, so recent taste matters most. The scores are
 *    spread onto the video's hashtags, creator and sound, giving per-tag, per-creator
 *    and per-sound affinities. Following a creator adds creator affinity.
 *
 * 2. Collaborative filtering — viewers whose positive set (liked / saved / finished)
 *    overlaps the viewer's are "neighbours" (cosine similarity on those sets); videos
 *    they liked or finished get a boost proportional to how similar they are.
 *
 * 3. General quality — popularity (log of likes, saves, shares, comments), the global
 *    completion rate (Bayesian-smoothed share of views that were watched to the end)
 *    and freshness. This carries cold-start viewers and is blended out as the viewer's
 *    own signal grows.
 *
 * 4. Seen penalties — videos already finished, skipped or liked sink, so the feed keeps
 *    moving to new things, but can still come back around once everything is seen.
 *
 * 5. Re-ranking — a greedy pass avoids the same creator twice in a row and long runs of
 *    one hashtag, and ~15% of slots are given to an unseen video outside the viewer's
 *    usual taste (exploration), so the profile can discover new interests.
 */
import { prisma } from "./prisma";

const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 7;
const EXPLORE_RATE = 0.15;

export type Viewer = { userId: string | null; viewerKey: string | null };

export type ScoredVideo = {
  id: string;
  score: number;
  reasons: string[];
  parts: { personal: number; general: number; affinity: number; creator: number; sound: number; collab: number; popularity: number; completion: number; freshness: number; penalty: number };
};

type Candidate = {
  id: string;
  authorId: string;
  tags: string[];
  audio: string;
  createdAt: Date;
  likes: number;
  saves: number;
  shares: number;
  comments: number;
};

const decay = (at: Date, now: number) => Math.pow(0.5, (now - at.getTime()) / DAY / HALF_LIFE_DAYS);

/** Implicit signal from one viewing session. */
export function watchSignal(v: { watchMs: number; durationMs: number; completions: number }): number {
  const frac = v.durationMs > 0 ? Math.min(1, v.watchMs / v.durationMs) : 0;
  if (v.completions >= 1) return 2 + Math.min(v.completions - 1, 3) * 0.75; // finished, more for rewatches
  if (frac >= 0.75) return 1.2;
  if (frac >= 0.5) return 0.6;
  if (frac < 0.2 && v.watchMs < 3000) return -1.5; // swiped away almost immediately
  return 0;
}

/** Small deterministic PRNG so a given request is reproducible (seeded per viewer and minute). */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function normalize(m: Map<string, number>) {
  let max = 0;
  for (const v of m.values()) max = Math.max(max, Math.abs(v));
  if (max > 0) for (const [k, v] of m) m.set(k, v / max);
  return m;
}

export async function rankForYou(viewer: Viewer, opts: { exclude?: Set<string>; limit?: number; seed?: string } = {}): Promise<ScoredVideo[]> {
  const now = Date.now();
  const limit = opts.limit ?? 10;
  const keys = [viewer.viewerKey, viewer.userId].filter(Boolean) as string[];

  const videos = await prisma.video.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, authorId: true, hashtags: true, audioName: true, createdAt: true, baseLikes: true, baseSaves: true, shares: true, _count: { select: { likes: true, saves: true, comments: true } } },
  });
  const cands: Candidate[] = videos.map((v) => ({
    id: v.id,
    authorId: v.authorId,
    tags: v.hashtags ? v.hashtags.split(" ") : [],
    audio: v.audioName,
    createdAt: v.createdAt,
    likes: v.baseLikes + v._count.likes,
    saves: v.baseSaves + v._count.saves,
    shares: v.shares,
    comments: v._count.comments,
  }));
  const byId = new Map(cands.map((c) => [c.id, c]));

  // ---- 1. viewer engagement per video ------------------------------------------------------
  const [myViews, myLikes, mySaves, myComments, myFollows] = await Promise.all([
    keys.length ? prisma.view.findMany({ where: { viewerKey: { in: keys } }, orderBy: { createdAt: "desc" }, take: 1000 }) : [],
    viewer.userId ? prisma.like.findMany({ where: { userId: viewer.userId }, select: { videoId: true, createdAt: true } }) : [],
    viewer.userId ? prisma.save.findMany({ where: { userId: viewer.userId }, select: { videoId: true, createdAt: true } }) : [],
    viewer.userId ? prisma.comment.findMany({ where: { userId: viewer.userId }, select: { videoId: true, createdAt: true } }) : [],
    viewer.userId ? prisma.follow.findMany({ where: { followerId: viewer.userId }, select: { followingId: true } }) : [],
  ]);

  const engagement = new Map<string, number>();
  const add = (id: string, w: number) => engagement.set(id, (engagement.get(id) ?? 0) + w);
  for (const l of myLikes) add(l.videoId, 3 * decay(l.createdAt, now));
  for (const s of mySaves) add(s.videoId, 4 * decay(s.createdAt, now));
  for (const c of myComments) add(c.videoId, 2 * decay(c.createdAt, now));

  const seen = new Map<string, { completed: boolean; skipped: boolean }>();
  for (const v of myViews) {
    add(v.videoId, watchSignal(v) * decay(v.createdAt, now));
    const s = seen.get(v.videoId) ?? { completed: false, skipped: true };
    s.completed ||= v.completions > 0;
    s.skipped &&= watchSignal(v) < 0;
    seen.set(v.videoId, s);
  }
  const liked = new Set(myLikes.map((l) => l.videoId));

  // ---- interest profile ----------------------------------------------------------------------
  const tagW = new Map<string, number>();
  const creatorW = new Map<string, number>();
  const soundW = new Map<string, number>();
  let signal = 0;
  for (const [id, e] of engagement) {
    const c = byId.get(id);
    if (!c) continue;
    signal += Math.abs(e);
    const per = e / Math.sqrt(Math.max(1, c.tags.length));
    for (const t of c.tags) tagW.set(t, (tagW.get(t) ?? 0) + per);
    creatorW.set(c.authorId, (creatorW.get(c.authorId) ?? 0) + e * 0.7);
    soundW.set(c.audio, (soundW.get(c.audio) ?? 0) + e * 0.5);
  }
  for (const f of myFollows) creatorW.set(f.followingId, (creatorW.get(f.followingId) ?? 0) + 3);
  normalize(tagW);
  normalize(creatorW);
  normalize(soundW);
  // How much to trust the personal profile: 0 for a brand-new viewer, 1 after ~12 points of signal.
  const k = Math.min(1, (signal + myFollows.length) / 12);

  // ---- 2. collaborative filtering ------------------------------------------------------------
  const mine = new Set([...engagement].filter(([, e]) => e >= 1).map(([id]) => id));
  const collab = new Map<string, number>();
  if (mine.size) {
    const [likes, saves, done] = await Promise.all([
      prisma.like.findMany({ select: { userId: true, videoId: true }, take: 20000 }),
      prisma.save.findMany({ select: { userId: true, videoId: true }, take: 20000 }),
      prisma.view.findMany({ where: { completions: { gt: 0 } }, select: { viewerKey: true, videoId: true }, take: 20000 }),
    ]);
    const positives = new Map<string, Set<string>>();
    const put = (who: string, vid: string) => {
      if (keys.includes(who)) return;
      if (!positives.has(who)) positives.set(who, new Set());
      positives.get(who)!.add(vid);
    };
    for (const l of likes) put(l.userId, l.videoId);
    for (const s of saves) put(s.userId, s.videoId);
    for (const d of done) put(d.viewerKey, d.videoId);
    for (const set of positives.values()) {
      let overlap = 0;
      for (const id of set) if (mine.has(id)) overlap++;
      if (!overlap) continue;
      const sim = overlap / Math.sqrt(mine.size * set.size);
      for (const id of set) if (!mine.has(id)) collab.set(id, (collab.get(id) ?? 0) + sim);
    }
    normalize(collab);
  }

  // ---- 3. general quality --------------------------------------------------------------------
  const viewStats = await prisma.view.groupBy({ by: ["videoId"], _count: { _all: true }, where: { completions: { gt: 0 } } });
  const viewTotals = await prisma.view.groupBy({ by: ["videoId"], _count: { _all: true } });
  const completedCount = new Map(viewStats.map((s) => [s.videoId, s._count._all]));
  const totalCount = new Map(viewTotals.map((s) => [s.videoId, s._count._all]));
  const popRaw = new Map(cands.map((c) => [c.id, Math.log10(1 + c.likes + 2 * c.saves + 3 * c.shares + 2 * c.comments)]));
  normalize(popRaw);

  // ---- score ---------------------------------------------------------------------------------
  const scored: (ScoredVideo & { c: Candidate; unseen: boolean })[] = cands
    .filter((c) => !opts.exclude?.has(c.id))
    .map((c) => {
      const affinity = c.tags.length ? Math.max(-1, Math.min(1, c.tags.reduce((s, t) => s + (tagW.get(t) ?? 0), 0) / Math.sqrt(c.tags.length))) : 0;
      const creator = creatorW.get(c.authorId) ?? 0;
      const sound = soundW.get(c.audio) ?? 0;
      const cf = collab.get(c.id) ?? 0;
      const popularity = popRaw.get(c.id) ?? 0;
      const completion = ((completedCount.get(c.id) ?? 0) + 1) / ((totalCount.get(c.id) ?? 0) + 2); // Beta(1,1) prior
      const freshness = Math.pow(0.5, (now - c.createdAt.getTime()) / DAY / 3);
      const personal = 0.5 * affinity + 0.25 * creator + 0.1 * sound + 0.35 * cf;
      const general = 0.55 * popularity + 0.3 * completion + 0.15 * freshness;

      const s = seen.get(c.id);
      let penalty = 1;
      if (s?.completed) penalty = 0.25;
      else if (s?.skipped) penalty = 0.35;
      else if (s) penalty = 0.6;
      if (liked.has(c.id)) penalty = Math.min(penalty, 0.3);
      if (viewer.userId && c.authorId === viewer.userId) penalty *= 0.3;

      const score = ((1 - k) * general + k * (0.7 * personal + 0.3 * general)) * penalty;
      const reasons: string[] = [];
      const topTag = c.tags.map((t) => [t, tagW.get(t) ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
      if (topTag && topTag[1] > 0.3) reasons.push(`you engage with #${topTag[0]}`);
      if (creator > 0.3) reasons.push("creator you like or follow");
      if (sound > 0.4) reasons.push("sound you've enjoyed");
      if (cf > 0.3) reasons.push("liked by viewers with similar taste");
      if (affinity < -0.3) reasons.push("similar to videos you skipped");
      if (k < 0.5 && popularity > 0.6) reasons.push("popular right now");
      if (s?.completed) reasons.push("already watched");
      return {
        id: c.id,
        c,
        unseen: !s,
        score,
        reasons,
        parts: { personal, general, affinity, creator, sound, collab: cf, popularity, completion, freshness, penalty },
      };
    });

  // ---- 5. diversity re-rank + exploration ----------------------------------------------------
  const random = rng(opts.seed ?? `${viewer.viewerKey ?? "anon"}:${Math.floor(now / 60000)}`);
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const out: typeof scored = [];
  while (pool.length && out.length < limit) {
    const prev = out[out.length - 1];
    const recentTags = new Set(out.slice(-2).flatMap((o) => o.c.tags));
    // Explore: occasionally take an unseen video from the lower half instead of the best one.
    if (k > 0.3 && random() < EXPLORE_RATE) {
      const lower = pool.slice(Math.ceil(pool.length / 2)).filter((p) => p.unseen);
      if (lower.length) {
        const pick = lower[Math.floor(random() * lower.length)];
        pool.splice(pool.indexOf(pick), 1);
        out.push({ ...pick, reasons: [...pick.reasons, "exploring something new"] });
        continue;
      }
    }
    let best = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 12); i++) {
      const p = pool[i];
      const overlap = p.c.tags.filter((t) => recentTags.has(t)).length / Math.max(1, p.c.tags.length);
      const val = p.score - (prev && prev.c.authorId === p.c.authorId ? 0.15 : 0) - 0.08 * overlap;
      if (val > bestVal) { bestVal = val; best = i; }
    }
    out.push(pool.splice(best, 1)[0]);
  }
  return out.map(({ c: _c, unseen: _u, ...rest }) => rest);
}
