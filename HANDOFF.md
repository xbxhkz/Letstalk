# HANDOFF — Letstalk

_Last updated: 2026-11-27_

## Status
MVP complete. All required features are built. `npm run build` passes with 0 errors and 0 warnings. Every page and API route returned 200 (201/206 where that's correct) on the dev server. A Playwright run covered autoplay, snap-scroll, tap-to-pause, double-tap like, share, posting a comment, the Following tab, profile → liked grid → watch, search, and upload, with zero console errors.

## Where the code is
- Everything is on `main`. PR #1 (https://github.com/xbxhkz/Letstalk/pull/1) was merged on 2026-11-27.
- Start new work on a new branch from `main`.

## Run it
`npm install && npm run setup && npm run dev`. Demo login: any seed user and `password123`.

## Layout
- `prisma/schema.prisma`: User, Video, Like, Save, Follow, Comment, CommentLike
- `prisma/seed.ts`: 4 users, 6 videos, follows, likes, saves, comments (also writes the SVG avatars)
- `public/uploads/seed/`: 6 vertical MP4s and JPG thumbnails, generated with ffmpeg (abstract visuals plus tones)
- `src/lib/`: prisma client, JWT auth, video/profile/trending queries, DTO types, client fetch helper
- `src/components/`: `Feed` (IntersectionObserver, snap), `VideoCard` (tap/double-tap, rail, marquee, disc), `CommentDrawer`, `TopBar`, `BottomNav`, `Providers` (auth, mute, toast)
- `src/app/`: pages plus `api/` route handlers

## Decisions
- Custom JWT cookie auth instead of NextAuth: fewer moving parts for a local SQLite app.
- Uploads are served through `/api/media` (with Range support), because `next start` doesn't serve files added to `public/` after the build.
- `baseLikes`/`baseSaves` columns give seed videos realistic counts with only 4 real users.

## Possible next steps
- Paginated / infinite feed (currently the latest 50 videos)
- Avatar upload in Edit Profile
- Real-time updates over SSE/WebSocket instead of the 4 s comment polling
- View counting, replies to comments, direct messages in Inbox
- Server-side thumbnail and transcoding (ffmpeg) for uploads
