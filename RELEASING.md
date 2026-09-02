# Releasing Cut & Collect

Two separate things ship, and they ship independently:

| Piece | Where it runs | How it updates |
|---|---|---|
| **The desktop app** | Each player's machine | Auto-updater, from GitHub Releases |
| **The multiplayer server** | One cloud host | You redeploy it |

The app is the thing that auto-updates. The server is a single long-running
process that everyone connects to — update it and every player gets the change
immediately, no download required.

---

## 1. Deploying the multiplayer server

The server (`server/index.js`) is a plain Node WebSocket process with one
dependency (`ws`). It holds rooms in memory, so restarting it drops any games in
progress — fine for this, and it means no database to run.

It listens on `process.env.PORT`, falling back to 8787, which is the convention
every platform below expects.

### Fly.io (recommended — generous free allowance, WebSockets work by default)

```bash
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth signup              # or `fly auth login`
fly launch --no-deploy       # name the app; skip the database prompts
fly deploy
```

`fly launch` writes a `fly.toml`. Make sure it has an HTTP service on the
internal port the server uses:

```toml
[http_service]
  internal_port = 8787
  force_https = true
  auto_stop_machines = "suspend"
  min_machines_running = 1     # keep 1 warm so the first player isn't waiting
```

Your URL will be `https://<app-name>.fly.dev`. For the game, use the WebSocket
form: `wss://<app-name>.fly.dev`.

> **`wss://`, not `ws://`.** Fly terminates TLS for you, and a browser on an
> HTTPS page refuses to open a plaintext `ws://` connection. Getting this wrong
> is the single most common "it works locally but not deployed" cause.

### Railway / Render

Both auto-detect Node. Set the start command to `npm run server`. Same rule
applies — use the `wss://` form of the URL they give you.

### Pointing the app at the deployed server

`VITE_MP_SERVER_URL` is read at **build time** (that's how Vite env vars work —
they're inlined into the bundle, not read at runtime). So it must be set before
you build:

```bash
cp .env.example .env
# edit .env:
#   VITE_MP_SERVER_URL=wss://your-app-name.fly.dev
npm run release
```

A shipped app can't be repointed at a different server without a rebuild. If you
move hosts, that's a new release.

---

## 2. Releasing the desktop app

### One-time setup

Create a GitHub token so `electron-builder` can upload release assets:

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. Tick the **`repo`** scope. Nothing else is needed.
3. Export it in the shell you release from:

```bash
export GH_TOKEN=ghp_your_token_here
```

Don't commit this. It's a password for your repo.

### Cutting a release

The updater compares the running app's version against the newest GitHub
Release. **If you don't bump the version, nothing updates** — this is the step
that's easy to forget.

```bash
npm version patch     # 0.0.1 -> 0.0.2 (also makes a git commit + tag)
npm run release       # builds, then uploads to GitHub Releases
git push && git push --tags
```

`npm run release` produces, per platform:

- **macOS** — `.dmg` (what people download the first time) and `.zip` (what the
  auto-updater consumes; Squirrel.Mac requires the zip, which is why both are built)
- **Windows** — NSIS `.exe` installer
- **Linux** — `.AppImage`

electron-builder also uploads a `latest-mac.yml` / `latest.yml` alongside them.
That small file *is* the update feed — the app fetches it, compares versions, and
decides whether to download. If it's missing, updates silently never happen.

Releases upload as **drafts**. Publish the draft on GitHub or clients won't see it.

### What the player experiences

On launch the app quietly checks for a newer version. If there is one it
downloads in the background and the home screen shows a banner offering
**Restart & Update**. If they ignore it, it installs on next quit anyway.
A failed check never blocks play.

---

## 3. The macOS signing caveat

**Right now, auto-update will not install on macOS.** Everything is wired
correctly and the download succeeds — but Squirrel.Mac refuses to swap in an
app bundle that isn't code-signed, so the install step silently does nothing.

This is a macOS platform requirement, not a bug in the setup here.

Practically, today:

- **macOS** — friends download the `.dmg` and install manually each time. On
  first launch they'll need to right-click → **Open** (or System Settings →
  Privacy & Security → *Open Anyway*), because Gatekeeper blocks unsigned apps
  opened by double-click.
- **Windows / Linux** — auto-update works unsigned. Windows may show a
  SmartScreen warning on first install.

### Turning macOS updates on later

Needs an Apple Developer account ($99/yr). Once you have one:

1. Create a **Developer ID Application** certificate and install it in your Keychain.
2. Add to the `mac` block in `package.json`:
   ```json
   "hardenedRuntime": true,
   "gatekeeperAssess": false,
   "notarize": true
   ```
3. Export credentials before releasing:
   ```bash
   export APPLE_ID=you@example.com
   export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx   # appleid.apple.com
   export APPLE_TEAM_ID=YOURTEAMID
   ```
4. `npm run release` as usual — it signs and notarizes automatically.

No application code changes. The updater starts working the moment builds are
signed.

---

## Local development

```bash
npm run dev:all       # multiplayer server + Vite, in one command
npm run electron:dev  # same, plus the desktop shell
```

With no `.env`, the client connects to `ws://localhost:8787`, which is what
`npm run server` starts. Two browser tabs at http://localhost:5173 are enough to
test a real two-player game.

### Which build command to use

| Command | Output | Time | Use it for |
|---|---|---|---|
| `npm run package` | `release/mac-arm64/Cut & Collect.app` — your architecture only, no installers | ~4s | Day-to-day: checking a change in the real desktop shell |
| `npm run package:dist` | dmg + zip, arm64 **and** x64 | minutes, ~660MB | Installers, without publishing them |
| `npm run release` | Same as `package:dist`, then uploads to GitHub Releases | minutes | An actual release |

`package` passes electron-builder's `--dir`, which skips installer creation and
builds only for this machine's architecture. The other two build every target in
the `build.mac` config — which means downloading a second Electron binary for
x64 and writing four ~165MB artifacts, hence the minutes. Reach for them only
when you need something shippable.

**Heads up:** a packaged app has no multiplayer server unless you give it one.
Built with no `.env`, it falls back to `ws://localhost:8787` — fine on your own
machine with `npm run server` running, useless to anyone you send the dmg to.
Set `VITE_MP_SERVER_URL` to a deployed server (section 1) before building
anything you intend to share.
