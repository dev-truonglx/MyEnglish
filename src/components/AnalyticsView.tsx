import { useState, useEffect, useMemo, useRef } from "react";
import {
  Trophy,
  Brain,
  Bug,
  CheckCircle2,
  Calendar,
  Flame,
  BookOpen,
  PieChart as PieIcon,
  Activity,
  Lightbulb,
} from "lucide-react";
import type { WordDetail } from "@/types/database";
import {
  getWordStatsSummary,
  getLeechWords,
  getLeechSettings,
  saveLeechSettings,
  getXPState,
  getReviewAnalytics,
  type WordStatsSummary,
  type XPState,
  type ReviewAnalyticsData,
  type LeechSettings,
} from "@/services/smartReview";
import { getAchievements } from "@/services/achievements";
import { calculateStreakAndGoal } from "@/services/streak";
import { generateSmartMnemonic, getStoredMnemonic } from "@/services/aiMnemonic";
import Heatmap from "./Heatmap";
import ProficiencyAssessmentCard from "./ProficiencyAssessmentCard";

interface AnalyticsViewProps {
  words: WordDetail[];
  onStartReviewWord?: (word: WordDetail) => void;
  onRefreshWords?: () => void;
}

export default function AnalyticsView({
  words,
  onStartReviewWord,
  onRefreshWords,
}: AnalyticsViewProps) {
  const [xpState, setXpState] = useState<XPState>(getXPState);
  const [leechSettings, setLeechSettings] = useState<LeechSettings>(getLeechSettings);
  const [reviewAnalytics, setReviewAnalytics] = useState<ReviewAnalyticsData | null>(null);
  const [activeMnemonicWordId, setActiveMnemonicWordId] = useState<string | null>(null);
  const [mnemonicText, setMnemonicText] = useState<string | null>(null);

  useEffect(() => {
    const onXPUpdate = () => setXpState(getXPState());
    window.addEventListener("myenglish-xp-updated", onXPUpdate);
    return () => window.removeEventListener("myenglish-xp-updated", onXPUpdate);
  }, []);

  const stats: WordStatsSummary = useMemo(() => getWordStatsSummary(words), [words]);
  const leechWords = useMemo(() => getLeechWords(words, leechSettings), [words, leechSettings]);
  const streakStats = useMemo(() => calculateStreakAndGoal(words), [words]);

  // Compute Topic Mastery
  const topicMastery = useMemo(() => {
    const map: Record<string, { total: number; mastered: number; learning: number }> = {};
    for (const w of words) {
      const topic = w.topic || "General Tech";
      if (!map[topic]) map[topic] = { total: 0, mastered: 0, learning: 0 };
      map[topic].total++;
      if ((w.srs.stability || 0) >= 21) {
        map[topic].mastered++;
      } else if ((w.srs.state || 0) > 0) {
        map[topic].learning++;
      }
    }
    return Object.entries(map).map(([topic, data]) => ({
      topic,
      total: data.total,
      mastered: data.mastered,
      percent: Math.round((data.mastered / data.total) * 100),
    }));
  }, [words]);

  // Load Review Logs from SQLite
  useEffect(() => {
    getReviewAnalytics(14)
      .then((data) => setReviewAnalytics(data))
      .catch((err) => console.warn("Failed to load review analytics:", err));
  }, []);

  const achievements = useMemo(() => {
    return getAchievements({
      totalWords: words.length,
      currentStreak: streakStats.currentStreak,
      leechesSlain: 0,
      topicMasterCount: topicMastery.filter((t) => t.mastered >= 10).length,
    });
  }, [words.length, streakStats.currentStreak, topicMastery]);

  // Latest requested word id; slower generations for other words are discarded
  const activeMnemonicRef = useRef<string | null>(null);

  const handleShowMnemonic = async (w: WordDetail) => {
    activeMnemonicRef.current = w.id;
    setActiveMnemonicWordId(w.id);
    const existing = getStoredMnemonic(w.id, w.meaning_vn);
    if (existing) {
      setMnemonicText(existing);
    } else {
      setMnemonicText(null);
      const generated = await generateSmartMnemonic(w);
      if (activeMnemonicRef.current !== w.id) return;
      setMnemonicText(generated);
    }
  };

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-cyan-500" />
            <span>Trung Tâm Phân Tích & Tiến Trình</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Theo dõi năng lực CEFR, khả năng lưu giữ ký ức theo FSRS, xu hướng phản xạ và chế độ tự động bổ sung.
          </p>
        </div>

        {/* Level & Rank Pill */}
        <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">
            {xpState.rankEmoji}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Cấp {xpState.level} • {xpState.rank}
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {xpState.totalXP.toLocaleString()} XP ({xpState.todayXP} XP hôm nay)
            </p>
          </div>
        </div>
      </div>

      {/* CEFR User Proficiency Assessment & Auto-Replenish Center */}
      <ProficiencyAssessmentCard words={words} onRefreshWords={onRefreshWords} />

      {/* Top 4 Key Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Retention Health */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Khả năng ghi nhớ (FSRS)
            </span>
            <Brain className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {Math.round(stats.avgRetrievability * 100)}%
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">trung bình</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(stats.avgRetrievability * 100)}%` }}
            />
          </div>
        </div>

        {/* Mastered Words */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Đã khắc sâu (21d+)
            </span>
            <CheckCircle2 className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
              {stats.masteredCount}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              / {stats.totalWords} từ
            </span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            {stats.totalWords > 0
              ? `${Math.round((stats.masteredCount / stats.totalWords) * 100)}% tổng kho từ`
              : "Chưa có từ"}
          </p>
        </div>

        {/* Streak */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Chuỗi Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-500 font-mono">
              {streakStats.currentStreak}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">ngày liên tục</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            Kỷ lục cao nhất: {streakStats.longestStreak} ngày
          </p>
        </div>

        {/* Leech Words */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Từ khó (Leech)
            </span>
            <Bug className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-500 font-mono">{stats.leechCount}</span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">từ hay quên</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            {stats.leechCount > 0 ? "Cần ưu tiên khắc phục" : "Tuyệt vời, không có từ đỉa!"}
          </p>
        </div>
      </div>

      {/* Heatmap Widget */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-500" />
          <span>Lịch Sử Học Tập Hàng Ngày</span>
        </h3>
        <Heatmap words={words} />
      </div>

      {/* Accuracy & Review Logs Summary (if logs exist) */}
      {reviewAnalytics && reviewAnalytics.totalReviews > 0 && (
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span>Hiệu Suất Ôn Tập 14 Ngày Qua (Review Logs)</span>
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              Độ chính xác: {reviewAnalytics.accuracyRate}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">Tổng lượt ôn tập</span>
              <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {reviewAnalytics.totalReviews}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">Trả lời đúng</span>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {reviewAnalytics.correctReviews} ({reviewAnalytics.accuracyRate}%)
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">Tốc độ phản xạ trung bình</span>
              <p className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
                {(reviewAnalytics.averageResponseTimeMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FSRS Word State Distribution & Retention Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Word State Distribution */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-purple-500" />
            <span>Phân Bổ Trạng Thái Ký Ức (FSRS States)</span>
          </h3>

          <div className="space-y-3">
            {/* New Words */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                  Mới thêm (New)
                </span>
                <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
                  {stats.newCount} ({stats.totalWords ? Math.round((stats.newCount / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-slate-400 rounded-full"
                  style={{ width: `${stats.totalWords ? (stats.newCount / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Learning Words */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Đang học (Learning)
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {stats.learningCount} ({stats.totalWords ? Math.round((stats.learningCount / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${stats.totalWords ? (stats.learningCount / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* In Review */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  Ôn định kỳ (Review)
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {stats.reviewCount - stats.masteredCount} ({stats.totalWords ? Math.round(((stats.reviewCount - stats.masteredCount) / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${stats.totalWords ? ((stats.reviewCount - stats.masteredCount) / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Mastered */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Khắc sâu (Mastered 21d+)
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.masteredCount} ({stats.totalWords ? Math.round((stats.masteredCount / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${stats.totalWords ? (stats.masteredCount / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-100 dark:border-zinc-800">
            FSRS tính toán thời điểm lặp lại tối ưu theo Độ ổn định (Stability) và Độ khó (Difficulty) riêng biệt của từng từ.
          </p>
        </div>

        {/* Topic Mastery Grid */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-500" />
            <span>Mức Độ Làm Chủ Theo Chủ Đề</span>
          </h3>

          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            {topicMastery.length === 0 ? (
              <p className="text-xs text-slate-400">Chưa có chủ đề nào.</p>
            ) : (
              topicMastery.map((item) => (
                <div key={item.topic} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-zinc-300 font-medium truncate max-w-[200px]">
                      {item.topic}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-zinc-400">
                      {item.mastered}/{item.total} ({item.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Leech Center Section */}
      <div className="p-6 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-500">
              <Bug className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Trung Tâm Khắc Phục Từ Khó (Leech Words)
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Những từ bị quên từ {leechSettings.threshold} lần trở lên, cần mẹo ghi nhớ hoặc chuyển đổi phương pháp học.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">Ngưỡng:</span>
            <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800">
              {[2, 3, 4, 5].map((thresh) => (
                <button
                  key={thresh}
                  onClick={() => {
                    saveLeechSettings({ threshold: thresh });
                    setLeechSettings(getLeechSettings());
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                    leechSettings.threshold === thresh
                      ? "bg-rose-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
                  title={`Coi từ là Leech khi quên từ ${thresh} lần trở lên`}
                >
                  {thresh} lần
                </button>
              ))}
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
              {leechWords.length} từ
            </span>
          </div>
        </div>

        {leechWords.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 dark:text-zinc-500">
            🎉 Bạn không có từ khó nào bị tắc nghẽn. Trí nhớ của bạn đang hoạt động rất tốt!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {leechWords.map((w) => {
              const isShowingMnemonic = activeMnemonicWordId === w.id;

              return (
                <div
                  key={w.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                          {w.word}
                        </span>
                        {w.phonetic && (
                          <span className="text-xs font-mono text-slate-400 dark:text-zinc-500">
                            {w.phonetic}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                        {w.meaning_vn}
                      </p>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                      Quên {w.srs.lapses} lần
                    </span>
                  </div>

                  {/* AI Mnemonic Expansion */}
                  {isShowingMnemonic && mnemonicText && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in">
                      {mnemonicText}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      onClick={() => handleShowMnemonic(w)}
                      className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>{isShowingMnemonic ? "Mẹo ghi nhớ" : "Xem mẹo AI"}</span>
                    </button>

                    {onStartReviewWord && (
                      <button
                        onClick={() => onStartReviewWord(w)}
                        className="px-2.5 py-1 rounded-lg font-medium text-xs bg-slate-100 dark:bg-zinc-800 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 hover:text-cyan-600 text-slate-700 dark:text-zinc-300 transition-colors"
                      >
                        Luyện gõ ngay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Achievements Gallery Showcase */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Bảng Danh Hiệu & Thành Tựu
            </h3>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500 dark:text-zinc-400">
            Đã mở {unlockedCount}/{achievements.length} danh hiệu
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {achievements.map((badge) => (
            <div
              key={badge.id}
              className={`p-3.5 rounded-2xl border transition-all ${
                badge.isUnlocked
                  ? "border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-transparent dark:bg-zinc-900/80 shadow-sm"
                  : "border-slate-200 dark:border-zinc-800/60 bg-slate-50/50 dark:bg-zinc-900/30 opacity-70"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                    badge.isUnlocked
                      ? "bg-amber-500/20 border border-amber-500/30 shadow-sm"
                      : "bg-slate-200 dark:bg-zinc-800 grayscale"
                  }`}
                >
                  {badge.emoji}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {badge.title}
                    </h4>
                    {badge.isUnlocked && (
                      <span className="text-[10px] text-amber-500 font-bold">✓</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                    {badge.description}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      +{badge.xpBonus} XP
                    </span>
                    {!badge.isUnlocked && (
                      <span className="text-slate-400 dark:text-zinc-500 font-mono">
                        {badge.currentValue}/{badge.targetValue}
                      </span>
                    )}
                  </div>

                  {!badge.isUnlocked && (
                    <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-zinc-800 mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${badge.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
