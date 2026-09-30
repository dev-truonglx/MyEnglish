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
  Code2,
  BookOpen,
  AlertCircle,
  SkipForward,
  Award,
  TrendingUp,
} from "lucide-react";
import { recordReview, type SM2Result } from "@/services/srs";
import { recordDailyActivity } from "@/services/streak";
import { parseTerms, type WordDetail } from "@/types/database";

interface FlashcardReviewProps {
  wordsToReview: WordDetail[];
  onFinish: () => void;
  onExit: () => void;
}

type StudyMode = "flip" | "cloze" | "spelling";

interface SessionStats {
  firstTryCorrect: number;
  retryCorrect: number;
  revealedCount: number;
  skippedCount: number;
  totalWrongAttempts: number;
}

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
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: "error" | "success" | "info";
  } | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Session-wide Learning Evaluation Statistics
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    firstTryCorrect: 0,
    retryCorrect: 0,
    revealedCount: 0,
    skippedCount: 0,
    totalWrongAttempts: 0,
  });

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
    setWrongAttempts(0);
    setIsShaking(false);
    setFeedbackMessage(null);
    setIsAdvancing(false);
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
    if (!currentWord || isAdvancing) return;
    setIsAdvancing(true);

    // Track statistics if in flip mode
    if (mode === "flip") {
      if (quality === 5) {
        setSessionStats((prev) => ({ ...prev, firstTryCorrect: prev.firstTryCorrect + 1 }));
      } else if (quality >= 3) {
        setSessionStats((prev) => ({ ...prev, retryCorrect: prev.retryCorrect + 1 }));
      } else {
        setSessionStats((prev) => ({ ...prev, revealedCount: prev.revealedCount + 1 }));
      }
    }

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
      setIsAdvancing(false);
    }
  };

  // Submit Answer in Cloze or Spelling mode
  const handleCheckAnswer = () => {
    if (!currentWord || hasCheckedAnswer || isAdvancing) return;
    const cleanGuess = userInput.trim().toLowerCase();
    const cleanTarget = currentWord.word.trim().toLowerCase();

    if (!cleanGuess) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 350);
      setFeedbackMessage({
        text: "Vui lòng nhập từ trước khi nhấn Enter!",
        type: "info",
      });
      inputRef.current?.focus();
      return;
    }

    const matched = cleanGuess === cleanTarget;

    if (matched) {
      // ---------------- CORRECT ----------------
      setIsCorrect(true);
      setFeedbackMessage({
        text: "Chính xác tuyệt đối! 🎉 Đang chuyển từ tiếp theo...",
        type: "success",
      });
      handleSpeak(currentWord.word);

      // Evaluate SM-2 quality based on wrong attempts and hint usage
      let quality = 5;
      if (wrongAttempts === 0 && !showHint) {
        quality = 5; // Easy / Perfect recall
        setSessionStats((prev) => ({
          ...prev,
          firstTryCorrect: prev.firstTryCorrect + 1,
        }));
      } else if (wrongAttempts === 1 && !showHint) {
        quality = 4; // Good (1 retry)
        setSessionStats((prev) => ({
          ...prev,
          retryCorrect: prev.retryCorrect + 1,
        }));
      } else {
        quality = 3; // Hard (2+ retries or used hint)
        setSessionStats((prev) => ({
          ...prev,
          retryCorrect: prev.retryCorrect + 1,
        }));
      }

      // Smooth auto-transition to next word
      setTimeout(() => {
        handleGrade(quality);
      }, 700);
    } else {
      // ---------------- INCORRECT ----------------
      const newAttempts = wrongAttempts + 1;
      setWrongAttempts(newAttempts);
      setIsCorrect(false);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 350);

      setSessionStats((prev) => ({
        ...prev,
        totalWrongAttempts: prev.totalWrongAttempts + 1,
      }));

      if (newAttempts >= 2) {
        setShowHint(true);
        setFeedbackMessage({
          text: `Chưa chính xác (đã thử sai ${newAttempts} lần). Hãy xem gợi ý, thử lại hoặc nhấn Xem kết quả / Bỏ qua.`,
          type: "error",
        });
      } else {
        setFeedbackMessage({
          text: `Chưa chính xác, hãy thử lại! (Lần ${newAttempts})`,
          type: "error",
        });
      }

      // Keep focus on input for immediate re-typing
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  };

  // User explicitly skips this word
  const handleSkip = () => {
    if (!currentWord || isAdvancing) return;
    setSessionStats((prev) => ({
      ...prev,
      skippedCount: prev.skippedCount + 1,
    }));
    // Skipped word gets quality 1 (Again: resets repetitions in SM-2)
    handleGrade(1);
  };

  // User explicitly asks to see result and detailed grammar/example
  const handleShowAnswer = () => {
    if (!currentWord || isAdvancing) return;
    setHasCheckedAnswer(true);
    setIsFlipped(true);
    setIsCorrect(false);
    setSessionStats((prev) => ({
      ...prev,
      revealedCount: prev.revealedCount + 1,
    }));
    handleSpeak(currentWord.word);
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionCompleted || isAdvancing) return;

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
        // Grading hotkeys: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy), Enter (Advance with Again)
        if (e.key === "1") handleGrade(1);
        else if (e.key === "2") handleGrade(3);
        else if (e.key === "3") handleGrade(4);
        else if (e.key === "4") handleGrade(5);
        else if (e.key === "Enter") handleGrade(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFlipped,
    currentIndex,
    sessionCompleted,
    currentWord,
    mode,
    hasCheckedAnswer,
    userInput,
    isAdvancing,
    wrongAttempts,
    showHint,
  ]);

  // Session Completed view with Learning Evaluation Metrics
  if (sessionCompleted) {
    const totalWords = wordsToReview.length || 1;
    const masteryPercent = Math.min(
      100,
      Math.round(
        ((sessionStats.firstTryCorrect * 1 + sessionStats.retryCorrect * 0.65) / totalWords) * 100
      )
    );

    let evaluationTitle = "Xuất sắc! Trí nhớ phản xạ rất nhanh 🌟";
    let evaluationDesc = "Bạn đã nhớ và gõ chính xác hầu hết từ vựng ngay từ lần đầu tiên.";
    let evaluationBadge = "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300";

    if (masteryPercent < 50) {
      evaluationTitle = "Cần củng cố thêm từ vựng 📚";
      evaluationDesc = "Nhiều từ cần xem lại hoặc thử lại. Hệ thống SM-2 sẽ lên lịch lặp lại sớm để giúp bạn ghi nhớ sâu.";
      evaluationBadge = "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300";
    } else if (masteryPercent < 80) {
      evaluationTitle = "Khá tốt! Phản xạ từ vựng ổn định 🎯";
      evaluationDesc = "Bạn đã hoàn thành tốt các câu hỏi sau một vài lần thử hoặc xem gợi ý.";
      evaluationBadge = "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300";
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-xl mx-auto text-center space-y-5 animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
          <Award className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Phiên ôn tập hoàn tất! 🎉
          </h2>
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            Bạn đã ôn tập thành công <span className="text-emerald-600 dark:text-emerald-400 font-bold">{reviewCount}</span> từ vựng.
          </p>
        </div>

        {/* Learning Evaluation Card */}
        <div className={`w-full p-4 rounded-2xl border text-left space-y-2 ${evaluationBadge}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <TrendingUp className="w-4 h-4" />
              Đánh giá mức độ ghi nhớ
            </span>
            <span className="text-base font-extrabold font-mono">
              {masteryPercent}%
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {evaluationTitle}
          </div>
          <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
            {evaluationDesc}
          </p>
        </div>

        {/* Detailed Breakdown Scorecard */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Đúng lần đầu</div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {sessionStats.firstTryCorrect} <span className="text-[10px] text-slate-400 font-normal">từ</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Đúng sau thử lại</div>
            <div className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono">
              {sessionStats.retryCorrect} <span className="text-[10px] text-slate-400 font-normal">từ</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Xem đáp án</div>
            <div className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono">
              {sessionStats.revealedCount} <span className="text-[10px] text-slate-400 font-normal">từ</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Bỏ qua / Sai</div>
            <div className="text-base font-bold text-slate-700 dark:text-zinc-300 font-mono">
              {sessionStats.skippedCount} <span className="text-[10px] text-slate-400 font-normal">từ</span>
            </div>
          </div>
        </div>

        {sessionStats.totalWrongAttempts > 0 && (
          <div className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
            Tổng số lần nhập sai trong phiên: <span className="text-rose-500 font-bold">{sessionStats.totalWrongAttempts}</span> lần
          </div>
        )}

        {lastResult && (
          <div className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Ease Factor</div>
              <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">{lastResult.easeFactor}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Next Interval</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">{lastResult.interval}d</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Reps</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">{lastResult.repetitions}</div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
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
        onClick={mode === "flip" ? () => setIsFlipped((prev) => !prev) : undefined}
        className={`w-full flex-1 my-auto min-h-[520px] h-[560px] md:h-[580px] max-h-[78vh] overflow-hidden rounded-3xl border bg-white dark:bg-zinc-950 p-5 md:p-6 shadow-xl dark:shadow-2xl flex flex-col justify-between transition-all relative ${
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
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800/80 pb-3 shrink-0">
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
          <div className="flex-1 min-h-0 flex flex-col justify-between">
            {!isFlipped ? (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center space-y-4 py-8">
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
                handleSpeak={handleSpeak}
                onFlipBack={() => setIsFlipped(false)}
              />
            )}
          </div>
        )}

        {/* ----------------- MODE 2: CLOZE DELETION ----------------- */}
        {mode === "cloze" && (
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

                    {/* Inline Feedback Banner */}
                    {feedbackMessage && (
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold text-center animate-in fade-in zoom-in-95 duration-150 ${
                          feedbackMessage.type === "success"
                            ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                            : feedbackMessage.type === "error"
                            ? "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                            : "bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                        }`}
                      >
                        {feedbackMessage.type === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                        <span>{feedbackMessage.text}</span>
                      </div>
                    )}

                    {/* Hint Box (Show if requested or wrongAttempts >= 2) */}
                    {(showHint || wrongAttempts >= 2) && (
                      <div className="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 flex-wrap">
                          <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>
                            Gợi ý: Bắt đầu bằng{" "}
                            <span className="font-mono font-bold text-amber-800 dark:text-amber-300 text-sm">
                              "{currentWord.word[0].toUpperCase()}"
                            </span>
                            , độ dài:{" "}
                            <span className="font-bold text-amber-800 dark:text-amber-300">
                              {currentWord.word.length} ký tự
                            </span>
                          </span>
                        </div>
                        {currentWord.phonetic && (
                          <span className="text-[11px] font-mono bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/40">
                            {currentWord.phonetic}
                          </span>
                        )}
                      </div>
                    )}

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
        )}

        {/* ----------------- MODE 3: SPELLING PRACTICE ----------------- */}
        {mode === "spelling" && (
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
                      Gõ từ và nhấn Enter. Đúng sẽ tự động chuyển, sai sẽ cho nhập lại.
                    </p>
                  </div>

                  {/* Audio & Clue Card */}
                  <div className="p-5 md:p-6 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-center space-y-3.5 max-w-lg mx-auto w-full shadow-inner shrink-0">
                    <button
                      onClick={() => handleSpeak(currentWord.word)}
                      className="mx-auto px-5 py-2 rounded-full bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 transition-all flex items-center gap-2 text-xs font-semibold shadow-xs hover:scale-105 active:scale-95"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Nghe phát âm</span>
                    </button>

                    {currentWord.phonetic && (
                      <div className="text-sm font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{currentWord.phonetic}</div>
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

                    {/* Inline Feedback Banner */}
                    {feedbackMessage && (
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold text-center animate-in fade-in zoom-in-95 duration-150 ${
                          feedbackMessage.type === "success"
                            ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                            : feedbackMessage.type === "error"
                            ? "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                            : "bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                        }`}
                      >
                        {feedbackMessage.type === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                        <span>{feedbackMessage.text}</span>
                      </div>
                    )}

                    {/* Hint Box */}
                    {(showHint || wrongAttempts >= 2) && (
                      <div className="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
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
                    )}

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
        )}

      </div>

      {/* BOTTOM ACTION BAR - Always present with fixed height (h-14) so card NEVER jumps */}
      <div className="w-full mt-3 h-14 shrink-0 flex items-center justify-center">
        {(mode === "flip" ? isFlipped : hasCheckedAnswer) ? (
          <div className="w-full grid grid-cols-4 gap-3 h-full animate-in slide-in-from-bottom-2 duration-150">
            {/* Again: Quality 1 */}
            <button
              onClick={() => handleGrade(1)}
              disabled={isAdvancing}
              className={`p-2 md:p-3 rounded-2xl border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm ${
                !isCorrect && mode !== "flip"
                  ? "border-rose-400 dark:border-rose-500 bg-rose-100 dark:bg-rose-900/60 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/30 font-bold"
                  : "border-rose-200 dark:border-rose-800/80 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium"
              }`}
            >
              <span className="font-bold">Again</span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400/80 font-mono">Quên (1 ↵)</span>
            </button>

            {/* Hard: Quality 3 */}
            <button
              onClick={() => handleGrade(3)}
              disabled={isAdvancing}
              className="p-2 md:p-3 rounded-2xl border border-amber-200 dark:border-amber-800/80 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-medium text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm"
            >
              <span className="font-bold">Hard</span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400/80 font-mono">Khó (2)</span>
            </button>

            {/* Good: Quality 4 */}
            <button
              onClick={() => handleGrade(4)}
              disabled={isAdvancing}
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
              disabled={isAdvancing}
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
            disabled={!userInput.trim() || isAdvancing}
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
            disabled={!userInput.trim() || isAdvancing}
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
 * Helper to highlight the target word inside an example sentence
 */
function highlightWord(text: string, targetWord: string) {
  if (!text || !targetWord) return text;
  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === targetWord.toLowerCase() ? (
      <span
        key={i}
        className="bg-cyan-100 text-cyan-800 dark:bg-cyan-500/25 dark:text-cyan-200 font-bold px-1.5 py-0.5 rounded border border-cyan-300/80 dark:border-cyan-500/40"
      >
        {part}
      </span>
    ) : (
      part
    )
  );
}

/**
 * Subcomponent to render revealed word details (Vietnamese meaning, code examples & grammar analysis)
 */
function RevealedWordContent({
  currentWord,
  handleSpeak,
  onFlipBack,
  compact = false,
}: {
  currentWord: WordDetail;
  handleSpeak: (text: string, e?: React.MouseEvent) => void;
  onFlipBack?: () => void;
  compact?: boolean;
}) {
  const hasExamples = Boolean(currentWord.examples && currentWord.examples.length > 0);

  return (
    <div
      className={`flex flex-col ${
        compact ? "space-y-3" : "flex-1 min-h-0 justify-between h-full"
      } animate-in fade-in duration-200`}
    >
      {/* Top Header Section */}
      <div className="space-y-2 shrink-0 pb-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white capitalize font-mono">
              {currentWord.word}
            </h3>
            {currentWord.phonetic && (
              <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-200/60 dark:border-cyan-800/40">
                {currentWord.phonetic}
              </span>
            )}
            <button
              onClick={(e) => handleSpeak(currentWord.word, e)}
              className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
              title="Phát âm từ vựng"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!compact && (
              <button
                onClick={(e) => {
                  if (onFlipBack) {
                    e.stopPropagation();
                    onFlipBack();
                  }
                }}
                className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 flex items-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 px-2.5 py-1 rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 transition-colors"
                title="Lật thẻ về mặt trước"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Click thẻ để lật lại</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Vietnamese Meaning Header Pill */}
        <div className="px-3.5 py-2 rounded-xl bg-cyan-50/90 dark:bg-cyan-950/50 border border-cyan-200/80 dark:border-cyan-800/60 flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-cyan-800 dark:text-cyan-400 font-bold uppercase tracking-wider">
              Nghĩa tiếng Việt:
            </span>
            <span className="text-sm md:text-base font-semibold text-cyan-950 dark:text-cyan-100">
              {currentWord.meaning_vn}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Examples & Grammar Analysis taking full card height */}
      <div
        className={
          compact
            ? "space-y-3 py-1"
            : "flex-1 min-h-0 h-full overflow-y-auto pr-1 py-2 space-y-3 scrollbar-thin"
        }
      >
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-700 dark:text-cyan-400 font-bold uppercase tracking-wider pt-0.5">
          <Code2 className="w-3.5 h-3.5" />
          <span>Ví dụ & Phân tích ngữ pháp ({currentWord.examples?.length || 0}):</span>
        </div>

        {hasExamples ? (
          <div className="space-y-3">
            {currentWord.examples.map((ex, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-slate-50 dark:bg-zinc-900/90 p-4 border border-slate-200 dark:border-zinc-800/80 space-y-2.5 shadow-2xs hover:border-cyan-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-zinc-100 font-mono leading-relaxed">
                    "{highlightWord(ex.sentence_en, currentWord.word)}"
                  </p>
                  <button
                    onClick={(e) => handleSpeak(ex.sentence_en, e)}
                    title="Nghe câu ví dụ"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {ex.sentence_vn && (
                  <p className="text-xs md:text-sm text-cyan-800 dark:text-cyan-300 italic leading-relaxed bg-cyan-50/60 dark:bg-cyan-950/30 px-3 py-2 rounded-xl border border-cyan-100 dark:border-cyan-900/40">
                    {ex.sentence_vn}
                  </p>
                )}

                {ex.grammar_analysis && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Cú pháp & Phân tích ngữ pháp:</span>
                    </div>
                    <div className="text-xs md:text-[13px] text-slate-800 dark:text-zinc-200 font-mono leading-relaxed bg-amber-50/70 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
                      {ex.grammar_analysis}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 dark:text-zinc-500 space-y-2">
            <Code2 className="w-10 h-10 mx-auto opacity-40 text-cyan-500" />
            <p className="text-sm">Chưa có câu ví dụ và phân tích ngữ pháp cho từ này.</p>
          </div>
        )}
      </div>
    </div>
  );
}
