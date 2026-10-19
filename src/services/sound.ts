/**
 * Sound feedback (competitor comparison 1.2): a short tone after each graded answer, a rising one at every
 * COMBO_EVERY right answers in a row, a short fanfare when a session ends. The tones are made with the Web
 * Audio API (no files). One AudioContext per window, created on the first sound and suspended again shortly
 * after the last one so an idle window keeps no audio thread busy. Everything fails silently: no Web Audio
 * (tests, an old webview), sound turned off, or the window hidden (a sound nobody triggered on screen).
 *
 * The on/off switch and the volume are a device preference (speakers at home, none at the office), so they
 * stay on this machine and are not in SYNCED_KV.
 */
import { persistKeyNow } from "./storageBackup";

export type SoundKind = "correct" | "wrong" | "combo" | "complete" | "tick" | "tierUp" | "timeOut";

export const SOUND_SETTINGS_KEY = "myenglish_sound_v1";
/** A combo sound at every this many right answers in a row */
export const COMBO_EVERY = 5;

export interface SoundSettings {
  enabled: boolean;
  /** 0…1, scaled down again below so even 1 stays modest */
  volume: number;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.6 };

const clampVolume = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SOUND_SETTINGS.volume;

export function getSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SOUND_SETTINGS.enabled,
      volume: clampVolume(parsed.volume),
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function saveSoundSettings(patch: Partial<SoundSettings>): SoundSettings {
  const next = { ...getSoundSettings(), ...patch };
  next.volume = clampVolume(next.volume);
  try {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(next));
    persistKeyNow(SOUND_SETTINGS_KEY);
  } catch {}
  return next;
}

/**
 * The run of right answers after one more answer, and whether it just reached a combo. A wrong answer
 * resets the run.
 */
export function nextCombo(streak: number, correct: boolean): { streak: number; combo: boolean } {
  if (!correct) return { streak: 0, combo: false };
  const next = streak + 1;
  return { streak: next, combo: next % COMBO_EVERY === 0 };
}

/**
 * The sound for one graded answer, given the run of right answers before it. `missedBefore`: a wrong try on
 * this card already played the soft tone, so its grade (Again, even when the last pick was right) adds none.
 */
export function answerSoundFor(
  streak: number,
  correct: boolean,
  missedBefore = false
): { streak: number; sound: SoundKind | null } {
  if (missedBefore) return { streak: 0, sound: null };
  const { streak: next, combo } = nextCombo(streak, correct);
  return { streak: next, sound: combo ? "combo" : correct ? "correct" : "wrong" };
}

// ---- Web Audio ----

interface Note {
  /** Hz; `to` glides to that pitch */
  freq: number;
  to?: number;
  /** seconds from the sound's start */
  at: number;
  dur: number;
  type?: OscillatorType;
  /** relative loudness, 1 = the loudest note */
  gain?: number;
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.51, G4 = 392;

const SOUNDS: Record<SoundKind, Note[]> = {
  // Two quick bright notes going up ("ting-ting")
  correct: [
    { freq: A5, at: 0, dur: 0.12, type: "triangle" },
    { freq: E6, at: 0.075, dur: 0.2, type: "triangle", gain: 0.9 },
  ],
  // One soft low note sliding down a little: says "not this time", not "error"
  wrong: [{ freq: 330, to: 262, at: 0, dur: 0.22, type: "sine", gain: 0.7 }],
  // A fast rising arpeggio ending on a held high note
  combo: [
    { freq: C5, at: 0, dur: 0.1, type: "triangle", gain: 0.8 },
    { freq: E5, at: 0.06, dur: 0.1, type: "triangle", gain: 0.85 },
    { freq: G5, at: 0.12, dur: 0.1, type: "triangle", gain: 0.9 },
    { freq: C6, at: 0.18, dur: 0.32, type: "triangle" },
    { freq: E6, at: 0.18, dur: 0.32, type: "sine", gain: 0.35 },
  ],
  // A short fanfare: three pickup notes, then a held major chord
  complete: [
    { freq: G4, at: 0, dur: 0.12, type: "triangle", gain: 0.8 },
    { freq: C5, at: 0.11, dur: 0.12, type: "triangle", gain: 0.85 },
    { freq: E5, at: 0.22, dur: 0.12, type: "triangle", gain: 0.9 },
    { freq: C5, at: 0.34, dur: 0.6, type: "triangle", gain: 0.6 },
    { freq: E5, at: 0.34, dur: 0.6, type: "triangle", gain: 0.6 },
    { freq: G5, at: 0.34, dur: 0.6, type: "triangle", gain: 0.6 },
    { freq: C6, at: 0.34, dur: 0.6, type: "sine", gain: 0.5 },
  ],
  // Quick clock tick for low countdown time
  tick: [{ freq: 1100, at: 0, dur: 0.025, type: "sine", gain: 0.35 }],
  // Fast triumphant fanfare when completing a reflex tier
  tierUp: [
    { freq: C5, at: 0, dur: 0.08, type: "triangle", gain: 0.8 },
    { freq: E5, at: 0.07, dur: 0.08, type: "triangle", gain: 0.85 },
    { freq: G5, at: 0.14, dur: 0.08, type: "triangle", gain: 0.9 },
    { freq: C6, at: 0.21, dur: 0.28, type: "triangle", gain: 1 },
  ],
  // Descending buzz when timer runs out
  timeOut: [{ freq: 280, to: 160, at: 0, dur: 0.35, type: "sawtooth", gain: 0.45 }],
};

/** Loudest note at volume 1: keeps the tones well under speech and music */
const MAX_GAIN = 0.18;
/** The context is suspended this long after the last sound ends: kept warm while answers keep coming (a resume
 *  can lag), released when the learner stops */
const IDLE_SUSPEND_MS = 30_000;

let ctx: AudioContext | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
/** context time when the last scheduled sound ends */
let lastEnd = 0;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

function windowHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  } catch {
    return false;
  }
}

function schedule(audio: AudioContext, kind: SoundKind, volume: number): void {
  const notes = SOUNDS[kind];
  // The fanfare waits for the last answer's tone; answer tones start at once
  const start = kind === "complete" ? Math.max(audio.currentTime, lastEnd + 0.05) : audio.currentTime;
  let end = start;
  for (const n of notes) {
    const t0 = start + n.at;
    const t1 = t0 + n.dur;
    const peak = MAX_GAIN * volume * (n.gain ?? 1);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(audio.destination);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };
    osc.start(t0);
    osc.stop(t1 + 0.02);
    end = Math.max(end, t1);
  }
  lastEnd = end;
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(
    () => {
      suspendTimer = null;
      audio.suspend().catch(() => {});
    },
    (end - audio.currentTime) * 1000 + IDLE_SUSPEND_MS
  );
}

/**
 * Play one sound. Call it from the answer's own event handler where possible: a context created or resumed
 * inside a user gesture is always allowed to play.
 */
export function playSound(kind: SoundKind): void {
  const { enabled, volume } = getSoundSettings();
  if (!enabled || volume <= 0 || windowHidden()) return;
  const audio = audioContext();
  if (!audio) return;
  try {
    if (audio.state === "running") {
      schedule(audio, kind, volume);
    } else {
      audio
        .resume()
        .then(() => schedule(audio, kind, volume))
        .catch(() => {});
    }
  } catch {}
}

// ---- This window's session: one review session at a time per window (main window, popup) ----

let streak = 0;
let missedThisCard = false;

/** A new session: the run of right answers starts again */
export function resetSoundSession(): void {
  streak = 0;
  missedThisCard = false;
}

/** A wrong try the learner may retry (multiple choice, tiles, typing): the soft tone now, the run restarts */
export function playWrongTry(): void {
  streak = 0;
  missedThisCard = true;
  playSound("wrong");
}

/** The tone for one graded answer: right, wrong, or a combo at every COMBO_EVERY right answers in a row */
export function playAnswerSound(correct: boolean): void {
  const next = answerSoundFor(streak, correct, missedThisCard);
  streak = next.streak;
  missedThisCard = false;
  if (next.sound) playSound(next.sound);
}
