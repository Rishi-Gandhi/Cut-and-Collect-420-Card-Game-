/* Sound effects. By default every sound here is synthesized in real time with
   the Web Audio API — no .mp3/.wav files bundled, so nothing to license or
   ship. If you'd rather use real recorded sounds, drop audio files into
   public/sounds/ (see public/sounds/README.txt for exact filenames) — they're
   detected automatically on startup and used instead, falling back to the
   synthesized version if a given file isn't there. */

const SOUND_FILES = {
  newGame: "./sounds/new-game.mp3",
  cardFlip: "./sounds/card-flip.mp3",
  firstCut: "./sounds/first-cut.mp3",
  pointScored: "./sounds/point-scored.mp3",
  win: "./sounds/win-fanfare.mp3",
  lose: "./sounds/lose-fanfare.mp3",
  tie: "./sounds/tie-fanfare.mp3",
  homeMusic: "./sounds/home-music.mp3",
  lobbyMusic: "./sounds/lobby-music.mp3",
  endMusic: "./sounds/end-music.mp3",
};

// Probed once at load via a quiet HEAD request (no console noise on a 404,
// unlike letting an <audio>/<img> tag fail to load) so playback never stalls
// waiting on a network check. Checking res.ok alone isn't enough — Vite's dev
// server returns 200 + the index.html fallback for ANY missing path (normal
// single-page-app behavior), so a missing sound file would otherwise look
// "available" and then silently fail to play as audio. The content-type
// check is what actually tells a real audio file apart from that fallback.
const fileAvailable = {};
/* Kept as promises, not just the resolved booleans, because callers need to be
   able to *wait* for the answer. Reading the boolean synchronously means losing
   a race on first paint: the probe hasn't returned yet, the key is undefined,
   and the caller wrongly concludes there's no file. Locally that never happens
   — the HEAD is instant — but over a tunnel or a real host it reliably does. */
const fileProbe = {};
for (const key of Object.keys(SOUND_FILES)) {
  fileProbe[key] = fetch(SOUND_FILES[key], { method: "HEAD" })
    .then((res) => {
      const type = res.headers.get("content-type") || "";
      return (fileAvailable[key] = res.ok && type.startsWith("audio/"));
    })
    .catch(() => (fileAvailable[key] = false));
}

function playFile(key) {
  const audio = new Audio(SOUND_FILES[key]);
  audio.play().catch(() => {});
}

let ctx = null;
function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/* Browsers refuse to make sound until a real user gesture (click/keypress)
   has happened on the page. Call this from the first button click of a
   session (the Start Game button) so the AudioContext is unlocked before
   the game actually needs it. */
export function unlockAudio() {
  try {
    getCtx();
  } catch {
    // Web Audio unsupported — sounds just won't play, nothing else breaks.
  }
}

function tone(freq, startTime, duration, type, peakGain) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);
  const t0 = c.currentTime + startTime;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/* A quick burst of filtered noise swept from high to low frequency — the
   standard trick for a procedural "whoosh"/card-flip sound, since a card
   flip is air movement + a snap, not a musical pitch. */
function noiseSwoosh(startTime, duration, freqStart, freqEnd, peakGain) {
  const c = getCtx();
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;

  const gain = c.createGain();
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  const t0 = c.currentTime + startTime;
  filter.frequency.setValueAtTime(freqStart, t0);
  filter.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + duration * 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  noise.start(t0);
  noise.stop(t0 + duration + 0.02);
}

function safely(fn) {
  try {
    fn();
  } catch {
    // no Web Audio support, or context blocked — fail silently
  }
}

function playSound(key, synthesize) {
  safely(() => {
    if (fileAvailable[key]) playFile(key);
    else synthesize();
  });
}

export function playNewGame() {
  playSound("newGame", () => noiseSwoosh(0, 0.26, 500, 3200, 0.4));
}

export function playCardFlip() {
  playSound("cardFlip", () => noiseSwoosh(0, 0.16, 2400, 450, 0.45));
}

/* The first cut of a hand (establishing the cut suit) is a bigger deal than
   an ordinary play, so it gets a sharper snap plus a bright ring on top,
   instead of just the plain card-flip whoosh. */
export function playFirstCut() {
  playSound("firstCut", () => {
    noiseSwoosh(0, 0.12, 3000, 700, 0.5);
    tone(880, 0.05, 0.25, "triangle", 0.2);
  });
}

export function playPointScored() {
  playSound("pointScored", () => {
    tone(880, 0, 0.12, "sine", 0.18);
    tone(1318.5, 0.07, 0.18, "sine", 0.16);
  });
}

export function playWinFanfare() {
  playSound("win", () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.4, "triangle", 0.16));
  });
}

export function playLoseFanfare() {
  playSound("lose", () => {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, i * 0.16, 0.45, "sawtooth", 0.1));
  });
}

export function playTieFanfare() {
  playSound("tie", () => {
    [440, 440, 554.37].forEach((f, i) => tone(f, i * 0.17, 0.22, "sine", 0.13));
  });
}

/* Background music — a different mood for the Home screen (mellow,
   waiting-around ambience) vs. the End screen (brighter, triumphant). If a
   matching public/sounds/*-music.mp3 exists, that's looped instead. Either
   way it's one loop at a time — starting one stops whatever was already
   playing. Deliberately not used on the Game screen — tried it, it competed
   with the card-flip/point-scored sounds too much. */
const HOME_CHORD_LOOP = [
  [261.63, 329.63, 392.0], // C major
  [220.0, 277.18, 329.63], // A minor
  [174.61, 220.0, 261.63], // F major
  [196.0, 246.94, 293.66], // G major
];
const END_CHORD_LOOP = [
  [349.23, 440.0, 523.25], // F major
  [261.63, 329.63, 392.0], // C major
  [392.0, 493.88, 587.33], // G major
  [261.63, 329.63, 392.0], // C major — resolves "home" twice, feels triumphant
];
/* Lobby: minor-key and deliberately unresolved — it never lands back on its
   own root, which reads as "something is about to happen" rather than the
   settled, sit-here-as-long-as-you-like feel of the Home loop. Slightly faster
   step than Home too, for a bit more forward pull while people file in. */
const LOBBY_CHORD_LOOP = [
  [293.66, 349.23, 440.0],  // D minor
  [233.08, 293.66, 349.23], // B♭ major
  [349.23, 440.0, 523.25],  // F major
  [261.63, 329.63, 392.0],  // C major — turns the loop over without resolving
];

let musicIntervalId = null;
let musicAudioEl = null;

function startSynthLoop(chords, stepSeconds, peakGain) {
  stopSynthLoop();
  let i = 0;
  const playStep = () => {
    safely(() => {
      chords[i % chords.length].forEach((f) => tone(f, 0, stepSeconds + 0.6, "sine", peakGain));
    });
    i++;
  };
  playStep();
  musicIntervalId = setInterval(playStep, stepSeconds * 1000);
}
function stopSynthLoop() {
  if (musicIntervalId) {
    clearInterval(musicIntervalId);
    musicIntervalId = null;
  }
}

/* Bumped on every start/stop so a probe that resolves late can tell it's been
   superseded. Without it, leaving a screen mid-probe starts that screen's music
   on top of the next one's. */
let musicGeneration = 0;

/* Browsers refuse to start audio until the user has interacted with the page,
   so the very first screen can't simply play — the attempt is rejected and,
   without this, stays silent until something happens to try again. That's why
   music appeared only after changing screens: navigating meant clicking, and
   the click was what actually unlocked audio.

   So a refusal arms a one-shot retry on the next click or keypress. Listening
   on the window in the capture phase means the game's own buttons don't have
   to know anything about it. */
let pendingGestureStart = null;
function retryOnFirstGesture(start) {
  pendingGestureStart = start;
  const fire = () => {
    window.removeEventListener("pointerdown", fire, true);
    window.removeEventListener("keydown", fire, true);
    window.removeEventListener("touchstart", fire, true);
    const run = pendingGestureStart;
    pendingGestureStart = null;
    if (run) run();
  };
  window.addEventListener("pointerdown", fire, true);
  window.addEventListener("keydown", fire, true);
  window.addEventListener("touchstart", fire, true);
}

function startMusic(fileKey, chords, stepSeconds, peakGain, fileVolume) {
  const generation = ++musicGeneration;

  const begin = (available) => {
    if (generation !== musicGeneration) return; // moved on while we were asking
    safely(() => {
      if (available) {
        if (!musicAudioEl || musicAudioEl.src !== new URL(SOUND_FILES[fileKey], window.location.href).href) {
          musicAudioEl = new Audio(SOUND_FILES[fileKey]);
          musicAudioEl.loop = true;
        }
        musicAudioEl.volume = fileVolume;
        musicAudioEl.play().catch(() => {
          // refused for want of a gesture — wait for one and start then
          retryOnFirstGesture(() => begin(available));
        });
      } else {
        startSynthLoop(chords, stepSeconds, peakGain);
        // an AudioContext created before a gesture starts suspended; if it
        // didn't resume, the loop is running silently and needs the same retry
        if (ctx && ctx.state === "suspended") retryOnFirstGesture(() => begin(available));
      }
    });
  };

  // Already know the answer: start now, with no gap.
  if (fileAvailable[fileKey] !== undefined) return begin(fileAvailable[fileKey]);

  /* Still probing. Waiting costs a moment of silence; guessing costs playing
     the wrong music and then switching, which is what a listener actually
     notices. The probe is a HEAD request, so this is latency, not a download. */
  fileProbe[fileKey].then(begin);
}

export function startHomeMusic() {
  startMusic("homeMusic", HOME_CHORD_LOOP, 2.8, 0.04, 0.35);
}

export function startLobbyMusic() {
  startMusic("lobbyMusic", LOBBY_CHORD_LOOP, 2.4, 0.04, 0.35);
}

export function startEndMusic() {
  startMusic("endMusic", END_CHORD_LOOP, 2.0, 0.05, 0.35);
}

export function stopBackgroundMusic() {
  musicGeneration++; // cancel any probe still waiting to start something
  pendingGestureStart = null; // and any music queued behind the first click
  safely(() => {
    if (musicAudioEl) musicAudioEl.pause();
    stopSynthLoop();
  });
}
