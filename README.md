# Cut & Collect

A 2-team trick-taking card game for 4, 6, or 8 players, built with React — hunt down the
deck's four 10's before the other team does. First side to collect all four wins outright
(a "420" mercy finish); otherwise whoever holds more when all four are decided wins the hand.

Play solo against bots, or with real people over the internet by sharing a link.

Full rules are in [`cut-and-collect-project/RULES.md`](cut-and-collect-project/RULES.md).

## Playing with friends over the internet

One command, then send a link. Nobody needs to install anything.

```bash
npm install          # first time only
npm run play:online
```

That starts the game server and a public tunnel to it, and prints a link:

```
https://some-random-words.trycloudflare.com
```

Send that link to whoever's playing. They open it on any device on any network — phone,
laptop, anything with a browser — type a name, and enter the 4-letter room code you give
them. Lost the link? `npm run link` prints it again.

To host the game yourself, either open that same link, or use the desktop app while
`play:online` is running — both reach the same server.

**Leave that terminal open and your machine awake for as long as you're playing**: your
computer *is* the server. Ctrl+C ends the session, and restarting produces a new link
(an old one fails with Cloudflare error 1033).

First run needs the tunnel client, once — it's free and needs no account:

```bash
brew install cloudflared
```

[`RELEASING.md`](RELEASING.md) covers the rest: same-wifi play without a tunnel, hosting
the server permanently, and building the desktop app.

## Running it locally

```bash
npm install
npm run dev:all      # game server + Vite together
```

Then open `http://localhost:5173`. Two browser tabs are enough to test a real two-player
game. `npm run dev` alone runs solo mode only — multiplayer needs the server that
`dev:all` starts alongside it.

For the desktop shell, `npm run electron:dev`. To build it, `npm run package` (~4s, your
architecture only).

## What's here

| Path | Role |
|---|---|
| `shared/game-rules.js` | The rules — deck, legality, trick resolution, bot AI. Imported by **both** the browser and the server, so the two can't disagree. |
| `server/index.js` | Multiplayer server. Authoritative (it re-derives every play rather than trusting clients), and also serves the built game so one link is enough. |
| `cut-and-collect-project/TenSuitCutGame.jsx` | Screen flow: home, lobby, solo game, multiplayer game, end screens. |
| `cut-and-collect-project/GameTable.jsx` | The table itself — presentational, shared by solo and multiplayer. |
| `cut-and-collect-project/useMultiplayer.js` | WebSocket lifecycle; the only file that touches a socket. |
| `cut-and-collect-project/sound.js` | Synthesized effects, with optional `.mp3` overrides from `public/sounds/`. |
| `electron/main.js` | Desktop shell: window, leaderboard storage, auto-updater. |
| `scripts/tunnel.mjs` | Wraps `cloudflared` and prints the share link where you can't miss it. |

## Tech stack

React + Vite on the front, a plain Node WebSocket server (`ws`) on the back, Electron for
the desktop build. Rooms are held in memory — there's no database.
