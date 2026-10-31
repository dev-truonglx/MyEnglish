import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  SkipForward,
} from "lucide-react";
import { getDueWordsFromDb, getWordsByIds, getWordsLite, isPlaceholderMeaning } from "@/services/db";
import { formatIntervalPreview, getStudyLimits } from "@/services/srs";
import { calculateStreakAndGoal, recordDailyActivity } from "@/services/streak";
import { resolveComeback } from "@/services/comeback";
import { checkAndUnlockAchievements, countBadgeWords, recordFirstTryCorrect } from "@/services/achievements";
import {
  getReminderSettings,
  snoozeReminder,
  hideReviewPopup,
  recordPopupDisplayed,
  type ReminderSettings,
} from "@/services/reminderSettings";
import { getGrammarExercisesForReview } from "@/services/grammarService";
import { recordGrammarAnswer as recordBookGrammarAnswer, type SessionEntry } from "@/services/grammarSession";
import { checkTask } from "@/services/grammarItems";
import type { WordDetail, ReviewCard } from "@/types/database";
import { isWordDue, practiceCards } from "@/services/cards";
import { loadRecentRuns, pickPracticeWords, type RecentRun } from "@/services/practicePicker";
import { itemsLeft } from "@/lib/utils";
import { BOOK_REVISION_KEY, clearBookCache } from "@/services/grammarBook";
import { getRecentIntros } from "@/services/intros";
import {
  postponeNewCard,
  recordCardAnswer,
  recordIntro,
  schedulingDecision,
} from "@/services/reviewRecorder";
import { markWordEasy } from "@/services/easyWords";
import { setPopupSessionActive } from "@/services/activeSession";
import {
  buildPopupChoices,
  buildPopupListenChoices,
  describeWrongChoice,
  needsIntro,
  popupAnswerRating,
  popupMcExercise,
  popupMcVariant,
  selectSmartPopupMode,
  type PopupMcVariant,
} from "@/services/popupSession";
import { getStudyLevels, topUpNewWords } from "@/services/vocabFeed";
import { catalogSoundPoolIfLoaded, loadCatalogDistractors, loadCatalogMeanings, loadCatalogSoundPool } from "@/services/vocabCatalog";
import { parseTerms } from "@/types/database";
import { summarizeSession, type SessionResult, type SessionSummary } from "@/services/progress";
import { getStoredMnemonic } from "@/services/aiMnemonic";
import { highlightWord } from "@/components/review/highlightWord";
import { getConciseMeaning } from "@/services/meaningText";
import { celebrationFor, praiseWord, type Celebration } from "@/services/celebrations";
import { logLearningEvent } from "@/services/learningEvents";
import { englishVoices, handleSpeak } from "@/components/review/speech";
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
  isCatalogSynonym,
  buildReviewSession,
  getNewCardsIntroducedToday,
  summarizeTodayWork,
  matchTypedAnswer,
  normalizeTypedText,
  formInSentence,
  maskAllWordForms,
  needsRelearnIntro,
  pickExample,
  type ExerciseType,
} from "@/services/smartReview";
import type { GrammarExercise, GrammarLesson } from "@/types/grammar";
import { Rating } from "ts-fsrs";
import { playAnswerSound, playSound, resetSoundSession } from "@/services/sound";
import LetterTilesExercise from "./exercises/LetterTilesExercise";

interface FocusReviewModalProps {
  onClose?: () => void;
  isPreview?: boolean;
}

interface ChoiceOption {
  id: string;
  word: string;
  isCorrect: boolean;
  /** English word and IPA behind a listening option, shown once answered */
  english?: string;
  phonetic?: string | null;
}

export type FocusReviewItem =
  | { kind: "word"; word: ReviewCard }
  | { kind: "grammar"; exercise: GrammarExercise; lesson: GrammarLesson; entry?: SessionEntry };

/** One item of the popup, whichever copy of it (a retry is the same item) */
const itemKey = (item: FocusReviewItem): string =>
  item.kind === "word" ? `w:${item.word.id}:${item.word.direction}` : `g:${item.exercise.id}`;

/**
 * Words and grammar questions in a popup of `size` items (N16). Due words come first: while words are due,
 * grammar takes at most 1 question in a popup of up to 4 items and about 30% of a bigger one; with no word
 * due, the due grammar fills the popup. Slots grammar cannot fill go to words.
 */
export function popupQuota(
  size: number,
  opts: { includeGrammar: boolean; dueWords: number; grammarAvailable: number }
): { words: number; grammar: number } {
  const total = Math.max(1, Math.round(size));
  if (!opts.includeGrammar) return { words: total, grammar: 0 };
  const cap = opts.dueWords > 0 ? (total <= 4 ? 1 : Math.round(total * 0.3)) : total;
  const grammar = Math.max(0, Math.min(cap, opts.grammarAvailable));
  return { words: total - grammar, grammar };
}

/** Shown under the feedback when the stored card had already been graded elsewhere (popup, main window) */
const PRACTICE_NOT_DUE_NOTE = "Câu này chỉ tính luyện thêm: từ đã được ôn ở nơi khác";

export function getPosLabel(pos?: string | null): string | null {
  if (!pos) return null;
  const p = pos.toLowerCase().trim();
  const parts = p.split(",").map((s) => s.trim()).filter(Boolean);
  const labels: string[] = [];

  for (const part of parts) {
    let label = "";
    if (part === "pronoun") label = "Đại từ (pronoun)";
    else if (part === "determiner") label = "Từ hạn định (determiner)";
    else if (part.includes("adv") || part === "adverb") label = "Trạng từ (adv)";
    else if (part.includes("adj") || part === "a" || part === "adjective") label = "Tính từ (adj)";
    else if (part === "noun" || part === "n") label = "Danh từ (noun)";
    else if (part.includes("modal verb")) label = "Động từ khuyết thiếu";
    else if (part.includes("verb") || part === "v") label = "Động từ (verb)";
    else if (part.includes("preposition")) label = "Giới từ (prep)";
    else if (part.includes("conjunction")) label = "Liên từ (conj)";
    else if (part.includes("idiom") || part.includes("phrase")) label = "Cụm từ / Thành ngữ";
    else label = part;

    if (label && !labels.includes(label)) {
      labels.push(label);
    }
  }

  if (labels.length > 0) {
    return labels.slice(0, 2).join(", ");
  }

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
  if (ex.correctSentence) return ex.correctSentence;

  const ans = Array.isArray(ex.correctAnswer)
    ? ex.correctAnswer[0]
    : ex.correctAnswer || ex.errorWord || "";
  if (!ans) return ex.promptEn;

  // Với dạng tìm lỗi sai: loại bỏ các ký tự ngoặc vuông [word] -> word
  if (ex.type === "error_spotting") {
    return ex.promptEn.replace(/\[([^\]]+)\]/g, "$1");
  }

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
  const [activeMode, setActiveMode] = useState<"multiple_choice" | "typing" | "letter_tiles">("multiple_choice");
  // Vocabulary multiple choice: show the word and pick its meaning, or the other way round
  const [mcDirection, setMcDirection] = useState<PopupMcVariant>("en_to_vn");

  // Multiple choice state
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  // Answer tones (sound.ts): every answer (choice, tiles, typing, "Không nhớ", skip) turns isAnswered on once,
  // together with isCorrect
  useEffect(() => {
    if (isAnswered) playAnswerSound(isCorrect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswered]);

  // Typing mode state
  const [typedInput, setTypedInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [nextReviewText, setNextReviewText] = useState<string | null>(null);

  // Auto-advance timer ref for proper cleanup
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentItem = queue[currentIndex];
  // The item on screen, for answers saved after a delay
  const currentItemRef = useRef<FocusReviewItem | undefined>(currentItem);
  currentItemRef.current = currentItem;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  // The last answer's database write still in flight: the session's end (summary, badges, daily goal) and the
  // close wait for it, so the final answer is never missed
  const pendingSaveRef = useRef<Promise<unknown>>(Promise.resolve());
  const trackSave = <T,>(save: Promise<T>): Promise<T> => {
    pendingSaveRef.current = Promise.allSettled([pendingSaveRef.current, save]);
    // Still answering: keeps the reminder worker away (the flag goes stale without answers)
    if (!isPreview) setPopupSessionActive(true);
    return save;
  };
  // Feedback of an answer saved after a delay is shown only while that item (not a later one, nor its retry
  // copy at the end of the queue) is still on screen
  const showFeedbackFor = (item: FocusReviewItem, index: number, msg: string) => {
    if (currentItemRef.current === item && currentIndexRef.current === index) setFeedbackMsg(msg);
  };

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
  // Cards that came from the due queue (buildReviewSession: new-card budget, buried siblings, comeback share).
  // Fillers (extra studied words, "all words" mode) are practice even when due, as in flashcard sessions.
  const dueKeysRef = useRef<Set<string>>(new Set());
  const retryCountRef = useRef<Map<string, number>>(new Map());

  /** Put a wrong item back at the end of the queue (at most MAX_POPUP_RETRIES times) */
  const requeueItem = (item: FocusReviewItem): boolean => {
    const key = itemKey(item);
    const count = retryCountRef.current.get(key) ?? 0;
    if (count >= MAX_POPUP_RETRIES) return false;
    retryCountRef.current.set(key, count + 1);
    const nextItem: FocusReviewItem =
      item.kind === "word"
        ? { ...item, word: { ...item.word, requeueCount: count + 1 } }
        : item;
    setQueue((prev) => [...prev, nextItem]);
    return true;
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
      if (!isPreview) setPopupSessionActive(false);
      playSound("complete");
    }
  }, [summary]);
  // Words of the deck, to explain which word a wrong option was
  const allWordsRef = useRef<WordDetail[]>([]);
  // A comeback plan had part of today's share left when the queue was loaded: that share counts vocabulary
  // answers only (P2), so grammar answers are not added to today's activity meanwhile
  const comebackShareRef = useRef(false);
  // Answers of this popup session that moved a schedule (for the badges)
  const scheduledAnswersRef = useRef(0);
  // Badges unlocked at the end of this popup session
  const [newBadges, setNewBadges] = useState<string[]>([]);
  // The answer was recorded as practice because the card had been graded elsewhere since the queue was built
  const [practiceNote, setPracticeNote] = useState<string | null>(null);

  /**
   * Note the first answer to an item. Only first answers count toward the daily goal, so retrying
   * a missed item does not inflate it. Returns whether this was the first answer.
   */
  const noteFirstAnswer = (
    key: string,
    label: string,
    correct: boolean,
    nextReview: string | null,
    milestone: SessionResult["milestone"] = null,
    countsForGoal = true
  ): boolean => {
    if (sessionResultsRef.current.has(key)) return false;
    sessionResultsRef.current.set(key, { key, label, correct, nextReview, milestone });
    if (countsForGoal) recordDailyActivity(1);
    return true;
  };

  /**
   * One grammar answer. Only the first answer to a question counts (a retry after the answer was shown is
   * practice): it updates the question's history and ladder, and is pooled into its lessons, which are
   * graded (FSRS) once LESSON_GRADE_ANSWERS answers are pooled.
   */
  const recordGrammarAnswer = async (
    item: Extract<FocusReviewItem, { kind: "grammar" }>,
    correct: boolean,
    skipped = false,
    given?: string
  ) => {
    const { exercise: ex, lesson } = item;
    const first = noteFirstAnswer(`g:${ex.id}`, lesson.title, correct, null, null, !comebackShareRef.current);
    if (!first || !item.entry) return;
    await recordBookGrammarAnswer(item.entry, correct, { mode: "popup", skipped, given });
  };

  /**
   * Badges after a popup session, with the same context as flashcard sessions (useReviewSession): the whole
   * collection's counts (a word only marked "Đã biết" is not remembered yet, see countBadgeWords) and the streak.
   */
  const checkBadges = (completed: boolean) => {
    const sessionReviewCount = scheduledAnswersRef.current;
    if (!completed && sessionResultsRef.current.size === 0) return;
    // Schedules are all the badge counts need: no examples or answer stats
    getWordsLite()
      .then((words) => {
        const unlocked = checkAndUnlockAchievements({
          ...countBadgeWords(words),
          totalWords: words.length,
          currentStreak: calculateStreakAndGoal(words).currentStreak,
          sessionReviewCount,
          sessionCompleted: completed || undefined,
        });
        if (completed && unlocked.length > 0) setNewBadges(unlocked.map((b) => `${b.emoji} ${b.title}`));
      })
      .catch((err) => console.warn("Badge check after the popup failed:", err));
  };

  // When each card's introduction was shown (this session, or a recent popup / flashcard session)
  const introducedAtRef = useRef<Map<string, number>>(new Map());
  // The learner typed a synonym of the target first: the exact word needed a cue (graded Hard)
  const synonymTriedRef = useRef(false);
  // The typing hint (first letter + length) was opened: Hard at most, as with the hint in flashcard sessions
  const hintUsedRef = useRef(false);

  // Same rules as flashcard sessions (see schedulingDecision): only the first answer to a due card moves
  // its schedule; retries, extra (not due) words and quizzes seconds after an introduction are practice.
  const gradeWord = async (
    word: ReviewCard,
    correct: boolean,
    exerciseType: ExerciseType,
    nearMiss = false
  ): Promise<Celebration | null> => {
    const responseTimeMs = Date.now() - itemStartRef.current;
    // Read before any await: the queue as it is when the answer is given
    const cardsAfterThis = queue.length - 1 - currentIndex;
    const rating = popupAnswerRating(
      correct,
      exerciseType,
      responseTimeMs,
      nearMiss,
      synonymTriedRef.current,
      hintUsedRef.current
    );
    const cardKey = `${word.id}:${word.direction}`;
    const decision = schedulingDecision({
      card: word,
      exerciseType,
      practiceMode: !dueKeysRef.current.has(cardKey),
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
      // Quizzed right after its introduction (practice). With other cards still to come it is asked once
      // more at the end, by then graded; a wrong answer was requeued by the caller already.
      const askedAgain = correct && cardsAfterThis > 0 && requeueItem({ kind: "word", word });
      if (!askedAgain) nextReview = await postponeNewCard(word.id, word.direction).catch(() => null);
    }
    // Graded elsewhere since the queue was built: practice, already counted where it was graded. The note is
    // only shown while this card is still on screen (Enter may have moved on before the answer was saved).
    const gradedElsewhere = recorded.practiceReason === "not_due";
    const onScreen = currentItemRef.current;
    if (gradedElsewhere && onScreen?.kind === "word" && onScreen.word === word) setPracticeNote(PRACTICE_NOT_DUE_NOTE);
    if (recorded.scheduled) {
      scheduledAnswersRef.current++;
      if (correct && rating >= Rating.Good) recordFirstTryCorrect();
    }
    const praise = celebrationFor({ ...recorded, direction: word.direction, word: word.word });
    // The summary marks long-term memory and rescues; an overnight win is only said on the spot
    const milestone = praise?.kind === "mastered" || praise?.kind === "rescued" ? praise.kind : null;
    noteFirstAnswer(`w:${cardKey}`, word.word, correct, nextReview, milestone, !gradedElsewhere);

    let reviewLabel: string;
    if (!correct) {
      reviewLabel = "ở cuối phiên này";
    } else if (decision.reason === "intro_too_recent" && cardsAfterThis > 0) {
      reviewLabel = "ở cuối phiên này";
    } else if (gradedElsewhere || !dueKeysRef.current.has(cardKey) || recorded.practiceReason) {
      reviewLabel = "luyện tập củng cố";
    } else if (nextReview) {
      const formatted = formatIntervalPreview(new Date(nextReview), new Date());
      reviewLabel = `sau ${formatted}`;
    } else {
      reviewLabel = "sớm hôm nay";
    }
    setNextReviewText(reviewLabel);

    return praise;
  };
  const praiseText = (p: Celebration | null) => (p ? `${p.title} ${p.detail} ` : "");
  // "Chính xác!" every time read like a machine: the word varies with the item and the minute
  const praiseNow = (index: number) => praiseWord(index + Math.floor(Date.now() / 60000));
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
  const markingKnownRef = useRef(false);
  useEffect(() => {
    if (showIntro && !pretest) introShownAtRef.current = Date.now();
  }, [showIntro, introKey, !!pretest]);
  const finishIntro = useCallback(() => {
    if (!currentWord || markingKnownRef.current) return;
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

  // A session was opened for the current showing of the window, and when (see openSession)
  const sessionLoadedRef = useRef(false);
  const openedAtRef = useRef(0);
  // Incremented by each queue load and by closing: a load that finishes after either is dropped
  const loadSeqRef = useRef(0);

  /**
   * Back to the empty "loading" state once the window is hidden: the next opening must not show the
   * previous session or summary for a moment before its own queue is loaded (N2).
   */
  const resetSession = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (snoozeTimerRef.current) {
      clearTimeout(snoozeTimerRef.current);
      snoozeTimerRef.current = null;
    }
    markingKnownRef.current = false;
    closingRef.current = false;
    loadSeqRef.current++;
    sessionLoadedRef.current = false;
    openedAtRef.current = 0;
    sessionOpenRef.current = false;
    summaryShownRef.current = false;
    sessionResultsRef.current = new Map();
    setLoading(true);
    setQueue([]);
    setCurrentIndex(0);
    setSummary(null);
    setNewBadges([]);
    setIsAnswered(false);
    setSelectedChoiceId(null);
    setIsCorrect(false);
    setTypedInput("");
    setFeedbackMsg(null);
    setPracticeNote(null);
    setChoices([]);
  };

  // Snoozing: the window closes after a short notice, and keys / buttons do nothing meanwhile
  const closingRef = useRef(false);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(async () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (snoozeTimerRef.current) {
      clearTimeout(snoozeTimerRef.current);
      snoozeTimerRef.current = null;
    }
    window.speechSynthesis?.cancel?.();
    // The answer given last may still be saving: the badges and the streak should count it
    await pendingSaveRef.current;
    // Closed before the end of the session (the summary was not reached)
    if (!summaryShownRef.current && sessionOpenRef.current) {
      logLearningEvent("popup_closed_early", { meta: { answered: sessionResultsRef.current.size } });
      // Answers given before closing still count for the streak / word badges
      checkBadges(false);
    }
    sessionOpenRef.current = false;
    if (!isPreview) setPopupSessionActive(false);
    if (onClose) onClose();
    if (!isPreview) {
      await hideReviewPopup();
      // Rust keeps the hidden window a little while before releasing it, so a reminder soon after reuses it
      // (the in-app preview unmounts instead)
      resetSession();
    }
  }, [onClose, isPreview]);

  const handleSnooze = useCallback(async (minutes?: number) => {
    // Already snoozing: a second press must not log or schedule again
    if (closingRef.current) return;
    closingRef.current = true;
    window.speechSynthesis?.cancel?.();
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    const mins = snoozeReminder(minutes);
    logLearningEvent("popup_snoozed", { meta: { minutes: mins, answered: sessionResultsRef.current.size } });
    sessionOpenRef.current = false;
    setFeedbackMsg(`Đã hoãn nhắc nhở trong ${mins} phút.`);
    snoozeTimerRef.current = setTimeout(() => {
      snoozeTimerRef.current = null;
      handleClose();
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
      setPracticeNote(null);
      setNextReviewText(null);
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Completed all items: show what was learned (closes by itself if left alone). The last answer may
      // still be saving: the summary, the badges and the daily goal wait for it.
      const seq = loadSeqRef.current;
      pendingSaveRef.current.then(() => {
        if (seq !== loadSeqRef.current) return; // closed or reloaded meanwhile
        const results = Array.from(sessionResultsRef.current.values());
        setSummary(summarizeSession(results));
        logLearningEvent("popup_completed", {
          meta: { items: results.length, correct: results.filter((r) => r.correct).length, mastered: results.filter((r) => r.milestone === "mastered").length },
        });
        checkBadges(true);
        advanceTimerRef.current = setTimeout(() => {
          handleClose();
        }, SUMMARY_AUTO_CLOSE_MS);
      });
    }
  }, [currentIndex, queue.length, handleClose]);

  /** A brand-new word the learner already knows: marked "Đã biết" (set aside, FSRS untouched), outside the daily budget */
  const markIntroKnown = useCallback(async () => {
    if (!currentWord || markingKnownRef.current) return;
    markingKnownRef.current = true;
    try {
      setIntroduced((prev) => new Set(prev).add(introKey));
      await markWordEasy(currentWord.id).catch((err) => console.warn("Failed to mark a word as known:", err));
      advanceNextItem();
    } finally {
      markingKnownRef.current = false;
    }
  }, [currentWord, introKey, advanceNextItem]);

  // Load review queue: song song từ vựng và ngữ pháp theo thuật toán Spaced Repetition & Interleaving
  const loadReviewQueue = async (forceSpinner = true) => {
    // A newer load (or closing the window) makes this one stale
    const seq = ++loadSeqRef.current;
    closingRef.current = false;
    if (forceSpinner) setLoading(true);
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    try {
      const currentSettings = getReminderSettings();
      setSettings(currentSettings);

      const targetCount = Math.max(3, currentSettings.wordsPerSession || 3);
      const includeGrammar = true; // Automatically interleave grammar questions when studied lessons exist

      // New words of the chosen levels enter the deck's buffer before the due words are read
      await topUpNewWords().catch(() => {});
      // Deck meanings: another deck word with the same meaning typed is a synonym, not a mistake
      loadCatalogMeanings().catch(() => {});

      // 1. Nạp dữ liệu đồng thời từ database & grammar service. Up to a whole popup of grammar: it fills the
      // popup when no word is due (popupQuota)
      // Only the due words are read in full (examples, stats); the whole collection is not needed
      const now = new Date();
      const [dueRaw, grammarCandidates, catalogDistractors, newToday] = await Promise.all([
        getDueWordsFromDb(now).catch(() => [] as WordDetail[]),
        getGrammarExercisesForReview(targetCount).catch(() => []),
        loadCatalogDistractors(getStudyLevels(), 600).catch(() => [] as WordDetail[]),
        getNewCardsIntroducedToday().catch(() => ({ recognition: 0, production: 0 })),
      ]);

      // Words still waiting for AI analysis have no real meaning to quiz on
      const usable = (w: WordDetail) => !isPlaceholderMeaning(w.meaning_vn);

      // 2. Due words: FSRS urgency order + new cards, with the comeback plan of the main session
      // (MainDashboard.handleStartReview): today's share of the backlog, the plan's new words.
      const dueWords = dueRaw.filter((w) => usable(w) && !w.suspended && isWordDue(w, now));
      const backlog = summarizeTodayWork(dueWords, newToday, now).reviews;
      const cb = resolveComeback(backlog, getStudyLimits().maxSessionSize, now);
      const plan = cb && !cb.caughtUp ? cb : null;
      const dueCards =
        dueWords.length > 0
          ? buildReviewSession(dueWords, newToday, now, {
              maxCards: plan && plan.todayRemaining > 0 ? plan.todayRemaining : undefined,
              comebackNewCards: plan ? plan.newWordsPerDay : undefined,
            })
          : [];

      // 3. Phân bổ chỉ tiêu (N16): with words due, a 3-item popup is 2 words + 1 grammar question
      const quota = popupQuota(targetCount, {
        includeGrammar,
        dueWords: dueCards.length,
        grammarAvailable: grammarCandidates.length,
      });
      const wordTarget = quota.words;
      const selectedGrammar = grammarCandidates.slice(0, quota.grammar);

      // Due cards first, in every mode: a due word asked as practice here would be asked again, graded, by the
      // next session. The rest of the popup is practice on words already studied (a waiting word needs its
      // introduction), picked by practicePicker: words missed lately or weakest ("Luôn nhắc ngẫu nhiên": at
      // random), never the words just answered right several times in a row unless the popup would be empty.
      // Read (without examples) only when the due words do not fill the popup; the few picked are then read in full.
      const allWordsMode = currentSettings.triggerCondition === "all_words";
      const needsPractice = dueCards.length < wordTarget;
      const [studiedWords, recentRuns] = needsPractice
        ? await Promise.all([
            getWordsLite({ studiedOnly: true })
              .then((ws) => ws.filter((w) => usable(w) && (w.srs?.reps ?? 0) > 0))
              .catch(() => [] as WordDetail[]),
            loadRecentRuns(now).catch(() => new Map<string, RecentRun>()),
          ])
        : [[] as WordDetail[], new Map<string, RecentRun>()];
      const fullWords = async (picked: WordDetail[]): Promise<WordDetail[]> => {
        if (picked.length === 0) return [];
        const byId = new Map((await getWordsByIds(picked.map((w) => w.id)).catch(() => [])).map((w) => [w.id, w]));
        return picked.map((w) => byId.get(w.id) ?? w);
      };
      let selectedWords: ReviewCard[] = dueCards.slice(0, wordTarget);
      if (selectedWords.length < wordTarget && studiedWords.length > 0) {
        const pick = (fillWithResting: boolean) =>
          pickPracticeWords(studiedWords, recentRuns, wordTarget - selectedWords.length, {
            now,
            exclude: new Set(selectedWords.map((w) => w.id)),
            order: allWordsMode ? "random" : "weakest",
            fillWithResting,
          });
        let practice = pick(false);
        if (practice.length === 0 && selectedWords.length === 0 && selectedGrammar.length === 0) practice = pick(true);
        selectedWords = [...selectedWords, ...practiceCards(await fullWords(practice))];
      }

      // 4. Xen kẽ (Interleaving) Từ vựng và Ngữ pháp để tối ưu hóa khả năng ghi nhớ dài hạn
      const wordQueue: FocusReviewItem[] = selectedWords.map((w) => ({ kind: "word", word: w }));
      const grammarQueue: FocusReviewItem[] = selectedGrammar.map((g) => ({
        kind: "grammar",
        exercise: g.exercise,
        lesson: g.lesson,
        entry: g.entry,
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
      const recentIntros = await getRecentIntros().catch(() => new Map<string, number>());
      if (seq !== loadSeqRef.current) return;
      comebackShareRef.current = !!plan && plan.todayRemaining > 0;
      introducedAtRef.current = recentIntros;
      scheduledThisSessionRef.current = new Set();
      dueKeysRef.current = new Set(
        selectedWords.filter((w) => dueCards.includes(w)).map((w) => `${w.id}:${w.direction}`)
      );
      scheduledAnswersRef.current = 0;
      retryCountRef.current = new Map();
      setIntroduced(new Set());
      advancedFromRef.current = -1;
      sessionResultsRef.current = new Map();
      resetSoundSession();
      // Wrong options: the learner's words read for this session plus unseen deck words of their levels
      const pool = new Map<string, WordDetail>();
      for (const w of [...selectedWords, ...dueWords, ...studiedWords, ...catalogDistractors]) {
        if (!pool.has(w.id)) pool.set(w.id, w);
      }
      allWordsRef.current = [...pool.values()];
      setSummary(null);
      setNewBadges([]);
      setQueue(finalQueue);
      setCurrentIndex(0);
      summaryShownRef.current = false;
      sessionOpenRef.current = finalQueue.length > 0;
      if (!isPreview) setPopupSessionActive(finalQueue.length > 0);
      if (finalQueue.length > 0) logLearningEvent("popup_shown", { meta: { items: finalQueue.length } });
      setIsAnswered(false);
      setSelectedChoiceId(null);
      setIsCorrect(false);
      setTypedInput("");
      setFeedbackMsg(null);
      setPracticeNote(null);
      setNextReviewText(null);
    } catch (err) {
      console.error("Failed to load review queue for modal:", err);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  /**
   * The popup is really on screen: count the display and load a new session (N2). Rust creates the review-popup
   * window when a reminder first needs it and releases it a while after it hides; a window it reuses was hidden,
   * so mounting is not an opening: Rust emits review-popup-opened each time it shows the window, and a window
   * created for this opening finds itself visible once its listener is ready.
   */
  const openSession = (source: "event" | "visible" | "mount") => {
    // The visibility check and the event of the same opening both arrive: load once
    if (source === "event" && Date.now() - openedAtRef.current < 2000) return;
    if (source === "visible" && sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    openedAtRef.current = Date.now();
    recordPopupDisplayed(Date.now());
    playEntryAnimation();
    loadReviewQueue(true);
  };

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let isCancelled = false;
    const inTauri = "__TAURI_INTERNALS__" in window;
    const nativeWindow = inTauri && !isPreview;

    // The in-app preview and the browser fallback mount the component when the popup is opened
    if (!nativeWindow) openSession("mount");

    // Lắng nghe sự kiện mở popup từ Tauri backend
    const readBookRevision = () => {
      try {
        return localStorage.getItem(BOOK_REVISION_KEY);
      } catch {
        return null;
      }
    };
    let bookRevision = readBookRevision();
    listen("review-popup-opened", () => {
      if (isCancelled) return;
      // A reused window was hidden: a grammar book imported meanwhile in the main window must be re-read.
      // Only then: re-reading the whole book on every reminder cost a reload of all its tables
      const revision = readBookRevision();
      if (revision !== bookRevision) {
        bookRevision = revision;
        clearBookCache();
      }
      openSession("event");
    })
      .then((fn) => {
        if (isCancelled) {
          fn();
          return;
        }
        unlistenFn = fn;
        // Shown right after launch, before this listener was ready: its event was missed, so check whether
        // the window is already on screen
        if (nativeWindow) {
          getCurrentWindow()
            .isVisible()
            .then((visible) => {
              if (visible && !isCancelled) openSession("visible");
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.warn("Could not attach review-popup-opened listener:", err);
      });

    // In-app fallback preview event listener
    const onPreviewOpened = () => openSession("mount");
    window.addEventListener("open-review-popup-preview", onPreviewOpened);

    return () => {
      isCancelled = true;
      window.speechSynthesis?.cancel?.();
      if (!isPreview) setPopupSessionActive(false);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
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
    setPracticeNote(null);
    synonymTriedRef.current = false;
    hintUsedRef.current = false;
    // Never show (or let keys 1-4 pick) the previous item's options
    setChoices([]);
    let cancelled = false;

    if (currentItem.kind === "word") {
      const wordObj = currentItem.word;
      // Same ladder as flashcard sessions: recognition cards are multiple choice, recall cards climb from
      // letter tiles to typing (see selectSmartPopupMode)
      const smartMode = selectSmartPopupMode(wordObj);
      setActiveMode(smartMode);
      const direction = smartMode === "multiple_choice" ? popupMcVariant(wordObj, englishVoices().length > 0) : "vn_to_en";
      setMcDirection(direction);

      const pool =
        allWordsRef.current.length > 0
          ? Promise.resolve(allWordsRef.current)
          : loadCatalogDistractors(getStudyLevels(), 600).catch(() => [] as WordDetail[]);
      // Heard words: the wrong options are the deck words that sound most like it (loaded only when needed)
      const deckSounds =
        direction !== "listen"
          ? Promise.resolve([])
          : Promise.resolve(catalogSoundPoolIfLoaded() ?? loadCatalogSoundPool()).catch(() => []);
      Promise.all([pool, deckSounds]).then(([all, sounds]) => {
        if (cancelled) return;
        const usable = all.filter((w) => !isPlaceholderMeaning(w.meaning_vn));
        setChoices(
          direction === "listen" ? buildPopupListenChoices(wordObj, sounds, usable) : buildPopupChoices(wordObj, usable, direction)
        );
      });
    } else {
      // Bài tập ngữ pháp
      const ex = currentItem.exercise;
      if (ex.options && ex.options.length > 0) {
        setActiveMode("multiple_choice");
        const allChoices: ChoiceOption[] = ex.options.map((opt, idx) => ({
          id: `grammar-opt-${idx}-${opt}`,
          word: opt,
          // Book questions: the same check as the grammar player (checkTask: by option index)
          isCorrect: currentItem.entry
            ? checkTask(currentItem.entry.task, { kind: "option", index: idx }).correct
            : isGrammarAnswerCorrect(opt, ex),
        }));
        setChoices(allChoices);
      } else if (ex.type === "error_spotting") {
        // Trích xuất các từ trong ngoặc vuông [word] thành lựa chọn trắc nghiệm
        const matches = Array.from(ex.promptEn.matchAll(/\[([^\]]+)\]/g)).map((m) => m[1]);
        const uniqueTokens = Array.from(new Set(matches));
        if (uniqueTokens.length > 0) {
          setActiveMode("multiple_choice");
          const allChoices: ChoiceOption[] = uniqueTokens.map((tok, idx) => ({
            id: `grammar-err-${idx}-${tok}`,
            word: tok,
            isCorrect: isGrammarAnswerCorrect(tok, ex),
          }));
          setChoices(allChoices);
        } else {
          setActiveMode("typing");
          setChoices([]);
        }
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
        : currentItem.exercise.promptEn.replace(/\[([^\]]+)\]/g, "$1").replace(/_{3,}(?:\s*\([^)]*\))*/g, " … ");
    handleSpeak(textToSpeak);
  };


  // Xử lý nộp đáp án dạng trắc nghiệm (phím 1-4)
  // A wrong answer is queued for retry and its feedback shown before the database write: Enter may move on
  // (or end the session) while the write is still running.
  const handleSelectChoice = async (choice: ChoiceOption) => {
    if (isAnswered || !currentItem) return;

    const item = currentItem;
    const index = currentIndex;
    setSelectedChoiceId(choice.id);
    setIsAnswered(true);
    const correct = choice.isCorrect;
    setIsCorrect(correct);

    try {
      if (item.kind === "word") {
        const wordObj = item.word;
        if (correct) {
          const praise = await trackSave(gradeWord(wordObj, true, popupMcExercise(mcDirection)));
          showFeedbackFor(item, index, praise ? `${praiseText(praise)}${NEXT_HINT}` : `${praiseNow(index)} ${NEXT_HINT}`);
        } else {
          // Cải tiến: Đẩy câu trả lời sai vào cuối hàng đợi để củng cố ngay
          requeueItem(item);
          const rightMeaning = choices.find((c) => c.isCorrect)?.word;
          setFeedbackMsg(
            mcDirection !== "vn_to_en" && rightMeaning
              ? `Chưa chính xác! "${wordObj.word}" nghĩa là: ${rightMeaning}`
              : `Chưa chính xác! Từ đúng là: "${wordObj.word}"`
          );
          await trackSave(gradeWord(wordObj, false, popupMcExercise(mcDirection)));
        }
      } else {
        // Xử lý bài tập ngữ pháp
        const ex = item.exercise;
        if (correct) {
          setNextReviewText("đã ghi nhận tiến độ");
          await trackSave(recordGrammarAnswer(item, true, false, choice.word));
          showFeedbackFor(item, index, `${praiseNow(index)} Đáp án: ${formatAnswerForms(ex)}. ${NEXT_HINT}`);
        } else {
          // Đẩy bài tập sai vào cuối hàng đợi
          requeueItem(item);
          setNextReviewText("ở cuối phiên này");
          setFeedbackMsg(`Chưa chính xác! Đáp án đúng là: ${formatAnswerForms(ex)}`);
          await trackSave(recordGrammarAnswer(item, false, false, choice.word));
        }
      }
    } catch (err) {
      console.warn("Failed to record review from popup:", err);
    }
  };

  // Letter tiles done: built on the first try = remembered (hint -> Hard), after wrong tries = Again
  const handleTilesComplete = async (attempts: number, rating: Rating, isCorrectResult?: boolean) => {
    if (isAnswered || !currentItem || currentItem.kind !== "word") return;
    const item = currentItem;
    const index = currentIndex;
    const wordObj = item.word;
    const firstTry = attempts === 0 && rating !== Rating.Again && isCorrectResult !== false;
    setIsAnswered(true);
    setIsCorrect(firstTry);
    if (!firstTry) requeueItem(item);
    try {
      const praise = await trackSave(
        firstTry ? gradeWord(wordObj, true, "letter_tiles", rating === Rating.Hard) : gradeWord(wordObj, false, "letter_tiles")
      );
      showFeedbackFor(
        item,
        index,
        firstTry
          ? `${praise ? praiseText(praise) : `Đúng rồi: "${wordObj.word}" 🎉 `}${NEXT_HINT}`
          : rating === Rating.Again && attempts <= 1
            ? `Chưa nhớ ra từ "${wordObj.word}" — từ này sẽ được ôn lại sớm. ${NEXT_HINT}`
            : `Ghép xong "${wordObj.word}" sau ${attempts} lần sai — từ này sẽ được ôn lại sớm. ${NEXT_HINT}`
      );
    } catch (err) {
      console.warn("Failed to record letter tiles review:", err);
    }
  };

  // Xử lý nộp đáp án dạng gõ (Typing)
  const handleTypingSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentItem) return;
    const item = currentItem;
    const index = currentIndex;

    if (item.kind === "word") {
      const wordObj = item.word;
      const sentence = pickExample(wordObj)?.sentence_en;
      const match = matchTypedAnswer(typedInput, wordObj.word, sentence, allWordsRef.current.map((w) => w.word));
      const expectedForm = formInSentence(sentence, wordObj.word) ?? wordObj.word;
      const correct = match !== "wrong";
      const typed = typedInput.trim().toLowerCase();
      // A synonym: the meaning was recalled, not the exact word. No penalty, but the grade becomes Hard at
      // most. Another deck word sharing a meaning with the target counts the same (as in flashcard sessions).
      const listedSynonym = parseTerms(wordObj.synonyms).some((t) => t.word.trim().toLowerCase() === typed);
      if (!correct && (listedSynonym || isCatalogSynonym(typed, wordObj))) {
        synonymTriedRef.current = true;
        setFeedbackMsg(
          listedSynonym
            ? `"${typedInput.trim()}" là từ đồng nghĩa — đúng nghĩa nhưng cần một từ khác. Thử lại!`
            : `"${typedInput.trim()}" cùng nghĩa với từ cần tìm — đúng nghĩa nhưng cần một từ khác. Thử lại!`
        );
        setTypedInput("");
        setTimeout(() => inputRef.current?.focus(), 50);
        return;
      }

      setIsAnswered(true);
      setIsCorrect(correct);

      try {
        if (correct) {
          // Any form of the word counts as recalled ("is" for "be"), but the sentence needs one form ("are"):
          // say so, as the main session does, instead of "gõ chính xác"
          const otherForm = !!sentence && normalizeTypedText(typedInput) !== normalizeTypedText(expectedForm);
          const praise = await trackSave(gradeWord(wordObj, true, typingExercise, match === "near"));
          showFeedbackFor(
            item,
            index,
            match === "near"
              ? `Gần đúng! Từ chính xác là "${expectedForm}" ✍️ ${praiseText(praise)}${NEXT_HINT}`
              : otherForm
                ? `Đúng từ rồi! Nhưng trong câu này phải dùng dạng "${expectedForm}" ✍️ ${NEXT_HINT}`
                : `${praise ? praiseText(praise) : "Tuyệt vời! Bạn đã gõ chính xác 🚀 "}${NEXT_HINT}`
          );
        } else {
          requeueItem(item);
          setFeedbackMsg(`Chưa chính xác. Đáp án đúng là: "${wordObj.word}"`);
          await trackSave(gradeWord(wordObj, false, typingExercise));
        }
      } catch (err) {
        console.warn("Failed to record typing review:", err);
      }
    } else {
      // Gõ đáp án ngữ pháp (chia động từ / điền từ)
      const ex = item.exercise;
      // Book questions: the same check as the grammar player (checkTask), so one answer is right or wrong
      // everywhere ("", "-" for a zero article; accepted alternatives; contractions)
      const correct = item.entry
        ? checkTask(item.entry.task, { kind: "typed", values: [typedInput] }).correct
        : isGrammarAnswerCorrect(typedInput, ex);

      setIsAnswered(true);
      setIsCorrect(correct);

      try {
        if (correct) {
          setNextReviewText("đã ghi nhận tiến độ");
          await trackSave(recordGrammarAnswer(item, true, false, typedInput));
          showFeedbackFor(item, index, `${praiseNow(index)} Đáp án: ${formatAnswerForms(ex)}. ${NEXT_HINT}`);
        } else {
          requeueItem(item);
          setNextReviewText("ở cuối phiên này");
          setFeedbackMsg(`Chưa chính xác. Đáp án đúng là: ${formatAnswerForms(ex)}`);
          await trackSave(recordGrammarAnswer(item, false, false, typedInput));
        }
      } catch (err) {
        console.warn("Failed to record grammar typing review:", err);
      }
    }
  };

  // Xử lý khi user chọn "Không nhớ" trong bài tập gõ từ
  const handleDontRemember = async () => {
    if (isAnswered || !currentItem) return;
    if (currentItem.kind === "word") {
      const wordObj = currentItem.word;
      setIsAnswered(true);
      setIsCorrect(false);
      requeueItem(currentItem);
      setNextReviewText("ở cuối phiên này");
      setFeedbackMsg(`Từ chính xác là: "${wordObj.word}". Hãy ghi nhớ để thử lại nhé!`);
      try {
        await trackSave(gradeWord(wordObj, false, typingExercise));
      } catch (err) {
        console.warn("Failed to record 'don't remember' review:", err);
      }
    }
  };

  // Xử lý khi user chọn bỏ qua bài tập ngữ pháp
  const handleSkipGrammar = async () => {
    if (isAnswered || !currentItem || currentItem.kind === "word") return;
    const ex = currentItem.exercise;

    setIsAnswered(true);
    setIsCorrect(false);
    requeueItem(currentItem);
    setNextReviewText("ở cuối phiên này");
    setFeedbackMsg(`Bạn đã bỏ qua câu này. Đáp án đúng là: ${formatAnswerForms(ex)}`);

    try {
      await trackSave(recordGrammarAnswer(currentItem, false, true));
    } catch (err) {
      console.warn("Failed to record grammar skip:", err);
    }
  };

  // Keyboard navigation: Esc đóng, 1-4 chọn trắc nghiệm, S hoãn, Enter/Space chuyển câu
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Snoozing: the window is about to close
      if (closingRef.current) return;
      if (summary) {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
          e.preventDefault();
          // A held Enter from the last answer must not close the summary at once
          if (e.repeat && e.key !== "Escape") return;
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

      const targetTag = (e.target as HTMLElement | null)?.tagName;
      const inTextInput = targetTag === "INPUT" || targetTag === "TEXTAREA";

      if (
        (e.key === "s" || e.key === "S") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !inTextInput &&
        // Only where letters are not answers: in letter tiles / typing, "s" is a letter of the word
        (showIntro || activeMode === "multiple_choice") &&
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
        // A held key repeats: one press moves one item
        if (!e.repeat) advanceNextItem();
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

  // Từ vựng: Nghĩa tiếng Việt & ví dụ ẩn từ theo đúng ngữ cảnh câu ví dụ
  const primaryExample = currentWord ? pickExample(currentWord) : undefined;
  const conciseMeaning = useMemo(() => {
    if (!currentWord) return "";
    return getConciseMeaning(currentWord.meaning_vn, currentWord.word, primaryExample);
  }, [currentWord, primaryExample]);
  const maskedSentence = useMemo(() => {
    if (!primaryExample?.sentence_en || !currentWord?.word) return null;
    // Every form of the word is blanked (a second occurrence would reveal the answer)
    return maskAllWordForms(primaryExample.sentence_en, currentWord.word);
  }, [primaryExample, currentWord]);
  // Typing with the example sentence shown is a cloze (as in flashcard sessions: its own slow threshold and
  // typical times), without one it is spelling
  const typingExercise: ExerciseType = maskedSentence ? "cloze" : "spelling";
  // Recognition question: the English word is the prompt (read, or heard) and the options are meanings
  const wordPrompt = activeMode === "multiple_choice" && mcDirection !== "vn_to_en";
  const listenPrompt = activeMode === "multiple_choice" && mcDirection === "listen";

  // After a wrong answer: which word was picked instead, and the stored memory hook if any
  const wrongPick = useMemo(() => {
    if (!isAnswered || isCorrect || activeMode !== "multiple_choice") return null;
    const known = describeWrongChoice(selectedChoiceId, allWordsRef.current);
    if (known) return known;
    // A sound-alike option from the whole deck is not in the session's pool: its option carries the word
    const picked = choices.find((c) => c.id === selectedChoiceId);
    return picked?.english ? { word: picked.english, meaning: picked.word } : null;
  }, [isAnswered, isCorrect, activeMode, selectedChoiceId, choices]);
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
      className={`fixed inset-0 h-[100dvh] md:h-auto z-50 flex items-center justify-center p-0 md:p-6 select-none ${
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
        className={`w-full h-full md:h-auto max-w-xl md:min-h-[500px] bg-white dark:bg-zinc-900 max-md:border-0 md:border border-slate-200/80 dark:border-zinc-800/80 rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col justify-between ${
          isNudging ? "animate-shake" : hasEntered ? "" : "popup-card-enter"
        }`}
      >
        {/* Top Header Bar */}
        <div className="px-3 md:px-6 py-2 md:py-3.5 bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3 max-md:shrink-0">
          <div className="flex items-center gap-2 max-md:min-w-0">
            <span
              className={`flex items-center justify-center w-7 h-7 max-md:shrink-0 rounded-xl text-white shadow-sm ${
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
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  {currentGrammar ? "Grammar-Quiz" : "Flash-Quiz"}
                </span>

                {queue.length > 0 && currentItem && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold border border-slate-200 dark:border-zinc-700">
                    Còn {itemsLeft(queue.length, currentIndex)} câu
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
                    <span>{currentGrammar.lesson.category}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 max-md:shrink-0">
            {/* Snooze Button */}
            <button
              onClick={() => handleSnooze()}
              title={`Hoãn nhắc nhở ${settings.snoozeMinutes} phút (Phím S)`}
              className="px-2.5 py-1.5 max-md:min-h-[40px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Hoãn</span>
              <span>{settings.snoozeMinutes}p</span>
            </button>

            {/* Quick Close Button (Esc) */}
            <button
              onClick={handleClose}
              title="Đóng cửa sổ (Phím Esc)"
              className="p-2.5 md:p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {/* Body scrolls inside the full-screen phone card; the desktop popup grows with its content */}
        <div className="p-4 md:p-6 space-y-5 flex-1 max-md:min-h-0 overflow-y-auto md:flex-none md:overflow-visible">
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
                {newBadges.length > 0 && (
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Huy hiệu mới: {newBadges.join(", ")}
                  </p>
                )}
              </div>
              {summary.items.length > 0 && (
                <ul className="rounded-2xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800 text-xs max-h-60 overflow-y-auto">
                  {summary.items.map((it) => (
                    <li key={it.key} className="px-3.5 py-2 flex items-center gap-2.5">
                      {it.correct ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-800 dark:text-zinc-200 max-md:min-w-0 truncate flex-1">{it.label}</span>
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
                className="w-full py-2.5 max-md:min-h-[40px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-2"
              >
                Đóng
                <kbd className="hidden md:inline px-1.5 py-0.5 bg-white/20 dark:bg-black/20 rounded text-[10px] font-mono">Enter</kbd>
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
                className="mt-2 px-5 py-2 max-md:min-h-[40px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
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
              <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 space-y-3">
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
                    className="p-2.5 md:p-2 rounded-full text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
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
                <kbd className="hidden md:inline px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-mono">Enter</kbd>
              </button>
              {currentWord.direction !== "production" && (currentWord.srs?.reps ?? 0) === 0 && (
                <button
                  onClick={markIntroKnown}
                  className="w-full py-2 max-md:min-h-[40px] rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  ✓ Tôi biết chắc từ này (thỉnh thoảng hỏi lại ngẫu nhiên)
                </button>
              )}
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
                    <span>{listenPrompt ? "Nghe từ tiếng Anh:" : wordPrompt ? "Từ tiếng Anh:" : "Nghĩa tiếng Việt:"}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {currentWord?.topic && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px] border border-indigo-200 dark:border-indigo-800/60">
                        {currentWord.topic}
                      </span>
                    )}
                  </div>
                </div>

                {/* Từ tiếng Anh (trắc nghiệm chọn nghĩa) hoặc nghĩa tiếng Việt */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 text-center">
                  {listenPrompt && !isAnswered ? (
                    // By ear: the word is not written until the answer (the learner presses play, never automatic)
                    <button
                      type="button"
                      onClick={() => currentWord && handleSpeak(currentWord.word)}
                      className="inline-flex items-center gap-2 px-4 py-2 max-md:min-h-[40px] rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
                    >
                      <Volume2 className="w-4 h-4" /> Nghe từ
                    </button>
                  ) : wordPrompt ? (
                    <div className="flex items-baseline justify-center gap-2.5 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {currentWord?.word}
                      </h2>
                      {currentWord?.phonetic && (
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-medium">
                          {currentWord.phonetic}
                        </span>
                      )}
                    </div>
                  ) : (
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug tracking-tight">
                      {conciseMeaning || currentWord?.meaning_vn}
                    </h2>
                  )}
                </div>

                {/* Câu ví dụ có từ (không kèm bản dịch: bản dịch lộ nghĩa) */}
                {wordPrompt && !(listenPrompt && !isAnswered) && currentWord && primaryExample?.sentence_en && (
                  <p className="px-1 text-xs italic text-slate-600 dark:text-zinc-300">
                    "{highlightWord(primaryExample.sentence_en, currentWord.word)}"
                  </p>
                )}

                {/* Ngữ cảnh trong câu với chỗ trống */}
                {!wordPrompt && maskedSentence && (
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
                    <span>{wordPrompt ? "Chọn nghĩa đúng:" : "Chọn từ tiếng Anh chính xác:"}</span>
                    <span className="hidden md:inline text-[11px] font-mono text-slate-400">Nhấn phím 1 - 4</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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

                      // A heard word, once answered: every option shows its English word and IPA and plays it,
                      // so the right word and its sound-alikes can be compared by ear
                      const heard = listenPrompt && isAnswered && Boolean(choice.english);
                      if (heard && !choice.isCorrect && !isSelected) {
                        btnStyle = "border-slate-200 dark:border-zinc-800 opacity-70 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200";
                      }

                      return (
                        <button
                          key={choice.id}
                          disabled={isAnswered && !heard}
                          onClick={() => (heard ? handleSpeak(choice.english!) : handleSelectChoice(choice))}
                          title={heard ? `Nghe "${choice.english}"` : undefined}
                          className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all duration-150 ${btnStyle} ${heard ? "cursor-pointer" : ""}`}
                        >
                          <span
                            className={`hidden md:flex w-6 h-6 shrink-0 rounded-lg items-center justify-center font-mono text-xs font-bold ${badgeStyle}`}
                          >
                            {idx + 1}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm sm:text-base font-bold tracking-tight break-words">{choice.word}</span>
                            {heard && (
                              <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs font-normal">
                                <span className="font-semibold">{choice.english}</span>
                                {choice.phonetic && (
                                  <span className="font-mono text-cyan-600 dark:text-cyan-400">{choice.phonetic}</span>
                                )}
                              </span>
                            )}
                          </span>
                          {heard && <Volume2 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />}
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
                  {listenPrompt && isAnswered && choices.some((c) => c.english) && (
                    <p className="text-[11px] text-center text-slate-400 dark:text-zinc-500">
                      Bấm vào từng đáp án để nghe và so sánh cách phát âm
                    </p>
                  )}
                </div>
              )}

              {/* Xếp chữ cái (thẻ nhớ lại còn non) */}
              {activeMode === "letter_tiles" && currentWord && !isAnswered && (
                <LetterTilesExercise
                  key={`${currentWord.id}-${currentIndex}`}
                  word={currentWord}
                  hideHeader
                  hideHints
                  onSpeak={(t) => handleSpeak(t)}
                  onComplete={(isCorrect, attempts, rating) => handleTilesComplete(attempts, rating, isCorrect)}
                />
              )}

              {/* Gõ từ vựng */}
              {activeMode === "typing" && currentWord && (
                <form onSubmit={handleTypingSubmit} autoComplete="off" className="space-y-3.5 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <span>Nhập từ tiếng Anh tương ứng:</span>

                      {/* Gợi ý (chỉ hiện khi hover vào icon) */}
                      <div className="relative group">
                        <div
                          tabIndex={0}
                          onMouseEnter={() => (hintUsedRef.current = true)}
                          onFocus={() => (hintUsedRef.current = true)}
                          className="p-2.5 md:p-1 rounded-full text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 cursor-pointer transition-colors focus:outline-none"
                          title={`Gợi ý: ${currentWord.word[0].toUpperCase()}${" · ".repeat(Math.max(0, currentWord.word.length - 1))} (${currentWord.word.length} chữ cái)`}
                        >
                          <HelpCircle className="w-4 h-4 shrink-0" />
                        </div>

                        {/* Tooltip gợi ý xuất hiện khi hover vào icon */}
                        <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:flex group-focus-within:flex flex-col items-end z-30 pointer-events-none w-max max-w-[280px] sm:max-w-xs animate-in fade-in zoom-in-95 duration-150">
                          <div className="px-3 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/95 border border-cyan-300 dark:border-cyan-800 text-cyan-900 dark:text-cyan-200 text-xs font-mono font-bold shadow-lg text-center leading-snug">
                            <span>
                              Gợi ý: {currentWord.word[0].toUpperCase()}
                              {" · ".repeat(Math.max(0, currentWord.word.length - 1))} ({currentWord.word.length} chữ cái)
                            </span>
                          </div>
                          <div className="w-2 h-2 -mt-1 mr-2 rotate-45 bg-cyan-50 dark:bg-cyan-950/95 border-r border-b border-cyan-300 dark:border-cyan-800" />
                        </div>
                      </div>
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
                        data-1p-ignore="true"
                        data-form-type="other"
                        value={typedInput}
                        onChange={(e) => setTypedInput(e.target.value)}
                        placeholder="Gõ từ tiếng Anh vào đây..."
                        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base font-bold text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all shadow-xs"
                      />
                    </div>

                    {!isAnswered && feedbackMsg && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>{feedbackMsg}</span>
                      </div>
                    )}
                  </div>

                  {!isAnswered ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={!typedInput.trim()}
                        className="flex-1 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm shadow-cyan-600/20"
                      >
                        Kiểm tra đáp án (Enter)
                      </button>
                      {currentItem.kind === "word" && (
                        <button
                          type="button"
                          onClick={handleDontRemember}
                          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold transition-all shrink-0"
                          title="Xem đáp án và học lại từ này"
                        >
                          Không nhớ
                        </button>
                      )}
                    </div>
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
                  {practiceNote && (
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">{practiceNote}</p>
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
                      className="p-2.5 md:p-1.5 rounded-full text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>

                  {!isCorrect && wrongPick && (
                    <div className="text-[11px] text-slate-700 dark:text-zinc-300">
                      {mcDirection !== "vn_to_en" ? (
                        <>
                          Bạn chọn "{wrongPick.meaning}", đó là nghĩa của từ <span className="font-bold">{wrongPick.word}</span>.
                        </>
                      ) : (
                        <>
                          Bạn chọn <span className="font-bold">{wrongPick.word}</span>, từ này nghĩa là "{wrongPick.meaning}".
                        </>
                      )}
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
                      className="w-full md:w-auto max-md:justify-center px-4 py-2.5 md:py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <span>Tiếp tục</span>
                      {nextReviewText && (
                        <span className="text-[11px] font-normal opacity-75">
                          ({nextReviewText.startsWith("ở") ? `gặp lại ${nextReviewText}` : nextReviewText.startsWith("sau") ? `gặp lại ${nextReviewText}` : nextReviewText.includes("luyện tập") || nextReviewText.includes("tiến độ") ? nextReviewText : `gặp lại sau ${nextReviewText}`})
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5" />
                      <kbd className="hidden md:inline px-1 py-0.2 bg-white/20 dark:bg-black/20 rounded text-[9px] font-mono">
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
                  {/* Header Grammar Type */}
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-violet-600 dark:text-violet-400">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>
                      Bài tập ngữ pháp (
                      {currentGrammar.exercise.type === "conjugation"
                        ? "Điền vào chỗ trống"
                        : currentGrammar.exercise.type === "error_spotting"
                        ? "Tìm lỗi sai"
                        : currentGrammar.exercise.type === "sentence_transform"
                        ? "Viết lại câu"
                        : "Trắc nghiệm"}
                      ):
                    </span>
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

                  {/* Gợi ý (chỉ hiện khi hover vào icon) */}
                  {currentGrammar.exercise.hint && (
                    <div className="flex items-center justify-center">
                      <div
                        tabIndex={0}
                        className="relative group inline-flex items-center justify-center cursor-pointer p-2.5 md:p-1 rounded-full text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors focus:outline-none"
                        title={`Gợi ý: ${currentGrammar.exercise.hint}`}
                      >
                        <HelpCircle className="w-4 h-4 shrink-0" />

                        {/* Tooltip gợi ý màu vàng chỉ hiện khi hover hoặc focus vào icon */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex group-focus:flex flex-col items-center z-30 pointer-events-none w-max max-w-[280px] sm:max-w-xs animate-in fade-in zoom-in-95 duration-150">
                          <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/95 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold shadow-lg text-center leading-snug">
                            <span>Gợi ý: {currentGrammar.exercise.hint}</span>
                          </div>
                          <div className="w-2 h-2 -mt-1 rotate-45 bg-amber-50 dark:bg-amber-950/95 border-r border-b border-amber-300 dark:border-amber-800" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Trắc nghiệm ngữ pháp */}
                {activeMode === "multiple_choice" && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <span>Chọn đáp án ngữ pháp chính xác:</span>
                      <span className="hidden md:inline text-[11px] font-mono text-slate-400">Nhấn phím 1 - 4</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
                              className={`hidden md:flex w-6 h-6 shrink-0 rounded-lg items-center justify-center font-mono text-xs font-bold ${badgeStyle}`}
                            >
                              {idx + 1}
                            </span>
                            <span className="text-sm sm:text-base font-bold flex-1 max-md:min-w-0 break-words tracking-tight">
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
                          className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition flex items-center gap-1.5 py-2.5 md:py-1 px-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
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
                  <form onSubmit={handleTypingSubmit} autoComplete="off" className="space-y-3.5 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap md:flex-nowrap gap-1 md:gap-0 justify-between items-center text-xs font-semibold text-slate-600 dark:text-zinc-400">
                        <span>Nhập đáp án hoặc dạng đúng của từ:</span>
                        <span className="text-[11px] font-mono text-violet-600 dark:text-violet-400 font-bold">
                          {currentGrammar.exercise.type === "sentence_transform"
                            ? "Ví dụ: viết lại câu hoàn chỉnh"
                            : currentGrammar.exercise.type === "error_spotting"
                            ? "Ví dụ: nhập từ dùng sai/thừa"
                            : "Ví dụ: chia thì phù hợp với chủ ngữ"}
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
                          data-1p-ignore="true"
                          data-form-type="other"
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
                      <div className="flex-1 max-md:min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                          Câu tiếng Anh chuẩn xác:
                        </span>
                        <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed break-words">
                          {grammarFullSentence}
                        </p>
                      </div>

                      <button
                        onClick={handleManualSpeak}
                        title="Nghe phát âm cả câu tiếng Anh (Nhấp để nghe)"
                        className="p-2.5 md:p-2 rounded-full text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
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
                        className="w-full md:w-auto max-md:justify-center px-4 py-2.5 md:py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <span>Tiếp tục</span>
                        {nextReviewText && (
                          <span className="text-[11px] font-normal opacity-75">
                            ({nextReviewText.startsWith("ở") ? `gặp lại ${nextReviewText}` : nextReviewText.startsWith("sau") ? `gặp lại ${nextReviewText}` : nextReviewText.includes("luyện tập") || nextReviewText.includes("tiến độ") ? nextReviewText : `gặp lại sau ${nextReviewText}`})
                          </span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5" />
                        <kbd className="hidden md:inline px-1 py-0.2 bg-white/20 dark:bg-black/20 rounded text-[9px] font-mono">
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
        <div className="hidden md:flex px-6 py-3 bg-slate-50/60 dark:bg-zinc-950/40 border-t border-slate-200/60 dark:border-zinc-800/60 items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
          <div className="flex items-center gap-3">
            {isAnswered ? (
              <span className="flex items-center gap-1.5 text-slate-800 dark:text-zinc-200 font-semibold">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                  Enter
                </kbd>
                <span>Tiếp tục</span>
                {nextReviewText && (
                  <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                    · Gặp lại: {nextReviewText}
                  </span>
                )}
              </span>
            ) : activeMode === "multiple_choice" ? (
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
            {(showIntro || activeMode === "multiple_choice") && !isAnswered && (
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                  S
                </kbd>
                <span>Hoãn {settings.snoozeMinutes}p</span>
              </span>
            )}
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
