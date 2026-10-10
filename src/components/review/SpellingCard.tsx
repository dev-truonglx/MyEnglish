import type { RefObject } from "react";
import { Volume2, CheckCircle2, Eye, Keyboard, HelpCircle, RotateCcw, AlertCircle, SkipForward } from "lucide-react";
import type { ReviewCard } from "@/types/database";
import type { FeedbackMessage } from "@/hooks/useReviewSession";
import RevealedWordContent from "./RevealedWordContent";
import { handleSpeak } from "./speech";

interface SpellingCardProps {
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
}

/** MODE 3: SPELLING RECALL (read the meaning, then type the word; audio only after answering) */
export default function SpellingCard({
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
}: SpellingCardProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between">
      {!hasCheckedAnswer ? (
        <div className="flex-1 min-h-0 flex flex-col justify-between py-2 overflow-y-auto pr-1 scrollbar-thin">
          <div className="my-auto space-y-4 w-full">
            <div className="text-center space-y-1 shrink-0">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                <Keyboard className="w-4 h-4" />
                Luyện gõ chính tả (Spelling Recall)
              </span>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Đọc nghĩa, tự nhớ ra từ tiếng Anh rồi nhấn Enter. Phát âm sẽ được đọc sau khi trả lời.
              </p>
            </div>

            {/* Audio & Clue Card */}
            <div className="p-5 md:p-6 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-center space-y-3.5 max-w-lg mx-auto w-full shadow-inner shrink-0">
              {/* No audio or IPA before answering: hearing the word would turn recall into dictation.
                  The pronunciation plays as feedback once the answer is checked. */}
              {currentWord.part_of_speech && (
                <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">({currentWord.part_of_speech})</div>
              )}

              <div className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-sm">
                <span className="text-[10px] font-mono uppercase text-emerald-700 dark:text-emerald-400 block font-bold mb-1">
                  Định nghĩa tiếng Việt:
                </span>
                <span className="font-medium">{currentWord.meaning_vn}</span>
              </div>
            </div>

            {/* Spelling input - Centered and responsive */}
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
                  placeholder="Gõ chính tả từ tiếng Anh và nhấn Enter ↵..."
                  className={`w-full bg-white dark:bg-zinc-900 border-2 rounded-2xl px-6 py-3.5 text-lg md:text-xl font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none text-center tracking-widest font-bold shadow-sm transition-all ${
                    isCorrect
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100 ring-4 ring-emerald-500/10"
                      : isShaking
                      ? "border-rose-500 ring-4 ring-rose-500/20 animate-shake"
                      : wrongAttempts > 0
                      ? "border-rose-400/80 dark:border-rose-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      : "border-slate-300 dark:border-zinc-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
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
                        {currentWord.word.slice(0, 2).toUpperCase()}
                        {currentWord.word.slice(2).replace(/./g, " •")}
                      </span>
                    )}
                  </div>
                ) : (showHint || wrongAttempts >= 2) ? (
                  <div className="w-full h-full px-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 min-w-0">
                      <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        Gợi ý chính tả:{" "}
                        <span className="font-mono font-bold text-amber-800 dark:text-amber-300 text-sm">
                          {currentWord.word.slice(0, 2).toUpperCase()}
                          {currentWord.word.slice(2).replace(/./g, " •")}
                        </span>{" "}
                        ({currentWord.word.length} ký tự)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/80 flex items-center justify-center text-[11px] text-slate-400 dark:text-zinc-500 font-medium select-none px-3">
                    <span>Đọc nghĩa tiếng Việt rồi tự gõ từ tiếng Anh. Phát âm sẽ có sau khi trả lời.</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between text-xs px-1 pt-1">
                {wrongAttempts < 2 && !showHint ? (
                  <>
                    <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                      Độ dài: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{currentWord.word.length}</span> ký tự
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowHint(true)}
                        className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 text-xs flex items-center gap-1 transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Gợi ý</span>
                      </button>
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
                        className="text-slate-400 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs underline transition-colors"
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
                      className="py-2.5 px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                      title="Xem chi tiết đáp án & giải thích ngữ pháp"
                    >
                      <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
          {/* Feedback banner */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between shrink-0 ${
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
              <div>
                <div className="text-xs font-bold font-mono uppercase">
                  {isCorrect ? "Chính xác tuyệt đối! 🎉" : "Đáp án chính xác"}
                </div>
                <div className="text-xs">
                  Từ đúng là: <span className="font-mono font-bold text-sm">{currentWord.word}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleSpeak(currentWord.word)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
              title="Nghe phát âm"
            >
              <Volume2 className="w-4 h-4" />
            </button>
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
