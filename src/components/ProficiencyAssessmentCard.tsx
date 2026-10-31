import { setFoundationMode } from "@/services/learnerProfile";
import { useEffect, useState, useMemo } from "react";
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
  ChevronDown,
  X,
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
import { CATALOG_LEVEL_COUNTS } from "@/services/vocabCatalog";
import { levelDetail, type LevelWord } from "@/services/levelDetail";
import { C1_TENSE_NOTE, LEVEL_TENSES, matchTenseLessons } from "@/services/levelTenses";
import { getAllBookChapters } from "@/services/grammarBook";
import { getDueGrammarLessons } from "@/services/grammarService";
import { lessonStatus } from "@/services/grammarSession";
import { LessonStatusChip } from "./grammar/PathPicker";
import type { GrammarBookLesson } from "@/types/grammarBook";

interface ProficiencyAssessmentCardProps {
  words: WordDetail[];
  onRefreshWords?: () => void;
  /** Open a lesson of the grammar book (the tenses of a level) */
  onOpenGrammarLesson?: (lessonId: string) => void;
}

const ALL_LEVELS: GrammarLevel[] = ["A1", "A2", "B1", "B2", "C1"];

export default function ProficiencyAssessmentCard({
  words,
  onRefreshWords,
  onOpenGrammarLesson,
}: ProficiencyAssessmentCardProps) {
  const [assessmentTrigger, setAssessmentTrigger] = useState(0);
  const [isManualGenerating, setIsManualGenerating] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [autoReplenishSettings, setAutoReplenishSettings] = useState<AutoReplenishSettings>(getAutoReplenishSettings);
  const [showOverrideMenu, setShowOverrideMenu] = useState(false);
  const [showPlacement, setShowPlacement] = useState(false);
  // The level whose detail is open under the cards (null: none)
  const [openLevel, setOpenLevel] = useState<GrammarLevel | null>(null);

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
        text: `Đã chuyển về chế độ tự động xếp trình độ theo số từ bạn đã thuộc (hiện tại: [${profile.assessedLevel}]).`,
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
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm space-y-6 md:space-y-8 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div
        className={`absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none bg-gradient-to-br ${levelMeta.colorClass}`}
      />

      {/* TOP HEADER: Assessed Level & Overall Score */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 border-b border-slate-100 dark:border-zinc-800/80 pb-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl md:text-2xl shadow-lg bg-gradient-to-br ${levelMeta.colorClass} flex-shrink-0 tracking-wider`}
          >
            {profile.effectiveLevel}
          </div>
          <div className="space-y-1 max-md:min-w-0">
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
              Cấp độ tính theo số từ bạn đã thuộc ở từng cấp. Ngữ pháp và thói quen học hiển thị riêng bên dưới.
            </p>
          </div>
        </div>

        {/* Right Controls: CEFR Score & Override Action */}
        <div className="flex items-center gap-3 md:gap-4 flex-wrap lg:justify-end">
          <div className="text-left sm:text-right w-full sm:w-auto">
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 md:py-2 max-md:min-h-[40px] text-xs font-bold rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 transition-colors"
          >
            Kiểm tra trình độ
          </button>
          <div className="relative">
            <button
              onClick={() => setShowOverrideMenu(!showOverrideMenu)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 md:py-2 max-md:min-h-[40px] text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors"
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
                    <Sparkles className="w-3.5 h-3.5" /> Tự động (theo tiến độ)
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
            Tỉ lệ bài ngữ pháp trong lộ trình của bạn đã nắm vững. Không tính vào cấp độ CEFR.
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
          <span className="text-[11px] text-slate-400">Bấm vào một cấp để xem chi tiết · Hoàn thành = thuộc 80% số từ của cấp</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ALL_LEVELS.map((lvl) => {
            const data = profile.levelBreakdown[lvl];
            const isMastered = data.status === "mastered";
            const isLearning = data.status === "learning";
            const isCurrent = profile.effectiveLevel === lvl;

            const isOpen = openLevel === lvl;

            return (
              <button
                type="button"
                key={lvl}
                onClick={() => setOpenLevel(isOpen ? null : lvl)}
                aria-expanded={isOpen}
                aria-controls="cefr-level-detail"
                title={isOpen ? "Bấm để đóng chi tiết" : `Xem chi tiết cấp ${lvl}`}
                className={`text-left p-3.5 rounded-2xl border transition-all hover:shadow-md ${
                  isOpen ? "ring-2 ring-cyan-500/70 " : ""
                }${
                  isCurrent
                    ? "border-cyan-500 bg-cyan-50/30 dark:bg-cyan-950/20 shadow-sm"
                    : isMastered
                    ? "border-emerald-300/80 dark:border-emerald-800/50 bg-emerald-50/20 dark:bg-emerald-950/10"
                    : "border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30 opacity-80 hover:opacity-100"
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
                      <CheckCircle2 className="w-3 h-3" /> Đã qua
                    </span>
                  ) : isLearning ? (
                    <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">Đang rèn</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 flex items-center gap-0.5">
                      <Lock className="w-3 h-3" /> Khóa
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 mb-1">
                  {data.description}
                </div>
                <div
                  className="text-[10px] text-slate-500 dark:text-zinc-400 line-clamp-2 min-h-[26px] mb-2"
                  title={LEVEL_TENSES[lvl].map((x) => x.name).join(", ") || C1_TENSE_NOTE}
                >
                  <span className="font-semibold text-slate-600 dark:text-zinc-300">Thì: </span>
                  {LEVEL_TENSES[lvl].length > 0 ? LEVEL_TENSES[lvl].map((x) => x.name).join(", ") : "dùng linh hoạt cả 13 thì"}
                </div>

                <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full ${
                      isMastered ? "bg-emerald-500" : isLearning ? "bg-cyan-500" : "bg-slate-400"
                    }`}
                    style={{ width: `${isMastered ? 100 : data.vocabPercent}%` }}
                  />
                </div>

                <div
                  className="flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500"
                  title="Số từ của cấp độ này bạn đã thuộc / số từ cần để hoàn thành cấp độ"
                >
                  <span>
                    Từ vựng: {profile.levelVocab[lvl].known}/{profile.levelVocab[lvl].target}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    {data.vocabPercent}%
                    <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180 text-cyan-500" : ""}`} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {openLevel && (
          <LevelDetailPanel
            words={words}
            level={openLevel}
            description={profile.levelBreakdown[openLevel].description}
            countedKnown={profile.levelVocab[openLevel].known}
            target={profile.levelVocab[openLevel].target}
            isCurrent={profile.effectiveLevel === openLevel}
            onClose={() => setOpenLevel(null)}
            onOpenGrammarLesson={onOpenGrammarLesson}
          />
        )}
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
            <span>Gợi ý học tiếp ở cấp độ {profile.effectiveLevel}</span>
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

/** Everything about one level under the cards: where its words stand, what is missing, which words to watch */
function LevelDetailPanel({
  words,
  level,
  description,
  countedKnown,
  target,
  isCurrent,
  onClose,
  onOpenGrammarLesson,
}: {
  words: WordDetail[];
  level: GrammarLevel;
  description: string;
  /** Known words the level card counts (tagged ones, plus untagged ones filling the gap) */
  countedKnown: number;
  target: number;
  isCurrent: boolean;
  onClose: () => void;
  onOpenGrammarLesson?: (lessonId: string) => void;
}) {
  const d = useMemo(() => levelDetail(words, level), [words, level]);
  const deck = CATALOG_LEVEL_COUNTS[level];
  const filled = Math.max(0, countedKnown - d.known);
  const missing = Math.max(0, target - countedKnown);
  const pct = (n: number) => `${deck > 0 ? Math.min(100, (n * 100) / deck) : 0}%`;
  const notMet = Math.max(0, deck - d.met);

  const stats: Array<{ label: string; value: number; hint: string; tone: string }> = [
    { label: "Đã thuộc", value: countedKnown, hint: "Nhận ra nghĩa và nhớ chắc ít nhất 7 ngày", tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Nhớ lâu", value: d.longTerm, hint: "Nhớ chắc ít nhất 21 ngày", tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Đang học", value: d.learning, hint: "Đã gặp nhưng chưa nhớ chắc 7 ngày", tone: "text-cyan-600 dark:text-cyan-400" },
    { label: "Đến hạn ôn", value: d.due, hint: "Phiên ôn tập sẽ hỏi lại ngay", tone: "text-amber-600 dark:text-amber-400" },
    { label: "Đánh dấu đã biết", value: d.markedKnown, hint: "Chờ một lần kiểm tra lại, chưa tính là thuộc", tone: "text-slate-700 dark:text-zinc-200" },
    { label: "Chưa gặp", value: notMet, hint: `Từ ${level} trong bộ Oxford chưa học tới`, tone: "text-slate-500 dark:text-zinc-400" },
  ];

  return (
    <div
      id="cefr-level-detail"
      className="rounded-2xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/30 dark:bg-cyan-950/10 p-4 md:p-5 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h5 className="text-sm font-bold text-slate-900 dark:text-white">
            {CEFR_LEVEL_METADATA[level].label} · {CEFR_LEVEL_METADATA[level].titleVn}
            {isCurrent && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">Cấp hiện tại</span>}
          </h5>
          <p className="text-xs text-slate-600 dark:text-zinc-400">{description}</p>
        </div>
        <button onClick={onClose} aria-label="Đóng chi tiết" className="p-2 md:p-1 max-md:min-h-[40px] rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* The level's deck words: known, still learning, not met; the line marks the 80% to complete it */}
      <div className="space-y-1.5">
        <div className="relative h-3 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: pct(countedKnown) }} />
          <div className="h-full bg-cyan-400 dark:bg-cyan-600" style={{ width: pct(d.learning) }} />
          <div className="absolute inset-y-0 w-0.5 bg-slate-900/70 dark:bg-white/80" style={{ left: pct(target) }} title={`Mốc hoàn thành: ${target} từ`} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
          <span className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Đã thuộc</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400 dark:bg-cyan-600" /> Đang học</span>
            <span className="inline-flex items-center gap-1"><span className="w-0.5 h-3 bg-slate-900/70 dark:bg-white/80" /> Mốc hoàn thành ({target} từ)</span>
          </span>
          <span className="font-mono">{deck.toLocaleString("vi-VN")} từ {level} trong bộ Oxford</span>
        </div>
        <p className={`text-xs font-semibold ${missing === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-zinc-200"}`}>
          {missing === 0
            ? `Đã hoàn thành cấp ${level} ✓`
            : `Cần thuộc thêm ${missing.toLocaleString("vi-VN")} từ để hoàn thành ${level} (${countedKnown}/${target}).`}
        </p>
        {filled > 0 && (
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Gồm {filled} từ chưa có cấp CEFR (thêm từ trước khi gắn cấp) được tính bù vào cấp thấp nhất còn thiếu.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {stats.map((s) => (
          <div key={s.label} title={s.hint} className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-2">
            <p className={`text-lg font-black font-mono ${s.tone}`}>{s.value.toLocaleString("vi-VN")}</p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">{s.label}</p>
          </div>
        ))}
      </div>

      <LevelTensesBlock level={level} onOpenLesson={onOpenGrammarLesson} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <WordChips
          title="Sắp thuộc"
          hint="Đang học, gần mốc 7 ngày nhất: ôn đều là sắp tính vào cấp"
          words={d.almostKnown}
          empty={d.met === 0 ? `Chưa học từ ${level} nào.` : "Không còn từ nào đang học ở cấp này."}
          badge={(w) => `${w.stability}d`}
          tone="cyan"
        />
        <WordChips
          title="Hay quên"
          hint="Quên từ 2 lần trở lên: xem thêm ở mục Từ hay quên"
          words={d.oftenForgotten}
          empty="Chưa có từ nào hay quên ở cấp này."
          badge={(w) => `quên ${w.lapses}×`}
          tone="rose"
        />
      </div>
    </div>
  );
}

function WordChips({
  title,
  hint,
  words,
  empty,
  badge,
  tone,
}: {
  title: string;
  hint: string;
  words: LevelWord[];
  empty: string;
  badge: (w: LevelWord) => string;
  tone: "cyan" | "rose";
}) {
  const badgeCls =
    tone === "cyan" ? "text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/50" : "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50";
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 space-y-2">
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">{title}</p>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">{hint}</p>
      </div>
      {words.length === 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-zinc-500">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span
              key={w.id}
              title={w.meaning}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200"
            >
              {w.word}
              <span className={`text-[10px] font-mono px-1 rounded ${badgeCls}`}>{badge(w)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The tenses a level brings in, each with its form, use, an example, and its lesson in the learner's book */
function LevelTensesBlock({ level, onOpenLesson }: { level: GrammarLevel; onOpenLesson?: (lessonId: string) => void }) {
  const [lessons, setLessons] = useState<GrammarBookLesson[] | null>(null);
  useEffect(() => {
    let stale = false;
    getAllBookChapters()
      .then((chs) => !stale && setLessons(chs.flatMap((c) => c.lessons ?? [])))
      .catch(() => !stale && setLessons([]));
    return () => {
      stale = true;
    };
  }, []);
  const tenses = LEVEL_TENSES[level];
  const matched = useMemo(() => matchTenseLessons(tenses, lessons ?? []), [tenses, lessons]);
  const due = useMemo(() => new Set(getDueGrammarLessons()), [lessons]);
  const below = ALL_LEVELS.slice(0, ALL_LEVELS.indexOf(level)).flatMap((l) => LEVEL_TENSES[l]);

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 space-y-2.5">
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
          {tenses.length > 0 ? `Các thì cần học ở ${level} (${tenses.length})` : `Ngữ pháp thì ở ${level}`}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          {tenses.length > 0
            ? below.length > 0
              ? `Thêm vào ${below.length} thì của các cấp dưới, cần nắm trước: ${below.map((x) => x.name).join(", ")}.`
              : "Hai thì nền tảng, dùng nhiều nhất khi nói và viết hằng ngày."
            : C1_TENSE_NOTE}
        </p>
      </div>
      {tenses.length > 0 && (
        <ul className="space-y-1.5">
          {tenses.map((x) => {
            const lesson = matched.get(x);
            return (
              <li
                key={x.name}
                className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-slate-50 dark:bg-zinc-800/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {x.name}
                    <span className="ml-2 text-[11px] font-mono font-normal text-cyan-700 dark:text-cyan-300">{x.form}</span>
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                    {x.use} · <span className="italic text-slate-500 dark:text-zinc-500">{x.example}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {lessons === null ? null : lesson ? (
                    <>
                      <LessonStatusChip status={lessonStatus(lesson.id, new Date(), due)} />
                      {onOpenLesson && (
                        <button
                          type="button"
                          onClick={() => onOpenLesson(lesson.id)}
                          className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 hover:underline"
                        >
                          Mở bài →
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500" title="Sách ngữ pháp bạn nhập chưa có bài cho thì này">
                      Chưa có trong sách
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
