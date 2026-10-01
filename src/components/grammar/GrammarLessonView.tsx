import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  BookOpen,
  Zap,
  Volume2,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Share2,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { GrammarLesson, GrammarProgress } from "@/types/grammar";
import { getLessonProgress } from "@/services/grammarService";
import DiagnosticChallenge from "./DiagnosticChallenge";
import SyntaxHighlighter from "./SyntaxHighlighter";

interface GrammarLessonViewProps {
  lesson: GrammarLesson;
  initialTab?: "diagnostic" | "practice" | "handbook";
  onBack: () => void;
  onNextLesson?: () => void;
}

export default function GrammarLessonView({
  lesson,
  initialTab = "diagnostic",
  onBack,
  onNextLesson,
}: GrammarLessonViewProps) {
  const [activeTab, setActiveTab] = useState<"diagnostic" | "practice" | "handbook">(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [lesson.id, initialTab]);
  const progress: GrammarProgress = getLessonProgress(lesson.id);

  const speakText = useCallback((text: string) => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("TTS error:", e);
    }
  }, []);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "A1":
        return "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800";
      case "A2":
        return "bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800";
      case "B1":
        return "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-800";
      case "B2":
        return "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800";
      case "C1":
        return "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800";
      default:
        return "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-300";
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            title="Quay lại danh sách bài học"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getLevelColor(lesson.level)}`}>
                Level {lesson.level}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                {lesson.category}
              </span>
            </div>
            <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{lesson.title}</span>
              <span className="text-sm font-normal text-slate-500 dark:text-zinc-400">
                ({lesson.titleVn})
              </span>
            </h1>
          </div>
        </div>

        {/* Tab switchers + Mastery Indicator */}
        <div className="flex items-center gap-3">
          {/* Mastery Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm text-xs">
            <span className="text-slate-500 dark:text-zinc-400">Mastery:</span>
            <span className="font-bold text-cyan-600 dark:text-cyan-400 font-mono">
              {progress.mastery}%
            </span>
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${progress.mastery}%` }}
              />
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/60">
            <button
              onClick={() => setActiveTab("diagnostic")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "diagnostic"
                  ? "bg-white dark:bg-zinc-900 text-cyan-700 dark:text-cyan-400 shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Kiểm Tra (Test)</span>
            </button>

            <button
              onClick={() => setActiveTab("practice")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "practice"
                  ? "bg-white dark:bg-zinc-900 text-cyan-700 dark:text-cyan-400 shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Luyện Tập</span>
            </button>

            <button
              onClick={() => setActiveTab("handbook")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "handbook"
                  ? "bg-white dark:bg-zinc-900 text-cyan-700 dark:text-cyan-400 shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Sổ Tay</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── TAB 1: DIAGNOSTIC CHALLENGE (TEST-FIRST LEARNING FLOW) ─── */}
      {activeTab === "diagnostic" && (
        <DiagnosticChallenge
          lesson={lesson}
          isDiagnosticMode={true}
          onViewHandbook={() => setActiveTab("handbook")}
          onNextLesson={onNextLesson}
        />
      )}

      {/* ─── TAB 2: PRACTICE DRILLS ─── */}
      {activeTab === "practice" && (
        <DiagnosticChallenge
          lesson={lesson}
          isDiagnosticMode={false}
          onViewHandbook={() => setActiveTab("handbook")}
          onNextLesson={onNextLesson}
        />
      )}

      {/* ─── TAB 3: GRAMMAR HANDBOOK & FORMULAS (SỔ TAY LÝ THUYẾT) ─── */}
      {activeTab === "handbook" && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
          {/* Header Summary Banner */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-cyan-500/10 via-emerald-500/10 to-transparent border border-cyan-500/20 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Bản Đồ Cốt Lõi</span>
            </span>
            <p className="text-base text-slate-800 dark:text-zinc-200 font-medium leading-relaxed">
              {lesson.tagline}
            </p>
          </div>

          {/* 1. Visual Formula Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-500" />
              <span>Công Thức Chuẩn (Formulas)</span>
            </h3>

            <div className="flex flex-col gap-2.5">
              {[
                {
                  type: "(+) Khẳng định",
                  formula: lesson.formula.positive,
                  badgeCls:
                    "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800/50",
                  hoverBorder: "hover:border-emerald-500/40",
                },
                {
                  type: "(-) Phủ định",
                  formula: lesson.formula.negative,
                  badgeCls:
                    "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800/50",
                  hoverBorder: "hover:border-rose-500/40",
                },
                {
                  type: "(?) Nghi vấn",
                  formula: lesson.formula.question,
                  badgeCls:
                    "bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-800/50",
                  hoverBorder: "hover:border-cyan-500/40",
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 transition-colors ${item.hoverBorder}`}
                >
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-xl border w-fit shrink-0 sm:min-w-[120px] text-center ${item.badgeCls}`}
                  >
                    {item.type}
                  </span>
                  <div className="font-mono text-sm md:text-base font-semibold text-slate-800 dark:text-zinc-100 tracking-wide">
                    {item.formula}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Time Signals / Recognition Keywords */}
          {lesson.timeSignals && lesson.timeSignals.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-500" />
                <span>Dấu Hiệu Nhận Biết (Signals)</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {lesson.timeSignals.map((sig, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-mono font-medium text-slate-700 dark:text-zinc-300"
                  >
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 3. Usage Points with Color-Coded Syntax Breakdown */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-cyan-500" />
              <span>Cách Dùng & Phân Tích Cú Pháp Câu (Usage & Syntax)</span>
            </h3>

            <div className="space-y-4">
              {lesson.usagePoints.map((point, index) => (
                <div
                  key={index}
                  className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 md:p-6 shadow-sm space-y-4"
                >
                  <div className="space-y-1">
                    <h4 className="text-sm md:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 text-xs flex items-center justify-center font-bold">
                        {index + 1}
                      </span>
                      <span>{point.title}</span>
                    </h4>
                    <p className="text-xs md:text-sm text-slate-600 dark:text-zinc-400">
                      {point.description}
                    </p>
                  </div>

                  {/* Examples List */}
                  <div className="space-y-3 pt-2">
                    {point.examples.map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-700/60 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          {ex.breakdown ? (
                            <SyntaxHighlighter tokens={ex.breakdown} />
                          ) : (
                            <div className="font-semibold text-slate-800 dark:text-zinc-100 text-sm">
                              {ex.sentenceEn}
                            </div>
                          )}

                          <button
                            onClick={() => speakText(ex.sentenceEn)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-slate-200/60 dark:hover:bg-zinc-700 transition shrink-0"
                            title="Nghe phát âm"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-zinc-400 italic">
                          👉 {ex.sentenceVn}
                        </div>

                        {ex.contextNote && (
                          <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
                            Ngữ cảnh: {ex.contextNote}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Visual Contrast Matrix (Bảng so sánh đối chiếu) */}
          {lesson.contrast && (
            <div className="rounded-3xl border border-cyan-200 dark:border-cyan-800/60 bg-gradient-to-b from-cyan-50/50 dark:from-cyan-950/20 to-white dark:to-zinc-900 p-5 md:p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-cyan-500" />
                <span>So Sánh Đối Chiếu Tránh Nhầm Lẫn</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 space-y-2">
                  <h4 className="text-xs md:text-sm font-bold text-cyan-700 dark:text-cyan-300">
                    {lesson.contrast.titleA}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-zinc-400">
                    {lesson.contrast.descriptionA}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 font-mono text-xs text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-zinc-800">
                    "{lesson.contrast.exampleA}"
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 space-y-2">
                  <h4 className="text-xs md:text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {lesson.contrast.titleB}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-zinc-400">
                    {lesson.contrast.descriptionB}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 font-mono text-xs text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-zinc-800">
                    "{lesson.contrast.exampleB}"
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-cyan-100/70 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 text-xs font-semibold text-cyan-900 dark:text-cyan-200 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Mẹo ghi nhớ: {lesson.contrast.keyRule}</span>
              </div>
            </div>
          )}

          {/* 5. Common Mistakes Matrix (Lỗi người Việt hay gặp) */}
          {lesson.commonMistakes && lesson.commonMistakes.length > 0 && (
            <div className="rounded-3xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/10 p-5 md:p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Các Lỗi Kinh Điển Thường Gặp & Cách Sửa</span>
              </h3>

              <div className="space-y-3">
                {lesson.commonMistakes.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-200/80 dark:border-amber-800/40 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs md:text-sm font-medium">
                      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                        <span className="font-bold">❌ SAI:</span>
                        <span className="line-through">{m.wrong}</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <span className="font-bold">✅ ĐÚNG:</span>
                        <span>{m.correct}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-zinc-400 italic">
                      💡 {m.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action CTA bar to jump back to diagnostic test */}
          <div className="p-6 rounded-3xl bg-slate-900 dark:bg-white text-white dark:text-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-base font-bold">Bạn đã sẵn sàng thử sức?</h4>
              <p className="text-xs text-slate-400 dark:text-zinc-600">
                Làm bài kiểm tra chẩn đoán để ghi nhận điểm thành thạo và nhận thưởng XP!
              </p>
            </div>

            <button
              onClick={() => setActiveTab("diagnostic")}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold text-xs shadow-lg shadow-cyan-500/30 hover:opacity-95 transition flex items-center gap-2 shrink-0"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Vào Làm Bài Kiểm Tra Ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
