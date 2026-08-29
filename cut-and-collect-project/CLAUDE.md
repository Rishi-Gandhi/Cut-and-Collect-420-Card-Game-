# Project: Cut & Collect (10-collecting trick card game)

This is a browser card game built as a single React component: `TenSuitCutGame.jsx`.

- Full game rules are written out in `RULES.md` — read that first before making any
  gameplay logic changes, since the rules (especially the cut-suit mechanic and the
  mercy rule) are easy to get subtly wrong.
- The component is currently self-contained (no external state, no build config
  assumptions) so it can be dropped into any React app — Vite, CRA, Next, etc. It does
  rely on one Vite-specific import (`import rulesRaw from "./RULES.md?raw"`, used to
  render the rules on the home screen) — swap that for a plain string if porting off Vite.
- The default export (`TenSuitCutGame`) is a screen-flow controller: Home → Game → End.
  `HomeScreen` collects the player's name and shows the rules; `GameScreen` holds all the
  existing trick-taking logic (renamed internally, same behavior); `EndScreen` shows after
  a "420" mercy-rule win *for the human's team specifically* (Team A). Any other hand
  outcome (tie, score win, or the bots hitting 420) just continues the session via "Deal
  New Hand" — the running `gameNumber` only resets on Quit or Play Again.
- The leaderboard is persisted to the browser's `localStorage` (key
  `cutAndCollect.leaderboard`) — there's no backend, so this is the closest thing to "a
  file" a pure front-end app can write. Entries are added only on a Team A 420 win.
- Bot AI lives in `botChoosePlay()` inside the component — it's a simple heuristic, not
  a lookahead/minimax player. Feel free to improve it.
- Styling is inline-style based with a felt-green/brass casino aesthetic (fonts: Bebas
  Neue for display, IBM Plex Mono for data/cards, Inter for UI text), loaded via a
  Google Fonts `@import` in a `<style>` tag.

When asked to add features (running match score across hands, adjustable player count,
difficulty levels, animations, sound, multiplayer, etc.), check RULES.md for anything
relevant before changing scoring or turn logic.
