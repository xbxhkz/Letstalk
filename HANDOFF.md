# HANDOFF — Letstalk

_Last updated: 2026-11-27_

## Status
MVP complete. All required features are built. `npm run build` passes with 0 errors and 0 warnings. Every page and API route returned 200 (201/206 where that's correct) on the dev server. A Playwright run covered autoplay, snap-scroll, tap-to-pause, double-tap like, share, posting a comment, the Following tab, profile → liked grid → watch, search, and upload, with zero console errors.

## Latest task (2026-11-27): TikTok-style inbox + For You recommendations
- **Inbox:** friends row; New followers (Follow back), Activity (All / Likes / Comments / Mentions / Followers, split into New and Earlier), System notifications; DM threads with shared-video cards and Seen receipts; unread badge on the nav; a Message button on profiles; the share button now opens a sheet with Send to friends, Copy link and Why this video.
- **Recommender:** `src/lib/recommend.ts` uses watch tracking (`View` table, `POST /api/events/watch`) plus likes, saves, comments and follows. It builds tag, creator and sound affinity, collaborative filtering, and general quality, then applies seen penalties, diversity and exploration. The For You feed loads batches re-ranked after every few videos. Logged-out visitors are tracked with the `lt_anon` cookie (`src/middleware.ts`).
- **Verified:** `npm run build` is clean and `npm test` passes 5/5 (recommender behaviour). A two-user Playwright run checked watch events, batch loading, the share sheet and Why this video, sending a video by DM, chat in both directions with Seen receipts, the unread badges and the Activity filters, with zero console errors.
- **New schema:** `View`, `Message`, `Notice`, and `User.activitySeenAt` / `User.followersSeenAt`. Run `npm run setup` to apply.

## Android APK (2026-11-27)
- Built on Windows with Android Studio's JDK 21 and SDK 36: `npm run android:apk` produces `dist/Letstalk-debug.apk` (~4 MB, minSdk 24, targetSdk 36, `com.letstalk.app`).
- **Design:** a Capacitor 8.6.3 shell. `android-shell/index.html` is a start screen that asks for the server URL, stores it, checks it's reachable, and then loads it in the WebView. `capacitor.config.ts` allows in-app navigation only to private LAN ranges plus the host in `LETSTALK_SERVER_URL` at build time (a security review flagged the earlier `"*"`: it would expose the native bridge to any site); other URLs open in the system browser. It also enables cleartext, mixed content and dark `SystemBars`.
- **Hand edits in `android/`** (generated once, then committed; keep them if you regenerate): `usesCleartextTraffic="true"` in AndroidManifest.xml, black window and system-bar colours in `res/values/styles.xml`, and the icons and splash written by `scripts/make-icons.mjs`.
- **Server for phones:** `npm run build && npm run start:lan` (listens on 0.0.0.0 with `INSECURE_COOKIES=1`).
- **Verified on the `Oneplus_13` emulator:** the start screen pre-filled the LAN address, Connect loaded the For You feed with autoplay, demo login held its session over http, the inbox showed its badges and messages, and relaunching reconnected and stayed logged in.
- **Gotchas:** `scripts/android-build.mjs` calls `.\gradlew.bat` explicitly (this machine sets NoDefaultCurrentDirectoryInExePath). Other tools on this PC run an older adb (v32), which keeps restarting the SDK's adb (v41), so retry adb commands. `npm test` uses `cp`/`rm`, so run it from Git Bash on Windows.
## Where the code is
- PR #1 (the MVP) was merged into `main` on 2026-11-27.
- PR #2 (inbox, For You recommendations and the Android app) was merged into `main` on 2026-11-27 (https://github.com/xbxhkz/Letstalk/pull/2).
- Everything is on `main`. Local clone: `C:\Users\Admin\Letstalk`.

## Run it
`npm install && npm run setup && npm run dev`. Demo login: any seed user and `password123`.

## Layout
- `prisma/schema.prisma`: User, Video, Like, Save, Follow, Comment, CommentLike
- `prisma/seed.ts`: 4 users, 6 videos, follows, likes, saves, comments (also writes the SVG avatars)
- `public/uploads/seed/`: 6 vertical MP4s and JPG thumbnails, generated with ffmpeg (abstract visuals plus tones)
- `src/lib/`: prisma client, JWT auth, video/profile/trending queries, DTO types, client fetch helper
- `src/lib/recommend.ts`: the For You ranking (see README "For You recommendations"); `src/lib/inbox.ts`: activity, unread counts, conversations, friends
- `tests/recommend.test.ts`: recommender behaviour tests (`npm test`)
- `src/components/`: `ShareSheet`, `InboxUI`, `Feed` (IntersectionObserver, snap, For You batch loading), `VideoCard` (tap/double-tap, rail, marquee, disc), `CommentDrawer`, `TopBar`, `BottomNav`, `Providers` (auth, mute, toast)
- `src/app/`: pages plus `api/` route handlers

## Decisions
- Custom JWT cookie auth instead of NextAuth: fewer moving parts for a local SQLite app.
- Uploads are served through `/api/media` (with Range support), because `next start` doesn't serve files added to `public/` after the build.
- `baseLikes`/`baseSaves` columns give seed videos realistic counts with only 4 real users.

## Possible next steps
- Android: release signing + Play Store bundle (AAB); push notifications for inbox activity
- Avatar upload in Edit Profile
- Real-time updates over SSE/WebSocket instead of polling (comments 4 s, chat 3 s, badge 15 s)
- Replies to comments; typing indicators and message reactions in chat
- Recommender: precompute affinities in a background job once the video count grows (it currently scores the latest 500 videos per request); add "Not interested" as an explicit negative signal
- Server-side thumbnail and transcoding (ffmpeg) for uploads
