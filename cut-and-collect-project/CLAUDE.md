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
- **Empty seats are bots.** A non-host disconnecting hands their seat to a bot and the
  table plays on. **The host disconnecting ends the game for everyone** — the server
  sends `roomClosed` and deletes the room, since the host is the only seat that can deal
  the next hand. Rooms are in-memory only; a restart drops them.
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
- `GameTable` rotates seats so the local player is always the bottom seat
  (`displayIndex`), since online you may be any seat number.
- Server URL comes from `VITE_MP_SERVER_URL`, inlined at **build** time (Vite env vars
  are not runtime-readable). Defaults to `ws://localhost:8787`. See `RELEASING.md`.

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
