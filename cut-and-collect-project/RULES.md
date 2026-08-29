# Cut & Collect — Game Rules

A 6+ player (even number only) trick-taking card game played in 2 teams. Teammates sit
in alternating seats around the circle (every other seat is your team). The objective is
to collect 10's — first side to 4 wins outright ("420" / mercy finish), otherwise once all
four 10's have been captured (whether or not cards are still left to play) it's an early
finish and whichever team holds more of them wins; an even split is a tie.

## Setup
- Players: even number, 6 or more.
- Teams: exactly 2, always. Seats alternate — odd seats one team, even seats the other.
- Deck: standard 52 cards, with the lowest-ranked cards removed evenly so everyone gets
  the same hand size. With 2's as the lowest rank (Aces are high), all four 2's are
  removed for 6 players (48 cards, 8 each) or 8 players (48 cards... adjust as needed —
  the general rule is: remove the lowest cards until the remaining deck divides evenly
  by the player count).
- Deal: one player shuffles and deals all cards out evenly. The player to the dealer's
  left leads the first trick.

## Card categories
- **Normal cards**: cards of the suit that was led in a trick.
- **Cut cards**: cards of the "cut suit" (see below). Cut always beats normal.
- **Trash cards**: any off-suit card played that is neither a follow nor a declared cut —
  contributes nothing to the trick.

Priority when determining the trick winner: **cut > normal > trash**.

## The cut suit
- No suit is the cut suit at the start of a hand.
- The **first player in the whole hand** who cannot follow the led suit is forced to cut —
  there is no trash option here. Whatever off-suit card they play automatically becomes a
  cut, permanently sets that card's suit as the cut suit for the rest of the hand, and
  the card immediately wins the trick over any normal cards played so far. They still
  choose *which* card (and therefore which suit becomes the cut suit) — they just can't
  opt out of cutting.
- Once the cut suit is set, any player who can't follow the led suit may:
  - play a card of the cut suit → this is automatically a cut (compared by rank against
    other cuts in the trick), or
  - play any other off-suit card → this is automatically trash, even if they hold cut
    suit cards (players can choose to save their cut cards for a later trick).
- A card that matches the cut suit but is played on a trick *led* by that same suit is
  just a normal follow, not a cut — cutting only happens when you can't follow the led
  suit.

## Playing a trick
1. The leader plays any card; its suit is the "led suit" for the trick.
2. Going around the table, each player must follow the led suit if they have one.
3. A player with no card of the led suit may cut (see above) or throw trash.
4. After everyone has played, the trick winner is: the highest cut card if any cut was
   played, otherwise the highest card of the led suit. Trash never wins.
5. The trick winner leads the next trick.

## Scoring
- Every 10 that ends up in a won trick's pile scores one point for the winning team —
  multiple 10's in the same trick score multiple points at once.
- Tricks with no 10 in them ("nothing rounds") award no points; the winning team simply
  takes the dead cards out of play.
- The hand ends the instant all four 10's have been captured between the two teams —
  there's no point playing out remaining "nothing round" tricks once no more points are
  possible, so the hand stops right there even if cards are still left in hand:
  - **Mercy finish ("420")**: one team has captured all four 10's — total domination.
  - **Early finish**: the four 10's are split between the teams (e.g. 3-1, 2-2). Whichever
    team holds more wins that hand; an even split (2-2) is a tie. This is functionally the
    same as playing the hand out to the last card — since every 10 is guaranteed to be
    captured by someone before the deck runs out, the result would have been identical
    either way — it just skips the meaningless remaining tricks.

## Worked example (from actual play)
- 6 players, seats 1-6 clockwise. Odd seats (1,3,5) = Team A, even seats (2,4,6) = Team B.
- Player 3 leads 9♣. Everyone follows with clubs except Player 6, who has no club — he
  plays 4♠, which automatically becomes a cut and locks in **spades as the cut suit** for
  the rest of the hand (he had no option to throw it as trash instead, since no cut suit
  had been set yet). That 4♠ now wins the trick outright over every club played (cut >
  normal), even though clubs was the led suit.
- Later, a trick is led with a diamond. A player with no diamonds — but holding spades —
  can now cut in with a spade to try to win the trick, since spades is already locked in.
- If a 10 lands in a trick that a cut card wins, the winning team still scores it — cut
  cards count exactly like normal winning cards for point purposes.
- The card that sets the cut suit can itself be a 10 — a 10 played as the very first cut
  simultaneously locks in that suit as the cut suit **and** still counts as a 10 for
  scoring if it wins the trick. Its rank and its role as the cut-suit-setter are
  independent; being a cut card never disqualifies a card from also being a scoring 10.
