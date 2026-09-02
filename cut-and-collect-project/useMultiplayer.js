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

export function useMultiplayer() {
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | closed | error
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [seat, setSeat] = useState(null);
  const [code, setCode] = useState(null);
  /* Set when the server deliberately ends the room (currently: the host left).
     Distinct from `error` because it's terminal — the game is over, not
     temporarily unhappy — so the UI shows a dead end rather than a toast. */
  const [closedReason, setClosedReason] = useState(null);
  const wsRef = useRef(null);

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
    if (wsRef.current) {
      wsRef.current.onclose = null; // we're closing on purpose — don't report it as a drop
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("idle");
    setView(null);
    setSeat(null);
    setCode(null);
    setError(null);
    setClosedReason(null);
  }, []);

  /* Opens the socket and resolves once it's actually usable. Callers await
     this before sending anything, since a WebSocket silently throws if you
     write to it before it's open. */
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return Promise.resolve(true);
    setStatus("connecting");
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
        } else if (msg.type === "roomClosed") {
          // the room is gone; stop treating the socket's own close as a fault
          setClosedReason(msg.reason || "The game has ended due to the host disconnecting.");
          if (wsRef.current) wsRef.current.onclose = null;
        } else if (msg.type === "error") setError(msg.message);
      };
      ws.onerror = () => {
        setStatus("error");
        setError(`Couldn't reach the game server at ${serverUrlRef.current}. Is it running?`);
        resolve(false);
      };
      ws.onclose = () => {
        setStatus("closed");
        setError("Lost connection to the game server.");
      };
    });
  }, []);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

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
      const ok = await connect();
      if (ok) send({ type: "join", code: roomCode, name });
      return ok;
    },
    [connect, send]
  );

  const startGame = useCallback(() => send({ type: "start" }), [send]);
  const play = useCallback((cardId) => send({ type: "play", cardId }), [send]);
  const newHand = useCallback(() => send({ type: "newHand" }), [send]);
  const sendChat = useCallback((text) => send({ type: "chat", text }), [send]);
  const devWin = useCallback(() => send({ type: "devWin" }), [send]);

  // close the socket if the component tree using this hook goes away
  useEffect(() => () => wsRef.current?.close(), []);

  return {
    status, view, error, seat, code, closedReason,
    serverUrl, setServerUrl, resetServerUrl, defaultServerUrl: defaultServerUrl(),
    connect, disconnect, createRoom, joinRoom, startGame, play, newHand, sendChat, devWin,
    clearError: () => setError(null),
  };
}
