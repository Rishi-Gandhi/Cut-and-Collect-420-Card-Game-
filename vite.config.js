import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLeaderboard, recordResult } from "./leaderboard-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADERBOARD_PATH = path.join(__dirname, "cut-and-collect-project/leaderboard.json");

/* Dev-only API so the game can persist its leaderboard to a real file
   (cut-and-collect-project/leaderboard.json) instead of browser storage —
   this only runs under `vite dev`, not a production build. The Electron app
   uses a separate, non-dev-server-dependent path for the same feature — see
   electron/main.js + electron/preload.js. */
function leaderboardApiPlugin() {
  return {
    name: "leaderboard-api",
    configureServer(server) {
      server.middlewares.use("/api/leaderboard", (req, res) => {
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(readLeaderboard(LEADERBOARD_PATH)));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            let payload;
            try {
              payload = JSON.parse(body);
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "invalid JSON" }));
              return;
            }
            const updated = recordResult(LEADERBOARD_PATH, payload);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(updated));
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  // relative asset paths — required so the packaged app's built files still
  // resolve correctly when loaded via file:// instead of a real http server
  base: "./",
  plugins: [react(), leaderboardApiPlugin()],
});
