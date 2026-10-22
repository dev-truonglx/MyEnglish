import { useEffect, useState, useMemo, useRef, useCallback, useDeferredValue, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { getInitialWindowLabel } from "@/lib/windowLabel";
import { Layers, X } from "lucide-react";
import { pipeline, requeuePendingWords, type PipelineItem } from "@/services/pipeline";
import { srsWorker, getStudyLimits } from "@/services/srs";
import { parseTerms, type WordDetail, type ReviewCard } from "@/types/database";
import { isPlaceholderMeaning } from "@/services/db";
import { getDueCards, isWordDue, practiceCards, toCard } from "@/services/cards";
import { type ReviewTimeBucket } from "@/utils/reviewSchedule";
import { librarySchedule } from "@/services/librarySchedule";
import { calculateStreakAndGoal } from "@/services/streak";
import { applyComebackToWork, resolveComeback } from "@/services/comeback";
import { shouldShowOnboarding } from "@/services/onboarding";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { countWaitingWords, getStudyLevels, hasChosenStudyLevels, topUpNewWords, syncWordsWithCatalog } from "@/services/vocabFeed";
import { ensureCatalogSeeded, loadCatalogDistractors } from "@/services/vocabCatalog";
import { ensureGrammarBookSeeded } from "@/services/grammarBook";
import { hasChosenInitialTenses } from "@/services/grammarPath";
import { needsVocabMigration } from "@/services/vocabReset";
import { isSimpleMode } from "@/services/learnerProfile";
import { countWordStatus } from "@/services/wordStatus";
import { countResting, loadRecentRuns, pickPracticeWords, type RecentRun } from "@/services/practicePicker";
import {
  getRetrievabilityInfo,
  getLeechWords,
  interleaveTopics,
  buildReviewSession,
  getNewCardsIntroducedToday,
  summarizeTodayWork,
  isSuspended,
  getUnmasteredWords,
  getStudiedWords,
  extraNewWordAllowance,
  type NewCardCounts,
} from "@/services/smartReview";
import LevelUpModal from "./LevelUpModal";

// Tabs and modals that are not visible on startup are loaded on demand to keep the initial bundle small
const FlashcardReview = lazy(() => import("./FlashcardReview"));
const AnalyticsView = lazy(() => import("./AnalyticsView"));
const CliGuideView = lazy(() => import("./CliGuideView"));
const FocusReviewModal = lazy(() => import("./FocusReviewModal"));
const GrammarHub = lazy(() => import("./grammar/GrammarHub"));
const OnboardingFlow = lazy(() => import("./OnboardingFlow"));
const ReadingTab = lazy(() => import("./dashboard/ReadingTab"));
const WritingTab = lazy(() => import("./dashboard/WritingTab"));
const ForgottenTab = lazy(() => import("./dashboard/ForgottenTab"));
const KnownTab = lazy(() => import("./dashboard/KnownTab"));
const PronunciationTab = lazy(() => import("./dashboard/PronunciationTab"));
const TodayTab = lazy(() => import("./dashboard/TodayTab"));
const LeaderboardTab = lazy(() => import("./dashboard/LeaderboardTab"));
const AccountTab = lazy(() => import("./dashboard/AccountTab"));
const VocabTab = lazy(() => import("./dashboard/VocabTab"));
const VocabSetupScreen = lazy(() => import("./VocabSetupScreen"));
const GrammarTenseSetupModal = lazy(() => import("./grammar/GrammarTenseSetupModal"));
const ReflexChallengeModal = lazy(() => import("./reflex/ReflexChallengeModal"));

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
import { WORDS_CHANGED_WHILE_HIDDEN_EVENT, type WordsChangedDetail } from "@/services/reviewRecorder";
import { getFocusSettings, newFocusPlan, saveFocusSettings, type FocusPlan } from "@/services/focusSession";
import { START_FOCUS_EVENT } from "@/services/reminderSettings";
import { loadForgottenWords } from "@/services/forgottenWords";
import { checkKnownNow } from "@/services/knownWords";
import {
  GALLERY_PAGE_SIZE,
  type DashboardTab,
  type LibraryStats,
  type ViewMode,
} from "./dashboard/shared";

const EMPTY_WORDS: WordDetail[] = [];
const EMPTY_BUCKET_COUNTS: Record<ReviewTimeBucket, number> = {
  all: 0,
  due: 0,
  today: 0,
  "1-3d": 0,
  "4-7d": 0,
  future: 0,
  waiting: 0,
  new: 0,
};
const EMPTY_CARD_META = new Map<string, WordCardMeta>();

interface MainDashboardProps {
  onOpenReviewPopupPreview?: () => void;
}

export default function MainDashboard({
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
  const refreshWordsByIds = useWordsStore((s) => s.refreshWordsByIds);

  const [showReviewModalPreview, setShowReviewModalPreview] = useState(false);
  const [pipelineQueue, setPipelineQueue] = useState<PipelineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewTimeFilter, setReviewTimeFilter] = useState<ReviewTimeBucket>("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  // The app opens on "Hôm nay": one clear thing to do, not the whole word library
  const [activeTab, setActiveTab] = useState<DashboardTab>("today");
  // Incremented whenever a sidebar / header tab item is clicked so active tabs return to their main screen
  const [tabResetKey, setTabResetKey] = useState(0);
  // A grammar lesson to open when the Grammar tab is shown next (from the mistake notebook)
  const [grammarLessonToOpen, setGrammarLessonToOpen] = useState<string | null>(null);
  useEffect(() => {
    if (activeTab !== "grammar") setGrammarLessonToOpen(null);
  }, [activeTab]);
  // Simple mode (Settings): the sidebar shows five entries and the header the tabs of the current one
  const [simpleMode, setSimpleModeState] = useState(isSimpleMode);
  useEffect(() => {
    const onProfile = () => setSimpleModeState(isSimpleMode());
    window.addEventListener("myenglish-profile-updated", onProfile);
    return () => window.removeEventListener("myenglish-profile-updated", onProfile);
  }, []);
  const [inputWord, setInputWord] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  // Listeners registered once read this instead of a stale isReviewing
  const isReviewingRef = useRef(false);
  isReviewingRef.current = isReviewing;
  const sessionCompletedRef = useRef(false);
  // New key per session so FlashcardReview never reuses the previous queue
  const [sessionId, setSessionId] = useState(0);
  const [reviewSet, setReviewSet] = useState<ReviewCard[]>([]);
  // Focus session of the review on screen (null: a normal session)
  const [focusPlan, setFocusPlan] = useState<FocusPlan | null>(null);
  const focusing = !!focusPlan && isReviewing;
  const [reflexChallengeOpen, setReflexChallengeOpen] = useState(false);
  const [confirmExitNav, setConfirmExitNav] = useState<{
    targetTab?: DashboardTab;
    pendingStart?: () => void;
    title?: string;
    body?: string;
    confirmText?: string;
  } | null>(null);

  /**
   * If a review session has already completed (reached SessionSummary), automatically finalize it
   * when the user navigates away or tries to start another session without pressing "Hoàn tất".
   */
  const autoFinishCompletedReview = useCallback(() => {
    if (sessionCompletedRef.current) {
      sessionCompletedRef.current = false;
      refreshDirtyRef.current = false;
      isReviewingRef.current = false;
      setIsReviewing(false);
      setFocusPlan(null);
      topUpNewWords().catch(() => {}).finally(() => refreshWords());
      return true;
    }
    return false;
  }, [refreshWords]);

  const handleSelectTab = useCallback(
    (tab: DashboardTab) => {
      // If the review session already finished (viewing SessionSummary), finalize and navigate
      if (isReviewingRef.current && sessionCompletedRef.current) {
        autoFinishCompletedReview();
        setActiveTab(tab);
        setTabResetKey((k) => k + 1);
        setGrammarLessonToOpen(null);
        return;
      }

      // If review is currently active and uncompleted, confirm before leaving
      if (isReviewingRef.current && !sessionCompletedRef.current) {
        if (activeTab === "review" && tab === "review") {
          return;
        }
        setConfirmExitNav({
          targetTab: tab,
          title: "Thoát bài đang học?",
          body: "Bạn có muốn thoát phiên học đang diễn ra không? Các câu đã trả lời vẫn được lưu.",
          confirmText: "Thoát",
        });
        return;
      }

      setActiveTab(tab);
      setTabResetKey((k) => k + 1);
      setGrammarLessonToOpen(null);
    },
    [activeTab, autoFinishCompletedReview]
  );

  const handleConfirmExit = useCallback(() => {
    const pending = confirmExitNav;
    setConfirmExitNav(null);
    if (!pending) return;

    sessionCompletedRef.current = false;
    refreshDirtyRef.current = false;
    isReviewingRef.current = false;
    setIsReviewing(false);
    setFocusPlan(null);
    topUpNewWords().catch(() => {}).finally(() => refreshWords());

    if (pending.pendingStart) {
      pending.pendingStart();
    } else if (pending.targetTab) {
      setActiveTab(pending.targetTab);
      setTabResetKey((k) => k + 1);
      setGrammarLessonToOpen(null);
    }
  }, [confirmExitNav, refreshWords]);

  useEffect(() => {
    if (!confirmExitNav) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmExitNav(null);
        setActiveTab("review");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirmExitNav]);

  // The word panel belongs to the screen it was opened from: a tab change closes it, unless the same click
  // picked the word (Capture's "Xem chi tiết" opens the library with it). A new session closes it too, so the
  // meaning of a word being asked is never on screen.
  const selectedBeforeRef = useRef(selectedWord);
  useEffect(() => {
    if (selectedWord && selectedWord === selectedBeforeRef.current) setSelectedWord(null);
  }, [activeTab, tabResetKey]);
  useEffect(() => {
    if (sessionId > 0) setSelectedWord(null);
  }, [sessionId]);
  useEffect(() => {
    selectedBeforeRef.current = selectedWord;
  });
  // Practice sessions (no due cards / "Practice All") never change the FSRS schedule
  const [isPracticeSession, setIsPracticeSession] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<{ id: string; word: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [globalToast, setGlobalToast] = useState<GlobalToastData | null>(null);
  // "Nothing to study" explained (instead of a button that does nothing), with a way to pick levels
  const [startNotice, setStartNotice] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    if (!startNotice) return;
    const id = setTimeout(() => setStartNotice(null), 12000);
    return () => clearTimeout(id);
  }, [startNotice]);
  const [autoReplenishBanner, setAutoReplenishBanner] = useState<AutoReplenishSummary | null>(null);
  const [expandedTerms, toggleTermExpanded] = useToggleMap();
  const [expandedQueueItems, toggleQueueItemExpand] = useToggleMap();
  const [activityVersion, setActivityVersion] = useState(0);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ticks every minute so "due" computations don't freeze at the last words change. Not while the window is
  // hidden in the tray (each tick re-renders the dashboard): it catches up when shown again
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNowTick(Date.now());
    };
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const currentProficiency = useMemo(() => {
    return assessUserProficiency(words);
  }, [words, activityVersion]);
  const effectiveLevel = currentProficiency.effectiveLevel;

  // New cards already introduced today: "due" only counts new words the daily budget still allows
  const [introducedToday, setIntroducedToday] = useState<NewCardCounts>({ recognition: 0, production: 0 });
  useEffect(() => {
    getNewCardsIntroducedToday().then(setIntroducedToday).catch(() => {});
  }, [words, activityVersion]);
  // nowTick: cards fall due while the window stays open, so the due count must grow too
  const fullTodayWork = useMemo(
    () => summarizeTodayWork(words, introducedToday),
    [words, introducedToday, activityVersion, nowTick]
  );
  // Back after a break: the backlog is spread over a few days and only today's share is counted
  const comeback = useMemo(
    () => resolveComeback(fullTodayWork.reviews, getStudyLimits().maxSessionSize),
    [fullTodayWork.reviews, activityVersion, nowTick]
  );
  // While the plan runs: the plan's new words (not the daily budget, not cut by the backlog), minus the ones
  // already introduced today, as the session takes them (buildReviewSession's comebackNewCards)
  const todayWork = useMemo(() => {
    const base =
      comeback && !comeback.caughtUp
        ? summarizeTodayWork(words, introducedToday, new Date(), {
            newCardsPerDay: comeback.newWordsPerDay,
            maxSessionSize: Number.MAX_SAFE_INTEGER,
          })
        : fullTodayWork;
    return applyComebackToWork(base, comeback, introducedToday);
  }, [fullTodayWork, comeback, words, introducedToday, nowTick]);

  const streakStats = useMemo(() => {
    // Finishing what is left today (reviews + budgeted new words) also completes the daily goal
    return calculateStreakAndGoal(words, todayWork.total);
  }, [words, activityVersion, todayWork.total]);

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  useEffect(() => {
    // Not awaited here: the catalog readers below wait for the same (shared) seeding themselves
    ensureCatalogSeeded()
      .then(() => syncWordsWithCatalog().catch(() => {}))
      .catch(() => {});
    ensureGrammarBookSeeded().catch(() => {});
  }, []);

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
    if (!AI_VOCAB_ENABLED || replenishCheckedRef.current || loading || words.length === 0) return;
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
  // A change announced while a flashcard session runs: every graded answer announces one, and a full reload per
  // answer (5 queries + all the recomputation) is wasted. Reloaded once when the session ends.
  // Only while the session is on screen: kept behind another tab, the tab shown must stay current.
  const refreshDirtyRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  // Words changed since the last refresh, when every change named its words (a review in the popup):
  // only those are reloaded. null: something else changed, everything is reloaded.
  const pendingIdsRef = useRef<Set<string> | null>(new Set());
  const scheduleRefresh = (wordIds?: string[]) => {
    if (isReviewingRef.current && activeTabRef.current === "review") {
      refreshDirtyRef.current = true;
      return;
    }
    if (!wordIds) pendingIdsRef.current = null;
    else if (pendingIdsRef.current) for (const id of wordIds) pendingIdsRef.current.add(id);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      const ids = pendingIdsRef.current;
      pendingIdsRef.current = new Set();
      if (ids && ids.size > 0) refreshWordsByIds([...ids]);
      else if (!ids) refreshWords();
    }, 300);
  };
  useEffect(() => {
    if (!(isReviewing && activeTab === "review") && refreshDirtyRef.current) {
      refreshDirtyRef.current = false;
      scheduleRefresh();
    }
  }, [isReviewing, activeTab]);
  // Any refresh (from here or elsewhere) replaces the words array
  useEffect(() => {
    lastRefreshAtRef.current = Date.now();
  }, [words]);

  // Auto-start requested by "open-review-tab"; consumed once words are loaded
  const [pendingAutoStart, setPendingAutoStart] = useState(false);
  // A focus session asked for from a reminder, started once the latest words are loaded (minutes)
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);

  // First run (no words yet): goal -> level -> minutes per day, then the first session
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (shouldShowOnboarding(words.length, loading)) setShowOnboarding(true);
  }, [words.length, loading]);
  // Switching to the Oxford deck: old words must be cleared first (migration), or the levels chosen
  const [vocabSetup, setVocabSetup] = useState<"migrate" | "levels" | null>(null);
  const [vocabSetupChecked, setVocabSetupChecked] = useState(false);
  useEffect(() => {
    needsVocabMigration()
      .then((migrate) => {
        if (migrate) setVocabSetup("migrate");
        else if (hasChosenStudyLevels())
          topUpNewWords()
            .then((r) => {
              if (r.added > 0) refreshWords();
            })
            .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setVocabSetupChecked(true));
  }, []);
  useEffect(() => {
    // Already onboarded (or every word deleted) but no levels yet: ask for them. The first-run flow asks
    // for the levels itself, and showOnboarding may still be false in the commit that turns it on.
    const onboarding = showOnboarding || shouldShowOnboarding(words.length, loading);
    if (vocabSetupChecked && !loading && !onboarding && vocabSetup === null && !hasChosenStudyLevels()) setVocabSetup("levels");
  }, [vocabSetupChecked, loading, showOnboarding, vocabSetup, words.length]);
  const handleVocabSetupDone = async () => {
    setVocabSetup(null);
    await refreshWords();
    setActivityVersion((v) => v + 1);
  };

  // Starting tenses, asked the first time the Grammar tab is opened (not in the first run, nor at startup:
  // until then the path simply starts with the book's first lesson)
  const [showTenseSetup, setShowTenseSetup] = useState(false);
  useEffect(() => {
    const onboarding = showOnboarding || shouldShowOnboarding(words.length, loading);
    if (activeTab === "grammar" && vocabSetupChecked && !loading && !onboarding && vocabSetup === null && !hasChosenInitialTenses()) {
      setShowTenseSetup(true);
    }
  }, [activeTab, vocabSetupChecked, loading, showOnboarding, vocabSetup, words.length]);
  const handleTenseSetupDone = async () => {
    setShowTenseSetup(false);
    await refreshWords();
    setActivityVersion((v) => v + 1);
  };

  // Wrong options for multiple choice: the learner's words plus unseen deck words of their levels
  const [catalogDistractors, setCatalogDistractors] = useState<WordDetail[]>([]);
  useEffect(() => {
    let cancelled = false;
    let loadSeq = 0;
    // The deck must be seeded before it is read (a first launch reads an empty table otherwise); the seeding
    // is shared with the call above, and a failed one just leaves the pool empty
    const load = () => {
      const seq = ++loadSeq;
      ensureCatalogSeeded()
        .catch(() => {})
        .then(() => loadCatalogDistractors(getStudyLevels()))
        .then((list) => {
          if (!cancelled && seq === loadSeq) setCatalogDistractors(list);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("myenglish-study-levels-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("myenglish-study-levels-changed", load);
    };
  }, []);
  const distractorPool = useMemo(() => [...words, ...catalogDistractors], [words, catalogDistractors]);

  const handleOnboardingFinish = async (startNow: boolean) => {
    setShowOnboarding(false);
    setShowTenseSetup(false);
    // The levels were just chosen in the first-run flow: never ask for them again right after it
    setVocabSetup((v) => (v === "levels" && hasChosenStudyLevels() ? null : v));
    await refreshWords();
    setActivityVersion((v) => v + 1);
    if (startNow) setPendingAutoStart(true);
  };

  useEffect(() => {
    refreshWords({ showLoading: true });
    // Resume AI analysis for words left with a placeholder meaning (app closed mid-analysis / failed)
    if (AI_VOCAB_ENABLED) requeuePendingWords().catch((err) => console.warn("Requeue pending words failed:", err));
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

    let isCancelled = false;

    // Listen for automatic navigation to review tab triggered by notification click or window focus
    let unlistenReviewFn: (() => void) | null = null;
    let unlistenNotifFn: (() => void) | null = null;

    // "Tập trung" on a reminder: a focus session here, with fresh words
    let unlistenFocusFn: (() => void) | null = null;
    listen<{ minutes?: number }>(START_FOCUS_EVENT, (event) => {
      if (isCancelled) return;
      setGlobalToast(null);
      if (isReviewingRef.current) {
        setActiveTab("review");
        return;
      }
      const minutes = event.payload?.minutes ?? getFocusSettings().minutes;
      refreshWords().finally(() => {
        if (!isCancelled) setPendingFocus(minutes);
      });
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenFocusFn = fn;
      })
      .catch(() => {});

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
    const handleWordsChanged = (e: Event) => {
      if (!isCancelled) scheduleRefresh((e as CustomEvent<WordsChangedDetail | null>).detail?.wordIds);
    };
    window.addEventListener("words-changed", handleWordsChanged);
    const ownLabel = getInitialWindowLabel();
    // Changes from another window while this one is hidden (answers in the popup): merged and dispatched once
    // when it is shown again, instead of reloading the list and every card after each answer.
    // undefined = none pending, null = reload everything
    let hiddenChanges: Set<string> | null | undefined;
    const dispatchWordsChanged = (wordIds?: string[]) =>
      window.dispatchEvent(new CustomEvent<WordsChangedDetail>("words-changed", { detail: { wordIds } }));
    const handleVisible = () => {
      if (document.visibilityState !== "visible" || hiddenChanges === undefined) return;
      const ids = hiddenChanges;
      hiddenChanges = undefined;
      dispatchWordsChanged(ids ? [...ids] : undefined);
    };
    document.addEventListener("visibilitychange", handleVisible);
    listen<WordsChangedDetail | null>("words-changed", (event) => {
      if (isCancelled) return;
      // A change from another window (the popup): re-dispatch the DOM event, so the cards listening to it
      // (Today roadmap, vocabulary tab, insights) reload too, and this window's list with them (the DOM
      // listener above). This window's own changes already dispatched it.
      if (event.payload?.source === ownLabel) return;
      const wordIds = event.payload?.wordIds;
      if (document.visibilityState === "hidden") {
        if (!wordIds) hiddenChanges = null;
        else if (hiddenChanges !== null) {
          hiddenChanges ??= new Set();
          for (const id of wordIds) hiddenChanges.add(id);
        }
        // The cloud sync still pushes them soon
        window.dispatchEvent(new CustomEvent(WORDS_CHANGED_WHILE_HIDDEN_EVENT));
        return;
      }
      dispatchWordsChanged(wordIds);
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenWordsChangedFn = fn;
      })
      .catch(() => { });

    // Catch up when the window comes back after a while (missed events, day rollover)
    const handleFocus = () => {
      if (Date.now() - lastRefreshAtRef.current > 30_000) {
        // A new day may need new words in the buffer
        topUpNewWords()
          .catch(() => {})
          .finally(scheduleRefresh);
      }
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isCancelled = true;
      srsWorker.stop();
      unsubscribePipeline();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      window.removeEventListener("words-changed", handleWordsChanged);
      window.removeEventListener("open-review-popup-preview", handleOpenPreview);
      window.removeEventListener("close-review-popup-preview", handleClosePreview);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
      if (unlistenWordsChangedFn) unlistenWordsChangedFn();
      if (unlistenReviewFn) unlistenReviewFn();
      if (unlistenFocusFn) unlistenFocusFn();
      if (unlistenNotifFn) unlistenNotifFn();
    };
  }, []);

  // A start is being prepared (several awaits before the session exists): a second click must not build another
  const startingRef = useRef(false);
  /**
   * `maxCards`: a short session ("Chỉ 1 phút" on Today: 3 cards to keep the streak). `focus`: a timed focus
   * session over the same queue. Returns whether a new session started.
   */
  const handleStartReview = async (
    onlyDue: boolean = true,
    topicFilter?: string,
    maxCards?: number,
    focus?: FocusPlan
  ): Promise<boolean> => {
    // A session is in progress: confirm with user whether to exit the current session to start the new one
    if (isReviewingRef.current) {
      if (!autoFinishCompletedReview()) {
        setConfirmExitNav({
          pendingStart: () => {
            void prepareAndStartReview(onlyDue, topicFilter, maxCards, focus);
          },
          title: focus ? "Thoát bài đang học để bắt đầu phiên tập trung?" : "Thoát bài đang học để bắt đầu phiên mới?",
          body: focus
            ? "Bạn đang có một phiên học chưa hoàn thành. Bạn có muốn thoát bài đang học để bắt đầu phiên tập trung mới không? Các câu đã trả lời vẫn được lưu."
            : "Bạn đang có một phiên học chưa hoàn thành. Bạn có muốn thoát bài đang học để bắt đầu phiên mới không? Các câu đã trả lời vẫn được lưu.",
          confirmText: focus ? "Bắt đầu tập trung" : "Bắt đầu phiên mới",
        });
        return false;
      }
    }
    if (startingRef.current) return false;
    startingRef.current = true;
    try {
      return await prepareAndStartReview(onlyDue, topicFilter, maxCards, focus);
    } finally {
      startingRef.current = false;
    }
  };
  /**
   * A session over chosen words ("Từ hay quên", one word from Tiến độ): a due card is graded as usual, a word
   * not due is practice (schedulingDecision records it without touching FSRS). Due words first.
   */
  const startWordListSession = (list: WordDetail[], focus?: FocusPlan) => {
    if (isReviewingRef.current) {
      if (!autoFinishCompletedReview()) {
        setConfirmExitNav({
          pendingStart: () => {
            startWordListSession(list, focus);
          },
          title: "Thoát bài đang học để ôn nhóm từ này?",
          body: "Bạn đang có một phiên học chưa hoàn thành. Bạn có muốn thoát bài đang học để ôn nhóm từ này không? Các câu đã trả lời vẫn được lưu.",
          confirmText: "Ôn nhóm từ này",
        });
        return false;
      }
    }
    const now = new Date();
    // The latest schedule of each word (the list may come from an older render)
    const byId = new Map(useWordsStore.getState().words.map((w) => [w.id, w]));
    const due: ReviewCard[] = [];
    const practice: ReviewCard[] = [];
    for (const item of list) {
      const w = byId.get(item.id) ?? item;
      const [dueCard] = getDueCards(w, now);
      if (dueCard) due.push(dueCard);
      else practice.push(practiceCards([w])[0]);
    }
    const session = [...due, ...practice];
    if (session.length === 0) return false;
    // Not a practice session as a whole: each card decides (a card not due is never graded)
    setIsPracticeSession(false);
    setFocusPlan(focus ?? null);
    setReviewSet(session);
    setSessionId((id) => id + 1);
    sessionCompletedRef.current = false;
    isReviewingRef.current = true;
    setIsReviewing(true);
    setActiveTab("review");
    return true;
  };

  /** Focus session: the usual queue (due cards first, then today's new words), timed */
  const handleStartFocus = (minutes: number) => {
    saveFocusSettings({ minutes });
    return handleStartReview(true, undefined, undefined, newFocusPlan(minutes));
  };
  const prepareAndStartReview = async (
    onlyDue: boolean,
    topicFilter?: string,
    maxCards?: number,
    focus?: FocusPlan
  ): Promise<boolean> => {
    const now = new Date();
    const matchesTopic = (w: WordDetail) =>
      !topicFilter ||
      topicFilter === "all" ||
      (w.topic || "General Tech").trim().toLowerCase() === topicFilter.trim().toLowerCase();

    const capturePlace = AI_VOCAB_ENABLED ? "Thêm từ bằng AI" : "Lộ trình từ vựng";
    const levelText = topicFilter && topicFilter !== "all" ? ` ở cấp ${topicFilter}` : "";

    // Read the store directly so callers registered in older renders never see stale words
    const pool = useWordsStore.getState().words.filter(matchesTopic);
    if (pool.length === 0) {
      setGlobalToast(null);
      setStartNotice({
        title: `Chưa có từ nào để học${levelText}`,
        body: AI_VOCAB_ENABLED
          ? `Mở "${capturePlace}" để thêm vài từ đầu tiên.`
          : `Mở "${capturePlace}" và chọn cấp độ (ví dụ A1): app sẽ lấy từ trong bộ Oxford cho bạn.`,
      });
      return false;
    }

    let session: ReviewCard[] = [];
    if (onlyDue) {
      const due = pool.filter((w) => isWordDue(w, now));
      const newToday = await getNewCardsIntroducedToday().catch(() => ({ recognition: 0, production: 0 }));
      // Comeback plan: today's share first (then normal-sized extra sessions), with the plan's 1-2 new words a
      // day once the backlog goes down. Computed here, not read from render state, since older closures may call this.
      const backlog = summarizeTodayWork(useWordsStore.getState().words, newToday, now).reviews;
      const cb = resolveComeback(backlog, getStudyLimits().maxSessionSize, now);
      const plan = cb && !cb.caughtUp ? cb : null;
      const cap = Math.min(maxCards ?? Infinity, plan && plan.todayRemaining > 0 ? plan.todayRemaining : Infinity);
      session = buildReviewSession(due, newToday, now, {
        maxCards: Number.isFinite(cap) ? cap : undefined,
        comebackNewCards: plan ? plan.newWordsPerDay : undefined,
      });
    }

    if (session.length > 0) {
      setIsPracticeSession(false);
    } else {
      // Nothing due and today's new words done. "Học thêm": a few extra new words in deck order, as a real
      // session (they count as new cards today), within extraNewWordAllowance; otherwise extra practice on
      // the weakest words, not recorded in FSRS.
      const maxSessionSize = Math.min(getStudyLimits().maxSessionSize, maxCards ?? Infinity);
      const newToday = await getNewCardsIntroducedToday().catch(() => ({ recognition: 0, production: 0 }));
      const extra = onlyDue ? extraNewWordAllowance(useWordsStore.getState().words, newToday) : { allowed: 0, young: 0, cap: 0, reason: null };
      if (extra.allowed > 0) {
        try {
          const waitingCount = await countWaitingWords();
          if (waitingCount < extra.allowed) {
            await topUpNewWords({ target: extra.allowed });
            await refreshWords();
          }
        } catch (err) {
          console.warn("Failed to top up extra new words:", err);
        }
        const waitingNewWords = useWordsStore
          .getState()
          .words.filter(matchesTopic)
          .filter((w) => (w.srs?.reps ?? 0) === 0 && (w.srs?.state ?? 0) === 0 && !isPlaceholderMeaning(w.meaning_vn) && !isSuspended(w))
          // Deck order: the buffer's due time, then insertion order (IT words and the level mix come first)
          .sort((a, b) => a.srs.next_review_date.localeCompare(b.srs.next_review_date) || a.created_at.localeCompare(b.created_at));
        session = waitingNewWords.slice(0, Math.min(extra.allowed, maxSessionSize)).map((w) => toCard(w, "recognition"));
      }
      if (session.length > 0) {
        setIsPracticeSession(false);
      } else {
        // Practice: words being learnt first (all studied words when none of them can be practised now), never
        // the words just answered right several times in a row (practicePicker): practice answers do not move
        // FSRS, so a fixed "weakest first" order asked the same words again and again
        const latestPool = useWordsStore.getState().words.filter(matchesTopic);
        const runs = await loadRecentRuns(now).catch(() => new Map<string, RecentRun>());
        const fromUnmastered = pickPracticeWords(getUnmasteredWords(latestPool), runs, maxSessionSize, { now });
        const picked =
          fromUnmastered.length > 0 ? fromUnmastered : pickPracticeWords(getStudiedWords(latestPool), runs, maxSessionSize, { now });
        session = practiceCards(interleaveTopics(picked));
        if (session.length === 0) {
          const resting = countResting(getStudiedWords(latestPool), runs, now);
          if (resting > 0) {
            setGlobalToast(null);
            setStartNotice({
              title: "Các từ đã học đang được nghỉ",
              body: `${resting} từ bạn vừa trả lời đúng liên tiếp được nghỉ luyện thêm một thời gian: nghỉ giữa các lần nhớ lại giúp nhớ lâu hơn. Chúng vẫn quay lại đúng lịch ôn. Bạn có thể học từ mới hoặc làm bài ngữ pháp.`,
            });
            return false;
          }
        }
        setIsPracticeSession(true);
        if (extra.reason === "young" && session.length > 0) {
          setGlobalToast({
            title: "Củng cố từ đang học",
            body: `Bạn đang học ${extra.young} từ chưa vững. Luyện thêm các từ này (không ảnh hưởng lịch ôn); từ mới sẽ đến theo hạn mức mỗi ngày.`,
          });
        } else if (extra.reason === "daily" && session.length > 0) {
          setGlobalToast({
            title: "Đã học đủ từ mới hôm nay",
            body: "Bạn đã học gấp đôi hạn mức từ mới. Luyện lại vài từ yếu (không ảnh hưởng lịch ôn), mai học tiếp nhé!",
          });
        }
      }
    }

    if (session.length === 0) {
      setGlobalToast(null);
      setStartNotice({
        title: `Chưa có từ nào để ôn lúc này${levelText}`,
        body: `Không còn từ mới đang chờ và chưa có từ nào đã học để luyện. Mở "${capturePlace}" để chọn thêm cấp độ hoặc chọn từ muốn học.`,
      });
      return false;
    }

    setFocusPlan(focus ?? null);
    setReviewSet(session);
    setSessionId((id) => id + 1);
    sessionCompletedRef.current = false;
    isReviewingRef.current = true;
    setIsReviewing(true);
    setActiveTab("review");
    return true;
  };

  // Consume a focus session asked for from a reminder once the latest words are available
  useEffect(() => {
    if (pendingFocus === null || loading) return;
    const minutes = pendingFocus;
    setPendingFocus(null);
    handleStartFocus(minutes);
  }, [pendingFocus, loading]);

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

  // The library shows the learner's words: deck words still waiting to be introduced are not theirs yet
  const libraryWords = useMemo(
    () =>
      words.filter(
        (w) =>
          !w.catalog_id ||
          (w.srs?.reps ?? 0) > 0 ||
          (w.srs?.state ?? 0) > 0 ||
          Boolean(w.srs?.last_review)
      ),
    [words]
  );

  const topicStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of libraryWords) {
      const t = (w.topic || "General Tech").trim();
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [libraryWords]);

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

  // The library's own computations (list, bucket counts, per-card data) run only while it is on screen
  const isLibraryTab = activeTab === "library";
  // Typing stays responsive: the list follows the query a moment later
  const deferredSearch = useDeferredValue(searchQuery);

  // Sort keys of the library list, once per words change (not per comparison): words by when they really come
  // back (services/librarySchedule: due, then back tomorrow, then waiting for the new-card budget, then later),
  // then never-studied words newest first
  const sortKeys = useMemo(() => {
    const keys = new Map<string, { isNew: boolean; created: number; next: number }>();
    if (!isLibraryTab) return keys;
    const now = new Date(nowTick);
    for (const w of libraryWords) {
      // When the word really comes back (the session's rules: a card waiting or buried is not "due")
      const s = librarySchedule(w, now);
      keys.set(w.id, { isNew: s.kind === "new", created: new Date(w.created_at).getTime(), next: s.sortAt ?? Infinity });
    }
    return keys;
  }, [libraryWords, isLibraryTab, nowTick]);

  // Filter & Search Logic
  const filteredWords = useMemo(() => {
    if (!isLibraryTab) return EMPTY_WORDS;
    const now = new Date(nowTick);
    const q = deferredSearch.toLowerCase().trim();
    const result = libraryWords.filter((item) => {
      // Search
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

      // Review schedule time bucket filter
      if (reviewTimeFilter !== "all" && librarySchedule(item, now).info.bucket !== reviewTimeFilter) {
        return false;
      }

      return true;
    });

    // Default sort: words due earliest / coming up next first
    return result.sort((a, b) => {
      const ka = sortKeys.get(a.id);
      const kb = sortKeys.get(b.id);
      if (!ka || !kb) return 0;
      if (ka.isNew && kb.isNew) return kb.created - ka.created;
      if (ka.isNew !== kb.isNew) return ka.isNew ? 1 : -1;
      if (ka.next !== kb.next) return ka.next - kb.next;
      return a.word.localeCompare(b.word);
    });
  }, [isLibraryTab, libraryWords, sortKeys, deferredSearch, reviewTimeFilter, selectedTopic, nowTick]);

  // Counts for each review schedule bucket
  const reviewBucketCounts = useMemo<Record<ReviewTimeBucket, number>>(() => {
    if (!isLibraryTab) return EMPTY_BUCKET_COUNTS;
    const now = new Date(nowTick);
    const counts: Record<ReviewTimeBucket, number> = {
      all: libraryWords.length,
      due: 0,
      today: 0,
      "1-3d": 0,
      "4-7d": 0,
      future: 0,
      waiting: 0,
      new: 0,
    };
    for (const w of libraryWords) counts[librarySchedule(w, now).info.bucket]++;
    return counts;
  }, [libraryWords, nowTick, isLibraryTab]);

  // Single pass over words: due/learned/leech counts and per-topic {total, due}
  const libraryStats = useMemo<LibraryStats>(() => {
    const now = new Date(nowTick);
    const leechIds = new Set(getLeechWords(libraryWords).map((w) => w.id));
    const dueWords: WordDetail[] = [];
    const perTopic: Record<string, { total: number; due: number }> = {};
    for (const w of libraryWords) {
      // Due as a session would ask it: not a card waiting for the new-card budget, nor one buried until tomorrow
      const isDue = librarySchedule(w, now).isDue;
      if (isDue) dueWords.push(w);
      const key = (w.topic || "General Tech").trim().toLowerCase();
      const entry = perTopic[key] || (perTopic[key] = { total: 0, due: 0 });
      entry.total++;
      if (isDue) entry.due++;
    }
    const { learning, rememberedLong } = countWordStatus(libraryWords);
    return { dueWords, learningCount: learning, rememberedLongCount: rememberedLong, leechCount: leechIds.size, perTopic };
  }, [libraryWords, nowTick]);

  // What a review session will actually contain today: due reviews + new words within the daily budget
  const dueCount = todayWork.total;

  // "Từ hay quên": how many, and how many due now (sidebar and tab labels, Today hint). Reads the last 30 days of
  // answers: not on every answer of a session, a moment after the words settle.
  const [forgottenCount, setForgottenCount] = useState(0);
  const [forgottenDue, setForgottenDue] = useState(0);
  useEffect(() => {
    if (isReviewing) return;
    let stale = false;
    const timer = setTimeout(() => {
      loadForgottenWords(words)
        .then((d) => {
          if (stale) return;
          setForgottenCount(d.active.length);
          setForgottenDue(d.active.filter((e) => e.dueNow).length);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [words, isReviewing]);

  // Per-card derived data (parsed synonyms + FSRS retrievability), computed once per words change
  const cardMeta = useMemo(() => {
    if (!isLibraryTab) return EMPTY_CARD_META;
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
  }, [words, nowTick, isLibraryTab]);

  // Gallery pagination (reset when filters/search change)
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(GALLERY_PAGE_SIZE);
  }, [searchQuery, reviewTimeFilter, selectedTopic]);
  const visibleWords = useMemo(() => filteredWords.slice(0, visibleCount), [filteredWords, visibleCount]);

  // Keyboard-first Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The session's own shortcuts own the keys only while it is on screen (it stays mounted behind other tabs)
      if ((isReviewing && activeTab === "review") || wordToDelete) return;
      // Browser / OS shortcuts (Cmd+R reload, Ctrl+J...) and open dialogs (first-run, setup, the library's
      // review-trajectory modal) keep their keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (showOnboarding || vocabSetup || showTenseSetup) return;
      // (the word panel is a dialog too, but its j/k / Esc navigation is wanted)
      if (document.querySelector('[aria-modal="true"]:not([aria-label^="Chi tiết từ"])')) return;

      const isTyping =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        !!(e.target as HTMLElement | null)?.isContentEditable;

      // '/' to focus search input (word library)
      if (e.key === "/" && !isTyping && activeTab === "library") {
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

      // 'f' on Today: focus session with the last chosen length
      if (e.key.toLowerCase() === "f" && activeTab === "today" && !isReviewing) {
        e.preventDefault();
        handleStartFocus(getFocusSettings().minutes);
        return;
      }

      // 'r' to start due reviews
      if (e.key.toLowerCase() === "r" && activeTab === "library") {
        e.preventDefault();
        handleStartReview(true);
        return;
      }

      // The word-card navigation below belongs to the library: other tabs keep ↑/↓ for scrolling
      if (activeTab !== "library") return;

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
  }, [isReviewing, wordToDelete, selectedWord, filteredWords, searchQuery, activeTab, showOnboarding, vocabSetup, showTenseSetup]);

  return (
    // h-full, not h-screen: with the interface scale (zoom on <html>) 100vh is taller than the window
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans selection:bg-cyan-500 selection:text-white relative">
      {/* GLOBAL NOTIFICATION INTERACTIVE TOAST */}
      {globalToast && (
        <GlobalToast
          globalToast={globalToast}
          handleOpenReview={handleOpenReview}
          setGlobalToast={setGlobalToast}
        />
      )}

      {/* NOTHING TO STUDY: why, and where to pick levels / words */}
      {startNotice && (
        <div
          role="status"
          className="fixed top-5 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)] bg-white dark:bg-zinc-900 border-2 border-cyan-500/80 rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top-4 duration-300"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 select-text">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{startNotice.title}</h4>
            <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">{startNotice.body}</p>
            <button
              onClick={() => {
                setStartNotice(null);
                setActiveTab("capture");
              }}
              className="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors select-none"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{AI_VOCAB_ENABLED ? "Mở Thêm từ bằng AI" : "Mở Lộ trình từ vựng"}</span>
            </button>
          </div>
          <button
            onClick={() => setStartNotice(null)}
            aria-label="Đóng thông báo"
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SMART AUTO-REPLENISH BANNER NOTIFICATION */}
      {autoReplenishBanner && (
        <AutoReplenishBanner
          autoReplenishBanner={autoReplenishBanner}
          setActiveTab={handleSelectTab}
          setAutoReplenishBanner={setAutoReplenishBanner}
        />
      )}

      {/* LEFT SIDEBAR (hidden in a focus session: only the card is on screen) */}
      {!focusing && (
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        pipelineQueue={pipelineQueue}
        dueCount={dueCount}
        streakStats={streakStats}
        libraryStats={libraryStats}
        simpleMode={simpleMode}
        forgottenCount={forgottenCount}
        forgottenDue={forgottenDue}
      />
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-zinc-950">
        {/* Top App Bar */}
        {!focusing && (
        <DashboardHeader
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          viewMode={viewMode}
          setViewMode={setViewMode}
          streakStats={streakStats}
          dueCount={dueCount}
          todayWork={todayWork}
          effectiveLevel={effectiveLevel}
          setGlobalToast={setGlobalToast}
          onStartReview={() => handleStartReview(true)}
          onStartFocus={() => handleStartFocus(getFocusSettings().minutes)}
          forgottenCount={forgottenCount}
          forgottenDue={forgottenDue}
          isReviewing={isReviewing}
          simpleMode={simpleMode}
        />
        )}

        {/* TODAY: the opening screen, one main action */}
        {activeTab === "today" && (
          <Suspense fallback={<TabFallback />}>
            <TodayTab
              words={words}
              todayWork={todayWork}
              comeback={comeback}
              streakStats={streakStats}
              onStart={() => handleStartReview(true)}
              onQuickStart={() => handleStartReview(true, undefined, 3)}
              onStartFocus={handleStartFocus}
              onStartReflex={() => setReflexChallengeOpen(true)}
              forgottenDue={forgottenDue}
              setActiveTab={handleSelectTab}
              loading={loading}
              simpleMode={simpleMode}
            />
          </Suspense>
        )}

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
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            availableTopics={availableTopics}
            topicStats={topicStats}
            reviewTimeFilter={reviewTimeFilter}
            setReviewTimeFilter={setReviewTimeFilter}
            reviewBucketCounts={reviewBucketCounts}
            handleStartReview={handleStartReview}
            requestDeleteWord={requestDeleteWord}
            setActiveTab={handleSelectTab}
          />
        )}

        {/* TAB 2: QUICK CAPTURE & AI PIPELINE (the Oxford deck's levels while AI vocabulary is off) */}
        {activeTab === "capture" && !AI_VOCAB_ENABLED && (
          <Suspense fallback={<TabFallback />}>
            <VocabTab />
          </Suspense>
        )}
        {activeTab === "capture" && AI_VOCAB_ENABLED && (
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
            setActiveTab={handleSelectTab}
          />
        )}

        <Suspense fallback={<TabFallback />}>
        {/* READING MODE: real text with the learner's words highlighted */}
        {activeTab === "reading" && <ReadingTab resetKey={tabResetKey} />}

        {/* WRITING: daily standup corrected by AI + the learner's mistake notebook */}
        {activeTab === "writing" && (
          <WritingTab
            resetKey={tabResetKey}
            onOpenGrammarLesson={(id) => {
              setGrammarLessonToOpen(id);
              setActiveTab("grammar");
            }}
          />
        )}

        {/* TAB 3: DAILY REVIEW (the start screen; the session itself is rendered below) */}
        {activeTab === "review" && !isReviewing && (
          <ReviewTab
            dueCount={dueCount}
            todayWork={todayWork}
            comeback={comeback}
            libraryStats={libraryStats}
            availableTopics={availableTopics}
            handleStartReview={handleStartReview}
            onStartFocus={handleStartFocus}
            onOpenDueWords={() => {
              setReviewTimeFilter("due");
              handleSelectTab("library");
            }}
            setMessage={setMessage}
          />
        )}

        {/* WORDS MARKED "ĐÃ BIẾT": waiting for their check, or checked with the result */}
        {activeTab === "known" && (
          <KnownTab
            onCheckNow={(list) => {
              // The checks become due now, then the words are reviewed for real (graded, not practice)
              checkKnownNow(list.map((w) => w.id))
                .then(() => refreshWords())
                .then(() => startWordListSession(list))
                .catch((err) => setMessage(`Không bắt đầu được phần kiểm tra: ${err}`));
            }}
          />
        )}

        {/* WORDS OFTEN FORGOTTEN: the list, why, and one button to review them */}
        {activeTab === "forgotten" && (
          <ForgottenTab
            onStartSession={(list) => startWordListSession(list)}
            onStartFocus={(list, minutes) => startWordListSession(list, newFocusPlan(minutes))}
            onRefreshWords={refreshWords}
          />
        )}

        {/* TAB 4: ADVANCED ANALYTICS & INSIGHTS */}
        {activeTab === "analytics" && (
          <AnalyticsView
            words={words}
            dueRemaining={todayWork.total}
            onOpenForgotten={() => handleSelectTab("forgotten")}
            onRefreshWords={refreshWords}
            onOpenGrammarLesson={(id) => {
              setGrammarLessonToOpen(id);
              setActiveTab("grammar");
            }}
          />
        )}

        {/* TAB 5: CLI & NOTIFICATION SETUP GUIDE */}
        {activeTab === "guide" && (
          <CliGuideView
            onRefreshWords={refreshWords}
            onNavigateTab={(tab) => {
              handleSelectTab(tab);
            }}
          />
        )}

        {/* LEADERBOARD: XP race (needs an account) */}
        {activeTab === "leaderboard" && (
          <LeaderboardTab
            onOpenSettings={() => handleSelectTab("account")}
            onStartReflexChallenge={() => setReflexChallengeOpen(true)}
          />
        )}

        {/* ACCOUNT: sign-in and sync */}
        {activeTab === "account" && <AccountTab onOpenLeaderboard={() => handleSelectTab("leaderboard")} />}

        {/* PRONUNCIATION: final sounds, -s/-ed endings, th, stress, IT words */}
        {activeTab === "pronunciation" && <PronunciationTab resetKey={tabResetKey} />}

        {/* TAB 6: GRAMMAR HUB (A1 - C1 ROADMAP & DIAGNOSTIC PRACTICE) */}
        {activeTab === "grammar" && <GrammarHub key={grammarLessonToOpen ?? "hub"} initialLessonId={grammarLessonToOpen} resetKey={tabResetKey} />}
        </Suspense>

        {/* INTERACTIVE FLASHCARD SESSION: stays mounted (hidden) on other tabs, so leaving the tab neither
            restarts it from card 0 nor grades its cards a second time. Own Suspense boundary: a lazy tab
            loading must not touch it. */}
        {isReviewing && (
          <div className={activeTab === "review" ? "contents" : "hidden"}>
            <Suspense fallback={<TabFallback />}>
              <FlashcardReview
                key={sessionId}
                wordsToReview={reviewSet}
                distractorPool={distractorPool}
                practiceMode={isPracticeSession}
                active={activeTab === "review"}
                focus={focusPlan}
                onSessionCompleted={(completed) => {
                  sessionCompletedRef.current = completed;
                }}
                onRetryMissed={(ids) => {
                  // The words just missed, right away: each is practice unless its own step has come due
                  const byId = new Map(useWordsStore.getState().words.map((w) => [w.id, w]));
                  startWordListSession(ids.map((id) => byId.get(id)).filter((w): w is WordDetail => !!w));
                }}
                onStartFocus={(minutes) => {
                  sessionCompletedRef.current = false;
                  // Five more minutes, or a first try after a normal session: a new queue (what is due now)
                  refreshDirtyRef.current = false;
                  isReviewingRef.current = false;
                  setIsReviewing(false);
                  setFocusPlan(null);
                  refreshWords().finally(() =>
                    // Not saved as the usual length: "5 more minutes" is a one-off
                    handleStartReview(true, undefined, undefined, newFocusPlan(minutes)).then((started) => {
                      if (!started) setActiveTab("today");
                    })
                  );
                }}
                onNavigate={(tab) => {
                  sessionCompletedRef.current = false;
                  refreshDirtyRef.current = false;
                  isReviewingRef.current = false;
                  setIsReviewing(false);
                  setFocusPlan(null);
                  handleSelectTab(tab);
                  topUpNewWords().catch(() => {}).finally(() => refreshWords());
                }}
                onFinish={() => {
                  sessionCompletedRef.current = false;
                  refreshDirtyRef.current = false; // reloaded just below
                  isReviewingRef.current = false;
                  setIsReviewing(false);
                  setFocusPlan(null);
                  // Close the loop on the day: back to "Hôm nay" (what is left, the streak, the goal)
                  setActiveTab("today");
                  topUpNewWords().catch(() => {}).finally(() => refreshWords());
                }}
                onExit={() => {
                  sessionCompletedRef.current = false;
                  refreshDirtyRef.current = false;
                  isReviewingRef.current = false;
                  setIsReviewing(false);
                  setFocusPlan(null);
                  setActiveTab("today");
                  // Reviews answered before exiting were already persisted
                  topUpNewWords().catch(() => {}).finally(() => refreshWords());
                }}
              />
            </Suspense>
          </div>
        )}
      </main>

      {/* RIGHT SLIDE-OVER WORD DETAIL INSPECTOR */}
      <WordInspector
        requestDeleteWord={requestDeleteWord}
        expandedTerms={expandedTerms}
        toggleTermExpanded={toggleTermExpanded}
        copiedSnippet={copiedSnippet}
        handleCopyCode={handleCopyCode}
        setActiveTab={handleSelectTab}
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

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingFlow onFinish={handleOnboardingFinish} />
        </Suspense>
      )}

      {!showOnboarding && vocabSetup && (
        <Suspense fallback={null}>
          <VocabSetupScreen mode={vocabSetup} onDone={handleVocabSetupDone} />
        </Suspense>
      )}

      {!showOnboarding && !vocabSetup && showTenseSetup && (
        <Suspense fallback={null}>
          <GrammarTenseSetupModal onDone={handleTenseSetupDone} />
        </Suspense>
      )}

      {/* ⚡ DUOLINGO RAMP UP REFLEX CHALLENGE MODAL */}
      {reflexChallengeOpen && (
        <Suspense fallback={null}>
          <ReflexChallengeModal
            words={words}
            isOpen={reflexChallengeOpen}
            onClose={() => setReflexChallengeOpen(false)}
            onXPUpdated={() => {
              void refreshWords();
            }}
          />
        </Suspense>
      )}

      {/* LEVEL UP CELEBRATION & BADGE UNLOCK TOASTS */}
      <LevelUpModal />

      {/* CONFIRM EXIT CURRENT REVIEW MODAL */}
      {confirmExitNav && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={confirmExitNav.title || "Thoát bài đang học"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setConfirmExitNav(null);
            setActiveTab("review");
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {confirmExitNav.title || "Thoát bài đang học?"}
            </p>
            <p className="text-xs text-slate-600 dark:text-zinc-300">
              {confirmExitNav.body || "Bạn có muốn thoát phiên học đang diễn ra không? Các câu đã trả lời vẫn được lưu."}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                autoFocus
                onClick={() => {
                  setConfirmExitNav(null);
                  setActiveTab("review");
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-colors"
              >
                {confirmExitNav.pendingStart ? "Học tiếp bài cũ" : "Học tiếp"}
              </button>
              <button
                onClick={handleConfirmExit}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {confirmExitNav.confirmText || "Thoát"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
