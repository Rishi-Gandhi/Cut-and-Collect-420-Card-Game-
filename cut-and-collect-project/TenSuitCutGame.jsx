import React, { useState, useEffect, useRef, useCallback } from "react";
import rulesRaw from "./RULES.md?raw";
import {
  PLAYER_COUNTS,
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_SETTINGS,
  TEAM_OF,
  TEAM_SHORT,
  rankValueFor,
  createHandState,
  applyPlay,
  resolveTrick,
  botChooseCard,
  randomLegalPlay,
  outcomeFor,
} from "../shared/game-rules.js";
import { styles, GLOBAL_STYLE } from "./styles.js";
import { GameTable } from "./GameTable.jsx";
import { MatchSummary } from "./MatchSummary.jsx";
import { UpdateBanner } from "./UpdateBanner.jsx";
import { useMultiplayer } from "./useMultiplayer.js";
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
  startLobbyMusic,
  startEndMusic,
  stopBackgroundMusic,
} from "./sound.js";

/* turn timer options for timed mode — null means untimed */
const TIME_LIMIT_OPTIONS = [
  { label: "OFF", value: null },
  { label: "15s", value: 15 },
  { label: "8s", value: 8 },
];

function getSeatNames(playerName, seatCount) {
  const name = (playerName || "").trim() || "You";
  const names = [name];
  for (let i = 2; i <= seatCount; i++) names.push(`Player ${i}`);
  return names;
}

/* ---------- leaderboard persistence — a real file on disk.
   Inside Electron, window.leaderboardAPI (exposed by electron/preload.cjs) talks
   straight to the main process over IPC, no server needed — this is what makes it
   work in a packaged .app. In a plain browser it falls back to the small dev-only
   API added in vite.config.js. ---------- */
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
/* Records the outcome of one hand (win/loss/tie) against the player's lifetime
   record. personalBestCandidate is only passed on an actual "420" mercy win —
   that's the only time "fewest games to reach 420" applies. */
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

/* ---------- top-level flow: home -> (lobby) -> game -> end ---------- */
export default function TenSuitCutGame() {
  const [screen, setScreen] = useState("home"); // home | lobby | solo | multiplayer | end
  const [mode, setMode] = useState("solo"); // solo | multiplayer
  const [playerName, setPlayerName] = useState("");
  const [playerCount, setPlayerCount] = useState(6);
  const [botDifficulty, setBotDifficulty] = useState("normal");
  const [turnTimeLimit, setTurnTimeLimit] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [winResult, setWinResult] = useState(null);
  const [matchSummary, setMatchSummary] = useState(null);

  /* The multiplayer connection is owned up here rather than inside the lobby,
     so the socket survives the lobby -> game screen transition instead of
     being torn down and reconnected mid-game. */
  const mp = useMultiplayer();

  useEffect(() => {
    loadLeaderboard().then(setLeaderboard);
  }, []);

  // The win/loss/tie record and personal best are already saved per-hand by the
  // game screens (every hand counts, not just the final victory) — this just
  // re-fetches the now-current leaderboard and builds the End screen banner.
  async function handleUserWin(details) {
    const updated = await loadLeaderboard();
    setLeaderboard(updated);
    setWinResult({
      name: (playerName || "").trim() || "You",
      gameNumber: details.gameNumber,
      opponentTens: details.opponentTens,
    });
    setScreen("end");
  }

  /* A finished multiplayer match goes to its own results screen, not the solo
     End screen. The leaderboard is a personal, lifetime, solo-progress thing —
     the wrong frame for a table of people who just played each other, who care
     about who did what in the hand that just finished. Leaving the room here is
     deliberate: the match is over, and the snapshot the summary renders from was
     already taken, so closing the connection costs nothing. */
  function handleMatchEnd(summary) {
    mp.disconnect();
    setMatchSummary(summary);
    setScreen("mpSummary");
  }

  function goHome() {
    mp.disconnect();
    setWinResult(null);
    setMatchSummary(null);
    setScreen("home");
  }

  if (screen === "home") {
    return (
      <HomeScreen
        playerName={playerName} setPlayerName={setPlayerName}
        mode={mode} setMode={setMode}
        playerCount={playerCount} setPlayerCount={setPlayerCount}
        botDifficulty={botDifficulty} setBotDifficulty={setBotDifficulty}
        turnTimeLimit={turnTimeLimit} setTurnTimeLimit={setTurnTimeLimit}
        onStart={() => setScreen(mode === "solo" ? "solo" : "lobby")}
        leaderboard={leaderboard}
      />
    );
  }

  if (screen === "lobby") {
    return (
      <LobbyScreen
        mp={mp}
        playerName={playerName}
        playerCount={playerCount}
        botDifficulty={botDifficulty}
        turnTimeLimit={turnTimeLimit}
        onEnterGame={() => setScreen("multiplayer")}
        onBack={goHome}
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
          setScreen(mode === "solo" ? "solo" : "lobby");
        }}
        onHome={goHome}
      />
    );
  }

  if (screen === "mpSummary") {
    return (
      <MatchSummary
        summary={matchSummary}
        onPlayAgain={() => {
          setMatchSummary(null);
          setScreen("lobby");
        }}
        onHome={goHome}
      />
    );
  }

  if (screen === "multiplayer") {
    return (
      <MultiplayerGameScreen
        mp={mp}
        onMatchEnd={handleMatchEnd}
        onQuit={goHome}
      />
    );
  }

  return (
    <SoloGameScreen
      playerName={playerName}
      playerCount={playerCount}
      botDifficulty={botDifficulty}
      turnTimeLimit={turnTimeLimit}
      onUserWin={handleUserWin}
      onQuit={goHome}
    />
  );
}

/* ---------- home screen ---------- */
function HomeScreen({
  playerName, setPlayerName, mode, setMode, playerCount, setPlayerCount,
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
        <UpdateBanner />
        <div style={styles.homeCard}>
          <label style={styles.homeLabel} htmlFor="playerNameInput">YOUR NAME</label>
          <input
            id="playerNameInput"
            style={styles.nameInput}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canStart) onStart(); }}
            placeholder="Enter your name"
            maxLength={24}
            autoFocus
          />

          <label style={styles.homeLabel}>GAME MODE</label>
          <div style={styles.modeRow}>
            <button
              type="button"
              style={{ ...styles.modeBtn, ...(mode === "solo" ? styles.modeBtnActive : {}) }}
              onClick={() => setMode("solo")}
            >
              SOLO
              <span style={styles.modeBtnSub}>you vs. bots</span>
            </button>
            <button
              type="button"
              style={{ ...styles.modeBtn, ...(mode === "multiplayer" ? styles.modeBtnActive : {}) }}
              onClick={() => setMode("multiplayer")}
            >
              MULTIPLAYER
              <span style={styles.modeBtnSub}>real people, room code</span>
            </button>
          </div>

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
          {/* Only the host's pick counts online — the room carries one clock for
              everyone, run by the server. Saying so here avoids a joiner setting
              8s, getting 15s, and assuming it's broken. */}
          {mode === "multiplayer" && (
            <div style={{ ...styles.lobbyHint, textAlign: "left", marginTop: -4 }}>
              Applies to everyone if you host. Joining a room uses the host's setting.
            </div>
          )}

          <button
            style={{ ...styles.dealBtn, ...(canStart ? {} : styles.dealBtnDisabled) }}
            disabled={!canStart}
            onClick={() => { unlockAudio(); onStart(); }}
          >
            {mode === "solo" ? "Start Game" : "Continue →"}
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

/* ---------- multiplayer lobby ----------
   Create a room and read out the 4-letter code, or type someone else's. Seats
   nobody claims stay bots, so the host can start whenever they like rather
   than waiting for a full table. */
function LobbyScreen({ mp, playerName, playerCount, botDifficulty, turnTimeLimit, onEnterGame, onBack }) {
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { status, view, error, code, seat, serverUrl } = mp;

  /* Its own loop rather than carrying the Home one over — waiting for people to
     file in is a different mood from browsing the menu. Stops on unmount so it
     doesn't bleed into the game screen, which is deliberately music-free. */
  useEffect(() => {
    startLobbyMusic();
    return () => stopBackgroundMusic();
  }, []);

  // once the host starts, the server flips `started` — everyone follows it in
  useEffect(() => {
    if (view?.started) onEnterGame();
  }, [view?.started, onEnterGame]);

  async function handleCreate() {
    setBusy(true);
    await mp.createRoom(playerName, playerCount, botDifficulty, turnTimeLimit);
    setBusy(false);
  }
  async function handleJoin() {
    if (joinCode.trim().length < 4) return;
    setBusy(true);
    await mp.joinRoom(joinCode.trim().toUpperCase(), playerName);
    setBusy(false);
  }

  const inRoom = !!code && !!view;
  const isHost = inRoom && seat === view.hostSeat;
  const humansIn = inRoom ? view.seatIsBot.filter((b) => !b).length : 0;

  const dotColor = status === "connected" ? "#7CFC8A" : status === "connecting" ? "#E7C878" : "#E86A6A";

  return (
    <div style={{ ...styles.wrap, ...styles.homeWrap }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={styles.header}>
        <div style={styles.title}>CUT &amp; COLLECT</div>
        <div style={styles.subtitle}>multiplayer lobby</div>
      </div>

      <div style={styles.lobbyBody}>
        {error && <div style={styles.lobbyErr}>{error}</div>}

        {!inRoom ? (
          <div style={styles.lobbyCard}>
            <div style={styles.lobbyStatus}>
              <span style={{ ...styles.connDot, background: dotColor }} />
              {status === "connected" ? "connected" : status === "connecting" ? "connecting…" : "not connected"}
              {" · "}{serverUrl}
            </div>

            <label style={styles.homeLabel}>HOST A NEW GAME</label>
            <div style={styles.lobbyHint}>
              Creates a {playerCount}-seat room and gives you a code to share.
              Any seat nobody joins is played by a {botDifficulty} bot.
            </div>
            <button
              style={{ ...styles.dealBtn, ...(busy ? styles.dealBtnDisabled : {}) }}
              disabled={busy}
              onClick={handleCreate}
            >
              Create Room
            </button>

            <label style={{ ...styles.homeLabel, marginTop: 8 }}>OR JOIN WITH A CODE</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...styles.nameInput, textTransform: "uppercase", letterSpacing: 6, textAlign: "center" }}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                placeholder="ABCD"
                maxLength={4}
              />
              <button
                style={{ ...styles.dealBtn, ...(joinCode.trim().length === 4 && !busy ? {} : styles.dealBtnDisabled) }}
                disabled={joinCode.trim().length !== 4 || busy}
                onClick={handleJoin}
              >
                Join
              </button>
            </div>

            <button style={styles.trashBtn} onClick={onBack}>← Back</button>
          </div>
        ) : (
          <div style={styles.lobbyCard}>
            <div style={styles.lobbyCodeWrap}>
              <div style={styles.lobbyCodeLabel}>ROOM CODE</div>
              <div style={styles.lobbyCode}>{code}</div>
            </div>
            <div style={styles.lobbyHint}>
              Share this code — friends pick MULTIPLAYER on the home screen and type it in.
            </div>
            {/* the room's real settings, so joiners see what they've walked into
                rather than whatever they happened to pick on the home screen */}
            <div style={styles.lobbyStatus}>
              {view.seatCount} seats · {(view.botDifficulty || "normal").toUpperCase()} bots ·{" "}
              {view.turnLimit ? `${view.turnLimit}s turns` : "untimed"}
            </div>

            <label style={styles.homeLabel}>TABLE ({humansIn} human{humansIn === 1 ? "" : "s"})</label>
            <div style={styles.lobbySeatList}>
              {view.seatNames.map((name, i) => (
                <div key={i} style={styles.lobbySeatRow}>
                  <span style={styles.lobbySeatNum}>{i + 1}</span>
                  <span style={{ ...styles.lobbySeatName, ...(i === seat ? styles.lobbySeatYou : {}) }}>
                    {name}{i === seat ? " (you)" : ""}
                  </span>
                  <span style={styles.lobbySeatTag}>
                    {view.seatIsBot[i] ? "BOT" : "HUMAN"} · {TEAM_SHORT[TEAM_OF(i)]}
                    {i === view.hostSeat ? " · HOST" : ""}
                  </span>
                </div>
              ))}
            </div>

            {isHost ? (
              <button style={styles.dealBtn} onClick={mp.startGame}>Start Game</button>
            ) : (
              <div style={styles.lobbyHint}>Waiting for the host to start…</div>
            )}
            <button style={styles.trashBtn} onClick={onBack}>← Leave Room</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- solo game ----------
   Runs the whole game locally: the same shared rule functions the server uses,
   just driven by React state and local timers instead of sockets. */
function SoloGameScreen({ playerName, playerCount, botDifficulty, turnTimeLimit, onUserWin, onQuit }) {
  const seatCount = playerCount;
  const botSettings = BOT_DIFFICULTY_SETTINGS[botDifficulty];
  const seatNamesRef = useRef(getSeatNames(playerName, seatCount));
  const seatNames = seatNamesRef.current;
  const rankValue = rankValueFor(seatCount);

  const [game, setGame] = useState(() => ({
    ...createHandState(seatNames, seatCount),
    gameNumber: 1,
    outcomes: { win: 0, loss: 0, tie: 0 },
  }));
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => { playNewGame(); }, [game.gameNumber]);

  /* commit a play, then advance. applyPlay hands back the role it derived so
     the right sound plays (the first cut of a hand gets its own sting). */
  const commitPlay = useCallback((seat, cardId) => {
    setGame((g) => {
      const res = applyPlay(g, seat, cardId, seatNames);
      if (res.error) return g;
      if (res.role === "cut" && g.cutSuit === null) playFirstCut();
      else playCardFlip();
      return { ...g, ...res.state };
    });
  }, [seatNames]);

  /* resolve a completed trick */
  useEffect(() => {
    if (game.phase !== "resolving") return;
    const t = setTimeout(() => {
      setGame((g) => {
        const next = resolveTrick(g, seatNames);
        if (next.phase === "handOver") {
          const key = outcomeFor(next.result, "A");
          return { ...g, ...next, outcomes: { ...g.outcomes, [key]: g.outcomes[key] + 1 } };
        }
        return { ...g, ...next };
      });
    }, 1100);
    return () => clearTimeout(t);
  }, [game.phase, seatNames]);

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

  /* every hand's outcome counts toward the lifetime record; personalBest only
     moves on an actual mercy win for Team A (the human's team in solo) */
  useEffect(() => {
    if (game.phase !== "handOver" || !game.result) return;
    const { type, team } = game.result;
    const name = (playerName || "").trim() || "You";
    if (type === "earlyTie") recordHandResult(name, "tie");
    else if (type === "mercy") recordHandResult(name, team === "A" ? "win" : "loss", team === "A" ? game.gameNumber : null);
    else recordHandResult(name, team === "A" ? "win" : "loss");
  }, [game.phase, game.result]);

  /* bot turns */
  useEffect(() => {
    if (game.phase !== "playing") return;
    if (game.turn === 0) return; // human
    const t = setTimeout(() => {
      const card = botChooseCard(game, game.turn, rankValue, botSettings);
      commitPlay(game.turn, card.id);
    }, 1800);
    return () => clearTimeout(t);
  }, [game.phase, game.turn, game.hands, game.trick, game.cutSuit, commitPlay, rankValue, botSettings]);

  /* turn timer (timed mode only) — counts down while it's the human's turn;
     hitting 0 plays a random legal card so a stalled human doesn't stall the bots */
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
    const card = randomLegalPlay(game, 0);
    if (card) commitPlay(0, card.id);
  }, [timeLeft, turnTimeLimit, isHumanTurn, game, commitPlay]);

  function newHand() {
    setGame((g) => {
      const gameNumber = g.gameNumber + 1;
      const leader = (gameNumber - 1) % seatCount; // lead rotates clockwise each hand
      return { ...createHandState(seatNames, seatCount, leader), gameNumber, outcomes: g.outcomes };
    });
  }

  function handleQuit() {
    if (window.confirm("Quit this game? Your current progress won't be saved.")) onQuit();
  }

  // Dev/testing shortcut — forces a Team A mercy finish so the Claim Victory →
  // End screen flow can be checked without playing a full hand out.
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

  const view = {
    seatCount,
    seatNames,
    seatIsBot: seatNames.map((_, i) => i !== 0),
    yourSeat: 0,
    hand: game.hands[0],
    handCounts: game.hands.map((h) => h.length),
    turn: game.turn,
    trick: game.trick,
    cutSuit: game.cutSuit,
    scores: game.scores,
    tensWon: game.tensWon,
    log: game.log,
    phase: game.phase,
    gameNumber: game.gameNumber,
  };

  return (
    <GameTable
      view={view}
      outcomes={game.outcomes}
      onPlay={(card) => commitPlay(0, card.id)}
      onQuit={handleQuit}
      onAutoWin={autoWin}
      timeLeft={timeLeft}
      turnTimeLimit={turnTimeLimit}
      chatMessages={chatMessages}
      onSendChat={(text) =>
        setChatMessages((m) => [...m, { name: seatNames[0], team: TEAM_OF(0), text: text.trim() }])
      }
      chatEnabled={false}
      chatDisabledNote="Chat is for multiplayer games — the bots aren't much for conversation. Start a MULTIPLAYER game to talk with real players."
      resultBanner={
        game.phase === "handOver" && game.result ? (
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
                onClick={() => onUserWin({ gameNumber: game.gameNumber, opponentTens: game.scores.B })}
              >
                Claim Victory →
              </button>
            ) : (
              <button style={styles.dealBtn} onClick={newHand}>Deal New Hand</button>
            )}
          </div>
        ) : null
      }
    />
  );
}

/* ---------- multiplayer game ----------
   A thin renderer over the server's view. It holds no game state of its own —
   every card played is a request, and the screen only changes when the server
   sends back the next snapshot. */
function MultiplayerGameScreen({ mp, onMatchEnd, onQuit }) {
  const { view, error, seat, closedReason } = mp;
  const prevScoreSum = useRef(0);
  const prevPhase = useRef(null);

  const myTeam = seat != null ? TEAM_OF(seat) : "A";

  /* Sound cues are driven by diffing the server's snapshots, since there's no
     local commitPlay to hang them off the way solo does. Each one watches the
     specific field that moves, rather than firing on every broadcast. */

  // new hand — fires on the first deal and on every "Deal New Hand" after it
  useEffect(() => {
    if (!view?.started) return;
    playNewGame();
  }, [view?.started, view?.gameNumber]);

  // a card hit the table. The very first cut of a hand gets its own sting,
  // detected by the cut suit going from unset to set on this same update.
  const prevCutSuit = useRef(null);
  useEffect(() => {
    if (!view?.trick) return;
    if (view.trick.length > 0) {
      if (prevCutSuit.current === null && view.cutSuit !== null) playFirstCut();
      else playCardFlip();
    }
    prevCutSuit.current = view.cutSuit ?? null;
  }, [view?.trick?.length, view?.cutSuit]);

  useEffect(() => {
    if (!view?.scores) return;
    const sum = view.scores.A + view.scores.B;
    if (sum > prevScoreSum.current) playPointScored();
    prevScoreSum.current = sum;
  }, [view?.scores?.A, view?.scores?.B]);

  useEffect(() => {
    if (!view) return;
    if (view.phase === "handOver" && prevPhase.current !== "handOver" && view.result) {
      const key = outcomeFor(view.result, myTeam);
      if (key === "tie") playTieFanfare();
      else if (key === "win") playWinFanfare();
      else playLoseFanfare();
    }
    prevPhase.current = view.phase;
  }, [view?.phase, view?.result, myTeam]);

  /* A "420" ends the match, so snapshot everything the summary screen needs the
     moment it happens. Taking a copy (rather than reading `view` later) is what
     lets the summary survive the room being torn down — which is exactly what
     happens when the host is the one who clicks through first. */
  const [pendingSummary, setPendingSummary] = useState(null);
  useEffect(() => {
    if (view?.phase !== "handOver" || view?.result?.type !== "mercy") return;
    setPendingSummary({
      result: view.result,
      scores: view.scores,
      seatNames: view.seatNames,
      seatCount: view.seatCount,
      yourSeat: view.yourSeat,
      gameNumber: view.gameNumber,
      cutSuit: view.cutSuit,
      firstCutSeat: view.firstCutSeat,
      tensBySeat: view.tensBySeat,
      roomCode: view.code,
    });
  }, [view?.phase, view?.result, view?.gameNumber]);

  /* Room closed after the match was already decided — show the results rather
     than a "the host left" dead end, since the game genuinely finished. */
  useEffect(() => {
    if (closedReason && pendingSummary) onMatchEnd(pendingSummary);
  }, [closedReason, pendingSummary, onMatchEnd]);

  /* Turn clock. The server sends how long is left rather than a deadline (see
     buildView), so we seed from that and tick locally between snapshots. Each
     new snapshot re-seeds, which keeps a slow connection from drifting — and
     note the client never *acts* on hitting zero, it only displays it. The
     server owns the auto-play. */
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (view?.turnMsLeft == null) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(Math.ceil(view.turnMsLeft / 1000));
    const id = setInterval(() => setTimeLeft((t) => (t == null ? null : Math.max(0, t - 1))), 1000);
    return () => clearInterval(id);
  }, [view?.turnMsLeft, view?.turn, view?.phase]);

  /* The room was torn down out from under us (the host left). Checked before
     anything else, since `view` is still populated with the last snapshot and
     would otherwise render a table nobody is sitting at any more. */
  if (closedReason) {
    return (
      <div style={{ ...styles.wrap, ...styles.homeWrap }}>
        <style>{GLOBAL_STYLE}</style>
        <div style={styles.header}>
          <div style={styles.title}>CUT &amp; COLLECT</div>
          <div style={styles.subtitle}>game over</div>
        </div>
        <div style={styles.lobbyBody}>
          <div style={styles.lobbyCard}>
            <div style={styles.lobbyErr}>{closedReason}</div>
            <div style={styles.lobbyHint}>
              Every hand you finished still counted toward your record on the leaderboard.
            </div>
            <button style={styles.dealBtn} onClick={onQuit}>← Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  if (!view || !view.started) {
    return (
      <div style={{ ...styles.wrap, ...styles.homeWrap }}>
        <style>{GLOBAL_STYLE}</style>
        <div style={styles.header}>
          <div style={styles.title}>CUT &amp; COLLECT</div>
          <div style={styles.subtitle}>connecting…</div>
        </div>
        <div style={styles.lobbyBody}>
          <div style={styles.lobbyCard}>
            <div style={styles.lobbyHint}>{error || "Waiting for the game to start…"}</div>
            <button style={styles.trashBtn} onClick={onQuit}>← Leave</button>
          </div>
        </div>
      </div>
    );
  }

  const isHost = seat === view.hostSeat;
  const outcomes = {
    win: myTeam === "A" ? view.outcomes.A : view.outcomes.B,
    loss: myTeam === "A" ? view.outcomes.B : view.outcomes.A,
    tie: view.outcomes.tie,
  };

  /* The host leaving ends the game for the whole table, so they get a blunter
     warning than everyone else, who just hand their seat to a bot. */
  function handleQuit() {
    const message = isHost
      ? "You're the host — leaving ENDS the game for everyone at the table. Leave anyway?"
      : "Leave this game? Your seat will be taken over by a bot.";
    if (window.confirm(message)) onQuit();
  }

  /* A 420 ends the match for the whole table, so both sides get the same route
     to the results — winners and losers read the same breakdown. Any other hand
     outcome just continues the session with another deal. */
  const matchOver = view.result?.type === "mercy";
  const wonMercy = matchOver && view.result.team === myTeam;

  return (
    <GameTable
      view={view}
      outcomes={outcomes}
      onPlay={(card) => mp.play(card.id)}
      onQuit={handleQuit}
      onAutoWin={mp.devWin}
      errorToast={error}
      timeLeft={timeLeft}
      turnTimeLimit={view.turnLimit}
      headerBadge={<div style={styles.waitingBadge}>ROOM {view.code}</div>}
      chatMessages={view.chat || []}
      onSendChat={mp.sendChat}
      chatEnabled={true}
      resultBanner={
        view.phase === "handOver" && view.result ? (
          <div style={styles.resultBanner}>
            <div style={styles.resultText}>
              {view.result.type === "mercy"
                ? `MERCY FINISH — ${TEAM_SHORT[view.result.team]} TOTAL DOMINATION (420)`
                : view.result.type === "earlyTie"
                ? "EARLY FINISH — TIE GAME"
                : `EARLY FINISH — ${TEAM_SHORT[view.result.team]} WINS`}
            </div>
            {matchOver ? (
              <button
                style={styles.dealBtn}
                onClick={() => pendingSummary && onMatchEnd(pendingSummary)}
              >
                {wonMercy ? "Claim Victory →" : "View Match Results →"}
              </button>
            ) : isHost ? (
              <button style={styles.dealBtn} onClick={mp.newHand}>Deal New Hand</button>
            ) : (
              <div style={styles.lobbyHint}>Waiting for the host to deal the next hand…</div>
            )}
          </div>
        ) : null
      }
    />
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
                {e.personalBest != null && ` · PB: ${e.personalBest} game${e.personalBest === 1 ? "" : "s"}`}
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
    if (trimmed === "") { flushList(); return; }
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
