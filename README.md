# Cut & Collect

A 6+ player, 2-team trick-taking card game built with React — hunt down the deck's four
10's before the other team does. First side to collect all four wins outright (a "420"
mercy finish); otherwise whoever holds more when all four are decided wins the hand.

Full rules are in [`cut-and-collect-project/RULES.md`](cut-and-collect-project/RULES.md).

## Running it locally

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`) in your browser.

## What's here

- `cut-and-collect-project/TenSuitCutGame.jsx` — the entire game: home screen, gameplay,
  bot AI, and the end/leaderboard screen.
- `cut-and-collect-project/RULES.md` — the full rules, also shown in-app on the home screen.
- `vite.config.js` — dev server config, plus a small local API that saves win records to
  `cut-and-collect-project/leaderboard.json` (kept out of version control — see `.gitignore`).
- `src/main.jsx` / `index.html` — the minimal entry point that mounts the React app.

## Tech stack

React + Vite. No backend beyond the small dev-only leaderboard API in `vite.config.js`.
