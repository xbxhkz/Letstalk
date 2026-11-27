// Runs the production server on all network interfaces so phones on the same Wi-Fi can use it.
// INSECURE_COOKIES=1 lets the login cookie work over plain http (see src/lib/auth.ts).
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const port = process.env.PORT || "3000";
const addrs = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a.address}:${port}`);
console.log(`\nLetstalk for phones on this network:\n${addrs.map((a) => `  ${a}`).join("\n")}\n`);

const child = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, INSECURE_COOKIES: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
