import React, { useState, useEffect, useRef } from "react";
import { SUITS, RED_SUITS, TEAM_OF, TEAM_SHORT, rankValueFor, evaluateWinner, classifyPlay } from "../shared/game-rules.js";
import { styles, GLOBAL_STYLE } from "./styles.js";

/* ---------------------------------------------------------------------------
   GameTable — everything you see while a hand is in progress.

   Purely presentational: it takes a normalized `view` object and calls back
   when the player does something. It has no idea whether the game behind it is
   a local solo game or a networked one, which is the whole point — one set of
   pixels, two data sources, so a layout fix can't land in one mode and miss
   the other.
   ------------------------------------------------------------------------ */

/* seat layout around the oval table (percent positions) — index order
   matches turn order, laid out clockwise starting at the bottom. The 6-seat
   case keeps its original hand-tuned positions; other seat counts fall back
   to an evenly-spaced ellipse. */
const SEAT_POS_6 = [
  { left: "50%", top: "93%" }, // bottom (always "you")
  { left: "13%", top: "76%" },
  { left: "13%", top: "22%" },
  { left: "50%", top: "5%" },
  { left: "87%", top: "22%" },
  { left: "87%", top: "76%" },
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

export function getSeatPositions(seatCount) {
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
export function getTrickPositions(seatCount) {
  if (seatCount === 6) return TRICK_POS_6;
  const scale = 0.62;
  return getSeatPositions(seatCount).map((p) => ({
    left: `${TABLE_CENTER.x + (parseFloat(p.left) - TABLE_CENTER.x) * scale}%`,
    top: `${TABLE_CENTER.y + (parseFloat(p.top) - TABLE_CENTER.y) * scale}%`,
  }));
}

export function roleTag(role) {
  if (role === "lead") return "LEAD";
  if (role === "follow") return "FOLLOW";
  if (role === "cut") return "CUT";
  if (role === "trash") return "TRASH";
  return null;
}

/* ---------- small components ---------- */
export function CardFace({ card, tag }) {
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

export function TeamScore({ team, tensWon, score, label }) {
  return (
    <div style={styles.teamBox}>
      <div style={styles.teamName}>{label || TEAM_SHORT[team]}</div>
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

/* Chat sidebar. In solo there's nobody to talk to, so it renders in a disabled
   state that explains why rather than pretending to be a live channel. */
export function ChatPanel({ messages, onSend, enabled = true, disabledNote }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    if (!draft.trim() || !enabled) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div style={styles.chatPanel}>
      <div style={styles.chatHeader}>CHAT</div>
      <div style={styles.chatMessages}>
        {messages.length === 0 ? (
          <div style={styles.chatEmpty}>{enabled ? "No messages yet — say hello!" : disabledNote}</div>
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
          style={{ ...styles.chatInput, ...(enabled ? {} : styles.chatDisabled) }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder={enabled ? "Type a message..." : "Multiplayer only"}
          disabled={!enabled}
          maxLength={200}
        />
        <button
          style={{ ...styles.chatSendBtn, ...(enabled ? {} : styles.chatDisabled) }}
          onClick={handleSend}
          disabled={!enabled}
        >
          Send
        </button>
      </div>
    </div>
  );
}

/* ---------- the table ---------- */
export function GameTable({
  view,          // normalized game view (see below)
  outcomes,      // { win, loss, tie } from this player's perspective
  onPlay,
  onQuit,
  onAutoWin,     // solo-only dev shortcut; omitted in multiplayer
  resultBanner,  // node rendered when the hand is over (differs per mode)
  chatMessages, onSendChat, chatEnabled, chatDisabledNote,
  timeLeft, turnTimeLimit,
  headerBadge,   // extra node in the top-right (e.g. the room code)
  errorToast,
}) {
  const {
    seatCount, seatNames, seatIsBot, yourSeat,
    hand, handCounts, turn, trick, cutSuit, scores, tensWon, log, phase, gameNumber,
  } = view;

  const rankValue = rankValueFor(seatCount);
  const seatPositions = getSeatPositions(seatCount);
  const trickPositions = getTrickPositions(seatCount);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  /* Rotate the table so the local player is always the bottom seat. Solo play
     is always seat 0 so this is a no-op there, but online you might be seat 3
     and still expect to be looking at your own hand from the bottom. */
  const displayIndex = (seat) => (seat - yourSeat + seatCount) % seatCount;

  const yourTurn = phase === "playing" && turn === yourSeat;
  const currentWinner = trick.length > 0 ? evaluateWinner(trick, rankValue) : null;

  /* Legality is re-derived here from the same shared rules the server uses, so
     the greyed-out cards in your hand always agree with what the server will
     actually accept — no separate client-side copy of "what's playable" to
     fall out of sync. classifyPlay only ever reads the acting seat's hand, so
     a state with just our own cards filled in is enough. */
  const localHands = Array.from({ length: seatCount }, (_, i) => (i === yourSeat ? hand : []));
  const legalityState = { phase, turn, cutSuit, trick, seatCount, hands: localHands };

  function roleIfPlayed(card) {
    if (!yourTurn) return null;
    return classifyPlay(legalityState, yourSeat, card);
  }
  const isLegal = (card) => roleIfPlayed(card) !== null;
  const previewFor = (card) => (trick.length === 0 ? null : roleTag(roleIfPlayed(card)));

  return (
    <div style={{ ...styles.wrap, ...styles.gameWrap }}>
      <style>{GLOBAL_STYLE}</style>
      {errorToast && <div style={styles.toastErr}>{errorToast}</div>}

      <div style={{ ...styles.header, paddingTop: 66 }}>
        <div style={styles.topLeftControls}>
          <button style={styles.quitBtn} onClick={onQuit}>Quit</button>
          {onAutoWin && <button style={styles.autoWinBtn} onClick={onAutoWin}>Auto Win (dev)</button>}
        </div>
        <div style={styles.topRightControls}>
          {headerBadge}
          <div style={styles.gameCounter}>GAME #{gameNumber}</div>
          <div style={styles.outcomesCounter}>
            <span style={styles.outcomeWin}>W {outcomes.win}</span>
            {" · "}
            <span style={styles.outcomeLoss}>L {outcomes.loss}</span>
            {" · "}
            <span style={styles.outcomeTie}>T {outcomes.tie}</span>
          </div>
        </div>
        <div style={styles.title}>CUT &amp; COLLECT</div>
        <div style={styles.subtitle}>a ten-hunting trick game · {seatCount} at the table</div>
      </div>

      <div style={styles.gameLayout}>
        <div style={{ ...styles.body, flex: 1, minWidth: 0 }}>
          {/* scoreboard */}
          <div style={styles.scorePanel}>
            <TeamScore team="A" tensWon={tensWon.A} score={scores.A} />
            <div style={styles.cutBadgeWrap}>
              <div style={styles.cutLabel}>CUT SUIT</div>
              <div style={{ ...styles.cutSeal, ...(cutSuit ? styles.cutSealSet : {}) }}>
                {cutSuit ? (
                  <span style={{ color: RED_SUITS.includes(cutSuit) ? "#8C2F2F" : "#1c2118", fontSize: 24 }}>{cutSuit}</span>
                ) : (
                  <span style={styles.cutSealDash}>—</span>
                )}
              </div>
            </div>
            <TeamScore team="B" tensWon={tensWon.B} score={scores.B} />
          </div>

          {/* table */}
          <div style={styles.tableOuter}>
            <div style={{ ...styles.tableFelt, ...(seatCount > 6 ? styles.tableFeltWide : {}) }}>
              {seatNames.map((name, seat) => {
                const pos = seatPositions[displayIndex(seat)];
                return (
                  <div key={seat} style={{ ...styles.seat, left: pos.left, top: pos.top }}>
                    <div
                      style={{
                        ...styles.seatLabel,
                        ...(seatIsBot && !seatIsBot[seat] ? styles.seatHuman : {}),
                        ...(turn === seat && phase === "playing" ? styles.seatActive : {}),
                        ...(currentWinner?.seat === seat ? styles.seatWinning : {}),
                      }}
                    >
                      {name}
                      <span style={styles.seatTeam}>{TEAM_OF(seat)}</span>
                    </div>
                    <div style={styles.seatHandCount}>
                      {seat === yourSeat ? "" : `${handCounts[seat]} cards`}
                    </div>
                    {/* someone else is on the clock — worth seeing, since online
                        you're otherwise just waiting with no idea how long */}
                    {seat !== yourSeat && turn === seat && phase === "playing" &&
                      turnTimeLimit != null && timeLeft != null && (
                        <div style={{ ...styles.seatTimer, ...(timeLeft <= 3 ? styles.seatTimerLow : {}) }}>
                          ⏱ {timeLeft}s
                        </div>
                      )}
                  </div>
                );
              })}

              {trick.map((p) => {
                const pos = trickPositions[displayIndex(p.seat)];
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

              {trick.length === 0 && phase === "playing" && (
                <div style={styles.tableCenterNote}>
                  {turn === yourSeat ? "Your lead — pick a card" : `waiting on ${seatNames[turn]}...`}
                </div>
              )}
            </div>
          </div>

          {/* log */}
          <div style={styles.logPanel}>
            {log.map((l, i) => (
              <div key={i} style={styles.logLine}>{l}</div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* result banner */}
          {phase === "handOver" && resultBanner}

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
                const legal = isLegal(card);
                return (
                  <button
                    key={card.id}
                    onClick={() => legal && onPlay(card)}
                    disabled={!legal}
                    style={{
                      ...styles.handCardBtn,
                      opacity: legal ? 1 : 0.35,
                      cursor: legal ? "pointer" : "default",
                      animation: `cardDealIn 0.3s ease-out backwards`,
                      animationDelay: `${i * 45}ms`,
                    }}
                  >
                    <CardFace card={card} tag={previewFor(card)} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <ChatPanel
          messages={chatMessages}
          onSend={onSendChat}
          enabled={chatEnabled}
          disabledNote={chatDisabledNote}
        />
      </div>
    </div>
  );
}
