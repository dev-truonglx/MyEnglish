import { useEffect, useState, useMemo, useRef, useCallback, memo, type FormEvent } from "react";
import {
  BookOpen,
  Sparkles,
  Search,
  Volume2,
  Trash2,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Flame,
  CheckCircle,
  Code2,
  Bell,
  Play,
  LayoutGrid,
  List,
  BarChart3,
  Copy,
  Terminal,
  Target,
  Layers,
  Sun,
  Moon,
  Laptop,
  Tag,
  Folder,
  Check,
  RotateCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Download,
  GraduationCap,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getAllWords, deleteWord, updateWordTopic, PREDEFINED_TOPICS } from "@/services/db";
import { pipeline, requeuePendingWords, type PipelineItem } from "@/services/pipeline";
import { srsWorker, checkAndNotifyDueReviews, getStudyLimits } from "@/services/srs";
import { parseTerms, parseCollocations, type WordDetail, type ReviewCard } from "@/types/database";
import { getDueCards, isWordDue, practiceCards } from "@/services/cards";
import { calculateStreakAndGoal } from "@/services/streak";
import { getSavedTheme, setTheme, type ThemeMode } from "@/services/theme";
import { CURRENT_VERSION, useUpdateStore } from "@/services/updateService";
import {
  getRetrievabilityInfo,
  isLeech,
  getLeechWords,
  smartSortReviewQueue,
  buildReviewSession,
  getNewCardsIntroducedToday,
  getXPState,
  type XPState,
} from "@/services/smartReview";
import FlashcardReview from "./FlashcardReview";
import AnalyticsView from "./AnalyticsView";
import LevelUpModal from "./LevelUpModal";
import WordTableView from "./WordTableView";
import CliGuideView from "./CliGuideView";
import FocusReviewModal from "./FocusReviewModal";
import GrammarHub from "./grammar/GrammarHub";
import { getDueGrammarLessons } from "@/services/grammarService";
import {
  checkAutoReplenishEligibility,
  triggerAutoReplenish,
  type AutoReplenishSummary,
} from "@/services/autoReplenish";
import { assessUserProficiency } from "@/services/userProficiency";

const GALLERY_PAGE_SIZE = 60;
const DUE_LIST_LIMIT = 50;
const EMPTY_TERMS: ReturnType<typeof parseTerms> = [];

interface MainDashboardProps {
  onOpenQuickInputPreview?: () => void;
  onOpenReviewPopupPreview?: () => void;
}

export default function MainDashboard({
  onOpenQuickInputPreview,
  onOpenReviewPopupPreview,
}: MainDashboardProps) {
  const [words, setWords] = useState<WordDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewModalPreview, setShowReviewModalPreview] = useState(false);
  const [pipelineQueue, setPipelineQueue] = useState<PipelineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "due" | "mastered" | "leech">("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"gallery" | "table">("gallery");
  const [activeTab, setActiveTab] = useState<"library" | "capture" | "review" | "analytics" | "guide" | "grammar">("library");
  const [grammarDueCount, setGrammarDueCount] = useState<number>(0);
  const [selectedWord, setSelectedWord] = useState<WordDetail | null>(null);
  const [inputWord, setInputWord] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewSet, setReviewSet] = useState<ReviewCard[]>([]);
  // Practice sessions (no due cards / "Practice All") never change the FSRS schedule
  const [isPracticeSession, setIsPracticeSession] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<{ id: string; word: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [globalToast, setGlobalToast] = useState<{ title: string; body: string; target?: string } | null>(null);
  const [autoReplenishBanner, setAutoReplenishBanner] = useState<AutoReplenishSummary | null>(null);
  const [isQuickReplenishing, setIsQuickReplenishing] = useState(false);
  const [expandedTerms, setExpandedTerms] = useState<Record<string, boolean>>({});
  const [activityVersion, setActivityVersion] = useState(0);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getSavedTheme);
  const [xpState, setXpState] = useState<XPState>(getXPState);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentProficiency = useMemo(() => {
    return assessUserProficiency(words);
  }, [words, activityVersion]);
  const effectiveLevel = currentProficiency.effectiveLevel;

  const handleQuickReplenish = async () => {
    if (isQuickReplenishing) return;
    setIsQuickReplenishing(true);
    try {
      const res = await triggerAutoReplenish(words, true);
      if (res.success) {
        refreshWords();
      } else {
        setGlobalToast({
          title: "Thông báo sinh bài học AI",
          body: res.message,
        });
      }
    } catch (err) {
      setGlobalToast({
        title: "Lỗi kết nối Gemini CLI",
        body: "Không thể gọi Gemini CLI để sinh bài học mới. Vui lòng kiểm tra lại CLI binary.",
      });
    } finally {
      setIsQuickReplenishing(false);
    }
  };

  const {
    status: updateStatus,
    newVersion,
    downloadProgress,
    dismissed: updateDismissed,
    downloadAndInstall,
    restartApp,
    dismiss: dismissUpdate,
    checkForUpdates,
    errorMessage,
  } = useUpdateStore();

  const streakStats = useMemo(() => {
    return calculateStreakAndGoal(words);
  }, [words, activityVersion]);

  const handleThemeChange = (mode: ThemeMode) => {
    setCurrentTheme(mode);
    setTheme(mode);
  };

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  useEffect(() => {
    const onActivity = () => setActivityVersion((v) => v + 1);
    const onXPUpdate = () => setXpState(getXPState());
    window.addEventListener("myenglish-activity-updated", onActivity);
    window.addEventListener("myenglish-xp-updated", onXPUpdate);
    return () => {
      window.removeEventListener("myenglish-activity-updated", onActivity);
      window.removeEventListener("myenglish-xp-updated", onXPUpdate);
    };
  }, []);

  useEffect(() => {
    const updateDue = () => {
      setGrammarDueCount(getDueGrammarLessons().length);
    };
    updateDue();
    window.addEventListener("myenglish-grammar-updated", updateDue);
    return () => window.removeEventListener("myenglish-grammar-updated", updateDue);
  }, []);

  useEffect(() => {
    const onThemeChanged = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode }>;
      if (custom.detail?.mode) {
        setCurrentTheme(custom.detail.mode);
      }
    };
    window.addEventListener("myenglish-theme-changed", onThemeChanged);
    return () => window.removeEventListener("myenglish-theme-changed", onThemeChanged);
  }, []);

  // Auto-replenish listener (registered once)
  useEffect(() => {
    const onAutoReplenish = (e: Event) => {
      const custom = e as CustomEvent<AutoReplenishSummary>;
      if (custom.detail) {
        setAutoReplenishBanner(custom.detail);
        refreshWords();
      }
    };
    window.addEventListener("myenglish-auto-replenish-triggered", onAutoReplenish);
    return () => window.removeEventListener("myenglish-auto-replenish-triggered", onAutoReplenish);
  }, []);

  // Background eligibility check: runs once after the initial load
  const replenishCheckedRef = useRef(false);
  const replenishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordsRef = useRef<WordDetail[]>(words);
  wordsRef.current = words;
  useEffect(() => {
    return () => {
      if (replenishTimerRef.current) clearTimeout(replenishTimerRef.current);
    };
  }, []);
  useEffect(() => {
    if (replenishCheckedRef.current || loading || words.length === 0) return;
    replenishCheckedRef.current = true;
    // Timer is only cleared on unmount so later refreshes don't cancel the one-shot check
    replenishTimerRef.current = setTimeout(() => {
      const current = wordsRef.current;
      checkAutoReplenishEligibility(current)
        .then((eligibility) => {
          if (eligibility.isEligible) {
            console.log("[AutoReplenish] Đủ điều kiện tự động: Kích hoạt sinh từ vựng và bài tập mới...");
            triggerAutoReplenish(current, false);
          }
        })
        .catch((err) => console.warn("Auto-replenish eligibility check:", err));
    }, 4000);
  }, [words.length, loading]);

  const toggleTermExpanded = (termKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedTerms((prev) => ({
      ...prev,
      [termKey]: !prev[termKey],
    }));
  };

  const [expandedQueueItems, setExpandedQueueItems] = useState<Record<string, boolean>>({});

  const toggleQueueItemExpand = (wordKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedQueueItems((prev) => ({
      ...prev,
      [wordKey]: !prev[wordKey],
    }));
  };

  // Load words from SQLite
  // Only uses refs/setters, so it is safe to call from mount-time closures.
  // showLoading toggles the global spinner (initial load / manual refresh only).
  const refreshSeqRef = useRef(0);
  const refreshWords = async (opts: { showLoading?: boolean } = {}) => {
    const seq = ++refreshSeqRef.current;
    if (opts.showLoading) setLoading(true);
    try {
      const list = await getAllWords();
      // A newer refresh started meanwhile: don't let this older response overwrite it
      if (seq !== refreshSeqRef.current) return;
      setWords(list);
      // Keep the inspector in sync with the latest data
      setSelectedWord((prev) => (prev ? list.find((w) => w.id === prev.id) ?? prev : prev));
    } catch (err) {
      console.error("Failed to fetch words:", err);
    } finally {
      if (opts.showLoading) setLoading(false);
    }
  };

  // Debounced background refresh (pipeline completions)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshWords();
    }, 300);
  };

  // Auto-start requested by "open-review-tab"; consumed once words are loaded
  const [pendingAutoStart, setPendingAutoStart] = useState(false);

  useEffect(() => {
    refreshWords({ showLoading: true });
    // Resume AI analysis for words left with a placeholder meaning (app closed mid-analysis / failed)
    requeuePendingWords().catch((err) => console.warn("Requeue pending words failed:", err));
    srsWorker.start(); // Check reviews dynamically in background according to user settings

    // Subscribe to AI pipeline updates; refresh only when an item finishes (completed/failed)
    const prevStatuses = new Map<string, PipelineItem["status"]>();
    let firstSnapshot = true;
    const unsubscribePipeline = pipeline.subscribe((queue) => {
      setPipelineQueue(queue);
      let finished = false;
      for (const item of queue) {
        const prev = prevStatuses.get(item.word);
        const isTerminal = item.status === "completed" || item.status === "failed";
        if (!firstSnapshot && isTerminal && prev !== item.status) finished = true;
      }
      prevStatuses.clear();
      for (const item of queue) prevStatuses.set(item.word, item.status);
      firstSnapshot = false;
      if (finished) scheduleRefresh();
    });

    // Listen to real-time word submissions from Quick Input floating bar (Cmd+Shift+E)
    let isCancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<{ word: string }>("word-submitted", (event) => {
      if (isCancelled) return;
      const w = event.payload.word;
      setMessage(`Received "${w}" from Quick Input. Gemini AI is analyzing...`);
      pipeline.enqueue(w);
    })
      .then((fn) => {
        if (isCancelled) {
          fn();
        } else {
          unlistenFn = fn;
        }
      })
      .catch((err) => {
        console.warn("Event listener not active in preview mode:", err);
      });

    // Listen for automatic navigation to review tab triggered by notification click or window focus
    let unlistenReviewFn: (() => void) | null = null;
    let unlistenNotifFn: (() => void) | null = null;

    listen<{ auto_start?: boolean }>("open-review-tab", (event) => {
      if (isCancelled) return;
      const autoStart = event.payload?.auto_start ?? false;
      setActiveTab("review");
      setGlobalToast(null);
      if (!autoStart) setIsReviewing(false);
      // Start the session after fresh words land (this closure's handleStartReview would see stale words)
      refreshWords().finally(() => {
        if (autoStart && !isCancelled) setPendingAutoStart(true);
      });
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenReviewFn = fn;
      })
      .catch(() => { });

    listen<{ title: string; body: string; target?: string }>("desktop-notification-received", (event) => {
      if (isCancelled) return;
      setGlobalToast(event.payload);
      setTimeout(() => {
        setGlobalToast((prev) => (prev?.title === event.payload.title ? null : prev));
      }, 12000);
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenNotifFn = fn;
      })
      .catch(() => { });

    const handleOpenPreview = () => {
      if (onOpenReviewPopupPreview) {
        onOpenReviewPopupPreview();
      } else {
        setShowReviewModalPreview(true);
      }
    };
    const handleClosePreview = () => setShowReviewModalPreview(false);
    window.addEventListener("open-review-popup-preview", handleOpenPreview);
    window.addEventListener("close-review-popup-preview", handleClosePreview);

    return () => {
      isCancelled = true;
      srsWorker.stop();
      unsubscribePipeline();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      window.removeEventListener("open-review-popup-preview", handleOpenPreview);
      window.removeEventListener("close-review-popup-preview", handleClosePreview);
      if (unlistenFn) unlistenFn();
      if (unlistenReviewFn) unlistenReviewFn();
      if (unlistenNotifFn) unlistenNotifFn();
    };
  }, []);

  const handleStartReview = async (onlyDue: boolean = true, topicFilter?: string) => {
    const now = new Date();
    const matchesTopic = (w: WordDetail) =>
      !topicFilter ||
      topicFilter === "all" ||
      (w.topic || "General Tech").trim().toLowerCase() === topicFilter.trim().toLowerCase();

    const pool = words.filter(matchesTopic);
    if (pool.length === 0) return;

    let session: ReviewCard[] = [];
    if (onlyDue) {
      const due = pool.filter((w) => isWordDue(w, now));
      const newToday = await getNewCardsIntroducedToday().catch(() => 0);
      session = buildReviewSession(due, newToday, now);
    }

    if (session.length > 0) {
      setIsPracticeSession(false);
    } else {
      // Nothing due (or new-card budget used up): extra practice on the weakest words, not recorded in FSRS
      const { maxSessionSize } = getStudyLimits();
      session = practiceCards(smartSortReviewQueue(pool, now).slice(0, maxSessionSize));
      setIsPracticeSession(true);
    }

    setReviewSet(session);
    setIsReviewing(true);
    setActiveTab("review");
  };

  // Consume a pending auto-start once the latest words are available
  useEffect(() => {
    if (!pendingAutoStart || loading) return;
    setPendingAutoStart(false);
    if (words.length > 0) handleStartReview(true);
  }, [pendingAutoStart, words, loading]);

  const handleOpenReview = (autoStartFlashcard = false) => {
    setActiveTab("review");
    setGlobalToast(null);
    if (autoStartFlashcard) {
      handleStartReview(true);
    } else {
      setIsReviewing(false);
    }
  };

  const handleUpdateTopic = async (wordId: string, newTopic: string) => {
    const cleanTopic = newTopic.trim() || "General Tech";
    try {
      await updateWordTopic(wordId, cleanTopic);
      setWords((prev) =>
        prev.map((w) => (w.id === wordId ? { ...w, topic: cleanTopic } : w))
      );
      if (selectedWord && selectedWord.id === wordId) {
        setSelectedWord((prev) => (prev ? { ...prev, topic: cleanTopic } : null));
      }
      setMessage(`Đã cập nhật chủ đề sang "${cleanTopic}"!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update topic:", err);
      setMessage(`Lỗi cập nhật chủ đề: ${err}`);
    }
  };

  const topicStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of words) {
      const t = (w.topic || "General Tech").trim();
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [words]);

  const availableTopics = useMemo(() => {
    return Object.keys(topicStats).sort((a, b) => {
      const diff = (topicStats[b] || 0) - (topicStats[a] || 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  }, [topicStats]);

  const handleTestNotification = async () => {
    try {
      const count = await checkAndNotifyDueReviews(true);
      setMessage(
        count > 0
          ? `Đã gửi thông báo nhắc ôn tập ${count} từ vựng!`
          : "Đã gửi thông báo nhắc ôn tập! Hãy nhấp vào thông báo để mở màn hình ôn tập."
      );
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage(`Lỗi gửi thông báo: ${err}`);
    }
  };

  // Text-To-Speech Pronunciation
  const handleSpeak = useCallback((text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Submit word manually
  const handleCaptureSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = inputWord.trim();
    if (!clean) return;

    setMessage(`Analyzing "${clean}" with Gemini CLI...`);
    setInputWord("");
    pipeline.enqueue(clean);
  };

  // Request delete word (opens in-app modal instead of broken window.confirm)
  const requestDeleteWord = useCallback((wordId: string, wordText: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWordToDelete({ id: wordId, word: wordText });
  }, []);

  const handleConfirmDelete = async () => {
    if (!wordToDelete) return;
    setIsDeleting(true);
    try {
      await deleteWord(wordToDelete.id);
      if (selectedWord?.id === wordToDelete.id) {
        setSelectedWord(null);
      }
      setMessage(`Đã xoá từ "${wordToDelete.word}" khỏi thư viện.`);
      setWordToDelete(null);
      await refreshWords();
    } catch (err) {
      console.error("Failed to delete word:", err);
      setMessage(`Lỗi khi xoá từ: ${err}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleQuickInput = async () => {
    try {
      await invoke("toggle_quick_input");
    } catch {
      if (onOpenQuickInputPreview) {
        onOpenQuickInputPreview();
      }
    }
  };

  // Ticks every minute so "due" computations don't freeze at the last words change
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Filter & Search Logic
  const filteredWords = useMemo(() => {
    const now = new Date(nowTick);
    return words.filter((item) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.word.toLowerCase().includes(q) ||
        item.meaning_vn.toLowerCase().includes(q) ||
        item.synonyms.toLowerCase().includes(q) ||
        (item.topic && item.topic.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Topic filter
      if (selectedTopic !== "all") {
        const itemTopic = (item.topic || "General Tech").trim().toLowerCase();
        if (itemTopic !== selectedTopic.toLowerCase()) {
          return false;
        }
      }

      // Filter pills
      if (filterMode === "due") {
        return isWordDue(item, now);
      }
      if (filterMode === "mastered") {
        return item.srs.interval >= 6;
      }
      if (filterMode === "leech") {
        return isLeech(item.srs);
      }
      return true;
    });
  }, [words, searchQuery, filterMode, selectedTopic, nowTick]);

  // Single pass over words: due/learned/leech counts and per-topic {total, due}
  const libraryStats = useMemo(() => {
    const now = new Date(nowTick);
    const leechIds = new Set(getLeechWords(words).map((w) => w.id));
    const dueWords: WordDetail[] = [];
    const perTopic: Record<string, { total: number; due: number }> = {};
    let learnedCount = 0;
    for (const w of words) {
      const isDue = isWordDue(w, now);
      if (isDue) dueWords.push(w);
      if (w.srs.repetitions > 0) learnedCount++;
      const key = (w.topic || "General Tech").trim().toLowerCase();
      const entry = perTopic[key] || (perTopic[key] = { total: 0, due: 0 });
      entry.total++;
      if (isDue) entry.due++;
    }
    return { dueWords, learnedCount, leechCount: leechIds.size, perTopic };
  }, [words, nowTick]);

  // Due review count
  const dueCount = libraryStats.dueWords.length;

  // Per-card derived data (parsed synonyms + FSRS retrievability), computed once per words change
  const cardMeta = useMemo(() => {
    const now = new Date(nowTick);
    const leechIds = new Set(getLeechWords(words).map((w) => w.id));
    const meta = new Map<string, WordCardMeta>();
    for (const w of words) {
      meta.set(w.id, {
        synonyms: parseTerms(w.synonyms),
        rInfo: getRetrievabilityInfo(w.srs, now),
        leech: leechIds.has(w.id),
      });
    }
    return meta;
  }, [words, nowTick]);

  // Gallery pagination (reset when filters/search change)
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(GALLERY_PAGE_SIZE);
  }, [searchQuery, filterMode, selectedTopic]);
  const visibleWords = useMemo(() => filteredWords.slice(0, visibleCount), [filteredWords, visibleCount]);

  // Keyboard-first Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isReviewing || wordToDelete) return;

      const isTyping =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // '/' to focus search input
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Escape closes drawer or clears search
      if (e.key === "Escape") {
        if (selectedWord) {
          setSelectedWord(null);
        } else if (isTyping) {
          (e.target as HTMLElement).blur();
          if (searchQuery) setSearchQuery("");
        }
        return;
      }

      if (isTyping) return;

      // 'r' to start due reviews
      if (e.key.toLowerCase() === "r" && activeTab === "library") {
        e.preventDefault();
        handleStartReview(true);
        return;
      }

      // 'j' or ArrowDown to move to next word card
      if ((e.key.toLowerCase() === "j" || e.key === "ArrowDown") && filteredWords.length > 0) {
        e.preventDefault();
        if (!selectedWord) {
          setSelectedWord(filteredWords[0]);
        } else {
          const curIdx = filteredWords.findIndex((w) => w.id === selectedWord.id);
          if (curIdx < filteredWords.length - 1) {
            setSelectedWord(filteredWords[curIdx + 1]);
          }
        }
        return;
      }

      // 'k' or ArrowUp to move to previous word card
      if ((e.key.toLowerCase() === "k" || e.key === "ArrowUp") && filteredWords.length > 0) {
        e.preventDefault();
        if (!selectedWord) {
          setSelectedWord(filteredWords[0]);
        } else {
          const curIdx = filteredWords.findIndex((w) => w.id === selectedWord.id);
          if (curIdx > 0) {
            setSelectedWord(filteredWords[curIdx - 1]);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReviewing, wordToDelete, selectedWord, filteredWords, searchQuery, activeTab]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans selection:bg-cyan-500 selection:text-white relative">
      {/* GLOBAL NOTIFICATION INTERACTIVE TOAST */}
      {globalToast && (
        <div
          onClick={() => handleOpenReview(false)}
          className="fixed top-5 right-5 z-50 max-w-sm w-full bg-white dark:bg-zinc-900 border-2 border-orange-500/80 rounded-2xl shadow-2xl p-4 flex items-start gap-3 cursor-pointer hover:scale-[1.02] hover:shadow-orange-500/20 transition-all animate-in slide-in-from-top-4 duration-300 backdrop-blur-xl"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">{globalToast.title}</h4>
              <span className="text-[10px] text-orange-500 font-mono font-semibold">Ôn tập ngay →</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">{globalToast.body}</p>
            <div className="mt-2.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenReview(true);
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Mở Flashcard ôn tập ngay</span>
              </button>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setGlobalToast(null);
            }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SMART AUTO-REPLENISH BANNER NOTIFICATION */}
      {autoReplenishBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[92%] bg-white dark:bg-zinc-900 border-2 border-cyan-500/90 rounded-2xl shadow-2xl p-4 flex items-start gap-3.5 animate-in slide-in-from-top-4 duration-300 backdrop-blur-xl">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/30">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                🎉 Đã Tự Động Bổ Sung Bài Học Cấp Độ [{autoReplenishBanner.level}]
              </h4>
              <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-300 dark:border-cyan-800">
                AI Adaptive
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
              Bạn đang học rất chăm chỉ! Hệ thống vừa tự động bổ sung <strong>{autoReplenishBanner.words.length} từ vựng mới</strong> ({autoReplenishBanner.words.join(", ")})
              {autoReplenishBanner.grammarTopic ? ` & bài tập ngữ pháp "${autoReplenishBanner.grammarTopic}"` : ""}.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab("library");
                  setAutoReplenishBanner(null);
                }}
                className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Xem kho từ vựng</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("analytics");
                  setAutoReplenishBanner(null);
                }}
                className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-semibold text-xs transition-colors"
              >
                Xem đánh giá CEFR
              </button>
            </div>
          </div>
          <button
            onClick={() => setAutoReplenishBanner(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <aside className="w-64 border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 flex flex-col justify-between shrink-0 select-none">
        {/* Top Header */}
        <div className="p-4 space-y-6">
          {/* Logo & App title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  MyEnglish
                </h1>

                {/* Interactive Version Badge / Check Update Button */}
                {updateStatus === "checking" ? (
                  <span
                    title="Đang kiểm tra..."
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 shrink-0"
                  >
                    <RotateCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </span>
                ) : updateStatus === "up-to-date" ? (
                  <span
                    title={`Bản mới nhất (v${CURRENT_VERSION})`}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300/80 dark:border-emerald-700/80 text-emerald-600 dark:text-emerald-400 shrink-0 animate-in fade-in zoom-in-95 duration-200"
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span>Bản mới nhất</span>
                  </span>
                ) : updateStatus === "error" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      checkForUpdates(true);
                    }}
                    title={errorMessage || "Lỗi kiểm tra"}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shrink-0 cursor-pointer"
                  >
                    <AlertCircle className="w-2.5 h-2.5" />
                    <span>Lỗi kiểm tra</span>
                  </button>
                ) : updateStatus === "available" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadAndInstall();
                    }}
                    title={`Đã có bản cập nhật mới: v${newVersion}`}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-600 text-white shadow-sm shadow-cyan-600/30 hover:bg-cyan-700 transition-all shrink-0 cursor-pointer animate-pulse"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>v{newVersion}</span>
                  </button>
                ) : updateStatus === "downloading" ? (
                  <span
                    title={`Đang tải... ${downloadProgress}%`}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 shrink-0"
                  >
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>{downloadProgress}%</span>
                  </span>
                ) : updateStatus === "downloaded" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      restartApp();
                    }}
                    title="Khởi động lại ngay để hoàn tất cập nhật"
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700 transition-all shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Khởi động lại</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      checkForUpdates(true);
                    }}
                    title={`Kiểm tra bản cập nhật (v${CURRENT_VERSION})`}
                    className="group/badge inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200/60 dark:border-cyan-800/60 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100/80 dark:hover:bg-cyan-900/60 hover:border-cyan-300/80 dark:hover:border-cyan-700/80 active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    <span>v{CURRENT_VERSION}</span>
                    <RotateCw className="w-2.5 h-2.5 opacity-50 group-hover/badge:opacity-100 group-hover/badge:rotate-180 transition-all duration-300" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Contextual Tech Vocab</p>
            </div>
          </div>

          {/* In-App Auto-Update Widget */}
          {!updateDismissed &&
            (updateStatus === "available" ||
              updateStatus === "downloading" ||
              updateStatus === "downloaded" ||
              updateStatus === "error") && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/5 dark:from-cyan-950/70 dark:via-blue-950/60 dark:to-zinc-900 border border-cyan-500/20 dark:border-cyan-500/30 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-zinc-100 min-w-0">
                    {updateStatus === "downloaded" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : updateStatus === "downloading" ? (
                      <Loader2 className="w-4 h-4 text-cyan-500 animate-spin shrink-0" />
                    ) : updateStatus === "error" ? (
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
                    )}
                    <span className="truncate">
                      {updateStatus === "downloaded"
                        ? "Đã cập nhật xong!"
                        : updateStatus === "downloading"
                          ? `Đang tải... ${downloadProgress}%`
                          : updateStatus === "error"
                            ? (errorMessage || "Lỗi cập nhật")
                            : `Đã có bản cập nhật mới: v${newVersion}`}
                    </span>
                  </div>
                  <button
                    onClick={dismissUpdate}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5 rounded transition-colors shrink-0 cursor-pointer"
                    title="Bỏ qua"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {updateStatus === "downloading" && (
                  <div className="w-full bg-slate-200/80 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-600 dark:bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                )}

                {updateStatus === "available" && (
                  <button
                    onClick={downloadAndInstall}
                    className="w-full py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98] text-white text-xs font-semibold shadow-sm shadow-cyan-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Cập nhật ngay</span>
                  </button>
                )}

                {updateStatus === "downloaded" && (
                  <button
                    onClick={restartApp}
                    className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Khởi động lại</span>
                  </button>
                )}

                {updateStatus === "error" && (
                  <button
                    onClick={downloadAndInstall}
                    className="w-full py-1 px-2 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-xs text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
                  >
                    Thử lại
                  </button>
                )}
              </div>
            )}

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("library")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "library"
                ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4" />
                <span>Vocabulary Library</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                {words.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("capture")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "capture"
                ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4" />
                <span>Quick Add (Gemini AI)</span>
              </div>
              {pipelineQueue.some((i) => i.status === "analyzing") && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveTab("review")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "review"
                ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>Daily Review (SM-2)</span>
              </div>
              {dueCount > 0 && (
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-semibold animate-pulse">
                  {dueCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("grammar")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "grammar"
                ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <GraduationCap className="w-4 h-4 text-cyan-500" />
                <span>Grammar (A1-C1)</span>
              </div>
              {grammarDueCount > 0 ? (
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-semibold animate-pulse">
                  {grammarDueCount}
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                  CEFR
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "analytics"
                ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Streak & Heatmap</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab("guide")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "guide"
                ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-cyan-500" />
                <span>Settings</span>
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                Setup
              </span>
            </button>
          </nav>

          {/* Quick Learning Stats Widget */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-slate-800 dark:text-zinc-300">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>Streak & Tiến độ</span>
              </span>
              <span className="font-mono text-orange-600 dark:text-orange-400 text-xs font-bold">
                🔥 {streakStats.currentStreak} ngày
              </span>
            </div>

            {/* Daily Goal Progress Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                <span>Mục tiêu hôm nay</span>
                <span>
                  {streakStats.todayCount}/{streakStats.dailyGoal} từ
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${streakStats.goalReached ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-cyan-500"
                    }`}
                  style={{ width: `${streakStats.goalPercentage}%` }}
                />
              </div>
            </div>

            {/* XP Level Progress */}
            <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-zinc-800/50">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <span>{xpState.rankEmoji}</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">Lv.{xpState.level} {xpState.rank}</span>
                </span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">{xpState.totalXP} XP</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-amber-200/40 dark:bg-amber-900/30 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-500"
                  style={{ width: `${xpState.progressPercent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">{dueCount}</div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">Cần ôn</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {libraryStats.learnedCount}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">Đã thuộc</div>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
                <div className={`text-base font-bold font-mono ${libraryStats.leechCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-zinc-500"}`}>
                  {libraryStats.leechCount}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">Leech</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom OS Shortcut Tip & Theme Switcher */}
        <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30 space-y-2.5">
          <button
            onClick={handleToggleQuickInput}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors text-left shadow-sm"
          >
            <div>
              <div className="text-xs font-medium text-slate-800 dark:text-zinc-200">Quick Input</div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Phím tắt toàn cục</div>
            </div>
            <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
              ⌘⇧E
            </kbd>
          </button>

          {/* Theme Selector */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
            {/* Segmented Control */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                title="Giao diện sáng (Light)"
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${currentTheme === "light"
                  ? "bg-white text-amber-700 border border-slate-200 shadow-sm"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  }`}
              >
                <Sun className="w-3 h-3" />
                <span>Sáng</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                title="Giao diện tối (Dark)"
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${currentTheme === "dark"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  }`}
              >
                <Moon className="w-3 h-3" />
                <span>Tối</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                title="Theo hệ thống (System)"
                className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-all ${currentTheme === "system"
                  ? "bg-white dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/40 shadow-sm"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  }`}
              >
                <Laptop className="w-3 h-3" />
                <span>Hệ thống</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-zinc-950">
        {/* Top App Bar */}
        <header className="h-14 border-b border-slate-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/40 px-6 flex items-center justify-between shrink-0 backdrop-blur-md">
          {/* Search Bar */}
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm từ, nghĩa, hoặc từ đồng nghĩa... (nhấn / để tìm)"
              className="w-full bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-lg pl-9 pr-14 py-1.5 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-mono text-slate-400 dark:text-zinc-500 pointer-events-none">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-400">/</kbd>
              </div>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3">
            {/* Streak & Daily Goal Quick Indicator */}
            <button
              onClick={() => setActiveTab("analytics")}
              title={`Chuỗi: ${streakStats.currentStreak} ngày • Hôm nay: ${streakStats.todayCount}/${streakStats.dailyGoal} từ (Click để xem chi tiết)`}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-xs transition-colors shadow-sm"
            >
              <div className="flex items-center gap-1 font-mono font-bold text-orange-600 dark:text-orange-400">
                <Flame className="w-3.5 h-3.5" />
                <span>{streakStats.currentStreak}</span>
              </div>
              <div className="w-[1px] h-3 bg-slate-200 dark:bg-zinc-800" />
              <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-zinc-300">
                <Target className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {streakStats.todayCount}/{streakStats.dailyGoal}
                </span>
                {streakStats.goalReached && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
            </button>
            {/* View Mode Toggle (Gallery vs Data Grid Table) */}
            {activeTab === "library" && (
              <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800">
                <button
                  onClick={() => setViewMode("gallery")}
                  title="Card Gallery View"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "gallery"
                    ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-transparent"
                    : "text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200"
                    }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  title="Data Grid Table View"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "table"
                    ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-transparent"
                    : "text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200"
                    }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-300 dark:border-zinc-800">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterMode === "all"
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-transparent font-medium"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                  }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterMode("due")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${filterMode === "due"
                  ? "bg-white dark:bg-zinc-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200 dark:border-transparent font-medium"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                  }`}
              >
                Due
                {dueCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                )}
              </button>
              <button
                onClick={() => setFilterMode("mastered")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterMode === "mastered"
                  ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-transparent font-medium"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                  }`}
              >
                Mastered
              </button>
              <button
                onClick={() => setFilterMode("leech")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${filterMode === "leech"
                  ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-transparent font-medium"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                  }`}
              >
                🐛 Leech
                {libraryStats.leechCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={() => refreshWords({ showLoading: true })}
              disabled={loading}
              title="Refresh vocabulary"
              className="p-1.5 rounded-lg border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-600 dark:text-cyan-400" : ""}`} />
            </button>

            {/* Quick Auto-Replenish Button */}
            <button
              onClick={handleQuickReplenish}
              disabled={isQuickReplenishing}
              title={`Tự động sinh 3 từ vựng & bài tập ngữ pháp chuẩn cấp độ ${effectiveLevel}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isQuickReplenishing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang sinh...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                  <span>Bổ sung ngay</span>
                  <span className="text-[10px] bg-black/25 text-white px-1.5 py-0.5 rounded font-mono font-bold">
                    {effectiveLevel}
                  </span>
                </>
              )}
            </button>

            {/* Add Word Button */}
            <button
              onClick={() => setActiveTab("capture")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Word</span>
            </button>
          </div>
        </header>

        {/* TAB 1: VOCABULARY LIBRARY */}
        {activeTab === "library" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Notification alert if any */}
            {message && (
              <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800 text-cyan-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{message}</span>
                </div>
                <button onClick={() => setMessage(null)} className="text-cyan-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Topic Filter & Organization Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none py-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 font-mono shrink-0 pr-1 select-none">
                <Folder className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Chủ đề:</span>
              </div>

              {/* All Topics */}
              <button
                onClick={() => setSelectedTopic("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 ${selectedTopic === "all"
                  ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/50 shadow-sm font-semibold"
                  : "bg-white dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 shadow-sm"
                  }`}
              >
                <span>Tất cả</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/50">
                  {words.length}
                </span>
              </button>

              {/* Each Topic */}
              {availableTopics.map((top) => {
                const isSelected = selectedTopic.toLowerCase() === top.toLowerCase();
                const count = topicStats[top] || 0;
                return (
                  <button
                    key={top}
                    onClick={() => setSelectedTopic(isSelected ? "all" : top)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 ${isSelected
                      ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/50 shadow-sm font-semibold"
                      : "bg-white dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 shadow-sm"
                      }`}
                  >
                    <Tag className="w-3 h-3 opacity-70" />
                    <span>{top}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/50">
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* Quick Topic Review button */}
              {selectedTopic !== "all" && (
                <button
                  onClick={() => handleStartReview(false, selectedTopic)}
                  className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-300 border border-orange-500/40 hover:bg-orange-500/30 text-xs font-medium transition-all shadow-sm"
                >
                  <Play className="w-3 h-3 fill-orange-400 text-orange-400" />
                  <span>Ôn tập chủ đề này ({topicStats[selectedTopic] || 0})</span>
                </button>
              )}
            </div>

            {/* Words Grid or Table View */}
            {filteredWords.length > 0 ? (
              viewMode === "table" ? (
                <WordTableView
                  words={filteredWords}
                  onSelectWord={setSelectedWord}
                  onDeleteWord={requestDeleteWord}
                  resetKey={`${searchQuery}|${filterMode}|${selectedTopic}`}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleWords.map((item) => (
                    <WordCard
                      key={item.id}
                      item={item}
                      meta={cardMeta.get(item.id)}
                      isSelected={selectedWord?.id === item.id}
                      onSelect={setSelectedWord}
                      onSpeak={handleSpeak}
                      onDelete={requestDeleteWord}
                    />
                  ))}
                  {filteredWords.length > visibleWords.length && (
                    <div className="col-span-full flex justify-center pt-2">
                      <button
                        onClick={() => setVisibleCount((c) => c + GALLERY_PAGE_SIZE)}
                        className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-medium transition-colors shadow-sm"
                      >
                        Xem thêm ({filteredWords.length - visibleWords.length} từ còn lại)
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : (
              /* EMPTY STATE */
              <div className="text-center py-20 max-w-md mx-auto space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500 shadow-inner">
                  <BookOpen className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">No vocabulary words found</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    {searchQuery
                      ? "No words match your search filter. Try clearing the search box."
                      : "Start capturing developer terms while coding with the global shortcut or Quick Add."}
                  </p>
                </div>

                {!searchQuery && (
                  <div className="space-y-3 pt-2">
                    <button
                      onClick={() => setActiveTab("capture")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Your First Word
                    </button>
                    <div className="text-xs text-slate-500 dark:text-zinc-500">
                      Or press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono text-slate-700 dark:text-zinc-300">⌘⇧E</kbd> anywhere on macOS
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: QUICK CAPTURE & AI PIPELINE */}
        {activeTab === "capture" && (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-8">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">AI Vocabulary Enrichment</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Input any English word. Gemini CLI will automatically break down the Vietnamese meaning, tech context, and 3 code examples with grammar analysis.
              </p>
            </div>

            {/* Input Card */}
            <form onSubmit={handleCaptureSubmit} className="space-y-4">
              <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-2.5 md:p-3 shadow-xl shadow-slate-200/50 dark:shadow-cyan-950/30 backdrop-blur-md flex items-center gap-3 transition-all focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={inputWord}
                  onChange={(e) => setInputWord(e.target.value)}
                  placeholder="Nhập từ tiếng Anh (e.g. idempotent, telemetry, volatile, sanitize)..."
                  className="flex-1 bg-transparent px-1 py-2 text-sm md:text-base text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none font-mono"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!inputWord.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:pointer-events-none shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Phân tích & Lưu</span>
                </button>
              </div>

              {/* Sample Suggestions */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-zinc-400 flex-wrap">
                <span>Gợi ý mẫu:</span>
                {["idempotent", "concurrency", "telemetry", "deterministic", "throughput"].map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setInputWord(term);
                      pipeline.enqueue(term);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 font-mono text-[11px] transition-colors shadow-sm"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </form>

            {/* Live Pipeline Queue */}
            {pipelineQueue.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Hàng đợi phân tích AI
                </h3>
                <div className="space-y-3">
                  {pipelineQueue.map((item, idx) => {
                    const enrichedData =
                      item.result ||
                      (() => {
                        const match = words.find(
                          (w) =>
                            (item.wordId && w.id === item.wordId) ||
                            w.word.toLowerCase() === item.word.toLowerCase()
                        );
                        if (!match) return null;
                        return {
                          phonetic: match.phonetic || undefined,
                          part_of_speech: match.part_of_speech || undefined,
                          topic: match.topic || undefined,
                          meaning_vn: match.meaning_vn,
                          collocations: parseCollocations(match.collocations),
                          code_snippet: match.code_snippet || undefined,
                          synonyms: parseTerms(match.synonyms),
                          antonyms: parseTerms(match.antonyms),
                          examples: match.examples.map((ex) => ({
                            sentence_en: ex.sentence_en,
                            sentence_vn: ex.sentence_vn,
                            grammar_analysis: ex.grammar_analysis,
                          })),
                        };
                      })();

                    const isExpanded = !!expandedQueueItems[item.word];
                    const matchingWord = words.find(
                      (w) =>
                        (item.wordId && w.id === item.wordId) ||
                        w.word.toLowerCase() === item.word.toLowerCase()
                    );

                    // MẶC ĐỊNH THU GỌN KHI ĐÃ HOÀN TẤT SINH TỪ (Chỉ mở ra khi user click)
                    if (!isExpanded && enrichedData && item.status !== "analyzing") {
                      return (
                        <div
                          key={idx}
                          onClick={(e) => toggleQueueItemExpand(item.word, e)}
                          className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 space-y-2 shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all pr-14 cursor-pointer select-none"
                        >
                          {/* Nút xổ ra luôn cố định ở góc trên phải */}
                          <button
                            type="button"
                            onClick={(e) => toggleQueueItemExpand(item.word, e)}
                            title="Bấm để mở rộng chi tiết"
                            className="absolute top-3.5 right-3.5 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors z-10 shadow-sm"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>

                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono text-base font-bold text-slate-900 dark:text-white capitalize">
                                {item.word}
                              </span>
                              {enrichedData.phonetic && (
                                <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">
                                  {enrichedData.phonetic}
                                </span>
                              )}
                              {enrichedData.part_of_speech && (
                                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                                  {enrichedData.part_of_speech}
                                </span>
                              )}
                              {enrichedData.topic && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 flex items-center gap-1">
                                  <Tag className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400" />
                                  <span>{enrichedData.topic}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSpeak(item.word);
                                }}
                                title="Phát âm từ này"
                                className="p-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 transition-colors"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                              {matchingWord && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedWord(matchingWord);
                                    setActiveTab("library");
                                  }}
                                  title="Xem chi tiết trong Thư viện"
                                  className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 text-[11px] font-medium flex items-center gap-1 shadow-sm"
                                >
                                  <BookOpen className="w-3 h-3 text-cyan-500" />
                                  <span>Thư viện</span>
                                </button>
                              )}
                              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full border bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300">
                                Saved to Library ✓
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-zinc-300">
                            <span className="text-cyan-700 dark:text-cyan-400 font-medium">Nghĩa: </span>
                            {enrichedData.meaning_vn}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-5 shadow-sm transition-all pr-14"
                      >
                        {/* Nút thu gọn thẻ luôn cố định ở góc trên phải */}
                        {enrichedData && (
                          <button
                            type="button"
                            onClick={(e) => toggleQueueItemExpand(item.word, e)}
                            title="Bấm để thu gọn thẻ"
                            className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors z-10 shadow-sm"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                        )}

                        {/* Header Bar */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800/80 flex-wrap gap-2">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono text-xl font-black text-slate-900 dark:text-white capitalize tracking-tight">
                              {item.word}
                            </span>
                            {enrichedData?.phonetic && (
                              <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">
                                {enrichedData.phonetic}
                              </span>
                            )}
                            {enrichedData?.part_of_speech && (
                              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                                {enrichedData.part_of_speech}
                              </span>
                            )}
                            {enrichedData?.topic && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 shadow-sm flex items-center gap-1">
                                <Tag className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                                <span>{enrichedData.topic}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {enrichedData && (
                              <button
                                type="button"
                                onClick={() => handleSpeak(item.word)}
                                title="Phát âm từ này"
                                className="px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 transition-colors flex items-center gap-1 text-xs font-medium shadow-sm"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>Phát âm</span>
                              </button>
                            )}

                            {matchingWord && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedWord(matchingWord);
                                  setActiveTab("library");
                                }}
                                title="Xem chi tiết đầy đủ trong Thư viện"
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 transition-colors flex items-center gap-1 text-xs font-medium shadow-sm"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-cyan-500" />
                                <span>Thư viện</span>
                              </button>
                            )}

                            <span
                              className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${item.status === "analyzing"
                                ? "bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 animate-pulse"
                                : item.status === "completed"
                                  ? "bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                                  : "bg-rose-100 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300"
                                }`}
                            >
                              {item.status === "analyzing" && "Analyzing with Gemini..."}
                              {item.status === "completed" && "Saved to Library ✓"}
                              {item.status === "failed" && "Failed"}
                              {item.status === "pending" && "Queued"}
                            </span>

                            {item.status === "failed" && (
                              <button
                                type="button"
                                onClick={() => pipeline.retry(item.word)}
                                title="Thử lại phân tích AI"
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 transition-colors flex items-center gap-1 text-xs font-medium shadow-sm"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>Thử lại</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Analyzing Banner */}
                        {item.status === "analyzing" && (
                          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs">
                            <Sparkles className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                            <span>Gemini AI đang phân tích nghĩa, phát âm, từ đồng nghĩa, trái nghĩa và cấu trúc ví dụ...</span>
                          </div>
                        )}

                        {item.error && <p className="text-xs text-rose-400">{item.error}</p>}

                        {/* Complete Analysis Breakdown */}
                        {enrichedData && (
                          <div className="space-y-5 animate-in fade-in duration-200">
                            {/* 1. Vietnamese Meaning Card */}
                            <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-1.5 shadow-sm">
                              <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] font-semibold uppercase tracking-wider">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Ý nghĩa Tiếng Việt (Chuyên ngành & Đời sống)</span>
                              </div>
                              <p className="text-sm text-slate-800 dark:text-zinc-200 font-normal leading-relaxed">
                                {enrichedData.meaning_vn}
                              </p>
                            </div>

                            {/* 2. Collocations */}
                            {enrichedData.collocations && enrichedData.collocations.length > 0 && (
                              <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-2">
                                <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  Cụm từ thường gặp (Collocations):
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {enrichedData.collocations.map((c, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/70 text-slate-800 dark:text-zinc-200 font-mono text-xs hover:border-cyan-500/50 transition-colors"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 3. Synonyms Section */}
                            {enrichedData.synonyms && enrichedData.synonyms.length > 0 && (
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    Từ đồng nghĩa (Synonyms):
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                                    {enrichedData.synonyms.length} từ • click để xem phân tích
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2.5">
                                  {enrichedData.synonyms.map((s, sIdx) => {
                                    const termKey = `queue-${item.word}-syn-${s.word}`;
                                    const isExpanded = !!expandedTerms[termKey];
                                    const hasExamples = s.examples && s.examples.length > 0;

                                    return (
                                      <div
                                        key={sIdx}
                                        className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                                          ? "bg-emerald-50/40 dark:bg-zinc-900 border-emerald-400 dark:border-emerald-500/60 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                                          : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                                          }`}
                                      >
                                        {/* Synonym Header */}
                                        <div
                                          onClick={(e) => toggleTermExpanded(termKey, e)}
                                          className="p-3.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                                {s.word}
                                              </span>
                                              {s.phonetic && (
                                                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400/90 bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-0.2 rounded">
                                                  {s.phonetic}
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                onClick={(e) => handleSpeak(s.word, e)}
                                                title="Phát âm"
                                                className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded transition-colors"
                                              >
                                                <Volume2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                            {s.meaning_vn && (
                                              <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
                                                {s.meaning_vn}
                                              </p>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0 text-slate-400 dark:text-zinc-400">
                                            {hasExamples ? (
                                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium">
                                                {s.examples!.length} câu ví dụ
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400">
                                                Chi tiết
                                              </span>
                                            )}
                                            <div className="p-1 rounded text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white transition-colors">
                                              {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                              ) : (
                                                <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Synonym Body */}
                                        {isExpanded && (
                                          <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                                            {hasExamples ? (
                                              <div className="space-y-3 pt-2">
                                                {s.examples!.map((ex, exIdx) => (
                                                  <div
                                                    key={exIdx}
                                                    className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                                  >
                                                    <div className="flex items-start justify-between gap-2">
                                                      <div className="flex items-start gap-2">
                                                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[11px] shrink-0 mt-0.5">
                                                          #{exIdx + 1}
                                                        </span>
                                                        <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                          "{ex.sentence_en}"
                                                        </p>
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                                        title="Nghe câu"
                                                        className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded shrink-0"
                                                      >
                                                        <Volume2 className="w-3.5 h-3.5" />
                                                      </button>
                                                    </div>

                                                    {ex.meaning_vn && (
                                                      <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                                        <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                                          📖 Ý nghĩa của câu:
                                                        </span>
                                                        {ex.meaning_vn}
                                                      </div>
                                                    )}

                                                    {ex.structure && (
                                                      <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-200 font-mono leading-relaxed">
                                                        <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5 font-sans">
                                                          🧩 Cấu trúc câu:
                                                        </span>
                                                        {ex.structure}
                                                      </div>
                                                    )}

                                                    {ex.why_used && (
                                                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                                        <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                                                          💡 Giải thích lý do dùng cấu trúc:
                                                        </span>
                                                        {ex.why_used}
                                                      </div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="py-2.5 text-[11px] text-slate-500 dark:text-zinc-500 italic text-center">
                                                Từ này đã được tự động lưu vào thư viện từ vựng.
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 4. Antonyms Section */}
                            {enrichedData.antonyms && enrichedData.antonyms.length > 0 && (
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                                    Từ trái nghĩa (Antonyms):
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                                    {enrichedData.antonyms.length} từ • click để xem phân tích
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2.5">
                                  {enrichedData.antonyms.map((a, aIdx) => {
                                    const termKey = `queue-${item.word}-ant-${a.word}`;
                                    const isExpanded = !!expandedTerms[termKey];
                                    const hasExamples = a.examples && a.examples.length > 0;

                                    return (
                                      <div
                                        key={aIdx}
                                        className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                                          ? "bg-rose-50/40 dark:bg-zinc-900 border-rose-400 dark:border-rose-500/60 shadow-md shadow-rose-500/5 ring-1 ring-rose-500/20"
                                          : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-rose-400 dark:hover:border-rose-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                                          }`}
                                      >
                                        {/* Antonym Header */}
                                        <div
                                          onClick={(e) => toggleTermExpanded(termKey, e)}
                                          className="p-3.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-mono text-sm font-bold text-rose-700 dark:text-rose-300">
                                                {a.word}
                                              </span>
                                              {a.phonetic && (
                                                <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400/90 bg-rose-100/70 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 px-1.5 py-0.2 rounded">
                                                  {a.phonetic}
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                onClick={(e) => handleSpeak(a.word, e)}
                                                title="Phát âm"
                                                className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded transition-colors"
                                              >
                                                <Volume2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                            {a.meaning_vn && (
                                              <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
                                                {a.meaning_vn}
                                              </p>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0 text-slate-400 dark:text-zinc-400">
                                            {hasExamples ? (
                                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/90 text-rose-800 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-medium">
                                                {a.examples!.length} câu ví dụ
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400">
                                                Chi tiết
                                              </span>
                                            )}
                                            <div className="p-1 rounded text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white transition-colors">
                                              {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                              ) : (
                                                <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Antonym Body */}
                                        {isExpanded && (
                                          <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                                            {hasExamples ? (
                                              <div className="space-y-3 pt-2">
                                                {a.examples!.map((ex, exIdx) => (
                                                  <div
                                                    key={exIdx}
                                                    className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                                  >
                                                    <div className="flex items-start justify-between gap-2">
                                                      <div className="flex items-start gap-2">
                                                        <span className="font-mono text-rose-600 dark:text-rose-400 font-bold text-[11px] shrink-0 mt-0.5">
                                                          #{exIdx + 1}
                                                        </span>
                                                        <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                          "{ex.sentence_en}"
                                                        </p>
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                                        title="Nghe câu"
                                                        className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded shrink-0"
                                                      >
                                                        <Volume2 className="w-3.5 h-3.5" />
                                                      </button>
                                                    </div>

                                                    {ex.meaning_vn && (
                                                      <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                                        <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                                          📖 Ý nghĩa của câu:
                                                        </span>
                                                        {ex.meaning_vn}
                                                      </div>
                                                    )}

                                                    {ex.structure && (
                                                      <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-[11px] text-rose-900 dark:text-rose-200 font-mono leading-relaxed">
                                                        <span className="font-bold text-rose-700 dark:text-rose-400 block mb-0.5 font-sans">
                                                          🧩 Cấu trúc câu:
                                                        </span>
                                                        {ex.structure}
                                                      </div>
                                                    )}

                                                    {ex.why_used && (
                                                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                                        <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                                                          💡 Giải thích lý do dùng cấu trúc:
                                                        </span>
                                                        {ex.why_used}
                                                      </div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="py-2.5 text-[11px] text-slate-500 dark:text-zinc-500 italic text-center">
                                                Từ này đã được tự động lưu vào thư viện từ vựng.
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 5. Code Snippet with Terminal Styling */}
                            {enrichedData.code_snippet && (
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Terminal className="w-4 h-4" />
                                    Đoạn mã ngữ cảnh (Code Snippet):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCode(enrichedData.code_snippet!)}
                                    className="text-[11px] font-mono text-slate-600 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 transition-colors shadow-sm"
                                  >
                                    {copiedSnippet ? (
                                      <>
                                        <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Đã sao chép</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Sao chép mã</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-[#0d1117] overflow-hidden shadow-xl">
                                  <div className="bg-zinc-900/90 px-4 py-2 border-b border-zinc-800 flex items-center justify-between select-none">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                                      <span className="ml-2 text-[10px] font-mono text-zinc-500">example.ts</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-500">Developer Context</span>
                                  </div>
                                  <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed selection:bg-cyan-500/30 whitespace-pre">
                                    <code>{enrichedData.code_snippet}</code>
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* 6. Context Examples with Grammar & Syntax Analysis */}
                            {enrichedData.examples && enrichedData.examples.length > 0 && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Code2 className="w-4 h-4" />
                                    Ví dụ & Phân tích cú pháp:
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                                    {enrichedData.examples.length} câu ví dụ
                                  </span>
                                </div>

                                <div className="space-y-3.5">
                                  {enrichedData.examples.map((ex, exIdx) => (
                                    <div
                                      key={exIdx}
                                      className="rounded-2xl bg-slate-50 dark:bg-zinc-950 p-4 border border-slate-200 dark:border-zinc-800/90 space-y-3 shadow-sm"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-2">
                                          <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0 mt-0.5">
                                            #{exIdx + 1}
                                          </span>
                                          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                                            {ex.sentence_en}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleSpeak(ex.sentence_en)}
                                          title="Nghe cả câu"
                                          className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-900 transition-colors shrink-0"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {ex.sentence_vn && (
                                        <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-xs text-cyan-950 dark:text-cyan-200 leading-relaxed">
                                          <span className="font-semibold text-cyan-700 dark:text-cyan-400">Dịch nghĩa: </span>
                                          {ex.sentence_vn}
                                        </div>
                                      )}

                                      {ex.grammar_analysis && (
                                        <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-zinc-900">
                                          <span className="text-[11px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold block">
                                            Phân tích cú pháp (Grammar / Syntax):
                                          </span>
                                          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-slate-800 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap shadow-inner">
                                            {ex.grammar_analysis}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DAILY REVIEW WITH INTERACTIVE FLASHCARD SESSION */}
        {activeTab === "review" && (
          isReviewing ? (
            <FlashcardReview
              wordsToReview={reviewSet}
              distractorPool={words}
              practiceMode={isPracticeSession}
              onFinish={() => {
                setIsReviewing(false);
                refreshWords();
              }}
              onExit={() => {
                setIsReviewing(false);
                // Reviews answered before exiting were already persisted
                refreshWords();
              }}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Spaced Repetition Review</h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Powered by FSRS. Optimal recall timing tailored to your memory strength.
                </p>
              </div>

              {/* Status Banner */}
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-gradient-to-r dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                      Queue Overview
                    </span>
                    <div className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{dueCount}</span>
                      <span className="text-sm font-normal text-slate-500 dark:text-zinc-400">cards due for review</span>
                    </div>
                  </div>

                  <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                    <Flame className="w-6 h-6" />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleStartReview(true)}
                    disabled={dueCount === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 !text-white text-xs font-semibold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Review ({dueCount})</span>
                  </button>

                  <button
                    onClick={() => handleStartReview(false)}
                    disabled={words.length === 0}
                    className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    <span>Practice All ({words.length})</span>
                  </button>

                  <button
                    onClick={handleTestNotification}
                    title="Send test macOS notification"
                    className="p-3 rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-500 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-400 transition-colors"
                  >
                    <Bell className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Study & Review by Topic */}
              {availableTopics.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 font-medium">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-300">
                      <Folder className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      Ôn tập theo Chủ đề ({availableTopics.length} chủ đề)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono">Chọn chủ đề muốn học</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableTopics.map((top) => {
                      const topicEntry = libraryStats.perTopic[top.toLowerCase()] || { total: 0, due: 0 };
                      const topicTotal = topicEntry.total;
                      const dueInTopic = topicEntry.due;

                      return (
                        <div
                          key={top}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all flex flex-col justify-between space-y-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                                <span className="font-semibold text-slate-900 dark:text-white text-xs">{top}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 block">
                                {topicTotal} từ vựng
                                {dueInTopic > 0 && (
                                  <span className="text-orange-600 dark:text-orange-400 ml-1.5 font-medium">
                                    • {dueInTopic} đến hạn
                                  </span>
                                )}
                              </span>
                            </div>

                            {dueInTopic > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60">
                                {dueInTopic} Due
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-zinc-800/60">
                            {dueInTopic > 0 ? (
                              <button
                                onClick={() => handleStartReview(true, top)}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/20 dark:hover:bg-orange-500/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/40 text-xs font-medium transition-colors flex items-center justify-center gap-1 shadow-sm"
                              >
                                <Play className="w-3 h-3 fill-orange-500" />
                                <span>Ôn đến hạn ({dueInTopic})</span>
                              </button>
                            ) : null}
                            <button
                              onClick={() => handleStartReview(false, top)}
                              className={`${dueInTopic > 0 ? "" : "flex-1"
                                } py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700/60 text-xs font-medium transition-colors flex items-center justify-center gap-1 shadow-sm`}
                            >
                              <span>Luyện tất cả ({topicTotal})</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* List of due words */}
              {dueCount > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 font-medium">
                    <span>Due Words Waiting in Queue</span>
                    <span className="font-mono text-[11px]">Interval & Ease Factor</span>
                  </div>
                  {libraryStats.dueWords
                    .slice(0, DUE_LIST_LIMIT)
                    .map((w) => (
                      <div
                        key={w.id}
                        onClick={() => setSelectedWord(w)}
                        className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between transition-colors shadow-sm"
                      >
                        <div className="space-y-0.5">
                          <div className="text-base font-bold text-slate-900 dark:text-white capitalize font-mono">
                            {w.word}
                          </div>
                          <div className="text-sm font-medium text-slate-700 dark:text-cyan-200">{w.meaning_vn}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 block font-semibold">
                            {w.srs.stability && w.srs.stability > 0 ? `S: ${w.srs.stability}d` : `Mới`}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                            {w.srs.interval === 0 ? "Initial review" : `${w.srs.interval}d interval`}
                          </span>
                        </div>
                      </div>
                    ))}
                  {dueCount > DUE_LIST_LIMIT && (
                    <div className="text-center text-xs text-slate-500 dark:text-zinc-400 py-2">
                      và {dueCount - DUE_LIST_LIMIT} từ khác
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 space-y-3 rounded-2xl border border-slate-200 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-900/30">
                  <CheckCircle className="w-10 h-10 text-emerald-500 dark:text-emerald-400 mx-auto" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">All caught up!</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                    You have reviewed all pending cards. Click "Practice All" to rehearse anytime or add new terms via ⌘⇧E.
                  </p>
                </div>
              )}
            </div>
          )
        )}

        {/* TAB 4: ADVANCED ANALYTICS & INSIGHTS */}
        {activeTab === "analytics" && (
          <AnalyticsView
            words={words}
            onStartReviewWord={(w) => {
              // Scheduled review only if one of the word's cards is due; otherwise practice (no FSRS change)
              const [dueCard] = getDueCards(w);
              setIsPracticeSession(!dueCard);
              setReviewSet([dueCard ?? practiceCards([w])[0]]);
              setIsReviewing(true);
              setActiveTab("review");
            }}
            onRefreshWords={refreshWords}
          />
        )}

        {/* TAB 5: CLI & NOTIFICATION SETUP GUIDE */}
        {activeTab === "guide" && (
          <CliGuideView
            onRefreshWords={refreshWords}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
            }}
          />
        )}

        {/* TAB 6: GRAMMAR HUB (A1 - C1 ROADMAP & DIAGNOSTIC PRACTICE) */}
        {activeTab === "grammar" && <GrammarHub />}
      </main>

      {/* RIGHT SLIDE-OVER WORD DETAIL INSPECTOR */}
      {selectedWord && (
        <aside className="w-full max-w-[540px] md:w-[500px] lg:w-[540px] xl:w-[580px] border-l border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/95 backdrop-blur-2xl flex flex-col justify-between shrink-0 animate-in slide-in-from-right duration-200 z-30 shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-semibold">
                Chi tiết từ vựng
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => requestDeleteWord(selectedWord.id, selectedWord.word, e)}
                title="Xoá từ"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedWord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Word & Pronunciation */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white capitalize font-mono tracking-tight">
                      {selectedWord.word}
                    </h2>
                    {selectedWord.part_of_speech && (
                      <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                        {selectedWord.part_of_speech}
                      </span>
                    )}
                  </div>
                  {selectedWord.phonetic && (
                    <span className="text-sm font-mono text-cyan-700 dark:text-cyan-400 mt-1 inline-block">
                      {selectedWord.phonetic}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleSpeak(selectedWord.word)}
                  className="px-3 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 transition-colors flex items-center gap-2 text-xs font-medium shadow-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Phát âm (US)</span>
                </button>
              </div>

              {/* Topic Classification & Reassignment */}
              <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span className="text-xs font-mono text-slate-600 dark:text-zinc-400">Chủ đề:</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 shadow-sm">
                    {selectedWord.topic || "General Tech"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">Đổi:</span>
                  <select
                    value={selectedWord.topic || "General Tech"}
                    onChange={(e) => handleUpdateTopic(selectedWord.id, e.target.value)}
                    className="text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-lg px-2.5 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-sm"
                  >
                    {PREDEFINED_TOPICS.map((top) => (
                      <option key={top} value={top}>
                        {top}
                      </option>
                    ))}
                    {selectedWord.topic &&
                      !PREDEFINED_TOPICS.includes(selectedWord.topic as any) && (
                        <option value={selectedWord.topic}>{selectedWord.topic}</option>
                      )}
                  </select>
                </div>
              </div>

              {/* Vietnamese Meaning Card - Balanced readable font size */}
              <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ý nghĩa Tiếng Việt (Chuyên ngành & Đời sống)</span>
                </div>
                <p className="text-sm text-slate-800 dark:text-zinc-200 font-normal leading-relaxed">
                  {selectedWord.meaning_vn}
                </p>
              </div>

              {/* Collocations Section */}
              {(() => {
                const colls = parseCollocations(selectedWord.collocations);
                if (colls.length === 0) return null;
                return (
                  <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Cụm từ thường gặp (Collocations):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {colls.map((c, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/70 text-slate-800 dark:text-zinc-200 font-mono text-xs hover:border-cyan-500/50 transition-colors"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Synonyms & Antonyms with Click-to-Expand Sentences */}
            {(() => {
              const syns = parseTerms(selectedWord.synonyms);
              const ants = parseTerms(selectedWord.antonyms);

              return (
                <div className="space-y-5">
                  {/* Synonyms Accordion */}
                  {syns.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Từ đồng nghĩa (Synonyms):
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                          {syns.length} từ • click để xem phân tích
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5">
                        {syns.map((s, idx) => {
                          const isExpanded = !!expandedTerms[`syn-${s.word}`];
                          const hasExamples = s.examples && s.examples.length > 0;

                          return (
                            <div
                              key={idx}
                              className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                                ? "bg-emerald-50/40 dark:bg-zinc-900 border-emerald-400 dark:border-emerald-500/60 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                                : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                                }`}
                            >
                              {/* Accordion Header */}
                              <div
                                onClick={() => toggleTermExpanded(`syn-${s.word}`)}
                                className="p-3.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                      {s.word}
                                    </span>
                                    {s.phonetic && (
                                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400/90 bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-0.2 rounded">
                                        {s.phonetic}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => handleSpeak(s.word, e)}
                                      title="Phát âm"
                                      className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded transition-colors"
                                    >
                                      <Volume2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {s.meaning_vn && (
                                    <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
                                      {s.meaning_vn}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 text-slate-400 dark:text-zinc-400">
                                  {hasExamples ? (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium">
                                      {s.examples!.length} câu ví dụ
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400">
                                      Chi tiết
                                    </span>
                                  )}
                                  <div className="p-1 rounded text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white transition-colors">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Accordion Body: 2-3 Sentences with Structure & Why used */}
                              {isExpanded && (
                                <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                                  {hasExamples ? (
                                    <div className="space-y-3 pt-2">
                                      {s.examples!.map((ex, exIdx) => (
                                        <div
                                          key={exIdx}
                                          className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                        >
                                          {/* Câu tiếng Anh */}
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-2">
                                              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[11px] shrink-0 mt-0.5">
                                                #{exIdx + 1}
                                              </span>
                                              <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                "{ex.sentence_en}"
                                              </p>
                                            </div>
                                            <button
                                              onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                              title="Nghe câu"
                                              className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded shrink-0"
                                            >
                                              <Volume2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>

                                          {/* 1. Ý nghĩa của câu */}
                                          {ex.meaning_vn && (
                                            <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                              <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                                📖 Ý nghĩa của câu:
                                              </span>
                                              {ex.meaning_vn}
                                            </div>
                                          )}

                                          {/* 2. Cấu trúc câu */}
                                          {ex.structure && (
                                            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-200 font-mono leading-relaxed">
                                              <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5 font-sans">
                                                🧩 Cấu trúc câu:
                                              </span>
                                              {ex.structure}
                                            </div>
                                          )}

                                          {/* 3. Giải thích vì sao lại dùng cấu trúc câu đó */}
                                          {ex.why_used && (
                                            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                                                💡 Giải thích lý do dùng cấu trúc:
                                              </span>
                                              {ex.why_used}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="py-2.5 text-[11px] text-slate-500 dark:text-zinc-500 italic text-center">
                                      Từ này đã được tự động lưu vào thư viện từ vựng. Bạn có thể chọn từ này ở danh sách chính để xem toàn bộ thông tin chi tiết.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Antonyms Accordion */}
                  {ants.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Từ trái nghĩa (Antonyms):
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                          {ants.length} từ • click để xem phân tích
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5">
                        {ants.map((a, idx) => {
                          const isExpanded = !!expandedTerms[`ant-${a.word}`];
                          const hasExamples = a.examples && a.examples.length > 0;

                          return (
                            <div
                              key={idx}
                              className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                                ? "bg-rose-50/40 dark:bg-zinc-900 border-rose-400 dark:border-rose-500/60 shadow-md shadow-rose-500/5 ring-1 ring-rose-500/20"
                                : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-rose-400 dark:hover:border-rose-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                                }`}
                            >
                              {/* Accordion Header */}
                              <div
                                onClick={() => toggleTermExpanded(`ant-${a.word}`)}
                                className="p-3.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-sm font-bold text-rose-700 dark:text-rose-300">
                                      {a.word}
                                    </span>
                                    {a.phonetic && (
                                      <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400/90 bg-rose-100/70 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 px-1.5 py-0.2 rounded">
                                        {a.phonetic}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => handleSpeak(a.word, e)}
                                      title="Phát âm"
                                      className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded transition-colors"
                                    >
                                      <Volume2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {a.meaning_vn && (
                                    <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
                                      {a.meaning_vn}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 text-slate-400 dark:text-zinc-400">
                                  {hasExamples ? (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/90 text-rose-800 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-medium">
                                      {a.examples!.length} câu ví dụ
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400">
                                      Chi tiết
                                    </span>
                                  )}
                                  <div className="p-1 rounded text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white transition-colors">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Accordion Body: 2-3 Sentences with Structure & Why used */}
                              {isExpanded && (
                                <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                                  {hasExamples ? (
                                    <div className="space-y-3 pt-2">
                                      {a.examples!.map((ex, exIdx) => (
                                        <div
                                          key={exIdx}
                                          className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                        >
                                          {/* Câu tiếng Anh */}
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-2">
                                              <span className="font-mono text-rose-600 dark:text-rose-400 font-bold text-[11px] shrink-0 mt-0.5">
                                                #{exIdx + 1}
                                              </span>
                                              <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                "{ex.sentence_en}"
                                              </p>
                                            </div>
                                            <button
                                              onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                              title="Nghe câu"
                                              className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded shrink-0"
                                            >
                                              <Volume2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>

                                          {/* 1. Ý nghĩa của câu */}
                                          {ex.meaning_vn && (
                                            <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                              <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                                📖 Ý nghĩa của câu:
                                              </span>
                                              {ex.meaning_vn}
                                            </div>
                                          )}

                                          {/* 2. Cấu trúc câu */}
                                          {ex.structure && (
                                            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-[11px] text-rose-900 dark:text-rose-200 font-mono leading-relaxed">
                                              <span className="font-bold text-rose-700 dark:text-rose-400 block mb-0.5 font-sans">
                                                🧩 Cấu trúc câu:
                                              </span>
                                              {ex.structure}
                                            </div>
                                          )}

                                          {/* 3. Giải thích vì sao lại dùng cấu trúc câu đó */}
                                          {ex.why_used && (
                                            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                                                💡 Giải thích lý do dùng cấu trúc:
                                              </span>
                                              {ex.why_used}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="py-2.5 text-[11px] text-slate-500 dark:text-zinc-500 italic text-center">
                                      Từ này đã được tự động lưu vào thư viện từ vựng. Bạn có thể chọn từ này ở danh sách chính để xem toàn bộ thông tin chi tiết.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Realistic Code Snippet with Terminal Styling & Copy */}
            {selectedWord.code_snippet && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-4 h-4" />
                    Đoạn mã ngữ cảnh (Code Snippet):
                  </span>
                  <button
                    onClick={() => handleCopyCode(selectedWord.code_snippet!)}
                    className="text-[11px] font-mono text-slate-600 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 transition-colors shadow-sm"
                  >
                    {copiedSnippet ? (
                      <>
                        <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Đã sao chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Sao chép mã</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-[#0d1117] overflow-hidden shadow-xl">
                  {/* macOS Terminal Titlebar */}
                  <div className="bg-zinc-900/90 px-4 py-2 border-b border-zinc-800 flex items-center justify-between select-none">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2 text-[10px] font-mono text-zinc-500">example.ts</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">Developer Context</span>
                  </div>
                  {/* Monospace Code Body */}
                  <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed selection:bg-cyan-500/30 whitespace-pre">
                    <code>{selectedWord.code_snippet}</code>
                  </pre>
                </div>
              </div>
            )}

            {/* Coding Context Examples with Grammar & Syntax Analysis */}
            {selectedWord.examples.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Code2 className="w-4 h-4" />
                    Ví dụ & Phân tích cú pháp:
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                    {selectedWord.examples.length} câu ví dụ
                  </span>
                </div>

                <div className="space-y-3.5">
                  {selectedWord.examples.map((ex, idx) => (
                    <div
                      key={ex.id || idx}
                      className="rounded-2xl bg-slate-50 dark:bg-zinc-950 p-4 border border-slate-200 dark:border-zinc-800/90 space-y-3 shadow-sm"
                    >
                      {/* English sentence with pronounce button */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0 mt-0.5">
                            #{idx + 1}
                          </span>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                            {ex.sentence_en}
                          </p>
                        </div>
                        <button
                          onClick={() => handleSpeak(ex.sentence_en)}
                          title="Nghe cả câu"
                          className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-900 transition-colors shrink-0"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Vietnamese translation */}
                      {ex.sentence_vn && (
                        <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-xs text-cyan-950 dark:text-cyan-200 leading-relaxed">
                          <span className="font-semibold text-cyan-700 dark:text-cyan-400">Dịch nghĩa: </span>
                          {ex.sentence_vn}
                        </div>
                      )}

                      {/* Grammar & Syntax analysis */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-zinc-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold block">
                            Phân tích cú pháp (Grammar / Syntax):
                          </span>
                          <button
                            onClick={() => {
                              setSelectedWord(null);
                              setActiveTab("grammar");
                            }}
                            className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-sans font-medium"
                          >
                            <GraduationCap className="w-3 h-3" />
                            <span>Mở trung tâm ngữ pháp</span>
                          </button>
                        </div>
                        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-slate-800 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap shadow-inner">
                          {ex.grammar_analysis}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SRS Review Metadata (FSRS) */}
            <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 p-3.5 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Trí nhớ (FSRS)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 text-cyan-800 dark:text-cyan-300 font-mono font-medium">
                  {selectedWord.srs.state === 2
                    ? "Đã thuộc"
                    : selectedWord.srs.state === 1
                      ? "Đang học"
                      : selectedWord.srs.state === 3
                        ? "Cần củng cố"
                        : "Từ mới"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
                  <div className="font-bold text-slate-900 dark:text-white font-mono">
                    {selectedWord.srs.stability && selectedWord.srs.stability > 0
                      ? `${selectedWord.srs.stability}d`
                      : `${selectedWord.srs.interval}d`}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-zinc-500">Độ bền (S)</div>
                </div>
                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
                  <div className="font-bold text-slate-900 dark:text-white font-mono">
                    {selectedWord.srs.difficulty && selectedWord.srs.difficulty > 0
                      ? `${selectedWord.srs.difficulty}/10`
                      : "5.0/10"}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-zinc-500">Độ khó (D)</div>
                </div>
                <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
                  <div className="font-bold text-slate-900 dark:text-white font-mono">
                    {selectedWord.srs.repetitions}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-zinc-500">Số lần ôn</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* IN-APP DELETE CONFIRMATION MODAL */}
      {wordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Xác nhận xoá từ vựng</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Hành động này sẽ xoá vĩnh viễn khỏi thư viện</p>
              </div>
            </div>

            <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
              Bạn có chắc chắn muốn xoá từ{" "}
              <span className="font-mono font-bold text-rose-700 dark:text-rose-300 uppercase px-1.5 py-0.5 rounded bg-rose-50 dark:bg-zinc-900 border border-rose-200 dark:border-zinc-800">
                {wordToDelete.word}
              </span>{" "}
              khỏi từ điển? Toàn bộ ví dụ, phân tích ngữ pháp và tiến độ ôn tập SM-2 sẽ bị xoá.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-zinc-900">
              <button
                type="button"
                onClick={() => setWordToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 !text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? "Đang xoá..." : "Xoá từ vựng"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOCUS REVIEW POP-UP MODAL (PREVIEW OR IN-APP MODE) */}
      {showReviewModalPreview && (
        <FocusReviewModal
          onClose={() => setShowReviewModalPreview(false)}
          isPreview={true}
        />
      )}

      {/* LEVEL UP CELEBRATION & BADGE UNLOCK TOASTS */}
      <LevelUpModal />
    </div>
  );
}

interface WordCardMeta {
  synonyms: ReturnType<typeof parseTerms>;
  rInfo: ReturnType<typeof getRetrievabilityInfo>;
  leech: boolean;
}

interface WordCardProps {
  item: WordDetail;
  meta: WordCardMeta | undefined;
  isSelected: boolean;
  onSelect: (word: WordDetail) => void;
  onSpeak: (text: string, e?: React.MouseEvent) => void;
  onDelete: (wordId: string, wordText: string, e?: React.MouseEvent) => void;
}

// Memoized gallery card; derived data is precomputed by the parent
const WordCard = memo(function WordCard({ item, meta, isSelected, onSelect, onSpeak, onDelete }: WordCardProps) {
  const synonyms = meta?.synonyms ?? EMPTY_TERMS;
  const rInfo = meta?.rInfo ?? getRetrievabilityInfo(item.srs);
  const leech = meta?.leech ?? false;

  return (
    <div
      onClick={() => onSelect(item)}
      className={`group relative rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${isSelected
        ? "bg-cyan-50/60 dark:bg-zinc-900 border-cyan-500 dark:border-cyan-500/80 shadow-lg shadow-cyan-500/10 dark:shadow-cyan-950/50 ring-1 ring-cyan-500/50"
        : "bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50/80 dark:hover:bg-zinc-900/90 shadow-sm"
        }`}
    >
      <div className="space-y-3">
        {/* Word header & actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white capitalize font-mono group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                {item.word}
              </h3>
              {item.part_of_speech && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 font-semibold">
                  {item.part_of_speech}
                </span>
              )}
              <span className="text-[10px] font-medium text-cyan-800 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Tag className="w-2.5 h-2.5" />
                {item.topic || "General Tech"}
              </span>
              {item.phonetic && (
                <span className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400/90 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 px-2 py-0.5 rounded-md">
                  {item.phonetic}
                </span>
              )}
              <button
                onClick={(e) => onSpeak(item.word, e)}
                title="Listen pronunciation"
                className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800/80"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Meaning Box */}
            <div className="mt-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-700 dark:text-cyan-400 font-semibold block mb-0.5">
                Nghĩa:
              </span>
              <p className="text-xs text-slate-800 dark:text-zinc-200 font-normal line-clamp-2 leading-relaxed">
                {item.meaning_vn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {/* Leech Badge */}
            {leech && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 animate-pulse" title={`Leech: ${item.srs.lapses ?? 0} lần quên`}>
                🐛
              </span>
            )}
            {/* Retrievability Mini Indicator */}
            {rInfo.level !== "new" && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${rInfo.bgColorClass} ${rInfo.textColorClass}`} title={`Retrievability: ${rInfo.percent}% — ${rInfo.label}`}>
                <span className={`w-5 h-1 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden inline-block`}>
                  <span className={`block h-full ${rInfo.colorClass} rounded-full`} style={{ width: `${rInfo.percent}%` }} />
                </span>
                {rInfo.percent}%
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700/60">
              {item.srs.interval === 0 ? "New" : `${item.srs.interval}d`}
            </span>
            <button
              onClick={(e) => onDelete(item.id, item.word, e)}
              title="Xoá từ này"
              className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* First Example preview */}
        {item.examples.length > 0 && (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/90 p-2.5 border border-slate-200 dark:border-zinc-800/80 space-y-1">
            <p className="text-xs font-medium text-slate-800 dark:text-zinc-200 leading-relaxed line-clamp-2">
              "{item.examples[0].sentence_en}"
            </p>
            {item.examples[0].sentence_vn && (
              <p className="text-[11px] text-cyan-800 dark:text-cyan-300/80 italic line-clamp-1">
                {item.examples[0].sentence_vn}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer tags */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
        <div className="flex gap-1.5 flex-wrap max-w-[75%] overflow-hidden">
          {synonyms.slice(0, 2).map((s, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-zinc-300 text-[11px] font-mono border border-slate-200 dark:border-zinc-700/50"
            >
              {s.word}
            </span>
          ))}
          {synonyms.length > 2 && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 self-center">
              +{synonyms.length - 2}
            </span>
          )}
        </div>

        <span className="flex items-center gap-0.5 text-slate-500 dark:text-zinc-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors font-medium">
          Chi tiết <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
});
