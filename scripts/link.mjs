#!/usr/bin/env node
/* Prints the current share link — but only after checking it actually works.
   A stale URL is worse than none: it fails as Cloudflare error 1033, which
   looks like a broken tunnel rather than an address that no longer exists.
   Cleanup on exit covers the ordinary cases; this covers the rest (a crash,
   kill -9, a machine that slept), because it asks the tunnel itself. */
import { readFileSync } from "node:fs";

let url;
try {
  url = readFileSync(".tunnel-url", "utf8").trim();
} catch {
  console.log("\n  No tunnel is running. Start one with:\n\n    npm run play:online\n");
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 6000);
try {
  const res = await fetch(`${url}/health`, { signal: controller.signal });
  if (!res.ok) throw new Error(String(res.status));
  console.log(`\n  ${url}\n\n  Send that to whoever's playing, along with your room code.\n`);
} catch {
  console.log(
    `\n  ${url}\n` +
      `\n  ...but that link is no longer reachable, so it won't work for anyone.` +
      `\n  Restart the tunnel to get a fresh one:\n\n    npm run play:online\n`
  );
  process.exit(1);
} finally {
  clearTimeout(timer);
}
