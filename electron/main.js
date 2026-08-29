import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { app, BrowserWindow } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In dev, the Vite dev server is already running (started alongside Electron —
// see the "electron:dev" script in package.json) and serves the game at this
// URL, complete with hot-reload and the local leaderboard API. In a packaged
// build there is no dev server, so we load the pre-built static files instead.
const DEV_SERVER_URL = "http://localhost:5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 900,
    backgroundColor: "#061712",
    title: "Cut & Collect",
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    win.loadURL(DEV_SERVER_URL);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
