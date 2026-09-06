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
import { randomBytes } from "node:crypto";
import { createReadStream, stat } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { readLeaderboard, recordResult } from "../leaderboard-store.js";
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

/* The shared leaderboard lives on whoever runs the server, in a plain JSON file
   next to it. Unlike rooms — which are deliberately in-memory and vanish on
   restart — a record people compare against has to outlive the process.

   Reuses leaderboard-store.js, the same module Electron's IPC handlers and the
   Vite dev API already use; it takes the path as an argument precisely so each
   caller can decide where the file lives. */
const LEADERBOARD_PATH =
  process.env.LEADERBOARD_PATH ||
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "leaderboard-global.json");

/* timings mirror the solo client so networked games feel identical */
const BOT_THINK_MS = 1800;
const TRICK_RESOLVE_MS = 1100;
/* turn-timer values the host may pick (seconds). null = untimed. Validated
   against this rather than trusted, so a client can't ask for a 1ms turn. */
const ALLOWED_TURN_LIMITS = [8, 15];

/* ---------- how long things are held open ----------
   A dropped player's seat is *reserved* rather than surrendered: a bot plays it
   in the meantime so the table never stalls, but the seat itself — name, team,
   cards, and the right to come back to it — stays theirs for this long. Without
   a hold, a thirty-second phone tunnel costs you the game permanently.

   The room grace is the other half of the same idea: a room whose last person
   just dropped can't be deleted immediately, or there'd be nothing to reconnect
   *to*. Both are minutes rather than seconds because the failure they cover is
   "my wifi died", and the cost of holding an empty room in a Map is nil.

   Both are overridable, mostly so the behaviour can be exercised without
   sitting through it — the windows are minutes, which is right for players and
   impractical for a test. */
const SEAT_HOLD_MS = Number(process.env.SEAT_HOLD_MS) || 3 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = Number(process.env.EMPTY_ROOM_GRACE_MS) || 3 * 60 * 1000;

/* Spectators are cheap (they get the same snapshot everyone else does) but not
   free, and an unbounded list is a way to make one room expensive to serve. */
const MAX_SPECTATORS = 20;

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

/* The credential that makes reconnecting possible. A WebSocket client id is
   per-connection and useless across a drop, so a seat gets a secret of its own
   that the player's device keeps. Random rather than derived from the name:
   guessing one would mean walking into somebody else's seat and reading their
   hand, so it needs to be unguessable, not merely unique. */
function makeSeatToken() {
  return randomBytes(16).toString("hex");
}

/* A seat with nobody connected is one of two very different things, and almost
   every rule below turns on the difference:

   - *reserved* — a human sat here and dropped. A bot covers the seat so play
     continues, but it is still theirs to come back to, and nobody else may take
     it. This is what makes a dropped connection recoverable.
   - *open* — either nobody ever sat here, or the hold has run out. Free for a
     spectator to claim. */
function seatIsReserved(room, seat) {
  const s = room.seats[seat];
  if (s.clientId || !s.token || s.disconnectedAt == null) return false;
  return Date.now() - s.disconnectedAt < SEAT_HOLD_MS;
}
function seatIsOpen(room, seat) {
  return !room.seats[seat].clientId && !seatIsReserved(room, seat);
}

/* What the table calls this seat. Kept as a derived value rather than written
   into `name` on disconnect, because mutating the stored name is lossy: two
   drops in one session used to produce "Rishi (bot) (bot)", and there was then
   no clean name left to restore on a reconnect. */
function displayNameOf(room, i) {
  const s = room.seats[i];
  const base = s.name || `Player ${i + 1}`;
  if (s.clientId) return base;
  if (seatIsReserved(room, i)) return `${base} (away)`;
  return s.token ? `${base} (bot)` : base;
}
function seatNamesOf(room) {
  return room.seats.map((_, i) => displayNameOf(room, i));
}
function isBotSeat(room, seat) {
  return !room.seats[seat].clientId;
}
function humanSeats(room) {
  return room.seats.filter((s) => s.clientId);
}
/* Anyone at all still attached — players *or* spectators. A room with only
   spectators left is still worth keeping alive: the seats may all be held by
   people mid-reconnect, and the watchers are still watching. */
function roomHasPeople(room) {
  return humanSeats(room).length > 0 || room.spectators.length > 0;
}

/* ---------- room reaping ----------
   An emptied room isn't deleted on the spot any more, because "everyone left"
   and "everyone's wifi blinked at once" look identical from here. It's parked:
   game timers stop (nobody is watching a bot play to an empty room), and it is
   deleted only if nobody comes back before the grace window closes. */
function scheduleReap(room) {
  clearTimeout(room.timer);
  room.timer = null;
  room.turnDeadline = null;
  clearTimeout(room.reaper);
  room.reaper = setTimeout(() => {
    if (!roomHasPeople(room)) rooms.delete(room.code);
  }, EMPTY_ROOM_GRACE_MS);
}
function cancelReap(room) {
  clearTimeout(room.reaper);
  room.reaper = null;
}

function systemChat(room, text) {
  // team: null marks it as narration rather than someone talking
  room.chat = [...room.chat, { name: null, team: null, text, system: true }].slice(-100);
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/* The per-player view: full own hand, counts only for everyone else.

   `seat` is null for a spectator, and that single case is the whole of
   spectator security: with no seat there is no hand to fill in, so a watcher
   receives exactly the public table — card *counts* for everyone, nobody's
   cards. Handing spectators the raw state would be an open door, since anyone
   can open a second tab and watch the room they're playing in. */
function buildView(room, seat) {
  const s = room.state;
  const base = {
    code: room.code,
    seatCount: room.seatCount,
    botDifficulty: room.botDifficulty,
    turnLimit: room.turnLimit,
    yourSeat: seat,
    spectating: seat == null,
    seatNames: seatNamesOf(room),
    seatIsBot: room.seats.map((_, i) => isBotSeat(room, i)),
    /* Three separate flags because the UI says three different things: an
       empty chair you may sit in, a player who dropped and is expected back,
       and a seat that was never anyone's. */
    seatConnected: room.seats.map((x) => !!x.clientId),
    seatAway: room.seats.map((_, i) => seatIsReserved(room, i)),
    seatOpen: room.seats.map((_, i) => seatIsOpen(room, i)),
    spectators: room.spectators.map((x) => x.name),
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
  // every spectator sees the same seatless view, so it's built once
  if (room.spectators.length) {
    const spectatorView = buildView(room, null);
    for (const s of room.spectators) {
      const client = clients.get(s.clientId);
      if (client) send(client.ws, { type: "state", view: spectatorView });
    }
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
        /* Every seat starts as a bot; humans claim seats as they join.
           `token` is the reconnect credential (null until a human sits here)
           and `disconnectedAt` stamps when they dropped, which is what the
           seat-hold window is measured from. */
        seats: Array.from({ length: seatCount }, (_, i) => ({
          seat: i,
          clientId: null,
          name: null,
          token: null,
          disconnectedAt: null,
        })),
        spectators: [],
        state: null,
        chat: [],
        gameNumber: 1,
        outcomes: { A: 0, B: 0, tie: 0 },
        timer: null,
        reaper: null,
      };
      const token = makeSeatToken();
      room.seats[0] = {
        seat: 0,
        clientId: client.id,
        name: (msg.name || "").trim().slice(0, 24) || "Player 1",
        token,
        disconnectedAt: null,
      };
      rooms.set(code, room);
      client.roomCode = code;
      client.seat = 0;
      send(client.ws, { type: "joined", code, seat: 0, token });
      broadcast(room);
      break;
    }

    case "join": {
      const code = (msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(client.ws, { type: "error", message: `No room with code ${code}.` });

      /* A room that can't seat you is no longer a dead end — you can watch it
         instead. Sent as its own message type rather than a plain error so the
         client can offer that as a button; an error would just be a toast that
         fades, leaving the person exactly where they started. */
      if (room.state) {
        return send(client.ws, {
          type: "joinRejected",
          code,
          reason: "started",
          message: "That game is already under way, so there's no seat to deal you in on.",
          canSpectate: room.spectators.length < MAX_SPECTATORS,
        });
      }
      // `seatIsOpen`, not "has no client": a seat being held for someone who
      // dropped must not be handed to a stranger who happens to join next.
      const free = room.seats.find((s) => seatIsOpen(room, s.seat));
      if (!free) {
        return send(client.ws, {
          type: "joinRejected",
          code,
          reason: "full",
          message: "That room is full.",
          canSpectate: room.spectators.length < MAX_SPECTATORS,
        });
      }

      free.clientId = client.id;
      free.name = (msg.name || "").trim().slice(0, 24) || `Player ${free.seat + 1}`;
      free.token = makeSeatToken();
      free.disconnectedAt = null;
      client.roomCode = code;
      client.seat = free.seat;
      cancelReap(room);
      send(client.ws, { type: "joined", code, seat: free.seat, token: free.token });
      broadcast(room);
      break;
    }

    /* ---------- reconnecting ----------
       The seat is identified by its secret, not by the name typed in or the
       connection asking. That matters: names are duplicable and connections are
       new after a drop, so anything else here would let one player walk into
       another's seat and be dealt their hand. */
    case "resume": {
      const code = (msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        return send(client.ws, {
          type: "resumeFailed",
          message: `Room ${code} has closed — it can't be rejoined.`,
        });
      }
      /* Matched on the token alone, with no expiry check, and that's deliberate:
         SEAT_HOLD_MS governs how long the seat is *withheld from other people*,
         not how long the ticket stays valid. Once the hold lapses a spectator
         may claim the seat — and claiming it issues a fresh token, which
         invalidates this one. So while the seat is still sitting there unclaimed,
         a late reconnect is simply welcome. */
      const token = String(msg.token || "");
      const seatInfo = token && room.seats.find((s) => s.token === token);
      if (!seatInfo) {
        return send(client.ws, {
          type: "resumeFailed",
          message: "That seat is no longer being held for you.",
        });
      }
      if (seatInfo.clientId && seatInfo.clientId !== client.id) {
        return send(client.ws, {
          type: "resumeFailed",
          message: "Something else is already connected to that seat.",
        });
      }

      seatInfo.clientId = client.id;
      seatInfo.disconnectedAt = null;
      client.roomCode = code;
      client.seat = seatInfo.seat;
      cancelReap(room);
      send(client.ws, { type: "joined", code, seat: seatInfo.seat, token: seatInfo.token, resumed: true });
      systemChat(room, `${displayNameOf(room, seatInfo.seat)} reconnected.`);
      /* Re-derive what the table owes: the seat was a bot a moment ago and may
         have a bot move already scheduled against it. Rescheduling cancels that
         and hands the turn (and a fresh clock) back to the human. */
      scheduleAdvance(room);
      broadcast(room);
      break;
    }

    /* ---------- watching ----------
       A spectator holds no seat, so `client.seat` stays null — which is the
       flag every other handler checks before letting an action through, and
       what makes buildView withhold every hand. */
    case "spectate": {
      const code = (msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(client.ws, { type: "error", message: `No room with code ${code}.` });
      if (room.spectators.some((s) => s.clientId === client.id)) return;
      if (room.spectators.length >= MAX_SPECTATORS) {
        return send(client.ws, { type: "error", message: "That room has as many spectators as it can take." });
      }
      const name = (msg.name || "").trim().slice(0, 24) || "Spectator";
      room.spectators.push({ clientId: client.id, name });
      client.roomCode = code;
      client.seat = null;
      cancelReap(room);
      send(client.ws, { type: "joined", code, seat: null, spectating: true });
      systemChat(room, `${name} is watching.`);
      broadcast(room);
      break;
    }

    /* A watcher taking a seat that has genuinely come free — the natural end of
       spectating, and the reason a full room isn't a permanent no. Whatever the
       bot has been holding (its cards, its tricks) comes with the seat, so this
       works mid-hand exactly the way reconnecting into a bot-covered seat does. */
    case "claimSeat": {
      const room = rooms.get(client.roomCode);
      if (!room || client.seat != null) return;
      const target = room.seats[msg.seat];
      if (!target) return send(client.ws, { type: "error", message: "No such seat." });
      if (!seatIsOpen(room, target.seat)) {
        return send(client.ws, {
          type: "error",
          message: "That seat isn't free — someone's in it, or it's being held for a player who dropped.",
        });
      }
      const spec = room.spectators.find((s) => s.clientId === client.id);
      room.spectators = room.spectators.filter((s) => s.clientId !== client.id);
      target.clientId = client.id;
      target.name = spec?.name || `Player ${target.seat + 1}`;
      target.token = makeSeatToken();
      target.disconnectedAt = null;
      client.seat = target.seat;
      send(client.ws, { type: "joined", code: room.code, seat: target.seat, token: target.token });
      systemChat(room, `${displayNameOf(room, target.seat)} took seat ${target.seat + 1}.`);
      scheduleAdvance(room); // a bot seat just became human — cancel its pending move
      broadcast(room);
      break;
    }

    /* ---------- passing the host on ----------
       Host is a job (deal the next hand, start the game), not an owner, so it
       can be handed over. Before this the job was welded to seat 0 and the
       table died when that person left. */
    case "transferHost": {
      const room = rooms.get(client.roomCode);
      if (!room) return;
      if (client.seat !== room.hostSeat) {
        return send(client.ws, { type: "error", message: "Only the host can pass host duties on." });
      }
      const target = room.seats[msg.seat];
      if (!target || !target.clientId) {
        return send(client.ws, {
          type: "error",
          message: "Host can only go to a seat with a connected player in it.",
        });
      }
      if (target.seat === room.hostSeat) return;
      room.hostSeat = target.seat;
      systemChat(room, `${displayNameOf(room, target.seat)} is now the host.`);
      broadcast(room);
      break;
    }

    /* The host deliberately ending the table. This used to be the *only*
       outcome of a host leaving; now that leaving passes the job on instead, it
       needs to be something the host asks for on purpose. */
    case "closeRoom": {
      const room = rooms.get(client.roomCode);
      if (!room) return;
      if (client.seat !== room.hostSeat) {
        return send(client.ws, { type: "error", message: "Only the host can end the table." });
      }
      closeRoom(room, `${displayNameOf(room, room.hostSeat)} (the host) ended the table.`);
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
      // no seat, no move — a spectator's "play" is not a play
      if (client.seat == null) return;
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
      /* Spectators may talk — watching in enforced silence is a poor
         experience — but they're labelled rather than blended in: a remark from
         someone watching the whole table reads differently from a player's, and
         they have no team to be posted under. */
      const spec = client.seat == null ? room.spectators.find((s) => s.clientId === client.id) : null;
      if (client.seat == null && !spec) return;
      room.chat = [
        ...room.chat,
        client.seat == null
          ? { name: spec.name, team: null, text, spectator: true }
          : { name: displayNameOf(room, client.seat), team: TEAM_OF(client.seat), text },
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
      if (client.seat == null) return; // a spectator has no team to hand it to
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
  cancelReap(room);
  const notify = (id) => {
    const c = clients.get(id);
    if (!c) return;
    send(c.ws, { type: "roomClosed", reason });
    c.roomCode = null;
    c.seat = null;
  };
  for (const seatInfo of room.seats) if (seatInfo.clientId) notify(seatInfo.clientId);
  for (const s of room.spectators) notify(s.clientId);
  rooms.delete(room.code);
}

/* ---------- disconnects ----------
   Losing a connection is no longer the same as leaving. A dropped player's seat
   is *held* for them (SEAT_HOLD_MS) with a bot covering it, so the table keeps
   playing and they can walk straight back into it — see the "resume" handler.

   The host dropping used to end the game for everyone, on the reasoning that
   the host is the only seat that can deal the next hand. That cure was worse
   than the disease: one person's wifi ended everybody's night. Now the job
   moves to another connected player, and the room only closes when the host
   asks it to. If nobody is left to inherit, the room is parked rather than
   deleted, so the host can reconnect and still be the host. */
function handleDisconnect(client) {
  clients.delete(client.id);
  const room = rooms.get(client.roomCode);
  if (!room) return;

  // a spectator leaving costs the table nothing
  if (client.seat == null) {
    const before = room.spectators.length;
    room.spectators = room.spectators.filter((s) => s.clientId !== client.id);
    if (room.spectators.length === before) return;
    if (!roomHasPeople(room)) return scheduleReap(room);
    broadcast(room);
    return;
  }

  const seatInfo = room.seats[client.seat];
  if (!seatInfo || seatInfo.clientId !== client.id) return;

  // the seat becomes bot-played but stays theirs: token kept, clock started
  seatInfo.clientId = null;
  seatInfo.disconnectedAt = Date.now();

  if (client.seat === room.hostSeat) {
    const heir = room.seats.find((s) => s.clientId);
    if (heir) {
      room.hostSeat = heir.seat;
      systemChat(
        room,
        `${seatInfo.name || `Player ${client.seat + 1}`} dropped — ${displayNameOf(room, heir.seat)} is now the host.`
      );
    }
    /* No heir: hostSeat deliberately stays pointing at the empty seat. The room
       is about to be parked anyway, and leaving it put means a host who
       reconnects inside the grace window gets their job back. */
  } else {
    // the bare name, not displayNameOf — the seat is already marked away, so
    // that would read "Bob (away) dropped"
    systemChat(room, `${seatInfo.name || `Player ${client.seat + 1}`} dropped — a bot is covering the seat.`);
  }

  if (!roomHasPeople(room)) return scheduleReap(room);
  scheduleAdvance(room); // the seat is bot-played now — it may owe a move
  broadcast(room);
}

/* ---------- serving the game itself ----------
   The server hands out the built client as well as running the games, and that
   is the whole reason a friend can just be sent a link.

   Serving both from one origin means the page and the WebSocket share a host,
   so the client's existing "derive the server from whatever host served this
   page" logic resolves correctly with no configuration — the same rule that
   makes LAN play work. Split across two origins (Vite on 5173, this on 8787)
   they'd have to be tunnelled separately and the address typed in by hand.

   This is deliberately minimal — no compression, no ETags. It's serving a
   handful of files to a handful of players. */
const CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

/* Told to build first, rather than a bare 404 — a blank page here is otherwise
   indistinguishable from the tunnel being broken, which is a miserable thing to
   debug while friends are waiting. */
const NO_BUILD_PAGE = `<!doctype html><meta charset="utf-8">
<title>Cut &amp; Collect — not built yet</title>
<body style="font-family:system-ui;background:#0f140f;color:#EDE6D3;padding:3rem;line-height:1.6">
<h1 style="color:#E7C878">The server is running, but the game hasn't been built.</h1>
<p>Run this once, then reload:</p>
<pre style="background:#000;padding:1rem;border-radius:8px;color:#7CFC8A">npm run build</pre>
<p style="color:#8fa595">The multiplayer server is fine — it just has no client to hand you.</p>
</body>`;

function serveClient(req, urlPath, res) {
  // Everything unknown falls back to index.html: the client is a single page
  // that does its own screen switching, so there are no server-side routes.
  let rel = decodeURIComponent(urlPath);
  if (rel === "/" || !extname(rel)) rel = "/index.html";

  const filePath = resolve(CLIENT_DIR, "." + rel);

  // Refuse anything that escapes the build directory. This listener is exposed
  // to the internet through the tunnel, so a "../../" in the path must not be
  // able to read arbitrary files off the machine.
  if (filePath !== CLIENT_DIR && !filePath.startsWith(CLIENT_DIR + sep)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  stat(filePath, (err, info) => {
    if (err || !info.isFile()) {
      if (rel === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(NO_BUILD_PAGE);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }

    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    // Vite fingerprints asset filenames, so those are safe to cache hard;
    // index.html must not be, or a rebuild would keep serving the old bundle.
    const cache = rel.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";

    /* Range support matters here specifically because of the audio. Answering
       every request with the whole file means a browser has to finish
       downloading a music track before it can begin playing it — survivable on
       localhost, painful over a tunnel where the ceiling is a home upload link.
       With ranges it streams, and starts within a second regardless of size. */
    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === "" ? null : Number(m[1]);
      let end = m[2] === "" ? null : Number(m[2]);
      if (start === null) {
        // "bytes=-500" means the *last* 500 bytes, not from zero
        start = Math.max(0, info.size - (end || 0));
        end = info.size - 1;
      } else {
        end = end === null ? info.size - 1 : Math.min(end, info.size - 1);
      }
      if (start > end || start >= info.size) {
        res.writeHead(416, { "content-range": `bytes */${info.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "content-type": type,
        "content-length": end - start + 1,
        "content-range": `bytes ${start}-${end}/${info.size}`,
        "accept-ranges": "bytes",
        "cache-control": cache,
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "content-type": type,
      "content-length": info.size,
      "accept-ranges": "bytes",
      "cache-control": cache,
    });
    createReadStream(filePath).pipe(res);
  });
}

/* ---------- wiring ---------- */
/* A real HTTP server underneath the WebSocket one.

   `new WebSocketServer({ port })` would listen fine on its own, but it answers
   ordinary GET requests by rejecting them — which every hosting platform reads
   as "this process is unhealthy" and restarts in a loop. It also leaves you no
   way to check whether a deploy is actually alive short of writing a WebSocket
   client. So: plain HTTP for health, upgraded to WebSocket for the game. */
/* ---------- the shared leaderboard API ----------
   Plain HTTP rather than a WebSocket message, because it has to work for people
   who aren't in a room — the Home screen shows the board before anyone connects
   to anything.

   CORS is open because the client is frequently on a different origin than the
   server: Vite on :5173 during development, and file:// in the packaged desktop
   app. When the server is the thing serving the page they're same-origin and
   none of this applies. The data is a public scoreboard either way. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function handleLeaderboardApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "GET") {
    return sendJson(res, 200, readLeaderboard(LEADERBOARD_PATH));
  }

  if (req.method === "POST") {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      body += chunk;
      // a result row is a few dozen bytes; anything larger is not a real client
      if (body.length > 4096) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return;
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: "Malformed JSON." });
      }
      /* Validated rather than trusted: this endpoint is reachable by anyone who
         can open the game. It can't stop someone scripting wins — that would
         need real accounts — but it does stop a malformed or hostile payload
         from corrupting the file everyone else's record lives in. */
      const name = String(payload?.name ?? "").trim().slice(0, 24);
      const result = payload?.result;
      if (!name) return sendJson(res, 400, { error: "A name is required." });
      if (!["win", "loss", "tie"].includes(result)) {
        return sendJson(res, 400, { error: "result must be win, loss or tie." });
      }
      const pb = payload?.personalBestCandidate;
      const personalBestCandidate =
        Number.isInteger(pb) && pb > 0 && pb < 10000 ? pb : null;

      try {
        return sendJson(res, 200, recordResult(LEADERBOARD_PATH, { name, result, personalBestCandidate }));
      } catch (err) {
        console.error("leaderboard write failed", err);
        return sendJson(res, 500, { error: "Could not save that result." });
      }
    });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

const httpServer = createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  /* Deliberately NOT "/api/leaderboard": that path belongs to the Vite dev
     server's per-device board, and since this server also serves the client,
     a relative fetch from the page would otherwise land here and make the
     device's own record and the shared one the same list. */
  if (url === "/api/leaderboard/global") return handleLeaderboardApi(req, res);

  /* An unmatched /api/ path must not fall through to the single-page fallback:
     a caller expecting JSON would receive index.html and report a parse error
     rather than "no such endpoint". */
  if (url.startsWith("/api/")) return sendJson(res, 404, { error: `No such endpoint: ${url}` });

  if (url === "/health") {
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

  serveClient(req, url, res);
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

/* The common failure is a leftover server from an earlier session still holding
   the port. Node's default for that is an unhandled 'error' event and a stack
   trace — and under `npm run play:online` it's worse than unhelpful, because
   concurrently -k then kills the tunnel too, so the visible symptom is "tunnel
   exited" and the real cause has scrolled away. Say what actually happened. */
function handleListenError(err) {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n  Port ${PORT} is already in use.\n\n` +
        `  Another copy of the game server is probably still running from an\n` +
        `  earlier session. Stop it with:\n\n` +
        `      lsof -ti:${PORT} | xargs kill\n\n` +
        `  ...then try again.\n`
    );
    process.exit(1);
  }
  throw err;
}
/* Both, because attaching a WebSocketServer to an http server makes it re-emit
   the listen failure on itself — handling only the http one leaves the original
   unhandled 'error' event, and the stack trace comes back. */
httpServer.on("error", handleListenError);
wss.on("error", handleListenError);

/* 0.0.0.0, not localhost: inside a container, binding to the loopback address
   makes the process unreachable from outside it — the single most common way a
   deploy looks healthy in logs and refuses every connection. */
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Cut & Collect multiplayer server listening on port ${PORT}`);
  console.log(`  health:    http://localhost:${PORT}/health`);
  console.log(`  websocket: ws://localhost:${PORT}`);
});
