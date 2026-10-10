import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { beginnerMetrics, type BeginnerMetrics } from "@/services/habits";
import { getReviewLogsSince } from "@/services/progress";
import { getLearningEventsSince } from "@/services/learningEvents";
import { getActivityLogs } from "@/services/streak";
import { getPronunciationProgress, passedLessonCount } from "@/services/pronunciation";

/** "Is the foundation path working?" in four plain numbers, for beginners (shown first in Tiến độ) */
export default function BeginnerProgressCard() {
  const [m, setM] = useState<BeginnerMetrics | null>(null);
  const passed = passedLessonCount(getPronunciationProgress());

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    Promise.all([getReviewLogsSince(since), getLearningEventsSince(since, ["say_aloud", "pronunciation_quiz", "grammar_intro"])])
      .then(([logs, events]) => {
        const active = Object.entries(getActivityLogs())
          .filter(([, n]) => n > 0)
          .map(([d]) => d);
        setM(beginnerMetrics(logs, events, active));
      })
      .catch(() => setM(null));
  }, []);

  if (!m) return null;
  const recallPct = m.firstRecall.total >= 5 ? Math.round((m.firstRecall.remembered * 100) / m.firstRecall.total) : null;
  const tile = (value: string, label: string, note: string) => (
    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
      <div className="text-xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs font-medium text-slate-700 dark:text-zinc-300">{label}</div>
      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{note}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
        <Sprout className="w-4 h-4" /> Nền tảng của bạn
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tile(`${m.activeDays14}/14`, "ngày có học", "14 ngày gần nhất; đều đặn quan trọng hơn học nhiều")}
        {tile(
          recallPct === null ? "—" : `${recallPct}%`,
          "tự gõ ra từ lần đầu",
          recallPct === null ? "Cần thêm vài lần tự gõ từ để tính" : "Lần đầu phải tự nhớ ra một từ đã học"
        )}
        {tile(`${m.sayAloud.total}`, "lần đọc to theo", "Đọc thành tiếng giúp nhớ từ lâu hơn")}
        {tile(`${passed}/8`, "bài phát âm xong", `${m.pronunciationQuizzes} lần làm bài nghe`)}
      </div>
    </div>
  );
}
