import { useState, useEffect, useRef, useMemo } from "react";
import {
  getNextIntervalPreviews,
  Rating,
  type FSRSResult,
  type IntervalPreviews,
} from "@/services/srs";
import { calculateStreakAndGoal } from "@/services/streak";
import { parseTerms, type WordDetail, type ReviewCard } from "@/types/database";
import { isValidEvidence, toCard } from "@/services/cards";
import { isSimpleMode } from "@/services/learnerProfile";
import {
  isLeech,
  isNewCard,
  needsRelearnIntro,
  getXPState,
  selectExerciseType,
  deriveRating,
  matchTypedAnswer,
  formInSentence,
  pickExample,
  prepareContextMatch,
  prepareMeaningMatch,
  loadTypicalResponseTimes,
  freeWritingUsedToday,
  FREE_WRITING_PER_DAY,
  MATURE_STABILITY_DAYS,
  type ExerciseType,
  type XPReward,
  type XPState,
} from "@/services/smartReview";
import {
  cardWithResult,
  getRecentIntros,
  INTRO_MIN_GAP_MS,
  postponeNewCard,
  recordCardAnswer,
  recordIntro,
  markWordKnown,
  schedulingDecision,
  type PracticeReason,
} from "@/services/reviewRecorder";
import { nextWaitingWord } from "@/services/vocabFeed";
import { needsIntro } from "@/services/popupSession";
import { buildPretest, recordPretest, shouldPretest, type PretestResult } from "@/services/pretest";
import { celebrationFor, type Celebration } from "@/services/celebrations";
import { logLearningEvent } from "@/services/learningEvents";
import { checkAndUnlockAchievements, recordFirstTryCorrect } from "@/services/achievements";
import { triggerConfetti } from "@/utils/confetti";
import { handleSpeak } from "@/components/review/speech";

const MAX_REQUEUES_PER_WORD = 2;
const REQUEUE_GAP = 3; // Cards shown before a forgotten word comes back
const INTRO_GAP = 4; // Cards shown between a new word's introduction and its first quiz

/** Index of the first letter that differs (to tell the learner how much of a typed answer was right) */
export function firstMismatchIndex(input: string, target: string): number {
  const a = input.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export type StudyMode =
  | "mixed"
  | "flip"
  | "cloze"
  | "spelling"
  | "multiple_choice"
  | "sentence_builder"
  | "context_match"
  | "meaning_match"
  | "listening"
  | "reverse_cloze"
  | "free_writing"
  | "letter_tiles";

export interface SessionStats {
  /** Words that reached long-term memory in this session */
  masteredWords: string[];
  /** Fading words remembered just in time */
  rescuedCount: number;
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
    // Simple mode: the app always picks the exercise (no mode selector on screen)
    if (isSimpleMode()) return "mixed";
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
  // Cards whose first answer this session was already recorded (retries don't count toward the daily goal)
  const answeredThisSessionRef = useRef<Set<string>>(new Set());
  // When each card's introduction (new word / leech relearn) was shown in this session
  const introducedAtRef = useRef<Map<string, number>>(new Map());
  // The learner typed a synonym of the target before finding it: the exact word needed a cue
  const synonymTriedRef = useRef(false);
  // Why the last answer did not move the schedule (shown as a hint in the UI)
  const [lastPracticeReason, setLastPracticeReason] = useState<PracticeReason | null>(null);
  // Praise for a word reaching long-term memory or remembered just before fading (shown a few seconds)
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
  }, []);
  const answerLockedRef = useRef(false);
  // A finished answer (typed word, or an exercise such as multiple choice) waiting for the learner to
  // continue (Enter / "Tiếp tục"): the card stays on screen so the right answer can be read. The response
  // time is taken when the answer was given, not when the learner continues.
  const [pendingAnswer, setPendingAnswer] = useState<{
    rating: Rating;
    exerciseType?: ExerciseType;
    attempts?: number;
    responseTimeMs: number;
  } | null>(null);
  const pendingRating = pendingAnswer?.rating ?? null;
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
    masteredWords: [],
    rescuedCount: 0,
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
      rememberedWords: collection.filter((w) => (w.srs.state ?? 0) === 2).length,
      masteredWords: collection.filter((w) => (w.srs.state ?? 0) === 2 && (w.srs.stability ?? 0) >= 21).length,
      currentStreak: calculateStreakAndGoal(collection).currentStreak,
      topicMasterCount: Math.max(0, ...masteredByTopic.values()),
    };
  }, [distractorPool, wordsToReview]);
  const currentWord = queue[currentIndex];
  const currentKey = currentWord ? `${currentWord.id}:${currentWord.direction}` : "";

  // Personal response-time thresholds for "slow -> Hard"
  // Introductions shown recently in any window (popup / earlier session): those words go straight to their quiz
  const [introsLoaded, setIntrosLoaded] = useState(false);
  useEffect(() => {
    loadTypicalResponseTimes().catch(() => {});
    getRecentIntros()
      .then((m) => m.forEach((t, k) => introducedAtRef.current.set(k, t)))
      .catch(() => {})
      .finally(() => setIntrosLoaded(true));
  }, []);

  // A new word (or a leech to relearn) is first shown as an introduction card, never quizzed cold.
  // Practice sessions don't introduce: nothing they record touches the schedule.
  const isIntroCard =
    !!currentWord &&
    introsLoaded &&
    !practiceMode &&
    !introducedAtRef.current.has(currentKey) &&
    (needsIntro(currentWord) || needsRelearnIntro(currentWord));

  // Brand-new word: guess its meaning from a sentence before the introduction (practice, never graded)
  const [pretestResults, setPretestResults] = useState<Map<string, PretestResult>>(() => new Map());
  const pretest = useMemo(
    () =>
      isIntroCard && currentWord && shouldPretest(currentWord) && !pretestResults.has(currentKey)
        ? buildPretest(currentWord, distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview)
        : null,
    // Rebuilt per card only, so the options don't reshuffle on every render
    [isIntroCard, currentKey, pretestResults]
  );
  const isPretestCard = !!pretest;
  const pretestResult = pretestResults.get(currentKey) ?? null;
  const handlePretestDone = (result: PretestResult) => {
    if (!currentWord) return;
    setPretestResults((prev) => new Map(prev).set(currentKey, result));
    recordPretest(currentWord, result, "flashcard");
  };

  /**
   * The exercise if it can be built for this card, else a same-direction exercise that always can.
   * Checked here (not only by the exercise's own onFallback) because a fallback requested while the card
   * is being set up is cleared by resetCardState, which left an empty card on screen.
   */
  const playableOrFallback = (type: ExerciseType, card: ReviewCard): ExerciseType => {
    const pool = distractorPool && distractorPool.length >= 4 ? distractorPool : (wordsToReview as WordDetail[]);
    const upcoming = new Set(queue.slice(currentIndex + 1).map((c) => c.id));
    if (type === "cloze" && !pickExample(card)) return "spelling";
    if (type === "reverse_cloze" && !pickExample(card)) return "multiple_choice";
    if (type === "context_match" && prepareContextMatch(card, pool, upcoming).length < 3) return "multiple_choice";
    if (type === "meaning_match" && prepareMeaningMatch(card, pool, upcoming).length < 3) return "multiple_choice";
    return type;
  };

  // Adaptive exercise type calculation
  const effectiveExerciseType: ExerciseType = useMemo(() => {
    if (isIntroCard) return "flip";
    if (fallbackMode) return fallbackMode;
    if (mode !== "mixed") return currentWord ? playableOrFallback(mode as ExerciseType, currentWord) : (mode as ExerciseType);
    if (!currentWord) return "flip";
    // Quiz after the introduction: a cued recognition question
    if (introducedAtRef.current.has(currentKey) && isNewCard(currentWord)) {
      return currentWord.direction === "production" ? (pickExample(currentWord) ? "cloze" : "spelling") : "multiple_choice";
    }
    const picked = selectExerciseType(currentWord);
    // Mature recall cards sometimes get output practice: recall the word and write a sentence with it,
    // graded by the AI (a few per day: each AI check takes seconds)
    if (
      picked === "spelling" &&
      currentWord.direction === "production" &&
      (currentWord.srs.stability ?? 0) >= MATURE_STABILITY_DAYS &&
      freeWritingUsedToday() < FREE_WRITING_PER_DAY &&
      // One mature review in three (deterministic, like selectExerciseType)
      (currentWord.srs.reps ?? 0) % 3 === 0
    ) {
      return "free_writing";
    }
    return playableOrFallback(picked, currentWord);
  }, [mode, currentWord, fallbackMode, isIntroCard, currentKey]);

  /** The card is quizzed right after its introduction: the answer will be practice, graded next time */
  const introAt = currentKey ? introducedAtRef.current.get(currentKey) : undefined;
  const quizRightAfterIntro =
    !!currentWord && !isIntroCard && introAt !== undefined && isNewCard(currentWord) && Date.now() - introAt < INTRO_MIN_GAP_MS;

  /** Whether the current exercise can update this card's schedule (shown before answering) */
  const exerciseCountsForSchedule = !!currentWord && !practiceMode && isValidEvidence(effectiveExerciseType, currentWord.direction);

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
    setPendingAnswer(null);
    synonymTriedRef.current = false;
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

  // Introduction cards show the answer side and read the word aloud. Recall exercises never play the
  // word before the answer: hearing it would turn recall into dictation.
  useEffect(() => {
    if (isIntroCard && currentWord) {
      setIsFlipped(true);
      handleSpeak(currentWord.word);
    }
  }, [currentIndex, isIntroCard]);

  /** The introduction was read: log it and bring the card back for its first quiz a few cards later */
  const handleIntroDone = () => {
    if (!currentWord || gradingLockRef.current) return;
    gradingLockRef.current = true;
    introducedAtRef.current.set(currentKey, Date.now());
    recordIntro(currentWord).catch(() => {});
    const insertAt = Math.min(queue.length, currentIndex + 1 + INTRO_GAP);
    setQueue((prev) => [...prev.slice(0, insertAt), currentWord, ...prev.slice(insertAt)]);
    setCurrentIndex((prev) => prev + 1);
  };

  /** "Đã biết": only for a brand-new word, never for a word being relearned */
  const canMarkKnown =
    isIntroCard && !!currentWord && currentWord.direction === "recognition" && (currentWord.srs.reps ?? 0) === 0;

  /**
   * The learner already knows this new word: it is scheduled as Easy without a quiz (outside the daily
   * budget) and the next waiting word takes its place in the session.
   */
  const handleIntroKnown = async () => {
    if (!currentWord || !canMarkKnown || gradingLockRef.current) return;
    gradingLockRef.current = true;
    const word = currentWord;
    introducedAtRef.current.set(currentKey, Date.now());
    await markWordKnown(word.id).catch(() => false);
    const replacement = await nextWaitingWord(queue.map((c) => c.id)).catch(() => null);
    setQueue((prev) => {
      const rest = prev.filter((c, i) => i <= currentIndex || c.id !== word.id);
      return replacement ? [...rest, toCard(replacement, "recognition")] : rest;
    });
    setCurrentIndex((prev) => prev + 1);
  };

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

  const handleGrade = async (
    requestedRating: Rating,
    overrideExerciseType?: ExerciseType,
    attempts?: number,
    answeredInMs?: number
  ) => {
    // A ref, not state: a second grade queued from a stale render (double Enter, Skip + timer)
    // must not record the card twice or skip the next card
    if (!currentWord || gradingLockRef.current) return;
    gradingLockRef.current = true;
    setIsAdvancing(true);

    // The answer is recorded on this card's own schedule; recognition is capped at Good
    const rating =
      currentWord.direction === "recognition" && requestedRating === Rating.Easy ? Rating.Good : requestedRating;

    const activeExType = overrideExerciseType || effectiveExerciseType;
    const responseTimeMs = answeredInMs ?? Date.now() - cardStartTime.current;
    const wordIsLeech = isLeech(currentWord.srs);
    const attemptCount = attempts ?? wrongAttempts;
    const isFirstTry = attemptCount === 0 && !showHint;
    const cardKey = `${currentWord.id}:${currentWord.direction}`;
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
    setConsecutiveCorrect((prev) => (rating === Rating.Again ? 0 : prev + 1));

    // Only the first answer to a due card, through an exercise that tests this card's direction,
    // moves its schedule. Retries after Again, practice sessions and mismatched exercises are practice.
    const decision = schedulingDecision({
      card: currentWord,
      exerciseType: activeExType,
      practiceMode,
      alreadyGraded: scheduledThisSessionRef.current.has(cardKey),
      introducedAt: introducedAtRef.current.get(cardKey) ?? null,
    });

    try {
      const firstAnswer = !answeredThisSessionRef.current.has(cardKey);
      answeredThisSessionRef.current.add(cardKey);
      const recorded = await recordCardAnswer({
        card: currentWord,
        exerciseType: activeExType,
        rating,
        wrongAttempts: attemptCount,
        responseTimeMs,
        scheduled: decision.scheduled,
        countsForDailyGoal: firstAnswer,
      });
      const result: FSRSResult | null = recorded.result;
      if (decision.scheduled) scheduledThisSessionRef.current.add(cardKey);
      if (decision.reason === "intro_too_recent") {
        // Asked seconds after its introduction: its first graded quiz waits for the next session
        postponeNewCard(currentWord.id, currentWord.direction).catch(() => {});
      }
      setLastPracticeReason(decision.scheduled ? null : decision.reason ?? null);
      const praise = celebrationFor({ ...recorded, direction: currentWord.direction, word: currentWord.word });
      if (praise) {
        setCelebration(praise);
        if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = setTimeout(() => setCelebration(null), praise.kind === "mastered" ? 6000 : 3500);
      }
      if (recorded.mastered || recorded.rescued) {
        setSessionStats((prev) => ({
          ...prev,
          masteredWords: recorded.mastered ? [...prev.masteredWords, currentWord.word] : prev.masteredWords,
          rescuedCount: prev.rescuedCount + (recorded.rescued ? 1 : 0),
        }));
      }
      if (result) setLastResult(result);
      setReviewCount((prev) => prev + 1);

      const xpReward = recorded.xp;
      if (xpReward.totalXP > 0) {
        setLastXPReward(xpReward);
        setShowXPPopup(true);
        setTimeout(() => setShowXPPopup(false), 1500);
        setSessionStats((prev) => ({
          ...prev,
          totalXPEarned: prev.totalXPEarned + xpReward.totalXP,
          leechesSlain: prev.leechesSlain + (wordIsLeech && decision.scheduled && rating >= Rating.Good ? 1 : 0),
        }));
      }
      setXpState(getXPState());

      // Check gamification achievements (scheduled answers only)
      if (decision.scheduled) {
        if (rating >= Rating.Good && attemptCount === 0) recordFirstTryCorrect();
        checkAndUnlockAchievements({
          ...collectionStats,
          consecutiveCorrect: rating >= Rating.Good ? consecutiveCorrect + 1 : 0,
          sessionReviewCount: reviewCount + 1,
          leechesSlain: sessionStats.leechesSlain + (wordIsLeech && rating >= Rating.Good ? 1 : 0),
          responseTimeMs,
          isCorrect: rating >= Rating.Good,
        });
      }

      // In-session relearning: show a forgotten word again a few cards later (max 2 times, practice only)
      let nextQueueLength = queue.length;
      const requeued = requeueCountRef.current.get(currentWord.id) ?? 0;
      if (rating === Rating.Again && requeued < MAX_REQUEUES_PER_WORD) {
        requeueCountRef.current.set(currentWord.id, requeued + 1);
        const updatedWord: ReviewCard =
          result && result.direction === currentWord.direction ? cardWithResult(currentWord, result) : currentWord;
        const insertAt = Math.min(queue.length, currentIndex + 1 + REQUEUE_GAP);
        setQueue((prev) => [...prev.slice(0, insertAt), updatedWord, ...prev.slice(insertAt)]);
        nextQueueLength += 1;
      }

      if (currentIndex + 1 < nextQueueLength) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        triggerConfetti(3000);
        setSessionCompleted(true);
        checkAndUnlockAchievements({ ...collectionStats, sessionCompleted: true });
        logLearningEvent("session_completed", { meta: { cards: reviewCount + 1, practice: practiceMode } });
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

    const clozeSentence = effectiveExerciseType === "cloze" ? pickExample(currentWord)?.sentence_en : undefined;
    // The form the blank needs ("deployed"); any correct form of the word counts as recalled
    const expectedForm = formInSentence(clozeSentence, currentWord.word) ?? currentWord.word;
    const match = matchTypedAnswer(
      userInput,
      currentWord.word,
      clozeSentence,
      (distractorPool ?? wordsToReview).map((w) => w.word)
    );
    const matched = match !== "wrong";

    // A synonym of the target is not a memory failure: the meaning was recalled, the exact word was not.
    // Not counted as a wrong attempt, but the final grade becomes Hard.
    const typed = userInput.trim().toLowerCase();
    if (!matched && parseTerms(currentWord.synonyms).some((t) => t.word.trim().toLowerCase() === typed)) {
      synonymTriedRef.current = true;
      setFeedbackMessage({
        text: `"${userInput.trim()}" là từ đồng nghĩa — đúng nghĩa nhưng cần một từ khác. Thử lại!`,
        type: "info",
      });
      setUserInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    if (matched) {
      // ---------------- CORRECT ----------------
      // Lock the card right away: Enter / Skip / Show answer during the short delay are ignored
      answerLockedRef.current = true;
      setIsCorrect(true);
      const typedForm = userInput.trim().toLowerCase();
      setFeedbackMessage({
        text:
          clozeSentence && typedForm !== expectedForm.toLowerCase()
            ? `Đúng từ rồi! Trong câu này dùng dạng "${expectedForm}". Nhấn Enter hoặc Tiếp tục.`
            : "Chính xác! 🎉 Đọc lại đáp án rồi nhấn Enter hoặc Tiếp tục.",
        type: "success",
      });
      handleSpeak(currentWord.word);

      // FSRS grade: any wrong attempt = Again, hint / typo / very slow = Hard, otherwise Good
      const rating = deriveRating({
        exerciseType: effectiveExerciseType,
        wrongAttempts,
        usedHint: showHint,
        nearMiss: match === "near",
        confusedWithSynonym: synonymTriedRef.current,
        responseTimeMs: Date.now() - cardStartTime.current,
        srs: currentWord.srs,
      });
      if (match === "near") {
        setFeedbackMessage({
          text: `Gần đúng! Từ chính xác là "${expectedForm}" (tính là Khó). Nhấn Enter hoặc Tiếp tục.`,
          type: "info",
        });
      }

      // No auto-advance: the learner reads the answer and continues when ready
      setPendingAnswer({ rating, responseTimeMs: Date.now() - cardStartTime.current });
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
          text: "Chưa đúng. Xem gợi ý rồi thử lại, hoặc xem đáp án: từ này sẽ quay lại sớm để bạn ôn.",
          type: "error",
        });
      } else {
        const right = firstMismatchIndex(userInput, expectedForm);
        setFeedbackMessage({
          text:
            right > 0
              ? `Gần rồi: đúng ${right} chữ cái đầu, xem lại từ chữ thứ ${right + 1} nhé.`
              : "Chưa đúng, thử lại nhé!",
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

  /** Apply the grade of the finished answer and go to the next card */
  const confirmCorrectAnswer = () => {
    if (!pendingAnswer) return;
    handleGrade(pendingAnswer.rating, pendingAnswer.exerciseType, pendingAnswer.attempts, pendingAnswer.responseTimeMs);
  };

  /**
   * An exercise was answered (multiple choice, letter tiles, matching…): keep it on screen with the right
   * answer until the learner continues, instead of jumping to the next card.
   */
  const holdExerciseAnswer = (rating: Rating, exerciseType: ExerciseType, attempts: number) => {
    if (!currentWord || gradingLockRef.current || pendingAnswer) return;
    // Recognition is capped at Good (as when it is recorded), so the "see it again in…" preview is right
    const shown = currentWord.direction === "recognition" && rating === Rating.Easy ? Rating.Good : rating;
    setPendingAnswer({ rating: shown, exerciseType, attempts, responseTimeMs: Date.now() - cardStartTime.current });
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

      // Answer waiting (any exercise): Enter, from the input or anywhere, moves to the next card
      if (pendingAnswer) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmCorrectAnswer();
        }
        return;
      }

      const isInteractiveExercise = [
        "multiple_choice",
        "sentence_builder",
        "context_match",
        "meaning_match",
        "listening",
        "reverse_cloze",
        "free_writing",
        "letter_tiles",
      ].includes(effectiveExerciseType);

      if (isInteractiveExercise) return;

      // Guessing the meaning: the pretest card handles its own keys
      if (isPretestCard) return;

      // Introduction card: Enter / Space continues
      if (isIntroCard) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleIntroDone();
        }
        return;
      }

      const isTyping =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

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
    pendingAnswer,
    isIntroCard,
    isPretestCard,
  ]);

  return {
    revealedWithoutRecall,
    pendingRating,
    confirmCorrectAnswer,
    holdExerciseAnswer,
    mode,
    handleModeChange,
    setFallbackMode,
    queue,
    currentIndex,
    currentWord,
    effectiveExerciseType,
    isIntroCard,
    handleIntroDone,
    canMarkKnown,
    handleIntroKnown,
    pretest,
    isPretestCard,
    pretestResult,
    handlePretestDone,
    exerciseCountsForSchedule,
    quizRightAfterIntro,
    lastPracticeReason,
    celebration,
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
