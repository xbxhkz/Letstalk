/**
 * Recommender behaviour tests. Run with `npm test` (uses a copy of the seeded dev DB).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { rankForYou, watchSignal } from "../src/lib/recommend";

const anon = (id: string) => ({ userId: null, viewerKey: `anon:${id}` });
const byCaption = async (needle: string) => (await prisma.video.findFirstOrThrow({ where: { caption: { contains: needle } } })).id;
const watch = (viewerKey: string, videoId: string, frac: number, completions = 0) =>
  prisma.view.create({ data: { viewerKey, videoId, durationMs: 8000, watchMs: Math.round(8000 * Math.max(frac, completions)), completions } });

after(async () => {
  await prisma.view.deleteMany({ where: { viewerKey: { startsWith: "anon:test-" } } });
  await prisma.$disconnect();
});

test("watch signal: finishing and rewatching beats partial; instant swipe is negative", () => {
  assert.ok(watchSignal({ watchMs: 16000, durationMs: 8000, completions: 2 }) > watchSignal({ watchMs: 8000, durationMs: 8000, completions: 1 }));
  assert.ok(watchSignal({ watchMs: 8000, durationMs: 8000, completions: 1 }) > watchSignal({ watchMs: 6000, durationMs: 8000, completions: 0 }));
  assert.ok(watchSignal({ watchMs: 800, durationMs: 8000, completions: 0 }) < 0);
});

test("cold start: a brand-new viewer gets every video, ranked by general quality", async () => {
  const ranked = await rankForYou(anon("test-cold"), { limit: 50, seed: "x" });
  assert.equal(ranked.length, await prisma.video.count());
  assert.ok(ranked.every((r) => r.parts.personal === 0));
  const top = ranked[0].parts.general;
  assert.ok(ranked.every((r) => r.parts.general <= top + 1e-9), "highest general score first");
});

test("finishing #coding videos pulls more #coding to the top; skipped content sinks", async () => {
  const key = "anon:test-coder";
  const life = await byCaption("Game of Life"); // #coding #programming #math (devdan)
  const css = await byCaption("CSS filters"); // #coding #webdev #css (devdan)
  const sunset = await byCaption("Sunset color palette"); // #aesthetic #dance #satisfying
  const dough = await byCaption("dough"); // #cooking #recipe #satisfying

  await watch(key, life, 1, 3); // watched 3 times through
  await watch(key, sunset, 0.05); // swiped away immediately
  await watch(key, dough, 0.08);

  const ranked = await rankForYou({ userId: null, viewerKey: key }, { limit: 50, seed: "fixed" });
  const pos = (id: string) => ranked.findIndex((r) => r.id === id);
  assert.equal(ranked[0].id, css, "the other #coding video by the same creator leads");
  assert.ok(ranked[0].reasons.some((r) => r.includes("#coding")), `reasons: ${ranked[0].reasons}`);
  assert.ok(pos(sunset) > ranked.length / 2 && pos(dough) > ranked.length / 2, "skipped videos are in the bottom half");
  assert.ok(pos(life) > 0, "the finished video is not repeated first");
});

test("collaborative filtering: what similar viewers finished gets boosted", async () => {
  const travel = await byCaption("camera glitched"); // #travel #vlog #fyp
  const css = await byCaption("CSS filters");
  // Two viewers who loved the CSS video also finished the travel vlog.
  for (const n of ["test-n1", "test-n2"]) {
    await watch(`anon:${n}`, css, 1, 2);
    await watch(`anon:${n}`, travel, 1, 1);
  }
  const key = "anon:test-cf";
  await watch(key, css, 1, 2);
  const ranked = await rankForYou({ userId: null, viewerKey: key }, { limit: 50, seed: "fixed" });
  const t = ranked.find((r) => r.id === travel)!;
  assert.ok(t.parts.collab > 0.5, `collab score ${t.parts.collab}`);
  assert.ok(t.reasons.includes("liked by viewers with similar taste"));
});

test("exclude skips videos the client already has", async () => {
  const all = await rankForYou(anon("test-cold"), { limit: 50, seed: "x" });
  const rest = await rankForYou(anon("test-cold"), { limit: 50, seed: "x", exclude: new Set(all.slice(0, 3).map((r) => r.id)) });
  assert.equal(rest.length, all.length - 3);
  assert.ok(rest.every((r) => !all.slice(0, 3).some((a) => a.id === r.id)));
});
