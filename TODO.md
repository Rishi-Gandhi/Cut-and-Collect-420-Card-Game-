# Future ideas (not scheduled)

Captured for later — nothing here is being worked on yet.

## Gameplay
- ~~Timed game mode — a time limit to pick and play a card each turn ("speed chess"~~
  ~~style)~~ — done. A TURN TIMER picker on the home screen (Off/15s/8s) starts a
  countdown once it's the human's turn; hitting 0 auto-plays a passive card for them
  (lowest legal, but it'll still grab a 10 that's on the table) so a stalled human
  doesn't hold up the bots. Later extended to **multiplayer**, where the clock is run by
  the server instead of the client — otherwise each player's device would drift and
  several could race to auto-play the same seat. Only the host's pick applies (one clock
  per room, shown in the lobby), and everyone can see the countdown ticking under
  whoever's turn it is, not just their own.
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
- Volume controls. Levels are hardcoded today — `startMusic` takes a `fileVolume`
  (0.35 for the music loops) and the synthesized effects each pass their own
  `peakGain`, so there's no single place a player can turn things down and nothing
  remembers a preference. Wants a settings control (music and effects separately is
  the usual split), persisted per device like the server address is, and `sound.js`
  reading from that rather than from constants at each call site.
- Make the layout adapt to the browser window — it gets cut off at smaller sizes.
  This matters more now than it did: the share link means people open the game on
  phones and laptops of every size, not just the desktop window it was tuned for.
  The table seats are already positioned in percentages, but the surrounding chrome
  (card sizes, panel padding, the fixed-height felt, the side chat column) is not, so
  the page overflows rather than reflowing. Vertical spacing was trimmed once before
  for the same reason — that bought room, it didn't make it responsive.
- ~~Compress the audio~~ — done for the one file that mattered. `lobby-music.mp3` was
  14.5 minutes at 320kbps stereo, 33MB on its own; re-encoded to 96kbps mono it's 10MB
  with the full track intact, taking `public/sounds/` from 41MB to 17MB. That weight
  was being paid twice — once into every desktop build, and again over the host's home
  upload link for each friend opening the share link. 64kbps mono would reach 6.6MB if
  it's ever worth another pass; trimming the track to a shorter loop (it repeats
  anyway) would do far more, but changes what you actually hear.
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
  one was pulled back out. Later grew a third loop for the multiplayer **lobby**:
  minor-key and deliberately unresolved so waiting for people to join feels like
  something's about to happen, rather than the settled Home loop. Override via
  `public/sounds/lobby-music.mp3`. Still nothing during a hand.

## Multiplayer / social
- ~~Chat room for players to message each other during a game, just for fun~~ — done,
  a side-column chat panel on the Game screen (name + team + message). Now routed
  through the multiplayer server, so it's a real channel between real players; in Solo
  it renders disabled (the bots aren't much for conversation).
- ~~Real multiplayer — other humans instead of bots for Players 2–6~~ — done. A SOLO /
  MULTIPLAYER picker on the home screen; multiplayer goes through a lobby where you
  create a room (4-letter code) or join one. An authoritative Node WebSocket server
  (`server/index.js`) owns the game state and only ever sends each player their own
  hand — opponents' cards never reach the client. Game rules were extracted to
  `shared/game-rules.js` so client and server run the exact same code.
- ~~Semi-multiplayer — a mix of some human players and some bots~~ — done, and it's the
  default rather than a separate mode: any seat nobody joins is played by a bot, so the
  host can start without a full table.
- ~~Reconnect to a game in progress~~ — done. A dropped player's seat is *held* for
  three minutes with a bot covering it, rather than surrendered. The server issues a
  per-seat token when you sit down; the client keeps it in localStorage and walks back
  in with it. A blip reconnects automatically with no button to press; a closed tab or
  a reload gets a "Rejoin room XXXX" offer on the home screen. A room whose last player
  drops is *parked* for three minutes rather than deleted, so there's something to come
  back to.
- ~~Spectator mode for a full room~~ — done. A room that's full or already under way
  now offers to let you watch instead of just refusing. Spectators hold no seat, which
  is also the whole of the security model: with no seat there's no hand to send them,
  so they get the public table (card counts, the trick, chat) and nobody's cards. They
  can talk, labelled as watching, and can take a seat that genuinely frees up.
- ~~Let the host hand off host duties before leaving~~ — done, both ways. The host can
  pass the job to any connected player from the lobby, and a host who simply drops has
  it promoted to someone else automatically instead of ending everyone's night. Closing
  the table for everyone is now a deliberate "End Table" button rather than a side
  effect of the host's wifi.

## Match results
- ~~A multiplayer end screen that's about the match, not a personal record~~ — done.
  A 420 in multiplayer now ends on a `MatchSummary` screen instead of the solo
  leaderboard one: winning team, hand number, cut suit, who was forced into the first
  cut, and which individual player captured each 10 — shown for both teams, winner
  card first. Losers get the same breakdown, not a dead end. Multiplayer results are
  deliberately **not** written to the leaderboard, which stays a solo-progress record.
- Carry stats across a whole session, not just the final hand (most 10's over the
  night, most first cuts, etc.) — needs the server to accumulate per-room history

## Leaderboard
- A global leaderboard, shared across everyone who plays. Today's is per-machine: it
  writes a local `leaderboard.json` (over Electron IPC in the desktop app, via a
  dev-only Vite middleware in the browser), so two people playing the same game keep
  entirely separate records and nobody can compare. Making it global means the server
  owns it — which is a real change, because the server currently keeps *nothing* on
  disk: rooms are in memory and vanish on restart. So this needs actual persistence
  (even a JSON file on the host would do to start), and some notion of player identity
  sturdier than a name typed into a box, or the board fills with duplicate "Rishi"s.
  Worth deciding at the same time whether multiplayer results count toward it — they
  deliberately don't today, since the board is a solo-progress record.
- ~~Track each player's overall win/loss/tie record across all time, not just per-win~~
  snapshots — plus their personal best (fewest games to reach a 420)~~ — done. One row
  per player now (`leaderboard-store.js`'s `recordResult`), updated after every hand
  (not just full "420" wins), with `personalBest` set only on an actual mercy win.
  Ranked by personal best first, net wins as a fallback for players without one yet.

## Distribution
- ~~Auto-updater for the desktop app, for if it's ever shared with others~~ — done,
  `electron-updater` against GitHub Releases, with a quiet home-screen banner that
  offers "Restart & Update" once a download finishes. `npm run release` builds and
  uploads. **Caveat:** macOS refuses to install an unsigned update, so on Mac the
  download succeeds and the install silently no-ops until the app is code-signed
  (Apple Developer account, $99/yr) — Windows/Linux update fine unsigned. Full
  process and the signing steps are in `RELEASING.md`.
- ~~Let people on other networks play, not just the same wifi~~ — done, and without
  hosting anything. `npm run play:online` runs the server plus a Cloudflare quick
  tunnel, and the server now serves the built client too, so there's a single link to
  send: the page and the WebSocket share an origin, which means a friend opens it and
  plays with nothing to install or configure. Costs nothing and needs no account. The
  trade is that your machine is the server — the link dies with the terminal and
  changes every run.
- A permanent address, so the link doesn't change and your laptop isn't the server.
  `server/index.js` is already shaped for it (reads `PORT`, binds `0.0.0.0`, serves
  `dist/`, has a `/health` endpoint) — it just needs a host. A `Dockerfile`/`fly.toml`
  were written and then deleted as unused; `git log --diff-filter=D` will find them.
- Some way to gate a room beyond an unguessable code. While a tunnel is up, anyone
  with the link can reach the server.
- Package it as a real distributable app via TestFlight
