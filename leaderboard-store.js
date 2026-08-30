import fs from "node:fs";

/* Shared, path-agnostic leaderboard read/write + sort logic, used by:
   - vite.config.js's dev-only "/api/leaderboard" middleware, pointed at the
     project's cut-and-collect-project/leaderboard.json (browser + `npm run dev`)
   - electron/main.js's IPC handlers, pointed at the OS's per-user app-data folder
     in a packaged build (a .app bundle is read-only and can't be written into),
     or the same project file when running unpackaged via `npm run electron:dev`.
   Each caller decides WHERE the file lives; this module only knows how to
   read/write/sort whatever path it's given. */

export function readLeaderboard(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

export function appendLeaderboardEntry(filePath, entry) {
  const updated = [...readLeaderboard(filePath), entry].sort((a, b) => {
    if (a.opponentTens !== b.opponentTens) return a.opponentTens - b.opponentTens;
    return a.gameNumber - b.gameNumber;
  });
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  return updated;
}
