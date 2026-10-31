import { useEffect, useState } from "react";
import { CalendarCheck, Check, Target, Trophy } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { getReviewLogsSince, MIN_RETENTION_SAMPLE, startOfWeek, summarizeWeek, weekKey, type WeeklySummary } from "@/services/progress";
import {
  ALL_DONE_BONUS_XP,
  challengeDifficultyNote,
  challengeHowTo,
  challengeProgress,
  challengeTitle,
  claimWeeklyRewards,
  ensureWeeklyState,
  isDone,
  loadWeeklyData,
  TIER_LABEL,
  TIER_XP,
  type Tier,
  type WeekFacts,
  type WeeklyReward,
  type WeeklyState,
} from "@/services/weeklyChallenges";
import { getFSRSSettings } from "@/services/srs";
import { getDailyGoal } from "@/services/streak";
import { checkAndUnlockAchievements } from "@/services/achievements";

/** "Tuần này": answers, words, active days, real retention vs target, and the three weekly challenges */
/** `compact`: a narrow column (two numbers per row whatever the window width) */
export default function WeeklyProgressCard({ words, compact = false }: { words: WordDetail[]; compact?: boolean }) {
  const [week, setWeek] = useState<WeeklySummary | null>(null);
  const [challenges, setChallenges] = useState<{ state: WeeklyState; facts: WeekFacts; lastWeek: WeekFacts | null } | null>(null);
  const [justRewarded, setJustRewarded] = useState<WeeklyReward | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("myenglish-activity-updated", bump);
    return () => window.removeEventListener("myenglish-activity-updated", bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReviewLogsSince(startOfWeek())
      .then((logs) => {
        if (cancelled) return;
        const summary = summarizeWeek(logs, words, getFSRSSettings().requestRetention);
        setWeek(summary);
        // Badge for a week whose true retention reached the target over enough reviews
        if (summary.reviewAnswers >= 30 && summary.retention !== null && summary.retention >= summary.targetRetention) {
          checkAndUnlockAchievements({ weekOnTarget: true });
        }
      })
      .catch((err) => console.warn("Weekly progress failed:", err));
    // The week's three challenges: picked once a week, paid as soon as one is done
    loadWeeklyData(words)
      .then((data) => {
        if (cancelled) return;
        const wk = weekKey();
        ensureWeeklyState(wk, data.context);
        const reward = claimWeeklyRewards(wk, data.thisWeek);
        if (reward) setJustRewarded(reward);
        const state = ensureWeeklyState(wk, data.context);
        setChallenges({ state, facts: data.thisWeek, lastWeek: data.lastWeek });
      })
      .catch((err) => console.warn("Weekly challenges failed:", err));
    return () => {
      cancelled = true;
    };
  }, [words, version]);

  if (!week) return null;
  const retentionPct = week.retention === null ? null : Math.round(week.retention * 100);
  const targetPct = Math.round(week.targetRetention * 100);
  // A few answers say nothing yet: no colour, no advice until there are enough
  const enoughData = retentionPct !== null && week.reviewAnswers >= MIN_RETENTION_SAMPLE;
  const lowRetention = enoughData && (retentionPct as number) < targetPct - 5;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 md:p-5 space-y-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-cyan-500" />
        <span>Tuần này</span>
      </h3>

      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
        <Stat label="Lượt trả lời" value={String(week.answers)} />
        <Stat label="Từ đã ôn" value={String(week.wordsStudied)} />
        <Stat label="Ngày học" value={`${week.activeDays}/7`} />
        <Stat
          label={`Tỉ lệ nhớ (mục tiêu ${targetPct}%) · ${week.reviewAnswers} lượt${
            week.reviewAnswers < MIN_RETENTION_SAMPLE ? ", chưa đủ để đánh giá" : ""
          }`}
          value={retentionPct === null ? "–" : `${retentionPct}%`}
          tone={!enoughData ? undefined : lowRetention ? "warn" : "good"}
        />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
        Bạn đang nhớ chắc <span className="font-semibold text-slate-700 dark:text-zinc-200">{week.masteredWords}</span> từ
        (sẽ không quên trong ít nhất 3 tuần).
        {lowRetention && " Tỉ lệ nhớ đang thấp hơn mục tiêu: hãy ôn đúng hạn hoặc giảm số từ mới mỗi ngày."}
      </p>

      {challenges && (
        <WeeklyChallenges state={challenges.state} facts={challenges.facts} lastWeek={challenges.lastWeek} justRewarded={justRewarded} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/70 dark:border-zinc-800 px-3 py-2">
      <div className={`text-lg font-extrabold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">{label}</div>
    </div>
  );
}

const TIER_STYLE: Record<Tier, { badge: string; bar: string }> = {
  easy: { badge: "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  medium: { badge: "bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300", bar: "bg-sky-500" },
  hard: { badge: "bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300", bar: "bg-amber-500" },
};
const TIER_ORDER: Record<Tier, number> = { easy: 0, medium: 1, hard: 2 };

/** The week's three challenges, easy to hard: tier, name, progress, XP; the bonus for all three below */
function WeeklyChallenges({
  state,
  facts,
  lastWeek,
  justRewarded,
}: {
  state: WeeklyState;
  facts: WeekFacts;
  lastWeek: WeekFacts | null;
  justRewarded: WeeklyReward | null;
}) {
  const dailyGoal = getDailyGoal();
  const list = [...state.challenges].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  const doneCount = list.filter((c) => isDone(c, facts)).length;
  const total = list.reduce((sum, c) => sum + TIER_XP[c.tier], 0) + ALL_DONE_BONUS_XP;
  return (
    <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200">
          {doneCount === list.length ? <Trophy className="w-3.5 h-3.5 text-amber-500" /> : <Target className="w-3.5 h-3.5 text-indigo-500" />}
          Thử thách tuần
        </span>
        <span className="text-[11px] text-slate-500 dark:text-zinc-400">
          {doneCount}/{list.length} · tối đa {total} XP
        </span>
      </div>
      <ul className="space-y-2">
        {list.map((c) => {
          const done = isDone(c, facts);
          const progress = challengeProgress(c, facts);
          const style = TIER_STYLE[c.tier];
          return (
            <li key={c.kind} className="space-y-1">
              <div className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 mt-px px-1.5 py-0.5 rounded text-[10px] font-bold ${style.badge}`}>{TIER_LABEL[c.tier]}</span>
                {/* Hover or focus: what counts and where to do it, and why the target is this size */}
                <span className="group relative flex-1 min-w-0">
                  <span
                    tabIndex={0}
                    aria-describedby={`howto-${c.kind}`}
                    className={`leading-snug cursor-help underline decoration-dotted decoration-slate-300 dark:decoration-zinc-600 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-sm ${
                      done ? "text-slate-500 dark:text-zinc-400 line-through" : "text-slate-800 dark:text-zinc-200"
                    }`}
                  >
                    {challengeTitle(c)}
                  </span>
                  <span
                    id={`howto-${c.kind}`}
                    role="tooltip"
                    className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 top-full mt-1.5 z-30 w-72 max-w-[85vw] rounded-xl bg-slate-900 dark:bg-zinc-800 text-white p-3 shadow-xl space-y-1.5 text-[11px] leading-relaxed"
                  >
                    <span className="block font-semibold">{challengeTitle(c)}</span>
                    <span className="block text-slate-200">{challengeHowTo(c, { dailyGoal, lastWeek: lastWeek ? lastWeek[c.kind] : null })}</span>
                    <span className="block text-slate-400">
                      {challengeDifficultyNote(c, { dailyGoal, lastWeek: lastWeek ? lastWeek[c.kind] : null })}
                    </span>
                    <span className="block text-slate-400">
                      Đã làm {progress}/{c.target}
                      {done ? " · đã hoàn thành ✓" : ` · còn ${c.target - progress}`}. Tính từ thứ Hai đến hết Chủ nhật.
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                    {progress}/{c.target}
                  </span>
                  <span className={`block text-[10px] font-semibold ${done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {done ? <Check className="inline w-3 h-3 -mt-0.5" /> : "+"}
                    {TIER_XP[c.tier]} XP
                  </span>
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${style.bar}`} style={{ width: `${Math.round((progress / c.target) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
        {justRewarded
          ? `Vừa nhận +${justRewarded.xp} XP${justRewarded.bonus ? " (có thưởng hoàn thành cả 3)" : ""} 🎉`
          : state.bonusRewarded
            ? `Đã xong cả 3 và nhận thêm +${ALL_DONE_BONUS_XP} XP. Thử thách mới vào thứ Hai.`
            : `Xong cả 3 được thêm +${ALL_DONE_BONUS_XP} XP. Mục tiêu dựa trên kết quả tuần trước của bạn.`}
      </p>
    </div>
  );
}
