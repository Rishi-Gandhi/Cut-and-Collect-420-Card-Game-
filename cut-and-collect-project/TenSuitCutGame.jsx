import React, { useState, useEffect, useRef, useCallback } from "react";
import rulesRaw from "./RULES.md?raw";
import {
  unlockAudio,
  playNewGame,
  playCardFlip,
  playFirstCut,
  playPointScored,
  playWinFanfare,
  playLoseFanfare,
  playTieFanfare,
  startHomeMusic,
  startEndMusic,
  stopBackgroundMusic,
} from "./sound.js";

/* ---------- constants ---------- */
const SUITS = ["♠", "♥", "♦", "♣"];
const RED_SUITS = ["♥", "♦"];
const PLAYER_COUNTS = [4, 6, 8];
/* turn timer options for timed mode — null means untimed */
const TIME_LIMIT_OPTIONS = [
  { label: "OFF", value: null },
  { label: "15s", value: 15 },
  { label: "8s", value: 8 },
];
/* card ranks in play, low to high, per player count — the lowest ranks are
   dropped so the deck always divides evenly across seats:
   4p: full 52-card deck, 13 each. 6p/8p: drop the 2's, 48 cards, 8 or 6 each. */
const RANKS_DROP_2S = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANKS_BY_PLAYER_COUNT = {
  4: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
  6: RANKS_DROP_2S,
  8: RANKS_DROP_2S,
};
function buildRankValue(ranks) {
  return Object.fromEntries(ranks.map((r, i) => [r, i + 1]));
}
const TEAM_OF = (seat) => (seat % 2 === 0 ? "A" : "B");
const TEAM_SHORT = { A: "Team A", B: "Team B" };

function getSeatNames(playerName, seatCount) {
  const name = (playerName || "").trim() || "You";
  const names = [name];
  for (let i = 2; i <= seatCount; i++) names.push(`Player ${i}`);
  return names;
}

/* seat layout around the oval table (percent positions) — index order
   matches turn order (0→1→...→0), laid out clockwise starting at the
   bottom so play visibly proceeds Player 1 → ... → Player N. The 6-seat
   case keeps its original hand-tuned positions; other seat counts fall
   back to an evenly-spaced ellipse. */
const SEAT_POS_6 = [
  { left: "50%", top: "93%" }, // 0 you - bottom
  { left: "13%", top: "76%" }, // 1 - bottom left
  { left: "13%", top: "22%" }, // 2 - top left
  { left: "50%", top: "5%" },  // 3 - top
  { left: "87%", top: "22%" }, // 4 - top right
  { left: "87%", top: "76%" }, // 5 - bottom right
];
const TRICK_POS_6 = [
  { left: "50%", top: "76%" },
  { left: "28%", top: "64%" },
  { left: "28%", top: "36%" },
  { left: "50%", top: "24%" },
  { left: "72%", top: "36%" },
  { left: "72%", top: "64%" },
];
const TABLE_CENTER = { x: 50, y: 49 };
function getSeatPositions(seatCount) {
  if (seatCount === 6) return SEAT_POS_6;
  const rx = 40, ry = 44;
  const positions = [];
  for (let i = 0; i < seatCount; i++) {
    const theta = ((90 + (360 / seatCount) * i) * Math.PI) / 180;
    positions.push({
      left: `${TABLE_CENTER.x + rx * Math.cos(theta)}%`,
      top: `${TABLE_CENTER.y + ry * Math.sin(theta)}%`,
    });
  }
  return positions;
}
function getTrickPositions(seatCount) {
  if (seatCount === 6) return TRICK_POS_6;
  const scale = 0.62;
  return getSeatPositions(seatCount).map((p) => ({
    left: `${TABLE_CENTER.x + (parseFloat(p.left) - TABLE_CENTER.x) * scale}%`,
    top: `${TABLE_CENTER.y + (parseFloat(p.top) - TABLE_CENTER.y) * scale}%`,
  }));
}

/* ---------- deck helpers ---------- */
function buildDeck(ranks) {
  const deck = [];
  for (const s of SUITS) for (const r of ranks) deck.push({ suit: s, rank: r, id: `${r}${s}` });
  return deck;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sortHand(cards, rankValue) {
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return rankValue[a.rank] - rankValue[b.rank];
  });
}
function dealHands(seatCount, ranks, rankValue) {
  const deck = shuffle(buildDeck(ranks));
  const hands = Array.from({ length: seatCount }, () => []);
  for (let i = 0; i < deck.length; i++) hands[i % seatCount].push(deck[i]);
  return hands.map((h) => sortHand(h, rankValue));
}

/* ---------- trick evaluation ---------- */
function evaluateWinner(trick, rankValue) {
  const cuts = trick.filter((p) => p.role === "cut");
  const pool = cuts.length ? cuts : trick.filter((p) => p.role === "lead" || p.role === "follow");
  return pool.reduce((best, p) => (rankValue[p.card.rank] > rankValue[best.card.rank] ? p : best), pool[0]);
}
function tensIn(trick) {
  return trick.filter((p) => p.card.rank === "10").length;
}
function lowestOf(cards, rankValue) {
  return [...cards].sort((a, b) => rankValue[a.rank] - rankValue[b.rank])[0];
}
function highestOf(cards, rankValue) {
  return [...cards].sort((a, b) => rankValue[b.rank] - rankValue[a.rank])[0];
}
function randomOf(cards) {
  return cards[Math.floor(Math.random() * cards.length)];
}
/* picks any legal card at random — used when the turn timer expires. Follows
   the same legality rules as a human's manual play: must follow the led suit
   if holding one, otherwise any card is fair game (and its suit decides
   whether it's a cut, sets the cut suit, or is trash). */
function randomLegalPlay(hand, trick, cutSuit) {
  if (trick.length === 0) {
    return { card: randomOf(hand), role: "lead" };
  }
  const ledSuit = trick[0].card.suit;
  const hasLed = hand.filter((c) => c.suit === ledSuit);
  if (hasLed.length > 0) {
    return { card: randomOf(hasLed), role: "follow" };
  }
  const card = randomOf(hand);
  if (cutSuit === null) return { card, role: "cut" };
  return { card, role: card.suit === cutSuit ? "cut" : "trash" };
}

/* ---------- bot AI ---------- */
/* difficulty tunes how often a bot fights for a trick it isn't already
   winning (beating the led suit, or cutting in) versus just dumping a low
   card — a 10 already on the table always overrides this and forces the
   bot to try, regardless of difficulty. */
const BOT_DIFFICULTIES = ["easy", "normal", "hard"];
const BOT_DIFFICULTY_SETTINGS = {
  easy: { followBeatProb: 0.15, cutProb: 0.12 },
  normal: { followBeatProb: 0.35, cutProb: 0.3 },
  hard: { followBeatProb: 0.9, cutProb: 0.85 },
};
function botChoosePlay(seat, hand, trick, cutSuit, rankValue, botSettings) {
  const teamMine = TEAM_OF(seat);
  if (trick.length === 0) {
    // lead: play lowest card, keep long suits for later
    return { card: lowestOf(hand, rankValue), role: "lead" };
  }
  const ledSuit = trick[0].card.suit;
  const hasLed = hand.filter((c) => c.suit === ledSuit);
  const currentBest = evaluateWinner(trick, rankValue);
  const amWinning = TEAM_OF(currentBest.seat) === teamMine;
  const trickHasTen = tensIn(trick) > 0;

  if (hasLed.length > 0) {
    if (amWinning) return { card: lowestOf(hasLed, rankValue), role: "follow" };
    const bestVal = currentBest.role === "follow" || currentBest.role === "lead" ? rankValue[currentBest.card.rank] : -1;
    const canBeat = currentBest.role === "cut" ? [] : hasLed.filter((c) => rankValue[c.rank] > bestVal);
    if (canBeat.length && (trickHasTen || Math.random() < botSettings.followBeatProb)) {
      return { card: lowestOf(canBeat, rankValue), role: "follow" };
    }
    return { card: lowestOf(hasLed, rankValue), role: "follow" };
  }

  // cannot follow suit
  if (cutSuit === null) {
    // the first cut of the hand is forced — whatever suit is played becomes the cut
    // suit, so just choose the best suit to lock in rather than whether to cut at all
    const counts = {};
    hand.forEach((c) => {
      counts[c.suit] = (counts[c.suit] || 0) + 1;
    });
    const bestSuit = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const candidates = hand.filter((c) => c.suit === bestSuit);
    const card = trickHasTen ? highestOf(candidates, rankValue) : lowestOf(candidates, rankValue);
    return { card, role: "cut" };
  } else {
    const cutCards = hand.filter((c) => c.suit === cutSuit);
    const nonCut = hand.filter((c) => c.suit !== cutSuit);
    if (!amWinning && cutCards.length && (trickHasTen || Math.random() < botSettings.cutProb)) {
      const bestCutVal = currentBest.role === "cut" ? rankValue[currentBest.card.rank] : -1;
      const winners = cutCards.filter((c) => rankValue[c.rank] > bestCutVal);
      const card = winners.length ? lowestOf(winners, rankValue) : lowestOf(cutCards, rankValue);
      return { card, role: "cut" };
    }
    if (nonCut.length) return { card: lowestOf(nonCut, rankValue), role: "trash" };
    return { card: lowestOf(cutCards, rankValue), role: "cut" };
  }
}

/* ---------- initial state factory ---------- */
function freshGame(seatNames, seatCount, ranks, rankValue, leader = 0) {
  const hands = dealHands(seatCount, ranks, rankValue);
  return {
    hands,
    leader,
    turn: leader,
    trick: [],
    cutSuit: null,
    scores: { A: 0, B: 0 },
    tensWon: { A: [], B: [] }, // suits of the 10's each team has captured
    log: [`Hand dealt. ${seatNames[leader]} leads the first trick.`],
    phase: "playing", // playing | resolving | handOver
    result: null,
  };
}

/* ---------- leaderboard persistence — a real file on disk
   (cut-and-collect-project/leaderboard.json). Inside Electron, window.leaderboardAPI
   (exposed by electron/preload.js) talks straight to the main process over IPC, no
   server needed — this is what makes it work in a packaged .app. In a plain browser
   (window.leaderboardAPI doesn't exist there), it falls back to fetching the small
   dev-only API added in vite.config.js. ---------- */
async function loadLeaderboard() {
  if (window.leaderboardAPI) {
    try {
      return await window.leaderboardAPI.load();
    } catch {
      return [];
    }
  }
  try {
    const res = await fetch("/api/leaderboard");
    if (!res.ok) throw new Error("bad response");
    return await res.json();
  } catch {
    return [];
  }
}
/* Records the outcome of one hand (win/loss/tie) against the player's
   lifetime record. personalBestCandidate is only passed on an actual "420"
   mercy win — that's the only time "fewest games to reach 420" applies. */
async function recordHandResult(name, result, personalBestCandidate = null) {
  const payload = { name, result, personalBestCandidate };
  if (window.leaderboardAPI) {
    try {
      return await window.leaderboardAPI.save(payload);
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("bad response");
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------- top-level flow: home -> game -> end ---------- */
export default function TenSuitCutGame() {
  const [screen, setScreen] = useState("home"); // home | game | end
  const [playerName, setPlayerName] = useState("");
  const [playerCount, setPlayerCount] = useState(6);
  const [botDifficulty, setBotDifficulty] = useState("normal");
  const [turnTimeLimit, setTurnTimeLimit] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [winResult, setWinResult] = useState(null);

  useEffect(() => {
    loadLeaderboard().then(setLeaderboard);
  }, []);

  // The win/loss/tie record and personal best are already saved by
  // GameScreen's per-hand effect (every hand counts, not just the final
  // victory) — this just re-fetches the now-current leaderboard and builds
  // the celebratory details for the End screen banner.
  async function handleUserWin(details) {
    const updated = await loadLeaderboard();
    setLeaderboard(updated);
    setWinResult({
      name: (playerName || "").trim() || "You",
      gameNumber: details.gameNumber,
      opponentTens: details.scores.B,
    });
    setScreen("end");
  }

  if (screen === "home") {
    return (
      <HomeScreen
        playerName={playerName}
        setPlayerName={setPlayerName}
        playerCount={playerCount}
        setPlayerCount={setPlayerCount}
        botDifficulty={botDifficulty}
        setBotDifficulty={setBotDifficulty}
        turnTimeLimit={turnTimeLimit}
        setTurnTimeLimit={setTurnTimeLimit}
        onStart={() => setScreen("game")}
        leaderboard={leaderboard}
      />
    );
  }

  if (screen === "end") {
    return (
      <EndScreen
        result={winResult}
        leaderboard={leaderboard}
        onPlayAgain={() => {
          setWinResult(null);
          setScreen("game");
        }}
        onHome={() => {
          setWinResult(null);
          setScreen("home");
        }}
      />
    );
  }

  return (
    <GameScreen
      playerName={playerName}
      playerCount={playerCount}
      botDifficulty={botDifficulty}
      turnTimeLimit={turnTimeLimit}
      onUserWin={handleUserWin}
      onQuit={() => setScreen("home")}
    />
  );
}

/* ---------- home screen ---------- */
function HomeScreen({
  playerName, setPlayerName, playerCount, setPlayerCount,
  botDifficulty, setBotDifficulty, turnTimeLimit, setTurnTimeLimit,
  onStart, leaderboard,
}) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const canStart = playerName.trim().length > 0;

  useEffect(() => {
    startHomeMusic();
    return () => stopBackgroundMusic();
  }, []);

  return (
    <div style={{ ...styles.wrap, ...styles.homeWrap }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={styles.header}>
        <div style={styles.title}>CUT &amp; COLLECT</div>
        <div style={styles.subtitle}>a ten-hunting trick game · {playerCount} at the table</div>
      </div>

      <div style={styles.homeBody}>
        <div style={styles.homeCard}>
          <label style={styles.homeLabel} htmlFor="playerNameInput">YOUR NAME</label>
          <input
            id="playerNameInput"
            style={styles.nameInput}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canStart) onStart();
            }}
            placeholder="Enter your name"
            maxLength={24}
            autoFocus
          />
          <label style={styles.homeLabel}>PLAYERS</label>
          <div style={styles.playerCountRow}>
            {PLAYER_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                style={{ ...styles.playerCountBtn, ...(playerCount === n ? styles.playerCountBtnActive : {}) }}
                onClick={() => setPlayerCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <label style={styles.homeLabel}>BOT DIFFICULTY</label>
          <div style={styles.playerCountRow}>
            {BOT_DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                style={{ ...styles.playerCountBtn, ...(botDifficulty === d ? styles.playerCountBtnActive : {}) }}
                onClick={() => setBotDifficulty(d)}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>
          <label style={styles.homeLabel}>TURN TIMER</label>
          <div style={styles.playerCountRow}>
            {TIME_LIMIT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                style={{ ...styles.playerCountBtn, ...(turnTimeLimit === opt.value ? styles.playerCountBtnActive : {}) }}
                onClick={() => setTurnTimeLimit(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            style={{ ...styles.dealBtn, ...(canStart ? {} : styles.dealBtnDisabled) }}
            disabled={!canStart}
            onClick={() => {
              unlockAudio();
              onStart();
            }}
          >
            Start Game
          </button>
          <button style={styles.trashBtn} onClick={() => setShowLeaderboard((v) => !v)}>
            {showLeaderboard ? "Hide Leaderboard" : "View Leaderboard"}
          </button>
        </div>

        {showLeaderboard && <Leaderboard entries={leaderboard} />}

        <div style={styles.rulesPanel}>
          <div style={styles.rulesTitle}>HOW TO PLAY</div>
          {renderMarkdownLite(rulesRaw)}
        </div>
      </div>
    </div>
  );
}

/* ---------- end screen ---------- */
function EndScreen({ result, leaderboard, onPlayAgain, onHome }) {
  useEffect(() => {
    startEndMusic();
    return () => stopBackgroundMusic();
  }, []);

  return (
    <div style={{ ...styles.wrap, ...styles.endWrap }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={styles.header}>
        <div style={styles.title}>CUT &amp; COLLECT</div>
      </div>

      <div style={styles.endBanner}>
        <div style={styles.resultText}>MERCY FINISH — {result?.name || "YOU"} WIN! (420)</div>
        <div style={styles.endSub}>
          Sealed it in {result?.gameNumber ?? "?"} hand{result?.gameNumber === 1 ? "" : "s"}, leaving the
          opposition with {result?.opponentTens ?? 0} ten{result?.opponentTens === 1 ? "" : "s"}.
        </div>
        <div style={styles.pendingBtns}>
          <button style={styles.dealBtn} onClick={onPlayAgain}>Play Again</button>
          <button style={styles.trashBtn} onClick={onHome}>Back to Home</button>
        </div>
      </div>

      <div style={styles.endLeaderboardWrap}>
        <Leaderboard entries={leaderboard} />
      </div>
    </div>
  );
}

function Leaderboard({ entries }) {
  const top = entries.slice(0, 10);
  return (
    <div style={styles.leaderboardPanel}>
      <div style={styles.leaderboardTitle}>LEADERBOARD</div>
      {top.length === 0 ? (
        <div style={styles.leaderboardEmpty}>No hands recorded yet — be the first!</div>
      ) : (
        <div style={styles.leaderboardTable}>
          {top.map((e, i) => (
            <div key={i} style={styles.leaderboardRow}>
              <span style={styles.lbRank}>#{i + 1}</span>
              <span style={styles.lbName}>{e.name}</span>
              <span style={styles.lbDetail}>
                {e.wins}W-{e.losses}L-{e.ties}T
                {e.personalBest != null &&
                  ` · PB: ${e.personalBest} game${e.personalBest === 1 ? "" : "s"}`}
              </span>
              <span style={styles.lbDate}>
                {e.lastPlayed ? new Date(e.lastPlayed).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- gameplay screen ---------- */
function GameScreen({ playerName, playerCount, botDifficulty, turnTimeLimit, onUserWin, onQuit }) {
  const seatCount = playerCount;
  const ranks = RANKS_BY_PLAYER_COUNT[seatCount];
  const rankValue = buildRankValue(ranks);
  const botSettings = BOT_DIFFICULTY_SETTINGS[botDifficulty];
  const seatNames = getSeatNames(playerName, seatCount);
  const seatPositions = getSeatPositions(seatCount);
  const trickPositions = getTrickPositions(seatCount);
  const [game, setGame] = useState(() => ({
    ...freshGame(seatNames, seatCount, ranks, rankValue),
    gameNumber: 1,
    outcomes: { win: 0, loss: 0, tie: 0 },
  }));
  const logEndRef = useRef(null);
  const [chatMessages, setChatMessages] = useState([]);
  function sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setChatMessages((m) => [...m, { name: seatNames[0], team: TEAM_OF(0), text: trimmed }]);
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [game.log.length]);

  useEffect(() => {
    playNewGame();
  }, [game.gameNumber]);

  /* commit a play onto the trick, then advance */
  const commitPlay = useCallback((seat, card, role) => {
    if (role === "cut" && game.cutSuit === null) playFirstCut();
    else playCardFlip();
    setGame((g) => {
      const hands = g.hands.map((h, i) => (i === seat ? h.filter((c) => c.id !== card.id) : h));
      const trick = [...g.trick, { seat, card, role }];
      let cutSuit = g.cutSuit;
      let log = [...g.log];
      const name = seatNames[seat];

      if (role === "lead") {
        log.push(`${name} leads with ${card.rank}${card.suit}.`);
      } else if (role === "follow") {
        log.push(`${name} follows with ${card.rank}${card.suit}.`);
      } else if (role === "cut") {
        if (cutSuit === null) {
          cutSuit = card.suit;
          log.push(`${name} can't follow suit and cuts with ${card.rank}${card.suit} — ${suitName(card.suit)} is now the cut suit!`);
        } else {
          log.push(`${name} cuts with ${card.rank}${card.suit}!`);
        }
      } else {
        log.push(`${name} has nothing useful and discards ${card.rank}${card.suit}.`);
      }

      const nextTurn = (seat + 1) % seatCount;
      if (trick.length === seatCount) {
        return { ...g, hands, trick, cutSuit, log, phase: "resolving", turn: nextTurn };
      }
      return { ...g, hands, trick, cutSuit, log, turn: nextTurn };
    });
  }, [seatNames, game.cutSuit, seatCount]);

  /* resolve a completed trick */
  useEffect(() => {
    if (game.phase !== "resolving") return;
    const t = setTimeout(() => {
      setGame((g) => {
        const winner = evaluateWinner(g.trick, rankValue);
        const team = TEAM_OF(winner.seat);
        const wonSuits = g.trick.filter((p) => p.card.rank === "10").map((p) => p.card.suit);
        const pts = wonSuits.length;
        const scores = { ...g.scores, [team]: g.scores[team] + pts };
        const tensWon = { ...g.tensWon, [team]: [...g.tensWon[team], ...wonSuits] };
        let log = [...g.log];
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
            const outcomeKey = team === "A" ? "win" : "loss";
            const outcomes = { ...g.outcomes, [outcomeKey]: g.outcomes[outcomeKey] + 1 };
            return { ...g, scores, tensWon, trick: [], log, phase: "handOver", result: { type: "mercy", team }, outcomes };
          }
          let result;
          let outcomeKey;
          if (scores.A === scores.B) {
            result = { type: "earlyTie" };
            outcomeKey = "tie";
          } else {
            result = { type: "early", team: scores.A > scores.B ? "A" : "B" };
            outcomeKey = result.team === "A" ? "win" : "loss";
          }
          log.push(
            result.type === "earlyTie"
              ? `All four 10's are decided ${scores.A}-${scores.B} — EARLY FINISH, and it's a tie.`
              : `All four 10's are decided — EARLY FINISH. ${TEAM_SHORT[result.team]} wins ${Math.max(scores.A, scores.B)}-${Math.min(scores.A, scores.B)}.`
          );
          const outcomes = { ...g.outcomes, [outcomeKey]: g.outcomes[outcomeKey] + 1 };
          return { ...g, scores, tensWon, trick: [], log, phase: "handOver", result, outcomes };
        }
        return { ...g, scores, tensWon, trick: [], log, phase: "playing", turn: winner.seat, leader: winner.seat };
      });
    }, 1100);
    return () => clearTimeout(t);
  }, [game.phase, seatNames, rankValue]);

  /* hand-over fanfare — a separate effect (not a call inside setGame's updater)
     so React's dev-mode double-invoking of state updaters can't play it twice */
  useEffect(() => {
    if (game.phase !== "handOver" || !game.result) return;
    const { type, team } = game.result;
    if (type === "earlyTie") playTieFanfare();
    else if (team === "A") playWinFanfare();
    else playLoseFanfare();
  }, [game.phase, game.result]);

  /* a team capturing a ten gets its own chime — tracked by total score
     climbing, so a new hand's reset back to 0 stays silent */
  const prevScoreSum = useRef(game.scores.A + game.scores.B);
  useEffect(() => {
    const sum = game.scores.A + game.scores.B;
    if (sum > prevScoreSum.current) playPointScored();
    prevScoreSum.current = sum;
  }, [game.scores.A, game.scores.B]);

  /* every hand's outcome (not just an eventual full "420" win) counts toward
     the player's lifetime record on the leaderboard — personalBest only
     moves on an actual mercy win for Team A, since that's the only time
     "fewest games to reach 420" applies */
  useEffect(() => {
    if (game.phase !== "handOver" || !game.result) return;
    const { type, team } = game.result;
    const name = (playerName || "").trim() || "You";
    if (type === "earlyTie") {
      recordHandResult(name, "tie");
    } else if (type === "mercy") {
      recordHandResult(name, team === "A" ? "win" : "loss", team === "A" ? game.gameNumber : null);
    } else {
      recordHandResult(name, team === "A" ? "win" : "loss");
    }
  }, [game.phase, game.result]);

  /* bot turns */
  useEffect(() => {
    if (game.phase !== "playing") return;
    if (game.turn === 0) return; // human
    const t = setTimeout(() => {
      const { card, role } = botChoosePlay(game.turn, game.hands[game.turn], game.trick, game.cutSuit, rankValue, botSettings);
      commitPlay(game.turn, card, role);
    }, 1800);
    return () => clearTimeout(t);
  }, [game.phase, game.turn, game.hands, game.trick, game.cutSuit, commitPlay, rankValue, botSettings]);

  /* turn timer (timed mode only) — counts down while it's the human's turn;
     hitting 0 plays a random legal card for them (still must follow the led
     suit if they hold one) so a stalled human doesn't stall the bots. */
  const [timeLeft, setTimeLeft] = useState(turnTimeLimit);
  const isHumanTurn = game.phase === "playing" && game.turn === 0;
  useEffect(() => {
    if (!turnTimeLimit || !isHumanTurn) {
      setTimeLeft(turnTimeLimit);
      return;
    }
    setTimeLeft(turnTimeLimit);
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [turnTimeLimit, isHumanTurn]);

  useEffect(() => {
    if (!turnTimeLimit || !isHumanTurn || timeLeft === null || timeLeft > 0) return;
    const { card, role } = randomLegalPlay(game.hands[0], game.trick, game.cutSuit);
    commitPlay(0, card, role);
  }, [timeLeft, turnTimeLimit, isHumanTurn, game.hands, game.trick, game.cutSuit, commitPlay]);

  /* human plays a card */
  function tryPlay(card) {
    if (game.phase !== "playing" || game.turn !== 0) return;
    const hand = game.hands[0];
    if (game.trick.length === 0) {
      commitPlay(0, card, "lead");
      return;
    }
    const ledSuit = game.trick[0].card.suit;
    const hasLed = hand.some((c) => c.suit === ledSuit);
    if (hasLed) {
      if (card.suit !== ledSuit) return;
      commitPlay(0, card, "follow");
      return;
    }
    if (game.cutSuit === null) {
      // the first cut of the hand is forced — no trash option, whatever is played
      // establishes the cut suit
      commitPlay(0, card, "cut");
      return;
    }
    const role = card.suit === game.cutSuit ? "cut" : "trash";
    commitPlay(0, card, role);
  }

  function newHand() {
    setGame((g) => {
      const gameNumber = g.gameNumber + 1;
      const leader = (gameNumber - 1) % seatCount; // lead rotates clockwise each hand
      return { ...freshGame(seatNames, seatCount, ranks, rankValue, leader), gameNumber, outcomes: g.outcomes };
    });
  }

  function handleQuit() {
    if (window.confirm("Quit this game? Your current progress won't be saved.")) {
      onQuit();
    }
  }

  // Dev/testing shortcut — instantly forces a Team A mercy finish so the
  // Claim Victory → End screen flow can be checked without playing a full
  // hand out. Goes through the exact same phase/result state a real mercy
  // win would, so it's a real test of the whole path, leaderboard save
  // included.
  function autoWin() {
    setGame((g) => ({
      ...g,
      trick: [],
      scores: { ...g.scores, A: 4 },
      tensWon: { A: ["♠", "♥", "♦", "♣"], B: g.tensWon.B },
      log: [...g.log, "(dev) Auto Win triggered — Team A captures all four 10's."],
      phase: "handOver",
      result: { type: "mercy", team: "A" },
    }));
  }

  const yourTurn = game.phase === "playing" && game.turn === 0;
  const hand = game.hands[0];
  const ledSuit = game.trick.length ? game.trick[0].card.suit : null;
  const hasLed = ledSuit && hand.some((c) => c.suit === ledSuit);
  const currentWinner = game.trick.length > 0 ? evaluateWinner(game.trick, rankValue) : null;

  return (
    <div style={{ ...styles.wrap, ...styles.gameWrap }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ ...styles.header, paddingTop: 66 }}>
        <div style={styles.topLeftControls}>
          <button style={styles.quitBtn} onClick={handleQuit}>Quit</button>
          <button style={styles.autoWinBtn} onClick={autoWin}>Auto Win (dev)</button>
        </div>
        <div style={styles.topRightControls}>
          <div style={styles.gameCounter}>GAME #{game.gameNumber}</div>
          <div style={styles.outcomesCounter}>
            <span style={styles.outcomeWin}>W {game.outcomes.win}</span>
            {" · "}
            <span style={styles.outcomeLoss}>L {game.outcomes.loss}</span>
            {" · "}
            <span style={styles.outcomeTie}>T {game.outcomes.tie}</span>
          </div>
        </div>
        <div style={styles.title}>CUT &amp; COLLECT</div>
        <div style={styles.subtitle}>a ten-hunting trick game · {seatCount} at the table</div>
      </div>

      <div style={styles.gameLayout}>
      <div style={{ ...styles.body, flex: 1, minWidth: 0 }}>
        {/* scoreboard */}
        <div style={styles.scorePanel}>
          <TeamScore team="A" tensWon={game.tensWon.A} score={game.scores.A} />
          <div style={styles.cutBadgeWrap}>
            <div style={styles.cutLabel}>CUT SUIT</div>
            <div style={{ ...styles.cutSeal, ...(game.cutSuit ? styles.cutSealSet : {}) }}>
              {game.cutSuit ? (
                <span style={{ color: RED_SUITS.includes(game.cutSuit) ? "#8C2F2F" : "#1c2118", fontSize: 24 }}>{game.cutSuit}</span>
              ) : (
                <span style={styles.cutSealDash}>—</span>
              )}
            </div>
          </div>
          <TeamScore team="B" tensWon={game.tensWon.B} score={game.scores.B} />
        </div>

        {/* table */}
        <div style={styles.tableOuter}>
          <div style={{ ...styles.tableFelt, ...(seatCount > 6 ? styles.tableFeltWide : {}) }}>
            {seatPositions.map((pos, seat) => (
              <div key={seat} style={{ ...styles.seat, left: pos.left, top: pos.top }}>
                <div
                  style={{
                    ...styles.seatLabel,
                    ...(game.turn === seat && game.phase === "playing" ? styles.seatActive : {}),
                    ...(currentWinner?.seat === seat ? styles.seatWinning : {}),
                  }}
                >
                  {seatNames[seat]}
                  <span style={styles.seatTeam}>{TEAM_OF(seat)}</span>
                </div>
                <div style={styles.seatHandCount}>
                  {seat === 0 ? "" : `${game.hands[seat].length} cards`}
                </div>
              </div>
            ))}

            {game.trick.map((p) => {
              const pos = trickPositions[p.seat];
              const isWinning = currentWinner?.seat === p.seat;
              return (
                <div
                  key={p.card.id}
                  style={{
                    ...styles.trickCard,
                    left: pos.left,
                    top: pos.top,
                    ...(isWinning ? styles.trickCardWinning : {}),
                    animation: "cardPlayIn 0.22s ease-out",
                  }}
                >
                  <CardFace card={p.card} tag={roleTag(p.role)} />
                </div>
              );
            })}

            {game.trick.length === 0 && game.phase === "playing" && (
              <div style={styles.tableCenterNote}>
                {game.turn === 0 ? "Your lead — pick a card" : `waiting on ${seatNames[game.turn]}...`}
              </div>
            )}
          </div>
        </div>

        {/* log */}
        <div style={styles.logPanel}>
          {game.log.map((l, i) => (
            <div key={i} style={styles.logLine}>{l}</div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* result banner */}
        {game.phase === "handOver" && (
          <div style={styles.resultBanner}>
            <div style={styles.resultText}>
              {game.result.type === "mercy"
                ? `MERCY FINISH — ${TEAM_SHORT[game.result.team]} TOTAL DOMINATION (420)`
                : game.result.type === "earlyTie"
                ? "EARLY FINISH — TIE GAME"
                : `EARLY FINISH — ${TEAM_SHORT[game.result.team]} WINS`}
            </div>
            {game.result.type === "mercy" && game.result.team === "A" ? (
              <button
                style={styles.dealBtn}
                onClick={() => onUserWin({ gameNumber: game.gameNumber, scores: game.scores })}
              >
                Claim Victory →
              </button>
            ) : (
              <button style={styles.dealBtn} onClick={newHand}>Deal New Hand</button>
            )}
          </div>
        )}

        {/* your hand */}
        <div style={styles.handPanel}>
          <div style={styles.handHeader}>
            YOUR HAND {yourTurn && <span style={styles.turnPing}>● your turn</span>}
            {yourTurn && turnTimeLimit != null && (
              <span style={{ ...styles.turnTimer, ...(timeLeft <= 3 ? styles.turnTimerLow : {}) }}>
                ⏱ {Math.max(timeLeft, 0)}s
              </span>
            )}
          </div>
          <div style={styles.handRow}>
            {hand.map((card, i) => {
              const legal =
                yourTurn &&
                game.phase === "playing" &&
                (game.trick.length === 0 || !hasLed || card.suit === ledSuit);
              let preview = null;
              if (yourTurn && game.trick.length > 0 && !hasLed) {
                if (game.cutSuit === null) preview = "CUT";
                else preview = card.suit === game.cutSuit ? "CUT" : "TRASH";
              } else if (yourTurn && game.trick.length > 0 && hasLed && card.suit === ledSuit) {
                preview = "FOLLOW";
              }
              return (
                <button
                  key={card.id}
                  onClick={() => legal && tryPlay(card)}
                  disabled={!legal}
                  style={{
                    ...styles.handCardBtn,
                    opacity: legal ? 1 : 0.35,
                    cursor: legal ? "pointer" : "default",
                    animation: `cardDealIn 0.3s ease-out backwards`,
                    animationDelay: `${i * 45}ms`,
                  }}
                >
                  <CardFace card={card} tag={preview} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <ChatPanel messages={chatMessages} onSend={sendChat} />
      </div>
    </div>
  );
}

/* ---------- chat sidebar — local-only for now (bots don't chat); ready to
   wire into real multiplayer once other seats are actual players ---------- */
function ChatPanel({ messages, onSend }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div style={styles.chatPanel}>
      <div style={styles.chatHeader}>CHAT</div>
      <div style={styles.chatMessages}>
        {messages.length === 0 ? (
          <div style={styles.chatEmpty}>No messages yet — say hello!</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={styles.chatLine}>
              <span style={styles.chatName}>{m.name}</span>
              <span style={styles.chatTeam}> ({TEAM_SHORT[m.team]})</span>
              <span style={styles.chatText}>: {m.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div style={styles.chatInputRow}>
        <input
          style={styles.chatInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Type a message..."
          maxLength={200}
        />
        <button style={styles.chatSendBtn} onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

/* ---------- small components ---------- */
function TeamScore({ team, tensWon, score }) {
  return (
    <div style={styles.teamBox}>
      <div style={styles.teamName}>{TEAM_SHORT[team]}</div>
      <div style={styles.teamScoreNum}>{score}</div>
      <div style={styles.tensRow}>
        {SUITS.map((s) => {
          const captured = tensWon.includes(s);
          const color = RED_SUITS.includes(s) ? "#8C2F2F" : "#1c2118";
          return (
            <div key={s} style={{ ...styles.tenPip, ...(captured ? styles.tenPipFilled : {}) }}>
              <span style={{ color: captured ? color : "#6b6250" }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardFace({ card, tag }) {
  const color = RED_SUITS.includes(card.suit) ? "#8C2F2F" : "#1c2118";
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardCorner, color }}>{card.rank}<br />{card.suit}</div>
      <div style={{ ...styles.cardCenter, color }}>{card.suit}</div>
      <div style={{ ...styles.cardCorner, ...styles.cardCornerBR, color }}>{card.rank}<br />{card.suit}</div>
      {tag && <div style={styles.cardTag}>{tag}</div>}
    </div>
  );
}

function roleTag(role) {
  if (role === "lead") return "LEAD";
  if (role === "follow") return "FOLLOW";
  if (role === "cut") return "CUT";
  if (role === "trash") return "TRASH";
  return null;
}
function suitName(s) {
  return { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" }[s];
}

/* ---------- tiny markdown renderer, just enough for RULES.md
   (headers, bullet lists, **bold**, paragraphs) ---------- */
function inlineFormat(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <b key={i}>{part.slice(2, -2)}</b>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
function renderMarkdownLite(md) {
  const lines = md.split("\n");
  const blocks = [];
  let listBuffer = [];
  const flushList = () => {
    if (listBuffer.length) {
      blocks.push(
        <ul key={blocks.length} style={styles.rulesList}>
          {listBuffer.map((item, i) => <li key={i}>{inlineFormat(item)}</li>)}
        </ul>
      );
      listBuffer = [];
    }
  };
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === "") {
      flushList();
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(<div key={blocks.length} style={styles.rulesH2}>{inlineFormat(trimmed.slice(3))}</div>);
    } else if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(<div key={blocks.length} style={styles.rulesH1}>{inlineFormat(trimmed.slice(2))}</div>);
    } else if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList();
      blocks.push(<p key={blocks.length} style={styles.rulesP}>{inlineFormat(trimmed)}</p>);
    }
  });
  flushList();
  return blocks;
}

/* ---------- styles ---------- */
const GLOBAL_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');

@keyframes cardPlayIn {
  from { opacity: 0; transform: translate(-50%,-50%) scale(0.4); }
  to { opacity: 1; transform: translate(-50%,-50%) scale(1); }
}
@keyframes cardDealIn {
  from { opacity: 0; transform: translateY(18px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes timerPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
`;

const styles = {
  wrap: {
    fontFamily: "'Inter', sans-serif",
    background: "radial-gradient(ellipse at center, #123C2E 0%, #0A241B 70%, #061712 100%)",
    color: "#EDE6D3",
    borderRadius: 16,
    padding: "14px 18px 16px",
    maxWidth: 1080,
    margin: "0 auto",
    boxShadow: "0 0 0 1px #C9A24B33, 0 20px 50px rgba(0,0,0,0.5)",
    position: "relative",
  },
  homeWrap: {
    height: "calc(100vh - 20px)",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },
  endWrap: {
    height: "calc(100vh - 20px)",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
  },
  header: { textAlign: "center", marginBottom: 6, position: "relative" },
  topLeftControls: { position: "absolute", top: 10, left: 16, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5 },
  topRightControls: { position: "absolute", top: 6, right: 16, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 },
  gameCounter: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: 1.5,
    color: "#A9C2AE", background: "rgba(0,0,0,0.28)", borderRadius: 6, padding: "6px 12px",
  },
  outcomesCounter: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 1,
    color: "#A9C2AE", background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "6px 12px",
  },
  outcomeWin: { color: "#8FD19E", fontWeight: 700 },
  outcomeLoss: { color: "#D68F8F", fontWeight: 700 },
  outcomeTie: { color: "#A9C2AE", fontWeight: 700 },
  quitBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: 1.5,
    color: "#cfd9c9", background: "rgba(0,0,0,0.28)", border: "1px solid #6b6250", borderRadius: 6,
    padding: "6px 12px", cursor: "pointer",
  },
  autoWinBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1,
    color: "#8fa595", background: "transparent", border: "1px dashed #6b6250", borderRadius: 6,
    padding: "4px 8px", cursor: "pointer",
  },
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 38,
    letterSpacing: 4,
    color: "#E7C878",
    textShadow: "0 2px 0 rgba(0,0,0,0.4)",
  },
  subtitle: { fontSize: 12, letterSpacing: 2, color: "#A9C2AE", textTransform: "uppercase", marginTop: -6 },
  body: { display: "flex", flexDirection: "column", gap: 8 },

  scorePanel: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 26,
    background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "7px 18px",
  },
  teamBox: { textAlign: "center", minWidth: 140 },
  teamName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: "#EDE6D3" },
  teamScoreNum: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 700, color: "#E7C878", lineHeight: 1 },
  tensRow: { display: "flex", gap: 5, justifyContent: "center", marginTop: 3 },
  tenPip: {
    width: 24, height: 18, borderRadius: 4, border: "1px solid #6b6250",
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, display: "flex",
    alignItems: "center", justifyContent: "center", color: "#6b6250",
  },
  tenPipFilled: { background: "#E7C878", border: "1px solid #E7C878", fontWeight: 700 },

  cutBadgeWrap: { textAlign: "center" },
  cutLabel: { fontSize: 10, letterSpacing: 2, color: "#A9C2AE", marginBottom: 3 },
  cutSeal: {
    width: 46, height: 46, borderRadius: "50%", border: "2px dashed #6b6250",
    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto",
    background: "rgba(0,0,0,0.2)",
  },
  cutSealSet: { border: "2px solid #E7C878", background: "#F5EFD9", boxShadow: "0 0 14px #E7C87888" },
  cutSealDash: { color: "#6b6250", fontSize: 20 },

  tableOuter: { display: "flex", justifyContent: "center" },
  tableFelt: {
    position: "relative", width: 700, height: 415,
    background: "radial-gradient(ellipse at center, #1b5a41 0%, #123C2E 65%, #0d2e21 100%)",
    borderRadius: "50% / 40%", border: "6px solid #3b2a17",
    boxShadow: "inset 0 0 40px rgba(0,0,0,0.5)",
  },
  /* the extra height (not just width) gives trick cards enough room to spread
     out from the seat-label ring without the two overlapping — a percentage
     width here wouldn't reliably reach this size, since the table's block
     ancestor is itself sized to fit its narrower siblings, not the table */
  tableFeltWide: { width: 820, height: 540 },
  seat: { position: "absolute", transform: "translate(-50%,-50%)", textAlign: "center" },
  seatLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
    color: "#cfd9c9", background: "rgba(0,0,0,0.35)", borderRadius: 6, padding: "3px 9px",
    display: "inline-flex", gap: 6, alignItems: "center",
  },
  seatActive: { background: "#E7C878", color: "#1c2118" },
  seatWinning: { boxShadow: "0 0 0 2px #7CFC8A, 0 0 10px 2px #7CFC8Aaa" },
  seatTeam: { fontSize: 10, opacity: 0.7 },
  seatHandCount: { fontSize: 11, color: "#8fa595", marginTop: 2 },

  trickCard: { position: "absolute", transform: "translate(-50%,-50%)" },
  trickCardWinning: { boxShadow: "0 0 0 2px #7CFC8A, 0 0 14px 3px #7CFC8Aaa", borderRadius: 8 },
  tableCenterNote: {
    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
    fontSize: 13, color: "#cfd9c9", fontStyle: "italic", opacity: 0.8, textAlign: "center", width: 180,
  },

  logPanel: {
    background: "rgba(0,0,0,0.28)", borderRadius: 8, padding: "6px 12px",
    maxHeight: 66, overflowY: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
    lineHeight: 1.5, color: "#cfd9c9",
  },
  logLine: { borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "1px 0" },

  resultBanner: {
    textAlign: "center", background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: "10px 12px",
    border: "1px solid #E7C87866",
  },
  resultText: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 2, color: "#E7C878", marginBottom: 8 },
  dealBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, letterSpacing: 1,
    background: "#E7C878", color: "#1c2118", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer",
  },
  dealBtnDisabled: { opacity: 0.4, cursor: "not-allowed" },

  pendingBtns: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  trashBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, background: "transparent",
    color: "#cfd9c9", border: "1px solid #6b6250", borderRadius: 6, padding: "8px 14px", cursor: "pointer",
  },

  handPanel: { background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "8px 14px" },
  handHeader: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 2, color: "#A9C2AE",
    marginBottom: 6, display: "flex", gap: 10, alignItems: "center",
  },
  turnPing: { color: "#E7C878", fontWeight: 700 },
  turnTimer: {
    color: "#E7C878", fontWeight: 700, fontSize: 20, letterSpacing: 1,
    display: "inline-block", transformOrigin: "center",
  },
  turnTimerLow: { color: "#E86A6A", animation: "timerPulse 0.6s ease-in-out infinite" },
  handRow: { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  handCardBtn: { background: "none", border: "none", padding: 0, transition: "transform 0.15s" },

  card: {
    width: 72, height: 100, background: "#F5EFD9", borderRadius: 8, border: "1px solid #C9A24B",
    boxShadow: "0 2px 5px rgba(0,0,0,0.45)", position: "relative", fontFamily: "'IBM Plex Mono', monospace",
  },
  cardCorner: { position: "absolute", top: 4, left: 5, fontSize: 12, fontWeight: 700, lineHeight: 1.1, textAlign: "center" },
  cardCornerBR: { top: "auto", left: "auto", bottom: 4, right: 5, transform: "rotate(180deg)" },
  cardCenter: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", fontSize: 28 },
  cardTag: {
    position: "absolute", bottom: -18, left: "50%", transform: "translateX(-50%)",
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: 1, color: "#E7C878", whiteSpace: "nowrap",
  },

  homeBody: {
    display: "flex", flexDirection: "column", gap: 16, alignItems: "center",
    flex: 1, minHeight: 0,
  },
  homeCard: {
    background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "22px 24px",
    display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch", width: "100%", maxWidth: 420,
  },
  homeLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 2, color: "#A9C2AE" },
  nameInput: {
    width: "100%", boxSizing: "border-box", fontFamily: "'IBM Plex Mono', monospace", fontSize: 16,
    background: "#0d2e21", color: "#EDE6D3", border: "1px solid #6b6250", borderRadius: 6, padding: "10px 12px",
    outline: "none",
  },
  playerCountRow: { display: "flex", gap: 8 },
  playerCountBtn: {
    flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 600,
    background: "transparent", color: "#cfd9c9", border: "1px solid #6b6250", borderRadius: 6,
    padding: "8px 0", cursor: "pointer",
  },
  playerCountBtnActive: { background: "#E7C878", color: "#1c2118", border: "1px solid #E7C878", fontWeight: 700 },

  rulesPanel: {
    background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "16px 20px", width: "100%",
    flex: 1, minHeight: 0, overflowY: "auto", boxSizing: "border-box",
  },
  rulesTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 2, color: "#E7C878", marginBottom: 8 },
  rulesH1: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 21, letterSpacing: 1.5, color: "#E7C878", marginTop: 10, marginBottom: 4 },
  rulesH2: {
    fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14.5, letterSpacing: 1.5,
    color: "#E7C878", marginTop: 10, marginBottom: 4, textTransform: "uppercase",
  },
  rulesP: { fontSize: 14.5, lineHeight: 1.6, color: "#cfd9c9", margin: "4px 0" },
  rulesList: { margin: "4px 0 8px 18px", padding: 0, fontSize: 14.5, lineHeight: 1.6, color: "#cfd9c9" },

  leaderboardPanel: {
    background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "16px 20px", width: "100%",
    boxSizing: "border-box", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-start",
  },
  endLeaderboardWrap: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
  leaderboardTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 2, color: "#E7C878", marginBottom: 8, textAlign: "center" },
  leaderboardEmpty: { fontSize: 14.5, color: "#8fa595", textAlign: "center", fontStyle: "italic" },
  leaderboardTable: { display: "flex", flexDirection: "column", gap: 6 },
  leaderboardRow: {
    display: "flex", alignItems: "center", gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5,
    color: "#cfd9c9", background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 12px", flexWrap: "wrap",
  },
  lbRank: { color: "#E7C878", fontWeight: 700, width: 30 },
  lbName: { fontWeight: 700, color: "#EDE6D3", minWidth: 90 },
  lbDetail: { flex: 1, color: "#A9C2AE" },
  lbDate: { color: "#6b6250", fontSize: 11.5 },

  endBanner: {
    textAlign: "center", background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: "24px 20px",
    border: "1px solid #E7C87866", marginBottom: 16,
  },
  endSub: { fontSize: 15, color: "#cfd9c9", marginBottom: 16 },

  gameWrap: { maxWidth: 1380 },
  gameLayout: { display: "flex", gap: 14, alignItems: "stretch" },
  chatPanel: {
    width: 220, flexShrink: 0, background: "rgba(0,0,0,0.22)", borderRadius: 10,
    display: "flex", flexDirection: "column", boxSizing: "border-box",
  },
  chatHeader: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 2, color: "#A9C2AE",
    padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  chatMessages: {
    flex: 1, overflowY: "auto", padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6,
  },
  chatEmpty: { fontSize: 13, color: "#8fa595", fontStyle: "italic" },
  chatLine: { fontSize: 13, lineHeight: 1.4, color: "#EDE6D3", wordBreak: "break-word" },
  chatName: { fontWeight: 700, color: "#E7C878" },
  chatTeam: { fontSize: 11, color: "#8fa595" },
  chatText: { color: "#cfd9c9" },
  chatInputRow: {
    display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  chatInput: {
    flex: 1, boxSizing: "border-box", fontFamily: "'Inter', sans-serif", fontSize: 13,
    background: "#0d2e21", color: "#EDE6D3", border: "1px solid #6b6250", borderRadius: 6,
    padding: "7px 10px", outline: "none", minWidth: 0,
  },
  chatSendBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12,
    background: "#E7C878", color: "#1c2118", border: "none", borderRadius: 6, padding: "7px 12px", cursor: "pointer",
  },
};
