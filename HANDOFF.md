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
## Effects & filters expansion (2026-11-27, branch feature/more-effects)
- **Research:** 2026 roundups of TikTok/Snapchat effects (beauty and soft looks such as Soft Focus and Golden Hour; comedy distortions such as Big Mouth and Stretch; AR toys such as devil horns and butterflies; B&W "Vogue" looks) plus established sources: CSSgram (MIT) for Instagram-style looks, GPUImage's documented algorithms, and MediaPipe Selfie Segmenter for backgrounds.
- **Added:** 46 filters (categories, live thumbnails; CSS filter maths from the W3C spec, W3C blend modes, glow), 30 screen effects, 8 animated overlays, 21 lenses + 7 distortions (`warp.ts`), backgrounds (`background.ts`), and the effects tray tabs Face / Background / Screen / Overlays. Credits are in `THIRD_PARTY_NOTICES.md`.
- **Performance:** face tracking + segmentation moved to a Web Worker (`vision.worker.ts` + `vision.ts`). The worker fetches the runtime and models and loads them from blob URLs/buffers, since the app's https://localhost worker can't load http scripts. Emulator fps before → after: lens 13→58, Big eyes 9→34, blur 11→22, Neon grid + Big eyes + Golden Hour 4→22. Neon grid no longer uses canvas shadowBlur.
- **Verified:** a Chrome face-feed gallery of all 106 items (screenshots inspected; fixed Kaleido zoom, Slim face and Stretch); the Android emulator combo with no shader or worker errors; a full record→export→post in Chrome; `npm test` 15/15; build OK.
- **Emulator note:** use `-gpu host`. With `swiftshader_indirect` (software GL) the heavy shader plus CPU inference overloaded the emulator until it crashed; that's an emulator limit, not the app.
## Sound library + face-lens fix (2026-11-27, branch fix/lenses-and-sounds)
- **Lens bug (reported: no puppy or kitty on the phone):** MediaPipe's GPU delegate in Android WebViews initialises and then fails every frame (`GL_INVALID_OPERATION` in `glFramebufferTexture2D`), returning no faces. Proven A/B on the emulator with a face feed (GPU: 124 GL errors and "Find a face" over a visible face; CPU: 0 errors and lenses on the face). Phones now use the CPU delegate at ~15 detections/s. Added a "Find a face" hint.
- **Sounds:** `Sound` model + `Video.soundId`; `src/lib/sounds.ts` (library sync, DTO); `/api/sounds`, `/api/sounds/[id]`; `/sound/[id]` page; Discover "Trending sounds"; VideoCard links to the sound. Studio: `SoundPicker.tsx` (browse, search, preview, upload, trim), music while recording (Camera), synced preview and two volume sliders (Editor), music in exports (`recorder.ts`), sound on text posts, locked sound name on the post screen.
- **Library tracks** come from `scripts/generate-sounds.mjs` (an original synth; ffmpeg encodes AAC at −14 LUFS). Checked: loudness and peaks of all 8, and waveforms show the expected rhythm.
- **App gotcha found and fixed:** in the app, `<audio>`/`<img>` with `http://` URLs are auto-upgraded to https and blocked, so the studio uses `mediaUrl()` (fetch → blob URL). CORS on `/sounds/*` (next.config) and `/api/media` (media route) allows the app origin.
- **Verified:**
  - Desktop Chrome: library list → trim to 8 s → record → two volume sliders (original at 0) → post. The posted file's audio waveform matches Neon Rush from 8 s. Sound page lists the video; Use this sound preselects it; uploading an MP3 sound works; a text post carries Cozy Rain; Discover row shows.
  - Android emulator (DevTools-driven, face feed): Puppy lens on the face → Add sound → Golden Hour → record → export → post. Server audio −17 dB with the mic silent, so it's the music. No console errors.
- **Also:** the record button now responds to keyboard/screen-reader clicks. The recommender test's "skipped videos in the bottom half" depended on how many videos exist (today's test posts broke it), so it now compares against a cold-start viewer; it passes on both a clean and a larger database. Test posts and test sounds were removed from the dev DB.
## Camera studio (2026-11-27, merged in PR #5)
- **Built:** a TikTok/Snapchat-style studio in `src/studio/` (framework-free React): Camera.tsx (recording, speed, timer, flash, lenses), compositor.ts (WebGL filters, beauty, effects and overlays), lenses.ts (MediaPipe face lenses), Editor.tsx (text, stickers, gestures, volume, export), TextPost.tsx, PostDetails.tsx, recorder.ts (MediaRecorder clips, real-time export, cover frames).
- **Hosts:** `/create` → CreateHub.tsx picks the in-page studio (secure context), the APK's bundled studio (`https://localhost/studio.html`, built by `scripts/build-studio.mjs` during `npm run android:apk`), or upload-only on plain http. The app uploads with an upload token (`/api/upload-token`, `getUploadTokenUserId`, `src/lib/cors.ts`).
- **Assets:** `public/mediapipe/` (gitignored) is created by `scripts/prepare-mediapipe.mjs` (predev/prebuild). It downloads the face model once; if that fails, only lenses are disabled.
- **Verified:**
  - Chrome with a fake camera: recorded a tap clip and a hold clip at 2×; filter, lens, neon text and a dragged sticker; exported in 4 s to a 720×1280 MP4 of the expected length; posted with a cover. Text mode also posted.
  - Generated-face camera feed: Puppy, Kitty, Shades, Royal and Heart eyes all track the face.
  - Android emulator: + opened the bundled studio, Android asked for camera and mic permission, recording, sticker, export and posting all worked (upload via token, cross-origin), and the post reached the server as @maya.moves.
- **Fixed during testing:** the Camera/Text switch was hidden under the camera controls; posting now lands on your profile.
- **Not included:** a licensed music library, green screen, duet/stitch, photo carousels, live streaming. WebM output (devices without MP4 recording) has no duration header; the feed player works around it (VideoCard `onLoadedMetadata`).
## Sign-in methods (2026-11-27, merged in PR #3)
- **Methods:** Google, phone (SMS code), email (code), plus the existing username/password. Code lives in `src/lib/{otp,delivery,identity,google,auth-flow}.ts` and `src/app/api/auth/{otp,google,handoff,username}`. The login UI is `src/app/login/LoginForm.tsx`; new accounts go through `/onboarding`.
- **Schema:** `User.email/phone/googleId/needsUsername`, `passwordHash` now nullable, new `OtpCode` and `OAuthState`. Run `npm run db:push`.
- **Providers:** none configured yet. Under `npm run dev`, codes appear on screen and in the console. The production server (`start:lan`) refuses with "isn't set up on this server yet". `npm run start:lan:test` shows codes on screen for LAN testing. To go live, fill `.env.local` from `.env.example` (Twilio, SMTP, Google OAuth client).
- **Android:** user agent `LetstalkApp`; an intent filter for `com.letstalk.app://auth`; `MainActivity.onNewIntent` passes the token to the start screen (`?handoff=`), which loads `/api/auth/handoff`.
- **Verified:** `npm test` 14/14; `node tests/e2e-auth.mjs` 24/24 against a fake Google (PKCE, RS256 ID token, nonce, CSRF, linking, unverified email, app hand-off, token replay); a browser run of phone code → onboarding → taken-name check → redirect back; on the emulator, an app link with a fake token went through the whole chain in-app and was rejected as expected.
- **Bugs found and fixed while testing:** redirects built from `req.url` said `http://0.0.0.0:3000` under `start:lan`, so the app bounced to Chrome and the Google `redirect_uri` would have been wrong. Same-site redirects are now relative (`localRedirect`) and origins come from `PUBLIC_URL` or the Host header (`requestOrigin`). Also, the e2e `next dev` overwrote the production `.next` build, so it now uses `NEXT_DIST_DIR=.next-e2e`.
- **Known limitation, fix when deploying:** the Android Google return link uses the custom scheme `com.letstalk.app://`. With a malicious app on the victim's phone that claims the scheme, plus a sign-in the attacker started and lured the victim into completing, the token could be relayed and the attacker would get the victim's account. An app-held secret doesn't fix it (the attacker can run the genuine app). The fix is Android App Links: an https return URL on `PUBLIC_URL`, `assetlinks.json` with the release key's SHA-256, and `autoVerify` in the manifest. The web flow is not affected.
- **Security review fixes:** `safeNext` now strips control characters and parses the URL (`/\t/evil.com` used to pass as `//evil.com`), with a test.
- **Not done:** linking or unlinking sign-in methods from settings (e.g. adding a phone to a Google account), and a real Google/Twilio/SMTP run, which needs credentials.
## Where the code is
- PR #1 (the MVP) was merged into `main` on 2026-11-27.
- PR #2 (inbox, For You recommendations and the Android app) was merged into `main` on 2026-11-27 (https://github.com/xbxhkz/Letstalk/pull/2).
- PR #3 (sign-in with Google, phone and email) was merged into `main` on 2026-11-27 (https://github.com/xbxhkz/Letstalk/pull/3).
- PR #4 (`npm run start:lan:test`: shows sign-in codes on screen for LAN testing) was merged into `main` on 2026-11-27 (https://github.com/xbxhkz/Letstalk/pull/4).
- PR #5 (camera studio: recording, filters, face lenses, text posts) was merged into `main` on 2026-11-27 (https://github.com/xbxhkz/Letstalk/pull/5).
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
- Studio: licensed/commercial music (needs a licensing deal), extracting sounds from uploaded videos (server-side ffmpeg), green screen (MediaPipe selfie segmentation), duet/stitch, photo posts, drafts
- Settings page to add or remove sign-in methods on an existing account
- Avatar upload in Edit Profile
- Real-time updates over SSE/WebSocket instead of polling (comments 4 s, chat 3 s, badge 15 s)
- Replies to comments; typing indicators and message reactions in chat
- Recommender: precompute affinities in a background job once the video count grows (it currently scores the latest 500 videos per request); add "Not interested" as an explicit negative signal
- Server-side thumbnail and transcoding (ffmpeg) for uploads
