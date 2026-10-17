import { useEffect, useRef, useState } from "react";
import { setFocusUntil } from "@/services/activeSession";
import {
  clockActiveMs,
  clockRemainingMs,
  endFocus,
  FOCUS_DONE_SHARE,
  FOCUS_IDLE_MS,
  focusUntil,
  logFocusStarted,
  pauseClock,
  resumeClock,
  startClock,
  type FocusClock,
  type FocusPlan,
  type FocusResult,
} from "@/services/focusSession";

/**
 * Why the clock is stopped: the window is in the background, nothing was touched for a while, or the
 * "leave the session?" question is open (only the learner's answer starts it again)
 */
export type FocusPause = "away" | "idle" | "dialog" | null;

/** Sessions whose start was logged (StrictMode runs mount effects twice in development) */
const startedIds = new Set<string>();

export interface FocusSessionState {
  remainingMs: number;
  activeMs: number;
  plannedMs: number;
  paused: FocusPause;
  /** The clock ran out: the review ends after the card on screen */
  timeUp: boolean;
  /** Enough of the planned time is done for "Xong" to count as completed */
  canFinish: boolean;
  result: FocusResult | null;
  /** The review reached its end (summary): logs the outcome and awards the XP, once */
  complete: (s: { cards: number; firstTry: number }) => void;
  /** "Xong": the next `complete` counts as ended by the learner */
  markDone: () => void;
  /** Leaving before the end: logs it (abandoned below FOCUS_DONE_SHARE of the time) */
  abandon: (s: { cards: number; firstTry: number }) => FocusResult | null;
  /** The leave question opened (clock stops) or was answered "Học tiếp" (clock runs again) */
  hold: (on: boolean) => void;
}

/**
 * Clock of a focus session. Runs while the window has focus and the learner is active; reminders stay off while
 * it runs (see activeSession.setFocusUntil). `plan` null: no focus session, everything is inert.
 */
export function useFocusSession(plan: FocusPlan | null): FocusSessionState {
  const [clock, setClock] = useState<FocusClock | null>(() => (plan ? startClock(plan.plannedMin, Date.now()) : null));
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const [now, setNow] = useState(() => Date.now());
  const [paused, setPaused] = useState<FocusPause>(null);
  const pausedRef = useRef<FocusPause>(null);
  pausedRef.current = paused;
  const [result, setResult] = useState<FocusResult | null>(null);
  const endedRef = useRef(false);
  const doneRef = useRef(false);
  const lastInputRef = useRef(Date.now());

  useEffect(() => {
    if (!plan) return;
    if (!startedIds.has(plan.id)) {
      startedIds.add(plan.id);
      logFocusStarted(plan);
    }
    // Ended or left in any way (quitting, another session): reminders come back
    return () => setFocusUntil(null);
  }, [plan?.id]);

  const pause = (reason: Exclude<FocusPause, null>, at: number) => {
    if (endedRef.current || pausedRef.current) return;
    pausedRef.current = reason;
    setPaused(reason);
    setClock((c) => (c ? pauseClock(c, at) : c));
  };
  const resume = () => {
    if (endedRef.current || !pausedRef.current) return;
    pausedRef.current = null;
    setPaused(null);
    lastInputRef.current = Date.now();
    setClock((c) => (c ? resumeClock(c, Date.now()) : c));
  };

  // Another app in front, the window hidden or minimised: the clock waits
  useEffect(() => {
    if (!plan) return;
    const onAway = () => pause("away", Date.now());
    const onBack = () => {
      // Back in the window with the leave question still open: the learner's answer decides
      if (document.hidden || !document.hasFocus() || pausedRef.current === "dialog") return;
      resume();
    };
    const onVisibility = () => (document.hidden ? onAway() : onBack());
    // Any input counts as studying; it also ends an idle pause
    const onInput = (e: Event) => {
      const now = Date.now();
      if (e.type === "pointermove" && pausedRef.current !== "idle" && now - lastInputRef.current < 1000) {
        return;
      }
      lastInputRef.current = now;
      if (pausedRef.current === "idle") resume();
    };
    window.addEventListener("blur", onAway);
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onVisibility);
    const inputs = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
    for (const t of inputs) window.addEventListener(t, onInput, { passive: true });
    if (document.hidden || !document.hasFocus()) onAway();
    return () => {
      window.removeEventListener("blur", onAway);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const t of inputs) window.removeEventListener(t, onInput);
    };
  }, [plan?.id]);

  // Tick: the display, the idle check, and the reminder block (moved forward while the clock runs)
  useEffect(() => {
    if (!plan) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const c = clockRef.current;
      if (!c || endedRef.current) return;
      if (c.runningSince !== null) {
        // Idle: the time since the last input is not study time
        if (t - lastInputRef.current > FOCUS_IDLE_MS) {
          pause("idle", Math.max(c.runningSince, lastInputRef.current));
          return;
        }
        setFocusUntil(focusUntil(c, t));
      } else if (pausedRef.current === "dialog") {
        // Deciding whether to leave: still in the session, so no reminder on top of the question
        setFocusUntil(focusUntil(c, t));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [plan?.id]);

  const remainingMs = clock ? clockRemainingMs(clock, now) : 0;
  const activeMs = clock ? Math.min(clock.plannedMs, clockActiveMs(clock, now)) : 0;
  const plannedMs = clock?.plannedMs ?? 0;
  const timeUp = !!clock && remainingMs <= 0;

  // Out of time: the clock stops at the planned length (the last card's time is not counted beyond it)
  useEffect(() => {
    if (timeUp) setClock((c) => (c ? { ...c, activeMs: Math.min(c.plannedMs, clockActiveMs(c, Date.now())), runningSince: null } : c));
  }, [timeUp]);

  const finish = (endedBy: "time" | "queue" | "user", s: { cards: number; firstTry: number }): FocusResult | null => {
    if (!plan || !clockRef.current || endedRef.current) return null;
    endedRef.current = true;
    const c = clockRef.current;
    const spent = Math.min(c.plannedMs, clockActiveMs(c, Date.now()));
    setClock(pauseClock(c, Date.now()));
    setFocusUntil(null);
    const r = endFocus(plan, { endedBy, activeMs: spent, cards: s.cards, firstTry: s.firstTry });
    setResult(r);
    return r;
  };

  return {
    remainingMs,
    activeMs,
    plannedMs,
    paused,
    timeUp,
    canFinish: !!clock && activeMs >= plannedMs * FOCUS_DONE_SHARE,
    result,
    complete: (s) => {
      const c = clockRef.current;
      const out = !!c && clockRemainingMs(c, Date.now()) <= 0;
      finish(out ? "time" : doneRef.current ? "user" : "queue", s);
    },
    markDone: () => {
      doneRef.current = true;
    },
    abandon: (s) => finish("user", s),
    hold: (on) => {
      if (endedRef.current) return;
      if (!on) {
        if (pausedRef.current === "dialog") resume();
        return;
      }
      if (pausedRef.current) {
        // Already stopped (idle, away): the question now owns the pause
        pausedRef.current = "dialog";
        setPaused("dialog");
      } else pause("dialog", Date.now());
    },
  };
}
