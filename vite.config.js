import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADERBOARD_PATH = path.join(__dirname, "cut-and-collect-project/leaderboard.json");

function readLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(LEADERBOARD_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/* Dev-only API so the game can persist its leaderboard to a real file
   (cut-and-collect-project/leaderboard.json) instead of browser storage —
   this only runs under `vite dev`, not a production build. */
function leaderboardApiPlugin() {
  return {
    name: "leaderboard-api",
    configureServer(server) {
      server.middlewares.use("/api/leaderboard", (req, res) => {
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(readLeaderboard()));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            let entry;
            try {
              entry = JSON.parse(body);
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "invalid JSON" }));
              return;
            }
            const updated = [...readLeaderboard(), entry].sort((a, b) => {
              if (a.opponentTens !== b.opponentTens) return a.opponentTens - b.opponentTens;
              return a.gameNumber - b.gameNumber;
            });
            fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(updated, null, 2));
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
  plugins: [react(), leaderboardApiPlugin()],
});
