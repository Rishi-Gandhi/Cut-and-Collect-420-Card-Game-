import fs from "node:fs";

/* Shared, path-agnostic leaderboard read/write + sort logic, used by:
   - vite.config.js's dev-only "/api/leaderboard" middleware, pointed at the
     project's cut-and-collect-project/leaderboard.json (browser + `npm run dev`)
   - electron/main.js's IPC handlers, pointed at the OS's per-user app-data folder
     in a packaged build (a .app bundle is read-only and can't be written into),
     or the same project file when running unpackaged via `npm run electron:dev`.
   Each caller decides WHERE the file lives; this module only knows how to
   read/write/sort whatever path it's given.

   One row per player, tracking their lifetime win/loss/tie record plus their
   personal best (fewest hands to reach a full "420") — not a growing list of
   one-row-per-win snapshots like the original design. */

function normalizeEntry(e) {
  if (typeof e.wins === "number") return e; // already the current shape
  // Upgrade an old per-win-snapshot row (name/gameNumber/opponentTens/outcomes/date)
  // into the new shape, using what it already recorded.
  const outcomes = e.outcomes || {};
  return {
    name: e.name,
    wins: outcomes.win || 0,
    losses: outcomes.loss || 0,
    ties: outcomes.tie || 0,
    personalBest: typeof e.gameNumber === "number" && (outcomes.win || 0) > 0 ? e.gameNumber : null,
    lastPlayed: e.date || null,
  };
}

export function readLeaderboard(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    // Sort on every read, not just after a write — otherwise the on-disk
    // array order (which only reflects the last recordResult() call) leaks
    // straight to the UI, and a hand-edited file displays in whatever order
    // its entries happen to sit in rather than by rank.
    return sortLeaderboard(raw.map(normalizeEntry));
  } catch {
    return [];
  }
}

function sortLeaderboard(list) {
  return [...list].sort((a, b) => {
    const aHas = a.personalBest != null;
    const bHas = b.personalBest != null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.personalBest !== b.personalBest) return a.personalBest - b.personalBest;
    return b.wins - b.losses - (a.wins - a.losses);
  });
}

/* Records the outcome of one hand for a player — updates their lifetime
   win/loss/tie totals, and (only when personalBestCandidate is passed, i.e.
   this hand was a full "420" mercy win) their personal best. */
export function recordResult(filePath, { name, result, personalBestCandidate }) {
  const list = readLeaderboard(filePath);
  let entry = list.find((e) => e.name === name);
  if (!entry) {
    entry = { name, wins: 0, losses: 0, ties: 0, personalBest: null, lastPlayed: null };
    list.push(entry);
  }
  if (result === "win") entry.wins += 1;
  else if (result === "loss") entry.losses += 1;
  else if (result === "tie") entry.ties += 1;
  if (personalBestCandidate != null && (entry.personalBest == null || personalBestCandidate < entry.personalBest)) {
    entry.personalBest = personalBestCandidate;
  }
  entry.lastPlayed = new Date().toISOString();

  const sorted = sortLeaderboard(list);
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2));
  return sorted;
}
