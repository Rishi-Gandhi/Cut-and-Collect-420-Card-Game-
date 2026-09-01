# Future ideas (not scheduled)

Captured for later — nothing here is being worked on yet.

## Gameplay
- Timed game mode — a time limit to pick and play a card each turn ("speed chess" style)
- Adjustable bot difficulty (easy/hard), by tuning how often the AI plays optimally
- Support for 8 or 10 players instead of a fixed 6 (RULES.md already says "6 or more")
- A "cheating" mode — sneak messages to your teammate about your hand, but if the other
  team catches on, they get to choose what card you play next

## Presentation
- ~~Sound effects~~ — done, and grown past the original scope: new-hand whoosh, card
  flip, a distinct first-cut sting, a point-scored chime, win/lose/tie fanfare. All
  synthesized with the Web Audio API in `sound.js`, no audio asset files needed. Drop
  your own `.mp3`/`.wav` into `public/sounds/` (see its README) to override any of them.
- ~~Simple play/deal animations instead of cards appearing instantly~~ — done, CSS
  keyframes (`cardPlayIn`, `cardDealIn`) in `TenSuitCutGame.jsx`
- ~~Make the overall UI bigger~~ — done, cards, fonts, table, and panels all sized up.
  Later trimmed the vertical spacing/padding back down (table height, panel padding,
  header padding) since the taller layout was forcing scroll — cards/fonts stayed big,
  just the gaps around them shrank.
- ~~Background music on the home screen and end screen~~ — done, separate synthesized
  loops for each screen (mellower on Home, brighter on End), same real-file override
  option via `public/sounds/home-music.mp3` / `end-music.mp3`. Also tried a third loop
  for the Game screen — too much on top of the card-flip/point-scored sounds, so that
  one was pulled back out.

## Multiplayer / social
- Chat room for players to message each other during a game, just for fun
- Real multiplayer — other humans instead of bots for Players 2–6
- Semi-multiplayer — a mix of some human players and some bots

## Leaderboard
- ~~Track each player's overall win/loss/tie record across all time, not just per-win
  snapshots — plus their personal best (fewest games to reach a 420)~~ — done. One row
  per player now (`leaderboard-store.js`'s `recordResult`), updated after every hand
  (not just full "420" wins), with `personalBest` set only on an actual mercy win.
  Ranked by personal best first, net wins as a fallback for players without one yet.

## Distribution
- Auto-updater for the desktop app, for if it's ever shared with others
- Package it as a real distributable app via TestFlight
