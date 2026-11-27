import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const SEED_DIR = path.join(process.cwd(), "public", "uploads", "seed");

function avatarSvg(initial: string, a: string, b: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><text x="64" y="84" font-family="Arial,Helvetica,sans-serif" font-size="60" font-weight="700" text-anchor="middle" fill="#fff">${initial}</text></svg>`;
}

const users = [
  { username: "maya.moves", displayName: "Maya Chen", bio: "Dancer 💃 | Choreo every Friday | LA", colors: ["#fe2c55", "#ff9a3c"] },
  { username: "chef_leo", displayName: "Leo Martins", bio: "60-second recipes 🍳 Home cook, not a chef (yet)", colors: ["#25f4ee", "#2563eb"] },
  { username: "nomad.nina", displayName: "Nina Okafor", bio: "Travel • Film • Coffee ☕ 32 countries and counting", colors: ["#a855f7", "#ec4899"] },
  { username: "devdan", displayName: "Dan Kowalski", bio: "I explain code in under a minute 🧑‍💻", colors: ["#22c55e", "#0ea5e9"] },
];

const videos = [
  { n: 1, author: "maya.moves", caption: "Infinite zoom energy for this new routine 🌀 who's trying it? #dance #choreography #fyp", audio: "Fractal Groove — Maya Chen (original sound)", baseLikes: 12400, baseSaves: 830, shares: 214, views: 98000 },
  { n: 2, author: "devdan", caption: "Conway's Game of Life in 8 seconds. Four rules, infinite chaos 🤯 #coding #programming #math", audio: "original sound — devdan", baseLikes: 48200, baseSaves: 5100, shares: 1320, views: 410000 },
  { n: 3, author: "chef_leo", caption: "When the dough finally hits the right pattern 😮‍💨 full recipe in bio #cooking #recipe #satisfying", audio: "Kitchen Lo-fi — Beats To Cook To", baseLikes: 3150, baseSaves: 920, shares: 88, views: 27000 },
  { n: 4, author: "nomad.nina", caption: "POV: your camera glitched on the best day of the trip 📸 still my favourite clip #travel #vlog #fyp", audio: "Golden Hour — Nina Okafor", baseLikes: 7800, baseSaves: 410, shares: 156, views: 61000 },
  { n: 5, author: "maya.moves", caption: "Sunset color palette for tomorrow's set 🌅 calm before the chaos #aesthetic #dance #satisfying", audio: "Slow Drift — Ambient Collective", baseLikes: 950, baseSaves: 77, shares: 12, views: 8400 },
  { n: 6, author: "devdan", caption: "CSS filters can do THIS?? hue-rotate + blur, zero JS #coding #webdev #css", audio: "original sound — devdan", baseLikes: 22600, baseSaves: 3900, shares: 640, views: 187000 },
];

const comments: Record<number, [string, string][]> = {
  1: [["chef_leo", "the transition at 0:04 😳"], ["nomad.nina", "Teach me this pleaseee"], ["devdan", "This is literally a Mandelbrot set and I love it"]],
  2: [["maya.moves", "I watched this 10 times"], ["chef_leo", "explain like I'm five?"], ["nomad.nina", "this is so satisfying"], ["devdan", "Part 2: gliders 🚀 coming tomorrow"]],
  3: [["maya.moves", "recipe drop when??"], ["devdan", "rule 110 bread is crazy"]],
  4: [["maya.moves", "the colors!!! 😍"], ["chef_leo", "where is this?"], ["nomad.nina", "Lisbon! Full vlog on Sunday"]],
  5: [["nomad.nina", "so calming"], ["devdan", "this is my new wallpaper"]],
  6: [["maya.moves", "wait no JavaScript at all?"], ["devdan", "nope, pure CSS 😎"], ["chef_leo", "saving this for later"]],
};

async function main() {
  await prisma.view.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.save.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.video.deleteMany();
  await prisma.user.deleteMany();

  fs.mkdirSync(SEED_DIR, { recursive: true });
  const passwordHash = await bcrypt.hash("password123", 10);
  const byName: Record<string, string> = {};

  for (const u of users) {
    const file = `avatar-${u.username.replace(/[^a-z0-9]/gi, "")}.svg`;
    fs.writeFileSync(path.join(SEED_DIR, file), avatarSvg(u.displayName[0], u.colors[0], u.colors[1]));
    const created = await prisma.user.create({
      data: { username: u.username, displayName: u.displayName, bio: u.bio, passwordHash, avatarUrl: `/uploads/seed/${file}` },
    });
    byName[u.username] = created.id;
  }

  const now = Date.now();
  const videoIds: Record<number, string> = {};
  for (const v of videos) {
    const tags = Array.from(new Set((v.caption.match(/#(\w+)/g) ?? []).map((t) => t.slice(1).toLowerCase())));
    const created = await prisma.video.create({
      data: {
        url: `/uploads/seed/video${v.n}.mp4`,
        thumbnailUrl: `/uploads/seed/thumb${v.n}.jpg`,
        caption: v.caption,
        hashtags: tags.join(" "),
        audioName: v.audio,
        baseLikes: v.baseLikes,
        baseSaves: v.baseSaves,
        shares: v.shares,
        views: v.views,
        authorId: byName[v.author],
        createdAt: new Date(now - v.n * 1000 * 60 * 60 * 7),
      },
    });
    videoIds[v.n] = created.id;
  }

  // social graph
  const follows: [string, string][] = [
    ["maya.moves", "devdan"], ["maya.moves", "nomad.nina"], ["chef_leo", "maya.moves"], ["chef_leo", "devdan"],
    ["nomad.nina", "maya.moves"], ["devdan", "chef_leo"], ["devdan", "maya.moves"],
  ];
  for (const [a, b] of follows) await prisma.follow.create({ data: { followerId: byName[a], followingId: byName[b] } });

  // real likes and saves
  const likes: [string, number][] = [
    ["chef_leo", 1], ["devdan", 1], ["nomad.nina", 1], ["maya.moves", 2], ["chef_leo", 2], ["nomad.nina", 2],
    ["maya.moves", 3], ["devdan", 4], ["maya.moves", 4], ["nomad.nina", 5], ["maya.moves", 6], ["chef_leo", 6],
  ];
  for (const [u, n] of likes) await prisma.like.create({ data: { userId: byName[u], videoId: videoIds[n] } });
  for (const [u, n] of [["chef_leo", 6], ["maya.moves", 2], ["nomad.nina", 3]] as [string, number][])
    await prisma.save.create({ data: { userId: byName[u], videoId: videoIds[n] } });

  for (const [n, list] of Object.entries(comments)) {
    let i = 0;
    for (const [u, text] of list) {
      const c = await prisma.comment.create({
        data: { text, userId: byName[u], videoId: videoIds[Number(n)], createdAt: new Date(now - (list.length - i) * 1000 * 60 * 60 * 3) },
      });
      if (i === 0) await prisma.commentLike.create({ data: { userId: byName[list[list.length - 1][0]], commentId: c.id } });
      i++;
    }
  }

  // Watch history: each like came with a full watch; plus some quick skips and partial views.
  const H = 60 * 60 * 1000;
  const view = (u: string, n: number, frac: number, completions: number, hoursAgo: number) =>
    prisma.view.create({ data: { viewerKey: byName[u], userId: byName[u], videoId: videoIds[n], durationMs: 8000, watchMs: Math.round(8000 * frac + completions * 8000 * (completions > 1 ? 1 : 0)), completions, createdAt: new Date(now - hoursAgo * H) } });
  for (const [u, n] of likes) await view(u, n, 1, 1, 10);
  const extraViews: [string, number, number, number, number][] = [
    ["devdan", 6, 1, 3, 5], ["devdan", 2, 1, 2, 4], ["devdan", 5, 0.1, 0, 3], ["chef_leo", 4, 0.9, 0, 6],
    ["chef_leo", 5, 0.12, 0, 2], ["nomad.nina", 1, 1, 2, 3], ["nomad.nina", 6, 0.15, 0, 1], ["maya.moves", 1, 0.8, 0, 8],
  ];
  for (const v of extraViews) await view(...v);

  // Direct messages
  const dm = (from: string, to: string, text: string, minutesAgo: number, read: boolean, video?: number) =>
    prisma.message.create({
      data: { senderId: byName[from], recipientId: byName[to], text, videoId: video ? videoIds[video] : null, createdAt: new Date(now - minutesAgo * 60000), readAt: read ? new Date(now - (minutesAgo - 1) * 60000) : null },
    });
  await dm("devdan", "maya.moves", "", 190, true, 2);
  await dm("devdan", "maya.moves", "this one's for you, you'd love the patterns", 189, true);
  await dm("maya.moves", "devdan", "omg turning this into choreo 😂", 120, true);
  await dm("devdan", "maya.moves", "do it, I'll write the music in CSS", 45, false);
  await dm("chef_leo", "maya.moves", "Are you free to collab on a cooking-dance video? 🍳💃", 30, false);
  await dm("nomad.nina", "chef_leo", "", 300, true, 3);
  await dm("nomad.nina", "chef_leo", "need this recipe for my Lisbon trip", 299, false);

  // System notifications
  for (const u of users) {
    await prisma.notice.create({ data: { userId: byName[u.username], title: "Welcome to Letstalk 👋", body: "Your For You feed learns from what you like and what you watch to the end. Follow creators and tap + to post your first video.", link: "/", createdAt: new Date(now - 72 * H), readAt: new Date(now - 70 * H) } });
  }
  await prisma.notice.create({ data: { userId: byName["maya.moves"], title: "Your video is trending 🔥", body: "\"Infinite zoom energy for this new routine\" passed 10K likes.", link: `/watch?v=${videoIds[1]}`, createdAt: new Date(now - 2 * H) } });
  await prisma.comment.create({ data: { text: "@maya.moves you have to try this one", userId: byName["devdan"], videoId: videoIds[6], createdAt: new Date(now - 25 * 60000) } });

  // Backdate the seeded graph, then leave a few fresh items so each inbox has something unread.
  await prisma.like.updateMany({ data: { createdAt: new Date(now - 26 * H) } });
  await prisma.save.updateMany({ data: { createdAt: new Date(now - 26 * H) } });
  await prisma.follow.updateMany({ data: { createdAt: new Date(now - 48 * H) } });
  for (const u of users) await prisma.user.update({ where: { id: byName[u.username] }, data: { activitySeenAt: new Date(now - H), followersSeenAt: new Date(now - H) } });
  await prisma.follow.updateMany({ where: { followingId: byName["maya.moves"], followerId: byName["devdan"] }, data: { createdAt: new Date(now - 20 * 60000) } });
  await prisma.like.updateMany({ where: { videoId: videoIds[1], userId: byName["chef_leo"] }, data: { createdAt: new Date(now - 15 * 60000) } });

  console.log(`Seeded ${users.length} users, ${videos.length} videos. Login with any username + password "password123".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
