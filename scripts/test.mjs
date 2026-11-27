// Runs the test suite against a throwaway copy of the dev database (works on Windows, macOS and Linux).
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("prisma/dev.db")) {
  console.error("prisma/dev.db not found. Run `npm run setup` first.");
  process.exit(1);
}
copyFileSync("prisma/dev.db", "prisma/test.db");
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["tests/*.test.ts"];
const r = spawnSync("npx", ["tsx", "--test", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: "file:./test.db" },
});
rmSync("prisma/test.db", { force: true });
rmSync("prisma/test.db-journal", { force: true });
process.exit(r.status ?? 1);
