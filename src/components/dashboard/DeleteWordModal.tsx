import { Trash2 } from "lucide-react";
import { deleteWord } from "@/services/db";
import { useWordsStore } from "@/stores/wordsStore";

interface DeleteWordModalProps {
  wordToDelete: { id: string; word: string };
  setWordToDelete: (value: { id: string; word: string } | null) => void;
  isDeleting: boolean;
  setIsDeleting: (value: boolean) => void;
  setMessage: (msg: string | null) => void;
}

/** IN-APP DELETE CONFIRMATION MODAL */
export default function DeleteWordModal({
  wordToDelete,
  setWordToDelete,
  isDeleting,
  setIsDeleting,
  setMessage,
}: DeleteWordModalProps) {
  const handleConfirmDelete = async () => {
    if (!wordToDelete) return;
    setIsDeleting(true);
    try {
      await deleteWord(wordToDelete.id);
      const { selectedWord, setSelectedWord, refreshWords } = useWordsStore.getState();
      if (selectedWord?.id === wordToDelete.id) {
        setSelectedWord(null);
      }
      setMessage(`Đã xoá từ "${wordToDelete.word}" khỏi thư viện.`);
      setWordToDelete(null);
      await refreshWords();
    } catch (err) {
      console.error("Failed to delete word:", err);
      setMessage(`Lỗi khi xoá từ: ${err}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Xác nhận xoá từ vựng</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Hành động này sẽ xoá vĩnh viễn khỏi thư viện</p>
          </div>
        </div>

        <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          Bạn có chắc chắn muốn xoá từ{" "}
          <span className="font-mono font-bold text-rose-700 dark:text-rose-300 uppercase px-1.5 py-0.5 rounded bg-rose-50 dark:bg-zinc-900 border border-rose-200 dark:border-zinc-800">
            {wordToDelete.word}
          </span>{" "}
          khỏi từ điển? Toàn bộ ví dụ, phân tích ngữ pháp và tiến độ ôn tập SM-2 sẽ bị xoá.
        </p>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-zinc-900">
          <button
            type="button"
            onClick={() => setWordToDelete(null)}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 !text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? "Đang xoá..." : "Xoá từ vựng"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
