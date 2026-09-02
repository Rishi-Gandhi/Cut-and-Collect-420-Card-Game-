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
function resolveServerUrl() {
  const configured = import.meta.env?.VITE_MP_SERVER_URL;
  if (configured) return configured;
  if (typeof window === "undefined") return `ws://localhost:${DEFAULT_PORT}`;
  const { protocol, hostname } = window.location;
  if (!hostname || protocol === "file:") return `ws://localhost:${DEFAULT_PORT}`;
  // an https page may only open wss:// — browsers block mixed-content sockets
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${hostname}:${DEFAULT_PORT}`;
}
const SERVER_URL = resolveServerUrl();

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
        ws = new WebSocket(SERVER_URL);
      } catch {
        setStatus("error");
        setError(`Couldn't reach the game server at ${SERVER_URL}.`);
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
        setError(`Couldn't reach the game server at ${SERVER_URL}. Is it running?`);
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
    status, view, error, seat, code, closedReason, serverUrl: SERVER_URL,
    connect, disconnect, createRoom, joinRoom, startGame, play, newHand, sendChat, devWin,
    clearError: () => setError(null),
  };
}
