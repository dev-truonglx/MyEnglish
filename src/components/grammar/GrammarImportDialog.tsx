import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, FolderOpen, Loader2, Upload, X } from "lucide-react";
import {
  getAllBookChapters,
  getChapterMetadata,
  importGrammarBookChapters,
  mergeChapterParts,
  parseGrammarBookJson,
  validateChapterFiles,
  validateGrammarBookFile,
} from "@/services/grammarBook";
import type { GrammarBookFile, GrammarBookImportMode, ItemValidationError } from "@/types/grammarBook";

interface GrammarImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface FileEntry {
  name: string;
  errors: ItemValidationError[];
  warnings: ItemValidationError[];
  /** Present only when the file is valid */
  data?: GrammarBookFile;
}

interface ChapterSummary {
  chapterId: string;
  title: string;
  fileParts: number[];
  expectedParts: number;
  /** Parts still missing after this import (parts already on this machine count in "add" mode) */
  missingParts: number[];
  stored: { lessons: number; items: number } | null;
  /** Totals once imported */
  lessons: number;
  sets: number;
  items: number;
  warnings: number;
  droppedItems: number;
}

const MAX_LINES = 100;

function errorEntry(name: string, message: string): FileEntry {
  return { name, errors: [{ file: name, chapterId: "unknown", message, severity: "error" }], warnings: [] };
}

async function readEntry(file: File): Promise<FileEntry> {
  if (!/\.(json|txt)$/i.test(file.name) && file.type !== "application/json") {
    return errorEntry(file.name, "Không phải file .json");
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return errorEntry(file.name, "Không đọc được file này");
  }
  const parsed = parseGrammarBookJson(text);
  if (!parsed.ok) return errorEntry(file.name, parsed.message);
  const res = validateGrammarBookFile(parsed.value, file.name);
  return { name: file.name, errors: res.errors, warnings: res.warnings, data: res.valid ? res.data : undefined };
}

function countItems(chapter: GrammarBookFile): number {
  return (chapter.practiceGroups ?? []).reduce((n, g) => n + (g.items?.length ?? 0), 0);
}

function lineOf(e: ItemValidationError): string {
  return `[${e.file ?? e.chapterId}] ${e.message}`;
}

function MessageList({ lines, noun }: { lines: string[]; noun: string }) {
  const shown = lines.slice(0, MAX_LINES);
  return (
    <ul className="max-h-48 space-y-0.5 overflow-y-auto text-[11px] leading-snug">
      {shown.map((line, i) => (
        <li key={i} className="break-words">
          • {line}
        </li>
      ))}
      {lines.length > MAX_LINES && <li className="italic">… và {lines.length - MAX_LINES} {noun} khác</li>}
    </ul>
  );
}

const MODES: Array<{ id: GrammarBookImportMode; title: string; hint: string }> = [
  {
    id: "merge",
    title: "Nhập thêm (nên dùng)",
    hint: "Giữ các phần đã nhập trước. Câu hoặc bài trùng số sẽ được cập nhật theo file mới.",
  },
  {
    id: "replace",
    title: "Thay thế toàn bộ chương",
    hint: "Xoá nội dung cũ của chương rồi chỉ giữ dữ liệu trong các file này.",
  },
];

export default function GrammarImportDialog({ isOpen, onClose, onImportComplete }: GrammarImportDialogProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [stored, setStored] = useState<GrammarBookFile[]>([]);
  const [mode, setMode] = useState<GrammarBookImportMode>("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [stripAi, setStripAi] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadStored = useCallback(async () => {
    try {
      setStored(await getAllBookChapters());
    } catch {
      setStored([]);
    }
  }, []);

  // Start clean each time the dialog opens; know which chapters are already on this machine
  useEffect(() => {
    if (isOpen) {
      void loadStored();
      return;
    }
    setEntries([]);
    setSuccess(null);
    setSaveErrors([]);
    setDragging(false);
    setMode("merge");
    setConfirmReplace(false);
  }, [isOpen, loadStored]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      if (confirmReplace) setConfirmReplace(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, saving, confirmReplace, onClose]);

  // A confirmation is for exactly what was on screen
  useEffect(() => setConfirmReplace(false), [entries, mode]);

  const validFiles = useMemo(() => entries.flatMap((e) => (e.data ? [e.data] : [])), [entries]);
  const skipped = useMemo(() => entries.filter((e) => !e.data), [entries]);
  const storedById = useMemo(() => new Map(stored.map((c) => [c.chapterId, c])), [stored]);
  const crossWarnings = useMemo(
    () => validateChapterFiles(validFiles, mode === "merge" ? stored : []),
    [validFiles, mode, stored]
  );

  const chapters = useMemo<ChapterSummary[]>(() => {
    const merged = mergeChapterParts(validFiles);
    return Array.from(merged.values())
      .sort((a, b) => a.chapterId.localeCompare(b.chapterId))
      .map((ch) => {
        const parts = validFiles.filter((f) => f.chapterId === ch.chapterId);
        const fileParts = [...new Set(parts.map((p) => p.part || 1))].sort((a, b) => a - b);
        const expectedParts = Math.max(1, ...parts.map((p) => p.parts || 1));
        const before = storedById.get(ch.chapterId);
        const have = new Set([...fileParts, ...(mode === "merge" ? before?.importedParts ?? [] : [])]);
        const after = mode === "merge" && before ? mergeChapterParts([before, ch], { overwrite: true }).get(ch.chapterId)! : ch;
        const fileEntries = entries.filter((e) => e.data?.chapterId === ch.chapterId);
        const meta = ch.chapter ?? getChapterMetadata(ch.chapterId);
        return {
          chapterId: ch.chapterId,
          title: meta?.titleVn || meta?.title || "",
          fileParts,
          expectedParts,
          missingParts: Array.from({ length: expectedParts }, (_, i) => i + 1).filter((p) => !have.has(p)),
          stored: before ? { lessons: before.lessons?.length ?? 0, items: countItems(before) } : null,
          lessons: after.lessons?.length ?? 0,
          sets: after.exerciseSets?.length ?? 0,
          items: countItems(after),
          warnings:
            fileEntries.reduce((n, e) => n + e.warnings.length, 0) + crossWarnings.filter((w) => w.chapterId === ch.chapterId).length,
          droppedItems: fileEntries.reduce((n, e) => n + e.warnings.filter((w) => w.dropped && w.itemN !== undefined).length, 0),
        };
      });
  }, [validFiles, entries, crossWarnings, storedById, mode]);

  const warningLines = useMemo(
    () => [...entries.flatMap((e) => (e.data ? e.warnings.map(lineOf) : [])), ...crossWarnings.map(lineOf)],
    [entries, crossWarnings]
  );
  const errorLines = useMemo(() => skipped.flatMap((e) => e.errors.map(lineOf)), [skipped]);
  const replacedChapters = chapters.filter((c) => c.stored);

  const totals = chapters.reduce(
    (t, c) => ({ lessons: t.lessons + c.lessons, sets: t.sets + c.sets, items: t.items + c.items }),
    { lessons: 0, sets: 0, items: 0 }
  );

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setReading(true);
    setSuccess(null);
    setSaveErrors([]);
    try {
      const next: FileEntry[] = [];
      for (const file of files) next.push(await readEntry(file));
      // A file picked again replaces the earlier one with the same name
      setEntries((prev) => {
        const names = new Set(next.map((n) => n.name));
        return [...prev.filter((p) => !names.has(p.name)), ...next];
      });
    } finally {
      setReading(false);
    }
  }, []);

  const runImport = async () => {
    setConfirmReplace(false);
    setSaving(true);
    setSuccess(null);
    setSaveErrors([]);
    const merged = mergeChapterParts(validFiles);
    const { saved, failed } = await importGrammarBookChapters(merged.values(), { stripAi, mode });
    setSaving(false);
    const failedIds = new Set(failed.map((f) => f.chapterId));
    // Keep only the files of chapters that failed, so the learner can try again
    setEntries((prev) => prev.filter((e) => e.data && failedIds.has(e.data.chapterId)));
    setSaveErrors(failed.map((f) => `Không lưu được ${f.chapterId} vào máy (${f.message}). Hãy thử nhập lại chương này.`));
    void loadStored();
    if (saved.length > 0) {
      const lessons = saved.reduce((n, c) => n + (c.lessons?.length ?? 0), 0);
      const items = saved.reduce((n, c) => n + countItems(c), 0);
      setSuccess(`Đã nhập ${saved.length} chương. Các chương này giờ có ${lessons} bài học, ${items} câu bài tập.`);
      onImportComplete?.();
    }
  };

  const handleImport = () => {
    if (chapters.length === 0 || saving) return;
    // Replacing deletes what was imported before: ask once more, inside the dialog
    if (mode === "replace" && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    void runImport();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (saving) return;
    void addFiles(Array.from(e.dataTransfer.files));
  };

  if (!isOpen) return null;

  const busy = reading || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nhập dữ liệu sách ngữ pháp"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-zinc-900 ${
          dragging ? "border-cyan-500 ring-2 ring-cyan-400/60" : "border-slate-200 dark:border-zinc-800"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-zinc-800 sm:p-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 rounded-xl bg-cyan-50 p-2 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
              <Upload className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">Nhập dữ liệu sách</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">File JSON chuyển từ sách của bạn. Dữ liệu chỉ lưu trên máy này.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng"
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-5 text-center transition hover:border-cyan-500 hover:bg-cyan-50/30 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-cyan-500"
          >
            <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400">
              <FolderOpen className="h-5 w-5" />
            </span>
            <span className="block text-sm font-semibold text-slate-800 dark:text-zinc-200">Chọn các file .json hoặc kéo thả vào đây</span>
            <span className="mt-1 block text-xs text-slate-500 dark:text-zinc-400">
              Chọn được nhiều file cùng lúc. Có thể nhập từng phần một: app tự gộp với phần đã nhập trước.
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".json,.txt,application/json"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addFiles(files);
            }}
          />

          {reading && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-cyan-600 dark:text-cyan-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang kiểm tra các file...
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {saveErrors.length > 0 && (
            <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Có chương chưa lưu được
              </div>
              <MessageList lines={saveErrors} noun="lỗi" />
            </div>
          )}

          {entries.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-zinc-400">
                <span>
                  <strong className="text-slate-900 dark:text-white">{validFiles.length}</strong>/{entries.length} file hợp lệ
                </span>
                <span>
                  <strong className="text-slate-900 dark:text-white">{chapters.length}</strong> chương
                </span>
                <span>
                  <strong className="text-slate-900 dark:text-white">{totals.lessons}</strong> bài
                </span>
                <span>
                  <strong className="text-slate-900 dark:text-white">{totals.sets}</strong> nhóm bài tập
                </span>
                <span>
                  <strong className="text-slate-900 dark:text-white">{totals.items}</strong> câu
                </span>
                <span className="text-[11px] italic">(sau khi nhập)</span>
              </div>

              {chapters.length > 0 && (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {chapters.map((c) => (
                    <li key={c.chapterId} className="space-y-0.5 px-3 py-2 text-xs">
                      <div className="break-words font-semibold text-slate-900 dark:text-white">
                        {c.chapterId}
                        {c.title ? ` · ${c.title}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500 dark:text-zinc-400">
                        <span>
                          File: phần {c.fileParts.join(", ")}/{c.expectedParts}
                        </span>
                        <span>{c.lessons} bài</span>
                        <span>{c.sets} nhóm</span>
                        <span>{c.items} câu</span>
                        {c.droppedItems > 0 && (
                          <span className="font-medium text-rose-700 dark:text-rose-400">bỏ {c.droppedItems} câu lỗi</span>
                        )}
                        {c.warnings > 0 && <span className="font-medium text-amber-700 dark:text-amber-400">{c.warnings} cảnh báo</span>}
                      </div>
                      {c.stored && (
                        <div className="text-slate-500 dark:text-zinc-400">
                          Đã có trên máy: {c.stored.lessons} bài, {c.stored.items} câu
                          {mode === "merge" ? " → sẽ được gộp thêm" : " → sẽ bị thay thế"}
                        </div>
                      )}
                      {c.missingParts.length > 0 && (
                        <div className="font-medium text-amber-700 dark:text-amber-400">
                          Còn thiếu phần {c.missingParts.join(", ")}. Vẫn nhập được; nhập phần còn thiếu sau, app sẽ gộp thêm.
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {skipped.length > 0 && (
                <details open className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Bỏ qua {skipped.length} file lỗi</span>
                  </summary>
                  <p className="mt-2 break-all text-[11px] font-medium">{skipped.map((e) => e.name).join(", ")}</p>
                  <div className="mt-1.5 text-rose-800/90 dark:text-rose-300/80">
                    <MessageList lines={errorLines} noun="lỗi" />
                  </div>
                </details>
              )}

              {warningLines.length > 0 && (
                <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{warningLines.length} cảnh báo (vẫn nhập được; câu lỗi bị bỏ qua, câu nghi ngờ để tự chấm)</span>
                  </summary>
                  <div className="mt-2 text-amber-800/90 dark:text-amber-300/80">
                    <MessageList lines={warningLines} noun="cảnh báo" />
                  </div>
                </details>
              )}

              {validFiles.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">Cách nhập</legend>
                  {MODES.map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                        mode === m.id
                          ? "border-cyan-500 bg-cyan-50/60 dark:border-cyan-600 dark:bg-cyan-950/30"
                          : "border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-800/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="grammar-import-mode"
                        checked={mode === m.id}
                        onChange={() => setMode(m.id)}
                        disabled={busy}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-800 dark:text-zinc-200">{m.title}</span>
                        <span className="block text-[11px] text-slate-500 dark:text-zinc-400">{m.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                <input
                  type="checkbox"
                  checked={stripAi}
                  onChange={(e) => setStripAi(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-600"
                />
                <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">
                  Bỏ phần AI bổ sung trong các file này (bản dịch, phương án nhiễu, giải thích)
                </span>
              </label>

              {confirmReplace && (
                <div
                  role="alertdialog"
                  aria-label="Xác nhận thay thế chương"
                  className="space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Xác nhận thay thế
                  </div>
                  <p>
                    {replacedChapters.length > 0
                      ? `Nội dung đã nhập của ${replacedChapters.map((c) => c.chapterId).join(", ")} sẽ bị xoá và thay bằng dữ liệu trong các file này. Phần nào không có trong file sẽ mất.`
                      : "Các chương này chưa có trên máy, nên thay thế cũng giống nhập thêm."}{" "}
                    Tiến độ học, câu đã ẩn và đáp án bạn đã chấp nhận vẫn được giữ.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReplace(false)}
                      className="rounded-lg px-3 py-1.5 font-semibold text-rose-800 transition hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-900/40"
                    >
                      Quay lại
                    </button>
                    <button
                      type="button"
                      onClick={() => void runImport()}
                      disabled={busy}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 font-bold !text-white transition hover:bg-rose-500 disabled:opacity-50"
                    >
                      Xoá và thay thế
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setEntries([]);
                setSuccess(null);
                setSaveErrors([]);
              }}
              disabled={entries.length === 0 || busy}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-40 dark:hover:text-zinc-200"
            >
              Xoá danh sách
            </button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={chapters.length === 0 || busy || confirmReplace}
                className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold !text-white shadow-sm transition disabled:opacity-50 ${
                  mode === "replace" ? "bg-rose-600 hover:bg-rose-500" : "bg-cyan-600 hover:bg-cyan-500"
                }`}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {chapters.length === 0 ? "Nhập" : mode === "replace" ? `Thay thế ${chapters.length} chương` : `Nhập ${chapters.length} chương`}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-500">
            {mode === "merge"
              ? "Nhập thêm: phần đã nhập trước được giữ, câu trùng số được cập nhật theo file mới. Tiến độ học luôn được giữ."
              : "Thay thế: nội dung cũ của chương bị xoá trước khi nhập. Tiến độ học vẫn được giữ."}
          </p>
        </div>
      </div>
    </div>
  );
}
