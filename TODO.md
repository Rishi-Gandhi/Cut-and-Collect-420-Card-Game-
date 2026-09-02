# Future ideas (not scheduled)

Captured for later — nothing here is being worked on yet.

## Gameplay
- ~~Timed game mode — a time limit to pick and play a card each turn ("speed chess"~~
  ~~style)~~ — done. A TURN TIMER picker on the home screen (Off/15s/8s) starts a
  countdown once it's the human's turn; hitting 0 auto-plays a passive card for them
  (lowest legal, but it'll still grab a 10 that's on the table) so a stalled human
  doesn't hold up the bots.
- ~~Adjustable bot difficulty (easy/hard), by tuning how often the AI plays~~
  ~~optimally~~ — done, as three levels (Easy/Normal/Hard) rather than two, with Normal
  matching the original always-on behavior so existing games aren't affected by default.
  Tunes the two `Math.random()` thresholds in `botChoosePlay` that decide whether a bot
  fights for a trick (beats the led suit, or cuts in) versus dumping a low card — a 10
  already on the table still always forces the fight, regardless of difficulty.
- ~~Support for 8 players instead of a fixed 6~~ — done, and widened further to include 4.
  A PLAYERS picker on the home screen (4/6/8) drives deck composition per RULES.md's
  Setup table (4p: 52 cards/13 each, 6p & 8p: drop the 2's for 48 cards/8 or 6 each) plus
  seat count, hand size, and the table's seat/trick layout. The 6-player table layout
  keeps its original hand-tuned positions; 4/8 fall back to a generic evenly-spaced
  ellipse. A 10-player option was tried and then dropped — even with a wider table, played
  cards in the trick area sat too close together with 10 hands in flight.
- A "cheating" mode — sneak messages to your teammate about your hand, but if the other
  team catches on, they get to choose what card you play next

## Presentation
- ~~Sound effects~~ — done, and grown past the original scope: new-hand whoosh, card
  flip, a distinct first-cut sting, a point-scored chime, win/lose/tie fanfare. All
  synthesized with the Web Audio API in `sound.js`, no audio asset files needed. Drop
  your own `.mp3`/`.wav` into `public/sounds/` (see its README) to override any of them.
- ~~Simple play/deal animations instead of cards appearing instantly~~ — done, CSS
  keyframes (`cardPlayIn`, `cardDealIn`) in `TenSuitCutGame.jsx`
- ~~Make the overall UI bigger— done, cards, fonts, table, and panels all sized up.~~
  Later trimmed the vertical spacing/padding back down (table height, panel padding,
  header padding) since the taller layout was forcing scroll — cards/fonts stayed big,
  just the gaps around them shrank.
- ~~Background music on the home screen and end screen— done, separate synthesized~~
  loops for each screen (mellower on Home, brighter on End), same real-file override
  option via `public/sounds/home-music.mp3` / `end-music.mp3`. Also tried a third loop
  for the Game screen — too much on top of the card-flip/point-scored sounds, so that
  one was pulled back out.

## Multiplayer / social
- Chat room for players to message each other during a game, just for fun
- Real multiplayer — other humans instead of bots for Players 2–6
- Semi-multiplayer — a mix of some human players and some bots

## Leaderboard
- ~~Track each player's overall win/loss/tie record across all time, not just per-win~~
  snapshots — plus their personal best (fewest games to reach a 420)~~ — done. One row
  per player now (`leaderboard-store.js`'s `recordResult`), updated after every hand
  (not just full "420" wins), with `personalBest` set only on an actual mercy win.
  Ranked by personal best first, net wins as a fallback for players without one yet.

## Distribution
- Auto-updater for the desktop app, for if it's ever shared with others
- Package it as a real distributable app via TestFlight
