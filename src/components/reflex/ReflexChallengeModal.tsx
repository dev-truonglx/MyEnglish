import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Zap,
  Clock,
  Flame,
  Trophy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ArrowDown,
  RotateCcw,
  Volume2,
  X,
  Sparkles,
} from "lucide-react";
import type { WordDetail } from "@/types/database";
import { getCatalogSample, type CatalogEntry } from "@/services/vocabCatalog";
import {
  REFLEX_CONFIG,
  generateReflexQuestions,
  calculateReflexXP,
  speedRating,
  recordReflexCompletion,
  reflexXpLeftToday,
  REFLEX_DAILY_XP_MAX,
  WORD_CATEGORY_LABELS,
  type ReflexTier,
  type ReflexQuestion,
  type ReflexSummary,
  type ReflexAnswerRecord,
} from "@/services/reflexChallenge";
import { playSound } from "@/services/sound";
import { handleSpeak } from "@/components/review/speech";
import { cn } from "@/lib/utils";

interface ReflexChallengeModalProps {
  words: readonly WordDetail[];
  isOpen: boolean;
  onClose: () => void;
  onXPUpdated?: (earnedXP: number) => void;
}

type ModalPhase = "ready" | "playing" | "tier_transition" | "second_chance" | "game_over";

export default function ReflexChallengeModal({
  words,
  isOpen,
  onClose,
  onXPUpdated,
}: ReflexChallengeModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("ready");
  // XP really awarded by the last finished run (today's cap, REFLEX_DAILY_XP_MAX), and what is left today
  const [awardedXP, setAwardedXP] = useState<number | null>(null);
  const [xpLeftToday, setXpLeftToday] = useState(() => reflexXpLeftToday());
  const phaseRef = useRef<ModalPhase>("ready");
  phaseRef.current = phase;

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [questions, setQuestions] = useState<ReflexQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(REFLEX_CONFIG.INITIAL_TIME_SECONDS);
  const [activeTier, setActiveTier] = useState<ReflexTier>(1);

  // Gameplay metrics
  const [comboStreak, setComboStreak] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [wrongWords, setWrongWords] = useState<Array<{ word: string; meaning: string }>>([]);
  const [secondChanceUsed, setSecondChanceUsed] = useState(false);
  const [secondChanceTier, setSecondChanceTier] = useState<ReflexTier | null>(null);
  const [tiersCleared, setTiersCleared] = useState(0);

  // Detailed answer records for post-game review
  const [answerRecords, setAnswerRecords] = useState<ReflexAnswerRecord[]>([]);

  // Response time tracking
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const questionStartTimeRef = useRef<number>(Date.now());

  // Input lock and feedback
  const [isLocked, setIsLocked] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [disabledOptionIndices, setDisabledOptionIndices] = useState<Set<number>>(new Set());
  const [wrongTrueFalse, setWrongTrueFalse] = useState<"SAI" | "ĐÚNG" | null>(null);
  const hasMistakeOnCurrentQRef = useRef(false);

  // Pending timeout ref to prevent transition race conditions
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load catalog for distractors/fallback on mount only when active word pool is small (< 40)
  useEffect(() => {
    if (words.length >= 40) return;
    getCatalogSample(60)
      .then((entries) => setCatalog(entries))
      .catch(() => {});
  }, [words.length]);

  const wordsRef = useRef(words);
  wordsRef.current = words;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const wasOpenRef = useRef(false);

  // Initialize fresh session (the deck itself is built on start, so the ready screen shows at once)
  const initSession = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setQuestions([]);
    setCurrentIdx(0);
    setTimeLeft(REFLEX_CONFIG.INITIAL_TIME_SECONDS);
    setActiveTier(1);
    setTiersCleared(0);
    setComboStreak(0);
    setMaxCombo(0);
    setCorrectCount(0);
    setWrongCount(0);
    setWrongWords([]);
    setAnswerRecords([]);
    setDisabledOptionIndices(new Set());
    setWrongTrueFalse(null);
    hasMistakeOnCurrentQRef.current = false;
    setSecondChanceUsed(false);
    setSecondChanceTier(null);
    setResponseTimes([]);
    setFeedback(null);
    setSelectedOptionIdx(null);
    setIsLocked(false);
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      initSession();
    } else if (!isOpen) {
      wasOpenRef.current = false;
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    }
  }, [isOpen, initSession]);

  // Current question data
  const currentQ: ReflexQuestion | undefined = questions[currentIdx];

  // Tier progress (questions completed in current tier)
  const tierProgress = useMemo(() => {
    if (!currentQ) return { current: 0, target: 10 };
    if (activeTier === 1) {
      return { current: currentIdx, target: 10 };
    } else if (activeTier === 2) {
      return { current: currentIdx - 10, target: 12 };
    } else {
      return { current: currentIdx - 22, target: 15 };
    }
  }, [activeTier, currentIdx, currentQ]);

  // Game countdown timer loop (decrements only during "playing" phase)
  useEffect(() => {
    if (phase !== "playing") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        if (prev <= 12) {
          playSound("tick");
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Synchronous phase trigger when time runs out:
  // Popup stays open permanently until user makes a decision (never auto disappears!)
  useEffect(() => {
    if (phase === "playing" && timeLeft === 0) {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      setIsLocked(false);
      setFeedback(null);
      playSound("timeOut");
      if (!secondChanceUsed) {
        setPhase("second_chance");
      } else {
        setPhase("game_over");
      }
    }
  }, [timeLeft, phase, secondChanceUsed]);

  // Start actual game from ready screen: a new deck each run
  const handleStartGame = () => {
    setQuestions(generateReflexQuestions(wordsRef.current, catalogRef.current));
    questionStartTimeRef.current = Date.now();
    setPhase("playing");
  };

  // Start next tier when user clicks the transition button (NO auto transition!)
  const handleStartNextTier = () => {
    const nextTier = (activeTier + 1) as ReflexTier;
    setActiveTier(nextTier);
    questionStartTimeRef.current = Date.now();
    setPhase("playing");
  };

  // Trigger answer grading
  const handleAnswer = (
    isCorrect: boolean,
    userAnswerText: string,
    correctAnswerText: string,
    chosenIdx?: number
  ) => {
    if (isLocked || phase !== "playing" || !currentQ) return;

    const responseTime = Date.now() - questionStartTimeRef.current;
    setResponseTimes((prev) => [...prev, responseTime]);

    if (chosenIdx !== undefined) {
      setSelectedOptionIdx(chosenIdx);
    }

    if (isCorrect) {
      playSound("correct");
      setFeedback("correct");

      // Only count as clean first-try correct if answered without prior mistake on this card
      if (!hasMistakeOnCurrentQRef.current) {
        setCorrectCount((c) => c + 1);

        const nextCombo = comboStreak + 1;
        setComboStreak(nextCombo);
        setMaxCombo((m) => Math.max(m, nextCombo));

        if (nextCombo > 0 && nextCombo % 5 === 0) {
          playSound("combo");
        }

        // Record clean answer
        const logItem: ReflexAnswerRecord = {
          questionId: currentQ.id,
          word: currentQ.word,
          phonetic: currentQ.phonetic,
          prompt: currentQ.prompt,
          type: currentQ.type,
          direction: currentQ.direction,
          category: currentQ.category,
          isCorrect: true,
          userAnswer: userAnswerText,
          correctAnswer: correctAnswerText,
          responseTimeMs: responseTime,
        };
        setAnswerRecords((prev) => [...prev, logItem]);
      }

      // Quick advance to next question
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        setFeedback(null);
        setSelectedOptionIdx(null);
        setDisabledOptionIndices(new Set());
        setWrongTrueFalse(null);
        hasMistakeOnCurrentQRef.current = false;
        advanceQuestion();
      }, 160);
    } else {
      playSound("wrong");
      setFeedback("wrong");
      setComboStreak(0);

      // Only register as mistake once per question
      if (!hasMistakeOnCurrentQRef.current) {
        hasMistakeOnCurrentQRef.current = true;
        setWrongCount((w) => w + 1);
        setWrongWords((list) => {
          if (list.some((item) => item.word === currentQ.word)) return list;
          return [...list, { word: currentQ.word, meaning: currentQ.targetMeaning }];
        });

        // Record mistake for end-of-game review
        const logItem: ReflexAnswerRecord = {
          questionId: currentQ.id,
          word: currentQ.word,
          phonetic: currentQ.phonetic,
          prompt: currentQ.prompt,
          type: currentQ.type,
          direction: currentQ.direction,
          category: currentQ.category,
          isCorrect: false,
          userAnswer: userAnswerText,
          correctAnswer: correctAnswerText,
          responseTimeMs: responseTime,
        };
        setAnswerRecords((prev) => [...prev, logItem]);
      }

      // Mark the wrong option so user cannot pick it again
      if (chosenIdx !== undefined) {
        setDisabledOptionIndices((prev) => new Set(prev).add(chosenIdx));
      } else if (userAnswerText === "SAI" || userAnswerText === "ĐÚNG") {
        setWrongTrueFalse(userAnswerText);
      }

      // Brief lock for 350ms to display red shake, then let user retry until they find the correct answer!
      setIsLocked(true);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        setFeedback(null);
        setSelectedOptionIdx(null);
        setIsLocked(false);
        // DO NOT ADVANCE! User must pick the correct answer to proceed!
      }, 350);
    }
  };

  // Advance to next question or trigger tier completion
  const advanceQuestion = () => {
    if (phaseRef.current !== "playing") return;

    questionStartTimeRef.current = Date.now();
    const nextIdx = currentIdx + 1;

    // Check tier 1 completion (after 10 questions)
    if (activeTier === 1 && nextIdx === 10) {
      setTiersCleared(1);
      playSound("tierUp");
      setCurrentIdx(nextIdx);
      setPhase("tier_transition");
      return;
    }

    // Check tier 2 completion (after 22 questions)
    if (activeTier === 2 && nextIdx === 22) {
      setTiersCleared(2);
      playSound("tierUp");
      setCurrentIdx(nextIdx);
      setPhase("tier_transition");
      return;
    }

    // Check tier 3 victory (after 37 questions)
    if (activeTier === 3 && nextIdx >= 37) {
      setTiersCleared(3);
      playSound("complete");
      setPhase("game_over");
      return;
    }

    if (nextIdx < questions.length) {
      setCurrentIdx(nextIdx);
    } else {
      setPhase("game_over");
    }
  };

  // Second chance accepted (+15s)
  const handleAcceptSecondChance = () => {
    setSecondChanceUsed(true);
    setSecondChanceTier(activeTier);
    setTimeLeft(REFLEX_CONFIG.SECOND_CHANCE_SECONDS);
    questionStartTimeRef.current = Date.now();
    setPhase("playing");
  };

  // Summary calculation when game over
  const summary: ReflexSummary = useMemo(() => {
    const isPerfect = wrongCount === 0 && tiersCleared === 3;
    const { totalXP, baseXP, perfectBonus } = calculateReflexXP(
      tiersCleared,
      secondChanceTier,
      isPerfect
    );

    const totalAnswered = correctCount + wrongCount;
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const avgResponseTimeMs =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;
    const rating = speedRating(avgResponseTimeMs);

    return {
      tiersCleared,
      totalXP,
      baseXP,
      bonusXP: perfectBonus,
      perfectBonus: isPerfect,
      secondChanceUsed,
      secondChanceTier,
      totalAnswered,
      totalCorrect: correctCount,
      totalWrong: wrongCount,
      accuracy,
      avgResponseTimeMs,
      speedTitle: rating.title,
      wrongWords,
      answers: answerRecords,
    };
  }, [
    tiersCleared,
    secondChanceTier,
    secondChanceUsed,
    correctCount,
    wrongCount,
    responseTimes,
    wrongWords,
    answerRecords,
  ]);

  // Record completion on game over
  const recordedRef = useRef(false);
  useEffect(() => {
    if (phase === "game_over" && !recordedRef.current) {
      recordedRef.current = true;
      const awarded = recordReflexCompletion(summary);
      setAwardedXP(awarded);
      setXpLeftToday(reflexXpLeftToday());
      if (onXPUpdated && awarded > 0) {
        onXPUpdated(awarded);
      }
    } else if (phase !== "game_over") {
      recordedRef.current = false;
      setAwardedXP(null);
    }
  }, [phase, summary, onXPUpdated]);

  // Keyboard shortcut listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase === "ready") {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (phase === "tier_transition") {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          handleStartNextTier();
        }
        return;
      }

      if (phase === "playing" && currentQ && !isLocked) {
        if (currentQ.type === "choice" && currentQ.options) {
          const keyNum = parseInt(e.key, 10);
          if (keyNum >= 1 && keyNum <= currentQ.options.length) {
            e.preventDefault();
            const chosenIdx = keyNum - 1;
            if (disabledOptionIndices.has(chosenIdx)) return;
            const chosenText = currentQ.options[chosenIdx];
            const correctText = currentQ.options[currentQ.correctIndex ?? 0];
            handleAnswer(chosenIdx === currentQ.correctIndex, chosenText, correctText, chosenIdx);
          }
        } else if (currentQ.type === "true_false") {
          if ((e.code === "ArrowLeft" || e.key === "1") && wrongTrueFalse !== "SAI") {
            e.preventDefault();
            const isCorrect = !currentQ.isTrue;
            const correctText = currentQ.isTrue ? "ĐÚNG" : `SAI (Nghĩa đúng: ${currentQ.targetMeaning})`;
            handleAnswer(isCorrect, "SAI", correctText, 1);
          } else if ((e.code === "ArrowRight" || e.key === "2") && wrongTrueFalse !== "ĐÚNG") {
            e.preventDefault();
            const isCorrect = !!currentQ.isTrue;
            const correctText = currentQ.isTrue ? "ĐÚNG" : `SAI (Nghĩa đúng: ${currentQ.targetMeaning})`;
            handleAnswer(isCorrect, "ĐÚNG", correctText, 2);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, phase, currentQ, isLocked, disabledOptionIndices, wrongTrueFalse]);

  if (!isOpen) return null;

  // Format mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const timerColor =
    timeLeft > 35
      ? "text-emerald-400 border-emerald-500/50 bg-emerald-950/40"
      : timeLeft > 15
        ? "text-amber-400 border-amber-500/50 bg-amber-950/40"
        : "text-rose-400 border-rose-500/70 bg-rose-950/60 animate-pulse";

  // Filter wrong answers for review list
  const wrongAnswerRecords = answerRecords.filter((a) => !a.isCorrect);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white p-3 md:p-4 select-none animate-in fade-in duration-200 max-md:overflow-y-auto">
      {/* ── PHASE 1: READY / ONBOARDING ── */}
      {phase === "ready" && (
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl md:rounded-3xl p-5 md:p-7 shadow-2xl text-center space-y-5 md:space-y-6 animate-in zoom-in-95">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/20">
            <Zap className="w-8 h-8 md:w-9 md:h-9 fill-amber-400" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full">
              Chế độ Duolingo Ramp Up
            </span>
            <h2 className="text-xl md:text-2xl font-black mt-2 text-white">Thử Thách Phản Xạ 3 Chặng</h2>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Thời gian liên thông: Giữ nguyên số giây còn lại qua từng chặng!
            </p>
          </div>

          <div className="bg-slate-950/60 rounded-2xl p-3.5 md:p-4 border border-slate-800/80 text-left space-y-3">
            <div className="flex items-center justify-between text-xs md:text-sm pb-2 border-b border-slate-800">
              <span className="text-slate-400">⏱️ Quỹ thời gian ban đầu</span>
              <span className="font-bold text-white">105 giây (1m45s)</span>
            </div>
            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-center justify-between text-emerald-400 font-semibold">
                <span>🟢 Chặng 1: 10 câu khởi động</span>
                <span>+15 XP</span>
              </div>
              <div className="flex items-center justify-between text-cyan-400 font-semibold">
                <span>🔵 Chặng 2: 12 câu tăng tốc</span>
                <span>+25 XP</span>
              </div>
              <div className="flex items-center justify-between text-amber-400 font-semibold">
                <span>🟡 Chặng 3: 15 câu chạm đỉnh</span>
                <span>+40 XP</span>
              </div>
              <p className="pt-1 text-[11px] text-slate-500">
                {xpLeftToday > 0
                  ? `XP luyện phản xạ: tối đa ${REFLEX_DAILY_XP_MAX} XP mỗi ngày (hôm nay còn ${xpLeftToday} XP).`
                  : `Hôm nay đã nhận đủ ${REFLEX_DAILY_XP_MAX} XP luyện phản xạ: vẫn chơi để luyện được, mai nhận XP tiếp.`}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 md:py-3.5 max-md:min-h-[40px] rounded-xl border border-slate-700 hover:bg-slate-800 font-semibold text-slate-300 transition-colors"
            >
              Để sau
            </button>
            <button
              onClick={handleStartGame}
              className="flex-2 py-3 md:py-3.5 px-4 md:px-6 max-md:min-h-[40px] rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Zap className="w-5 h-5 fill-slate-950" />
              <span>
                BẮT ĐẦU NGAY<span className="hidden md:inline"> (Space)</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE 2: PLAYING GAME ── */}
      {phase === "playing" && currentQ && (
        <div className="w-full max-w-xl flex flex-col h-full max-h-[640px] justify-between">
          {/* Header Bar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPhase("game_over")}
                className="p-2.5 md:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
                title="Dừng thử thách"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Time display */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 md:px-4 py-1 md:py-1.5 rounded-full border font-mono font-black text-base md:text-lg transition-colors shadow-lg",
                  timerColor
                )}
              >
                <Clock className="w-4 h-4 md:w-5 md:h-5" />
                <span>{formatTime(timeLeft)}</span>
              </div>

              {/* Streak combo */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-amber-400 font-black text-xs md:text-sm">
                <Flame className={cn("w-3.5 h-3.5 md:w-4 md:h-4", comboStreak >= 3 && "fill-amber-400 animate-bounce")} />
                <span>{comboStreak}x</span>
              </div>
            </div>

            {/* 3-Tier Indicator and Question Progress */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5 md:gap-2 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-center">
                <div
                  className={cn(
                    "py-1 rounded-lg border",
                    activeTier === 1
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-black"
                      : activeTier > 1
                        ? "bg-slate-800/40 border-slate-700 text-emerald-400 line-through"
                        : "bg-slate-900 border-slate-800 text-slate-500"
                  )}
                >
                  ⚡ Chặng 1 (+15 XP)
                </div>
                <div
                  className={cn(
                    "py-1 rounded-lg border",
                    activeTier === 2
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 font-black"
                      : activeTier > 2
                        ? "bg-slate-800/40 border-slate-700 text-cyan-400 line-through"
                        : "bg-slate-900 border-slate-800 text-slate-500"
                  )}
                >
                  ⚡ Chặng 2 (+25 XP)
                </div>
                <div
                  className={cn(
                    "py-1 rounded-lg border",
                    activeTier === 3
                      ? "bg-amber-500/20 border-amber-500 text-amber-400 font-black"
                      : "bg-slate-900 border-slate-800 text-slate-500"
                  )}
                >
                  ⚡ Chặng 3 (+40 XP)
                </div>
              </div>

              {/* Progress Bar within active tier */}
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    activeTier === 1
                      ? "bg-emerald-500"
                      : activeTier === 2
                        ? "bg-cyan-500"
                        : "bg-amber-500"
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((tierProgress.current / tierProgress.target) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Question Body - DYNAMIC BY QUESTION TYPE */}
          {currentQ.type === "choice" ? (
            /* 1. MULTIPLE CHOICE QUESTION VIEW */
            <div className="my-auto py-6 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase font-bold text-slate-400 tracking-widest mb-2">
                {currentQ.direction === "en_to_vn" ? "Chọn nghĩa đúng" : "Chọn từ tiếng Anh"}
              </span>

              <div className="flex items-center justify-center gap-3">
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight break-words">
                  {currentQ.prompt}
                </h1>
                {currentQ.direction === "en_to_vn" && (
                  <button
                    onClick={() => handleSpeak(currentQ.word)}
                    className="p-2.5 md:p-2 rounded-full text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                    title="Nghe phát âm"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              {currentQ.phonetic && currentQ.direction === "en_to_vn" && (
                <p className="text-xs font-mono text-cyan-400/80 mt-1">{currentQ.phonetic}</p>
              )}
            </div>
          ) : (
            /* 2. OPTIMIZED TRUE / FALSE COMPACT FOCAL CARD */
            <div className="my-auto py-2 flex flex-col items-center justify-center w-full">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-0.5 rounded-full mb-2">
                ⚡ ĐÚNG HAY SAI?
              </span>

              {/* Seamless, ultra-compact comparison card bringing English and Vietnamese directly into one tight focal view */}
              <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl text-center space-y-2">
                {/* English word + Phonetic + Speaker in one unified horizontal group */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xl sm:text-3xl font-black text-white tracking-tight break-words">
                    {currentQ.word}
                  </span>
                  {currentQ.phonetic && (
                    <span className="text-xs font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-lg">
                      {currentQ.phonetic}
                    </span>
                  )}
                  <button
                    onClick={() => handleSpeak(currentQ.word)}
                    className="p-2 md:p-1 rounded-full text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                    title="Nghe phát âm"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Sleek, instant bridge indicator */}
                <div className="flex items-center justify-center">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] font-bold text-slate-400 flex items-center gap-1 shadow-inner">
                    <ArrowDown className="w-2.5 h-2.5 text-amber-400" />
                    <span>nghĩa là</span>
                  </span>
                </div>

                {/* Vietnamese meaning to verify - prominent & crystal clear */}
                <div className="py-2.5 px-3 md:px-4 rounded-xl bg-amber-400/10 border border-amber-400/25 text-amber-300 font-black text-base sm:text-xl tracking-wide leading-snug break-words">
                  "{currentQ.displayedPair?.meaning}"
                </div>
              </div>
            </div>
          )}

          {/* Interactive Options Area */}
          <div className="space-y-3 pb-4">
            {/* 1. Multiple Choice layout: ALWAYS 4 OPTIONS IN A BALANCED 2x2 GRID */}
            {currentQ.type === "choice" && currentQ.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:gap-3">
                {currentQ.options.map((opt, idx) => {
                  const isSelected = selectedOptionIdx === idx;
                  const isCorrect = idx === currentQ.correctIndex;
                  const isDisabled = disabledOptionIndices.has(idx);

                  let btnStyle =
                    "bg-slate-900/90 border-slate-800 text-slate-200 hover:bg-slate-850 hover:border-slate-700";

                  if (feedback === "correct" && isCorrect) {
                    btnStyle = "bg-emerald-600 border-emerald-500 text-white scale-[1.02]";
                  } else if (feedback === "wrong" && isSelected) {
                    btnStyle = "bg-rose-600 border-rose-500 text-white animate-shake";
                  } else if (isDisabled) {
                    btnStyle =
                      "bg-slate-950/60 border-rose-950/60 text-slate-500 line-through opacity-45 cursor-not-allowed";
                  }

                  const correctText = currentQ.options![currentQ.correctIndex ?? 0];

                  return (
                    <button
                      key={idx}
                      disabled={isLocked || isDisabled}
                      onClick={() => handleAnswer(isCorrect, opt, correctText, idx)}
                      className={cn(
                        "relative flex items-center gap-3 p-3.5 md:p-4 max-md:min-h-[44px] rounded-2xl border text-left font-semibold text-sm md:text-base transition-all duration-150 transform active:scale-95 shadow-md",
                        btnStyle
                      )}
                    >
                      <span className="hidden md:flex w-7 h-7 rounded-xl bg-slate-950/60 text-slate-300 font-mono text-xs font-bold items-center justify-center border border-slate-800 shrink-0">
                        {idx + 1}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{opt}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 2. True / False buttons layout directly under the comparison card */}
            {currentQ.type === "true_false" && currentQ.displayedPair && (
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <button
                  disabled={isLocked || wrongTrueFalse === "SAI"}
                  onClick={() => {
                    const isCorrect = !currentQ.isTrue;
                    const correctText = currentQ.isTrue
                      ? "ĐÚNG"
                      : `SAI (Nghĩa đúng: ${currentQ.targetMeaning})`;
                    handleAnswer(isCorrect, "SAI", correctText, 1);
                  }}
                  className={cn(
                    "p-3.5 md:p-4 max-md:min-h-[44px] rounded-2xl border font-black text-base md:text-lg flex items-center justify-center gap-2 md:gap-2.5 transition-all active:scale-95 shadow-lg",
                    wrongTrueFalse === "SAI"
                      ? "bg-rose-950/20 border-rose-950/40 text-rose-500/40 line-through opacity-40 cursor-not-allowed"
                      : feedback === "wrong" && selectedOptionIdx === 1
                        ? "bg-rose-600 border-rose-500 text-white animate-shake"
                        : "bg-rose-950/40 border-rose-500/50 hover:bg-rose-900/60 text-rose-300"
                  )}
                >
                  <span className="hidden md:flex w-7 h-7 rounded-xl bg-rose-950/80 text-rose-300 font-mono text-sm font-bold items-center justify-center border border-rose-900/80 shrink-0">
                    1
                  </span>
                  <XCircle className="w-5 h-5 shrink-0" />
                  <span>SAI</span>
                </button>
                <button
                  disabled={isLocked || wrongTrueFalse === "ĐÚNG"}
                  onClick={() => {
                    const isCorrect = !!currentQ.isTrue;
                    const correctText = currentQ.isTrue
                      ? "ĐÚNG"
                      : `SAI (Nghĩa đúng: ${currentQ.targetMeaning})`;
                    handleAnswer(isCorrect, "ĐÚNG", correctText, 2);
                  }}
                  className={cn(
                    "p-3.5 md:p-4 max-md:min-h-[44px] rounded-2xl border font-black text-base md:text-lg flex items-center justify-center gap-2 md:gap-2.5 transition-all active:scale-95 shadow-lg",
                    wrongTrueFalse === "ĐÚNG"
                      ? "bg-rose-950/20 border-rose-950/40 text-rose-500/40 line-through opacity-40 cursor-not-allowed"
                      : feedback === "wrong" && selectedOptionIdx === 2
                        ? "bg-rose-600 border-rose-500 text-white animate-shake"
                        : "bg-emerald-950/40 border-emerald-500/50 hover:bg-emerald-900/60 text-emerald-300"
                  )}
                >
                  <span className="hidden md:flex w-7 h-7 rounded-xl bg-emerald-950/80 text-emerald-300 font-mono text-sm font-bold items-center justify-center border border-emerald-900/80 shrink-0">
                    2
                  </span>
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>ĐÚNG</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PHASE 3: TIER TRANSITION (PAUSES AND WAITS FOR USER CLICK - NO AUTO TRANSITION) ── */}
      {phase === "tier_transition" && (
        <div className="max-w-md w-full bg-slate-900 border border-emerald-500/40 rounded-2xl md:rounded-3xl p-5 md:p-7 shadow-2xl text-center space-y-5 md:space-y-6 animate-in zoom-in-95">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/30">
            <Trophy className="w-8 h-8 md:w-10 md:h-10" />
          </div>

          <div>
            <h2 className="text-xl md:text-2xl font-black text-white">
              🎉 VƯỢT QUA CHẶNG {tiersCleared}!
            </h2>
            <p className="text-emerald-400 font-bold mt-1 text-sm md:text-base">
              +{activeTier === 1 ? 15 : 25} XP ĐÃ ĐƯỢC BẢO LƯU!
            </p>
          </div>

          <div className="bg-slate-950/80 rounded-2xl p-3.5 md:p-4 border border-slate-800 space-y-2 text-xs md:text-sm">
            <div className="flex justify-between items-center text-slate-300">
              <span>⏱️ Thời gian bảo lưu:</span>
              <span className="font-mono font-bold text-amber-400 text-base md:text-lg">
                {formatTime(timeLeft)}
              </span>
            </div>
            <p className="text-xs text-slate-400 text-left">
              Toàn bộ số giây này sẽ được giữ nguyên cho Chặng {tiersCleared + 1}. Hãy nghỉ tay một
              chút và bấm nút khi bạn đã sẵn sàng!
            </p>
          </div>

          <button
            onClick={handleStartNextTier}
            className="w-full py-3.5 md:py-4 max-md:min-h-[44px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm md:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-transform transform active:scale-95"
          >
            <span>
              VÀO CHẶNG {tiersCleared + 1}<span className="hidden md:inline"> (Nhấn Space)</span>
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ── PHASE 4: SECOND CHANCE POPUP (STAYS OPEN UNTIL USER CLICKS - NEVER DISAPPEARS) ── */}
      {phase === "second_chance" && (
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/50 rounded-2xl md:rounded-3xl p-5 md:p-7 shadow-2xl text-center space-y-4 md:space-y-5 animate-in zoom-in-95">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/20">
            <AlertCircle className="w-8 h-8 md:w-9 md:h-9" />
          </div>

          <div>
            <h2 className="text-xl md:text-2xl font-black text-white">⏰ HẾT GIỜ!</h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1">
              Bạn có muốn nhận thêm <strong className="text-amber-400">+15 giây</strong> để hoàn
              thành Chặng {activeTier} không?
            </p>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 text-xs text-slate-400 text-left">
            ⚠️ <em>Lưu ý:</em> Cơ hội chỉ áp dụng 1 lần duy nhất. Nếu nhận, XP thưởng của Chặng{" "}
            {activeTier} sẽ giảm 50% (còn{" "}
            {Math.round(
              (REFLEX_CONFIG.TIERS.find((t) => t.tier === activeTier)?.xpReward || 0) * 0.5
            )}{" "}
            XP).
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setPhase("game_over")}
              className="flex-1 py-3 max-md:min-h-[40px] rounded-xl border border-slate-700 hover:bg-slate-800 font-semibold text-slate-300 text-xs md:text-sm transition-colors"
            >
              Dừng lại & Xem kết quả
            </button>
            <button
              onClick={handleAcceptSecondChance}
              className="flex-1 py-3 max-md:min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs md:text-sm flex items-center justify-center gap-1 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              Nhận +15s làm tiếp
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE 5: GAME OVER / VICTORY RESULTS WITH DETAILED MISTAKE REVIEW ── */}
      {phase === "game_over" && (
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl md:rounded-3xl p-4 sm:p-7 shadow-2xl text-center space-y-4 md:space-y-5 animate-in zoom-in-95 max-h-[90vh] flex flex-col justify-between max-md:overflow-y-auto">
          <div className="space-y-4">
            <div
              className={cn(
                "w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto shadow-xl",
                summary.tiersCleared === 3
                  ? "bg-amber-500/20 border-2 border-amber-500 text-amber-400 shadow-amber-500/25"
                  : "bg-slate-800 border-2 border-slate-700 text-slate-300"
              )}
            >
              {summary.tiersCleared === 3 ? (
                <Sparkles className="w-7 h-7 md:w-8 md:h-8 fill-amber-400" />
              ) : (
                <Trophy className="w-7 h-7 md:w-8 md:h-8" />
              )}
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {summary.tiersCleared === 3
                  ? "🏆 VICTORY! CHIẾN THẮNG HOÀN TOÀN!"
                  : "TỔNG KẾT PHẢN XẠ"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Vượt qua {summary.tiersCleared} / 3 Chặng thử thách
              </p>
            </div>

            {/* XP & Speed Stats Cards */}
            <div className="grid grid-cols-2 gap-2.5 md:gap-3 text-left">
              <div className="bg-slate-950/80 p-3 md:p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] md:text-[11px] font-bold text-slate-400 block uppercase">
                  Tổng XP Nhận Được
                </span>
                <span className="text-xl md:text-2xl font-black text-amber-400 flex items-center gap-1 mt-0.5">
                  +{awardedXP ?? summary.totalXP} <span className="text-xs text-amber-500/80">XP</span>
                </span>
                {awardedXP != null && awardedXP < summary.totalXP && (
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Đạt {summary.totalXP} XP · trần {REFLEX_DAILY_XP_MAX} XP/ngày
                  </span>
                )}
                {summary.perfectBonus && (
                  <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                    ✨ +10 XP Perfect!
                  </span>
                )}
              </div>

              <div className="bg-slate-950/80 p-3 md:p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] md:text-[11px] font-bold text-slate-400 block uppercase">
                  Tốc độ phản xạ
                </span>
                <span className="text-sm md:text-base font-black text-white block mt-0.5">
                  {summary.avgResponseTimeMs > 0
                    ? (summary.avgResponseTimeMs / 1000).toFixed(2)
                    : "0"}
                  s / câu
                </span>
                <span className="text-[10px] md:text-[11px] font-bold text-cyan-400 block mt-0.5">
                  {summary.speedTitle}
                </span>
              </div>
            </div>

            {/* Accuracy & Correct / Wrong Counter */}
            <div className="bg-slate-950/50 rounded-2xl p-2.5 md:p-3 border border-slate-800/80 flex justify-around text-[11px] md:text-xs">
              <div>
                <span className="text-slate-500 block">Số câu đúng</span>
                <span className="font-bold text-emerald-400 text-xs md:text-sm">
                  {summary.totalCorrect} câu
                </span>
              </div>
              <div className="border-r border-slate-800" />
              <div>
                <span className="text-slate-500 block">Số câu sai</span>
                <span className="font-bold text-rose-400 text-xs md:text-sm">{summary.totalWrong} câu</span>
              </div>
              <div className="border-r border-slate-800" />
              <div>
                <span className="text-slate-500 block">Độ chính xác</span>
                <span className="font-bold text-white text-xs md:text-sm">{summary.accuracy}%</span>
              </div>
              <div className="border-r border-slate-800" />
              <div>
                <span className="text-slate-500 block">Combo max</span>
                <span className="font-bold text-amber-400 text-xs md:text-sm">{maxCombo}x</span>
              </div>
            </div>

            {/* DETAILED MISTAKE REVIEW SECTION */}
            <div className="text-left space-y-2">
              <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                {wrongAnswerRecords.length > 0
                  ? `🔍 Xem lại các câu trả lời sai (${wrongAnswerRecords.length} câu)`
                  : "✨ Phản xạ tuyệt đối: Không sai câu nào!"}
              </span>

              {wrongAnswerRecords.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {wrongAnswerRecords.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm">{item.word}</span>
                          {item.phonetic && (
                            <span className="text-[11px] font-mono text-slate-400">
                              {item.phonetic}
                            </span>
                          )}
                          {item.category && WORD_CATEGORY_LABELS[item.category] && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              {WORD_CATEGORY_LABELS[item.category]}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleSpeak(item.word)}
                          className="p-2 md:p-1 rounded-full text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                          title="Nghe phát âm"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px]">
                        <div className="flex items-start gap-1 text-rose-400">
                          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-slate-500 block text-[10px]">Bạn chọn:</span>
                            <span className="font-semibold line-through">{item.userAnswer}</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-slate-500 block text-[10px]">Đáp án đúng:</span>
                            <span className="font-semibold">{item.correctAnswer}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Bạn đã trả lời chính xác 100% tất cả các câu hỏi!</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => {
                initSession();
                handleStartGame();
              }}
              className="flex-1 py-3 max-md:min-h-[40px] rounded-xl border border-slate-700 hover:bg-slate-800 font-bold text-slate-200 flex items-center justify-center gap-2 text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Luyện tiếp
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 max-md:min-h-[40px] rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/25 transition-all transform active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              Kết thúc
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
