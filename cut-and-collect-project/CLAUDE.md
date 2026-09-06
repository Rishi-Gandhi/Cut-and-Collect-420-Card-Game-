# Project: Cut & Collect (10-collecting trick card game)

A React card game with two modes — **Solo** (vs. bots, fully local) and **Multiplayer**
(real players over WebSockets, joined by a 4-letter room code) — shipped as a desktop
app via Electron.

## Read this first

`RULES.md` has the full game rules. Read it before making **any** gameplay logic
change — the cut-suit mechanic and the mercy ("420") rule are easy to get subtly wrong.

## Layout

| File | Role |
|---|---|
| `shared/game-rules.js` | **The single source of truth for the rules.** Plain JS — no React, no DOM, no Node APIs — because both the browser and the server import it. |
| `server/index.js` | Multiplayer server. Authoritative: it re-derives every play itself rather than trusting clients. |
| `cut-and-collect-project/TenSuitCutGame.jsx` | Screen-flow controller + Home, Lobby, Solo, Multiplayer, End screens. |
| `cut-and-collect-project/GameTable.jsx` | The in-game view. Purely presentational — shared by solo and multiplayer. |
| `cut-and-collect-project/MatchSummary.jsx` | Multiplayer end screen: per-hand match stats. Solo uses `EndScreen` instead. |
| `cut-and-collect-project/useMultiplayer.js` | WebSocket lifecycle; the only file that touches a socket. |
| `cut-and-collect-project/styles.js` | All inline-style objects + keyframes. |
| `cut-and-collect-project/UpdateBanner.jsx` | Auto-update UI; renders nothing outside packaged Electron. |
| `electron/main.js` | Window, leaderboard IPC, auto-updater. |

## The rule that matters most

**Never fork the game rules.** `shared/game-rules.js` is imported by the client *and*
the server. If you add a rule, add it there — a second copy would desync networked
games in ways that are miserable to debug. The client re-uses `classifyPlay` to grey
out illegal cards precisely so the UI can't disagree with what the server will accept.

## Multiplayer specifics

- **The server is the authority.** Clients send intents (`{type:"play", cardId}`); the
  server validates via `classifyPlay` and broadcasts the result. A client's claim about
  what role a card was played as is ignored entirely.
- **Hidden information is enforced server-side.** `buildView()` sends each player their
  own hand plus *card counts* for everyone else. Never widen that to the full state —
  it would put every opponent's cards in the browser's network tab.
- **Empty seats are bots**, but "empty" has two meanings and nearly every seat rule
  turns on the difference. A seat whose player *dropped* is **reserved** — a bot covers
  it so the table never stalls, but it stays theirs (`SEAT_HOLD_MS`, 3 min) and nobody
  else may take it. A seat that is **open** — never occupied, or its hold lapsed — can
  be claimed by a spectator. `seatIsReserved`/`seatIsOpen` are the only correct way to
  ask; `!clientId` alone would hand a dropped player's seat to the next stranger.
- **Reconnecting is by token, not by name or connection.** Sitting down mints a random
  per-seat token; the client keeps it in localStorage and sends it back with `resume`.
  Anything weaker would let one player walk into another's seat and be dealt their hand.
  The token has no expiry of its own — `SEAT_HOLD_MS` governs how long the seat is
  *withheld from others*, and claiming a lapsed seat mints a fresh token, which
  invalidates the old one.
- **A dropped host no longer ends the table.** The job is promoted to another connected
  player (or held, if nobody is left to inherit, so a returning host gets it back), and
  the host can also hand it over deliberately with `transferHost`. Closing the room for
  everyone is now an explicit `closeRoom` message. The old behaviour — host drops,
  everyone's night ends — was a cure worse than the disease.
- **Rooms are parked, not deleted, when the last person leaves** (`EMPTY_ROOM_GRACE_MS`).
  Game timers stop, but the room survives long enough to be reconnected to; otherwise
  there would be nothing to come back to. Still in-memory only — a restart drops them.
- **Spectators hold no seat, and that *is* the security model.** `client.seat == null`
  is what every action handler checks, and what makes `buildView` withhold every hand:
  no seat means no hand to fill in, so a watcher receives only the public table. Never
  "fix" a spectator's empty hand by sending them the raw state — anyone can open a
  second tab on the room they're playing in.
- Sound in multiplayer is driven by *diffing successive server snapshots* (new hand on
  `gameNumber`, first-cut sting on `cutSuit` going null → set), not by a local play
  handler like solo has. Adding a new cue means adding it in both places.
- `devWin` is a server message, not a client-side hack — a client faking a win locally
  would just be overwritten by the next broadcast. It forces a mercy finish for the
  caller's team so the Claim Victory → End screen flow can be tested.
- **The two modes end differently, on purpose.** Solo finishes on `EndScreen`
  (leaderboard + personal best); multiplayer finishes on `MatchSummary` (who won, hand
  number, cut suit, who was forced into the first cut, and which individual player took
  each 10 — for *both* teams). **Multiplayer results are not written to the leaderboard
  at all** — that's a personal solo-progress record, and mixing in team games against
  humans would muddy it. `recordHandResult` is called only from `SoloGameScreen`.
- `MatchSummary` renders from a snapshot the client takes the instant a 420 lands, not
  from live `view`. That's deliberate: the host clicking through closes the room, and
  the snapshot is what lets everyone else still see results instead of a dead end.
  Per-seat credit comes from `firstCutSeat` / `tensBySeat` in the shared state.
- **Two separate reasons music can fail to start**, both fixed in `sound.js` and both
  invisible on localhost. The mp3-vs-synthesized choice depends on an async HEAD probe,
  so reading it synchronously loses a race on first paint and wrongly picks the synth
  fallback — `startMusic` waits on the probe promise instead. And browsers refuse audio
  before a user gesture, so the first attempt is rejected outright; a rejection now arms
  a one-shot retry on the next click or keypress. Testing either of these requires a
  browser with its real autoplay policy — passing `--autoplay-policy=no-user-gesture-required`
  hides the second bug completely.
- `GameTable` rotates seats so the local player is always the bottom seat
  (`displayIndex`), since online you may be any seat number.
- **Finding the server is three-tiered**, in `useMultiplayer.js`: a per-device override
  in `localStorage` (edited from the lobby) beats `VITE_MP_SERVER_URL` inlined at build
  time, which beats deriving the address from the page's own host. The last of those is
  what makes browser LAN play work with no configuration; the override exists because a
  packaged app loads over `file://`, has no host to derive from, and would otherwise be
  permanently stuck on `localhost`. `normalizeServerUrl()` infers `ws://` vs `wss://`
  from whether the host is local — getting that backwards is the single most common
  "works locally, dead when deployed" failure, so it isn't left to the user to type.
- The connect path reads the URL from a **ref**, not the state value. `connect()` is a
  `useCallback`; closing over the state would keep dialling the previous server after a
  change.
- The server answers plain HTTP alongside the WebSocket: `/health` returns JSON, and
  everything else serves the client (below). Hosting platforms health-check over HTTP
  and restart anything that rejects those requests — which a WebSocket-only listener
  does. It also binds `0.0.0.0`, since binding loopback inside a container makes the
  process unreachable while looking fine in the logs.
- **The server also serves the built client** out of `dist/`, which is what makes
  "send a friend a link" work: page and WebSocket share an origin, so the client's
  derive-from-page-host rule lands on the right address with no configuration. That
  rule uses the page's *own port* in a build (`window.location.host`) and only names
  8787 in dev, where Vite serves the page from a different origin — naming 8787 in a
  build breaks every case where the page arrives over 443.
- The static handler supports **Range requests**, because otherwise a browser has to
  finish downloading a music file before playing a note of it — survivable locally,
  not over a tunnel where `lobby-music.mp3` is 35MB. It also refuses any path that
  escapes `dist/`; this listener is internet-facing whenever the tunnel is up.
- No deploy config is committed. `npm run play:online` (server + Cloudflare tunnel)
  is the sharing path; see `RELEASING.md`.

## Other notes

- The default export is a screen-flow controller: Home → (Lobby) → Game → End. `EndScreen`
  shows after a "420" mercy win *for the local player's team*. Any other outcome continues
  the session via "Deal New Hand"; `gameNumber` only resets on Quit or Play Again.
- The leaderboard writes to a real file: `window.leaderboardAPI` over IPC inside Electron,
  falling back to a dev-only Vite middleware API in a plain browser. Every hand's outcome
  is recorded, not just wins; `personalBest` only moves on an actual mercy win.
- Bot AI is `botChooseCard()` in the shared module — a simple heuristic, not a
  lookahead/minimax player. Difficulty tunes only *how often a bot fights for a trick*,
  not which specific card it picks.
- Styling is inline-style objects in `styles.js`, felt-green/brass casino aesthetic
  (Bebas Neue for display, IBM Plex Mono for data/cards, Inter for UI text) via a Google
  Fonts `@import`.
- **The turn timer works in both modes, but is implemented twice on purpose.** Solo runs
  a local countdown and auto-plays from the client. Multiplayer's clock is owned by the
  *server* (`room.turnLimit` / `room.turnDeadline` in `scheduleAdvance`) — clients only
  render it and never act on reaching zero, or several of them would race to auto-play
  the same seat. The server sends `turnMsLeft` as a **duration, not a deadline**, because
  players' device clocks disagree and a timestamp would render wrong for anyone skewed.
  Only the host's choice applies; a room carries one clock for everyone.

## Running it

```bash
npm run dev:all       # multiplayer server + Vite together
npm run electron:dev  # ...plus the desktop shell
```

Two browser tabs on http://localhost:5173 is enough to test a real two-player game.
