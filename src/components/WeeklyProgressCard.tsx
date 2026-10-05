import { useEffect, useState } from "react";
import { CalendarCheck, Target, Trophy } from "lucide-react";
import type { WordDetail } from "@/types/database";
import {
  CHALLENGE_XP,
  claimTopicChallengeReward,
  getReviewLogsSince,
  getTopicChallenge,
  startOfWeek,
  summarizeWeek,
  type TopicChallenge,
  type WeeklySummary,
} from "@/services/progress";
import { getFSRSSettings } from "@/services/srs";

/** "Tuần này": answers, words, active days, real retention vs target, and the weekly topic challenge */
export default function WeeklyProgressCard({ words }: { words: WordDetail[] }) {
  const [week, setWeek] = useState<WeeklySummary | null>(null);
  const [challenge, setChallenge] = useState<TopicChallenge | null>(null);
  const [justRewarded, setJustRewarded] = useState(false);
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
        setWeek(summarizeWeek(logs, words, getFSRSSettings().requestRetention));
        const c = getTopicChallenge(words, logs);
        if (c && claimTopicChallengeReward(c)) {
          setJustRewarded(true);
          setChallenge({ ...c, rewarded: true });
        } else {
          setChallenge(c);
        }
      })
      .catch((err) => console.warn("Weekly progress failed:", err));
    return () => {
      cancelled = true;
    };
  }, [words, version]);

  if (!week) return null;
  const retentionPct = week.retention === null ? null : Math.round(week.retention * 100);
  const targetPct = Math.round(week.targetRetention * 100);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-cyan-500" />
        <span>Tuần này</span>
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Lượt trả lời" value={String(week.answers)} />
        <Stat label="Từ đã ôn" value={String(week.wordsStudied)} />
        <Stat label="Ngày học" value={`${week.activeDays}/7`} />
        <Stat
          label={`Tỉ lệ nhớ (mục tiêu ${targetPct}%)`}
          value={retentionPct === null ? "–" : `${retentionPct}%`}
          tone={retentionPct === null ? undefined : retentionPct >= targetPct - 5 ? "good" : "warn"}
        />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
        Bạn đang nhớ chắc <span className="font-semibold text-slate-700 dark:text-zinc-200">{week.masteredWords}</span> từ
        (sẽ không quên trong ít nhất 3 tuần).
        {retentionPct !== null && retentionPct < targetPct - 5 && " Tỉ lệ nhớ đang thấp hơn mục tiêu: hãy ôn đúng hạn hoặc giảm số từ mới mỗi ngày."}
      </p>

      {challenge && (
        <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200 min-w-0">
              {challenge.completed ? (
                <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              )}
              <span className="truncate">
                Thử thách tuần: trả lời đúng {challenge.target} câu chủ đề {challenge.topic}
              </span>
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 shrink-0">
              {challenge.progress}/{challenge.target}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${challenge.completed ? "bg-amber-500" : "bg-indigo-500"}`}
              style={{ width: `${Math.round((challenge.progress / challenge.target) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {challenge.completed
              ? justRewarded
                ? `Hoàn thành! +${CHALLENGE_XP} XP 🎉`
                : `Đã hoàn thành, nhận +${CHALLENGE_XP} XP. Thử thách mới vào thứ Hai.`
              : `Hoàn thành để nhận +${CHALLENGE_XP} XP.`}
          </p>
        </div>
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
