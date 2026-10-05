import { useState, useEffect, useMemo } from "react";
import {
  GraduationCap,
  Search,
  BookOpen,
  Zap,
  CheckCircle2,
  Clock,
  Flame,
  RotateCw,
} from "lucide-react";
import { GRAMMAR_LESSONS, getLessonById } from "@/data/grammarData";
import {
  initGrammarStorage,
  getAllGrammarProgress,
  getGrammarSummaryStats,
  getDueGrammarLessons,
} from "@/services/grammarService";
import type { GrammarLevel, GrammarProgress } from "@/types/grammar";
import GrammarLessonView from "./GrammarLessonView";
import { PAGE_CONTAINER } from "../dashboard/shared";

export default function GrammarHub() {
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "mastered" | "learning">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeLessonInitialTab, setActiveLessonInitialTab] = useState<"diagnostic" | "practice" | "handbook">("diagnostic");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Initialize storage & sync on mount
  useEffect(() => {
    initGrammarStorage().then(() => setRefreshTrigger((v) => v + 1));

    const onGrammarUpdate = () => setRefreshTrigger((v) => v + 1);
    window.addEventListener("myenglish-grammar-updated", onGrammarUpdate);
    return () => window.removeEventListener("myenglish-grammar-updated", onGrammarUpdate);
  }, []);

  const progressMap: Record<string, GrammarProgress> = useMemo(() => {
    return getAllGrammarProgress();
  }, [refreshTrigger]);

  const summaryStats = useMemo(() => {
    return getGrammarSummaryStats();
  }, [refreshTrigger]);

  const dueLessonIds = useMemo(() => {
    return getDueGrammarLessons();
  }, [refreshTrigger]);

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return GRAMMAR_LESSONS.filter((lesson) => {
      // Level filter
      if (selectedLevel !== "all" && lesson.level !== selectedLevel) {
        return false;
      }

      // Status filter
      const prog = progressMap[lesson.id];
      const isDue = dueLessonIds.includes(lesson.id);
      const isMastered = (prog?.mastery || 0) >= 80;
      const isLearning =
        (prog?.mastery || 0) > 0 && (prog?.mastery || 0) < 80;

      if (statusFilter === "due" && !isDue) return false;
      if (statusFilter === "mastered" && !isMastered) return false;
      if (statusFilter === "learning" && !isLearning) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = lesson.title.toLowerCase().includes(q);
        const matchTitleVn = lesson.titleVn.toLowerCase().includes(q);
        const matchCategory = lesson.category.toLowerCase().includes(q);
        const matchTagline = lesson.tagline.toLowerCase().includes(q);
        if (!matchTitle && !matchTitleVn && !matchCategory && !matchTagline) {
          return false;
        }
      }

      return true;
    });
  }, [selectedLevel, statusFilter, searchQuery, progressMap, dueLessonIds]);

  const activeLesson = useMemo(() => {
    if (!activeLessonId) return null;
    return getLessonById(activeLessonId);
  }, [activeLessonId]);

  const handleNextLesson = () => {
    if (!activeLessonId) return;
    const currentIdx = GRAMMAR_LESSONS.findIndex((l) => l.id === activeLessonId);
    if (currentIdx !== -1 && currentIdx + 1 < GRAMMAR_LESSONS.length) {
      setActiveLessonInitialTab("diagnostic");
      setActiveLessonId(GRAMMAR_LESSONS[currentIdx + 1].id);
    } else {
      setActiveLessonId(null);
    }
  };

  const handleOpenLesson = (
    lessonId: string,
    tab: "diagnostic" | "practice" | "handbook" = "diagnostic"
  ) => {
    setActiveLessonInitialTab(tab);
    setActiveLessonId(lessonId);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "A1":
        return "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800/60";
      case "A2":
        return "bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800/60";
      case "B1":
        return "bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-800/60";
      case "B2":
        return "bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800/60";
      case "C1":
        return "bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800/60";
      default:
        return "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300";
    }
  };

  if (activeLesson) {
    return (
      <div className={`${PAGE_CONTAINER} space-y-6`}>
        <GrammarLessonView
          lesson={activeLesson}
          initialTab={activeLessonInitialTab}
          onBack={() => setActiveLessonId(null)}
          onNextLesson={handleNextLesson}
        />
      </div>
    );
  }

  return (
    <div className={`${PAGE_CONTAINER} space-y-6`}>
      {/* ─── HEADER HERO BANNER ─── */}
      <div className="relative rounded-3xl p-6 md:p-8 overflow-hidden border border-cyan-200 dark:border-cyan-800/40 bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-transparent shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border border-cyan-300/80 dark:border-cyan-800/60">
              <GraduationCap className="w-4 h-4 text-cyan-500" />
              <span>Lộ Trình Toàn Diện CEFR: A1 - C1</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Trung Tâm Làm Chủ Ngữ Pháp
            </h1>
            <p className="text-xs md:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
              Học ngữ pháp theo cơ chế{" "}
              <strong className="text-cyan-600 dark:text-cyan-400 font-bold">
                Làm Bài Kiểm Tra Chẩn Đoán Trước (Diagnostic-First)
              </strong>
              , phân tích cú pháp trực quan, so sánh đối chiếu và ôn tập lặp lại ngắt quãng (SRS).
            </p>
          </div>

          {/* Quick Mastery & SRS Due Action */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <div className="p-4 rounded-2xl bg-white/90 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-center shadow-sm space-y-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                Độ Thành Thạo Tổng Thể
              </span>
              <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
                {summaryStats.overallMasteryPercent}%
              </div>
              <div className="w-36 h-2 bg-slate-200 dark:bg-zinc-800 rounded-full mx-auto overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${summaryStats.overallMasteryPercent}%` }}
                />
              </div>
            </div>

            {dueLessonIds.length > 0 && (
              <button
                onClick={() => {
                  setStatusFilter("due");
                  if (dueLessonIds[0]) setActiveLessonId(dueLessonIds[0]);
                }}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-semibold shadow-md shadow-orange-500/20 hover:opacity-95 transition flex items-center justify-center gap-2"
              >
                <Flame className="w-4 h-4 fill-white" />
                <span>Ôn tập ngay ({dueLessonIds.length} bài cần ôn)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── CEFR ROADMAP LEVEL PILLS ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
          <span>Lộ trình các cấp độ (Roadmap)</span>
          <span>{summaryStats.masteredCount} / {summaryStats.totalLessons} bài đã thành thạo</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {(["A1", "A2", "B1", "B2", "C1"] as GrammarLevel[]).map((lvl) => {
            const stat = summaryStats.levelStats[lvl] || { total: 0, mastered: 0, percent: 0 };
            const isSelected = selectedLevel === lvl;

            return (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(isSelected ? "all" : lvl)}
                className={`p-3 rounded-2xl border text-left transition-all ${isSelected
                    ? "bg-cyan-50 dark:bg-cyan-950/80 border-cyan-500 ring-2 ring-cyan-400/40 shadow-sm"
                    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getLevelColor(lvl)}`}>
                    {lvl}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    {stat.mastered}/{stat.total}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
                    {lvl === "A1" && "Cơ bản"}
                    {lvl === "A2" && "Sơ cấp"}
                    {lvl === "B1" && "Trung cấp"}
                    {lvl === "B2" && "Nâng cao"}
                    {lvl === "C1" && "Cao cấp"}
                  </span>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 font-mono">
                    {stat.percent}%
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all"
                    style={{ width: `${stat.percent}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── FILTERS & SEARCH BAR ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm bài học, thì, cấu trúc..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === "all"
                ? "bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            Tất cả ({GRAMMAR_LESSONS.length})
          </button>

          <button
            onClick={() => setStatusFilter("due")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${statusFilter === "due"
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span>Cần ôn</span>
            {dueLessonIds.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 font-bold">
                {dueLessonIds.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setStatusFilter("mastered")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${statusFilter === "mastered"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Thành thạo</span>
          </button>

          <button
            onClick={() => setStatusFilter("learning")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${statusFilter === "learning"
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Đang học</span>
          </button>
        </div>
      </div>

      {/* ─── LESSON CARDS GRID ─── */}
      {filteredLessons.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2">
          <BookOpen className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
            Không tìm thấy bài học phù hợp
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Hãy thử tìm bằng từ khóa khác hoặc xóa bộ lọc cấp độ.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLessons.map((lesson) => {
            const prog = progressMap[lesson.id];
            const isDue = dueLessonIds.includes(lesson.id);
            const mastery = prog?.mastery || 0;
            const isMastered = mastery >= 80;
            const isUnattempted = !prog || prog.diagnosticStatus === "unattempted";

            return (
              <div
                key={lesson.id}
                className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 shadow-sm hover:shadow-md hover:border-cyan-400/60 dark:hover:border-cyan-500/40 transition-all flex flex-col justify-between group space-y-4"
              >
                {/* Header row */}
                <div
                  onClick={() => handleOpenLesson(lesson.id, isUnattempted ? "diagnostic" : "practice")}
                  className="space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getLevelColor(lesson.level)}`}>
                      {lesson.level}
                    </span>

                    {/* Status Pill */}
                    {isDue ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800">
                        <Clock className="w-3 h-3" /> Cần ôn
                      </span>
                    ) : isMastered ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> Thành thạo
                      </span>
                    ) : isUnattempted ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                        Chưa làm
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">
                        Đang học ({mastery}%)
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition">
                      {lesson.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                      {lesson.titleVn}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {lesson.tagline}
                  </p>
                </div>

                {/* Footer: Mastery line + Action buttons */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                    <span>Độ thành thạo:</span>
                    <span className="font-bold text-slate-700 dark:text-zinc-300 font-mono">
                      {mastery}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isMastered
                          ? "bg-emerald-500"
                          : mastery > 0
                            ? "bg-cyan-500"
                            : "bg-slate-300 dark:bg-zinc-700"
                        }`}
                      style={{ width: `${mastery}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleOpenLesson(lesson.id, isUnattempted ? "diagnostic" : "practice")}
                      className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-xs font-semibold hover:opacity-95 shadow-sm transition flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5 fill-white" />
                      <span>{isUnattempted ? "Kiểm Tra" : "Luyện Tập"}</span>
                    </button>

                    <button
                      onClick={() => handleOpenLesson(lesson.id, "handbook")}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition flex items-center justify-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-cyan-500" />
                      <span>Sổ Tay</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
