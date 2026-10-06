import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Clock, Play, Zap, Flame, Check, X, Sparkles } from "lucide-react";
import {
  buildNudgePayload,
  hideReviewNudge,
  resetIgnoredNudges,
  snoozeIgnoredNudge,
  snoozeReminder,
  triggerReviewPopup,
  type ReviewNudgePayload,
} from "@/services/reminderSettings";
import {
  evaluateMicroQuizAnswer,
  type MicroQuizEvaluationResult,
} from "@/services/duoMotivation";

interface ReviewNudgeProps {
  /** Browser preview only: called after an action instead of hiding a native window */
  onDone?: () => void;
}

const TICK_MS = 250;

export default function ReviewNudge({ onDone }: ReviewNudgeProps) {
  const [payload, setPayload] = useState<ReviewNudgePayload>(() => buildNudgePayload(0));
  const [mode, setMode] = useState<"nudge" | "quiz">("nudge");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  // Micro-Quiz state
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<MicroQuizEvaluationResult | null>(null);
  const quizStartTimeRef = useRef(0);

  // Browser-preview fallback only: > 0 while the pointer is over the card
  const hoverAtRef = useRef(0);
  const deadlineRef = useRef(0);
  const lastTickRef = useRef(0);
  const actedRef = useRef(false);
  const lastNudgeIdRef = useRef<number | null>(null);
  const [freshBar, setFreshBar] = useState(false);

  const begin = useCallback((next: ReviewNudgePayload & { nudgeId?: number }) => {
    if (next.nudgeId !== undefined) {
      if (next.nudgeId === lastNudgeIdRef.current) return;
      lastNudgeIdRef.current = next.nudgeId;
    }
    actedRef.current = false;
    hoverAtRef.current = 0;
    deadlineRef.current = Date.now() + next.autoOpenSeconds * 1000;
    lastTickRef.current = Date.now();
    setPayload(next);
    setSecondsLeft(next.autoOpenSeconds);
    setFreshBar(true);
    setAnimationKey((k) => k + 1);

    // Reset quiz state
    setSelectedOptionId(null);
    setQuizResult(null);

    // If algorithm prefers micro-quiz and question exists, switch directly to quiz
    if (next.microQuiz && next.motivation?.isMicroQuizPreferred) {
      setMode("quiz");
      quizStartTimeRef.current = Date.now();
    } else {
      setMode("nudge");
    }
  }, []);

  useEffect(() => {
    if (!freshBar) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setFreshBar(false)));
    return () => cancelAnimationFrame(id);
  }, [freshBar]);

  const finish = useCallback(
    async (action: "start" | "snooze" | "timeout" | "quiz-done") => {
      if (actedRef.current) return;
      actedRef.current = true;
      hoverAtRef.current = 0;
      setSecondsLeft(null);

      if (action === "timeout") {
        snoozeIgnoredNudge();
        await hideReviewNudge();
      } else if (action === "snooze") {
        resetIgnoredNudges();
        snoozeReminder();
        await hideReviewNudge();
      } else if (action === "quiz-done") {
        resetIgnoredNudges();
        await hideReviewNudge();
      } else {
        resetIgnoredNudges();
        await triggerReviewPopup();
      }
      onDone?.();
    },
    [onDone]
  );

  // Switch to quiz mode manually
  const switchToQuiz = () => {
    if (payload.microQuiz) {
      setMode("quiz");
      quizStartTimeRef.current = Date.now();
      // Give more time for answering
      setSecondsLeft(30);
      deadlineRef.current = Date.now() + 30 * 1000;
    }
  };

  // Handle answering Micro-Quiz
  const handleAnswerQuiz = async (optionId: string) => {
    if (!payload.microQuiz || selectedOptionId !== null) return;
    setSelectedOptionId(optionId);
    const responseTime = Date.now() - quizStartTimeRef.current;

    try {
      const res = await evaluateMicroQuizAnswer({
        wordId: payload.microQuiz.wordId,
        selectedChoiceId: optionId,
        options: payload.microQuiz.options,
        targetMeaning: payload.microQuiz.targetMeaning,
        responseTimeMs: responseTime,
      });
      setQuizResult(res);

      // Auto dismiss after brief celebratory delay
      setTimeout(() => {
        finish("quiz-done");
      }, 1800);
    } catch (err) {
      console.warn("Error evaluating micro quiz answer:", err);
      setTimeout(() => {
        finish("quiz-done");
      }, 1500);
    }
  };

  // Keyboard shortcut support (1, 2, 3 for quiz; Enter to start review; Esc to snooze)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === "quiz" && payload.microQuiz && selectedOptionId === null) {
        if (e.key === "1" && payload.microQuiz.options[0]) {
          handleAnswerQuiz(payload.microQuiz.options[0].id);
        } else if (e.key === "2" && payload.microQuiz.options[1]) {
          handleAnswerQuiz(payload.microQuiz.options[1].id);
        } else if (e.key === "3" && payload.microQuiz.options[2]) {
          handleAnswerQuiz(payload.microQuiz.options[2].id);
        }
      } else if (mode === "nudge") {
        if (e.key === "Enter") {
          finish("start");
        } else if (e.key === "Escape") {
          finish("snooze");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, payload.microQuiz, selectedOptionId, finish]);

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
    if (secondsLeft === 0) finish("timeout");
  }, [secondsLeft, finish]);

  const progress = secondsLeft === null ? 0 : secondsLeft / payload.autoOpenSeconds;

  // Mascot styling based on Duo emotion
  const mood = payload.motivation?.mascotMood || "happy";
  const renderMascot = () => {
    switch (mood) {
      case "alarm":
        return (
          <span className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-md animate-pulse">
            <Flame className="w-4 h-4 fill-white" />
          </span>
        );
      case "pleading":
        return (
          <span className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm text-base">
            🥺
          </span>
        );
      case "dramatic":
        return (
          <span className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-sm text-base">
            🥀
          </span>
        );
      default:
        return (
          <span className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-sm text-base">
            🦉
          </span>
        );
    }
  };

  const title = payload.motivation?.title || "Đến giờ ôn tập";
  const message =
    payload.motivation?.message ||
    (payload.dueCount > 0
      ? `${payload.dueCount} từ đến hạn · ${payload.sessionSize} câu · ~${payload.estimatedMinutes} phút`
      : `Ôn nhanh ${payload.sessionSize} câu · ~${payload.estimatedMinutes} phút`);

  return (
    <div className="w-screen h-screen flex items-start justify-end p-1.5 bg-transparent select-none font-sans">
      <div
        key={animationKey}
        className="nudge-enter w-full rounded-2xl border border-slate-200/90 dark:border-zinc-700/90 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col justify-between"
        onMouseEnter={() => (hoverAtRef.current = Date.now())}
        onMouseLeave={() => (hoverAtRef.current = 0)}
      >
        {mode === "nudge" ? (
          /* ─── MODE 1: DUO MOTIVATION PROMPT ─── */
          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              {renderMascot()}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                    {title}
                  </span>
                  {payload.consecutiveSkips && payload.consecutiveSkips > 1 ? (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 text-[10px] font-semibold">
                      Skip x{payload.consecutiveSkips}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11.5px] text-slate-600 dark:text-zinc-300 line-clamp-2 mt-0.5 leading-snug">
                  {message}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5" role="group" aria-label="Nhắc ôn tập">
              <button
                onClick={() => finish("start")}
                aria-label="Học ngay"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 !text-white text-[11px] font-semibold shadow-sm transition-all active:scale-95"
              >
                <Play className="w-3 h-3 fill-white" />
                Học ngay
              </button>

              {payload.microQuiz ? (
                <button
                  onClick={switchToQuiz}
                  aria-label="Quiz nhanh 10 giây"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 text-[11px] font-semibold transition-all active:scale-95"
                >
                  <Zap className="w-3 h-3 text-indigo-500 fill-indigo-500" />
                  Quiz 10s
                </button>
              ) : null}

              <button
                onClick={() => finish("snooze")}
                aria-label={`Hoãn nhắc ôn tập ${payload.snoozeMinutes} phút`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[11px] font-semibold transition-colors ml-auto active:scale-95"
              >
                <Clock className="w-3 h-3 text-amber-500" />
                Hoãn {payload.snoozeMinutes}p
              </button>
            </div>
          </div>
        ) : (
          /* ─── MODE 2: INSTANT MICRO-QUIZ ─── */
          <div className="p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-indigo-500 text-indigo-500" />
                  Quick Quiz (10s)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  Bấm 1 câu cứu từ vựng
                </span>
              </div>
              {secondsLeft !== null && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums font-mono">
                  {secondsLeft}s
                </span>
              )}
            </div>

            {/* Target Word Display */}
            {payload.microQuiz ? (
              <div className="flex items-baseline gap-2">
                <span className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {payload.microQuiz.word}
                </span>
                {payload.microQuiz.phonetic && (
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                    {payload.microQuiz.phonetic}
                  </span>
                )}
                {payload.microQuiz.partOfSpeech && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-medium">
                    {payload.microQuiz.partOfSpeech}
                  </span>
                )}
              </div>
            ) : null}

            {/* 3 MCQ Options */}
            <div className="flex flex-col gap-1.5">
              {payload.microQuiz?.options.map((opt, idx) => {
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
                      <span className="shrink-0 w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center bg-slate-200/80 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
                        {idx + 1}
                      </span>
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

            {/* Quiz Result banner */}
            {quizResult && (
              <div
                className={`mt-0.5 px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center justify-between animate-fade-in ${
                  quizResult.isCorrect
                    ? "bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300"
                    : "bg-rose-100/90 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300"
                }`}
              >
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>
                    {quizResult.isCorrect ? "Chính xác! +1 Streak 🔥" : "Đã ghi nhận ôn lại!"}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-80">
                  FSRS: {quizResult.ratingLabel}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Countdown bar */}
        <div className="h-1 bg-slate-100 dark:bg-zinc-800 w-full overflow-hidden">
          <div
            className={`h-full ${
              mode === "quiz" ? "bg-indigo-500" : "bg-emerald-500"
            } ${freshBar ? "" : "transition-[width] duration-1000 ease-linear"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
