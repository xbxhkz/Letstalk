import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app shell for Letstalk.
 *
 * Letstalk is a Next.js server (API routes + SQLite), so the APK can't contain it. The app
 * bundles only `android-shell/` — a start screen that asks for the server address, remembers
 * it, and then loads that server in the WebView.
 */
/**
 * Hosts the WebView may load in-app (and expose Capacitor's bridge to). Everything else opens in
 * the system browser. Private LAN ranges cover `npm run start:lan`; a deployed server's host is
 * added from LETSTALK_SERVER_URL at build time, e.g. LETSTALK_SERVER_URL=https://letstalk.example.com.
 * Capacitor masks match per dot-separated label, so "192.168.*.*" matches any 192.168.x.y address.
 */
const allowNavigation = ["localhost", "10.*.*.*", "172.*.*.*", "192.168.*.*"];
if (process.env.LETSTALK_SERVER_URL) {
  try {
    allowNavigation.push(new URL(process.env.LETSTALK_SERVER_URL).hostname);
  } catch {
    throw new Error(`LETSTALK_SERVER_URL is not a valid URL: ${process.env.LETSTALK_SERVER_URL}`);
  }
}

const config: CapacitorConfig = {
  appId: "com.letstalk.app",
  appName: "Letstalk",
  webDir: "android-shell",
  backgroundColor: "#000000",
  // Lets the server recognise the app (Google sign-in then finishes in the system browser and hands back).
  appendUserAgent: "LetstalkApp",
  server: {
    androidScheme: "https",
    // The server is usually a computer on the same Wi-Fi over plain http.
    cleartext: true,
    // Only these hosts load inside the app; any other URL is handed to the system browser.
    allowNavigation,
  },
  plugins: {
    // Light status-bar icons on the black app; the pages use viewport-fit=cover.
    SystemBars: { style: "DARK", insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
  android: {
    // The start screen is served from https://localhost; let it check an http server.
    allowMixedContent: true,
  },
};

export default config;
