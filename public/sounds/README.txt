Drop your own sound files in this folder to replace the built-in synthesized
ones. The game checks for these exact filenames on startup — if a file is
here, it gets used; if not, the synthesized sound plays instead. No code
changes needed, just add the file and reload the app.

  new-game.mp3         — played every time a hand is dealt (game start, and
                         each "Deal New Hand")
  card-flip.mp3        — played every time any player plays a card
  first-cut.mp3        — played on the very first cut of a hand, the moment
                         the cut suit gets established
  point-scored.mp3      — played whenever either team captures a ten
  win-fanfare.mp3      — played when your team wins a hand
  lose-fanfare.mp3     — played when the other team wins a hand
  tie-fanfare.mp3      — played on an early-finish tie
  home-music.mp3       — looped quietly on the Home (start) screen
  lobby-music.mp3      — looped quietly on the multiplayer lobby (the room
                         code / waiting-for-players screen)
  end-music.mp3        — looped quietly on the End (victory) screen

No music track plays during a hand — only on those three screens, and moving
between them swaps one loop for the other.

.mp3 or .wav both work. Keep the one-shot sounds short (well under a second
for card flip/first cut/point scored, a couple seconds for the fanfares)
since gameplay doesn't pause for them to finish. The music tracks loop
automatically, so they can be any length.
