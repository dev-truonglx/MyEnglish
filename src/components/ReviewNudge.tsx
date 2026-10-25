import { useCallback, useEffect, useRef, useState } from "react";
import { logLearningEvent } from "@/services/learningEvents";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Clock,
  Play,
  Zap,
  Flame,
  Check,
  X,
  Sparkles,
  Crosshair,
  CalendarClock,
  Hourglass,
  Target,
  Sun,
  Coffee,
  ChevronRight,
} from "lucide-react";
import { getFocusSettings } from "@/services/focusSettings";
import {
  buildNudgePayload,
  getReminderSettings,
  hideReviewNudge,
  NUDGE_AUTO_OPEN_SECONDS,
  remindAt,
  reminderTimeOptions,
  resetIgnoredNudges,
  snoozeIgnoredNudge,
  snoozeReminder,
  startFocusFromReminder,
  triggerReviewPopup,
  type ReminderTimeOption,
  type ReviewNudgePayload,
} from "@/services/reminderSettings";
import {
  evaluateMicroQuizAnswer,
  resolveNudgeMascot,
  type MicroQuizEvaluationResult,
  type MicroQuizQuestion,
} from "@/services/duoMotivation";
import { playSound } from "@/services/sound";

interface ReviewNudgeProps {
  /** Browser preview only: called after an action instead of hiding a native window */
  onDone?: () => void;
  /** Optional initial payload for SSR / tests / preview */
  initialPayload?: ReviewNudgePayload;
}

// Each tick asks Rust whether the cursor is over the card: twice a second is enough to pause the countdown
const TICK_MS = 500;
const QUIZ_COUNTDOWN_SECONDS = 30;
/** Time to pick a reminder time: the countdown starts over when the choices open */
const LATER_COUNTDOWN_SECONDS = 30;
/** After a wrong quick answer the card stays up to show the right one, then closes by itself (N13) */
const WRONG_ANSWER_CLOSE_MS = 60 * 1000;
/** Time to click "Câu tiếp" after a right answer when another question is ready in the chain */
export const CHAIN_NEXT_CLOSE_MS = 4500;
/** Last seconds of the countdown where the card pulses gently to catch peripheral vision */
export const ATTENTION_PULSE_SECONDS = 5;

export default function ReviewNudge({ onDone, initialPayload }: ReviewNudgeProps) {
  const [payload, setPayload] = useState<ReviewNudgePayload>(() => initialPayload ?? buildNudgePayload(0));
  const [mode, setMode] = useState<"nudge" | "quiz" | "later">(() =>
    initialPayload?.microQuiz && initialPayload?.motivation?.isMicroQuizPreferred ? "quiz" : "nudge"
  );
  const [timeOptions, setTimeOptions] = useState<ReminderTimeOption[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    initialPayload ? initialPayload.autoOpenSeconds : null
  );
  // Length of the countdown that is running (the nudge and the quiz wait different times)
  const [countdownTotal, setCountdownTotal] = useState(NUDGE_AUTO_OPEN_SECONDS);
  const [animationKey, setAnimationKey] = useState(0);

  // Micro-Quiz & Chain state (Mục 1 & 2)
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<MicroQuizEvaluationResult | null>(null);
  const [chainAnswered, setChainAnswered] = useState(0);
  const [chainCorrect, setChainCorrect] = useState(0);
  const [chainXp, setChainXp] = useState(0);
  const quizStartTimeRef = useRef(0);

  // Browser-preview fallback only: > 0 while the pointer is over the card
  const hoverAtRef = useRef(0);
  const deadlineRef = useRef(0);
  const lastTickRef = useRef(0);
  const actedRef = useRef(false);
  // The pointer was over the card at some point: the learner saw it. A card that times out unseen is "missed", not "ignored"
  const seenRef = useRef(false);
  // Closes the card a moment after a quick answer: a newer reminder must not be closed by an older answer's timer
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearCloseTimer, [clearCloseTimer]);
  // Counts the reminders shown: an answer evaluated for an earlier one must not close the current one
  const beginSeqRef = useRef(0);
  const lastNudgeIdRef = useRef<number | null>(null);
  const [freshBar, setFreshBar] = useState(false);

  const quizQueue: MicroQuizQuestion[] =
    payload.microQuizQueue && payload.microQuizQueue.length > 0
      ? payload.microQuizQueue
      : payload.microQuiz
        ? [payload.microQuiz]
        : [];
  const activeQuiz: MicroQuizQuestion | null = quizQueue[quizIndex] ?? payload.microQuiz ?? null;
  const hasNextQuiz = quizIndex + 1 < quizQueue.length;

  const begin = useCallback((next: ReviewNudgePayload & { nudgeId?: number }) => {
    if (next.nudgeId !== undefined) {
      if (next.nudgeId === lastNudgeIdRef.current) return;
      lastNudgeIdRef.current = next.nudgeId;
    }
    clearCloseTimer();
    beginSeqRef.current++;
    actedRef.current = false;
    seenRef.current = false;
    hoverAtRef.current = 0;
    deadlineRef.current = Date.now() + next.autoOpenSeconds * 1000;
    lastTickRef.current = Date.now();
    setPayload(next);
    setSecondsLeft(next.autoOpenSeconds);
    setCountdownTotal(next.autoOpenSeconds);
    logLearningEvent("nudge_shown", { meta: { dueCount: next.dueCount, quiz: !!next.microQuiz, moment: next.moment ?? null } });
    setFreshBar(true);
    setAnimationKey((k) => k + 1);

    // Subtle attention chime when the card appears (if enabled)
    if (next.nudgeSound !== false && getReminderSettings().nudgeSound !== false) {
      playSound("nudge");
    }

    // Reset quiz & chain state
    setQuizIndex(0);
    setSelectedOptionId(null);
    setQuizResult(null);
    setChainAnswered(0);
    setChainCorrect(0);
    setChainXp(0);

    // If algorithm prefers micro-quiz and question exists, switch directly to quiz
    if (next.microQuiz && next.motivation?.isMicroQuizPreferred) {
      setMode("quiz");
      const duration = Math.max(next.autoOpenSeconds, QUIZ_COUNTDOWN_SECONDS);
      deadlineRef.current = Date.now() + duration * 1000;
      setSecondsLeft(duration);
      setCountdownTotal(duration);
      // Opened by itself: the answer time starts when the learner reaches the card (first hover), not when
      // it appeared while they were busy elsewhere, or a correct answer would be graded slow (Hard)
      quizStartTimeRef.current = 0;
    } else {
      setMode("nudge");
    }
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!freshBar) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setFreshBar(false)));
    return () => cancelAnimationFrame(id);
  }, [freshBar]);

  const finish = useCallback(
    async (action: "start" | "focus" | "snooze" | "timeout" | "quiz-done" | "later", at?: number) => {
      if (actedRef.current) return;
      actedRef.current = true;
      hoverAtRef.current = 0;
      setSecondsLeft(null);
      clearCloseTimer();

      logLearningEvent(
        action === "timeout"
          ? "nudge_ignored"
          : action === "snooze" || action === "later"
            ? "nudge_snoozed"
            : action === "quiz-done"
              ? "nudge_quiz"
              : "nudge_opened",
        action === "focus"
          ? { meta: { focus: true } }
          : action === "timeout"
            ? { meta: { seen: seenRef.current } }
            : action === "later"
              ? { meta: { until: at ?? null } }
              : action === "quiz-done"
                ? { meta: { answered: Math.max(1, chainAnswered), correct: chainCorrect } }
                : {}
      );
      if (action === "timeout") {
        snoozeIgnoredNudge(seenRef.current);
        await hideReviewNudge();
      } else if (action === "snooze") {
        resetIgnoredNudges();
        snoozeReminder();
        await hideReviewNudge();
      } else if (action === "later" && at) {
        resetIgnoredNudges();
        remindAt(at);
        await hideReviewNudge();
      } else if (action === "quiz-done") {
        resetIgnoredNudges();
        await hideReviewNudge();
      } else if (action === "focus") {
        // A focus session in the main window (not the popup): the whole window, the clock, no reminders
        resetIgnoredNudges();
        await hideReviewNudge();
        await startFocusFromReminder(getFocusSettings().minutes);
      } else {
        resetIgnoredNudges();
        await triggerReviewPopup();
      }
      onDone?.();
    },
    [onDone, clearCloseTimer, chainAnswered, chainCorrect]
  );

  // Switch to quiz mode manually (from the "1 câu" button or the Word Teaser hook)
  const switchToQuiz = () => {
    if (actedRef.current) return;
    seenRef.current = true;
    if (activeQuiz) {
      setMode("quiz");
      quizStartTimeRef.current = Date.now();
      // Give more time for answering
      setSecondsLeft(QUIZ_COUNTDOWN_SECONDS);
      setCountdownTotal(QUIZ_COUNTDOWN_SECONDS);
      deadlineRef.current = Date.now() + QUIZ_COUNTDOWN_SECONDS * 1000;
    }
  };

  // Advance to the next question in the micro-quiz chain (Mục 2: Keep momentum going)
  const handleNextQuizQuestion = useCallback(() => {
    if (actedRef.current || !hasNextQuiz) return;
    clearCloseTimer();
    seenRef.current = true;
    setQuizIndex((idx) => idx + 1);
    setSelectedOptionId(null);
    setQuizResult(null);
    quizStartTimeRef.current = Date.now();
    setFreshBar(true);
    setSecondsLeft(QUIZ_COUNTDOWN_SECONDS);
    setCountdownTotal(QUIZ_COUNTDOWN_SECONDS);
    deadlineRef.current = Date.now() + QUIZ_COUNTDOWN_SECONDS * 1000;
  }, [hasNextQuiz, clearCloseTimer]);

  // "Nhắc lúc…": the choices of a time replace the buttons, and the countdown starts over
  const openLater = () => {
    if (actedRef.current) return;
    seenRef.current = true;
    setTimeOptions(reminderTimeOptions(new Date(), getReminderSettings().anchors ?? []));
    setMode("later");
    deadlineRef.current = Date.now() + LATER_COUNTDOWN_SECONDS * 1000;
    setSecondsLeft(LATER_COUNTDOWN_SECONDS);
    setCountdownTotal(LATER_COUNTDOWN_SECONDS);
  };

  // Handle answering Micro-Quiz
  const handleAnswerQuiz = async (optionId: string) => {
    if (!activeQuiz || selectedOptionId !== null) return;
    setSelectedOptionId(optionId);
    // Answered (right or wrong): the countdown stops now, so a fast answer is never counted as ignored (N14)
    setSecondsLeft(null);
    const responseTime = Date.now() - (quizStartTimeRef.current || Date.now());
    const shownSeq = beginSeqRef.current;
    const isOptCorrect = !!activeQuiz.options.find((o) => o.id === optionId)?.isCorrect;
    const nextCorrectCount = isOptCorrect ? chainCorrect + 1 : chainCorrect;
    // Play combo tone when chaining 3 right answers in a row on the nudge card
    playSound(isOptCorrect ? (nextCorrectCount >= 3 ? "combo" : "correct") : "wrong");

    try {
      const res = await evaluateMicroQuizAnswer({
        wordId: activeQuiz.wordId,
        selectedChoiceId: optionId,
        options: activeQuiz.options,
        targetMeaning: activeQuiz.targetMeaning,
        responseTimeMs: responseTime,
        direction: activeQuiz.direction,
        scheduledQuestion: activeQuiz.scheduled,
      });
      if (shownSeq !== beginSeqRef.current) return; // another reminder replaced this one meanwhile
      setQuizResult(res);
      setChainAnswered((n) => n + 1);
      if (res.isCorrect) {
        setChainCorrect((n) => n + 1);
        setChainXp((xp) => xp + (res.xpEarned ?? 0));
      }

      // A right answer dismisses itself after a brief celebration (longer when another question is ready
      // in the chain so the learner can click "Câu tiếp" to ride their momentum); a wrong one stays on screen
      if (res.isCorrect) {
        clearCloseTimer();
        const closeDelay = quizIndex + 1 < quizQueue.length ? CHAIN_NEXT_CLOSE_MS : 2000;
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          finish("quiz-done");
        }, closeDelay);
      }
    } catch (err) {
      console.warn("Error evaluating micro quiz answer:", err);
      if (shownSeq !== beginSeqRef.current) return;
      clearCloseTimer();
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        finish("quiz-done");
      }, 1500);
    }
  };

  // A wrong answer left on screen closes after a while: counted as closed, not as an ignored card (N13)
  useEffect(() => {
    if (!quizResult || quizResult.isCorrect) return;
    const timer = setTimeout(() => finish("quiz-done"), WRONG_ANSWER_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [quizResult, finish]);

  // Keys (1, 2, 3 for the quiz; Enter to start or advance chain; Esc to snooze) in browser preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === "quiz" && quizResult) {
        if (e.key === "Enter") {
          if (hasNextQuiz) handleNextQuizQuestion();
          else finish("quiz-done");
        } else if (e.key === "Escape") {
          finish("quiz-done");
        }
      } else if (mode === "quiz" && activeQuiz && selectedOptionId === null) {
        if (e.key === "1" && activeQuiz.options[0]) {
          handleAnswerQuiz(activeQuiz.options[0].id);
        } else if (e.key === "2" && activeQuiz.options[1]) {
          handleAnswerQuiz(activeQuiz.options[1].id);
        } else if (e.key === "3" && activeQuiz.options[2]) {
          handleAnswerQuiz(activeQuiz.options[2].id);
        }
      } else if (mode === "later") {
        if (e.key === "Escape") setMode("nudge");
      } else if (mode === "nudge") {
        if (e.key === "Enter") {
          finish("start");
        } else if (e.key.toLowerCase() === "f") {
          finish("focus");
        } else if (e.key === "Escape") {
          finish("snooze");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, activeQuiz, selectedOptionId, quizResult, hasNextQuiz, handleNextQuizQuestion, finish]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<ReviewNudgePayload>("review-nudge-opened", (event) => {
      if (!cancelled && event.payload) begin(event.payload);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    if ("__TAURI_INTERNALS__" in window) {
      invoke<(ReviewNudgePayload & { nudgeId?: number }) | null>("take_review_nudge_payload")
        .then((pending) => {
          if (!cancelled && pending) begin(pending);
        })
        .catch(() => {});
    }

    if (!("__TAURI_INTERNALS__" in window)) begin(buildNudgePayload(5));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [begin]);

  const running = secondsLeft !== null;
  useEffect(() => {
    if (!running) return;
    const native = "__TAURI_INTERNALS__" in window;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        let hovered: boolean;
        if (native) {
          hovered = await invoke<boolean>("is_cursor_over_nudge").catch(() => hoverAtRef.current > 0);
        } else {
          hovered = hoverAtRef.current > 0;
        }
        if (actedRef.current) return;
        const now = Date.now();
        const elapsed = now - lastTickRef.current;
        lastTickRef.current = now;
        if (hovered) {
          seenRef.current = true;
          deadlineRef.current += elapsed;
          return;
        }
        const left = Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
        setSecondsLeft((s) => (s === null || s === left ? s : left));
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (secondsLeft === 0) {
      // If the user already answered at least one question in the chain before timing out on a later one,
      // treat it as quiz-done rather than ignored!
      if (chainAnswered > 0) finish("quiz-done");
      else finish("timeout");
    }
  }, [secondsLeft, chainAnswered, finish]);

  const progress = secondsLeft === null ? 0 : secondsLeft / countdownTotal;
  const isAttentionPulse = secondsLeft !== null && secondsLeft > 0 && secondsLeft <= ATTENTION_PULSE_SECONDS;

  // Live Goal Gradient & Loss Aversion metrics (Mục 5)
  const liveTodayCount = (payload.todayCount ?? 0) + chainAnswered;
  const dailyGoal = payload.dailyGoal ?? 0;
  const goalRemaining = dailyGoal > 0 ? Math.max(0, dailyGoal - liveTodayCount) : 0;
  const fadingCount = Math.max(0, (payload.fadingCount ?? 0) - chainCorrect);

  // Contextual mascot styling (Mục 4)
  const mascot = resolveNudgeMascot({
    mood: payload.motivation?.mascotMood || "happy",
    moment: payload.moment,
    fadingCount,
    todayCount: liveTodayCount,
    dailyGoal,
  });

  const renderMascot = () => {
    const baseClass = `shrink-0 w-8 h-8 rounded-xl bg-gradient-to-tr ${mascot.gradient} text-white flex items-center justify-center shadow-sm`;
    switch (mascot.icon) {
      case "flame":
        return (
          <span className={baseClass} title={mascot.label}>
            <Flame className="w-4 h-4 fill-white" />
          </span>
        );
      case "target":
        return (
          <span className={baseClass} title={mascot.label}>
            <Target className="w-4 h-4" />
          </span>
        );
      case "hourglass":
        return (
          <span className={baseClass} title={mascot.label}>
            <Hourglass className="w-4 h-4" />
          </span>
        );
      case "sun":
        return (
          <span className={baseClass} title={mascot.label}>
            <Sun className="w-4 h-4" />
          </span>
        );
      case "coffee":
        return (
          <span className={baseClass} title={mascot.label}>
            <Coffee className="w-4 h-4" />
          </span>
        );
      case "sparkles":
        return (
          <span className={baseClass} title={mascot.label}>
            <Sparkles className="w-4 h-4" />
          </span>
        );
      default:
        return (
          <span className={`${baseClass} text-base`} title={mascot.label}>
            🦉
          </span>
        );
    }
  };

  // Top-right contextual status chip (Mục 5: Goal Gradient & Loss Aversion)
  const renderStatusBadge = () => {
    if (isAttentionPulse) {
      return (
        <span
          data-testid="nudge-attention-countdown"
          className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/60 text-[10px] font-bold tabular-nums animate-pulse"
        >
          ⏳ {secondsLeft}s
        </span>
      );
    }
    if (dailyGoal > 0 && liveTodayCount > 0 && goalRemaining === 0) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
          🎉 Đạt mục tiêu!
        </span>
      );
    }
    if (dailyGoal > 0 && liveTodayCount > 0 && goalRemaining <= 3) {
      return (
        <span
          data-testid="nudge-goal-gradient"
          className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-800/60 text-[10px] font-bold"
        >
          🎯 Còn {goalRemaining} câu
        </span>
      );
    }
    if (fadingCount > 0) {
      return (
        <span
          data-testid="nudge-fading-badge"
          className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100/90 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-semibold"
        >
          ⏳ {fadingCount} từ sắp quên
        </span>
      );
    }
    if (dailyGoal > 0 && liveTodayCount > 0) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-semibold tabular-nums">
          {liveTodayCount}/{dailyGoal} hôm nay
        </span>
      );
    }
    if ((payload.streak ?? 0) > 0) {
      return (
        <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-100/80 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 text-[10px] font-bold">
          🔥 {payload.streak} ngày
        </span>
      );
    }
    return null;
  };

  const title = payload.motivation?.title || "Đến giờ ôn tập";
  const message =
    payload.motivation?.message ||
    (payload.dueCount > 0
      ? `${payload.dueCount} từ đến hạn · ${payload.sessionSize} câu · ~${payload.estimatedMinutes} phút`
      : `Ôn nhanh ${payload.sessionSize} câu · ~${payload.estimatedMinutes} phút`);

  const remainingDueAfterChain = Math.max(0, payload.dueCount - chainAnswered);

  return (
    <div className="w-screen h-screen flex items-start justify-end p-1.5 bg-transparent select-none font-sans">
      <div
        key={animationKey}
        className={`nudge-enter w-full rounded-2xl border bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden flex flex-col justify-between transition-colors ${
          isAttentionPulse
            ? "border-amber-400 dark:border-amber-500/90 ring-2 ring-amber-400/50 dark:ring-amber-500/40"
            : "border-slate-200 dark:border-zinc-700"
        }`}
        onMouseEnter={() => {
          hoverAtRef.current = Date.now();
          if (quizStartTimeRef.current === 0) quizStartTimeRef.current = Date.now();
        }}
        onMouseLeave={() => (hoverAtRef.current = 0)}
      >
        {mode === "nudge" ? (
          /* ─── MODE 1: DUO MOTIVATION PROMPT + WORD TEASER HOOK ─── */
          <div className="p-3.5 flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              {renderMascot()}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                    {title}
                  </span>
                  {renderStatusBadge()}
                </div>
                <div className="text-[11.5px] text-slate-600 dark:text-zinc-300 line-clamp-2 mt-0.5 leading-snug">
                  {message}
                </div>
              </div>
            </div>

            {/* Mục 1: Word Teaser (Curiosity Gap Hook) right on the nudge card */}
            {activeQuiz ? (
              <button
                type="button"
                data-testid="nudge-word-teaser"
                onClick={switchToQuiz}
                title="Bấm để trả lời nhanh từ này ngay tại đây"
                className="group w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100/90 dark:hover:bg-indigo-900/50 border border-indigo-200/80 dark:border-indigo-800/60 text-left transition-all active:scale-[0.99]"
              >
                <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px] font-extrabold text-indigo-950 dark:text-indigo-200 truncate">
                    {activeQuiz.promptTitle || activeQuiz.word}
                  </span>
                  {activeQuiz.phonetic && (
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                      {activeQuiz.phonetic}
                    </span>
                  )}
                  {activeQuiz.isFading ? (
                    <span className="px-1.5 py-0.2 rounded bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[9.5px] font-bold">
                      Đang phai{activeQuiz.stabilityDays && activeQuiz.stabilityDays >= 2 ? ` · ${activeQuiz.stabilityDays}d` : ""}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                  Nhớ nghĩa?
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </button>
            ) : null}

            {/* One main action; the quick question next to it when there is one; the rest as small links */}
            <div className="flex items-center gap-2 pt-0.5" role="group" aria-label="Nhắc ôn tập">
              <button
                onClick={() => finish("start")}
                aria-label="Học ngay"
                title="Học ngay (Enter)"
                className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white text-[12px] font-bold shadow-sm whitespace-nowrap transition-all active:scale-[0.98]"
              >
                <Play className="w-3.5 h-3.5 fill-white shrink-0" />
                Học ngay
              </button>
              {activeQuiz ? (
                <button
                  onClick={switchToQuiz}
                  aria-label="Trả lời 1 câu nhanh"
                  title="Trả lời ngay tại đây, không mở app"
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 text-[12px] font-semibold whitespace-nowrap transition-all active:scale-[0.98]"
                >
                  <Zap className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500 shrink-0" />
                  1 câu
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 -mt-0.5 text-[11px] whitespace-nowrap">
              <button
                onClick={() => finish("focus")}
                aria-label={`Phiên tập trung ${getFocusSettings().minutes} phút`}
                title="Mở app và học trọn vài phút, tắt nhắc nhở (phím F)"
                className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 hover:underline font-medium"
              >
                <Crosshair className="w-3 h-3" />
                Tập trung {getFocusSettings().minutes} phút
              </button>
              <button
                onClick={openLater}
                aria-label="Chọn giờ nhắc lại"
                title="Chọn giờ nhắc lại"
                className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:underline font-medium"
              >
                <CalendarClock className="w-3 h-3" />
                Nhắc lúc…
              </button>
              <button
                onClick={() => finish("snooze")}
                aria-label={`Hoãn nhắc ôn tập ${payload.snoozeMinutes} phút`}
                title="Hoãn (Esc)"
                className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:underline font-medium"
              >
                <Clock className="w-3 h-3" />
                Hoãn {payload.snoozeMinutes} phút
              </button>
            </div>
          </div>
        ) : mode === "later" ? (
          /* ─── MODE 3: PICK A TIME TO BE REMINDED ─── */
          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-slate-900 dark:text-white">Nhắc lại lúc nào?</span>
              {secondsLeft !== null && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums font-mono">{secondsLeft}s</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {timeOptions.map((o) => (
                <button
                  key={o.at}
                  onClick={() => finish("later", o.at)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 text-slate-800 dark:text-zinc-200 text-[12px] font-semibold whitespace-nowrap transition-all active:scale-[0.98]"
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setMode("nudge")}
              className="self-start px-1 py-0.5 rounded text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:underline font-medium"
            >
              Quay lại
            </button>
          </div>
        ) : (
          /* ─── MODE 2: INSTANT MICRO-QUIZ & MOMENTUM CHAIN ─── */
          <div className="p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-indigo-500 text-indigo-500" />
                  {quizQueue.length > 1 ? `Câu ${quizIndex + 1}/${quizQueue.length}` : "1 câu nhanh"}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {activeQuiz?.direction === "production" ? "Nhớ từ tiếng Anh" : "Chọn nghĩa đúng"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {renderStatusBadge()}
                {secondsLeft !== null && !isAttentionPulse && (
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums font-mono">
                    {secondsLeft}s
                  </span>
                )}
              </div>
            </div>

            {/* Target Word Display */}
            {activeQuiz ? (
              <div className="flex flex-col gap-0.5">
                {activeQuiz.direction === "production" ? (
                  <div>
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 block uppercase tracking-wider">
                      Nghĩa tiếng Việt:
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white leading-snug block line-clamp-2">
                      {activeQuiz.promptTitle || activeQuiz.targetMeaning}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {activeQuiz.promptTitle || activeQuiz.word}
                    </span>
                    {activeQuiz.phonetic && (
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                        {activeQuiz.phonetic}
                      </span>
                    )}
                    {activeQuiz.partOfSpeech && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-medium">
                        {activeQuiz.partOfSpeech}
                      </span>
                    )}
                    {activeQuiz.isFading && (
                      <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold">
                        ⏳ Đang phai{activeQuiz.stabilityDays && activeQuiz.stabilityDays >= 2 ? ` · đã nhớ ${activeQuiz.stabilityDays} ngày` : ""}
                      </span>
                    )}
                  </div>
                )}
                {activeQuiz.contextSentence && (
                  <p
                    data-testid="nudge-quiz-context"
                    className="text-[11px] italic text-slate-500 dark:text-zinc-400 line-clamp-1 leading-snug"
                  >
                    “{activeQuiz.contextSentence}”
                  </p>
                )}
              </div>
            ) : null}

            {/* 3 MCQ Options */}
            <div className="flex flex-col gap-1.5">
              {activeQuiz?.options.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                const isAnswered = selectedOptionId !== null;
                const isCorrect = opt.isCorrect;

                let btnStyle =
                  "border-slate-200 dark:border-zinc-700/80 bg-slate-50/80 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200";

                if (isAnswered) {
                  if (isCorrect) {
                    btnStyle =
                      "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold";
                  } else if (isSelected && !isCorrect) {
                    btnStyle =
                      "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300 line-through opacity-90";
                  } else {
                    btnStyle = "border-transparent opacity-40 text-slate-400 dark:text-zinc-600";
                  }
                }

                return (
                  <button
                    key={opt.id}
                    disabled={isAnswered}
                    onClick={() => handleAnswerQuiz(opt.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11.5px] transition-all text-left ${btnStyle} active:scale-98`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{opt.text}</span>
                    </div>
                    {isAnswered && isCorrect && (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    {isAnswered && isSelected && !isCorrect && (
                      <X className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quiz Result banner + Chain Momentum CTAs (Mục 2) */}
            {quizResult && (
              <div
                className={`mt-0.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-between gap-2 animate-fade-in ${
                  quizResult.isCorrect
                    ? "bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300"
                    : "bg-amber-100/90 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200"
                }`}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {quizResult.isCorrect
                      ? quizResult.praise ??
                        (chainCorrect >= 2
                          ? `Chuỗi ${chainCorrect} câu đúng! +${chainXp} XP`
                          : `Chính xác! +${quizResult.xpEarned ?? 0} XP`)
                      : `Đáp án: ${activeQuiz?.direction === "production" ? activeQuiz.word : quizResult.correctMeaning}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasNextQuiz ? (
                    <button
                      type="button"
                      data-testid="nudge-next-quiz"
                      onClick={handleNextQuizQuestion}
                      className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10.5px] font-bold shadow-sm inline-flex items-center gap-0.5 transition-all active:scale-95"
                    >
                      Câu tiếp ({quizIndex + 2}/{quizQueue.length})
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  ) : remainingDueAfterChain > 0 && quizResult.isCorrect ? (
                    <button
                      type="button"
                      data-testid="nudge-continue-popup"
                      onClick={() => finish("start")}
                      className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold shadow-sm inline-flex items-center gap-0.5 transition-all active:scale-95"
                    >
                      Ôn tiếp ({remainingDueAfterChain})
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  ) : null}
                  {!quizResult.isCorrect && (
                    <button
                      type="button"
                      onClick={() => finish("quiz-done")}
                      className="px-2 py-0.5 rounded bg-white/70 dark:bg-zinc-800/80 text-[10px] font-semibold hover:bg-white dark:hover:bg-zinc-700"
                    >
                      Đóng
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Countdown bar */}
        <div className="h-1 bg-slate-100 dark:bg-zinc-800 w-full overflow-hidden">
          <div
            className={`h-full ${
              isAttentionPulse
                ? "bg-amber-500"
                : mode === "quiz"
                  ? "bg-indigo-500"
                  : "bg-emerald-500"
            } ${freshBar ? "" : "transition-[width] duration-1000 ease-linear"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
