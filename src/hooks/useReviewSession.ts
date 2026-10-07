import { useState, useEffect, useRef, useMemo } from "react";
import {
  recordReview,
  getNextIntervalPreviews,
  Rating,
  type FSRSResult,
  type IntervalPreviews,
} from "@/services/srs";
import { recordDailyActivity, calculateStreakAndGoal } from "@/services/streak";
import type { WordDetail, ReviewCard } from "@/types/database";
import { toCard } from "@/services/cards";
import {
  isLeech,
  calculateXPReward,
  awardXP,
  saveReviewLog,
  getXPState,
  selectExerciseType,
  deriveRating,
  matchTypedAnswer,
  type ExerciseType,
  type XPReward,
  type XPState,
} from "@/services/smartReview";
import { checkAndUnlockAchievements } from "@/services/achievements";
import { triggerConfetti } from "@/utils/confetti";
import { handleSpeak } from "@/components/review/speech";
import { emit } from "@tauri-apps/api/event";

const MAX_REQUEUES_PER_WORD = 2;
const REQUEUE_GAP = 3; // Cards shown before a forgotten word comes back

export type StudyMode =
  | "mixed"
  | "flip"
  | "cloze"
  | "spelling"
  | "multiple_choice"
  | "sentence_builder"
  | "context_match"
  | "listening"
  | "reverse_cloze";

export interface SessionStats {
  firstTryCorrect: number;
  retryCorrect: number;
  revealedCount: number;
  skippedCount: number;
  totalWrongAttempts: number;
  totalXPEarned: number;
  leechesSlain: number;
}

export interface FeedbackMessage {
  text: string;
  type: "error" | "success" | "info";
}

interface UseReviewSessionOptions {
  wordsToReview: Array<WordDetail | ReviewCard>;
  distractorPool?: WordDetail[];
  practiceMode: boolean;
}

/**
 * Review session engine: queue with in-session requeue of forgotten cards, per-card answer state,
 * adaptive exercise selection, grading (FSRS / practice), session stats, XP and keyboard shortcuts.
 */
export function useReviewSession({ wordsToReview, distractorPool, practiceMode }: UseReviewSessionOptions) {
  // Preferred mode persistence
  const [mode, setMode] = useState<StudyMode>(() => {
    try {
      const saved = localStorage.getItem("myenglish_flashcard_mode");
      if (saved) return saved as StudyMode;
    } catch {}
    return "mixed";
  });

  const [fallbackMode, setFallbackMode] = useState<ExerciseType | null>(null);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);

  // Session queue: words graded Again are re-inserted a few cards later for in-session relearning
  const [queue, setQueue] = useState<ReviewCard[]>(() =>
    wordsToReview.map((w) => ("direction" in w ? w : toCard(w, "recognition")))
  );
  const requeueCountRef = useRef<Map<string, number>>(new Map());
  // Cards (word + direction) already recorded in FSRS this session: retries are practice only,
  // so one bad session can't drive difficulty to the maximum
  const scheduledThisSessionRef = useRef<Set<string>>(new Set());
  // Set as soon as a card is being graded or a correct typed answer is waiting to be graded
  const gradingLockRef = useRef(false);
  const answerLockedRef = useRef(false);
  // Grade of a correct typed answer, applied when the user continues (Enter / "Tiếp tục")
  const [pendingRating, setPendingRating] = useState<Rating | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [lastResult, setLastResult] = useState<FSRSResult | null>(null);
  const [intervalPreviews, setIntervalPreviews] = useState<IntervalPreviews>({
    [Rating.Again]: "1m",
    [Rating.Hard]: "1d",
    [Rating.Good]: "3d",
    [Rating.Easy]: "7d",
  });

  // Cloze & Spelling Interactive State
  const [userInput, setUserInput] = useState("");
  const [hasCheckedAnswer, setHasCheckedAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: "error" | "success" | "info";
  } | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Session-wide Learning Evaluation Statistics
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    firstTryCorrect: 0,
    retryCorrect: 0,
    revealedCount: 0,
    skippedCount: 0,
    totalWrongAttempts: 0,
    totalXPEarned: 0,
    leechesSlain: 0,
  });

  // Phase 1: Response Time Tracking
  const cardStartTime = useRef<number>(Date.now());
  const [lastXPReward, setLastXPReward] = useState<XPReward | null>(null);
  const [showXPPopup, setShowXPPopup] = useState(false);
  const [xpState, setXpState] = useState<XPState>(getXPState);

  const inputRef = useRef<HTMLInputElement>(null);

  // Whole-collection totals for achievements (the session itself is only a slice)
  const collectionStats = useMemo(() => {
    const collection = distractorPool && distractorPool.length > 0 ? distractorPool : wordsToReview;
    const masteredByTopic = new Map<string, number>();
    for (const w of collection) {
      if (w.srs.state === 2 && (w.srs.stability ?? 0) >= 21) {
        const topic = (w.topic || "General Tech").toLowerCase();
        masteredByTopic.set(topic, (masteredByTopic.get(topic) ?? 0) + 1);
      }
    }
    return {
      totalWords: collection.length,
      currentStreak: calculateStreakAndGoal(collection).currentStreak,
      topicMasterCount: Math.max(0, ...masteredByTopic.values()),
    };
  }, [distractorPool, wordsToReview]);
  const currentWord = queue[currentIndex];

  // Adaptive exercise type calculation
  const effectiveExerciseType: ExerciseType = useMemo(() => {
    if (fallbackMode) return fallbackMode;
    if (mode !== "mixed") return mode as ExerciseType;
    if (!currentWord) return "flip";
    return selectExerciseType(currentWord);
  }, [mode, currentWord, fallbackMode]);

  // "Xem đáp án" pressed on a typed exercise: the word was not recalled
  const revealedWithoutRecall = effectiveExerciseType !== "flip" && hasCheckedAnswer && !isCorrect;

  const handleModeChange = (newMode: StudyMode) => {
    setMode(newMode);
    try {
      localStorage.setItem("myenglish_flashcard_mode", newMode);
    } catch {}
    resetCardState();
  };

  const resetCardState = () => {
    setIsFlipped(false);
    setUserInput("");
    setHasCheckedAnswer(false);
    setIsCorrect(null);
    setShowHint(false);
    setWrongAttempts(0);
    setIsShaking(false);
    setFeedbackMessage(null);
    setIsAdvancing(false);
    setLastXPReward(null);
    setShowXPPopup(false);
    setFallbackMode(null);
    gradingLockRef.current = false;
    answerLockedRef.current = false;
    setPendingRating(null);
    cardStartTime.current = Date.now(); // Reset response timer
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  useEffect(() => {
    resetCardState();
    if (currentWord) {
      setIntervalPreviews(getNextIntervalPreviews(currentWord.srs));
    }
  }, [currentIndex, currentWord]);


  // Auto-speak on card switch in Spelling mode (Listening plays its own audio)
  useEffect(() => {
    if (effectiveExerciseType === "spelling" && currentWord) {
      handleSpeak(currentWord.word);
    }
  }, [currentIndex, effectiveExerciseType]);

  // Exercises report their own attempts; the FSRS grade is derived centrally.
  // An exercise reporting Hard with 0 wrong attempts means a hint was used.
  const gradeExercise = (exerciseType: ExerciseType, attempts: number, exerciseRating: Rating): Rating =>
    deriveRating({
      exerciseType,
      wrongAttempts: attempts,
      usedHint: attempts === 0 && exerciseRating === Rating.Hard,
      responseTimeMs: Date.now() - cardStartTime.current,
      srs: currentWord?.srs,
    });

  const handleGrade = async (requestedRating: Rating, overrideExerciseType?: ExerciseType, attempts?: number) => {
    // A ref, not state: a second grade queued from a stale render (double Enter, Skip + timer)
    // must not record the card twice or skip the next card
    if (!currentWord || gradingLockRef.current) return;
    gradingLockRef.current = true;
    setIsAdvancing(true);

    // The answer is recorded on this card's own schedule; recognition is capped at Good
    const rating =
      currentWord.direction === "recognition" && requestedRating === Rating.Easy ? Rating.Good : requestedRating;

    const activeExType = overrideExerciseType || effectiveExerciseType;
    const responseTimeMs = Date.now() - cardStartTime.current;
    const wordIsLeech = isLeech(currentWord.srs);
    const attemptCount = attempts ?? wrongAttempts;
    const isFirstTry = attemptCount === 0 && !showHint;
    const isRequeuedCard = (requeueCountRef.current.get(currentWord.id) ?? 0) > 0;

    // Track statistics (only the first time a word is shown in this session)
    if (!isRequeuedCard) {
      if (rating === Rating.Again) {
        setSessionStats((prev) => ({ ...prev, revealedCount: prev.revealedCount + 1 }));
      } else if (isFirstTry && rating !== Rating.Hard) {
        setSessionStats((prev) => ({ ...prev, firstTryCorrect: prev.firstTryCorrect + 1 }));
      } else {
        setSessionStats((prev) => ({ ...prev, retryCorrect: prev.retryCorrect + 1 }));
      }
    }
    if (rating === Rating.Again) {
      setConsecutiveCorrect(0);
    } else {
      setConsecutiveCorrect((prev) => prev + 1);
    }

    // Calculate & award XP
    const xpReward = calculateXPReward(rating, activeExType, attemptCount, responseTimeMs, wordIsLeech, isFirstTry, consecutiveCorrect);
    if (xpReward.totalXP > 0) {
      awardXP(xpReward.totalXP);
      setLastXPReward(xpReward);
      setShowXPPopup(true);
      setTimeout(() => setShowXPPopup(false), 1500);
      setSessionStats((prev) => ({
        ...prev,
        totalXPEarned: prev.totalXPEarned + xpReward.totalXP,
        leechesSlain: prev.leechesSlain + (wordIsLeech && (rating === Rating.Good || rating === Rating.Easy) ? 1 : 0),
      }));
    }

    // Check gamification achievements
    checkAndUnlockAchievements({
      ...collectionStats,
      consecutiveCorrect: rating >= Rating.Good ? consecutiveCorrect + 1 : 0,
      sessionReviewCount: reviewCount + 1,
      leechesSlain: sessionStats.leechesSlain + (wordIsLeech && rating >= Rating.Good ? 1 : 0),
      responseTimeMs,
      isCorrect: rating >= Rating.Good,
    });

    try {
      // Cho phép FSRS cập nhật liên tục các bước Learning/Relearning trong cùng session
      const cardKey = `${currentWord.id}:${currentWord.direction}`;
      const isScheduled = !practiceMode;
      const result = isScheduled ? await recordReview(currentWord.id, rating, currentWord.direction) : null;
      if (isScheduled) {
        scheduledThisSessionRef.current.add(cardKey);
        emit("words-changed").catch(() => {});
      }
      // Only the first answer to a card counts toward the daily goal (retries after Again don't)
      if (!isRequeuedCard) recordDailyActivity(1);
      if (result) setLastResult(result);
      setReviewCount((prev) => prev + 1);

      // Save review log with response time and exercise type
      saveReviewLog({
        wordId: currentWord.id,
        exerciseType: activeExType,
        responseTimeMs,
        isCorrect: rating >= Rating.Good,
        wrongAttempts: attemptCount,
        rating,
        xpEarned: xpReward.totalXP,
        timestamp: new Date().toISOString(),
        isScheduled,
        direction: result?.direction ?? currentWord.direction,
      }).catch((err) => console.warn("Review log save failed:", err));

      // Update XP state for display
      setXpState(getXPState());

      // In-session relearning: show a forgotten word again a few cards later (max 2 times)
      let nextQueueLength = queue.length;
      const requeued = requeueCountRef.current.get(currentWord.id) ?? 0;
      if (rating === Rating.Again && requeued < MAX_REQUEUES_PER_WORD) {
        requeueCountRef.current.set(currentWord.id, requeued + 1);
        // Only refresh the card's schedule when the answer was recorded on this card
        let updatedWord: ReviewCard = currentWord;
        if (result && result.direction === currentWord.direction) {
          const srs: WordDetail["srs"] = {
            ...currentWord.srs,
            stability: result.stability,
            difficulty: result.difficulty,
            reps: result.reps,
            lapses: result.lapses,
            state: result.state as WordDetail["srs"]["state"],
            last_review: result.lastReview ?? null,
            next_review_date: result.nextReviewDate,
            scheduled_days: result.scheduled_days,
            learning_steps: result.learningSteps,
          };
          updatedWord =
            currentWord.direction === "recognition"
              ? { ...currentWord, srs, srsRecognition: srs }
              : { ...currentWord, srs, srsProduction: srs };
        }
        const insertAt = Math.min(queue.length, currentIndex + 1 + REQUEUE_GAP);
        setQueue((prev) => [...prev.slice(0, insertAt), updatedWord, ...prev.slice(insertAt)]);
        nextQueueLength += 1;
      }

      if (currentIndex + 1 < nextQueueLength) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        triggerConfetti(3000);
        setSessionCompleted(true);
      }
    } catch (err) {
      console.error("Failed to record review:", err);
      gradingLockRef.current = false;
      setIsAdvancing(false);
    }
  };

  // Submit Answer in Cloze or Spelling mode
  const handleCheckAnswer = () => {
    if (!currentWord || hasCheckedAnswer || isAdvancing || answerLockedRef.current) return;
    if (!userInput.trim()) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 350);
      setFeedbackMessage({
        text: "Vui lòng nhập từ trước khi nhấn Enter!",
        type: "info",
      });
      inputRef.current?.focus();
      return;
    }

    const clozeSentence = effectiveExerciseType === "cloze" ? currentWord.examples[0]?.sentence_en : undefined;
    const match = matchTypedAnswer(userInput, currentWord.word, clozeSentence);
    const matched = match !== "wrong";

    if (matched) {
      // ---------------- CORRECT ----------------
      // Lock the card right away: Enter / Skip / Show answer during the short delay are ignored
      answerLockedRef.current = true;
      setIsCorrect(true);
      setFeedbackMessage({
        text: "Chính xác tuyệt đối! 🎉 Đọc lại đáp án rồi nhấn Enter hoặc Tiếp tục.",
        type: "success",
      });
      handleSpeak(currentWord.word);

      // FSRS grade: any wrong attempt = Again, hint / typo / very slow = Hard, otherwise Good
      const rating = deriveRating({
        exerciseType: effectiveExerciseType,
        wrongAttempts,
        usedHint: showHint,
        nearMiss: match === "near",
        responseTimeMs: Date.now() - cardStartTime.current,
        srs: currentWord.srs,
      });
      if (match === "near") {
        setFeedbackMessage({
          text: `Gần đúng! Từ chính xác là "${currentWord.word}" (tính là Khó). Nhấn Enter hoặc Tiếp tục.`,
          type: "info",
        });
      }

      // No auto-advance: the learner reads the answer and continues when ready
      setPendingRating(rating);
    } else {
      // ---------------- INCORRECT ----------------
      const newAttempts = wrongAttempts + 1;
      setWrongAttempts(newAttempts);
      setIsCorrect(false);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 350);

      setSessionStats((prev) => ({
        ...prev,
        totalWrongAttempts: prev.totalWrongAttempts + 1,
      }));

      if (newAttempts >= 2) {
        setShowHint(true);
        setFeedbackMessage({
          text: `Chưa chính xác (đã thử sai ${newAttempts} lần). Hãy xem gợi ý, thử lại hoặc nhấn Xem kết quả / Bỏ qua.`,
          type: "error",
        });
      } else {
        setFeedbackMessage({
          text: `Chưa chính xác, hãy thử lại! (Lần ${newAttempts})`,
          type: "error",
        });
      }

      // Keep focus on input for immediate re-typing
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  };

  /** Apply the grade of a correct typed answer and go to the next card */
  const confirmCorrectAnswer = () => {
    if (pendingRating === null) return;
    handleGrade(pendingRating);
  };

  // User explicitly skips this word
  const handleSkip = () => {
    if (!currentWord || isAdvancing || answerLockedRef.current) return;
    setSessionStats((prev) => ({
      ...prev,
      skippedCount: prev.skippedCount + 1,
    }));
    // User skipped word gets Rating.Again in FSRS
    handleGrade(Rating.Again);
  };

  // User explicitly asks to see result and detailed grammar/example
  const handleShowAnswer = () => {
    if (!currentWord || isAdvancing || answerLockedRef.current) return;
    setHasCheckedAnswer(true);
    setIsFlipped(true);
    setIsCorrect(false);
    setSessionStats((prev) => ({
      ...prev,
      revealedCount: prev.revealedCount + 1,
    }));
    handleSpeak(currentWord.word);
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionCompleted || isAdvancing) return;

      const isInteractiveExercise = [
        "multiple_choice",
        "sentence_builder",
        "context_match",
        "listening",
        "reverse_cloze",
      ].includes(effectiveExerciseType);

      if (isInteractiveExercise) return;

      const isTyping =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Correct answer waiting: Enter (from the input or anywhere) moves to the next card
      if (pendingRating !== null) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmCorrectAnswer();
        }
        return;
      }

      // In Cloze or Spelling mode, if typing into input, Enter submits answer
      if (isTyping) {
        if (e.key === "Enter" && !hasCheckedAnswer) {
          e.preventDefault();
          handleCheckAnswer();
        }
        return;
      }

      // Flip card with Space if in flip mode
      if (effectiveExerciseType === "flip" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped || hasCheckedAnswer) {
        // Grading hotkeys: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy), Enter (Advance with Again).
        // After revealing the answer only Again is allowed; Easy only on recall cards.
        if (e.key === "1" || e.key === "Enter") handleGrade(Rating.Again);
        else if (!revealedWithoutRecall) {
          if (e.key === "2") handleGrade(Rating.Hard);
          else if (e.key === "3") handleGrade(Rating.Good);
          else if (e.key === "4" && currentWord?.direction === "production") handleGrade(Rating.Easy);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFlipped,
    currentIndex,
    sessionCompleted,
    currentWord,
    effectiveExerciseType,
    hasCheckedAnswer,
    userInput,
    isAdvancing,
    wrongAttempts,
    showHint,
    pendingRating,
  ]);

  return {
    revealedWithoutRecall,
    pendingRating,
    confirmCorrectAnswer,
    mode,
    handleModeChange,
    setFallbackMode,
    queue,
    currentIndex,
    currentWord,
    effectiveExerciseType,
    consecutiveCorrect,
    isFlipped,
    setIsFlipped,
    reviewCount,
    sessionCompleted,
    lastResult,
    intervalPreviews,
    userInput,
    setUserInput,
    hasCheckedAnswer,
    isCorrect,
    showHint,
    setShowHint,
    wrongAttempts,
    isShaking,
    feedbackMessage,
    setFeedbackMessage,
    isAdvancing,
    sessionStats,
    lastXPReward,
    showXPPopup,
    xpState,
    inputRef,
    gradeExercise,
    handleGrade,
    handleCheckAnswer,
    handleSkip,
    handleShowAnswer,
  };
}
