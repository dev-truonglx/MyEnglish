import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  History,
  Layers,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  generateExercisePrompt,
  parseAndValidateExerciseJson,
  saveCustomExerciseBatch,
  revertCustomExerciseBatch,
  listExerciseImportHistory,
  deleteExerciseImportRecord,
  type CustomExercisesPayload,
  type GrammarExerciseImportRecord,
  type TensePromptSelection,
  type ValidationResult,
} from "@/services/grammarCustomExercises";
import { BOOK_CHAPTERS, getChapterMetadata } from "@/services/grammarBook";
import { TENSE_OPTIONS } from "./TenseSelectionPicker";

interface GrammarExerciseImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialChapterId?: string;
  initialLessonId?: string;
  initialLessonTitle?: string;
  onImportComplete?: () => void;
}

type ModalTab = "import" | "history" | "prompt";

const TENSE_GROUPS: Array<{
  key: "present" | "past" | "future";
  label: string;
  badgeClass: string;
}> = [
  {
    key: "present",
    label: "CÁC THÌ HIỆN TẠI (PRESENT)",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
  },
  {
    key: "past",
    label: "CÁC THÌ QUÁ KHỨ (PAST)",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/60",
  },
  {
    key: "future",
    label: "CÁC THÌ TƯƠNG LAI (FUTURE)",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60",
  },
];

export default function GrammarExerciseImportModal({
  isOpen,
  onClose,
  initialChapterId = "ch01",
  initialLessonId,
  initialLessonTitle,
  onImportComplete,
}: GrammarExerciseImportModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>("import");
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId);

  // Import State
  const [rawJson, setRawJson] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // History State
  const [historyList, setHistoryList] = useState<GrammarExerciseImportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [previewRawJson, setPreviewRawJson] = useState<string | null>(null);

  // Prompt State
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [promptMode, setPromptMode] = useState<"tenses" | "chapter">("tenses");
  const [batchCountInput, setBatchCountInput] = useState<number>(5);
  const [tenseCounts, setTenseCounts] = useState<Record<string, number>>(() => {
    if (initialLessonId && TENSE_OPTIONS.some((t) => t.id === initialLessonId)) {
      return { [initialLessonId]: 5 };
    }
    return { "ch01-l01": 5 };
  });

  // Load history when modal opens or tab changes to history
  const reloadHistory = async () => {
    setLoadingHistory(true);
    try {
      const records = await listExerciseImportHistory();
      setHistoryList(records);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedChapterId(initialChapterId);
      setValidation(null);
      setSaveSuccessMessage(null);
      setPreviewRawJson(null);
      if (initialLessonId && TENSE_OPTIONS.some((t) => t.id === initialLessonId)) {
        setTenseCounts({ [initialLessonId]: 5 });
        setPromptMode("tenses");
      } else if (initialChapterId && initialChapterId !== "ch01") {
        setPromptMode("chapter");
      }
      void reloadHistory();
    }
  }, [isOpen, initialChapterId, initialLessonId]);

  useEffect(() => {
    if (activeTab === "history") {
      void reloadHistory();
    }
  }, [activeTab]);

  const handleToggleTense = (tenseId: string) => {
    setTenseCounts((prev) => {
      const current = prev[tenseId] ?? 0;
      if (current > 0) {
        const next = { ...prev };
        delete next[tenseId];
        return next;
      }
      return { ...prev, [tenseId]: batchCountInput || 5 };
    });
  };

  const handleSetTenseCount = (tenseId: string, count: number) => {
    const safeCount = Math.max(1, Math.min(50, count));
    setTenseCounts((prev) => ({
      ...prev,
      [tenseId]: safeCount,
    }));
  };

  const handleApplyBatchCount = () => {
    const safe = Math.max(1, Math.min(50, batchCountInput || 5));
    setTenseCounts((prev) => {
      const next: Record<string, number> = {};
      const keys = Object.keys(prev);
      if (keys.length === 0) {
        next["ch01-l01"] = safe;
      } else {
        for (const k of keys) {
          if (prev[k] > 0) next[k] = safe;
        }
      }
      return next;
    });
  };

  const handleSelectGroup = (groupKey: "present" | "past" | "future") => {
    const groupTenses = TENSE_OPTIONS.filter((t) => t.group === groupKey);
    const allSelected = groupTenses.every((t) => (tenseCounts[t.id] ?? 0) > 0);
    setTenseCounts((prev) => {
      const next = { ...prev };
      if (allSelected) {
        groupTenses.forEach((t) => delete next[t.id]);
      } else {
        groupTenses.forEach((t) => {
          next[t.id] = prev[t.id] && prev[t.id] > 0 ? prev[t.id] : (batchCountInput || 5);
        });
      }
      return next;
    });
  };

  const handlePreset = (preset: "basic3" | "present4" | "past4" | "future5" | "all13" | "clear") => {
    const count = batchCountInput || 5;
    if (preset === "clear") {
      setTenseCounts({});
      return;
    }
    if (preset === "basic3") {
      setTenseCounts({ "ch01-l01": count, "ch01-l05": count, "ch01-l09": count });
      return;
    }
    if (preset === "present4") {
      const obj: Record<string, number> = {};
      TENSE_OPTIONS.filter((t) => t.group === "present").forEach((t) => (obj[t.id] = count));
      setTenseCounts(obj);
      return;
    }
    if (preset === "past4") {
      const obj: Record<string, number> = {};
      TENSE_OPTIONS.filter((t) => t.group === "past").forEach((t) => (obj[t.id] = count));
      setTenseCounts(obj);
      return;
    }
    if (preset === "future5") {
      const obj: Record<string, number> = {};
      TENSE_OPTIONS.filter((t) => t.group === "future").forEach((t) => (obj[t.id] = count));
      setTenseCounts(obj);
      return;
    }
    if (preset === "all13") {
      const obj: Record<string, number> = {};
      TENSE_OPTIONS.forEach((t) => (obj[t.id] = count));
      setTenseCounts(obj);
      return;
    }
  };

  const selectedTenseList: TensePromptSelection[] = useMemo(() => {
    return TENSE_OPTIONS
      .filter((t) => (tenseCounts[t.id] ?? 0) > 0)
      .map((t) => ({
        id: t.id,
        titleVn: t.titleVn,
        titleEn: t.titleEn,
        count: tenseCounts[t.id] || 0,
      }));
  }, [tenseCounts]);

  const totalSelectedQuestions = useMemo(() => {
    return selectedTenseList.reduce((sum, t) => sum + t.count, 0);
  }, [selectedTenseList]);

  const currentPrompt = useMemo(() => {
    if (promptMode === "tenses") {
      return generateExercisePrompt({
        chapterId: "ch01",
        tenses: selectedTenseList,
      });
    }
    return generateExercisePrompt({
      chapterId: selectedChapterId,
      lessonId: initialLessonId,
      lessonTitle: initialLessonTitle,
    });
  }, [promptMode, selectedTenseList, selectedChapterId, initialLessonId, initialLessonTitle]);

  if (!isOpen) return null;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(currentPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch (err) {
      console.warn("Failed to copy prompt to clipboard:", err);
    }
  };

  const handleValidate = () => {
    setSaveSuccessMessage(null);
    if (!rawJson.trim()) {
      setValidation({
        ok: false,
        error: "Vui lòng dán mã JSON hoặc tải file bài tập vào khung bên dưới.",
      });
      return;
    }
    const res = parseAndValidateExerciseJson(rawJson, selectedChapterId);
    setValidation(res);
    if (res.ok && res.payload.chapterId) {
      setSelectedChapterId(res.payload.chapterId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawJson(text);
      setSaveSuccessMessage(null);
      const res = parseAndValidateExerciseJson(text, selectedChapterId);
      setValidation(res);
      if (res.ok && res.payload.chapterId) {
        setSelectedChapterId(res.payload.chapterId);
      }
    } catch (err) {
      setValidation({
        ok: false,
        error: `Không thể đọc file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleSave = async (payload: CustomExercisesPayload) => {
    setSaving(true);
    setSaveSuccessMessage(null);
    try {
      const record = await saveCustomExerciseBatch(payload, rawJson);
      setSaveSuccessMessage(
        `Đã lưu thành công ${record.itemCount} câu bài tập vào chương ${record.chapterId.toUpperCase()}!`
      );
      setRawJson("");
      setValidation(null);
      await reloadHistory();
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setValidation({
        ok: false,
        error: `Lỗi khi lưu vào cơ sở dữ liệu: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (batchId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn hoàn tác và XÓA toàn bộ các câu bài tập của đợt này?")) {
      return;
    }
    setRevertingId(batchId);
    try {
      await revertCustomExerciseBatch(batchId);
      await reloadHistory();
      if (onImportComplete) onImportComplete();
    } catch (err) {
      alert(`Không thể hoàn tác: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRevertingId(null);
    }
  };

  const handleDeleteRecord = async (batchId: string) => {
    if (!window.confirm("Bạn có chắc muốn xóa bản ghi lịch sử này?")) return;
    try {
      await deleteExerciseImportRecord(batchId);
      await reloadHistory();
      if (onImportComplete) onImportComplete();
    } catch (err) {
      alert(`Lỗi khi xóa: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const formatTimestamp = (ms: number) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-3xl h-full md:h-auto max-h-[100dvh] md:max-h-[92vh] flex flex-col rounded-none md:rounded-3xl bg-white dark:bg-zinc-900 max-md:border-0 md:border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Thêm bài tập Ngữ pháp bằng AI
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Tạo bài tập qua AI, nhập dữ liệu JSON & hoàn tác an toàn bất cứ lúc nào
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 md:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center px-3 md:px-6 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 gap-1 shrink-0 max-md:overflow-x-auto">
          <button
            onClick={() => setActiveTab("import")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "import"
                ? "border-cyan-600 text-cyan-600 dark:text-cyan-400"
                : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập bài tập (JSON)</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "history"
                ? "border-cyan-600 text-cyan-600 dark:text-cyan-400"
                : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch sử & Hoàn tác</span>
            {historyList.filter((h) => h.status === "active").length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-mono font-semibold">
                {historyList.filter((h) => h.status === "active").length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("prompt")}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "prompt"
                ? "border-cyan-600 text-cyan-600 dark:text-cyan-400"
                : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Lấy Prompt AI</span>
          </button>
        </div>

        {/* Tab content container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {/* TAB 1: IMPORT */}
          {activeTab === "import" && (
            <div className="space-y-4">
              {/* Guidance box */}
              <div className="p-3.5 rounded-2xl bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200/80 dark:border-cyan-800/60 text-xs text-cyan-900 dark:text-cyan-200 space-y-1.5 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Quy trình 3 bước đơn giản:
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-cyan-950/90 dark:text-cyan-200/90">
                  <li>
                    Mở tab <strong>Lấy Prompt AI</strong> để sao chép prompt mẫu.
                  </li>
                  <li>
                    Dán vào ChatGPT/Claude kèm tài liệu ngữ pháp của bạn để AI xuất ra khối JSON.
                  </li>
                  <li>
                    Dán khối JSON vào ô bên dưới, bấm <strong>Kiểm tra & Xem trước</strong> rồi bấm <strong>Lưu vào hệ thống</strong>.
                  </li>
                </ol>
              </div>

              {/* Target Chapter selection */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Chương ngữ pháp nhận bài tập:
                </span>
                <select
                  value={selectedChapterId}
                  onChange={(e) => setSelectedChapterId(e.target.value)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200"
                >
                  {BOOK_CHAPTERS.map((ch) => (
                    <option key={ch.order} value={`ch${String(ch.order).padStart(2, "0")}`}>
                      Chương {ch.order}: {ch.titleVn} ({ch.title})
                    </option>
                  ))}
                </select>
              </div>

              {/* JSON Textarea & Upload button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Nội dung JSON bài tập:
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 font-semibold cursor-pointer">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Hoặc tải file .json</span>
                    <input type="file" accept=".json,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <textarea
                  value={rawJson}
                  onChange={(e) => {
                    setRawJson(e.target.value);
                    setValidation(null);
                    setSaveSuccessMessage(null);
                  }}
                  rows={8}
                  placeholder={`Dán khối JSON tại đây, ví dụ:\n{\n  "format": "myenglish-grammar-exercises",\n  "chapterId": "${selectedChapterId}",\n  "exercises": [\n    {\n      "prompt": "She usually ___ (commit) her code on Friday.",\n      "options": ["commits", "commit", "is committing", "committing"],\n      "answers": [["commits"]]\n    }\n  ]\n}`}
                  className="w-full font-mono text-base md:text-xs p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                />
              </div>

              {/* Success alert message */}
              {saveSuccessMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{saveSuccessMessage}</span>
                </div>
              )}

              {/* Validation Result Box */}
              {validation && !validation.ok && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Không thể đọc được JSON:</div>
                    <p className="mt-0.5">{validation.error}</p>
                  </div>
                </div>
              )}

              {validation && validation.ok && (
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        Hợp lệ: Đã nhận diện {validation.payload.exercises.length} câu bài tập!
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {selectedChapterId.toUpperCase()} • {validation.payload.title}
                    </span>
                  </div>

                  {validation.warnings.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                      <div className="font-bold">Lưu ý:</div>
                      {validation.warnings.map((w, idx) => (
                        <div key={idx}>• {w}</div>
                      ))}
                    </div>
                  )}

                  {/* Preview first 3 questions */}
                  <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-zinc-800">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block">
                      Xem trước các câu hỏi ({Math.min(3, validation.payload.exercises.length)}/
                      {validation.payload.exercises.length} câu):
                    </span>
                    <div className="space-y-2">
                      {validation.payload.exercises.slice(0, 3).map((ex, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs space-y-1"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                            <span>
                              {idx + 1}. {ex.prompt}
                            </span>
                            <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                              {ex.type || "fill_blank"}
                            </span>
                          </div>
                          {ex.options && (
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                              Lựa chọn: {ex.options.join(" | ")}
                            </div>
                          )}
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                            Đáp án: {ex.answers.map((a) => a.join(" / ")).join(", ")}
                          </div>
                          {ex.explainVn && (
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 italic">
                              💡 {ex.explainVn}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleValidate}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-colors"
                >
                  Kiểm tra cú pháp & Xem trước
                </button>
                <button
                  type="button"
                  onClick={() => validation?.ok && handleSave({ ...validation.payload, chapterId: selectedChapterId })}
                  disabled={!validation?.ok || saving}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{saving ? "Đang lưu..." : "Lưu vào hệ thống"}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORY */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Lịch sử các đợt nhập bài tập
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    Mỗi lần nhập có thể hoàn tác (xóa đợt đó) ngay lập tức nếu dữ liệu bị lỗi.
                  </p>
                </div>
                <button
                  onClick={reloadHistory}
                  disabled={loadingHistory}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                  title="Tải lại"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
                </button>
              </div>

              {historyList.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 text-center text-xs text-slate-500 dark:text-zinc-400 space-y-2">
                  <Layers className="w-8 h-8 mx-auto text-slate-400 opacity-60" />
                  <p>Chưa có đợt nhập bài tập nào từ AI.</p>
                  <button
                    onClick={() => setActiveTab("import")}
                    className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                  >
                    Bấm vào đây để nhập đợt đầu tiên →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyList.map((rec) => {
                    const chMeta = getChapterMetadata(rec.chapterId);
                    const isActive = rec.status === "active";
                    return (
                      <div
                        key={rec.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isActive
                            ? "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-sm"
                            : "bg-slate-50/70 dark:bg-zinc-950/60 border-slate-200/60 dark:border-zinc-800/60 opacity-65"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {rec.title}
                              </span>
                              <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300">
                                {rec.chapterId.toUpperCase()}
                                {chMeta ? ` • ${chMeta.titleVn}` : ""}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isActive
                                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                                    : "bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 line-through"
                                }`}
                              >
                                {isActive ? "Đang hoạt động" : "Đã hoàn tác"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-3">
                              <span>Số lượng: {rec.itemCount} câu</span>
                              <span>•</span>
                              <span>Thời gian: {formatTimestamp(rec.timestamp)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0">
                            <button
                              onClick={() => setPreviewRawJson(rec.rawJson)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-medium transition-colors flex items-center gap-1"
                              title="Xem JSON gốc"
                            >
                              <Eye className="w-3 h-3" />
                              <span>JSON</span>
                            </button>

                            {isActive && (
                              <button
                                onClick={() => handleRevert(rec.id)}
                                disabled={revertingId === rec.id}
                                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 text-xs font-bold border border-amber-200/80 dark:border-amber-800/60 transition-colors flex items-center gap-1.5"
                                title="Xóa toàn bộ các câu bài tập của đợt này"
                              >
                                {revertingId === rec.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                <span>Hoàn tác (Xóa đợt này)</span>
                              </button>
                            )}

                            {!isActive && (
                              <button
                                onClick={() => handleDeleteRecord(rec.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                                title="Xóa bản ghi này khỏi lịch sử"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* JSON preview modal */}
              {previewRawJson && (
                <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 text-xs space-y-2 mt-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">Nội dung JSON gốc:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(previewRawJson);
                          alert("Đã sao chép JSON vào clipboard!");
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium"
                      >
                        Sao chép
                      </button>
                      <button
                        onClick={() => setPreviewRawJson(null)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                  <pre className="max-h-60 overflow-y-auto p-3 rounded-lg bg-black/40 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                    {previewRawJson}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROMPT */}
          {activeTab === "prompt" && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Bộ Prompt AI tạo bài tập
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    Chọn các thì và số lượng câu hỏi mong muốn để tạo prompt chính xác cho AI.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  disabled={promptMode === "tenses" && selectedTenseList.length === 0}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedPrompt
                      ? "Đã sao chép vào Clipboard!"
                      : promptMode === "tenses"
                      ? `Sao chép Prompt AI (${totalSelectedQuestions} câu)`
                      : "Sao chép Prompt AI"}
                  </span>
                </button>
              </div>

              {/* Mode switch: Tenses vs Chapters */}
              <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800/70 border border-slate-200/80 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPromptMode("tenses")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    promptMode === "tenses"
                      ? "bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-400 shadow-sm"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Chọn theo 13 Thì tiếng Anh (Cụ thể & Số câu)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPromptMode("chapter")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    promptMode === "chapter"
                      ? "bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-400 shadow-sm"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Chương khác (Chương 2 - 31)</span>
                </button>
              </div>

              {/* If promptMode === 'chapter': Target Chapter selection */}
              {promptMode === "chapter" && (
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Tùy chỉnh cho chương:
                  </span>
                  <select
                    value={selectedChapterId}
                    onChange={(e) => setSelectedChapterId(e.target.value)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200"
                  >
                    {BOOK_CHAPTERS.map((ch) => (
                      <option key={ch.order} value={`ch${String(ch.order).padStart(2, "0")}`}>
                        Chương {ch.order}: {ch.titleVn} ({ch.title})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* If promptMode === 'tenses': Detailed Multi-Tense Selector */}
              {promptMode === "tenses" && (
                <div className="space-y-3.5">
                  {/* Presets and batch controller */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 space-y-3">
                    {/* Fast Presets */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                        Chọn nhanh:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handlePreset("basic3")}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors"
                        >
                          3 thì cơ bản
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreset("present4")}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 transition-colors"
                        >
                          4 thì Hiện tại
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreset("past4")}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 hover:bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/60 transition-colors"
                        >
                          4 thì Quá khứ
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreset("future5")}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60 transition-colors"
                        >
                          5 thì Tương lai
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreset("all13")}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-50 hover:bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-800/60 transition-colors"
                        >
                          Tất cả 13 thì
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreset("clear")}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors"
                        >
                          Bỏ chọn hết
                        </button>
                      </div>
                    </div>

                    {/* Batch number of questions setter */}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60 dark:border-zinc-800/80 flex-wrap">
                      <div className="flex max-md:flex-wrap items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Số câu mặc định:
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={batchCountInput}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setBatchCountInput(isNaN(val) ? 1 : Math.max(1, Math.min(50, val)));
                          }}
                          className="w-14 text-center text-base md:text-xs font-bold px-2 py-1 max-md:min-h-[40px] rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200"
                        />
                        <span className="text-xs text-slate-500 dark:text-zinc-400">câu / thì</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleApplyBatchCount}
                        className="px-3 py-2 md:py-1 max-md:min-h-[40px] rounded-lg text-xs font-bold bg-white hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors"
                      >
                        Đặt cho các thì đã chọn
                      </button>
                    </div>
                  </div>

                  {/* Tenses List Grouped */}
                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                    {TENSE_GROUPS.map(({ key, label, badgeClass }) => {
                      const groupItems = TENSE_OPTIONS.filter((t) => t.group === key);
                      const allGroupSelected = groupItems.every((t) => (tenseCounts[t.id] ?? 0) > 0);

                      return (
                        <div key={key} className="space-y-2">
                          {/* Group Header */}
                          <div className="flex items-center justify-between px-1">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md border ${badgeClass}`}>
                              {label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectGroup(key)}
                              className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                            >
                              {allGroupSelected ? "Bỏ chọn nhóm" : `Chọn cả nhóm (${groupItems.length} thì)`}
                            </button>
                          </div>

                          {/* Group Tense Cards */}
                          <div className="grid grid-cols-1 gap-2">
                            {groupItems.map((tense) => {
                              const count = tenseCounts[tense.id] ?? 0;
                              const isSelected = count > 0;

                              return (
                                <div
                                  key={tense.id}
                                  onClick={() => handleToggleTense(tense.id)}
                                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-cyan-50/40 dark:bg-cyan-950/20 border-cyan-300 dark:border-cyan-800 shadow-xs"
                                      : "bg-white dark:bg-zinc-900/60 border-slate-200/80 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700"
                                  }`}
                                >
                                  {/* Left: Checkbox + Title + Formula */}
                                  <div className="flex items-center gap-3 min-w-0 pr-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}} // handled by parent onClick
                                      className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-300 dark:border-zinc-700 shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-bold ${isSelected ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-zinc-300"}`}>
                                          {tense.titleVn}
                                        </span>
                                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-semibold">
                                          {tense.formula}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                                        {tense.titleEn} • {tense.hint}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Stepper Input or Inactive state */}
                                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                    {isSelected ? (
                                      <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-cyan-200 dark:border-cyan-800">
                                        <button
                                          type="button"
                                          onClick={() => handleSetTenseCount(tense.id, count - 1)}
                                          disabled={count <= 1}
                                          className="w-8 h-8 md:w-6 md:h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors"
                                          title="Giảm 1 câu"
                                        >
                                          <Minus className="w-3.5 h-3.5 md:w-3 md:h-3" />
                                        </button>
                                        <input
                                          type="number"
                                          min={1}
                                          max={50}
                                          value={count}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            handleSetTenseCount(tense.id, isNaN(val) ? 1 : val);
                                          }}
                                          className="w-10 text-center text-base md:text-xs font-bold bg-transparent text-slate-900 dark:text-white focus:outline-hidden"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSetTenseCount(tense.id, count + 1)}
                                          disabled={count >= 50}
                                          className="w-8 h-8 md:w-6 md:h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors"
                                          title="Tăng 1 câu"
                                        >
                                          <Plus className="w-3.5 h-3.5 md:w-3 md:h-3" />
                                        </button>
                                        <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 pr-1.5">câu</span>
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium px-2 py-1 rounded-lg bg-slate-100/60 dark:bg-zinc-800/40">
                                        Chưa chọn
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary & Copy bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200/80 dark:border-cyan-800/60">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-cyan-600 text-white shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-cyan-950 dark:text-cyan-200 flex items-center gap-2">
                          <span>
                            Đã chọn: <strong className="text-cyan-700 dark:text-cyan-300">{selectedTenseList.length}</strong> thì
                          </span>
                          <span>•</span>
                          <span>
                            Tổng cộng: <strong className="text-cyan-700 dark:text-cyan-300">{totalSelectedQuestions}</strong> câu hỏi
                          </span>
                        </div>
                        <p className="text-[11px] text-cyan-800/80 dark:text-cyan-300/80">
                          {selectedTenseList.length === 0
                            ? "Vui lòng chọn ít nhất 1 thì để tạo prompt."
                            : `AI sẽ sinh đúng ${totalSelectedQuestions} câu và gán đúng lessonId cho từng thì tương ứng.`}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      disabled={selectedTenseList.length === 0}
                      className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                    >
                      {copiedPrompt ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                      <span>
                        {copiedPrompt
                          ? "Đã sao chép vào Clipboard!"
                          : `Sao chép Prompt AI (${totalSelectedQuestions} câu)`}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Prompt Preview Code Box */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                    Xem trước nội dung Prompt AI:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    disabled={promptMode === "tenses" && selectedTenseList.length === 0}
                    className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 disabled:opacity-40"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedPrompt ? "Đã sao chép!" : "Sao chép nhanh"}</span>
                  </button>
                </div>
                <div className="relative rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                  <pre className="p-4 max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap select-all">
                    {currentPrompt}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
