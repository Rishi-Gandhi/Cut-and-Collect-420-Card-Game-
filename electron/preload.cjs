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

/* Auto-update surface. onStatus registers a listener for the progress events
   main.js pushes (checking -> available -> downloading -> ready), and returns
   an unsubscribe function so React effects can clean up after themselves.
   Note we deliberately re-wrap the callback rather than handing the raw IPC
   event to the page — the page should never get a handle on ipcRenderer. */
contextBridge.exposeInMainWorld("updateAPI", {
  check: () => ipcRenderer.invoke("update:check"),
  install: () => ipcRenderer.invoke("update:install"),
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
});
