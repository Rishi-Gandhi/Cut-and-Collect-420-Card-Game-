import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronUpdater from "electron-updater";
import { readLeaderboard, recordResult } from "../leaderboard-store.js";

const { app, BrowserWindow, ipcMain } = electron;
const { autoUpdater } = electronUpdater;
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

/* ---------- auto-update ----------
   Checks GitHub Releases (configured under "build.publish" in package.json) for
   a build with a higher version than this one, downloads it in the background,
   and installs it on the next quit.

   Two things worth knowing before relying on this:

   1. It only runs in a packaged app. In dev there's no update feed and no
      installed copy to replace, so we skip it entirely rather than log errors.

   2. macOS requires the app to be **code-signed** for updates to install.
      Squirrel.Mac refuses to swap in an unsigned bundle, so on an unsigned
      build the download succeeds and the install silently no-ops. Everything
      here is wired and correct — it starts working the moment signing is added
      (see RELEASING.md). Windows and Linux update fine unsigned.

   Update progress is forwarded to the renderer so the UI can surface it; the
   window is looked up lazily since updates can land after it's created. */
function sendToRenderer(channel, payload) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function initAutoUpdate() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => sendToRenderer("update:status", { state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    sendToRenderer("update:status", { state: "available", version: info?.version })
  );
  autoUpdater.on("update-not-available", () => sendToRenderer("update:status", { state: "current" }));
  autoUpdater.on("download-progress", (p) =>
    sendToRenderer("update:status", { state: "downloading", percent: Math.round(p?.percent ?? 0) })
  );
  autoUpdater.on("update-downloaded", (info) =>
    sendToRenderer("update:status", { state: "ready", version: info?.version })
  );
  autoUpdater.on("error", (err) =>
    // a failed update check should never be fatal — the game still plays fine
    sendToRenderer("update:status", { state: "error", message: String(err?.message || err) })
  );

  autoUpdater.checkForUpdates().catch(() => {});
}

// let the renderer trigger a check, and apply a downloaded update on demand
ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) return { state: "dev" };
  try {
    await autoUpdater.checkForUpdates();
    return { state: "checking" };
  } catch (err) {
    return { state: "error", message: String(err?.message || err) };
  }
});
ipcMain.handle("update:install", () => {
  if (app.isPackaged) autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();
  initAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
