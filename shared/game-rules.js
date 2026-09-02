/* ---------------------------------------------------------------------------
   Cut & Collect — shared game rules.

   This module is the single source of truth for how the game works, and it is
   deliberately plain JavaScript: no React, no DOM, no Node-only APIs. That's
   what lets the exact same file run in two very different places —

     - the browser, for Solo mode (the React client plays out a local game), and
     - the multiplayer server, which is the *authority* on a networked game.

   Keeping one copy matters more than it might look. In multiplayer the server
   has to re-derive every decision itself rather than trust a client (otherwise
   a player could edit their hand in devtools and just declare a win). If the
   client and server each had their own copy of the rules, any drift between
   them would show up as a desync that's painful to debug. One file, imported
   by both, makes that class of bug impossible.

   See RULES.md for the human-readable rules this implements — especially the
   cut-suit mechanic and the mercy ("420") rule, which are the easy ones to get
   subtly wrong.
   ------------------------------------------------------------------------ */

/* ---------- constants ---------- */
export const SUITS = ["♠", "♥", "♦", "♣"];
export const RED_SUITS = ["♥", "♦"];
export const PLAYER_COUNTS = [4, 6, 8];

/* card ranks in play, low to high, per player count — the lowest ranks are
   dropped so the deck always divides evenly across seats:
   4p: full 52-card deck, 13 each. 6p/8p: drop the 2's, 48 cards, 8 or 6 each. */
const RANKS_DROP_2S = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const RANKS_BY_PLAYER_COUNT = {
  4: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
  6: RANKS_DROP_2S,
  8: RANKS_DROP_2S,
};

export function buildRankValue(ranks) {
  return Object.fromEntries(ranks.map((r, i) => [r, i + 1]));
}
/* convenience: go straight from a seat count to its rank-value lookup, so
   callers don't have to carry the ranks array around alongside the state */
export function rankValueFor(seatCount) {
  return buildRankValue(RANKS_BY_PLAYER_COUNT[seatCount]);
}

export const TEAM_OF = (seat) => (seat % 2 === 0 ? "A" : "B");
export const TEAM_SHORT = { A: "Team A", B: "Team B" };

export const BOT_DIFFICULTIES = ["easy", "normal", "hard"];
/* difficulty tunes how often a bot fights for a trick it isn't already
   winning (beating the led suit, or cutting in) versus just dumping a low
   card — a 10 already on the table always overrides this and forces the
   bot to try, regardless of difficulty. */
export const BOT_DIFFICULTY_SETTINGS = {
  easy: { followBeatProb: 0.15, cutProb: 0.12 },
  normal: { followBeatProb: 0.35, cutProb: 0.3 },
  hard: { followBeatProb: 0.9, cutProb: 0.85 },
};

export function suitName(s) {
  return { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" }[s];
}

/* ---------- deck helpers ---------- */
export function buildDeck(ranks) {
  const deck = [];
  for (const s of SUITS) for (const r of ranks) deck.push({ suit: s, rank: r, id: `${r}${s}` });
  return deck;
}
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function sortHand(cards, rankValue) {
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return rankValue[a.rank] - rankValue[b.rank];
  });
}
export function dealHands(seatCount, ranks, rankValue) {
  const deck = shuffle(buildDeck(ranks));
  const hands = Array.from({ length: seatCount }, () => []);
  for (let i = 0; i < deck.length; i++) hands[i % seatCount].push(deck[i]);
  return hands.map((h) => sortHand(h, rankValue));
}

/* ---------- trick evaluation ---------- */
export function evaluateWinner(trick, rankValue) {
  const cuts = trick.filter((p) => p.role === "cut");
  const pool = cuts.length ? cuts : trick.filter((p) => p.role === "lead" || p.role === "follow");
  return pool.reduce((best, p) => (rankValue[p.card.rank] > rankValue[best.card.rank] ? p : best), pool[0]);
}
export function tensIn(trick) {
  return trick.filter((p) => p.card.rank === "10").length;
}
export function lowestOf(cards, rankValue) {
  return [...cards].sort((a, b) => rankValue[a.rank] - rankValue[b.rank])[0];
}
export function highestOf(cards, rankValue) {
  return [...cards].sort((a, b) => rankValue[b.rank] - rankValue[a.rank])[0];
}
export function randomOf(cards) {
  return cards[Math.floor(Math.random() * cards.length)];
}

/* ---------- legality ----------
   classifyPlay is the rules referee: given the current state and a card, it
   returns the role that card would be played as ("lead"/"follow"/"cut"/"trash"),
   or null if the play is illegal. Crucially the *role is derived, never
   supplied* — the server calls this rather than believing a client that claims
   "this was a cut". Both the human path and the bot path go through it, so
   there's exactly one implementation of what's legal. */
export function classifyPlay(state, seat, card) {
  if (state.phase !== "playing") return null;
  if (state.turn !== seat) return null;
  if (!state.hands[seat].some((c) => c.id === card.id)) return null;

  if (state.trick.length === 0) return "lead";

  const ledSuit = state.trick[0].card.suit;
  const holdsLed = state.hands[seat].some((c) => c.suit === ledSuit);
  if (holdsLed) {
    // must follow suit when able
    return card.suit === ledSuit ? "follow" : null;
  }
  // can't follow. The first such player in the whole hand is *forced* to cut —
  // whatever they play sets the cut suit, and there's no trash option yet.
  if (state.cutSuit === null) return "cut";
  return card.suit === state.cutSuit ? "cut" : "trash";
}

/* every card in a seat's hand that classifyPlay would accept right now */
export function legalCardsFor(state, seat) {
  return state.hands[seat].filter((c) => classifyPlay(state, seat, c) !== null);
}

/* picks any legal card at random — used when the turn timer expires. Follows
   the same legality rules as a human's manual play. */
export function randomLegalPlay(state, seat) {
  const legal = legalCardsFor(state, seat);
  if (!legal.length) return null;
  return randomOf(legal);
}

/* ---------- bot AI ----------
   A simple heuristic, not a lookahead/minimax player. Returns just a card —
   the role is derived by classifyPlay like every other play, so the bot can't
   accidentally invent an illegal role. */
export function botChooseCard(state, seat, rankValue, botSettings) {
  const hand = state.hands[seat];
  const teamMine = TEAM_OF(seat);
  if (state.trick.length === 0) {
    // lead: play lowest card, keep long suits for later
    return lowestOf(hand, rankValue);
  }
  const ledSuit = state.trick[0].card.suit;
  const hasLed = hand.filter((c) => c.suit === ledSuit);
  const currentBest = evaluateWinner(state.trick, rankValue);
  const amWinning = TEAM_OF(currentBest.seat) === teamMine;
  const trickHasTen = tensIn(state.trick) > 0;

  if (hasLed.length > 0) {
    if (amWinning) return lowestOf(hasLed, rankValue);
    const bestVal =
      currentBest.role === "follow" || currentBest.role === "lead" ? rankValue[currentBest.card.rank] : -1;
    const canBeat = currentBest.role === "cut" ? [] : hasLed.filter((c) => rankValue[c.rank] > bestVal);
    if (canBeat.length && (trickHasTen || Math.random() < botSettings.followBeatProb)) {
      return lowestOf(canBeat, rankValue);
    }
    return lowestOf(hasLed, rankValue);
  }

  // cannot follow suit
  if (state.cutSuit === null) {
    // the first cut of the hand is forced — whatever suit is played becomes the cut
    // suit, so just choose the best suit to lock in rather than whether to cut at all
    const counts = {};
    hand.forEach((c) => {
      counts[c.suit] = (counts[c.suit] || 0) + 1;
    });
    const bestSuit = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const candidates = hand.filter((c) => c.suit === bestSuit);
    return trickHasTen ? highestOf(candidates, rankValue) : lowestOf(candidates, rankValue);
  }

  const cutCards = hand.filter((c) => c.suit === state.cutSuit);
  const nonCut = hand.filter((c) => c.suit !== state.cutSuit);
  if (!amWinning && cutCards.length && (trickHasTen || Math.random() < botSettings.cutProb)) {
    const bestCutVal = currentBest.role === "cut" ? rankValue[currentBest.card.rank] : -1;
    const winners = cutCards.filter((c) => rankValue[c.rank] > bestCutVal);
    return winners.length ? lowestOf(winners, rankValue) : lowestOf(cutCards, rankValue);
  }
  if (nonCut.length) return lowestOf(nonCut, rankValue);
  return lowestOf(cutCards, rankValue);
}

/* ---------- state factory ---------- */
export function createHandState(seatNames, seatCount, leader = 0) {
  const ranks = RANKS_BY_PLAYER_COUNT[seatCount];
  const rankValue = buildRankValue(ranks);
  return {
    seatCount,
    hands: dealHands(seatCount, ranks, rankValue),
    leader,
    turn: leader,
    trick: [],
    cutSuit: null,
    scores: { A: 0, B: 0 },
    tensWon: { A: [], B: [] }, // suits of the 10's each team has captured
    /* Per-seat credit, for the multiplayer match summary. tensWon above is
       team-level and can't answer "who actually brought those points in" —
       these two can. Reset each hand, like everything else here. */
    firstCutSeat: null,
    tensBySeat: Array.from({ length: seatCount }, () => []),
    log: [`Hand dealt. ${seatNames[leader]} leads the first trick.`],
    phase: "playing", // playing | resolving | handOver
    result: null,
  };
}

/* ---------- state transitions ----------
   Both of these are pure: state in, brand-new state out, nothing mutated. That
   purity is what lets React's setState and the server's game loop share them —
   and it's what makes the server able to replay/validate a move without any
   side effects. */

/* Play one card. Returns { state, role } on success, or { error } if the play
   was illegal — the server surfaces that error back to the offending client
   instead of applying anything. */
export function applyPlay(state, seat, cardId, seatNames) {
  const card = state.hands[seat].find((c) => c.id === cardId);
  if (!card) return { error: "You don't hold that card." };
  const role = classifyPlay(state, seat, card);
  if (!role) return { error: "That's not a legal play right now." };

  const hands = state.hands.map((h, i) => (i === seat ? h.filter((c) => c.id !== card.id) : h));
  const trick = [...state.trick, { seat, card, role }];
  let cutSuit = state.cutSuit;
  let firstCutSeat = state.firstCutSeat;
  const log = [...state.log];
  const name = seatNames[seat];

  if (role === "lead") {
    log.push(`${name} leads with ${card.rank}${card.suit}.`);
  } else if (role === "follow") {
    log.push(`${name} follows with ${card.rank}${card.suit}.`);
  } else if (role === "cut") {
    if (cutSuit === null) {
      cutSuit = card.suit;
      firstCutSeat = seat; // whoever was forced to cut first defined the hand
      log.push(
        `${name} can't follow suit and cuts with ${card.rank}${card.suit} — ${suitName(card.suit)} is now the cut suit!`
      );
    } else {
      log.push(`${name} cuts with ${card.rank}${card.suit}!`);
    }
  } else {
    log.push(`${name} has nothing useful and discards ${card.rank}${card.suit}.`);
  }

  const nextTurn = (seat + 1) % state.seatCount;
  const phase = trick.length === state.seatCount ? "resolving" : "playing";
  return { state: { ...state, hands, trick, cutSuit, firstCutSeat, log, phase, turn: nextTurn }, role };
}

/* Score and clear a completed trick. Handles both end-of-hand conditions from
   RULES.md: the mercy "420" (one team took all four 10's) and the early finish
   (all four 10's decided, so no further trick can possibly score). */
export function resolveTrick(state, seatNames) {
  const rankValue = rankValueFor(state.seatCount);
  const winner = evaluateWinner(state.trick, rankValue);
  const team = TEAM_OF(winner.seat);
  const wonSuits = state.trick.filter((p) => p.card.rank === "10").map((p) => p.card.suit);
  const pts = wonSuits.length;
  const scores = { ...state.scores, [team]: state.scores[team] + pts };
  const tensWon = { ...state.tensWon, [team]: [...state.tensWon[team], ...wonSuits] };
  // credit the individual who took the trick, not just their team
  const tensBySeat = (state.tensBySeat || Array.from({ length: state.seatCount }, () => [])).map((suits, i) =>
    i === winner.seat ? [...suits, ...wonSuits] : suits
  );
  const log = [...state.log];

  if (winner.role === "cut") {
    log.push(`${seatNames[winner.seat]} takes the trick with the cut ${winner.card.rank}${winner.card.suit}.`);
  } else {
    log.push(`${seatNames[winner.seat]} takes the trick with the ${winner.card.rank}${winner.card.suit}.`);
  }
  if (pts > 0) {
    log.push(`${TEAM_SHORT[team]} captures ${pts} ten${pts > 1 ? "s" : ""}! Score — Team A: ${scores.A}, Team B: ${scores.B}.`);
  } else {
    log.push(`No tens in that trick — a nothing round. Score unchanged.`);
  }

  const totalTensDecided = tensWon.A.length + tensWon.B.length;
  if (totalTensDecided === 4) {
    // all four 10's are out of play — no further trick can possibly score,
    // so the hand ends right here regardless of cards still left to play.
    if (tensWon[team].length >= 4) {
      log.push(`${TEAM_SHORT[team]} has captured all four 10's — MERCY FINISH! That's a "420" — total domination!`);
      return { ...state, scores, tensWon, tensBySeat, trick: [], log, phase: "handOver", result: { type: "mercy", team } };
    }
    let result;
    if (scores.A === scores.B) {
      result = { type: "earlyTie" };
    } else {
      result = { type: "early", team: scores.A > scores.B ? "A" : "B" };
    }
    log.push(
      result.type === "earlyTie"
        ? `All four 10's are decided ${scores.A}-${scores.B} — EARLY FINISH, and it's a tie.`
        : `All four 10's are decided — EARLY FINISH. ${TEAM_SHORT[result.team]} wins ${Math.max(scores.A, scores.B)}-${Math.min(scores.A, scores.B)}.`
    );
    return { ...state, scores, tensWon, tensBySeat, trick: [], log, phase: "handOver", result };
  }
  return { ...state, scores, tensWon, tensBySeat, trick: [], log, phase: "playing", turn: winner.seat, leader: winner.seat };
}

/* which outcome key a finished hand counts as, from a given team's point of
   view — used for both the local W/L/T counter and the leaderboard record */
export function outcomeFor(result, team) {
  if (!result) return null;
  if (result.type === "earlyTie") return "tie";
  return result.team === team ? "win" : "loss";
}
