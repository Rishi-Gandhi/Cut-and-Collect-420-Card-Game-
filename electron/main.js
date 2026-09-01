import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLeaderboard, recordResult } from "../leaderboard-store.js";

const { app, BrowserWindow, ipcMain } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In dev, the Vite dev server is already running (started alongside Electron —
// see the "electron:dev" script in package.json) and serves the game at this
// URL, complete with hot-reload. In a packaged build there is no dev server,
// so we load the pre-built static files instead.
const DEV_SERVER_URL = "http://localhost:5173";

// A packaged .app is a read-only bundle — it can't write a save file into
// itself, and the original project folder won't even exist on someone else's
// machine. So it saves to the OS's real per-user app-data folder instead.
// Dev mode (npm run electron:dev) uses that exact same folder too, rather
// than a separate project-folder copy — otherwise dev-mode games and
// packaged-app games silently save to two different files, which is exactly
// how a real win (Sanu's, Aug 2026) went "missing" from dev mode even though
// it was never actually lost, just saved somewhere dev mode wasn't looking.
function getLeaderboardPath() {
  return path.join(app.getPath("userData"), "leaderboard.json");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 980,
    backgroundColor: "#061712",
    title: "Cut & Collect",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    win.loadURL(DEV_SERVER_URL);
  }

  if (process.env.DEBUG_DEVTOOLS) win.webContents.openDevTools();
}

ipcMain.handle("leaderboard:load", () => readLeaderboard(getLeaderboardPath()));
ipcMain.handle("leaderboard:save", (event, payload) => recordResult(getLeaderboardPath(), payload));

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
