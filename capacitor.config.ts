import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app shell for Letstalk.
 *
 * Letstalk is a Next.js server (API routes + SQLite), so the APK can't contain it. The app
 * bundles only `android-shell/` — a start screen that asks for the server address, remembers
 * it, and then loads that server in the WebView.
 */
const config: CapacitorConfig = {
  appId: "com.letstalk.app",
  appName: "Letstalk",
  webDir: "android-shell",
  backgroundColor: "#000000",
  server: {
    androidScheme: "https",
    // The server is usually a computer on the same Wi-Fi over plain http.
    cleartext: true,
    // Keep any server address inside the app instead of handing it to the browser.
    allowNavigation: ["*"],
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
