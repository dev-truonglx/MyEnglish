import { useState, useEffect, useRef } from "react";
import {
  Volume2,
  CheckCircle2,
  Eye,
  ChevronLeft,
  Layers,
  FileCode,
  Keyboard,
  HelpCircle,
  RotateCcw,
  Tag,
} from "lucide-react";
import { recordReview, type SM2Result } from "@/services/srs";
import { recordDailyActivity } from "@/services/streak";
import { parseTerms, parseCollocations, type WordDetail } from "@/types/database";

interface FlashcardReviewProps {
  wordsToReview: WordDetail[];
  onFinish: () => void;
  onExit: () => void;
}

type StudyMode = "flip" | "cloze" | "spelling";

export default function FlashcardReview({
  wordsToReview,
  onFinish,
  onExit,
}: FlashcardReviewProps) {
  // Preferred mode persistence
  const [mode, setMode] = useState<StudyMode>(() => {
    try {
      const saved = localStorage.getItem("myenglish_flashcard_mode");
      if (saved === "cloze" || saved === "spelling" || saved === "flip") return saved;
    } catch {}
    return "flip";
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [lastResult, setLastResult] = useState<SM2Result | null>(null);

  // Cloze & Spelling Interactive State
  const [userInput, setUserInput] = useState("");
  const [hasCheckedAnswer, setHasCheckedAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const currentWord = wordsToReview[currentIndex];

  const handleModeChange = (newMode: StudyMode) => {
    setMode(newMode);
    try {
      localStorage.setItem("myenglish_flashcard_mode", newMode);
    } catch {}
    resetCardState();
  };

  const resetCardState = () => {
    setIsFlipped(false);
    setUserInput("");
    setHasCheckedAnswer(false);
    setIsCorrect(null);
    setShowHint(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  useEffect(() => {
    resetCardState();
  }, [currentIndex]);

  const handleSpeak = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Auto-speak on card switch in Spelling mode to test audio recall
  useEffect(() => {
    if (mode === "spelling" && currentWord) {
      handleSpeak(currentWord.word);
    }
  }, [currentIndex, mode]);

  const handleGrade = async (quality: number) => {
    if (!currentWord) return;

    try {
      const result = await recordReview(currentWord.id, quality);
      recordDailyActivity(1);
      setLastResult(result);
      setReviewCount((prev) => prev + 1);

      if (currentIndex + 1 < wordsToReview.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setSessionCompleted(true);
      }
    } catch (err) {
      console.error("Failed to record review:", err);
    }
  };

  // Submit Answer in Cloze or Spelling mode
  const handleCheckAnswer = () => {
    if (!currentWord || hasCheckedAnswer) return;
    const cleanGuess = userInput.trim().toLowerCase();
    const cleanTarget = currentWord.word.trim().toLowerCase();

    const matched = cleanGuess === cleanTarget;
    setIsCorrect(matched);
    setHasCheckedAnswer(true);
    setIsFlipped(true);
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionCompleted) return;

      const isTyping =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // In Cloze or Spelling mode, if typing into input, Enter submits answer
      if (isTyping) {
        if (e.key === "Enter" && !hasCheckedAnswer) {
          e.preventDefault();
          handleCheckAnswer();
        }
        return;
      }

      // Flip card with Space if in flip mode
      if (mode === "flip" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped || hasCheckedAnswer) {
        // Grading hotkeys: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
        if (e.key === "1") handleGrade(1);
        else if (e.key === "2") handleGrade(3);
        else if (e.key === "3") handleGrade(4);
        else if (e.key === "4") handleGrade(5);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, currentIndex, sessionCompleted, currentWord, mode, hasCheckedAnswer, userInput]);

  // Session Completed view
  if (sessionCompleted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center space-y-6 animate-in zoom-in-95 duration-200">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-2xl shadow-emerald-500/20">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Phiên ôn tập hoàn tất! 🎉</h2>
          <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Bạn đã ôn tập thành công <span className="text-emerald-600 dark:text-emerald-400 font-bold">{reviewCount}</span> thẻ từ.
            Chuỗi ngày học (Streak) và thuật toán SM-2 đã được cập nhật thành công.
          </p>
        </div>

        {lastResult && (
          <div className="w-full p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 grid grid-cols-3 gap-2 shadow-sm">
            <div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Ease Factor</div>
              <div className="text-base font-bold text-cyan-600 dark:text-cyan-400 font-mono">{lastResult.easeFactor}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Next Interval</div>
              <div className="text-base font-bold text-slate-900 dark:text-white font-mono">{lastResult.interval}d</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Reps</div>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">{lastResult.repetitions}</div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onFinish}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 !text-white text-xs font-semibold shadow-lg shadow-cyan-500/25 transition-all"
          >
            Quay lại Thư viện từ
          </button>
        </div>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <p className="text-slate-500 dark:text-zinc-400 text-xs">Không có thẻ nào cần ôn tập hôm nay.</p>
        <button onClick={onExit} className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">
          Quay lại
        </button>
      </div>
    );
  }

  const synonyms = parseTerms(currentWord.synonyms);
  const antonyms = parseTerms(currentWord.antonyms);
  const collocations = parseCollocations(currentWord.collocations);

  // Prepare cloze sentence: replace word with blank
  const primaryExample = currentWord.examples[0];
  const originalSentence =
    primaryExample?.sentence_en ||
    `Developers frequently need to manage and inspect ${currentWord.word} in modern distributed software.`;

  // Regex to mask the word case-insensitively
  const wordRegex = new RegExp(`\\b${currentWord.word}\\b`, "gi");
  const hasTargetInSentence = wordRegex.test(originalSentence);
  const clozeDisplaySentence = hasTargetInSentence
    ? originalSentence.replace(wordRegex, "____[ ? ]____")
    : `${originalSentence} (Ngữ cảnh cần từ: ____[ ? ]____)`;

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-4 md:p-6 max-w-2xl mx-auto w-full select-none h-full min-h-[620px]">
      {/* Top Bar with Mode Selector & Progress */}
      <div className="w-full shrink-0 mb-3 flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Thoát</span>
        </button>

        {/* Study Mode Selector */}
        <div className="flex items-center bg-slate-100 dark:bg-zinc-900/90 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <button
            onClick={() => handleModeChange("flip")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === "flip"
                ? "bg-white dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/40 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Thẻ lật</span>
          </button>

          <button
            onClick={() => handleModeChange("cloze")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === "cloze"
                ? "bg-white dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/40 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Điền từ (Cloze)</span>
          </button>

          <button
            onClick={() => handleModeChange("spelling")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === "spelling"
                ? "bg-white dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/40 shadow-sm"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Luyện gõ</span>
          </button>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
            Thẻ <span className="text-slate-900 dark:text-white font-bold">{currentIndex + 1}</span> / {wordsToReview.length}
          </div>
          <div className="w-24 h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / wordsToReview.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* FLASHCARD BODY CONTAINER - Rock solid vertical height */}
      <div
        onClick={mode === "flip" ? () => setIsFlipped(!isFlipped) : undefined}
        className={`w-full flex-1 my-auto min-h-[440px] max-h-[68vh] overflow-y-auto rounded-3xl border bg-white dark:bg-zinc-950 p-6 md:p-7 shadow-xl dark:shadow-2xl flex flex-col justify-between transition-all relative ${
          mode === "flip" ? "cursor-pointer hover:border-slate-400 dark:hover:border-zinc-700/80" : ""
        } ${
          hasCheckedAnswer
            ? isCorrect
              ? "border-emerald-500/60 shadow-emerald-500/10"
              : "border-rose-500/60 shadow-rose-500/10"
            : "border-slate-200 dark:border-zinc-800"
        }`}
      >
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {currentWord.part_of_speech && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-semibold">
                {currentWord.part_of_speech}
              </span>
            )}
            <span className="text-[10px] font-medium text-cyan-800 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              {currentWord.topic || "General Tech"}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700/50">
              EF: {currentWord.srs.ease_factor} • {currentWord.srs.interval}d
            </span>
          </div>

          <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 uppercase tracking-wider shrink-0">
            {mode === "flip" ? "Standard Flip" : mode === "cloze" ? "Cloze Deletion" : "Spelling Recall"}
          </span>
        </div>

        {/* ----------------- MODE 1: STANDARD FLIP ----------------- */}
        {mode === "flip" && (
          <>
            {!isFlipped ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-8">
                <span className="text-[11px] font-mono uppercase tracking-widest text-cyan-600 dark:text-cyan-400 font-semibold">
                  Developer Vocabulary
                </span>

                <div className="flex items-center gap-3 flex-wrap justify-center">
                  <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight capitalize font-mono">
                    {currentWord.word}
                  </h2>
                  <button
                    onClick={(e) => handleSpeak(currentWord.word, e)}
                    title="Phát âm"
                    className="p-2.5 rounded-full bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 transition-colors shadow-sm"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                {currentWord.phonetic && (
                  <span className="text-sm font-mono text-cyan-700 dark:text-cyan-300/80 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1 rounded-full">
                    {currentWord.phonetic}
                  </span>
                )}

                {synonyms.length > 0 && (
                  <div className="flex gap-1.5 justify-center flex-wrap pt-2">
                    {synonyms.slice(0, 3).map((s, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/60 px-2.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700/40"
                      >
                        {s.word}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-8 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 animate-pulse">
                  <Eye className="w-4 h-4" />
                  <span>Nhấn Space hoặc click vào thẻ để xem định nghĩa</span>
                </div>
              </div>
            ) : (
              <RevealedWordContent
                currentWord={currentWord}
                synonyms={synonyms}
                antonyms={antonyms}
                collocations={collocations}
                handleSpeak={handleSpeak}
              />
            )}
          </>
        )}

        {/* ----------------- MODE 2: CLOZE DELETION ----------------- */}
        {mode === "cloze" && (
          <>
            {!hasCheckedAnswer ? (
              <div className="flex-1 flex flex-col justify-center space-y-5 py-4">
                <div className="text-center space-y-1">
                  <span className="text-xs font-mono uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center gap-1.5">
                    <FileCode className="w-4 h-4" />
                    Điền từ tiếng Anh còn thiếu vào ngữ cảnh
                  </span>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Đoán từ dựa trên ngữ cảnh mã nguồn và định nghĩa tiếng Việt
                  </p>
                </div>

                {/* Context Code Card */}
                <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-3 shadow-inner">
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
                <div className="space-y-3 max-w-lg mx-auto w-full">
                  <div className="relative w-full">
                    <input
                      ref={inputRef}
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={`Gõ từ còn thiếu (${currentWord.word.length} ký tự)...`}
                      className="w-full bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 rounded-xl px-4 py-3 text-base font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-center tracking-wide shadow-sm transition-all"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs px-2">
                    <button
                      onClick={() => setShowHint(true)}
                      className="text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 transition-colors flex items-center gap-1.5 text-xs"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>
                        {showHint
                          ? `Gợi ý chữ đầu: "${currentWord.word[0].toUpperCase()}${currentWord.word
                              .slice(1)
                              .replace(/./g, " •")}"`
                          : "Gợi ý chữ cái đầu"}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setUserInput(currentWord.word);
                        setIsCorrect(false);
                        setHasCheckedAnswer(true);
                      }}
                      className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs underline"
                    >
                      Xem đáp án
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between py-2 space-y-4">
                <div className="space-y-3">
                  {/* Result feedback banner */}
                  <div
                    className={`p-3.5 rounded-xl border flex items-center justify-between ${
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
                          : `Chưa đúng! Đáp án đúng là "${currentWord.word}"`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleSpeak(currentWord.word)}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Context Sentence with Highlighted Answer */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs md:text-sm font-mono leading-relaxed text-slate-800 dark:text-zinc-100">
                    {originalSentence.split(new RegExp(`(${currentWord.word})`, "gi")).map((part, i) =>
                      part.toLowerCase() === currentWord.word.toLowerCase() ? (
                        <span
                          key={i}
                          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/40"
                        >
                          {part}
                        </span>
                      ) : (
                        part
                      )
                    )}
                  </div>
                </div>

                <RevealedWordContent
                  currentWord={currentWord}
                  synonyms={synonyms}
                  antonyms={antonyms}
                  collocations={collocations}
                  handleSpeak={handleSpeak}
                  compact
                />
              </div>
            )}
          </>
        )}

        {/* ----------------- MODE 3: SPELLING PRACTICE ----------------- */}
        {mode === "spelling" && (
          <>
            {!hasCheckedAnswer ? (
              <div className="flex-1 flex flex-col justify-center space-y-6 py-4">
                <div className="text-center space-y-1">
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                    <Keyboard className="w-4 h-4" />
                    Luyện gõ chính tả (Spelling Recall)
                  </span>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Luyện phản xạ gõ chuẩn xác thuật ngữ kỹ thuật từ trí nhớ
                  </p>
                </div>

                {/* Audio & Clue Card */}
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-center space-y-4 max-w-lg mx-auto w-full shadow-inner">
                  <button
                    onClick={() => handleSpeak(currentWord.word)}
                    className="mx-auto px-5 py-2.5 rounded-full bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 transition-all flex items-center gap-2 text-xs font-semibold shadow-sm hover:scale-105 active:scale-95"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Nghe phát âm</span>
                  </button>

                  {currentWord.phonetic && (
                    <div className="text-sm font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{currentWord.phonetic}</div>
                  )}

                  <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-sm">
                    <span className="text-[10px] font-mono uppercase text-emerald-700 dark:text-emerald-400 block font-bold mb-1">
                      Định nghĩa tiếng Việt:
                    </span>
                    <span className="font-medium">{currentWord.meaning_vn}</span>
                  </div>
                </div>

                {/* Spelling input - Perfectly centered and balanced */}
                <div className="space-y-3 max-w-lg mx-auto w-full">
                  <div className="relative w-full">
                    <input
                      ref={inputRef}
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Gõ chính tả từ tiếng Anh..."
                      className="w-full bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 rounded-2xl px-6 py-3.5 text-lg md:text-xl text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 text-center tracking-widest font-bold shadow-sm transition-all"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs px-2">
                    <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                      Độ dài từ: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{currentWord.word.length}</span> ký tự
                    </div>

                    <button
                      onClick={() => {
                        setUserInput(currentWord.word);
                        setIsCorrect(false);
                        setHasCheckedAnswer(true);
                      }}
                      className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs underline"
                    >
                      Bỏ cuộc & Xem đáp án
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between py-2 space-y-4">
                {/* Feedback banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
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
                        {isCorrect ? "Chính xác tuyệt đối! 🎉" : "Chính tả chưa chuẩn"}
                      </div>
                      <div className="text-xs">
                        Từ đúng là: <span className="font-mono font-bold">{currentWord.word}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSpeak(currentWord.word)}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <RevealedWordContent
                  currentWord={currentWord}
                  synonyms={synonyms}
                  antonyms={antonyms}
                  collocations={collocations}
                  handleSpeak={handleSpeak}
                  compact
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* BOTTOM ACTION BAR - Always present with fixed height (h-14) so card NEVER jumps */}
      <div className="w-full mt-3 h-14 shrink-0 flex items-center justify-center">
        {(mode === "flip" ? isFlipped : hasCheckedAnswer) ? (
          <div className="w-full grid grid-cols-4 gap-3 h-full animate-in slide-in-from-bottom-2 duration-150">
            {/* Again: Quality 1 */}
            <button
              onClick={() => handleGrade(1)}
              className="p-2 md:p-3 rounded-2xl border border-rose-200 dark:border-rose-800/80 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm"
            >
              <span className="font-bold">Again</span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400/80 font-mono">Quên (1)</span>
            </button>

            {/* Hard: Quality 3 */}
            <button
              onClick={() => handleGrade(3)}
              className="p-2 md:p-3 rounded-2xl border border-amber-200 dark:border-amber-800/80 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-medium text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm"
            >
              <span className="font-bold">Hard</span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400/80 font-mono">Khó (2)</span>
            </button>

            {/* Good: Quality 4 */}
            <button
              onClick={() => handleGrade(4)}
              className={`p-2 md:p-3 rounded-2xl border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm ${
                isCorrect
                  ? "border-blue-400 dark:border-blue-500 bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/30 font-bold"
                  : "border-blue-200 dark:border-blue-800/80 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-medium"
              }`}
            >
              <span className="font-bold">Good</span>
              <span className="text-[10px] text-blue-700 dark:text-blue-400/80 font-mono">Tốt (3)</span>
            </button>

            {/* Easy: Quality 5 */}
            <button
              onClick={() => handleGrade(5)}
              className="p-2 md:p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-medium text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm"
            >
              <span className="font-bold">Easy</span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80 font-mono">Dễ (4)</span>
            </button>
          </div>
        ) : mode === "flip" ? (
          <button
            onClick={() => setIsFlipped(true)}
            className="w-full h-full rounded-2xl bg-white hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-slate-300 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <span>Lật thẻ xem đáp án</span>
            <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[11px] font-mono text-slate-700 dark:text-zinc-300">
              Space
            </kbd>
          </button>
        ) : mode === "cloze" ? (
          <button
            onClick={handleCheckAnswer}
            disabled={!userInput.trim()}
            className="w-full h-full rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20"
          >
            <span>Kiểm tra đáp án</span>
            <kbd className="px-2 py-0.5 rounded bg-indigo-700/60 border border-indigo-400/40 text-[11px] font-mono text-indigo-100">
              Enter ↵
            </kbd>
          </button>
        ) : (
          <button
            onClick={handleCheckAnswer}
            disabled={!userInput.trim()}
            className="w-full h-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
          >
            <span>Kiểm tra chính tả</span>
            <kbd className="px-2 py-0.5 rounded bg-emerald-700/60 border border-emerald-400/40 text-[11px] font-mono text-emerald-100">
              Enter ↵
            </kbd>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Subcomponent to render revealed word details (Vietnamese meaning, collocations, synonyms/antonyms, code examples)
 */
function RevealedWordContent({
  currentWord,
  synonyms,
  antonyms,
  collocations,
  handleSpeak,
  compact = false,
}: {
  currentWord: WordDetail;
  synonyms: ReturnType<typeof parseTerms>;
  antonyms: ReturnType<typeof parseTerms>;
  collocations: string[];
  handleSpeak: (text: string, e?: React.MouseEvent) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col justify-between space-y-4 animate-in fade-in duration-200">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white capitalize font-mono">{currentWord.word}</h3>
            {currentWord.phonetic && (
              <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400">{currentWord.phonetic}</span>
            )}
            <button
              onClick={(e) => handleSpeak(currentWord.word, e)}
              className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 transition-colors p-1"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          <span className="text-xs text-cyan-600 dark:text-cyan-400 font-mono font-semibold uppercase tracking-wider">
            Chi tiết từ
          </span>
        </div>

        {/* Vietnamese Meaning */}
        {!compact && (
          <div className="p-3 rounded-xl bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/50 text-center shadow-sm space-y-1">
            <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 font-semibold uppercase tracking-wider block">
              Ý nghĩa Tiếng Việt:
            </span>
            <p className="text-sm font-medium text-cyan-950 dark:text-cyan-100 leading-relaxed">
              {currentWord.meaning_vn}
            </p>
          </div>
        )}

        {/* Collocations chips */}
        {collocations.length > 0 && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 space-y-1.5 text-left">
            <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 font-bold uppercase tracking-wider block">
              Cụm từ thường gặp (Collocations):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {collocations.slice(0, 4).map((col, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 text-slate-700 dark:text-zinc-300 font-mono text-[11px]"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Synonyms & Antonyms preview */}
        {(synonyms.length > 0 || antonyms.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
            {synonyms.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 space-y-1">
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase block">
                  Đồng nghĩa:
                </span>
                <div className="space-y-1 text-xs">
                  {synonyms.slice(0, 2).map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{s.word}</span>
                      {s.meaning_vn && (
                        <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[140px]">{s.meaning_vn}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {antonyms.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 space-y-1">
                <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400 font-bold uppercase block">
                  Trái nghĩa:
                </span>
                <div className="space-y-1 text-xs">
                  {antonyms.slice(0, 2).map((a, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-rose-700 dark:text-rose-300">{a.word}</span>
                      {a.meaning_vn && (
                        <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[140px]">{a.meaning_vn}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Coding Context Examples with Grammar Analysis */}
        {currentWord.examples.length > 0 && !compact && (
          <div className="space-y-2 pt-1 text-left">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider block font-semibold">
              Ví dụ & Ngữ pháp:
            </span>
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {currentWord.examples.slice(0, 2).map((ex, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-slate-50 dark:bg-zinc-950 p-3 border border-slate-200 dark:border-zinc-800/80 space-y-1 text-xs"
                >
                  <p className="text-slate-800 dark:text-zinc-100 font-semibold leading-relaxed">"{ex.sentence_en}"</p>
                  {ex.sentence_vn && (
                    <p className="text-[11px] text-cyan-700 dark:text-cyan-300 italic leading-snug">{ex.sentence_vn}</p>
                  )}
                  <p className="text-[11px] text-amber-800 dark:text-amber-300/90 font-mono pt-1 border-t border-slate-200 dark:border-zinc-900 leading-relaxed">
                    <span className="text-slate-500 dark:text-zinc-500 font-sans">Cú pháp: </span>
                    {ex.grammar_analysis}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-center text-slate-400 dark:text-zinc-400 font-mono">
        Đánh giá mức độ ghi nhớ (Phím 1-4)
      </div>
    </div>
  );
}
