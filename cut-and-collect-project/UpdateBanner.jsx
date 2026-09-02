import React, { useState, useEffect } from "react";
import { styles } from "./styles.js";

/* ---------------------------------------------------------------------------
   UpdateBanner — surfaces auto-update progress on the home screen.

   window.updateAPI only exists inside the packaged Electron app (it's created
   by electron/preload.cjs), so in a browser tab or `npm run dev` this renders
   nothing at all and costs nothing. That's the same optional-API pattern the
   leaderboard uses: feature-detect rather than branch on "am I in Electron".

   Deliberately quiet — it stays hidden while everything is up to date, and
   only speaks up when there's something to download or install.
   ------------------------------------------------------------------------ */
export function UpdateBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!window.updateAPI) return;
    // onStatus returns its own unsubscribe function, which is exactly what an
    // effect cleanup wants — without it, a remount would stack up listeners.
    return window.updateAPI.onStatus(setStatus);
  }, []);

  if (!window.updateAPI || !status) return null;

  const { state, version, percent, message } = status;
  // nothing worth interrupting the player for
  if (state === "current" || state === "checking" || state === "dev") return null;

  return (
    <div style={styles.updateBar}>
      {state === "available" && <span>Update {version} found — downloading…</span>}
      {state === "downloading" && <span>Downloading update… {percent}%</span>}
      {state === "ready" && (
        <>
          <span>Version {version} is ready to install.</span>
          <button style={styles.updateBtn} onClick={() => window.updateAPI.install()}>
            Restart &amp; Update
          </button>
        </>
      )}
      {state === "error" && <span>Couldn't check for updates: {message}</span>}
    </div>
  );
}
