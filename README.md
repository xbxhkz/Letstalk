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
| `/inbox` | TikTok-style inbox: friends row, **New followers**, **Activity**, **System notifications**, then message threads |
| `/inbox/activity` | Likes, comments, comment likes, @mentions and follows, filterable, split into New / Earlier |
| `/inbox/followers` | New followers with Follow back |
| `/inbox/system` | System notices (welcome, "your video is live", milestones) |
| `/inbox/chat/[username]` | Direct messages, shared-video cards, "Seen" receipts (polls every 3 s) |
| `/inbox/new` | Pick a friend or search for a user to message |
| `/login` | Log in or sign up |

### API

`POST /api/auth/{register,login,logout}` · `GET /api/auth/me`
`GET|POST /api/videos` · `GET /api/videos/:id` · `POST /api/videos/:id/{like,save,share}` · `GET|POST /api/videos/:id/comments`
`POST /api/comments/:id/like` · `GET /api/users/:username` · `POST /api/users/:username/follow` · `PATCH /api/users/me`
`GET /api/search?q=` · `GET /api/trending` · `GET /api/media/*` (serves uploads, supports Range)
`GET /api/inbox` (summary) · `GET /api/inbox/{activity,followers,system,unread}` · `POST /api/inbox/seen`
`GET|POST /api/messages/:username` · `GET /api/friends` · `POST /api/events/watch`
`GET /api/videos?feed=foryou&exclude=…&limit=…&debug=1` returns the personalised ranking (with `debug=1`, the score breakdown)

## For You recommendations

`src/lib/recommend.ts` ranks the For You feed for each viewer, logged in or not (logged-out visitors get an anonymous cookie id).

- **Signals:** likes (+3), saves (+4) and comments (+2), plus watch behaviour reported by the player. Finishing a video counts +2, each rewatch adds +0.75 (up to 3), watching most of it +0.6 to +1.2, and swiping away within ~2 s counts −1.5. Signals fade with a 7-day half-life.
- **Interest profile:** those signals are spread across each video's hashtags, creator and sound. Following a creator adds to that creator's score.
- **Collaborative filtering:** viewers who liked or finished the same videos as you count as "similar". What they liked or finished gets boosted for you.
- **General quality:** popularity, the share of views watched to the end (smoothed), and freshness. This carries brand-new viewers and fades out as their own history grows.
- **Seen penalties, diversity and exploration:** videos you've finished, skipped or liked sink. The same creator never plays twice in a row. About 15% of slots go to unseen videos outside your usual taste, so the profile can discover new interests.
- The feed loads in batches of 6, each ranked *after* the videos you just watched, so it adapts as you scroll. When everything has been seen it starts another lap.
- **Why this video:** the share sheet shows the reasons behind each pick.

`npm test` runs the recommender tests against a throwaway copy of the database.

## Android app

The APK is a Capacitor shell, not a copy of the app. Letstalk runs as a server (API routes plus SQLite), so the Android app opens on a small start screen (`android-shell/`), asks for the server address, remembers it, and then loads that server in a WebView.

**Build the APK** (needs Android Studio, or at least its JDK and the Android SDK):

```bash
npm run android:apk      # -> dist/Letstalk-debug.apk
```

The script finds Android Studio's bundled JDK and the SDK in their default locations if `JAVA_HOME` and `ANDROID_HOME` aren't set. It pre-fills the start screen with this computer's LAN address.

For safety, the app only opens private-network addresses (`localhost`, `10.x`, `172.x`, `192.168.x`) in-app; any other link opens in the phone's browser. To use a server outside your network, name it when building: `LETSTALK_SERVER_URL=https://letstalk.example.com npm run android:apk` (PowerShell: `$env:LETSTALK_SERVER_URL='https://...'; npm run android:apk`). That host is added to the allowed list and pre-filled on the start screen. `npm run android:open` opens the project in Android Studio.

**Run a server your phone can reach:**

```bash
npm run build
npm run start:lan        # prints http://<your-LAN-IP>:3000
```

`start:lan` listens on all interfaces and sets `INSECURE_COOKIES=1`, so login works over plain http. Allow Node through Windows Firewall on private networks if the phone can't connect.

**Install on a phone:** copy the APK over (or `adb install dist/Letstalk-debug.apk`), allow "Install unknown apps" for the app you open it with, then tap Connect on the start screen. To switch servers, reopen the app and tap "Change server" while it's connecting.

Debug APKs are signed with Android's debug key: fine for sideloading, not for the Play Store. A release build (`node scripts/android-build.mjs --release`) needs a signing key configured in `android/app/build.gradle`.
## Notes

- **Uploads** are written to `public/uploads/` and served through `/api/media/...`, because `next start` only serves files that were in `public/` at build time. A thumbnail is captured from the preview in the browser.
- **Counts:** seeded videos have `baseLikes`/`baseSaves` so they show realistic numbers (e.g. 12K). Real `Like`/`Save` rows add on top.
- **Autoplay:** videos start muted because browsers block unmuted autoplay. The mute toggle is global and remembered in `localStorage`.
- **Comments** refresh every 4 s while the drawer is open, chats every 3 s, and the Inbox badge every 15 s.
- **Upgrading an existing database:** run `npm run setup` again (schema push + reseed).
- **Auth secret:** set `AUTH_SECRET` in `.env.local` for anything beyond local use. Session cookies are `Secure` in production; set `INSECURE_COOKIES=1` to test `next start` over plain http.
