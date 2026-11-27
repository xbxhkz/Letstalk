# Letstalk

A mobile-first, short-form vertical video social app: snap-scrolling feed, likes, comments, saves, follows, uploads, profiles and discovery.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Prisma + SQLite · JWT cookie auth (`jose` + `bcryptjs`) · Lucide icons

## Quick start

```bash
npm install          # also runs `prisma generate`
npm run setup        # creates prisma/dev.db and seeds sample data
npm run dev          # http://localhost:3000
```

The seed creates 4 users and 6 playable vertical videos (in `public/uploads/seed`) with captions, hashtags, likes, saves, follows and comments.
Log in with any seed user and the password `password123`, or use the one-tap demo buttons on `/login`:
`maya.moves`, `chef_leo`, `nomad.nina`, `devdan`.

Run `npm run db:seed` at any time to reset the data.

## Routes

| Page | What it does |
| --- | --- |
| `/` | Full-screen feed with **Following** and **For You** tabs |
| `/watch?v=<id>[&feed=user&username=&type=posted\|liked][&q=]` | Opens a specific video inside a feed (used by grids and share links) |
| `/discover[?q=]` | Search (captions, `#hashtags`, `@users`), trending hashtags, 2-column grid |
| `/create` | Upload MP4/WebM with preview, caption, hashtags and sound name (login required) |
| `/profile/[username]` | Profile header, follow or edit, Posted and Liked grids |
| `/inbox` | Likes, comments and new followers on your content |
| `/login` | Log in or sign up |

### API

`POST /api/auth/{register,login,logout}` · `GET /api/auth/me`
`GET|POST /api/videos` · `GET /api/videos/:id` · `POST /api/videos/:id/{like,save,share}` · `GET|POST /api/videos/:id/comments`
`POST /api/comments/:id/like` · `GET /api/users/:username` · `POST /api/users/:username/follow` · `PATCH /api/users/me`
`GET /api/search?q=` · `GET /api/trending` · `GET /api/inbox` · `GET /api/media/*` (serves uploads, supports Range)

## Notes

- **Uploads** are written to `public/uploads/` and served through `/api/media/...`, because `next start` only serves files that were in `public/` at build time. A thumbnail is captured from the preview in the browser.
- **Counts:** seeded videos have `baseLikes`/`baseSaves` so they show realistic numbers (e.g. 12K). Real `Like`/`Save` rows add on top.
- **Autoplay:** videos start muted because browsers block unmuted autoplay. The mute toggle is global and remembered in `localStorage`.
- **Comments** refresh every 4 s while the drawer is open, so other users' new comments appear without a reload.
- **Auth secret:** set `AUTH_SECRET` in `.env.local` for anything beyond local use. Session cookies are `Secure` in production; set `INSECURE_COOKIES=1` to test `next start` over plain http.
