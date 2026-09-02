/* ---------- shared visual language ----------
   Felt-green / brass casino aesthetic. Pulled out of TenSuitCutGame.jsx so the
   solo screens, the multiplayer lobby, and the shared table component can all
   draw from one palette instead of drifting apart.
   Fonts: Bebas Neue (display), IBM Plex Mono (data/cards), Inter (UI text). */

export const GLOBAL_STYLE = `
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

export const styles = {
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
  /* countdown shown under whoever is on the clock — only rendered for *other*
     players, since your own turn already has the big timer in the hand header */
  seatTimer: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
    color: "#E7C878", marginTop: 1,
  },
  seatTimerLow: { color: "#E86A6A" },

  /* ---- server address picker (multiplayer lobby) ---- */
  serverRow: {
    display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
    padding: "6px 9px", background: "rgba(0,0,0,0.22)", borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.05)", marginBottom: 4,
  },
  serverLabel: { color: "#8fa595", letterSpacing: 1.5, fontSize: 9.5 },
  serverUrlText: { color: "#cfd9c9", flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  serverCustomTag: {
    fontSize: 9, letterSpacing: 1, color: "#1c2118", background: "#E7C878",
    borderRadius: 3, padding: "1px 4px",
  },
  serverEditBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#E7C878",
    background: "none", border: "1px solid #E7C87866", borderRadius: 4,
    padding: "2px 8px", cursor: "pointer",
  },
  serverEditWrap: {
    display: "flex", flexDirection: "column", gap: 6,
    padding: "10px", background: "rgba(0,0,0,0.28)", borderRadius: 8,
    border: "1px solid #E7C87844", marginBottom: 4,
  },
  serverInput: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
    padding: "8px 10px", borderRadius: 6, border: "1px solid #3a4a3c",
    background: "#141a15", color: "#EDE6D3", outline: "none", width: "100%",
    boxSizing: "border-box",
  },
  serverPreview: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#7CFC8A",
    overflowWrap: "anywhere",
  },
  serverHint: { fontSize: 10.5, color: "#8fa595", lineHeight: 1.45 },
  serverBtnRow: { display: "flex", gap: 6, flexWrap: "wrap" },

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
  chatDisabled: { opacity: 0.5, cursor: "not-allowed" },

  /* ---- mode picker (Solo vs Multiplayer) ---- */
  modeRow: { display: "flex", gap: 10 },
  modeBtn: {
    flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600,
    background: "transparent", color: "#cfd9c9", border: "1px solid #6b6250", borderRadius: 8,
    padding: "12px 8px", cursor: "pointer", textAlign: "center", lineHeight: 1.35,
  },
  modeBtnActive: { background: "#E7C878", color: "#1c2118", border: "1px solid #E7C878", fontWeight: 700 },
  modeBtnSub: { display: "block", fontSize: 10.5, opacity: 0.75, marginTop: 3, fontWeight: 400 },

  /* ---- lobby ---- */
  lobbyBody: { display: "flex", flexDirection: "column", gap: 14, alignItems: "center", flex: 1, minHeight: 0 },
  lobbyCard: {
    background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "22px 24px",
    display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 460, boxSizing: "border-box",
  },
  lobbyCodeWrap: { textAlign: "center", padding: "6px 0 2px" },
  lobbyCodeLabel: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, color: "#A9C2AE" },
  lobbyCode: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 12, color: "#E7C878",
    lineHeight: 1.1, textShadow: "0 2px 0 rgba(0,0,0,0.4)", paddingLeft: 12,
  },
  lobbyHint: { fontSize: 12.5, color: "#8fa595", textAlign: "center", fontStyle: "italic", lineHeight: 1.5 },
  lobbySeatList: { display: "flex", flexDirection: "column", gap: 6 },
  lobbySeatRow: {
    display: "flex", alignItems: "center", gap: 10, fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13.5, color: "#cfd9c9", background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 12px",
  },
  lobbySeatNum: { color: "#E7C878", fontWeight: 700, width: 26 },
  lobbySeatName: { flex: 1, color: "#EDE6D3" },
  lobbySeatTag: { fontSize: 11, color: "#8fa595", letterSpacing: 1 },
  lobbySeatYou: { color: "#7CFC8A", fontWeight: 700 },
  lobbyErr: {
    fontSize: 13, color: "#E86A6A", background: "rgba(232,106,106,0.1)",
    border: "1px solid #E86A6A55", borderRadius: 6, padding: "8px 12px", textAlign: "center",
  },
  lobbyStatus: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 1,
    color: "#A9C2AE", textAlign: "center",
  },
  connDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6 },

  /* ---- multiplayer in-game accents ---- */
  waitingBadge: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 1,
    color: "#A9C2AE", background: "rgba(0,0,0,0.28)", borderRadius: 6, padding: "5px 12px",
  },
  seatHuman: { boxShadow: "inset 0 0 0 1px #7CFC8A55" },
  toastErr: {
    position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
    background: "#5c1f1f", color: "#FFD9D9", border: "1px solid #E86A6A",
    borderRadius: 6, padding: "8px 16px", fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12.5, zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  },

  /* ---- auto-update banner ---- */
  updateBar: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    background: "rgba(231,200,120,0.12)", border: "1px solid #E7C87866", borderRadius: 8,
    padding: "8px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
    color: "#E7C878", marginBottom: 8, flexWrap: "wrap",
  },
  updateBtn: {
    fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12,
    background: "#E7C878", color: "#1c2118", border: "none", borderRadius: 6,
    padding: "5px 12px", cursor: "pointer",
  },

  /* ---- multiplayer match summary ---- */
  summaryScroll: { flex: 1, minHeight: 0, overflowY: "auto", width: "100%", boxSizing: "border-box" },
  summaryWinBanner: {
    textAlign: "center", background: "rgba(0,0,0,0.35)", borderRadius: 10,
    padding: "18px 20px", border: "1px solid #E7C87866", marginBottom: 12,
  },
  summaryWinLine: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: 3, color: "#E7C878", lineHeight: 1.1,
  },
  summaryWinSub: { fontSize: 14, color: "#cfd9c9", marginTop: 4 },

  /* the hand's headline facts, as a row of small labelled tiles */
  summaryFactsRow: { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 },
  summaryFact: {
    background: "rgba(0,0,0,0.24)", borderRadius: 8, padding: "10px 16px",
    minWidth: 120, textAlign: "center", border: "1px solid rgba(255,255,255,0.06)",
  },
  summaryFactLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 2,
    color: "#A9C2AE", marginBottom: 4,
  },
  summaryFactValue: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 700, color: "#EDE6D3",
  },

  summaryTeams: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 },
  summaryTeamCard: {
    flex: "1 1 260px", background: "rgba(0,0,0,0.24)", borderRadius: 10, padding: "14px 16px",
    border: "1px solid rgba(255,255,255,0.06)", boxSizing: "border-box",
  },
  summaryTeamCardWon: { border: "1px solid #E7C878", background: "rgba(231,200,120,0.09)" },
  summaryTeamHead: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 },
  summaryTeamName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2, color: "#EDE6D3" },
  summaryTeamTag: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: "#E7C878" },
  summaryTeamScore: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: "#E7C878", lineHeight: 1,
  },
  summaryTeamScoreSub: { fontSize: 11.5, color: "#8fa595", marginBottom: 10 },
  summaryPlayerRow: {
    display: "flex", alignItems: "center", gap: 8, fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13, color: "#cfd9c9", padding: "6px 8px", borderRadius: 6,
    background: "rgba(255,255,255,0.03)", marginTop: 5,
  },
  summaryPlayerName: { flex: 1, color: "#EDE6D3" },
  summaryPlayerYou: { color: "#7CFC8A", fontWeight: 700 },
  summaryPlayerTens: { color: "#E7C878", fontWeight: 700, whiteSpace: "nowrap" },
  summaryPlayerNone: { color: "#6b6250", whiteSpace: "nowrap" },
  summaryBadge: {
    fontSize: 9.5, letterSpacing: 1, color: "#1c2118", background: "#A9C2AE",
    borderRadius: 4, padding: "2px 5px", whiteSpace: "nowrap",
  },
};
