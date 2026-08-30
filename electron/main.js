import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLeaderboard, appendLeaderboardEntry } from "../leaderboard-store.js";

const { app, BrowserWindow, ipcMain } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In dev, the Vite dev server is already running (started alongside Electron —
// see the "electron:dev" script in package.json) and serves the game at this
// URL, complete with hot-reload. In a packaged build there is no dev server,
// so we load the pre-built static files instead.
const DEV_SERVER_URL = "http://localhost:5173";

// A packaged .app is a read-only bundle — it can't write a save file into
// itself, and the original project folder won't even exist on someone else's
// machine. So a packaged build saves to the OS's real per-user app-data folder
// instead. Running unpackaged (npm run electron:dev), we reuse the exact same
// project file the browser/dev-server version uses, so both stay in sync.
function getLeaderboardPath() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "leaderboard.json");
  }
  return path.join(__dirname, "../cut-and-collect-project/leaderboard.json");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 900,
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
ipcMain.handle("leaderboard:save", (event, entry) => appendLeaderboardEntry(getLeaderboardPath(), entry));

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
