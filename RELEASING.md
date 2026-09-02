# Running & sharing Cut & Collect

Two different things people mean by "sharing this game", in the order you're
likely to want them:

1. **Play with friends right now** — they open a link. No install, no accounts.
2. **Give someone the desktop app** — a real `.dmg`/`.exe` they keep.

Start with the first. The second only matters if you want the game living on
someone's machine rather than in a browser tab.

---

## 1. Playing with friends over the internet

```bash
npm run play:online
```

That starts the game server and a Cloudflare tunnel together, then prints a
link in a box:

```
https://survivors-activation-miles-lounge.trycloudflare.com
```

**Send that link to whoever's playing.** They open it on any device on any
network — phone, laptop, anything with a browser — type a name, and enter the
4-letter room code you give them. Nothing to install, nothing to configure: the
same server that hands out the page also runs the games, so the client works
out where to connect on its own.

Lost the link, or the banner scrolled past? Print it again:

```bash
npm run link
```

First run needs the tunnel client, once — it's free and needs no account:

```bash
brew install cloudflared
```

### The catches

- **A new link every run.** Restarting mints a new hostname. Reusing an old one
  fails as Cloudflare error 1033 / HTTP 530, which looks like a broken tunnel
  but only means "that address doesn't exist any more".
- **It lives as long as the terminal does.** Ctrl+C ends it, and your machine
  has to stay awake — sleeping the laptop drops everyone.
- **Traffic runs through your home connection**, so your upload speed is the
  ceiling. Irrelevant for a card game's small messages.
- **Anyone with the link can reach the server** while it's up. There's no login;
  unguessable room codes are the only thing gating a game. Fine for an evening
  with friends, not something to leave running unattended.

---

## 2. Sharing the desktop app

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

## Fallbacks

None of this is needed for the link above. Reach for it only if that doesn't fit.

### Same-wifi play, without a tunnel

```bash
npm run dev:lan
```

Others on your network open `http://<your-mac-ip>:5173` in a browser — find the
IP with `ipconfig getifaddr en0`. No internet round-trip, but it reaches only
the same network.

### Pointing a client at a different server

The lobby has a `SERVER` line with a **change** button. What you type is saved
on that device and used for every connection after; **Reset** returns to the
default.

Two situations actually need it:

- **The packaged desktop app.** It loads over `file://`, which has no hostname
  to derive a server address from, so it falls back to `localhost` and can't
  reach another machine — not even on the same wifi — until told where to look.
  Browsers never hit this, because the page itself answers the question.
- **Testing against another server** without disturbing the default.

Input is forgiving: `my-game.fly.dev`, a pasted `https://…` URL, or
`192.168.1.42:8787`. The protocol is worked out for you — local addresses get
`ws://` (plus port 8787 if omitted), everything else `wss://` — and the lobby
shows the resulting address before you commit to it.

### A permanent address

The tunnel dies with the terminal. For a URL that doesn't, the server has to run
somewhere always-on: any host that runs Node and allows WebSockets (Railway,
Render, Fly, a VPS).

`server/index.js` is already built for that — it reads `process.env.PORT`, binds
`0.0.0.0`, serves the built client out of `dist/`, and answers `GET /health`
with JSON so platform health checks pass. Run `npm run build` first, then start
it with `npm run server`.

No deploy config is committed, because none is in use. A `Dockerfile` and
`fly.toml` existed briefly and were removed as clutter; `git log --diff-filter=D
-- Dockerfile fly.toml` will find them if they'd save you time later.

If you do host it permanently, bake the address in so nobody has to type it:

```bash
cp .env.example .env
# VITE_MP_SERVER_URL=wss://your-server.example.com
npm run package
```

That sets only the *default* — the SERVER field can still override it.

---

## Local development

```bash
npm run dev:all       # multiplayer server + Vite, in one command
npm run electron:dev  # same, plus the desktop shell
```

With no `.env`, a dev client connects to `ws://localhost:8787`, which is what
`npm run server` starts. Two browser tabs at http://localhost:5173 are enough to
test a real two-player game.

After `npm run build`, `npm run server` serves the built game at
http://localhost:8787 with no Vite involved — exactly what people reach through
the tunnel.

### Which build command to use

| Command | Output | Time | Use it for |
|---|---|---|---|
| `npm run package` | `release/mac-arm64/Cut & Collect.app` — your architecture only, no installers | ~4s | Day-to-day: checking a change in the real desktop shell |
| `npm run package:dist` | dmg + zip, arm64 **and** x64 | minutes, ~660MB | Installers, without publishing them |
| `npm run release` | Same as `package:dist`, then uploads to GitHub Releases | minutes | An actual release |

`package` passes electron-builder's `--dir`, which skips installer creation and
builds only for this machine's architecture. The other two build every target in
the `build.mac` config — downloading a second Electron binary for x64 and
writing four ~165MB artifacts, hence the minutes.
