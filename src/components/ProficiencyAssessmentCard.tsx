import { setFoundationMode } from "@/services/learnerProfile";
import { useState, useMemo } from "react";
import {
  GraduationCap,
  Sparkles,
  Zap,
  TrendingUp,
  CheckCircle2,
  Lock,
  Brain,
  Loader2,
  Sliders,
  Clock,
  Flame,
} from "lucide-react";
import type { WordDetail } from "@/types/database";
import type { GrammarLevel } from "@/types/grammar";
import PlacementTest from "./PlacementTest";
import {
  assessUserProficiency,
  setUserOverrideLevel,
  syncProficiencyWithReminderSettings,
  CEFR_LEVEL_METADATA,
  type UserProficiencyProfile,
} from "@/services/userProficiency";
import {
  getAutoReplenishSettings,
  saveAutoReplenishSettings,
  triggerAutoReplenish,
  type AutoReplenishSettings,
} from "@/services/autoReplenish";
import { AI_VOCAB_ENABLED } from "@/services/features";

interface ProficiencyAssessmentCardProps {
  words: WordDetail[];
  onRefreshWords?: () => void;
}

const ALL_LEVELS: GrammarLevel[] = ["A1", "A2", "B1", "B2", "C1"];

export default function ProficiencyAssessmentCard({
  words,
  onRefreshWords,
}: ProficiencyAssessmentCardProps) {
  const [assessmentTrigger, setAssessmentTrigger] = useState(0);
  const [isManualGenerating, setIsManualGenerating] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [autoReplenishSettings, setAutoReplenishSettings] = useState<AutoReplenishSettings>(getAutoReplenishSettings);
  const [showOverrideMenu, setShowOverrideMenu] = useState(false);
  const [showPlacement, setShowPlacement] = useState(false);

  const profile: UserProficiencyProfile = useMemo(() => {
    return assessUserProficiency(words);
  }, [words, assessmentTrigger]);

  const levelMeta = CEFR_LEVEL_METADATA[profile.effectiveLevel];

  const handleSetOverride = (lvl: GrammarLevel | null) => {
    setUserOverrideLevel(lvl);
    if (lvl) {
      syncProficiencyWithReminderSettings(lvl);
      setActionNotice({
        type: "info",
        text: `Đã thiết lập cố định trình độ của bạn là [${lvl}]. Các bài tập và câu ví dụ sẽ tự động đồng bộ.`,
      });
    } else {
      syncProficiencyWithReminderSettings(profile.assessedLevel);
      setActionNotice({
        type: "info",
        text: `Đã chuyển về chế độ tự động đánh giá linh hoạt theo AI (Hiện tại: [${profile.assessedLevel}]).`,
      });
    }
    setShowOverrideMenu(false);
    setAssessmentTrigger((v) => v + 1);
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleToggleAutoReplenish = () => {
    const updated = saveAutoReplenishSettings({
      enabled: !autoReplenishSettings.enabled,
    });
    setAutoReplenishSettings(updated);
    setActionNotice({
      type: "info",
      text: updated.enabled
        ? "Đã bật chế độ tự động bổ sung từ vựng & bài tập khi cạn từ mới."
        : "Đã tắt chế độ tự động bổ sung từ vựng.",
    });
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleTriggerManualReplenish = async () => {
    if (isManualGenerating) return;
    setIsManualGenerating(true);
    setActionNotice({
      type: "info",
      text: `🤖 Gemini đang chọn lọc 3 từ vựng & bài tập ngữ pháp chuẩn cấp độ ${profile.effectiveLevel}...`,
    });

    try {
      const res = await triggerAutoReplenish(words, true);
      if (res.success) {
        setActionNotice({
          type: "success",
          text: res.message,
        });
        setAutoReplenishSettings(getAutoReplenishSettings());
        setAssessmentTrigger((v) => v + 1);
        onRefreshWords?.();
      } else {
        setActionNotice({
          type: "error",
          text: res.message,
        });
      }
    } catch (err) {
      setActionNotice({
        type: "error",
        text: "Không thể kết nối với Gemini CLI. Vui lòng kiểm tra CLI binary.",
      });
    } finally {
      setIsManualGenerating(false);
      setTimeout(() => setActionNotice(null), 6000);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-8 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div
        className={`absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none bg-gradient-to-br ${levelMeta.colorClass}`}
      />

      {/* TOP HEADER: Assessed Level & Overall Score */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 border-b border-slate-100 dark:border-zinc-800/80 pb-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg bg-gradient-to-br ${levelMeta.colorClass} flex-shrink-0 tracking-wider`}
          >
            {profile.effectiveLevel}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {levelMeta.label}
              </h3>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${levelMeta.badgeClass}`}
              >
                {levelMeta.titleVn}
              </span>
              {profile.userOverrideLevel && (
                <span className="text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sliders className="w-3 h-3" /> Cố định thủ công
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Đánh giá dựa trên phân tích đa chiều: Điểm ngữ pháp thực tế, độ bền trí nhớ FSRS và tần suất luyện tập.
            </p>
          </div>
        </div>

        {/* Right Controls: CEFR Score & Override Action */}
        <div className="flex items-center gap-4 flex-wrap lg:justify-end">
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {profile.overallScore} <span className="text-xs font-semibold text-slate-400">/ 100 Điểm</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
              {profile.nextLevel ? (
                <span>
                  Tiến độ lên <strong className="text-cyan-500">{profile.nextLevel}</strong>: {profile.progressToNextLevel}%
                </span>
              ) : (
                <span className="text-purple-500 font-bold">Cấp độ cao nhất đạt được!</span>
              )}
            </div>
          </div>

          {showPlacement && (
            <PlacementTest
              onClose={() => setShowPlacement(false)}
              onDone={(choice) => {
                setShowPlacement(false);
                // A0 (mất gốc) is studied as A1 with foundation mode on
                setFoundationMode(choice === "A0");
                handleSetOverride(choice === "A0" ? "A1" : choice);
              }}
            />
          )}
          <button
            onClick={() => setShowPlacement(true)}
            title="Từ vựng, ngữ pháp và nghe; khoảng 6–12 câu, 2–4 phút"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 transition-colors"
          >
            Kiểm tra trình độ
          </button>
          <div className="relative">
            <button
              onClick={() => setShowOverrideMenu(!showOverrideMenu)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>{profile.userOverrideLevel ? `Đổi Level (${profile.userOverrideLevel})` : "Tùy chọn Level"}</span>
            </button>

            {showOverrideMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-xl p-2 z-30 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                  Chế độ xếp trình độ
                </div>
                <button
                  onClick={() => handleSetOverride(null)}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center justify-between transition-colors ${
                    !profile.userOverrideLevel
                      ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold"
                      : "text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700/60"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Tự động (AI đánh giá)
                  </span>
                  {!profile.userOverrideLevel && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
                <div className="border-t border-slate-100 dark:border-zinc-700/80 my-1" />
                {ALL_LEVELS.map((lvl) => {
                  const isCurrent = profile.userOverrideLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      onClick={() => handleSetOverride(lvl)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-xl flex items-center justify-between transition-colors ${
                        isCurrent
                          ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold"
                          : "text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700/60"
                      }`}
                    >
                      <span>{CEFR_LEVEL_METADATA[lvl].label}</span>
                      {isCurrent && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* THREE PILLAR METRICS BREAKDOWN */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1: Grammar Mastery */}
        <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-emerald-500" /> Ngữ Pháp Tích Lũy
            </span>
            <span className="text-slate-900 dark:text-white font-black">{profile.grammarScore}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${profile.grammarScore}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Dựa trên điểm chẩn đoán & mức độ làm chủ các chủ đề ngữ pháp từ A1 đến C1.
          </p>
        </div>

        {/* Pillar 2: Vocabulary & FSRS Retention */}
        <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-cyan-500" /> Vốn Từ & Độ Bền FSRS
            </span>
            <span className="text-slate-900 dark:text-white font-black">{profile.vocabularyScore}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${profile.vocabularyScore}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Đã thuộc {profile.levelVocab[profile.effectiveLevel].known}/{profile.levelVocab[profile.effectiveLevel].target} từ cấp độ{" "}
            {profile.effectiveLevel} • {profile.vocabularyStats.masteredWords}/{profile.vocabularyStats.totalWords} từ bền vững (Độ nhớ TB:{" "}
            {profile.vocabularyStats.avgRetrievability}%).
          </p>
        </div>

        {/* Pillar 3: Learning Consistency */}
        <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" /> Tính Kỷ Luật & Phản Xạ
            </span>
            <span className="text-slate-900 dark:text-white font-black">{profile.habitScore}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${profile.habitScore}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Chuỗi {profile.learningStats.streak} ngày liên tiếp • Cấp độ XP {profile.learningStats.xpLevel} ({profile.learningStats.rank}).
            Không tính vào cấp độ CEFR.
          </p>
        </div>
      </div>

      {/* CEFR PROGRESSION BARS (A1 -> C1) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-500" />
            <span>Tiến Trình Cụ Thể Từng Cấp Bậc CEFR</span>
          </h4>
          <span className="text-[11px] text-slate-400">Hoàn thành một cấp độ = nắm ngữ pháp + thuộc đủ từ của cấp độ đó</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ALL_LEVELS.map((lvl) => {
            const data = profile.levelBreakdown[lvl];
            const isMastered = data.status === "mastered";
            const isLearning = data.status === "learning";
            const isCurrent = profile.effectiveLevel === lvl;

            return (
              <div
                key={lvl}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isCurrent
                    ? "border-cyan-500 bg-cyan-50/30 dark:bg-cyan-950/20 shadow-sm"
                    : isMastered
                    ? "border-emerald-300/80 dark:border-emerald-800/50 bg-emerald-50/20 dark:bg-emerald-950/10"
                    : "border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30 opacity-80"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1">
                    {lvl}
                    {isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    )}
                  </span>
                  {isMastered ? (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Đạt
                    </span>
                  ) : isLearning ? (
                    <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">Đang rèn</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 flex items-center gap-0.5">
                      <Lock className="w-3 h-3" /> Khóa
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 mb-2">
                  {data.description}
                </div>

                <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full ${
                      isMastered ? "bg-emerald-500" : isLearning ? "bg-cyan-500" : "bg-slate-400"
                    }`}
                    style={{ width: `${data.averageMastery}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500">
                  <span>Pass: {data.passedLessons}/{data.totalLessons}</span>
                  <span>{data.averageMastery}%</span>
                </div>
                <div
                  className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500"
                  title="Số từ của cấp độ này bạn đã thuộc / số từ cần để hoàn thành cấp độ"
                >
                  Từ vựng: {profile.levelVocab[lvl].known}/{profile.levelVocab[lvl].target}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ACTION NOTICE TOAST */}
      {actionNotice && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 transition-all animate-in fade-in slide-in-from-top-2 ${
            actionNotice.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800"
              : actionNotice.type === "error"
              ? "bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300 dark:border-rose-800"
              : "bg-cyan-50 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-200 border border-cyan-300 dark:border-cyan-800"
          }`}
        >
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{actionNotice.text}</span>
        </div>
      )}

      {/* SMART AUTO-REPLENISH ENGINE SECTION (AI vocabulary; off while the Oxford deck is the only source) */}
      {AI_VOCAB_ENABLED && <div className="bg-gradient-to-r from-slate-50 to-cyan-50/40 dark:from-zinc-800/40 dark:to-cyan-950/20 rounded-2xl p-5 border border-slate-200/80 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  Chế Độ Tự Động Bổ Sung Từ Vựng & Bài Tập (Smart Auto-Replenish)
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300">
                  AI Adaptive
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Khi bạn luyện tập đều đặn mà không tự thêm từ mới trong 2 ngày, hệ thống sẽ tự động phân tích và sinh 3 từ vựng & bài tập ngữ pháp chuẩn cấp độ <strong>{profile.effectiveLevel}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Toggle Switch */}
            <button
              onClick={handleToggleAutoReplenish}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                autoReplenishSettings.enabled ? "bg-cyan-500" : "bg-slate-300 dark:bg-zinc-700"
              }`}
              title="Bật/Tắt tự động sinh bài học mới"
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  autoReplenishSettings.enabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>

            {/* Manual Trigger Button */}
            <button
              onClick={handleTriggerManualReplenish}
              disabled={isManualGenerating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-md shadow-cyan-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isManualGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang sinh...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Bổ sung ngay (Cấp độ {profile.effectiveLevel})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status / History banner */}
        {autoReplenishSettings.lastReplenishSummary && (
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 bg-white/80 dark:bg-zinc-900/60 rounded-xl p-3 border border-slate-100 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-500" />
              Lần bổ sung gần nhất: <strong>{autoReplenishSettings.lastReplenishSummary.date}</strong> (Cấp độ {autoReplenishSettings.lastReplenishSummary.level})
            </span>
            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
              + {autoReplenishSettings.lastReplenishSummary.words.join(", ")}
              {autoReplenishSettings.lastReplenishSummary.questionCount
                ? ` & ${autoReplenishSettings.lastReplenishSummary.questionCount} bài tập`
                : ""}
            </span>
          </div>
        )}
      </div>}

      {/* RECOMMENDATIONS & AI ADVICE */}
      {profile.recommendations.length > 0 && (
        <div className="bg-slate-50/60 dark:bg-zinc-800/30 rounded-2xl p-4 border border-slate-100 dark:border-zinc-800 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            <span>Định Hướng Học Tập Từ AI Theo Cấp Độ {profile.effectiveLevel}</span>
          </div>
          <ul className="space-y-1.5">
            {profile.recommendations.map((rec, i) => (
              <li
                key={i}
                className="text-xs text-slate-600 dark:text-zinc-400 flex items-start gap-2"
              >
                <span className="text-cyan-500 font-bold leading-relaxed">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
