#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Starts a Cloudflare quick tunnel and makes the URL impossible to miss.

   Wrapping `cloudflared` rather than calling it directly, because a quick
   tunnel mints a *brand new hostname every run* and prints it once, in an
   ASCII box, interleaved with connection logs — and when run under
   `concurrently` alongside the game server, that box gets line-prefixed and
   scrolls away. Reusing a previous run's URL is then the obvious mistake, and
   it fails as a Cloudflare 1033 / HTTP 530 ("no tunnel for this hostname"),
   which reads like a broken tunnel rather than a stale address.

   So: pull the URL out of the output, print it on its own at the end, and
   write it to .tunnel-url so it can be recovered without scrollback.
   ------------------------------------------------------------------------ */

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const PORT = process.env.PORT || 8787;
const URL_FILE = ".tunnel-url";
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error(
      "\n  cloudflared isn't installed.\n\n" +
        "    brew install cloudflared\n\n" +
        "  Then run this again.\n"
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

let found = null;
function scan(chunk) {
  const text = chunk.toString();
  process.stderr.write(text); // keep cloudflared's own logging visible
  if (found) return;
  const m = text.match(URL_RE);
  if (!m) return;
  found = m[0];

  try {
    writeFileSync(URL_FILE, found + "\n");
  } catch {
    /* the banner is the important half; the file is a convenience */
  }

  const line = "─".repeat(found.length + 4);
  console.log(
    `\n┌${line}┐\n` +
      `│  ${" ".repeat(found.length)}  │\n` +
      `│  ${found}  │\n` +
      `│  ${" ".repeat(found.length)}  │\n` +
      `└${line}┘\n\n` +
      `  Paste that into the lobby's SERVER field — on every device, including this one.\n` +
      `  Saved to ${URL_FILE}.\n\n` +
      `  This address is new for this run and dies when you stop the tunnel.\n` +
      `  A previous run's URL will fail with Cloudflare error 1033.\n`
  );
}

child.stdout.on("data", scan);
child.stderr.on("data", scan); // cloudflared prints the banner on stderr

function cleanup() {
  try {
    unlinkSync(URL_FILE); // the URL is dead once the tunnel is; don't leave it looking usable
  } catch {
    /* already gone */
  }
}

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
/* SIGHUP is in the list because closing a terminal window sends that rather
   than SIGINT — and without it the URL file outlives the tunnel, so the next
   `npm run link` hands out a dead address. */
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    cleanup();
    child.kill(sig);
  });
}
