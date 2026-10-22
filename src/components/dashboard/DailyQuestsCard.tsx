import { useEffect, useRef, useState } from "react";
import { BookOpen, Bug, Check, ChevronRight, Gift, Lock, Mic, Snowflake, Sparkles, Target, Timer, Zap, type LucideIcon } from "lucide-react";
import type { WordDetail } from "@/types/database";
import {
  allQuestsDone,
  claimChest,
  ensureQuestState,
  loadQuestData,
  questProgress,
  questTitle,
  CHEST_XP_MAX,
  EMPTY_FACTS,
  QUESTS_EVENT,
  type ChestReward,
  type DailyQuestState,
  type Quest,
  type QuestFacts,
  type QuestId,
} from "@/services/dailyQuests";
import { getLocalDateString } from "@/services/streak";
import { triggerConfetti } from "@/utils/confetti";
import type { DashboardTab } from "./shared";

interface DailyQuestsCardProps {
  words: WordDetail[];
  /** New cards a session may still introduce today */
  newToday: number;
  /** Reviews due today (with newToday and the first-try answers given, what "Đúng ngay lần đầu" can ask for) */
  reviewsToday?: number;
  dailyGoal: number;
  hasStudied: boolean;
  freezesAvailable: number;
  /** Changes when the learner answers (today's count): progress is read again */
  refreshKey?: number;
  onStartReview: () => void;
  onStartFocus?: () => void;
  onStartReflex?: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  /** Fixed clock for previews */
  now?: Date;
}

const ICONS: Record<QuestId, LucideIcon> = {
  first_try: Target,
  new_words: Sparkles,
  focus: Timer,
  forgotten: Bug,
  grammar: BookOpen,
  pronunciation: Mic,
  reflex: Zap,
};

/** Events after which today's progress may have moved */
const REFRESH_EVENTS = [
  "myenglish-activity-updated",
  "myenglish-grammar-updated",
  "myenglish-pronunciation-updated",
  "myenglish-reflex-updated",
  "words-changed",
  QUESTS_EVENT,
];

/**
 * "Nhiệm vụ hôm nay": three quests with a progress bar each, then a chest opened by hand once all are done
 * (XP, sometimes a streak freeze). A quest's row takes the learner to where it is done.
 */
export default function DailyQuestsCard({
  words,
  newToday,
  reviewsToday,
  dailyGoal,
  hasStudied,
  freezesAvailable,
  refreshKey = 0,
  onStartReview,
  onStartFocus,
  onStartReflex,
  setActiveTab,
  now: fixedNow,
}: DailyQuestsCardProps) {
  const [state, setState] = useState<DailyQuestState | null>(null);
  const [facts, setFacts] = useState<QuestFacts>(EMPTY_FACTS);
  const [opening, setOpening] = useState(false);
  const [justOpened, setJustOpened] = useState<ChestReward | null>(null);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const ctxRef = useRef({ newToday, reviewsToday, dailyGoal, hasStudied });
  ctxRef.current = { newToday, reviewsToday, dailyGoal, hasStudied };

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      const at = fixedNow ?? new Date();
      const day = getLocalDateString(at);
      const ws = wordsRef.current;
      loadQuestData(ws, at)
        .then((data) => {
          if (!alive) return;
          const c = ctxRef.current;
          const s = ensureQuestState(day, {
            dailyGoal: c.dailyGoal,
            gradableToday: c.reviewsToday == null ? undefined : c.reviewsToday + c.newToday + data.facts.first_try,
            // At least half of the new-card budget goes to new words (the rest may be recall cards)
            newAllowed: Math.ceil(c.newToday / 2),
            hasStudied: c.hasStudied,
            forgottenCount: data.forgottenCount,
            grammarAvailable: data.grammarAvailable,
            pronunciationAvailable: data.pronunciationAvailable,
            reflexAvailable: true,
            lastDone: data.lastDone,
          });
          setFacts(data.facts);
          setState(s);
        })
        .catch(() => {});
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 300);
    };
    load();
    for (const e of REFRESH_EVENTS) window.addEventListener(e, schedule);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      for (const e of REFRESH_EVENTS) window.removeEventListener(e, schedule);
    };
  }, [refreshKey, fixedNow, words.length]);

  if (!state) return null;

  const doneCount = state.quests.filter((q) => questProgress(q, facts) >= q.target).length;
  const ready = !state.claimed && allQuestsDone(state.quests, facts);
  const reward = justOpened ?? state.reward ?? null;

  const go = (q: Quest) => {
    switch (q.id) {
      case "first_try":
      case "new_words":
        return onStartReview();
      case "focus":
        return onStartFocus ? onStartFocus() : onStartReview();
      case "reflex":
        return onStartReflex ? onStartReflex() : setActiveTab("leaderboard");
      default:
        return setActiveTab(q.id);
    }
  };

  const open = () => {
    if (opening) return;
    setOpening(true);
    setTimeout(() => {
      const r = claimChest(state.day, facts, freezesAvailable);
      setOpening(false);
      if (!r) return;
      setJustOpened(r);
      setState({ ...state, claimed: true, reward: r });
      triggerConfetti(2500);
    }, 700);
  };

  return (
    <section
      aria-label="Nhiệm vụ hôm nay"
      className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-zinc-900 p-4 space-y-2.5"
      data-testid="daily-quests"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Nhiệm vụ hôm nay</h3>
        <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
          {doneCount}/{state.quests.length} xong
        </span>
      </div>

      <ul className="space-y-0.5">
        {state.quests.map((q) => {
          const value = questProgress(q, facts);
          const done = value >= q.target;
          const Icon = ICONS[q.id];
          return (
            <li key={q.id}>
              <button
                onClick={() => go(q)}
                disabled={done}
                className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/60 disabled:hover:bg-transparent transition-colors group"
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    done ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${done ? "text-slate-500 dark:text-zinc-400 line-through" : "text-slate-800 dark:text-zinc-100 font-medium"}`}>
                      {questTitle(q)}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-zinc-400 shrink-0">
                      {value}/{q.target}
                    </span>
                  </span>
                  <span
                    className="mt-1 block h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={q.target}
                    aria-valuenow={value}
                  >
                    <span
                      className={`block h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.round((value / q.target) * 100)}%` }}
                    />
                  </span>
                </span>
                {!done && <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-zinc-200 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>

      {state.claimed && reward ? (
        <div
          className={`flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-3 py-2.5 ${
            justOpened ? "animate-in fade-in zoom-in-95 duration-300" : ""
          }`}
        >
          <span className="text-2xl" aria-hidden>
            🎉
          </span>
          <span className="text-sm text-emerald-800 dark:text-emerald-200">
            <b>Đã mở rương: +{reward.xp} XP</b>
            {reward.freeze && (
              <span className="inline-flex items-center gap-1 ml-1.5">
                · <Snowflake className="w-3.5 h-3.5" /> +1 ngày đóng băng chuỗi
              </span>
            )}
            <span className="block text-xs text-emerald-700/80 dark:text-emerald-300/70">Mai có 3 nhiệm vụ mới.</span>
          </span>
        </div>
      ) : ready ? (
        <button
          onClick={open}
          disabled={opening}
          className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold shadow-md shadow-amber-500/30 active:scale-[0.98] transition-all"
        >
          <Gift className={`w-5 h-5 ${opening ? "animate-shake" : "animate-bounce"}`} key={opening ? "o" : "r"} />
          {opening ? "Đang mở…" : "Mở rương phần thưởng"}
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-slate-500 dark:text-zinc-400">
          <Lock className="w-4 h-4 shrink-0" />
          Xong cả {state.quests.length} để mở rương: tới {CHEST_XP_MAX} XP, có khi kèm 1 ngày đóng băng chuỗi.
        </div>
      )}
    </section>
  );
}
