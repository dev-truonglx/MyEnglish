import { useEffect, useState, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { Layers, X } from "lucide-react";
import { takePendingContext, pipeline, requeuePendingWords, type PipelineItem } from "@/services/pipeline";
import { srsWorker, getStudyLimits } from "@/services/srs";
import { parseTerms, type WordDetail, type ReviewCard } from "@/types/database";
import { isPlaceholderMeaning } from "@/services/db";
import { getDueCards, isWordDue, practiceCards, getNextReviewDate, toCard } from "@/services/cards";
import { formatNextReviewRelative, compareNextReview, type ReviewTimeBucket } from "@/utils/reviewSchedule";
import { calculateStreakAndGoal } from "@/services/streak";
import { applyComebackToWork, resolveComeback } from "@/services/comeback";
import { shouldShowOnboarding } from "@/services/onboarding";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { countWaitingWords, getStudyLevels, hasChosenStudyLevels, pullMessage, pullWordFromDeck, topUpNewWords } from "@/services/vocabFeed";
import { ensureCatalogSeeded, loadCatalogDistractors } from "@/services/vocabCatalog";
import { ensureGrammarBookSeeded } from "@/services/grammarBook";
import { ensureReleaseMigrationV27 } from "@/services/releaseMigration";
import { hasChosenInitialTenses } from "@/services/grammarPath";
import { needsVocabMigration } from "@/services/vocabReset";
import { isSimpleMode } from "@/services/learnerProfile";
import { countWordStatus, isRememberedLong } from "@/services/wordStatus";
import {
  getRetrievabilityInfo,
  isLeech,
  getLeechWords,
  smartSortReviewQueue,
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
const PronunciationTab = lazy(() => import("./dashboard/PronunciationTab"));
const TodayTab = lazy(() => import("./dashboard/TodayTab"));
const VocabTab = lazy(() => import("./dashboard/VocabTab"));
const VocabSetupScreen = lazy(() => import("./VocabSetupScreen"));
const GrammarTenseSetupModal = lazy(() => import("./grammar/GrammarTenseSetupModal"));

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
  const [reviewTimeFilter, setReviewTimeFilter] = useState<ReviewTimeBucket>("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  // The app opens on "Hôm nay": one clear thing to do, not the whole word library
  const [activeTab, setActiveTab] = useState<DashboardTab>("today");
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
  // New key per session so FlashcardReview never reuses the previous queue
  const [sessionId, setSessionId] = useState(0);
  const [reviewSet, setReviewSet] = useState<ReviewCard[]>([]);

  // The word panel belongs to the screen it was opened from: a tab change closes it, unless the same click
  // picked the word (Capture's "Xem chi tiết" opens the library with it). A new session closes it too, so the
  // meaning of a word being asked is never on screen.
  const selectedBeforeRef = useRef(selectedWord);
  useEffect(() => {
    if (selectedWord && selectedWord === selectedBeforeRef.current) setSelectedWord(null);
  }, [activeTab]);
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

  const currentProficiency = useMemo(() => {
    return assessUserProficiency(words);
  }, [words, activityVersion]);
  const effectiveLevel = currentProficiency.effectiveLevel;

  // New cards already introduced today: "due" only counts new words the daily budget still allows
  const [introducedToday, setIntroducedToday] = useState<NewCardCounts>({ recognition: 0, production: 0 });
  useEffect(() => {
    getNewCardsIntroducedToday().then(setIntroducedToday).catch(() => {});
  }, [words, activityVersion]);
  const fullTodayWork = useMemo(() => summarizeTodayWork(words, introducedToday), [words, introducedToday, activityVersion]);
  // Back after a break: the backlog is spread over a few days and only today's share is counted
  const comeback = useMemo(
    () => resolveComeback(fullTodayWork.reviews, getStudyLimits().maxSessionSize),
    [fullTodayWork.reviews, activityVersion]
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
  }, [fullTodayWork, comeback, words, introducedToday]);

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
    ensureReleaseMigrationV27()
      .then((wiped) => {
        if (wiped) {
          refreshWords();
          setActivityVersion((v) => v + 1);
        }
      })
      .catch(() => {});
    ensureCatalogSeeded().catch(() => {});
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

  // Starting tense setup for users who have not chosen initial tenses (startup on new version)
  const [showTenseSetup, setShowTenseSetup] = useState(false);
  useEffect(() => {
    const onboarding = showOnboarding || shouldShowOnboarding(words.length, loading);
    if (vocabSetupChecked && !loading && !onboarding && vocabSetup === null && !hasChosenInitialTenses()) {
      setShowTenseSetup(true);
    }
  }, [vocabSetupChecked, loading, showOnboarding, vocabSetup, words.length]);
  const handleTenseSetupDone = async () => {
    setShowTenseSetup(false);
    await refreshWords();
    setActivityVersion((v) => v + 1);
  };

  // Wrong options for multiple choice: the learner's words plus unseen deck words of their levels
  const [catalogDistractors, setCatalogDistractors] = useState<WordDetail[]>([]);
  useEffect(() => {
    const load = () => loadCatalogDistractors(getStudyLevels()).then(setCatalogDistractors).catch(() => {});
    load();
    window.addEventListener("myenglish-study-levels-changed", load);
    return () => window.removeEventListener("myenglish-study-levels-changed", load);
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

    // Listen to real-time word submissions from Quick Input floating bar (Cmd+Shift+E)
    let isCancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<{ word: string }>("word-submitted", (event) => {
      if (isCancelled) return;
      const w = event.payload.word;
      if (!AI_VOCAB_ENABLED) {
        // The deck is the only source of words: a word typed in Quick Input is learnt early if it is in it
        pullWordFromDeck(w, takePendingContext(w))
          .then((r) => {
            setMessage(pullMessage(r));
            scheduleRefresh();
          })
          .catch(() => {});
        return;
      }
      pipeline.enqueue(w, { context: takePendingContext(w) }).then((res) => {
        setMessage(
          res.accepted ? `Received "${w}" from Quick Input. Gemini AI is analyzing...` : `Không thể thêm "${w}": ${res.reason}`
        );
      });
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
    const handleWordsChanged = () => {
      if (!isCancelled) scheduleRefresh();
    };
    window.addEventListener("words-changed", handleWordsChanged);
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
      if (unlistenWordsChangedFn) unlistenWordsChangedFn();
      if (unlistenFn) unlistenFn();
      if (unlistenReviewFn) unlistenReviewFn();
      if (unlistenNotifFn) unlistenNotifFn();
    };
  }, []);

  /** `maxCards`: a short session ("Chỉ 1 phút" on Today: 3 cards to keep the streak) */
  const handleStartReview = async (onlyDue: boolean = true, topicFilter?: string, maxCards?: number) => {
    // A session is in progress (maybe kept behind another tab): show it instead of restarting from card 0
    if (isReviewingRef.current) {
      setActiveTab("review");
      return;
    }
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
      return;
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
        const latestPool = useWordsStore.getState().words.filter(matchesTopic);
        const unmastered = getUnmasteredWords(latestPool);
        const studied = (unmastered.length > 0 ? unmastered : getStudiedWords(latestPool)).filter((w) => !isPlaceholderMeaning(w.meaning_vn));
        session = practiceCards(smartSortReviewQueue(studied, now).slice(0, maxSessionSize));
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
      return;
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

  // Ticks every minute so "due" computations don't freeze at the last words change
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Filter & Search Logic
  const filteredWords = useMemo(() => {
    const now = new Date(nowTick);
    const result = libraryWords.filter((item) => {
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
        return isRememberedLong(item);
      }
      if (filterMode === "leech") {
        return isLeech(item.srs);
      }

      // Review schedule time bucket filter
      if (reviewTimeFilter !== "all") {
        const isNew = (!item.srs.reps && !item.srs.repetitions) || item.srs.repetitions === 0;
        const nextDate = getNextReviewDate(item);
        const info = formatNextReviewRelative(nextDate, isNew, now);
        if (info.bucket !== reviewTimeFilter) {
          return false;
        }
      }

      return true;
    });

    // Default sort: words due earliest / coming up next first
    return result.sort((a, b) => compareNextReview(a, b, now));
  }, [libraryWords, searchQuery, filterMode, reviewTimeFilter, selectedTopic, nowTick]);

  // Counts for each review schedule bucket
  const reviewBucketCounts = useMemo<Record<ReviewTimeBucket, number>>(() => {
    const now = new Date(nowTick);
    const counts: Record<ReviewTimeBucket, number> = {
      all: libraryWords.length,
      due: 0,
      today: 0,
      "1-3d": 0,
      "4-7d": 0,
      future: 0,
      new: 0,
    };
    for (const w of libraryWords) {
      const isNew = (!w.srs.reps && !w.srs.repetitions) || w.srs.repetitions === 0;
      const nextDate = getNextReviewDate(w);
      const info = formatNextReviewRelative(nextDate, isNew, now);
      counts[info.bucket]++;
    }
    return counts;
  }, [libraryWords, nowTick]);

  // Single pass over words: due/learned/leech counts and per-topic {total, due}
  const libraryStats = useMemo<LibraryStats>(() => {
    const now = new Date(nowTick);
    const leechIds = new Set(getLeechWords(libraryWords).map((w) => w.id));
    const dueWords: WordDetail[] = [];
    const perTopic: Record<string, { total: number; due: number }> = {};
    for (const w of libraryWords) {
      const isDue = isWordDue(w, now);
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
      // The session's own shortcuts own the keys only while it is on screen (it stays mounted behind other tabs)
      if ((isReviewing && activeTab === "review") || wordToDelete) return;

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
  }, [isReviewing, wordToDelete, selectedWord, filteredWords, searchQuery, activeTab]);

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
        simpleMode={simpleMode}
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
          onStartReview={() => handleStartReview(true)}
          isReviewing={isReviewing}
          simpleMode={simpleMode}
        />

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
              setActiveTab={setActiveTab}
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
            filterMode={filterMode}
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            availableTopics={availableTopics}
            topicStats={topicStats}
            reviewTimeFilter={reviewTimeFilter}
            setReviewTimeFilter={setReviewTimeFilter}
            reviewBucketCounts={reviewBucketCounts}
            handleStartReview={handleStartReview}
            requestDeleteWord={requestDeleteWord}
            setActiveTab={setActiveTab}
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
            setActiveTab={setActiveTab}
          />
        )}

        <Suspense fallback={<TabFallback />}>
        {/* READING MODE: real text with the learner's words highlighted */}
        {activeTab === "reading" && <ReadingTab />}

        {/* WRITING: daily standup corrected by AI + the learner's mistake notebook */}
        {activeTab === "writing" && (
          <WritingTab
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
            comeback={comeback}
            libraryStats={libraryStats}
            availableTopics={availableTopics}
            handleStartReview={handleStartReview}
            setMessage={setMessage}
          />
        )}

        {/* TAB 4: ADVANCED ANALYTICS & INSIGHTS */}
        {activeTab === "analytics" && (
          <AnalyticsView
            words={words}
            dueRemaining={todayWork.total}
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

        {/* PRONUNCIATION: final sounds, -s/-ed endings, th, stress, IT words */}
        {activeTab === "pronunciation" && <PronunciationTab />}

        {/* TAB 6: GRAMMAR HUB (A1 - C1 ROADMAP & DIAGNOSTIC PRACTICE) */}
        {activeTab === "grammar" && <GrammarHub key={grammarLessonToOpen ?? "hub"} initialLessonId={grammarLessonToOpen} />}
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
                onFinish={() => {
                  setIsReviewing(false);
                  // Close the loop on the day: back to "Hôm nay" (what is left, the streak, the goal)
                  setActiveTab("today");
                  topUpNewWords().catch(() => {}).finally(() => refreshWords());
                }}
                onExit={() => {
                  setIsReviewing(false);
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

      {/* LEVEL UP CELEBRATION & BADGE UNLOCK TOASTS */}
      <LevelUpModal />
    </div>
  );
}
