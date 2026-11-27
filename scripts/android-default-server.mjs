// Writes android-shell/default-server.js: the address the app's start screen pre-fills on first launch.
// Uses LETSTALK_SERVER_URL if set, otherwise this computer's LAN address on port 3000.
import { writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

function lanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (/vEthernet|WSL|VirtualBox|VMware|docker|Hyper-V/i.test(name)) continue;
      const priv = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      if (priv) candidates.push(a.address);
    }
  }
  return candidates.find((a) => a.startsWith("192.168.")) ?? candidates[0] ?? null;
}

const url = process.env.LETSTALK_SERVER_URL || (lanAddress() ? `http://${lanAddress()}:3000` : "");
writeFileSync("android-shell/default-server.js", `window.LETSTALK_DEFAULT_SERVER = ${JSON.stringify(url)};\n`);
console.log(url ? `Default server for the app: ${url}` : "No LAN address found; the app will ask for the server address.");
