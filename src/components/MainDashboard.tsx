import { useEffect, useState, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { pipeline, requeuePendingWords, type PipelineItem } from "@/services/pipeline";
import { srsWorker, getStudyLimits } from "@/services/srs";
import { parseTerms, type WordDetail, type ReviewCard } from "@/types/database";
import { getDueCards, isWordDue, practiceCards } from "@/services/cards";
import { calculateStreakAndGoal } from "@/services/streak";
import {
  getRetrievabilityInfo,
  isLeech,
  getLeechWords,
  smartSortReviewQueue,
  buildReviewSession,
  getNewCardsIntroducedToday,
} from "@/services/smartReview";
import LevelUpModal from "./LevelUpModal";

// Tabs and modals that are not visible on startup are loaded on demand to keep the initial bundle small
const FlashcardReview = lazy(() => import("./FlashcardReview"));
const AnalyticsView = lazy(() => import("./AnalyticsView"));
const CliGuideView = lazy(() => import("./CliGuideView"));
const FocusReviewModal = lazy(() => import("./FocusReviewModal"));
const GrammarHub = lazy(() => import("./grammar/GrammarHub"));

function TabFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
import {
  checkAutoReplenishEligibility,
  triggerAutoReplenish,
  type AutoReplenishSummary,
} from "@/services/autoReplenish";
import { assessUserProficiency } from "@/services/userProficiency";
import { useWordsStore } from "@/stores/wordsStore";
import { useToggleMap } from "@/hooks/useToggleMap";
import { GlobalToast, AutoReplenishBanner, type GlobalToastData } from "./dashboard/DashboardBanners";
import Sidebar from "./dashboard/Sidebar";
import DashboardHeader from "./dashboard/DashboardHeader";
import LibraryTab from "./dashboard/LibraryTab";
import CaptureTab from "./dashboard/CaptureTab";
import ReviewTab from "./dashboard/ReviewTab";
import WordInspector from "./dashboard/WordInspector";
import DeleteWordModal from "./dashboard/DeleteWordModal";
import type { WordCardMeta } from "./dashboard/WordCard";
import {
  GALLERY_PAGE_SIZE,
  type DashboardTab,
  type FilterMode,
  type LibraryStats,
  type ViewMode,
} from "./dashboard/shared";

interface MainDashboardProps {
  onOpenQuickInputPreview?: () => void;
  onOpenReviewPopupPreview?: () => void;
}

export default function MainDashboard({
  onOpenQuickInputPreview,
  onOpenReviewPopupPreview,
}: MainDashboardProps) {
  // The words store outlives this component: start every mount from a clean slate
  // (same as the former component-local state), before anything reads it.
  useState(() => useWordsStore.getState().reset());
  const words = useWordsStore((s) => s.words);
  const loading = useWordsStore((s) => s.loading);
  const selectedWord = useWordsStore((s) => s.selectedWord);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const refreshWords = useWordsStore((s) => s.refreshWords);

  const [showReviewModalPreview, setShowReviewModalPreview] = useState(false);
  const [pipelineQueue, setPipelineQueue] = useState<PipelineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [activeTab, setActiveTab] = useState<DashboardTab>("library");
  const [inputWord, setInputWord] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  // Listeners registered once read this instead of a stale isReviewing
  const isReviewingRef = useRef(false);
  isReviewingRef.current = isReviewing;
  // New key per session so FlashcardReview never reuses the previous queue
  const [sessionId, setSessionId] = useState(0);
  const [reviewSet, setReviewSet] = useState<ReviewCard[]>([]);
  // Practice sessions (no due cards / "Practice All") never change the FSRS schedule
  const [isPracticeSession, setIsPracticeSession] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<{ id: string; word: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [globalToast, setGlobalToast] = useState<GlobalToastData | null>(null);
  const [autoReplenishBanner, setAutoReplenishBanner] = useState<AutoReplenishSummary | null>(null);
  const [expandedTerms, toggleTermExpanded] = useToggleMap();
  const [expandedQueueItems, toggleQueueItemExpand] = useToggleMap();
  const [activityVersion, setActivityVersion] = useState(0);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentProficiency = useMemo(() => {
    return assessUserProficiency(words);
  }, [words, activityVersion]);
  const effectiveLevel = currentProficiency.effectiveLevel;

  const streakStats = useMemo(() => {
    // Reviewing everything due today also completes the daily goal
    return calculateStreakAndGoal(words, words.filter((w) => isWordDue(w)).length);
  }, [words, activityVersion]);

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  useEffect(() => {
    const onActivity = () => setActivityVersion((v) => v + 1);
    window.addEventListener("myenglish-activity-updated", onActivity);
    return () => window.removeEventListener("myenglish-activity-updated", onActivity);
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
      const current = useWordsStore.getState().words;
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

  // Debounced background refresh (pipeline completions, reviews recorded in other windows)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(Date.now());
  const scheduleRefresh = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshWords();
    }, 300);
  };
  // Any refresh (from here or elsewhere) replaces the words array
  useEffect(() => {
    lastRefreshAtRef.current = Date.now();
  }, [words]);

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
      // Never abort a session in progress: just show it
      if (isReviewingRef.current) return;
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

    listen<GlobalToastData>("desktop-notification-received", (event) => {
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

    // Reviews recorded in the popup / other windows
    let unlistenWordsChangedFn: (() => void) | null = null;
    listen("words-changed", () => {
      if (!isCancelled) scheduleRefresh();
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenWordsChangedFn = fn;
      })
      .catch(() => { });

    // Catch up when the window comes back after a while (missed events, day rollover)
    const handleFocus = () => {
      if (Date.now() - lastRefreshAtRef.current > 30_000) scheduleRefresh();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isCancelled = true;
      srsWorker.stop();
      unsubscribePipeline();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      window.removeEventListener("open-review-popup-preview", handleOpenPreview);
      window.removeEventListener("close-review-popup-preview", handleClosePreview);
      window.removeEventListener("focus", handleFocus);
      if (unlistenWordsChangedFn) unlistenWordsChangedFn();
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

    // Read the store directly so callers registered in older renders never see stale words
    const pool = useWordsStore.getState().words.filter(matchesTopic);
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
    setSessionId((id) => id + 1);
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
    // Never abort a session in progress: just show it
    if (isReviewing) return;
    if (autoStartFlashcard) {
      handleStartReview(true);
    } else {
      setIsReviewing(false);
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

  // Request delete word (opens in-app modal instead of broken window.confirm)
  const requestDeleteWord = useCallback((wordId: string, wordText: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWordToDelete({ id: wordId, word: wordText });
  }, []);

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
  const libraryStats = useMemo<LibraryStats>(() => {
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
        <GlobalToast
          globalToast={globalToast}
          handleOpenReview={handleOpenReview}
          setGlobalToast={setGlobalToast}
        />
      )}

      {/* SMART AUTO-REPLENISH BANNER NOTIFICATION */}
      {autoReplenishBanner && (
        <AutoReplenishBanner
          autoReplenishBanner={autoReplenishBanner}
          setActiveTab={setActiveTab}
          setAutoReplenishBanner={setAutoReplenishBanner}
        />
      )}

      {/* LEFT SIDEBAR */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pipelineQueue={pipelineQueue}
        dueCount={dueCount}
        streakStats={streakStats}
        libraryStats={libraryStats}
        onOpenQuickInputPreview={onOpenQuickInputPreview}
      />

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-zinc-950">
        {/* Top App Bar */}
        <DashboardHeader
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          viewMode={viewMode}
          setViewMode={setViewMode}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          streakStats={streakStats}
          dueCount={dueCount}
          libraryStats={libraryStats}
          effectiveLevel={effectiveLevel}
          setGlobalToast={setGlobalToast}
        />

        {/* TAB 1: VOCABULARY LIBRARY */}
        {activeTab === "library" && (
          <LibraryTab
            message={message}
            setMessage={setMessage}
            filteredWords={filteredWords}
            visibleWords={visibleWords}
            setVisibleCount={setVisibleCount}
            cardMeta={cardMeta}
            viewMode={viewMode}
            searchQuery={searchQuery}
            filterMode={filterMode}
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            availableTopics={availableTopics}
            topicStats={topicStats}
            handleStartReview={handleStartReview}
            requestDeleteWord={requestDeleteWord}
            setActiveTab={setActiveTab}
          />
        )}

        {/* TAB 2: QUICK CAPTURE & AI PIPELINE */}
        {activeTab === "capture" && (
          <CaptureTab
            inputWord={inputWord}
            setInputWord={setInputWord}
            setMessage={setMessage}
            pipelineQueue={pipelineQueue}
            expandedQueueItems={expandedQueueItems}
            toggleQueueItemExpand={toggleQueueItemExpand}
            expandedTerms={expandedTerms}
            toggleTermExpanded={toggleTermExpanded}
            copiedSnippet={copiedSnippet}
            handleCopyCode={handleCopyCode}
            setActiveTab={setActiveTab}
          />
        )}

        <Suspense fallback={<TabFallback />}>
        {/* TAB 3: DAILY REVIEW WITH INTERACTIVE FLASHCARD SESSION */}
        {activeTab === "review" && (
          isReviewing ? (
            <FlashcardReview
              key={sessionId}
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
            <ReviewTab
              dueCount={dueCount}
              libraryStats={libraryStats}
              availableTopics={availableTopics}
              handleStartReview={handleStartReview}
              setMessage={setMessage}
            />
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
              setSessionId((id) => id + 1);
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
        </Suspense>
      </main>

      {/* RIGHT SLIDE-OVER WORD DETAIL INSPECTOR */}
      <WordInspector
        requestDeleteWord={requestDeleteWord}
        expandedTerms={expandedTerms}
        toggleTermExpanded={toggleTermExpanded}
        copiedSnippet={copiedSnippet}
        handleCopyCode={handleCopyCode}
        setActiveTab={setActiveTab}
        setMessage={setMessage}
      />

      {/* IN-APP DELETE CONFIRMATION MODAL */}
      {wordToDelete && (
        <DeleteWordModal
          wordToDelete={wordToDelete}
          setWordToDelete={setWordToDelete}
          isDeleting={isDeleting}
          setIsDeleting={setIsDeleting}
          setMessage={setMessage}
        />
      )}

      {/* FOCUS REVIEW POP-UP MODAL (PREVIEW OR IN-APP MODE) */}
      {showReviewModalPreview && (
        <Suspense fallback={null}>
          <FocusReviewModal
            onClose={() => setShowReviewModalPreview(false)}
            isPreview={true}
          />
        </Suspense>
      )}

      {/* LEVEL UP CELEBRATION & BADGE UNLOCK TOASTS */}
      <LevelUpModal />
    </div>
  );
}
