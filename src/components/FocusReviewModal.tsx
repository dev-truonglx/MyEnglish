import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
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
} from "lucide-react";
import { getAllWords, isPlaceholderMeaning } from "@/services/db";
import { getDueWords, recordReview } from "@/services/srs";
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
} from "@/services/grammarService";
import type { WordDetail, ReviewCard } from "@/types/database";
import { getCardSrs, practiceCards } from "@/services/cards";
import { buildPopupChoices, describeWrongChoice, needsIntro, popupAnswerRating } from "@/services/popupSession";
import { summarizeSession, type SessionResult, type SessionSummary } from "@/services/progress";
import { getStoredMnemonic } from "@/services/aiMnemonic";
import { highlightWord } from "@/components/review/highlightWord";

/** The end-of-session summary closes the popup by itself after this long (ms) */
const SUMMARY_AUTO_CLOSE_MS = 15000;
/** Keyboard can't dismiss a new word's intro card sooner than this (ms) */
const INTRO_MIN_READ_MS = 800;
/** A wrong popup item comes back at most this many times */
const MAX_POPUP_RETRIES = 2;
import {
  contractionVariants,
  isGrammarAnswerCorrect,
  awardXP,
  buildReviewSession,
  calculateXPReward,
  getNewCardsIntroducedToday,
  isLeech,
  matchTypedAnswer,
  saveReviewLog,
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

/**
 * Trích xuất định nghĩa tiếng Việt ngắn gọn, súc tích và loại bỏ hoàn toàn việc lộ từ tiếng Anh
 */
export function getConciseMeaning(meaning: string, targetWord?: string): string {
  if (!meaning) return "";
  let text = meaning.trim();

  // 1. Kiểm tra cấu trúc: "Thuật ngữ (word): giải thích..." -> Lấy ngay phần "Thuật ngữ" đầu tiên
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    let head = text.substring(0, colonIdx).trim();
    if (targetWord) {
      head = head.replace(new RegExp(`\\s*\\([^)]*${escapeRegExp(targetWord)}[^)]*\\)`, "gi"), "");
      head = head.replace(new RegExp(`['"‘“\\[\\(]?${escapeRegExp(targetWord)}['"’”\\]\\)]?`, "gi"), "");
    }
    head = head.trim();
    if (head.length >= 3 && /[a-zà-ỹ]/i.test(head)) {
      return capitalize(head);
    }
  }

  // 2. Nếu có cụm tóm tắt trong ngoặc ngay sau từ tiếng Anh, ví dụ: 'dashboard' (bảng điều khiển trực quan)
  if (targetWord) {
    const bracketRegex = new RegExp(`${escapeRegExp(targetWord)}['"’”]?\\s*\\(([^)]{3,40})\\)`, "i");
    const bracketMatch = text.match(bracketRegex);
    if (bracketMatch && bracketMatch[1]) {
      const cand = bracketMatch[1].trim();
      if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(cand)) {
        return capitalize(cand);
      }
    }
  }

  // 3. Xoá bỏ triệt để từ tiếng Anh mục tiêu và các biến thể trong nháy đơn/ngoặc
  if (targetWord) {
    text = text.replace(new RegExp(`['"‘“]${escapeRegExp(targetWord)}['"’”]?`, "gi"), "");
    text = text.replace(new RegExp(`\\b${escapeRegExp(targetWord)}(?:s|es|ed|ing|d)?\\b`, "gi"), "");
  }

  // 4. Lọc bỏ các cụm từ mở đầu rườm rà
  text = text.replace(/^(Trong [^,.:;]+[,:;]?\s*)/gi, "");
  text = text.replace(/^(Trong [^,.:;]+[,:;]?\s*)/gi, ""); // Chạy lại nếu có 2 mệnh đề lồng nhau
  text = text.replace(/^(từ này|nó)?\s*(mang nghĩa là|có nghĩa là|dùng để chỉ|dùng để|là một|là)\s*/gi, "");

  // 5. Xử lý mở đầu bằng ngoặc, ví dụ: "(bảng điều khiển trực quan) là..."
  const bracketLead = text.match(/^\(([^)]+)\)\s*(là|mang nghĩa là)?\s*/i);
  if (bracketLead) {
    text = bracketLead[1].trim() + (text.substring(bracketLead[0].length).trim() ? ": " + text.substring(bracketLead[0].length).trim() : "");
  }

  // 6. Xoá các cụm ví dụ trong ngoặc như "(ví dụ: ...)", "(ngược lại với...)", "(e.g...)"
  text = text.replace(/\s*\((?:ví dụ|vd|e\.g\.|đối lập|ngược lại)[^)]*\)/gi, "");

  // 7. Lấy câu hoặc mệnh đề đầu tiên
  const sentences = text.split(/[.\n]/);
  let firstSentence = sentences[0]?.trim() || text;

  // Nếu câu đầu tiên vẫn quá dài (> 80 ký tự), tìm mệnh đề cô đọng
  if (firstSentence.length > 80) {
    const parenSummary = firstSentence.match(/\(([^)]{3,45})\)$/);
    if (parenSummary && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(parenSummary[1])) {
      firstSentence = parenSummary[1];
    } else {
      const clauses = firstSentence.split(";");
      if (clauses[0] && clauses[0].trim().length >= 15) {
        firstSentence = clauses[0].trim();
      } else {
        const firstComma = firstSentence.indexOf(",");
        if (firstComma > 25) {
          firstSentence = firstSentence.substring(0, firstComma).trim();
        }
      }
    }
  }

  // 8. Dọn dẹp khoảng trắng và dấu câu thừa
  firstSentence = firstSentence.replace(/\s+/g, " ");
  firstSentence = firstSentence.replace(/^[,:;\-–\s.()]+/g, "");
  firstSentence = firstSentence.replace(/[,:;\-–\s.]+$/g, "");

  return capitalize(firstSentence);
}

/**
 * Ẩn từ vựng trong câu ví dụ thành chỗ trống `______`
 */
export function maskWordInSentence(sentence: string, word: string): string {
  if (!sentence || !word) return sentence;
  const escaped = escapeRegExp(word);
  const regex = new RegExp(`\\b${escaped}(?:s|es|ed|ing|d)?\\b`, "gi");
  if (regex.test(sentence)) {
    return sentence.replace(regex, "______");
  }
  if (word.length >= 4) {
    const stem = escapeRegExp(word.slice(0, Math.min(word.length - 1, 5)));
    const stemRegex = new RegExp(`\\b${stem}[a-z]*\\b`, "gi");
    if (stemRegex.test(sentence)) {
      return sentence.replace(stemRegex, "______");
    }
  }
  return sentence.replace(new RegExp(escaped, "gi"), "______");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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
  // Words of the deck, to explain which word a wrong option was
  const allWordsRef = useRef<WordDetail[]>([]);

  /**
   * Note the first answer to an item. Only first answers count toward the daily goal, so retrying
   * a missed item does not inflate it. Returns whether this was the first answer.
   */
  const noteFirstAnswer = (key: string, label: string, correct: boolean, nextReview: string | null): boolean => {
    if (sessionResultsRef.current.has(key)) return false;
    sessionResultsRef.current.set(key, { key, label, correct, nextReview });
    recordDailyActivity(1);
    return true;
  };

  // Only the first answer to a card that was due when the popup opened updates FSRS; retries and
  // extra words are practice (logged + XP, schedule untouched).
  const gradeWord = async (word: ReviewCard, correct: boolean, exerciseType: ExerciseType, nearMiss = false) => {
    const responseTimeMs = Date.now() - itemStartRef.current;
    const rating = popupAnswerRating(correct, exerciseType, responseTimeMs, nearMiss);
    // The card's own direction is graded (the question type already follows it)
    const direction = word.direction;
    const cardKey = `${word.id}:${direction}`;
    const cardSrs = getCardSrs(word, direction) ?? getCardSrs(word, "recognition");
    const isScheduledReview =
      !scheduledThisSessionRef.current.has(cardKey) && !!cardSrs && new Date(cardSrs.next_review_date) <= new Date();
    let recordedDirection = direction;
    let nextReview: string | null = null;
    if (isScheduledReview) {
      scheduledThisSessionRef.current.add(cardKey);
      const result = await recordReview(word.id, rating, direction);
      recordedDirection = result.direction;
      nextReview = result.nextReviewDate;
      // Let the dashboard (another window) refresh its due counts
      emit("words-changed").catch(() => {});
    }
    noteFirstAnswer(`w:${cardKey}`, word.word, correct, nextReview);
    const wrongAttempts = correct ? 0 : 1;
    const xp = calculateXPReward(rating, exerciseType, wrongAttempts, responseTimeMs, isLeech(word.srs), wrongAttempts === 0);
    if (xp.totalXP > 0) awardXP(xp.totalXP);
    saveReviewLog({
      wordId: word.id,
      exerciseType,
      responseTimeMs,
      isCorrect: correct,
      wrongAttempts,
      rating,
      xpEarned: xp.totalXP,
      timestamp: new Date().toISOString(),
      isScheduled: isScheduledReview,
      direction: recordedDirection,
    }).catch((err) => console.warn("Popup review log save failed:", err));
  };
  const currentWord = currentItem?.kind === "word" ? currentItem.word : null;

  // New words get an introduction card before their first question (once per popup session)
  const [introduced, setIntroduced] = useState<Set<string>>(() => new Set());
  const introKey = currentWord ? `${currentWord.id}:${currentWord.direction}` : "";
  const showIntro = !!currentWord && needsIntro(currentWord) && !introduced.has(introKey) && !isAnswered;
  // Enter pressed again right after "Tiếp tục" (key held or double press) must not skip the intro
  const introShownAtRef = useRef(0);
  useEffect(() => {
    if (showIntro) introShownAtRef.current = Date.now();
  }, [showIntro, introKey]);
  const finishIntro = useCallback(() => {
    setIntroduced((prev) => new Set(prev).add(introKey));
    // The answer time starts when the question appears, not when the intro did
    itemStartRef.current = Date.now();
  }, [introKey]);
  const currentGrammar = currentItem?.kind === "grammar" ? currentItem : null;

  const handleClose = useCallback(async () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
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
      setSummary(summarizeSession(Array.from(sessionResultsRef.current.values())));
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
        grammarTarget = Math.max(1, Math.round(targetCount * 0.4));
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

      // New popup session: forget which cards were graded / retried in the previous one
      scheduledThisSessionRef.current = new Set();
      retryCountRef.current = new Map();
      setIntroduced(new Set());
      advancedFromRef.current = -1;
      sessionResultsRef.current = new Map();
      allWordsRef.current = allWords;
      setSummary(null);
      setQueue(finalQueue);
      setCurrentIndex(0);
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
    // Never show (or let keys 1-4 pick) the previous item's options
    setChoices([]);
    let cancelled = false;

    if (currentItem.kind === "word") {
      const wordObj = currentItem.word;
      // The card decides the question: recall cards are typed, recognition cards are picked among options
      setActiveMode(wordObj.direction === "production" ? "typing" : "multiple_choice");

      // Chuẩn bị 4 lựa chọn từ tiếng Anh
      getAllWords().then((all) => {
        if (cancelled) return;
        const allChoices = buildPopupChoices(
          wordObj,
          all.filter((w) => !isPlaceholderMeaning(w.meaning_vn))
        );
        setChoices(allChoices);
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
    try {
      window.speechSynthesis.cancel();
      let textToSpeak = "";
      if (currentItem.kind === "word") {
        textToSpeak = currentItem.word.word;
      } else {
        textToSpeak = isAnswered
          ? getGrammarFullCompletedSentence(currentItem.exercise)
          : currentItem.exercise.promptEn.replace(/\[([^\]]+)\]/g, "$1").replace(/_____/g, "");
      }
      if (!textToSpeak.trim()) return;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
    }
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
          await gradeWord(wordObj, true, "multiple_choice");
          setFeedbackMsg(`Chính xác! ${NEXT_HINT}`);
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

        noteFirstAnswer(`g:${ex.id}`, lesson.title, correct, null);
        if (correct) {
          recordGrammarExerciseAttempt(ex.id, true);
          await recordPracticeResult(lesson.id, 100);
          setFeedbackMsg(`Chính xác! Đáp án: ${formatAnswerForms(ex)}. ${NEXT_HINT}`);
        } else {
          recordGrammarExerciseAttempt(ex.id, false);
          await recordPracticeResult(lesson.id, 40);
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
      const match = matchTypedAnswer(typedInput, wordObj.word, wordObj.examples?.[0]?.sentence_en);
      const correct = match !== "wrong";

      setIsAnswered(true);
      setIsCorrect(correct);

      try {
        if (correct) {
          await gradeWord(wordObj, true, "spelling", match === "near");
          setFeedbackMsg(
            match === "near"
              ? `Gần đúng! Từ chính xác là "${wordObj.word}" ✍️ ${NEXT_HINT}`
              : `Tuyệt vời! Bạn đã gõ chính xác 🚀 ${NEXT_HINT}`
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
        noteFirstAnswer(`g:${ex.id}`, lesson.title, correct, null);
        if (correct) {
          recordGrammarExerciseAttempt(ex.id, true);
          await recordPracticeResult(lesson.id, 100);
          setFeedbackMsg(`Chính xác! Đáp án: ${formatAnswerForms(ex)}. ${NEXT_HINT}`);
        } else {
          recordGrammarExerciseAttempt(ex.id, false);
          await recordPracticeResult(lesson.id, 40);
          setFeedbackMsg(`Chưa chính xác. Đáp án đúng là: ${formatAnswerForms(ex)}`);
          requeueItem(currentItem);
        }
      } catch (err) {
        console.warn("Failed to record grammar typing review:", err);
      }
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

  const primaryExample = currentWord?.examples?.[0];
  const maskedSentence = useMemo(() => {
    if (!primaryExample?.sentence_en || !currentWord?.word) return null;
    return maskWordInSentence(primaryExample.sentence_en, currentWord.word);
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
          ) : currentItem.kind === "word" && showIntro && currentWord ? (
            /* Từ mới: giới thiệu từ trước khi hỏi */
            <div className="space-y-4">
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
                          value={typedInput}
                          onChange={(e) => setTypedInput(e.target.value)}
                          placeholder="Nhập từ hoặc đáp án chính xác..."
                          className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base font-bold text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all shadow-xs"
                        />
                      </div>
                    </div>

                    {!isAnswered ? (
                      <button
                        type="submit"
                        disabled={!typedInput.trim()}
                        className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm shadow-violet-600/20"
                      >
                        Kiểm tra đáp án (Enter)
                      </button>
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
