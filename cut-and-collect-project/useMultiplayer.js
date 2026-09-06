import { useState, useRef, useCallback, useEffect } from "react";

/* ---------------------------------------------------------------------------
   useMultiplayer — the client half of the networked game.

   All of the WebSocket lifecycle lives in here so the React components above
   it never touch a socket directly. They get plain data (`view`) and plain
   functions (`play`, `sendChat`, ...) and stay purely declarative — which is
   what makes the same <GameTable> render both a solo game and a networked one.

   The mental model: this hook holds no game state of its own. The server owns
   the truth; `view` is just the latest snapshot it sent us. Every action is a
   *request* — we send an intent and wait for the next snapshot to tell us what
   actually happened. That's why there's no optimistic updating here: showing a
   card as played before the server agrees is exactly how client and server
   drift apart.
   ------------------------------------------------------------------------ */

/* Where the multiplayer server lives.

   An explicit VITE_MP_SERVER_URL always wins — that's how a shipped build gets
   pointed at the deployed cloud server (see .env.example; Vite inlines it at
   build time).

   Failing that we derive the address from whatever host served this page, and
   that fallback is what makes LAN play work with zero configuration: open the
   game at http://192.168.1.42:5173 on a second device and it connects to
   ws://192.168.1.42:8787 — the machine running the server — instead of to the
   second device's own (empty) localhost. Hardcoding localhost here would mean
   every device looked for the server on itself and found nothing.

   Packaged Electron is the exception: it loads over file://, which has no
   hostname to borrow, so that falls back to localhost. */
const DEFAULT_PORT = 8787;
export function defaultServerUrl() {
  const configured = import.meta.env?.VITE_MP_SERVER_URL;
  if (configured) return configured;
  if (typeof window === "undefined") return `ws://localhost:${DEFAULT_PORT}`;

  const { protocol, hostname, host } = window.location;
  if (!hostname || protocol === "file:") return `ws://localhost:${DEFAULT_PORT}`;

  // an https page may only open wss:// — browsers block mixed-content sockets
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";

  /* Which port depends on *what served this page*, and the two cases differ:

     - In dev, Vite serves it on 5173 while the game server is a separate
       process on 8787, so the port has to be named explicitly.
     - In a build, the game server serves the page itself, so the socket lives
       on whatever port the page already came from. Naming 8787 there breaks
       exactly the case this is for: behind a tunnel or a real host the page
       arrives over 443, and ws://host:8787 goes nowhere.

     `host` (unlike `hostname`) already carries the port when it's non-default,
     which is precisely the "same place this page came from" answer. */
  if (import.meta.env?.DEV) return `${wsProtocol}//${hostname}:${DEFAULT_PORT}`;
  return `${wsProtocol}//${host}`;
}

/* ---------- the player's own override ----------
   The build-time default above can't cover every case. A packaged desktop app
   loads over file:// and so always falls back to localhost, which means the
   .app can't reach a server on someone else's machine — not even on the same
   wifi — without this. And a build baked against one deployed host would
   otherwise need a whole new release just to move hosts.

   So the address is editable and remembered per device. */
const STORAGE_KEY = "cutcollect.serverUrl";

/* Accepts what people actually type — "myapp.fly.dev", a pasted https:// URL,
   "192.168.1.42:8787" — and turns it into a URL a WebSocket will accept.

   The protocol guess is the important part: ws:// to a remote host fails on an
   HTTPS page (browsers block mixed content) and is unencrypted regardless,
   while wss:// to a bare LAN box fails because there's no certificate. Local
   addresses therefore default to ws://, everything else to wss://. */
export function normalizeServerUrl(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  s = s.replace(/\/+$/, ""); // trailing slashes break nothing but look wrong when echoed back

  if (/^https:\/\//i.test(s)) return `wss://${s.slice(8)}`;
  if (/^http:\/\//i.test(s)) return `ws://${s.slice(7)}`;
  if (/^wss?:\/\//i.test(s)) return s;

  const host = s.split("/")[0].split(":")[0].toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  // a bare LAN host also needs the port spelled out; a deployed one is behind 443
  const needsPort = isLocal && !s.includes(":");
  return `${isLocal ? "ws" : "wss"}://${s}${needsPort ? `:${DEFAULT_PORT}` : ""}`;
}

/* The same server, addressed over plain HTTP instead of a WebSocket — used for
   the shared leaderboard, which has to work on the Home screen before anyone
   has connected to anything. */
export function httpBaseFor(wsUrl) {
  const u = String(wsUrl || "");
  if (u.startsWith("wss://")) return "https://" + u.slice(6);
  if (u.startsWith("ws://")) return "http://" + u.slice(5);
  return u;
}

function readStoredServerUrl() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null; // private windows and locked-down browsers throw rather than return null
  }
}
function writeStoredServerUrl(url) {
  try {
    if (url) window.localStorage.setItem(STORAGE_KEY, url);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* not being able to remember it is survivable; failing to connect isn't */
  }
}

/* ---------- the reconnect ticket ----------
   The server hands out a per-seat token when you sit down, and that token —
   not this connection, and not the name typed in — is what identifies the seat
   afterwards. Kept in localStorage rather than in React state because the case
   worth surviving is the tab being closed or reloaded, which takes all state
   with it.

   Deliberately *not* cleared when the socket drops: a drop is precisely when
   it becomes useful. It's cleared when the player leaves on purpose, when the
   room closes, and when the server says the seat is no longer theirs. */
const SESSION_KEY = "cutcollect.session";

function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.code && s.token ? s : null;
  } catch {
    return null;
  }
}
function writeSession(session) {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* the game still works, you just can't rejoin after closing the tab */
  }
}

/* Backoff for automatic reconnection. Starts fast, because most drops are a
   blip and land on the first retry, and stretches out rather than hammering a
   server that may be genuinely gone. The list length is the give-up point. */
const RECONNECT_DELAYS = [400, 900, 2000, 4000, 8000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useMultiplayer() {
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | reconnecting | closed | error
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [seat, setSeat] = useState(null);
  const [code, setCode] = useState(null);
  /* Set when the server deliberately ends the room, or when a seat we were
     holding a ticket for is gone for good. Distinct from `error` because it's
     terminal — the game is over, not temporarily unhappy — so the UI shows a
     dead end rather than a toast. */
  const [closedReason, setClosedReason] = useState(null);
  /* True while watching rather than playing. Kept alongside `seat` because
     "no seat yet" and "deliberately seatless" are different states. */
  const [spectating, setSpectating] = useState(false);
  /* The server's answer when a room can't seat you, held rather than flashed:
     it carries a "watch instead" offer the player has to be able to act on. */
  const [joinRejection, setJoinRejection] = useState(null);
  /* A ticket left over from a previous session — a closed tab, a reload, a
     crash — which the Home screen turns into a "rejoin" offer. */
  const [resumable, setResumable] = useState(() =>
    typeof window === "undefined" ? null : readSession()
  );
  const wsRef = useRef(null);

  /* The seat ticket for the room we're currently in. A ref because the socket
     callbacks below need the live value, not the one captured when they were
     created. */
  const sessionRef = useRef(null);
  /* Set while we're closing the socket on purpose, so its `onclose` doesn't
     mistake a deliberate exit for a dropped connection and start reconnecting. */
  const leavingRef = useRef(false);
  /* Guards the retry loop against being started twice — each failed attempt
     closes a socket, whose own onclose would otherwise start another loop. */
  const retryingRef = useRef(false);
  const reconnectRef = useRef(null);

  /* The address is state so editing it re-renders, and *also* a ref because
     connect() is a useCallback that would otherwise close over a stale value
     and keep dialling the previous server after a change. */
  const [serverUrl, setServerUrlState] = useState(() => readStoredServerUrl() || defaultServerUrl());
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const setServerUrl = useCallback((input) => {
    const normalized = normalizeServerUrl(input);
    if (!normalized) return null;
    writeStoredServerUrl(normalized);
    setServerUrlState(normalized);
    serverUrlRef.current = normalized;
    return normalized;
  }, []);

  /* Back to whatever this build was compiled with — the escape hatch for
     having typed something wrong and no longer being able to reach anything. */
  const resetServerUrl = useCallback(() => {
    const fallback = defaultServerUrl();
    writeStoredServerUrl(null);
    setServerUrlState(fallback);
    serverUrlRef.current = fallback;
    return fallback;
  }, []);

  /* transient errors ("that's not a legal play") should fade rather than
     stick around and be mistaken for the current state of things */
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const disconnect = useCallback(() => {
    leavingRef.current = true;
    if (wsRef.current) {
      wsRef.current.onclose = null; // we're closing on purpose — don't report it as a drop
      wsRef.current.close();
      wsRef.current = null;
    }
    /* Leaving on purpose gives up the seat: the ticket is what makes the server
       hold it, and holding a seat for someone who walked away would keep a bot
       in a chair a real player could have. */
    sessionRef.current = null;
    writeSession(null);
    setResumable(null);
    setStatus("idle");
    setView(null);
    setSeat(null);
    setCode(null);
    setSpectating(false);
    setJoinRejection(null);
    setError(null);
    setClosedReason(null);
  }, []);

  /* Opens the socket and resolves once it's actually usable. Callers await
     this before sending anything, since a WebSocket silently throws if you
     write to it before it's open. */
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return Promise.resolve(true);
    leavingRef.current = false;
    setStatus((s) => (s === "reconnecting" ? s : "connecting"));
    return new Promise((resolve) => {
      let ws;
      try {
        ws = new WebSocket(serverUrlRef.current);
      } catch {
        setStatus("error");
        setError(`Couldn't reach the game server at ${serverUrlRef.current}.`);
        return resolve(false);
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        resolve(true);
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "state") setView(msg.view);
        else if (msg.type === "joined") {
          setSeat(msg.seat);
          setCode(msg.code);
          setSpectating(!!msg.spectating);
          setJoinRejection(null);
          setStatus("connected");
          retryingRef.current = false;
          /* Only a seat is worth a ticket. A spectator has nothing the server
             is holding for them, so there is nothing to come back to. */
          if (msg.token) {
            const session = { code: msg.code, token: msg.token, seat: msg.seat };
            sessionRef.current = session;
            writeSession(session);
            setResumable(session);
          }
        } else if (msg.type === "joinRejected") {
          setJoinRejection(msg);
        } else if (msg.type === "resumeFailed") {
          /* The seat is genuinely gone — someone took it, or the room closed.
             Drop the ticket so we stop offering to rejoin something that isn't
             there, and show it as terminal rather than as a retryable error. */
          sessionRef.current = null;
          writeSession(null);
          setResumable(null);
          retryingRef.current = false;
          setClosedReason(msg.message || "That game can't be rejoined.");
          if (wsRef.current) wsRef.current.onclose = null;
        } else if (msg.type === "roomClosed") {
          // the room is gone; stop treating the socket's own close as a fault
          sessionRef.current = null;
          writeSession(null);
          setResumable(null);
          setClosedReason(msg.reason || "The game has ended.");
          if (wsRef.current) wsRef.current.onclose = null;
        } else if (msg.type === "error") setError(msg.message);
      };
      ws.onerror = () => {
        // during a retry loop this is expected — the loop reports the failure
        if (!retryingRef.current) {
          setStatus("error");
          setError(`Couldn't reach the game server at ${serverUrlRef.current}. Is it running?`);
        }
        resolve(false);
      };
      ws.onclose = () => {
        if (leavingRef.current) return;
        /* Holding a seat ticket turns a dropped connection from an ending into
           an interruption: the server is keeping the seat, so go and get it
           back rather than reporting a dead game. */
        if (sessionRef.current) {
          reconnectRef.current?.();
          return;
        }
        setStatus("closed");
        setError("Lost connection to the game server.");
      };
    });
  }, []);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  /* Walk back in with the ticket. Used both automatically (a drop mid-game) and
     manually (the "rejoin" offer after a reload), which is why it takes the
     session explicitly rather than only reading the ref. */
  const resumeSession = useCallback(
    async (session) => {
      const s = session || sessionRef.current || readSession();
      if (!s) return false;
      sessionRef.current = s;
      setClosedReason(null);
      const ok = await connect();
      if (!ok) return false;
      send({ type: "resume", code: s.code, token: s.token });
      return true;
    },
    [connect, send]
  );

  /* The automatic half: retry on a backoff until the seat is back or the list
     of delays runs out. Only ever one of these running — a failed attempt
     closes its socket, and that close would otherwise start a second loop. */
  const attemptReconnect = useCallback(async () => {
    if (retryingRef.current) return;
    const session = sessionRef.current;
    if (!session) return;
    retryingRef.current = true;
    setStatus("reconnecting");

    for (const delay of RECONNECT_DELAYS) {
      if (leavingRef.current || !sessionRef.current) break;
      await sleep(delay);
      if (leavingRef.current || !sessionRef.current) break;
      wsRef.current = null; // the dead socket is not worth reusing
      const ok = await connect();
      if (!ok) continue;
      send({ type: "resume", code: session.code, token: session.token });
      return; // the answer arrives as `joined` or `resumeFailed`
    }

    if (retryingRef.current) {
      retryingRef.current = false;
      setStatus("closed");
      setError("Lost connection to the game server.");
    }
  }, [connect, send]);
  // assigned during render, matching how serverUrlRef is kept current above
  reconnectRef.current = attemptReconnect;

  const createRoom = useCallback(
    async (name, seatCount, botDifficulty, turnLimit = null) => {
      const ok = await connect();
      if (ok) send({ type: "create", name, seatCount, botDifficulty, turnLimit });
      return ok;
    },
    [connect, send]
  );

  const joinRoom = useCallback(
    async (roomCode, name) => {
      setJoinRejection(null); // a fresh attempt, not a rerun of the last refusal
      const ok = await connect();
      if (ok) send({ type: "join", code: roomCode, name });
      return ok;
    },
    [connect, send]
  );

  /* Watching instead of playing — the answer to a room that's full or already
     under way. No seat, so no ticket and nothing held on the server. */
  const spectateRoom = useCallback(
    async (roomCode, name) => {
      const ok = await connect();
      if (ok) send({ type: "spectate", code: roomCode, name });
      return ok;
    },
    [connect, send]
  );

  const startGame = useCallback(() => send({ type: "start" }), [send]);
  const play = useCallback((cardId) => send({ type: "play", cardId }), [send]);
  const newHand = useCallback(() => send({ type: "newHand" }), [send]);
  const sendChat = useCallback((text) => send({ type: "chat", text }), [send]);
  const devWin = useCallback(() => send({ type: "devWin" }), [send]);
  const claimSeat = useCallback((seatIndex) => send({ type: "claimSeat", seat: seatIndex }), [send]);
  const transferHost = useCallback((seatIndex) => send({ type: "transferHost", seat: seatIndex }), [send]);
  const closeRoom = useCallback(() => send({ type: "closeRoom" }), [send]);
  const dismissJoinRejection = useCallback(() => setJoinRejection(null), []);

  // close the socket if the component tree using this hook goes away
  useEffect(() => () => {
    leavingRef.current = true;
    wsRef.current?.close();
  }, []);

  return {
    status, view, error, seat, code, closedReason, spectating, joinRejection, resumable,
    serverUrl, setServerUrl, resetServerUrl, defaultServerUrl: defaultServerUrl(),
    connect, disconnect, createRoom, joinRoom, spectateRoom, resumeSession,
    startGame, play, newHand, sendChat, devWin, claimSeat, transferHost, closeRoom,
    dismissJoinRejection,
    clearError: () => setError(null),
  };
}
