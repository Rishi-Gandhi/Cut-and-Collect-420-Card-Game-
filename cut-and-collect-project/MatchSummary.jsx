import React, { useEffect } from "react";
import { SUITS, RED_SUITS, TEAM_OF, TEAM_SHORT, suitName } from "../shared/game-rules.js";
import { styles, GLOBAL_STYLE } from "./styles.js";
import { startEndMusic, stopBackgroundMusic } from "./sound.js";

/* ---------------------------------------------------------------------------
   MatchSummary — the end screen for a *multiplayer* match.

   Deliberately not the solo End screen. That one is about a person's lifetime
   record (leaderboard, personal best), which is the wrong frame for a table of
   people who just played each other: nobody wants a career stat line, they want
   to know who did what in the hand that just finished.

   So this shows the hand itself — who won, what the cut suit was, who was
   forced into the first cut, and which individual player actually brought each
   10 in. That last one is the interesting column, because the team score alone
   hides whether it was one person carrying or a genuine split.

   Everything here comes from the final server snapshot the client already has,
   which is what lets it keep rendering after the room closes.
   ------------------------------------------------------------------------ */

function suitStyle(suit) {
  return { color: RED_SUITS.includes(suit) ? "#E88B8B" : "#EDE6D3" };
}

function TeamCard({ team, won, isTie, seats, seatNames, tensBySeat, yourSeat, firstCutSeat, score }) {
  return (
    <div style={{ ...styles.summaryTeamCard, ...(won ? styles.summaryTeamCardWon : {}) }}>
      <div style={styles.summaryTeamHead}>
        <span style={styles.summaryTeamName}>{TEAM_SHORT[team]}</span>
        {won && <span style={styles.summaryTeamTag}>WINNER</span>}
        {!won && !isTie && <span style={styles.summaryTeamTag}>LOSER</span>}
      </div>
      <div style={styles.summaryTeamScore}>{score}</div>
      <div style={styles.summaryTeamScoreSub}>
        ten{score === 1 ? "" : "s"} captured
      </div>

      {seats.map((seat) => {
        const tens = tensBySeat?.[seat] ?? [];
        return (
          <div key={seat} style={styles.summaryPlayerRow}>
            <span
              style={{
                ...styles.summaryPlayerName,
                ...(seat === yourSeat ? styles.summaryPlayerYou : {}),
              }}
            >
              {seatNames[seat]}
              {seat === yourSeat ? " (you)" : ""}
            </span>
            {seat === firstCutSeat && <span style={styles.summaryBadge}>FIRST CUT</span>}
            {tens.length > 0 ? (
              <span style={styles.summaryPlayerTens}>
                {tens.map((s, i) => (
                  <span key={i} style={suitStyle(s)}>10{s} </span>
                ))}
              </span>
            ) : (
              <span style={styles.summaryPlayerNone}>—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MatchSummary({ summary, onPlayAgain, onHome }) {
  useEffect(() => {
    startEndMusic();
    return () => stopBackgroundMusic();
  }, []);

  const {
    result, scores, seatNames, seatCount, yourSeat, gameNumber,
    cutSuit, firstCutSeat, tensBySeat, roomCode,
  } = summary;

  const seatsOf = (team) =>
    Array.from({ length: seatCount }, (_, i) => i).filter((i) => TEAM_OF(i) === team);

  const isTie = result?.type === "earlyTie";
  const winningTeam = isTie ? null : result?.team ?? null;
  const yourTeam = TEAM_OF(yourSeat);

  // show the winning team first — losing team second, per the same layout
  const orderedTeams = isTie ? ["A", "B"] : [winningTeam, winningTeam === "A" ? "B" : "A"];

  const headline = isTie
    ? "TIE GAME"
    : `${TEAM_SHORT[winningTeam]} WINS`;
  const subline = isTie
    ? `The four 10's split evenly, ${scores.A}–${scores.B}.`
    : result?.type === "mercy"
    ? `All four 10's — a "420", total domination.`
    : `Took it ${Math.max(scores.A, scores.B)}–${Math.min(scores.A, scores.B)} on the early finish.`;

  const youWon = !isTie && winningTeam === yourTeam;

  return (
    <div className="cc-scrollable" style={{ ...styles.wrap, ...styles.endWrap }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={styles.header}>
        <div style={styles.title}>CUT &amp; COLLECT</div>
        <div style={styles.subtitle}>
          match results{roomCode ? ` · room ${roomCode}` : ""}
        </div>
      </div>

      <div style={styles.summaryScroll}>
        <div style={styles.summaryWinBanner}>
          <div style={styles.summaryWinLine}>{headline}</div>
          <div style={styles.summaryWinSub}>{subline}</div>
          <div style={{ ...styles.summaryWinSub, color: youWon ? "#7CFC8A" : "#d84545", marginTop: 6 }}>
            {isTie ? "Honours even." : youWon ? "That's your team — nice one." : "Your team came up short this time."}
          </div>
        </div>

        <div style={styles.summaryFactsRow}>
          <div style={styles.summaryFact}>
            <div style={styles.summaryFactLabel}>GAME(s)</div>
            <div style={styles.summaryFactValue}>{gameNumber}</div>
          </div>
          <div style={styles.summaryFact}>
            <div style={styles.summaryFactLabel}>CUT SUIT</div>
            <div style={{ ...styles.summaryFactValue, ...(cutSuit ? suitStyle(cutSuit) : {}) }}>
              {cutSuit ? `${cutSuit} ${suitName(cutSuit)}` : "never set"}
            </div>
          </div>
          <div style={styles.summaryFact}>
            <div style={styles.summaryFactLabel}>FIRST CUT BY</div>
            <div style={styles.summaryFactValue}>
              {firstCutSeat != null ? seatNames[firstCutSeat] : "—"}
            </div>
          </div>
          <div style={styles.summaryFact}>
            <div style={styles.summaryFactLabel}>TABLE</div>
            <div style={styles.summaryFactValue}>{seatCount} players</div>
          </div>
        </div>

        <div style={styles.summaryTeams}>
          {orderedTeams.map((team) => (
            <TeamCard
              key={team}
              team={team}
              won={!isTie && team === winningTeam}
              isTie={isTie}
              seats={seatsOf(team)}
              seatNames={seatNames}
              tensBySeat={tensBySeat}
              yourSeat={yourSeat}
              firstCutSeat={firstCutSeat}
              score={scores[team]}
            />
          ))}
        </div>

        <div style={styles.pendingBtns}>
          <button style={styles.dealBtn} onClick={onPlayAgain}>New Multiplayer Game</button>
          <button style={styles.trashBtn} onClick={onHome}>Back to Home</button>
        </div>
      </div>
    </div>
  );
}
