import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Volume2,
  Clock,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowRight,
  Sparkles,
  HelpCircle,
  GraduationCap,
  BookOpen,
  SkipForward,
} from "lucide-react";
import { getAllWords, isPlaceholderMeaning } from "@/services/db";
import { getDueWords } from "@/services/srs";
import { recordDailyActivity } from "@/services/streak";
import {
  getReminderSettings,
  snoozeReminder,
  hideReviewPopup,
  recordPopupDisplayed,
  type ReminderSettings,
} from "@/services/reminderSettings";
import {
  getGrammarExercisesForReview,
  recordGrammarExerciseAttempt,
  recordPracticeResult,
  MIN_LESSON_ANSWERS,
} from "@/services/grammarService";
import type { WordDetail, ReviewCard } from "@/types/database";
import { practiceCards } from "@/services/cards";
import {
  getRecentIntros,
  postponeNewCard,
  recordCardAnswer,
  recordIntro,
  schedulingDecision,
} from "@/services/reviewRecorder";
import { buildPopupChoices, describeWrongChoice, needsIntro, popupAnswerRating } from "@/services/popupSession";
import { parseTerms } from "@/types/database";
import { summarizeSession, type SessionResult, type SessionSummary } from "@/services/progress";
import { getStoredMnemonic } from "@/services/aiMnemonic";
import { highlightWord } from "@/components/review/highlightWord";
import { getConciseMeaning } from "@/services/meaningText";
import { celebrationFor, type Celebration } from "@/services/celebrations";
import { logLearningEvent } from "@/services/learningEvents";
import { handleSpeak } from "@/components/review/speech";
import PretestCard, { PretestFeedback } from "@/components/review/PretestCard";
import { buildPretest, recordPretest, shouldPretest, type PretestResult } from "@/services/pretest";

/** The end-of-session summary closes the popup by itself after this long (ms) */
const SUMMARY_AUTO_CLOSE_MS = 15000;
/** Keyboard can't dismiss a new word's intro card sooner than this (ms) */
const INTRO_MIN_READ_MS = 800;
/** A wrong popup item comes back at most this many times */
const MAX_POPUP_RETRIES = 2;
import {
  contractionVariants,
  isGrammarAnswerCorrect,
  buildReviewSession,
  getNewCardsIntroducedToday,
  loadTypicalResponseTimes,
  matchTypedAnswer,
  maskAllWordForms,
  needsRelearnIntro,
  pickExample,
  smartSortReviewQueue,
  type ExerciseType,
} from "@/services/smartReview";
import type { GrammarExercise, GrammarLesson } from "@/types/grammar";

interface FocusReviewModalProps {
  onClose?: () => void;
  isPreview?: boolean;
}

interface ChoiceOption {
  id: string;
  word: string;
  isCorrect: boolean;
}

export type FocusReviewItem =
  | { kind: "word"; word: ReviewCard }
  | { kind: "grammar"; exercise: GrammarExercise; lesson: GrammarLesson };

function getPosLabel(pos?: string | null): string | null {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p.includes("verb") || p === "v") return "Động từ (verb)";
  if (p.includes("noun") || p === "n") return "Danh từ (noun)";
  if (p.includes("adj") || p === "a") return "Tính từ (adj)";
  if (p.includes("adv")) return "Trạng từ (adv)";
  if (p.includes("idiom") || p.includes("phrase")) return "Cụm từ / Thành ngữ";
  return pos;
}

/** Shown after an answer: the user reads the feedback and moves on themselves */
const NEXT_HINT = "Nhấn Enter hoặc Tiếp tục để sang câu sau.";

/**
 * Correct answer(s) for display, with equivalent contracted/full forms,
 * e.g. "does not" / "doesn't".
 */
function formatAnswerForms(ex: GrammarExercise): string {
  const answers = Array.isArray(ex.correctAnswer) ? ex.correctAnswer : [ex.correctAnswer || ex.errorWord || ""];
  const forms: string[] = [];
  for (const answer of answers.filter(Boolean)) {
    for (const form of [answer, ...contractionVariants(answer)]) {
      if (!forms.some((f) => f.toLowerCase() === form.toLowerCase())) forms.push(form);
    }
  }
  return forms.map((f) => `"${f}"`).join(" / ");
}

/**
 * Tạo câu tiếng Anh hoàn chỉnh khi điền đáp án bài tập ngữ pháp
 */
function getGrammarFullCompletedSentence(ex: GrammarExercise): string {
  const ans = Array.isArray(ex.correctAnswer)
    ? ex.correctAnswer[0]
    : ex.correctAnswer || ex.errorWord || "";
  if (!ans) return ex.promptEn;

  if (ex.promptEn.includes("_____")) {
    return ex.promptEn.replace(/_____(\s*\([a-z\s]+\))?/gi, ans);
  }
  if (/\[[^\]]+\]/.test(ex.promptEn)) {
    return ex.promptEn.replace(/\[[^\]]+\]/g, ans);
  }
  return `${ex.promptEn} (${ans})`;
}

export default function FocusReviewModal({ onClose, isPreview = false }: FocusReviewModalProps) {
  const [settings, setSettings] = useState<ReminderSettings>(getReminderSettings());
  const [queue, setQueue] = useState<FocusReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Active question mode: multiple_choice (phím 1-4) or typing (nhập đáp án)
  const [activeMode, setActiveMode] = useState<"multiple_choice" | "typing">("multiple_choice");

  // Multiple choice state
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Typing mode state
  const [typedInput, setTypedInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Auto-advance timer ref for proper cleanup
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentItem = queue[currentIndex];

  // Shake hint on outside click (class toggle keeps the card mounted, so input focus/state survive)
  const [isNudging, setIsNudging] = useState(false);
  // Entry zoom plays once; afterwards removing the shake class must not replay it
  const [hasEntered, setHasEntered] = useState(false);
  const entryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playEntryAnimation = () => {
    if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
    setHasEntered(false);
    entryTimerRef.current = setTimeout(() => setHasEntered(true), 320);
  };
  useEffect(() => {
    playEntryAnimation();
    return () => {
      if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
    };
  }, []);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeCard = () => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    setIsNudging(false);
    requestAnimationFrame(() => setIsNudging(true));
    nudgeTimerRef.current = setTimeout(() => setIsNudging(false), 400);
  };
  useEffect(() => () => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
  }, []);
  const itemStartRef = useRef<number>(Date.now());
  useEffect(() => {
    itemStartRef.current = Date.now();
  }, [currentIndex, queue.length]);

  // Cards already recorded in FSRS during this popup session, and retry counts of wrong items
  const scheduledThisSessionRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef<Map<string, number>>(new Map());

  /** Put a wrong item back at the end of the queue (at most MAX_POPUP_RETRIES times) */
  const requeueItem = (item: FocusReviewItem) => {
    const key = item.kind === "word" ? `w:${item.word.id}:${item.word.direction}` : `g:${item.exercise.id}`;
    const count = retryCountRef.current.get(key) ?? 0;
    if (count >= MAX_POPUP_RETRIES) return;
    retryCountRef.current.set(key, count + 1);
    setQueue((prev) => [...prev, item]);
  };

  // First answer of each item in this session, for the end-of-session summary
  const sessionResultsRef = useRef<Map<string, SessionResult>>(new Map());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  // For the habit log: is a session open, and did it reach its summary
  const sessionOpenRef = useRef(false);
  const summaryShownRef = useRef(false);
  useEffect(() => {
    if (summary) {
      summaryShownRef.current = true;
      sessionOpenRef.current = false;
    }
  }, [summary]);
  // Words of the deck, to explain which word a wrong option was
  const allWordsRef = useRef<WordDetail[]>([]);

  /**
   * Note the first answer to an item. Only first answers count toward the daily goal, so retrying
   * a missed item does not inflate it. Returns whether this was the first answer.
   */
  const noteFirstAnswer = (
    key: string,
    label: string,
    correct: boolean,
    nextReview: string | null,
    milestone: SessionResult["milestone"] = null
  ): boolean => {
    if (sessionResultsRef.current.has(key)) return false;
    sessionResultsRef.current.set(key, { key, label, correct, nextReview, milestone });
    recordDailyActivity(1);
    return true;
  };

  // First answers per grammar lesson in this session: the lesson is graded once it has
  // MIN_LESSON_ANSWERS of them (one question alone is too little to reschedule a grammar point)
  const lessonAnswersRef = useRef<Map<string, { correct: number; total: number }>>(new Map());
  const gradeGrammarAnswer = async (lessonId: string, correct: boolean, isFirstAnswer: boolean) => {
    if (!isFirstAnswer) return;
    const entry = lessonAnswersRef.current.get(lessonId) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (correct) entry.correct += 1;
    lessonAnswersRef.current.set(lessonId, entry);
    if (entry.total === MIN_LESSON_ANSWERS) {
      await recordPracticeResult(lessonId, Math.round((entry.correct / entry.total) * 100));
    }
  };

  // When each card's introduction was shown (this session, or a recent popup / flashcard session)
  const introducedAtRef = useRef<Map<string, number>>(new Map());
  // The learner typed a synonym of the target first: the exact word needed a cue (graded Hard)
  const synonymTriedRef = useRef(false);

  // Same rules as flashcard sessions (see schedulingDecision): only the first answer to a due card moves
  // its schedule; retries, extra (not due) words and quizzes seconds after an introduction are practice.
  const gradeWord = async (
    word: ReviewCard,
    correct: boolean,
    exerciseType: ExerciseType,
    nearMiss = false
  ): Promise<Celebration | null> => {
    const responseTimeMs = Date.now() - itemStartRef.current;
    const rating = popupAnswerRating(correct, exerciseType, responseTimeMs, nearMiss, synonymTriedRef.current);
    const cardKey = `${word.id}:${word.direction}`;
    const decision = schedulingDecision({
      card: word,
      exerciseType,
      alreadyGraded: scheduledThisSessionRef.current.has(cardKey),
      introducedAt: introducedAtRef.current.get(cardKey) ?? null,
    });
    if (decision.scheduled) scheduledThisSessionRef.current.add(cardKey);
    const recorded = await recordCardAnswer({
      card: word,
      exerciseType,
      rating,
      wrongAttempts: correct ? 0 : 1,
      responseTimeMs,
      scheduled: decision.scheduled,
      countsForDailyGoal: false, // noteFirstAnswer counts the first answer of each item
    });
    let nextReview = recorded.result?.nextReviewDate ?? null;
    if (decision.reason === "intro_too_recent") {
      // Quizzed right after its introduction: the first graded review comes in a later session
      nextReview = await postponeNewCard(word.id, word.direction).catch(() => null);
    }
    const praise = celebrationFor({ ...recorded, direction: word.direction, word: word.word });
    noteFirstAnswer(`w:${cardKey}`, word.word, correct, nextReview, praise?.kind ?? null);
    return praise;
  };
  const praiseText = (p: Celebration | null) => (p ? `${p.title} ${p.detail} ` : "");
  const currentWord = currentItem?.kind === "word" ? currentItem.word : null;

  // New words get an introduction card before their first question (once per popup session)
  const [introduced, setIntroduced] = useState<Set<string>>(() => new Set());
  const introKey = currentWord ? `${currentWord.id}:${currentWord.direction}` : "";
  const showIntro =
    !!currentWord &&
    (needsIntro(currentWord) || needsRelearnIntro(currentWord)) &&
    !introduced.has(introKey) &&
    !introducedAtRef.current.has(introKey) &&
    !isAnswered;
  // Enter pressed again right after "Tiếp tục" (key held or double press) must not skip the intro
  const introShownAtRef = useRef(0);

  // Brand-new word: guess its meaning from a sentence before the introduction (practice, never graded)
  const [pretestResults, setPretestResults] = useState<Map<string, PretestResult>>(() => new Map());
  const pretest = useMemo(
    () =>
      showIntro && currentWord && shouldPretest(currentWord) && !pretestResults.has(introKey)
        ? buildPretest(currentWord, allWordsRef.current)
        : null,
    // Rebuilt per card only, so the options don't reshuffle on every render
    [showIntro, introKey, pretestResults]
  );
  const pretestResult = pretestResults.get(introKey) ?? null;
  const handlePretestDone = useCallback(
    (result: PretestResult) => {
      if (!currentWord) return;
      setPretestResults((prev) => new Map(prev).set(introKey, result));
      recordPretest(currentWord, result, "popup");
    },
    [currentWord, introKey]
  );

  // The reading time of the intro starts when it appears (after the guess, if any)
  useEffect(() => {
    if (showIntro && !pretest) introShownAtRef.current = Date.now();
  }, [showIntro, introKey, !!pretest]);
  const finishIntro = useCallback(() => {
    if (!currentWord) return;
    setIntroduced((prev) => new Set(prev).add(introKey));
    introducedAtRef.current.set(introKey, Date.now());
    recordIntro(currentWord).catch(() => {});
    // Quiz the new word after the other items when there are any: answering seconds after reading it is
    // short-term memory. (If it is still asked too soon, the answer is practice and the word comes back.)
    if (currentIndex + 1 < queue.length) {
      setQueue((prev) => [...prev.slice(0, currentIndex), ...prev.slice(currentIndex + 1), prev[currentIndex]]);
    }
    // The answer time starts when the question appears, not when the intro did
    itemStartRef.current = Date.now();
  }, [introKey, currentWord, currentIndex, queue.length]);
  const currentGrammar = currentItem?.kind === "grammar" ? currentItem : null;

  const handleClose = useCallback(async () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    // Closed before the end of the session (the summary was not reached)
    if (!summaryShownRef.current && sessionOpenRef.current) {
      logLearningEvent("popup_closed_early", { meta: { answered: sessionResultsRef.current.size } });
    }
    sessionOpenRef.current = false;
    if (onClose) onClose();
    if (!isPreview) {
      await hideReviewPopup();
    }
  }, [onClose, isPreview]);

  const handleSnooze = useCallback(async (minutes?: number) => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    const mins = snoozeReminder(minutes);
    logLearningEvent("popup_snoozed", { meta: { minutes: mins, answered: sessionResultsRef.current.size } });
    sessionOpenRef.current = false;
    setFeedbackMsg(`Đã hoãn nhắc nhở trong ${mins} phút.`);
    setTimeout(async () => {
      await handleClose();
    }, 600);
  }, [handleClose]);

  // Index already advanced from: a second Enter handled by a stale render (double press) must not
  // skip the next item
  const advancedFromRef = useRef(-1);

  // Advance to next item in queue or conclude session
  const advanceNextItem = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (advancedFromRef.current === currentIndex) return;
    advancedFromRef.current = currentIndex;
    if (currentIndex + 1 < queue.length) {
      // Reset in the same render as the index change: otherwise the next item is briefly
      // "answered" and a quick second Enter would skip it
      setIsAnswered(false);
      setSelectedChoiceId(null);
      setIsCorrect(false);
      setTypedInput("");
      setFeedbackMsg(null);
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Completed all items: show what was learned (closes by itself if left alone)
      const results = Array.from(sessionResultsRef.current.values());
      setSummary(summarizeSession(results));
      logLearningEvent("popup_completed", {
        meta: { items: results.length, correct: results.filter((r) => r.correct).length, mastered: results.filter((r) => r.milestone === "mastered").length },
      });
      advanceTimerRef.current = setTimeout(() => {
        handleClose();
      }, SUMMARY_AUTO_CLOSE_MS);
    }
  }, [currentIndex, queue.length, handleClose]);

  // Load review queue: song song từ vựng và ngữ pháp theo thuật toán Spaced Repetition & Interleaving
  const loadReviewQueue = async (forceSpinner = true) => {
    if (forceSpinner) setLoading(true);
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    try {
      const currentSettings = getReminderSettings();
      setSettings(currentSettings);

      const targetCount = Math.max(3, currentSettings.wordsPerSession || 3);
      const includeGrammar = currentSettings.includeGrammar ?? true;
      const grammarLevels = currentSettings.grammarLevels || ["A1", "A2", "B1"];

      // 1. Phân bổ chỉ tiêu số lượng (Interleaving Quota)
      // Ví dụ: phiên 3 câu -> 2 từ + 1 ngữ pháp
      //        phiên 5 câu -> 3 từ + 2 ngữ pháp
      //        phiên 10 câu -> 6 từ + 4 ngữ pháp
      let grammarTarget = 0;
      let wordTarget = targetCount;

      if (includeGrammar) {
        // An even number: grammar comes in pairs from one lesson (2 answers before the lesson is graded)
        grammarTarget = Math.max(2, 2 * Math.round((targetCount * 0.4) / 2));
        wordTarget = Math.max(1, targetCount - grammarTarget);
      }

      // 2. Nạp dữ liệu đồng thời từ database & grammar service
      const [dueWordsRaw, allWordsRaw, grammarCandidates] = await Promise.all([
        getDueWords().catch(() => [] as WordDetail[]),
        getAllWords().catch(() => [] as WordDetail[]),
        includeGrammar
          ? getGrammarExercisesForReview(grammarLevels, grammarTarget + 4).catch(() => [])
          : Promise.resolve([]),
      ]);

      // Words still waiting for AI analysis have no real meaning to quiz on
      const dueWords = dueWordsRaw.filter((w) => !isPlaceholderMeaning(w.meaning_vn));
      const allWords = allWordsRaw.filter((w) => !isPlaceholderMeaning(w.meaning_vn));

      // 3. Tuyển chọn từ vựng ưu tiên SRS (due words)
      let wordPool: WordDetail[] = [];
      if (currentSettings.triggerCondition === "due_only") {
        wordPool = dueWords;
      } else {
        wordPool = dueWords.length > 0 ? dueWords : allWords;
      }
      if (wordPool.length === 0) {
        wordPool = allWords;
      }

      // Due words: FSRS urgency order + daily new-card budget. Otherwise: weakest words first (practice only).
      let selectedWords: ReviewCard[] = [];
      if (wordPool === dueWords) {
        const newToday = await getNewCardsIntroducedToday().catch(() => 0);
        selectedWords = buildReviewSession(dueWords, newToday).slice(0, wordTarget);
      } else {
        selectedWords = practiceCards(smartSortReviewQueue(wordPool).slice(0, wordTarget));
      }

      // Bổ sung thêm từ nếu chưa đủ wordTarget
      if (selectedWords.length < wordTarget && allWords.length > selectedWords.length) {
        const selectedIds = new Set(selectedWords.map((w) => w.id));
        // Never fill with brand-new words: that would bypass the daily new-card limit
        const extra = allWords
          .filter((w) => !selectedIds.has(w.id) && (w.srs.reps ?? 0) > 0)
          .sort(() => 0.5 - Math.random());
        selectedWords = [...selectedWords, ...practiceCards(extra.slice(0, wordTarget - selectedWords.length))];
      }

      // 4. Tuyển chọn bài tập ngữ pháp
      const selectedGrammar = grammarCandidates.slice(0, grammarTarget);

      // Dự phòng: Nếu kho từ vựng trống (0 từ), bù bằng bài tập ngữ pháp để người dùng vẫn học được
      if (selectedWords.length === 0 && selectedGrammar.length < targetCount) {
        const moreGrammar = await getGrammarExercisesForReview(grammarLevels, targetCount).catch(() => []);
        selectedGrammar.push(...moreGrammar.slice(selectedGrammar.length, targetCount));
      }

      // 5. Xen kẽ (Interleaving) Từ vựng và Ngữ pháp để tối ưu hóa khả năng ghi nhớ dài hạn
      const wordQueue: FocusReviewItem[] = selectedWords.map((w) => ({ kind: "word", word: w }));
      const grammarQueue: FocusReviewItem[] = selectedGrammar.map((g) => ({
        kind: "grammar",
        exercise: g.exercise,
        lesson: g.lesson,
      }));

      const finalQueue: FocusReviewItem[] = [];
      let wIdx = 0;
      let gIdx = 0;

      while (wIdx < wordQueue.length || gIdx < grammarQueue.length) {
        if (wIdx < wordQueue.length) {
          finalQueue.push(wordQueue[wIdx++]);
        }
        if (wIdx < wordQueue.length && (grammarQueue.length === 0 || wordQueue.length > grammarQueue.length * 1.5)) {
          finalQueue.push(wordQueue[wIdx++]);
        }
        if (gIdx < grammarQueue.length) {
          finalQueue.push(grammarQueue[gIdx++]);
        }
      }

      // New popup session: forget which cards were graded / retried in the previous one.
      // Introductions shown in the last day (any window) are remembered, so a new word is not
      // introduced again before its first graded quiz.
      introducedAtRef.current = await getRecentIntros().catch(() => new Map<string, number>());
      loadTypicalResponseTimes().catch(() => {});
      scheduledThisSessionRef.current = new Set();
      lessonAnswersRef.current = new Map();
      retryCountRef.current = new Map();
      setIntroduced(new Set());
      advancedFromRef.current = -1;
      sessionResultsRef.current = new Map();
      allWordsRef.current = allWords;
      setSummary(null);
      setQueue(finalQueue);
      setCurrentIndex(0);
      summaryShownRef.current = false;
      sessionOpenRef.current = finalQueue.length > 0;
      if (finalQueue.length > 0) logLearningEvent("popup_shown", { meta: { items: finalQueue.length } });
      setIsAnswered(false);
      setSelectedChoiceId(null);
      setIsCorrect(false);
      setTypedInput("");
      setFeedbackMsg(null);
    } catch (err) {
      console.error("Failed to load review queue for modal:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recordPopupDisplayed(Date.now());
    loadReviewQueue(true);

    let unlistenFn: (() => void) | null = null;
    let isCancelled = false;

    // Lắng nghe sự kiện mở popup từ Tauri backend
    listen("review-popup-opened", () => {
      if (isCancelled) return;
      recordPopupDisplayed(Date.now());
      playEntryAnimation();
      loadReviewQueue(false);
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenFn = fn;
      })
      .catch((err) => {
        console.warn("Could not attach review-popup-opened listener:", err);
      });

    // In-app fallback preview event listener
    const onPreviewOpened = () => {
      recordPopupDisplayed(Date.now());
      loadReviewQueue(false);
    };
    window.addEventListener("open-review-popup-preview", onPreviewOpened);

    return () => {
      isCancelled = true;
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (unlistenFn) unlistenFn();
      window.removeEventListener("open-review-popup-preview", onPreviewOpened);
    };
  }, []);

  // Khi item thay đổi: thiết lập chế độ câu hỏi, reset trạng thái, nạp lựa chọn trắc nghiệm
  useEffect(() => {
    if (!currentItem) return;

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    setIsAnswered(false);
    setSelectedChoiceId(null);
    setIsCorrect(false);
    setTypedInput("");
    setFeedbackMsg(null);
    synonymTriedRef.current = false;
    // Never show (or let keys 1-4 pick) the previous item's options
    setChoices([]);
    let cancelled = false;

    if (currentItem.kind === "word") {
      const wordObj = currentItem.word;
      // The card decides the question: recall cards are typed, recognition cards are picked among options
      setActiveMode(wordObj.direction === "production" ? "typing" : "multiple_choice");

      // 4 English options; the deck was already loaded with the queue
      const pool = allWordsRef.current.length > 0 ? Promise.resolve(allWordsRef.current) : getAllWords();
      pool.then((all) => {
        if (cancelled) return;
        setChoices(buildPopupChoices(wordObj, all.filter((w) => !isPlaceholderMeaning(w.meaning_vn))));
      });
    } else {
      // Bài tập ngữ pháp
      const ex = currentItem.exercise;
      if (ex.options && ex.options.length > 0) {
        setActiveMode("multiple_choice");
        const allChoices: ChoiceOption[] = ex.options.map((opt, idx) => ({
          id: `grammar-opt-${idx}-${opt}`,
          word: opt,
          isCorrect: isGrammarAnswerCorrect(opt, ex),
        }));
        setChoices(allChoices);
      } else {
        // Dạng câu hỏi không có options (chia động từ / viết câu) -> gõ nhập liệu
        setActiveMode("typing");
        setChoices([]);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [currentIndex, currentItem]);

  // Focus ô input khi ở chế độ gõ
  useEffect(() => {
    if (activeMode === "typing" && !isAnswered) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [activeMode, currentIndex, isAnswered]);

  // Phát âm khi người dùng chủ động bấm loa (KHÔNG tự động phát khi mở popup)
  const handleManualSpeak = () => {
    if (!currentItem) return;
    const textToSpeak =
      currentItem.kind === "word"
        ? currentItem.word.word
        : isAnswered
        ? getGrammarFullCompletedSentence(currentItem.exercise)
        : currentItem.exercise.promptEn.replace(/\[([^\]]+)\]/g, "$1").replace(/_____/g, "");
    handleSpeak(textToSpeak);
  };


  // Xử lý nộp đáp án dạng trắc nghiệm (phím 1-4)
  const handleSelectChoice = async (choice: ChoiceOption) => {
    if (isAnswered || !currentItem) return;

    setSelectedChoiceId(choice.id);
    setIsAnswered(true);
    const correct = choice.isCorrect;
    setIsCorrect(correct);

    try {
      if (currentItem.kind === "word") {
        const wordObj = currentItem.word;
        if (correct) {
          const praise = await gradeWord(wordObj, true, "multiple_choice");
          setFeedbackMsg(praise ? `${praiseText(praise)}${NEXT_HINT}` : `Chính xác! ${NEXT_HINT}`);
        } else {
          await gradeWord(wordObj, false, "multiple_choice");
          setFeedbackMsg(`Chưa chính xác! Từ đúng là: "${wordObj.word}"`);
          // Cải tiến: Đẩy câu trả lời sai vào cuối hàng đợi để củng cố ngay
          requeueItem(currentItem);
        }
      } else {
        // Xử lý bài tập ngữ pháp
        const ex = currentItem.exercise;
        const lesson = currentItem.lesson;

        const first = noteFirstAnswer(`g:${ex.id}`, lesson.title, correct, null);
        recordGrammarExerciseAttempt(ex.id, correct);
        await gradeGrammarAnswer(lesson.id, correct, first);
        if (correct) {
          setFeedbackMsg(`Chính xác! Đáp án: ${formatAnswerForms(ex)}. ${NEXT_HINT}`);
        } else {
          setFeedbackMsg(`Chưa chính xác! Đáp án đúng là: ${formatAnswerForms(ex)}`);
          // Đẩy bài tập sai vào cuối hàng đợi
          requeueItem(currentItem);
        }
      }
    } catch (err) {
      console.warn("Failed to record review from popup:", err);
    }
  };

  // Xử lý nộp đáp án dạng gõ (Typing)
  const handleTypingSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentItem) return;

    if (currentItem.kind === "word") {
      const wordObj = currentItem.word;
      const match = matchTypedAnswer(typedInput, wordObj.word, pickExample(wordObj)?.sentence_en);
      const correct = match !== "wrong";
      const typed = typedInput.trim().toLowerCase();
      if (!correct && parseTerms(wordObj.synonyms).some((t) => t.word.trim().toLowerCase() === typed)) {
        // A synonym: the meaning was recalled, not the exact word. No penalty, but the grade becomes Hard.
        synonymTriedRef.current = true;
        setFeedbackMsg(`"${typedInput.trim()}" là từ đồng nghĩa — đúng nghĩa nhưng cần một từ khác. Thử lại!`);
        setTypedInput("");
        return;
      }

      setIsAnswered(true);
      setIsCorrect(correct);

      try {
        if (correct) {
          const praise = await gradeWord(wordObj, true, "spelling", match === "near");
          setFeedbackMsg(
            match === "near"
              ? `Gần đúng! Từ chính xác là "${wordObj.word}" ✍️ ${praiseText(praise)}${NEXT_HINT}`
              : `${praise ? praiseText(praise) : "Tuyệt vời! Bạn đã gõ chính xác 🚀 "}${NEXT_HINT}`
          );
        } else {
          await gradeWord(wordObj, false, "spelling");
          setFeedbackMsg(`Chưa chính xác. Đáp án đúng là: "${wordObj.word}"`);
          requeueItem(currentItem);
        }
      } catch (err) {
        console.warn("Failed to record typing review:", err);
      }
    } else {
      // Gõ đáp án ngữ pháp (chia động từ / điền từ)
      const ex = currentItem.exercise;
      const lesson = currentItem.lesson;
      const correct = isGrammarAnswerCorrect(typedInput, ex);

      setIsAnswered(true);
      setIsCorrect(correct);

      try {
        const first = noteFirstAnswer(`g:${ex.id}`, lesson.title, correct, null);
        recordGrammarExerciseAttempt(ex.id, correct);
        await gradeGrammarAnswer(lesson.id, correct, first);
        if (correct) {
          setFeedbackMsg(`Chính xác! Đáp án: ${formatAnswerForms(ex)}. ${NEXT_HINT}`);
        } else {
          setFeedbackMsg(`Chưa chính xác. Đáp án đúng là: ${formatAnswerForms(ex)}`);
          requeueItem(currentItem);
        }
      } catch (err) {
        console.warn("Failed to record grammar typing review:", err);
      }
    }
  };

  // Xử lý khi user chọn bỏ qua bài tập ngữ pháp
  const handleSkipGrammar = async () => {
    if (isAnswered || !currentItem || currentItem.kind === "word") return;
    const ex = currentItem.exercise;
    const lesson = currentItem.lesson;

    setIsAnswered(true);
    setIsCorrect(false);

    try {
      const first = noteFirstAnswer(`g:${ex.id}`, lesson.title, false, null);
      recordGrammarExerciseAttempt(ex.id, false, true);
      await gradeGrammarAnswer(lesson.id, false, first);
      setFeedbackMsg(`Bạn đã bỏ qua câu này. Đáp án đúng là: ${formatAnswerForms(ex)}`);
      requeueItem(currentItem);
    } catch (err) {
      console.warn("Failed to record grammar skip:", err);
    }
  };

  // Keyboard navigation: Esc đóng, 1-4 chọn trắc nghiệm, S hoãn, Enter/Space chuyển câu
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (summary) {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
          e.preventDefault();
          handleClose();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      // Guessing the meaning: the pretest card handles its own keys
      if (pretest) return;

      if (showIntro) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!e.repeat && Date.now() - introShownAtRef.current >= INTRO_MIN_READ_MS) finishIntro();
          return;
        }
        if (e.key !== "s" && e.key !== "S") return;
      }

      if (
        (e.key === "s" || e.key === "S") &&
        activeMode !== "typing" &&
        !isAnswered
      ) {
        e.preventDefault();
        handleSnooze();
        return;
      }

      if (["1", "2", "3", "4"].includes(e.key)) {
        const num = parseInt(e.key, 10);
        if (activeMode === "multiple_choice" && !isAnswered && choices.length >= num) {
          e.preventDefault();
          handleSelectChoice(choices[num - 1]);
        }
      }

      if ((e.key === "Enter" || e.key === " ") && isAnswered) {
        e.preventDefault();
        advanceNextItem();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleClose,
    handleSnooze,
    isAnswered,
    choices,
    activeMode,
    currentIndex,
    queue.length,
    advanceNextItem,
    showIntro,
    finishIntro,
    summary,
    pretest,
  ]);

  const overlayStyle = useMemo(() => {
    switch (settings.blurOverlay) {
      case "heavy":
        return { backgroundColor: "rgba(0, 0, 0, 0.85)" };
      case "light":
        return { backgroundColor: "rgba(0, 0, 0, 0.48)" };
      case "medium":
      default:
        return { backgroundColor: "rgba(0, 0, 0, 0.68)" };
    }
  }, [settings.blurOverlay]);

  // Từ vựng: Nghĩa tiếng Việt & ví dụ ẩn từ
  const conciseMeaning = useMemo(() => {
    if (!currentWord) return "";
    return getConciseMeaning(currentWord.meaning_vn, currentWord.word);
  }, [currentWord]);

  const primaryExample = currentWord ? pickExample(currentWord) : undefined;
  const maskedSentence = useMemo(() => {
    if (!primaryExample?.sentence_en || !currentWord?.word) return null;
    // Every form of the word is blanked (a second occurrence would reveal the answer)
    return maskAllWordForms(primaryExample.sentence_en, currentWord.word);
  }, [primaryExample, currentWord]);

  // After a wrong answer: which word was picked instead, and the stored memory hook if any
  const wrongPick = useMemo(
    () =>
      isAnswered && !isCorrect && activeMode === "multiple_choice"
        ? describeWrongChoice(selectedChoiceId, allWordsRef.current)
        : null,
    [isAnswered, isCorrect, activeMode, selectedChoiceId]
  );
  const mnemonic = useMemo(
    () => (isAnswered && !isCorrect && currentWord ? getStoredMnemonic(currentWord.id, currentWord.meaning_vn) : null),
    [isAnswered, isCorrect, currentWord]
  );

  const posLabel = useMemo(() => {
    return getPosLabel(currentWord?.part_of_speech);
  }, [currentWord]);

  // Ngữ pháp: Câu hoàn chỉnh
  const grammarFullSentence = useMemo(() => {
    if (!currentGrammar) return "";
    return getGrammarFullCompletedSentence(currentGrammar.exercise);
  }, [currentGrammar]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none ${
        hasEntered ? "" : "popup-backdrop-enter"
      }`}
      style={overlayStyle}
      onClick={(e) => {
        // Clicking outside never dismisses the review: only Close, Snooze or finishing the session do.
        // Shake the card as a hint instead.
        if (e.target === e.currentTarget) nudgeCard();
      }}
    >
      <div
        className={`w-full max-w-xl min-h-[500px] bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col justify-between ${
          isNudging ? "animate-shake" : hasEntered ? "" : "popup-card-enter"
        }`}
      >
        {/* Top Header Bar */}
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-xl text-white shadow-sm ${
                currentGrammar
                  ? "bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-violet-500/30"
                  : "bg-gradient-to-tr from-cyan-500 to-indigo-500 shadow-cyan-500/30"
              }`}
            >
              {currentGrammar ? (
                <GraduationCap className="w-4 h-4 fill-white" />
              ) : (
                <Zap className="w-4 h-4 fill-white" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  {currentGrammar ? "Grammar-Quiz" : "Flash-Quiz"}
                </span>

                {queue.length > 0 && currentItem && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold border border-slate-200 dark:border-zinc-700">
                    Câu {currentIndex + 1} / {queue.length}
                  </span>
                )}

                {/* Tag phân biệt Từ vựng vs Ngữ pháp */}
                {currentWord && (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      new Date(currentWord.srs.next_review_date) <= new Date()
                        ? "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800"
                        : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                    }`}
                  >
                    {needsIntro(currentWord)
                      ? "Từ vựng · Từ mới"
                      : new Date(currentWord.srs.next_review_date) <= new Date()
                      ? "Từ vựng · Đến hạn ôn"
                      : "Từ vựng · Củng cố"}
                    {currentWord.direction === "production" ? " · Nhớ lại" : " · Nhận diện"}
                  </span>
                )}

                {currentGrammar && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800 flex items-center gap-1">
                    <span>Ngữ pháp · {currentGrammar.lesson.level}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Snooze Button */}
            <button
              onClick={() => handleSnooze()}
              title={`Hoãn nhắc nhở ${settings.snoozeMinutes} phút (Phím S)`}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Hoãn</span>
              <span>{settings.snoozeMinutes}p</span>
            </button>

            {/* Quick Close Button (Esc) */}
            <button
              onClick={handleClose}
              title="Đóng cửa sổ (Phím Esc)"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                Đang chuẩn bị câu hỏi ôn tập song song...
              </p>
            </div>
          ) : summary ? (
            <div className="py-4 space-y-4">
              <div className="text-center space-y-1.5">
                <CheckCircle2 className="w-11 h-11 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Hoàn thành phiên ôn tập!</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Đúng ngay lần đầu <span className="font-bold text-slate-800 dark:text-zinc-200">{summary.correct}/{summary.total}</span> câu
                </p>
              </div>
              {summary.items.length > 0 && (
                <ul className="rounded-2xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                  {summary.items.map((it) => (
                    <li key={it.key} className="px-3.5 py-2 flex items-center gap-2.5">
                      {it.correct ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate flex-1">{it.label}</span>
                      {it.milestone === "mastered" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">
                          🎉 Nhớ dài hạn
                        </span>
                      )}
                      {it.milestone === "rescued" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-semibold shrink-0">
                          🧠 Cứu kịp
                        </span>
                      )}
                      {it.again && (
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400 shrink-0">Gặp lại sau {it.again}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-2"
              >
                Đóng
                <kbd className="px-1.5 py-0.5 bg-white/20 dark:bg-black/20 rounded text-[10px] font-mono">Enter</kbd>
              </button>
            </div>
          ) : !currentItem ? (
            <div className="py-10 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Chưa có câu hỏi ôn tập phù hợp!
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                Hãy thêm từ vựng mới hoặc kiểm tra cấu hình cấp độ ôn tập ngữ pháp trong phần Cài đặt nhé.
              </p>
              <button
                onClick={handleClose}
                className="mt-2 px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
              >
                Đóng lại
              </button>
            </div>
          ) : currentItem.kind === "word" && showIntro && currentWord && pretest ? (
            /* Từ mới: đoán nghĩa từ ngữ cảnh trước khi xem */
            <PretestCard question={pretest} phonetic={currentWord.phonetic} onDone={handlePretestDone} />
          ) : currentItem.kind === "word" && showIntro && currentWord ? (
            /* Từ mới: giới thiệu từ trước khi hỏi */
            <div className="space-y-4">
              {pretestResult && <PretestFeedback result={pretestResult} />}
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-amber-600 dark:text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Từ mới · Đọc kỹ rồi trả lời câu hỏi</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                      {currentWord.word}
                    </span>
                    {currentWord.phonetic && (
                      <span className="font-mono text-cyan-600 dark:text-cyan-400 text-sm">{currentWord.phonetic}</span>
                    )}
                    {posLabel && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-semibold text-[11px]">
                        {posLabel}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleManualSpeak}
                    title="Nghe phát âm"
                    aria-label="Nghe phát âm"
                    className="p-2 rounded-full text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-base font-semibold text-slate-800 dark:text-zinc-100 leading-snug">
                  {conciseMeaning || currentWord.meaning_vn}
                </p>
                {primaryExample?.sentence_en && (
                  <div className="text-sm text-slate-700 dark:text-zinc-300 pl-3 border-l-2 border-cyan-500/60 space-y-0.5">
                    <p className="italic">"{highlightWord(primaryExample.sentence_en, currentWord.word)}"</p>
                    {primaryExample.sentence_vn && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400">{primaryExample.sentence_vn}</p>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={finishIntro}
                autoFocus
                className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <span>Đã đọc, kiểm tra tôi</span>
                <ArrowRight className="w-4 h-4" />
                <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-mono">Enter</kbd>
              </button>
            </div>
          ) : currentItem.kind === "word" ? (
            /* ========================================================
               PHẦN 1: BÀI TẬP TỪ VỰNG (VOCABULARY)
               ======================================================== */
            <>
              <div className="space-y-3">
                {/* Header Tags */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-cyan-600 dark:text-cyan-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Nghĩa tiếng Việt:</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {posLabel && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-semibold text-[11px]">
                        {posLabel}
                      </span>
                    )}
                    {currentWord?.topic && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px] border border-indigo-200 dark:border-indigo-800/60">
                        {currentWord.topic}
                      </span>
                    )}
                  </div>
                </div>

                {/* Nghĩa tiếng Việt */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 text-center">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug tracking-tight">
                    {conciseMeaning || currentWord?.meaning_vn}
                  </h2>
                </div>

                {/* Ngữ cảnh trong câu với chỗ trống */}
                {maskedSentence && (
                  <div className="p-3.5 rounded-2xl bg-cyan-50/40 dark:bg-cyan-950/20 border border-cyan-200/60 dark:border-cyan-800/50 text-xs leading-relaxed space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Ngữ cảnh trong câu:</span>
                    </div>
                    <p className="font-medium text-slate-800 dark:text-zinc-200 italic">
                      "{maskedSentence}"
                    </p>
                    {primaryExample?.sentence_vn && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        ({primaryExample.sentence_vn})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Trắc nghiệm từ vựng */}
              {activeMode === "multiple_choice" && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    <span>Chọn từ tiếng Anh chính xác:</span>
                    <span className="text-[11px] font-mono text-slate-400">Nhấn phím 1 - 4</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {choices.map((choice, idx) => {
                      const isSelected = selectedChoiceId === choice.id;
                      let btnStyle =
                        "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 hover:border-cyan-500 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20 shadow-xs";
                      let badgeStyle =
                        "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300";

                      if (isAnswered) {
                        if (choice.isCorrect) {
                          btnStyle =
                            "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30";
                          badgeStyle = "bg-emerald-500 text-white font-bold";
                        } else if (isSelected && !choice.isCorrect) {
                          btnStyle =
                            "border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100";
                          badgeStyle = "bg-rose-500 text-white font-bold";
                        } else {
                          btnStyle =
                            "border-slate-200 dark:border-zinc-800 opacity-40 bg-white dark:bg-zinc-900";
                        }
                      }

                      return (
                        <button
                          key={choice.id}
                          disabled={isAnswered}
                          onClick={() => handleSelectChoice(choice)}
                          className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all duration-150 ${btnStyle}`}
                        >
                          <span
                            className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${badgeStyle}`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-sm sm:text-base font-bold flex-1 tracking-tight">
                            {choice.word}
                          </span>
                          {isAnswered && choice.isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          {isAnswered && isSelected && !choice.isCorrect && (
                            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Gõ từ vựng */}
              {activeMode === "typing" && currentWord && (
                <form onSubmit={handleTypingSubmit} className="space-y-3.5 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <span>Nhập từ tiếng Anh tương ứng:</span>
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                        Gợi ý: {currentWord.word[0].toUpperCase()}
                        {" · ".repeat(Math.max(0, currentWord.word.length - 1))}
                        ({currentWord.word.length} chữ cái)
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        ref={inputRef}
                        type="text"
                        autoFocus
                        disabled={isAnswered}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-gramm="false"
                        data-enable-grammarly="false"
                        data-lpignore="true"
                        value={typedInput}
                        onChange={(e) => setTypedInput(e.target.value)}
                        placeholder="Gõ từ tiếng Anh vào đây..."
                        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base font-bold text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all shadow-xs"
                      />
                    </div>
                  </div>

                  {!isAnswered ? (
                    <button
                      type="submit"
                      disabled={!typedInput.trim()}
                      className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm shadow-cyan-600/20"
                    >
                      Kiểm tra đáp án (Enter)
                    </button>
                  ) : null}
                </form>
              )}

              {/* Kết quả & Thẻ ghi nhớ từ vựng */}
              {isAnswered && currentWord && (
                <div
                  className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-3 animate-in fade-in duration-200 ${
                    isCorrect
                      ? "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100"
                      : "bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100"
                  }`}
                >
                  {feedbackMsg && (
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                      <span>{feedbackMsg}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {currentWord.word}
                      </span>
                      {currentWord.phonetic && (
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-medium">
                          {currentWord.phonetic}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={handleManualSpeak}
                      title="Nghe phát âm (Nhấp để nghe)"
                      className="p-1.5 rounded-full text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>

                  {!isCorrect && wrongPick && (
                    <div className="text-[11px] text-slate-700 dark:text-zinc-300">
                      Bạn chọn <span className="font-bold">{wrongPick.word}</span>, từ này nghĩa là "{wrongPick.meaning}".
                    </div>
                  )}
                  {!isCorrect && activeMode === "typing" && typedInput.trim() && (
                    <div className="text-[11px] text-slate-700 dark:text-zinc-300">
                      Bạn gõ: <span className="font-mono font-bold line-through decoration-rose-500/70">{typedInput.trim()}</span>
                    </div>
                  )}

                  {primaryExample && (
                    <div className="text-[11px] text-slate-600 dark:text-zinc-300 pl-2 border-l-2 border-cyan-500/50 space-y-0.5">
                      <p className="italic">"{highlightWord(primaryExample.sentence_en, currentWord.word)}"</p>
                      {!isCorrect && primaryExample.sentence_vn && (
                        <p className="text-slate-500 dark:text-zinc-400">{primaryExample.sentence_vn}</p>
                      )}
                    </div>
                  )}

                  {mnemonic && (
                    <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 rounded-xl px-2.5 py-1.5">
                      💡 {mnemonic}
                    </div>
                  )}

                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={advanceNextItem}
                      className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-xs"
                    >
                      <span>Tiếp tục</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                      <kbd className="px-1 py-0.2 bg-white/20 dark:bg-black/20 rounded text-[9px] font-mono">
                        Enter
                      </kbd>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ========================================================
               PHẦN 2: BÀI TẬP NGỮ PHÁP (GRAMMAR REVIEW)
               ======================================================== */
            currentGrammar && (
              <>
                <div className="space-y-3">
                  {/* Header Lesson & Grammar Type */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-violet-600 dark:text-violet-400">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>
                        Bài tập ngữ pháp (
                        {currentGrammar.exercise.type === "conjugation"
                          ? "Chia động từ"
                          : currentGrammar.exercise.type === "error_spotting"
                          ? "Tìm lỗi sai"
                          : currentGrammar.exercise.type === "sentence_transform"
                          ? "Viết lại câu"
                          : "Trắc nghiệm"}
                        ):
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 font-semibold text-[11px] border border-violet-200 dark:border-violet-800/60 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        <span>{currentGrammar.lesson.title}</span>
                      </span>
                    </div>
                  </div>

                  {/* Câu bài tập tiếng Anh chính */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 text-center">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed tracking-tight">
                      {currentGrammar.exercise.promptEn}
                    </h2>
                  </div>

                  {/* Dịch nghĩa tiếng Việt */}
                  {currentGrammar.exercise.promptVn && (
                    <div className="p-3 rounded-2xl bg-violet-50/30 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/40 text-xs text-center">
                      <p className="font-medium text-slate-700 dark:text-zinc-300">
                        {currentGrammar.exercise.promptVn}
                      </p>
                    </div>
                  )}

                  {/* Gợi ý */}
                  {currentGrammar.exercise.hint && (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Gợi ý: {currentGrammar.exercise.hint}</span>
                    </div>
                  )}
                </div>

                {/* Trắc nghiệm ngữ pháp */}
                {activeMode === "multiple_choice" && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <span>Chọn đáp án ngữ pháp chính xác:</span>
                      <span className="text-[11px] font-mono text-slate-400">Nhấn phím 1 - 4</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {choices.map((choice, idx) => {
                        const isSelected = selectedChoiceId === choice.id;
                        let btnStyle =
                          "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 hover:border-violet-500 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 shadow-xs";
                        let badgeStyle =
                          "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300";

                        if (isAnswered) {
                          if (choice.isCorrect) {
                            btnStyle =
                              "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30";
                            badgeStyle = "bg-emerald-500 text-white font-bold";
                          } else if (isSelected && !choice.isCorrect) {
                            btnStyle =
                              "border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100";
                            badgeStyle = "bg-rose-500 text-white font-bold";
                          } else {
                            btnStyle =
                              "border-slate-200 dark:border-zinc-800 opacity-40 bg-white dark:bg-zinc-900";
                          }
                        }

                        return (
                          <button
                            key={choice.id}
                            disabled={isAnswered}
                            onClick={() => handleSelectChoice(choice)}
                            className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all duration-150 ${btnStyle}`}
                          >
                            <span
                              className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${badgeStyle}`}
                            >
                              {idx + 1}
                            </span>
                            <span className="text-sm sm:text-base font-bold flex-1 tracking-tight">
                              {choice.word}
                            </span>
                            {isAnswered && choice.isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            )}
                            {isAnswered && isSelected && !choice.isCorrect && (
                              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {!isAnswered && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleSkipGrammar}
                          className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                          title="Bỏ qua câu hỏi này nếu bạn chưa biết đáp án"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          <span>Bỏ qua (Chưa biết)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Gõ đáp án ngữ pháp (chia động từ / điền vào chỗ trống) */}
                {activeMode === "typing" && (
                  <form onSubmit={handleTypingSubmit} className="space-y-3.5 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-zinc-400">
                        <span>Nhập đáp án hoặc dạng đúng của từ:</span>
                        <span className="text-[11px] font-mono text-violet-600 dark:text-violet-400 font-bold">
                          Ví dụ: chia thì phù hợp với chủ ngữ
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          ref={inputRef}
                          type="text"
                          autoFocus
                          disabled={isAnswered}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-gramm="false"
                          data-enable-grammarly="false"
                          data-lpignore="true"
                          value={typedInput}
                          onChange={(e) => setTypedInput(e.target.value)}
                          placeholder="Nhập từ hoặc đáp án chính xác..."
                          className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base font-bold text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all shadow-xs"
                        />
                      </div>
                    </div>

                    {!isAnswered ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={!typedInput.trim()}
                          className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm shadow-violet-600/20"
                        >
                          Kiểm tra đáp án (Enter)
                        </button>
                        <button
                          type="button"
                          onClick={handleSkipGrammar}
                          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
                          title="Bỏ qua câu hỏi này nếu bạn chưa biết đáp án"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          <span>Bỏ qua</span>
                        </button>
                      </div>
                    ) : null}
                  </form>
                )}

                {/* Kết quả & Thẻ củng cố ngữ pháp khi đã trả lời */}
                {isAnswered && (
                  <div
                    className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-3 animate-in fade-in duration-200 ${
                      isCorrect
                        ? "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100"
                        : "bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100"
                    }`}
                  >
                    {feedbackMsg && (
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        {isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                        <span>{feedbackMsg}</span>
                      </div>
                    )}

                    {/* Câu hoàn chỉnh sau khi điền đáp án chuẩn */}
                    <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                          Câu tiếng Anh chuẩn xác:
                        </span>
                        <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                          {grammarFullSentence}
                        </p>
                      </div>

                      <button
                        onClick={handleManualSpeak}
                        title="Nghe phát âm cả câu tiếng Anh (Nhấp để nghe)"
                        className="p-2 rounded-full text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Giải thích ngữ pháp */}
                    {currentGrammar.exercise.explanation && (
                      <div className="text-[11px] text-slate-700 dark:text-zinc-300 bg-white/60 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-black/5 dark:border-white/5">
                        <span className="font-bold text-violet-700 dark:text-violet-400">💡 Giải thích: </span>
                        <span>{currentGrammar.exercise.explanation}</span>
                      </div>
                    )}

                    {/* Công thức ngữ pháp */}
                    {currentGrammar.lesson.formula?.positive && (
                      <div className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                        <span>Cấu trúc: </span>
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">
                          {currentGrammar.lesson.formula.positive}
                        </span>
                      </div>
                    )}

                    <div className="pt-1 flex justify-end">
                      <button
                        onClick={advanceNextItem}
                        className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-xs"
                      >
                        <span>Tiếp tục</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                        <kbd className="px-1 py-0.2 bg-white/20 dark:bg-black/20 rounded text-[9px] font-mono">
                          Enter
                        </kbd>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>

        {/* Bottom Keyboard Hint Bar */}
        <div className="px-6 py-3 bg-slate-50/60 dark:bg-zinc-950/40 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
          <div className="flex items-center gap-3">
            {activeMode === "multiple_choice" ? (
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                  1-4
                </kbd>
                <span>Chọn đáp án</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                  Enter
                </kbd>
                <span>Kiểm tra</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                S
              </kbd>
              <span>Hoãn {settings.snoozeMinutes}p</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
              Esc
            </kbd>
            <span>Tắt nhanh</span>
          </div>
        </div>
      </div>
    </div>
  );
}
