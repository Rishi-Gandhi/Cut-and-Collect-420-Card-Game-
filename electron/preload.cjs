// NOTE: this file must stay CommonJS (.cjs, using require/module.exports).
// Electron loads preload scripts through a special sandboxed loader that does
// not support `import`/`export` syntax, even though the rest of this project
// uses ES modules (package.json "type": "module").
const { contextBridge, ipcRenderer } = require("electron");

/* Exposes a small, safe surface to the game's web page (running with no direct
   Node/file-system access) — the page calls window.leaderboardAPI.load()/save(),
   which quietly hops over to the main process (see the ipcMain.handle calls in
   main.js) to actually touch the file. This is what lets the leaderboard work
   in a packaged .app, where there's no dev server to fetch() from at all. */
contextBridge.exposeInMainWorld("leaderboardAPI", {
  load: () => ipcRenderer.invoke("leaderboard:load"),
  save: (entry) => ipcRenderer.invoke("leaderboard:save", entry),
});
