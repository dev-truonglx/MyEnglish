import type { RefObject } from "react";
import { Volume2, CheckCircle2, Eye, FileCode, HelpCircle, RotateCcw, AlertCircle, SkipForward } from "lucide-react";
import type { ReviewCard } from "@/types/database";
import type { FeedbackMessage } from "@/hooks/useReviewSession";
import RevealedWordContent from "./RevealedWordContent";
import { highlightWord } from "./highlightWord";
import { handleSpeak } from "./speech";

interface ClozeCardProps {
  currentWord: ReviewCard;
  hasCheckedAnswer: boolean;
  inputRef: RefObject<HTMLInputElement>;
  userInput: string;
  setUserInput: (value: string) => void;
  feedbackMessage: FeedbackMessage | null;
  setFeedbackMessage: (msg: FeedbackMessage | null) => void;
  isAdvancing: boolean;
  isCorrect: boolean | null;
  isShaking: boolean;
  wrongAttempts: number;
  showHint: boolean;
  setShowHint: (value: boolean) => void;
  handleSkip: () => void;
  handleShowAnswer: () => void;
  originalSentence: string;
  clozeDisplaySentence: string;
}

/** MODE 2: CLOZE DELETION (type the missing word into the context sentence) */
export default function ClozeCard({
  currentWord,
  hasCheckedAnswer,
  inputRef,
  userInput,
  setUserInput,
  feedbackMessage,
  setFeedbackMessage,
  isAdvancing,
  isCorrect,
  isShaking,
  wrongAttempts,
  showHint,
  setShowHint,
  handleSkip,
  handleShowAnswer,
  originalSentence,
  clozeDisplaySentence,
}: ClozeCardProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between">
      {!hasCheckedAnswer ? (
        <div className="flex-1 min-h-0 flex flex-col justify-between py-2 overflow-y-auto pr-1 scrollbar-thin">
          <div className="my-auto space-y-4 w-full">
            <div className="text-center space-y-1 shrink-0">
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center gap-1.5">
                <FileCode className="w-4 h-4" />
                Điền từ tiếng Anh còn thiếu vào ngữ cảnh
              </span>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Gõ từ và nhấn Enter. Đúng sẽ tự động chuyển, sai sẽ cho nhập lại.
              </p>
            </div>

            {/* Context Code Card */}
            <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-3 shadow-inner shrink-0">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                <span>Context Sentence</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{currentWord.topic || "Dev Tech"}</span>
              </div>
              <p className="text-sm md:text-base font-medium text-slate-900 dark:text-zinc-100 leading-relaxed font-mono">
                {clozeDisplaySentence}
              </p>

              {/* Vietnamese Meaning Hint */}
              <div className="pt-2.5 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 flex items-start gap-2">
                <span className="text-indigo-700 dark:text-indigo-400 font-semibold shrink-0">Nghĩa tiếng Việt:</span>
                <span className="font-medium">{currentWord.meaning_vn}</span>
              </div>
            </div>

            {/* Input for Guessing - Centered & Symmetrical */}
            <div className="space-y-3 max-w-lg mx-auto w-full shrink-0">
              <div className="relative w-full">
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => {
                    setUserInput(e.target.value);
                    if (feedbackMessage?.type === "error") setFeedbackMessage(null);
                  }}
                  disabled={isAdvancing}
                  readOnly={isCorrect === true}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-gramm="false"
                  data-enable-grammarly="false"
                  data-lpignore="true"
                  placeholder={`Gõ từ còn thiếu (${currentWord.word.length} ký tự) và nhấn Enter ↵`}
                  className={`w-full bg-white dark:bg-zinc-900 border-2 rounded-xl px-4 py-3 text-base font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none text-center tracking-wide shadow-sm transition-all ${
                    isCorrect
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100 ring-4 ring-emerald-500/10 font-bold"
                      : isShaking
                      ? "border-rose-500 ring-4 ring-rose-500/20 animate-shake"
                      : wrongAttempts > 0
                      ? "border-rose-400/80 dark:border-rose-700/80 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                      : "border-slate-300 dark:border-zinc-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  }`}
                  autoFocus
                />
              </div>

              {/* Dedicated Stable Feedback & Hint Area - ALWAYS 48px so screen NEVER jumps */}
              <div className="h-[48px] min-h-[48px] flex items-center justify-center w-full">
                {feedbackMessage ? (
                  <div
                    className={`w-full h-full px-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold text-center shadow-xs animate-in fade-in duration-150 ${
                      feedbackMessage.type === "success"
                        ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                        : feedbackMessage.type === "error"
                        ? "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                        : "bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {feedbackMessage.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                      <span className="truncate">{feedbackMessage.text}</span>
                    </div>
                    {(showHint || wrongAttempts >= 2) && (
                      <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300 shrink-0 ml-2">
                        Gợi ý: "{currentWord.word[0].toUpperCase()}" ({currentWord.word.length} ký tự)
                      </span>
                    )}
                  </div>
                ) : (showHint || wrongAttempts >= 2) ? (
                  <div className="w-full h-full px-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 min-w-0">
                      <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="truncate">
                        Gợi ý: Bắt đầu bằng{" "}
                        <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                          "{currentWord.word[0].toUpperCase()}"
                        </span>
                        , độ dài:{" "}
                        <span className="font-bold text-amber-800 dark:text-amber-300">
                          {currentWord.word.length} ký tự
                        </span>
                      </span>
                    </div>
                    {currentWord.phonetic && (
                      <span className="text-[11px] font-mono bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/40 shrink-0 ml-2">
                        {currentWord.phonetic}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/80 flex items-center justify-center text-[11px] text-slate-400 dark:text-zinc-500 font-medium select-none px-3">
                    <span>Gõ từ tiếng Anh còn thiếu rồi nhấn Enter ↵</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between gap-2 pt-1">
                {wrongAttempts < 2 && !showHint ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowHint(true)}
                      className="text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 transition-colors flex items-center gap-1.5 text-xs font-medium"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Gợi ý chữ cái đầu</span>
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 text-xs flex items-center gap-1 transition-colors"
                        title="Bỏ qua từ này (đánh giá: Quên)"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span>Bỏ qua</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleShowAnswer}
                        className="text-slate-400 hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400 text-xs underline transition-colors"
                      >
                        Xem đáp án
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="w-full grid grid-cols-2 gap-2.5 animate-in fade-in duration-200">
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="py-2.5 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                      title="Bỏ qua từ này (chuyển sang từ tiếp theo và đánh giá: Quên)"
                    >
                      <SkipForward className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                      <span>Bỏ qua từ này</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShowAnswer}
                      className="py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                      title="Xem chi tiết đáp án & giải thích ngữ pháp"
                    >
                      <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Xem kết quả</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col py-1 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          <div className="space-y-2 shrink-0">
            {/* Result feedback banner */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                isCorrect
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <RotateCcw className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span className="text-xs font-semibold">
                  {isCorrect
                    ? `Chính xác! Từ cần điền là "${currentWord.word}"`
                    : `Đáp án chính xác: "${currentWord.word}"`}
                </span>
              </div>
              <button
                onClick={() => handleSpeak(currentWord.word)}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
                title="Nghe phát âm"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {/* Context Sentence with Highlighted Answer */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs md:text-sm font-mono leading-relaxed text-slate-800 dark:text-zinc-100">
              {highlightWord(originalSentence, currentWord.word)}
            </div>
          </div>

          <RevealedWordContent
            currentWord={currentWord}
            handleSpeak={handleSpeak}
            compact
          />
        </div>
      )}
    </div>
  );
}
