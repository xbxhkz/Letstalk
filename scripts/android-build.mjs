// Builds the Android APK: sync the app shell into android/, run Gradle, copy the APK to dist/.
//   node scripts/android-build.mjs            -> debug APK (installable by sideloading)
//   node scripts/android-build.mjs --release  -> release APK (needs android/keystore.properties)
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const release = process.argv.includes("--release");
const win = process.platform === "win32";
const env = { ...process.env };

// Gradle needs a JDK 21: use JAVA_HOME if set, otherwise Android Studio's bundled one.
if (!env.JAVA_HOME) {
  const jbr = win
    ? "C:\\Program Files\\Android\\Android Studio\\jbr"
    : process.platform === "darwin"
      ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
      : path.join(homedir(), "android-studio", "jbr");
  if (existsSync(jbr)) env.JAVA_HOME = jbr;
}
// The Android SDK: ANDROID_HOME, or Android Studio's default location.
if (!env.ANDROID_HOME) {
  const sdk = win ? path.join(env.LOCALAPPDATA ?? "", "Android", "Sdk") : process.platform === "darwin" ? path.join(homedir(), "Library", "Android", "sdk") : path.join(homedir(), "Android", "Sdk");
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (!env.JAVA_HOME) console.warn("JAVA_HOME is not set and Android Studio's JDK wasn't found; Gradle may fail.");
if (!env.ANDROID_HOME) console.warn("ANDROID_HOME is not set and the Android SDK wasn't found; Gradle may fail.");

const run = (cmd, cwd = ".") => execSync(cmd, { stdio: "inherit", cwd, env });

run("node scripts/android-default-server.mjs");
if (!existsSync("android")) run("npx cap add android");
run("npx cap sync android");
// Explicit ".\" — Windows may not search the current directory for programs (NoDefaultCurrentDirectoryInExePath).
run(`${win ? ".\\gradlew.bat" : "./gradlew"} ${release ? "assembleRelease" : "assembleDebug"}`, "android");

const variant = release ? "release" : "debug";
const built = path.join("android", "app", "build", "outputs", "apk", variant, `app-${variant}.apk`);
if (!existsSync(built)) {
  console.error(`Expected APK not found at ${built}`);
  process.exit(1);
}
mkdirSync("dist", { recursive: true });
const out = path.join("dist", release ? "Letstalk.apk" : "Letstalk-debug.apk");
copyFileSync(built, out);
console.log(`\nAPK ready: ${path.resolve(out)}`);
