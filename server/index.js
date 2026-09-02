/* ---------------------------------------------------------------------------
   Cut & Collect — multiplayer server.

   A small WebSocket server that acts as the *authority* for networked games.
   Clients never decide anything: they send intents ("I want to play 7♣") and
   the server re-derives whether that's legal from its own copy of the state
   (see shared/game-rules.js), applies it, and broadcasts the result. A client
   that lies — or is just out of date — simply gets an error back.

   Two consequences worth understanding:

   1. Hidden information stays hidden. The server sends each player a *view*
      of the game (buildView below) containing their own hand in full but only
      card counts for everyone else. If it broadcast the raw state, any player
      could read their opponents' cards straight out of the browser's network
      tab — no hacking required.

   2. Timing lives here, not in the client. Bot turns and trick resolution are
      driven by server-side timers, so every player sees the same thing happen
      at the same moment.
   ------------------------------------------------------------------------ */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import {
  SUITS,
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
  evaluateWinner,
} from "../shared/game-rules.js";

const PORT = process.env.PORT || 8787;

/* timings mirror the solo client so networked games feel identical */
const BOT_THINK_MS = 1800;
const TRICK_RESOLVE_MS = 1100;
/* turn-timer values the host may pick (seconds). null = untimed. Validated
   against this rather than trusted, so a client can't ask for a 1ms turn. */
const ALLOWED_TURN_LIMITS = [8, 15];

/* ---------- room storage ----------
   In-memory only: restart the server and rooms are gone. That's a deliberate
   trade for a game like this — a room only needs to outlive one sitting, and
   skipping a database keeps deployment to "run this one process". */
const rooms = new Map(); // code -> room

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — too easy to misread aloud
function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  } while (rooms.has(code));
  return code;
}

let nextClientId = 1;

/* ---------- helpers ---------- */
function seatNamesOf(room) {
  return room.seats.map((s, i) => (s.name || `Player ${i + 1}`));
}
function isBotSeat(room, seat) {
  return !room.seats[seat].clientId;
}
function humanSeats(room) {
  return room.seats.filter((s) => s.clientId);
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/* The per-player view: full own hand, counts only for everyone else. */
function buildView(room, seat) {
  const s = room.state;
  const base = {
    code: room.code,
    seatCount: room.seatCount,
    botDifficulty: room.botDifficulty,
    turnLimit: room.turnLimit,
    yourSeat: seat,
    seatNames: seatNamesOf(room),
    seatIsBot: room.seats.map((_, i) => isBotSeat(room, i)),
    hostSeat: room.hostSeat,
    chat: room.chat,
    gameNumber: room.gameNumber,
    outcomes: room.outcomes,
    started: !!s,
  };
  if (!s) return base;
  return {
    ...base,
    hand: seat != null && seat >= 0 ? s.hands[seat] : [],
    handCounts: s.hands.map((h) => h.length),
    turn: s.turn,
    leader: s.leader,
    trick: s.trick,
    cutSuit: s.cutSuit,
    scores: s.scores,
    tensWon: s.tensWon,
    // per-seat credit, for the end-of-match summary screen
    firstCutSeat: s.firstCutSeat,
    tensBySeat: s.tensBySeat,
    /* Milliseconds left on the current turn, sent as a *relative* value rather
       than an absolute deadline on purpose: players are on different devices
       whose clocks disagree, and a timestamp would render wrong for anyone
       whose clock is off. A duration is immune to that — the client just
       counts down from whatever it receives and resyncs on the next snapshot. */
    turnMsLeft: room.turnDeadline ? Math.max(0, room.turnDeadline - Date.now()) : null,
    log: s.log,
    phase: s.phase,
    result: s.result,
  };
}

function broadcast(room) {
  for (const seatInfo of room.seats) {
    if (!seatInfo.clientId) continue;
    const client = clients.get(seatInfo.clientId);
    if (client) send(client.ws, { type: "state", view: buildView(room, seatInfo.seat) });
  }
}

const clients = new Map(); // clientId -> { ws, roomCode, seat }

/* ---------- the game loop ----------
   After every state change we ask: does the server itself owe the table a
   move? Either a trick is complete and needs resolving, or it's a bot's turn.
   Both are scheduled on a timer so the pacing matches solo play. */
function scheduleAdvance(room) {
  clearTimeout(room.timer);
  room.turnDeadline = null;
  const s = room.state;
  if (!s) return;

  if (s.phase === "resolving") {
    room.timer = setTimeout(() => {
      room.state = resolveTrick(room.state, seatNamesOf(room));
      if (room.state.phase === "handOver") recordHandOutcome(room);
      scheduleAdvance(room);
      broadcast(room);
    }, TRICK_RESOLVE_MS);
    return;
  }

  if (s.phase !== "playing") return;

  if (isBotSeat(room, s.turn)) {
    room.timer = setTimeout(() => {
      const cur = room.state;
      if (!cur || cur.phase !== "playing" || !isBotSeat(room, cur.turn)) return;
      const rankValue = rankValueFor(cur.seatCount);
      const settings = BOT_DIFFICULTY_SETTINGS[room.botDifficulty] || BOT_DIFFICULTY_SETTINGS.normal;
      const card = botChooseCard(cur, cur.turn, rankValue, settings);
      const res = applyPlay(cur, cur.turn, card.id, seatNamesOf(room));
      if (res.error) return; // shouldn't happen — the bot only picks from its own hand
      room.state = res.state;
      scheduleAdvance(room);
      broadcast(room);
    }, BOT_THINK_MS);
    return;
  }

  /* A human's turn in a timed room. The countdown is owned here rather than in
     each client for two reasons: clients would drift apart on their own clocks,
     and several of them racing to auto-play the same seat is a mess. The server
     is the only thing that acts when the clock runs out — clients just render
     the number it hands them. */
  if (room.turnLimit) {
    room.turnDeadline = Date.now() + room.turnLimit * 1000;
    room.timer = setTimeout(() => {
      const cur = room.state;
      if (!cur || cur.phase !== "playing" || isBotSeat(room, cur.turn)) return;
      const card = randomLegalPlay(cur, cur.turn);
      if (!card) return;
      const res = applyPlay(cur, cur.turn, card.id, seatNamesOf(room));
      if (res.error) return;
      room.state = res.state;
      scheduleAdvance(room);
      broadcast(room);
    }, room.turnLimit * 1000);
  }
}

function recordHandOutcome(room) {
  const r = room.state.result;
  if (!r) return;
  // outcomes are tracked per team; each client renders it from their own seat
  if (r.type === "earlyTie") room.outcomes.tie += 1;
  else if (r.team === "A") room.outcomes.A += 1;
  else room.outcomes.B += 1;
}

function startHand(room, leader = 0) {
  room.state = createHandState(seatNamesOf(room), room.seatCount, leader);
  // schedule first so the turn deadline is set before the snapshot goes out
  scheduleAdvance(room);
  broadcast(room);
}

/* ---------- message handling ---------- */
function handleMessage(client, msg) {
  switch (msg.type) {
    case "create": {
      const seatCount = PLAYER_COUNTS.includes(msg.seatCount) ? msg.seatCount : 6;
      const botDifficulty = BOT_DIFFICULTIES.includes(msg.botDifficulty) ? msg.botDifficulty : "normal";
      // anything not on the allow-list means untimed, so a bad value degrades
      // to the safe option instead of producing an unplayable turn length
      const turnLimit = ALLOWED_TURN_LIMITS.includes(msg.turnLimit) ? msg.turnLimit : null;
      const code = makeRoomCode();
      const room = {
        code,
        seatCount,
        botDifficulty,
        turnLimit,
        turnDeadline: null,
        hostSeat: 0,
        // every seat starts as a bot; humans claim seats as they join
        seats: Array.from({ length: seatCount }, (_, i) => ({ seat: i, clientId: null, name: null })),
        state: null,
        chat: [],
        gameNumber: 1,
        outcomes: { A: 0, B: 0, tie: 0 },
        timer: null,
      };
      room.seats[0] = { seat: 0, clientId: client.id, name: (msg.name || "").trim() || "Player 1" };
      rooms.set(code, room);
      client.roomCode = code;
      client.seat = 0;
      send(client.ws, { type: "joined", code, seat: 0 });
      broadcast(room);
      break;
    }

    case "join": {
      const code = (msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(client.ws, { type: "error", message: `No room with code ${code}.` });
      if (room.state) return send(client.ws, { type: "error", message: "That game has already started." });
      const free = room.seats.find((s) => !s.clientId);
      if (!free) return send(client.ws, { type: "error", message: "That room is full." });
      free.clientId = client.id;
      free.name = (msg.name || "").trim() || `Player ${free.seat + 1}`;
      client.roomCode = code;
      client.seat = free.seat;
      send(client.ws, { type: "joined", code, seat: free.seat });
      broadcast(room);
      break;
    }

    case "start": {
      const room = rooms.get(client.roomCode);
      if (!room) return;
      if (client.seat !== room.hostSeat) {
        return send(client.ws, { type: "error", message: "Only the host can start the game." });
      }
      if (room.state) return;
      startHand(room, 0);
      break;
    }

    case "play": {
      const room = rooms.get(client.roomCode);
      if (!room || !room.state) return;
      // the server derives legality itself — a client claiming a role is ignored
      const res = applyPlay(room.state, client.seat, msg.cardId, seatNamesOf(room));
      if (res.error) return send(client.ws, { type: "error", message: res.error });
      room.state = res.state;
      scheduleAdvance(room);
      broadcast(room);
      break;
    }

    case "newHand": {
      const room = rooms.get(client.roomCode);
      if (!room || !room.state) return;
      if (client.seat !== room.hostSeat) {
        return send(client.ws, { type: "error", message: "Only the host can deal the next hand." });
      }
      if (room.state.phase !== "handOver") return;
      room.gameNumber += 1;
      startHand(room, (room.gameNumber - 1) % room.seatCount);
      break;
    }

    case "chat": {
      const room = rooms.get(client.roomCode);
      if (!room) return;
      const text = (msg.text || "").trim().slice(0, 200);
      if (!text) return;
      room.chat = [
        ...room.chat,
        { name: seatNamesOf(room)[client.seat], team: TEAM_OF(client.seat), text },
      ].slice(-100); // keep the last 100 so a long session can't grow unbounded
      broadcast(room);
      break;
    }

    /* Dev/testing shortcut — forces a mercy ("420") finish for the requesting
       player's team so the Claim Victory → End screen flow can be exercised
       without playing a hand out. It lives on the server rather than in the
       client because the server owns the state: a client faking a win locally
       would just be overwritten by the next broadcast. Everyone at the table
       sees the same finish, exactly as they would from a real one. */
    case "devWin": {
      const room = rooms.get(client.roomCode);
      if (!room || !room.state) return;
      const team = TEAM_OF(client.seat);
      const other = team === "A" ? "B" : "A";
      clearTimeout(room.timer);
      room.state = {
        ...room.state,
        trick: [],
        scores: { [team]: 4, [other]: 0 },
        tensWon: { [team]: [...SUITS], [other]: [] },
        // hand all four to the triggering player so the summary screen has
        // something realistic to render
        tensBySeat: room.state.tensBySeat.map((s, i) => (i === client.seat ? [...SUITS] : [])),
        firstCutSeat: room.state.firstCutSeat ?? client.seat,
        cutSuit: room.state.cutSuit ?? SUITS[0],
        log: [
          ...room.state.log,
          `(dev) Auto Win triggered by ${seatNamesOf(room)[client.seat]} — ${TEAM_SHORT[team]} captures all four 10's.`,
        ],
        phase: "handOver",
        result: { type: "mercy", team },
      };
      recordHandOutcome(room);
      broadcast(room);
      break;
    }

    default:
      break;
  }
}

/* Tear a room down and tell everyone still in it why. Clients get a
   "roomClosed" rather than a silent disconnect so they can show a reason
   instead of appearing to freeze. */
function closeRoom(room, reason) {
  clearTimeout(room.timer);
  for (const seatInfo of room.seats) {
    if (!seatInfo.clientId) continue;
    const c = clients.get(seatInfo.clientId);
    if (!c) continue;
    send(c.ws, { type: "roomClosed", reason });
    c.roomCode = null;
    c.seat = null;
  }
  rooms.delete(room.code);
}

/* ---------- disconnects ----------
   Two different outcomes depending on who left:

   - The HOST leaving ends the game for everyone. The host is the only seat
     that can deal the next hand, and quietly promoting someone else changes
     the game out from under a table that didn't agree to it. Cleaner to close
     the room and let people regroup.
   - Anyone else leaving just hands their seat to a bot, so the rest of the
     table plays on uninterrupted. */
function handleDisconnect(client) {
  clients.delete(client.id);
  const room = rooms.get(client.roomCode);
  if (!room) return;
  const seatInfo = room.seats[client.seat];
  if (!seatInfo || seatInfo.clientId !== client.id) return;

  seatInfo.clientId = null;

  if (client.seat === room.hostSeat) {
    closeRoom(room, `${seatInfo.name} (the host) left — the game has ended.`);
    return;
  }

  seatInfo.name = `${seatInfo.name} (bot)`;
  if (humanSeats(room).length === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }
  scheduleAdvance(room); // the seat just became a bot — it may now owe a move
  broadcast(room);
}

/* ---------- wiring ---------- */
/* A real HTTP server underneath the WebSocket one.

   `new WebSocketServer({ port })` would listen fine on its own, but it answers
   ordinary GET requests by rejecting them — which every hosting platform reads
   as "this process is unhealthy" and restarts in a loop. It also leaves you no
   way to check whether a deploy is actually alive short of writing a WebSocket
   client. So: plain HTTP for health, upgraded to WebSocket for the game. */
const httpServer = createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/" || url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "cut-and-collect",
        rooms: rooms.size,
        players: clients.size,
        uptimeSeconds: Math.round(process.uptime()),
      })
    );
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const client = { id: nextClientId++, ws, roomCode: null, seat: null };
  clients.set(client.id, client);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Malformed message." });
    }
    try {
      handleMessage(client, msg);
    } catch (err) {
      console.error("handler error", err);
      send(ws, { type: "error", message: "Server error handling that action." });
    }
  });

  ws.on("close", () => handleDisconnect(client));
  ws.on("error", () => handleDisconnect(client));
});

/* 0.0.0.0, not localhost: inside a container, binding to the loopback address
   makes the process unreachable from outside it — the single most common way a
   deploy looks healthy in logs and refuses every connection. */
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Cut & Collect multiplayer server listening on port ${PORT}`);
  console.log(`  health:    http://localhost:${PORT}/health`);
  console.log(`  websocket: ws://localhost:${PORT}`);
});
