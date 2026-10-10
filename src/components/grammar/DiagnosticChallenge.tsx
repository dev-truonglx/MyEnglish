import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from "react";
import { GRAMMAR_PASS_SCORE } from "@/services/grammarService";
import { handleSpeak } from "@/components/review/speech";
import {
  Volume2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  BookOpen,
  RotateCcw,
  Zap,
  Flame,
  Lightbulb,
  Loader2,
  Layers,
  Bot,
  SkipForward,
} from "lucide-react";
import type { GrammarExercise, GrammarLesson } from "@/types/grammar";
import {
  recordDiagnosticResult,
  recordPracticeResult,
  mineGrammarExercisesFromVocabulary,
  saveCustomGrammarExercises,
  getCustomGrammarExercises,
  smartPrepareGrammarExercises,
  recordGrammarExerciseAttempt,
} from "@/services/grammarService";
import { isGrammarAnswerCorrect } from "@/services/smartReview";
import { generateGrammarExercisesWithGemini } from "@/services/ai";
import SyntaxHighlighter from "./SyntaxHighlighter";

interface DiagnosticChallengeProps {
  lesson: GrammarLesson;
  isDiagnosticMode?: boolean; // true = diagnostic test first, false = practice drill
  onViewHandbook: () => void;
  onNextLesson?: () => void;
}

export default function DiagnosticChallenge({
  lesson,
  isDiagnosticMode = true,
  onViewHandbook,
  onNextLesson,
}: DiagnosticChallengeProps) {
  const [exerciseList, setExerciseList] = useState<GrammarExercise[]>([]);
  // False until custom exercises are merged, so the question order never changes under the user
  const [isListReady, setIsListReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [selectedWordToken, setSelectedWordToken] = useState<string | null>(null);
  const [isEvaluated, setIsEvaluated] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSkipped, setIsSkipped] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [showHint, setShowHint] = useState(false);
  // First-attempt outcome per exercise id; retries never change the score
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>({});
  const [isCompletedAll, setIsCompletedAll] = useState(false);
  const [earnedXP, setEarnedXP] = useState(0);

  // Ref to automatically focus text input when questions require typing
  const textInputRef = useRef<HTMLInputElement>(null);

  // Timestamp to prevent double-skipping when submitting via Enter key
  const lastEvaluatedTime = useRef<number>(0);
  // Guards against advancing / finishing twice (keyboard + click, double Enter)
  const advancingRef = useRef(false);
  const finishedRef = useRef(false);

  // Dynamic extension states (Sentence Mining & AI Generation)
  const [isMining, setIsMining] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);

  const resetQuestionState = useCallback(() => {
    setSelectedOption(null);
    setTypedAnswer("");
    setSelectedWordToken(null);
    setIsEvaluated(false);
    setIsCorrect(null);
    setIsSkipped(false);
    setShowHint(false);
  }, []);

  // Build the full list (static + saved custom exercises) before showing the first question
  const loadExerciseList = useCallback(
    (isCancelled: () => boolean = () => false) => {
      const base = isDiagnosticMode ? lesson.diagnosticExercises : lesson.practiceExercises;
      setIsListReady(false);
      setExerciseList([]);
      setCurrentIndex(0);
      setOutcomes({});
      setSkippedIds(new Set());
      setIsCompletedAll(false);
      setEarnedXP(0);
      finishedRef.current = false;
      advancingRef.current = false;
      resetQuestionState();

      getCustomGrammarExercises(lesson.id)
        .catch(() => [] as GrammarExercise[])
        .then((saved) => {
          if (isCancelled()) return;
          const existingIds = new Set(base.map((e) => e.id));
          const customToAdd = (saved || []).filter((s) => !existingIds.has(s.id));
          setExerciseList(smartPrepareGrammarExercises([...base, ...customToAdd]));
          setCurrentIndex(0);
          resetQuestionState();
          setIsListReady(true);
        });
    },
    [lesson.id, isDiagnosticMode, lesson.diagnosticExercises, lesson.practiceExercises, resetQuestionState]
  );

  // Reset everything on lesson / mode change and hydrate saved exercises with the smart algorithm
  useEffect(() => {
    let cancelled = false;
    loadExerciseList(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadExerciseList]);

  const currentExercise: GrammarExercise | undefined = exerciseList[currentIndex];

  // Reset current question UI state on step change
  useEffect(() => {
    resetQuestionState();
    advancingRef.current = false;
  }, [currentIndex, lesson.id, resetQuestionState]);

  // Tự động focus vào ô nhập text khi hiển thị bài tập dạng gõ (conjugation / sentence_transform)
  useEffect(() => {
    if (
      !isEvaluated &&
      !isCompletedAll &&
      currentExercise &&
      (currentExercise.type === "conjugation" || currentExercise.type === "sentence_transform")
    ) {
      const focusInput = () => {
        textInputRef.current?.focus();
      };
      focusInput();
      const t1 = setTimeout(focusInput, 50);
      const t2 = setTimeout(focusInput, 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [currentIndex, isEvaluated, isCompletedAll, currentExercise]);

  // The diagnostic is scored on the lesson's own curated questions only: saved AI / mined questions
  // added to the list are extra practice (unchecked content must not decide the level of a lesson)
  const scoredList = useMemo(() => {
    if (!isDiagnosticMode) return exerciseList;
    const curated = new Set(lesson.diagnosticExercises.map((e) => e.id));
    return exerciseList.filter((e) => curated.has(e.id));
  }, [exerciseList, isDiagnosticMode, lesson.diagnosticExercises]);

  const correctCount = useMemo(
    () => scoredList.reduce((n, ex) => n + (outcomes[ex.id] ? 1 : 0), 0),
    [scoredList, outcomes]
  );

  // Append new exercises after the current question without reshuffling what the user already saw
  const appendExercises = useCallback(
    (incoming: GrammarExercise[]) => {
      setExerciseList((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const toAdd = incoming.filter((m) => !existingIds.has(m.id));
        if (toAdd.length === 0) return prev;
        const head = prev.slice(0, currentIndex + 1);
        const tail = prev.slice(currentIndex + 1);
        return [...head, ...smartPrepareGrammarExercises([...tail, ...toAdd])];
      });
    },
    [currentIndex]
  );

  const speakText = useCallback((text: string) => handleSpeak(text, 0.95), []);

  // Split sentence for error_spotting clickable tokens
  const wordsForErrorSpotting = useMemo(() => {
    if (!currentExercise || currentExercise.type !== "error_spotting") return [];
    const hasBrackets = /\[(.*?)\]/.test(currentExercise.promptEn);
    if (hasBrackets) {
      const regex = /\[(.*?)\]|(\S+)/g;
      const tokens: Array<{ raw: string; text: string; isTargetable: boolean }> = [];
      let match;
      while ((match = regex.exec(currentExercise.promptEn)) !== null) {
        if (match[1]) {
          tokens.push({ raw: match[0], text: match[1], isTargetable: true });
        } else if (match[2]) {
          tokens.push({ raw: match[0], text: match[2], isTargetable: false });
        }
      }
      return tokens;
    }

    // Fallback: If no brackets, check options
    const optSet = new Set((currentExercise.options || []).map((o) => o.toLowerCase().trim()));
    const regex = /(\S+)/g;
    const tokens: Array<{ raw: string; text: string; isTargetable: boolean }> = [];
    let match;
    while ((match = regex.exec(currentExercise.promptEn)) !== null) {
      const cleanWord = match[1].toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, "");
      const isTargetable = optSet.size > 0 ? optSet.has(cleanWord) : cleanWord.length > 0;
      tokens.push({ raw: match[1], text: match[1], isTargetable });
    }
    return tokens;
  }, [currentExercise]);

  const evaluateAnswer = useCallback(
    async (userAnswer: string) => {
      if (isEvaluated || !currentExercise) return;

      // Answer alone or the whole filled-in sentence; contractions, case and punctuation ignored
      const correct = isGrammarAnswerCorrect(userAnswer, currentExercise);
      setIsCorrect(correct);
      setIsEvaluated(true);
      lastEvaluatedTime.current = Date.now();

      // Only the first attempt per exercise counts towards score and history
      const exId = currentExercise.id;
      if (!(exId in outcomes)) {
        recordGrammarExerciseAttempt(exId, correct);
        setOutcomes((prev) => (exId in prev ? prev : { ...prev, [exId]: correct }));
      }

      if (correct) {
        speakText(currentExercise.promptEn.replace(/\[|\]/g, ""));
      }
    },
    [isEvaluated, currentExercise, outcomes, speakText]
  );

  const handleSelectOption = (opt: string) => {
    if (isEvaluated) return;
    setSelectedOption(opt);
    evaluateAnswer(opt);
  };

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!typedAnswer.trim()) return;
    evaluateAnswer(typedAnswer);
  };

  const handleSelectWordToken = (tokenText: string) => {
    if (isEvaluated) return;
    setSelectedWordToken(tokenText);
    evaluateAnswer(tokenText);
  };

  const handleSkipQuestion = useCallback(() => {
    if (isEvaluated || !currentExercise) return;

    setIsSkipped(true);
    setIsCorrect(false);
    setIsEvaluated(true);
    lastEvaluatedTime.current = Date.now();

    const exId = currentExercise.id;
    if (!(exId in outcomes)) {
      recordGrammarExerciseAttempt(exId, false, true);
      setOutcomes((prev) => (exId in prev ? prev : { ...prev, [exId]: false }));
    }
    setSkippedIds((prev) => new Set([...prev, exId]));
  }, [isEvaluated, currentExercise, outcomes]);

  const handleNextQuestion = useCallback(async () => {
    if (!isEvaluated || advancingRef.current || finishedRef.current) return;
    advancingRef.current = true;

    if (currentIndex + 1 < exerciseList.length) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    finishedRef.current = true;
    setIsCompletedAll(true);
    const total = scoredList.length;
    const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passedFirstTry = total > 0 && correctCount === total;

    try {
      if (isDiagnosticMode) {
        const res = await recordDiagnosticResult(lesson.id, passedFirstTry, scorePercent);
        setEarnedXP(res.xpEarned);
      } else {
        const res = await recordPracticeResult(lesson.id, scorePercent);
        setEarnedXP(res.xpEarned);
      }
    } finally {
      advancingRef.current = false;
    }
  }, [isEvaluated, currentIndex, exerciseList.length, scoredList.length, correctCount, isDiagnosticMode, lesson.id]);

  const handleRestart = useCallback(() => {
    loadExerciseList();
  }, [loadExerciseList]);

  // Keyboard shortcuts: 1-4 for options; Enter / Space to advance question or finish
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A focused button already handles Enter/Space via its native click
      const target = e.target as HTMLElement | null;
      if ((e.key === "Enter" || e.key === " ") && target?.closest?.("button")) return;
      if (e.repeat) return;

      // 1. Completion screen: Enter to advance to next lesson or retry
      if (isCompletedAll) {
        if (e.key === "Enter") {
          e.preventDefault();
          const scorePercent = scoredList.length > 0 ? Math.round((correctCount / scoredList.length) * 100) : 0;
          if (onNextLesson && scorePercent >= GRAMMAR_PASS_SCORE) {
            onNextLesson();
          } else {
            handleRestart();
          }
        }
        return;
      }

      if (!currentExercise) return;

      // 2. Evaluated state: Enter or Space moves to next question
      if (isEvaluated) {
        if (e.key === "Enter" || e.key === " ") {
          // Debounce to prevent accidental double-action if Enter was used to submit text input
          if (Date.now() - lastEvaluatedTime.current < 250) {
            return;
          }
          e.preventDefault();
          handleNextQuestion();
        }
        return;
      }

      // 3. Un-evaluated state: 1, 2, 3, 4 for options (not while typing an answer)
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (currentExercise.options && currentExercise.options.length > 0) {
        if (["1", "2", "3", "4"].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (currentExercise.options[idx]) {
            e.preventDefault();
            handleSelectOption(currentExercise.options[idx]);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isEvaluated,
    isCompletedAll,
    currentExercise,
    scoredList.length,
    correctCount,
    onNextLesson,
    handleNextQuestion,
    handleRestart,
  ]);

  const handleRetryCurrent = () => {
    // Cho phép người dùng thử lại câu này để luyện tập
    setSelectedOption(null);
    setTypedAnswer("");
    setSelectedWordToken(null);
    setIsEvaluated(false);
    setIsCorrect(null);
    setIsSkipped(false);
    if (
      currentExercise &&
      (currentExercise.type === "conjugation" || currentExercise.type === "sentence_transform")
    ) {
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  };

  // Hướng 2: Sentence Mining từ kho từ vựng cá nhân
  const handleMineSentences = async () => {
    if (isMining) return;
    setIsMining(true);
    try {
      const mined = await mineGrammarExercisesFromVocabulary(lesson.id);
      if (mined.length > 0) {
        // Lưu vĩnh viễn vào SQLite
        await saveCustomGrammarExercises(lesson.id, mined);
        appendExercises(mined);
        setSourceNotice(`✨ Đã khai thác và lưu vào database ${mined.length} câu ví dụ từ kho từ vựng của bạn! (0 token)`);
        setTimeout(() => setSourceNotice(null), 5000);
      } else {
        setSourceNotice("Chưa có từ vựng nào trong kho khớp với thì này. Hãy thêm từ vựng mới hoặc thử sinh bằng AI!");
        setTimeout(() => setSourceNotice(null), 5000);
      }
    } catch {
      setSourceNotice("Không thể đọc kho từ vựng SQLite.");
      setTimeout(() => setSourceNotice(null), 4000);
    } finally {
      setIsMining(false);
    }
  };

  // Hướng 1: Sinh bài tập động bằng Gemini CLI (Tối ưu token & Lưu vĩnh viễn vào SQLite)
  const handleGenerateAI = async () => {
    if (isGeneratingAI) return;
    setIsGeneratingAI(true);
    try {
      const aiQuestions = await generateGrammarExercisesWithGemini(lesson.title, lesson.level);
      if (aiQuestions.length > 0) {
        // Lưu vĩnh viễn vào SQLite để không phải gọi AI lại lần sau!
        await saveCustomGrammarExercises(lesson.id, aiQuestions);
        appendExercises(aiQuestions);
        setSourceNotice(`🤖 Gemini Flash đã tạo và lưu vĩnh viễn vào database ${aiQuestions.length} câu hỏi mới!`);
        setTimeout(() => setSourceNotice(null), 5000);
      } else {
        setSourceNotice("Không nhận được câu hỏi từ AI. Vui lòng thử lại!");
        setTimeout(() => setSourceNotice(null), 4000);
      }
    } catch {
      setSourceNotice("Lỗi khi gọi Gemini CLI. Hãy kiểm tra kết nối mạng hoặc CLI binary.");
      setTimeout(() => setSourceNotice(null), 5000);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  if (!isListReady) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
        <span>Đang chuẩn bị bộ câu hỏi...</span>
      </div>
    );
  }

  if (!currentExercise && !isCompletedAll) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-zinc-400">
        Không tìm thấy bài tập cho bài học này.
      </div>
    );
  }

  // Completion Screen
  if (isCompletedAll) {
    const total = scoredList.length;
    const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = scorePercent >= GRAMMAR_PASS_SCORE;
    const skippedCount = exerciseList.filter((e) => skippedIds.has(e.id)).length;
    const unmastered = exerciseList.filter((e) => !outcomes[e.id]);

    return (
      <div className="max-w-xl mx-auto p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="inline-flex p-4 rounded-full bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
          {passed ? <Sparkles className="w-10 h-10 animate-bounce" /> : <Flame className="w-10 h-10 text-orange-400" />}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {passed ? "Hoàn Thành Xuất Sắc!" : "Cần Củng Cố Thêm!"}
          </h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400">
            {passed
              ? `Bạn đã hoàn thành bộ câu hỏi bài "${lesson.titleVn}"!`
              : `Bạn đã hoàn thành bài làm. Hãy xem lại sổ tay công thức để nắm vững hơn nhé.`}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md mx-auto">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60">
            <span className="text-xs text-slate-500 dark:text-zinc-400">Điểm số</span>
            <div className="text-xl font-bold text-slate-800 dark:text-zinc-100">
              {correctCount}/{total} ({scorePercent}%)
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40">
            <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-amber-500" /> Kinh nghiệm
            </span>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-300">+{earnedXP} XP</div>
          </div>
          {skippedCount > 0 ? (
            <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 col-span-2 sm:col-span-1">
              <span className="text-xs text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1">
                <SkipForward className="w-3.5 h-3.5" /> Bỏ qua
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-300">
                {skippedCount} câu
              </div>
            </div>
          ) : null}
        </div>

        {skippedCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 text-left max-w-md mx-auto">
            <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Đã lưu {skippedCount} câu bạn đã bỏ qua!</p>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                Hệ thống đã lưu lại đánh giá để ưu tiên gợi ý các câu này trong các đợt ôn luyện tiếp theo.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 flex-wrap">
          {unmastered.length > 0 && (
            <button
              onClick={() => {
                setExerciseList(smartPrepareGrammarExercises(unmastered));
                setCurrentIndex(0);
                setOutcomes({});
                setSkippedIds(new Set());
                setIsCompletedAll(false);
                finishedRef.current = false;
                advancingRef.current = false;
                resetQuestionState();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-xs shadow-md shadow-amber-500/20 hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ôn Lại Câu Chưa Làm Được ({unmastered.length})</span>
            </button>
          )}

          <button
            onClick={handleRestart}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition flex items-center justify-center gap-2 shadow-sm"
          >
            <RotateCcw className="w-4 h-4 text-cyan-500" />
            <span>Làm Lại Toàn Bộ</span>
          </button>

          <button
            onClick={onViewHandbook}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-cyan-500" />
            <span>Xem Sổ Tay Công Thức</span>
          </button>

          {onNextLesson && (
            <button
              onClick={onNextLesson}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-xs font-semibold hover:opacity-95 shadow-md shadow-cyan-500/20 transition flex items-center justify-center gap-2"
            >
              <span>Bài Tiếp Theo</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white/20 rounded">Enter ↵</kbd>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const isMinedExercise = currentExercise.id.startsWith("mined-");
  const isAIGenerated = currentExercise.id.startsWith("ai-gen-");

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in duration-200">
      {/* Header bar: Progress + Mode badge + Dynamic generators */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/50">
            <Zap className="w-3 h-3 text-cyan-500" />
            <span>{isDiagnosticMode ? "Kiểm tra chẩn đoán" : "Luyện tập củng cố"}</span>
          </span>
          <span className="text-slate-500 dark:text-zinc-400 font-mono">
            Câu {currentIndex + 1} / {exerciseList.length}
          </span>
        </div>

        {/* Dynamic Source Actions (Sentence Mining & AI Generator) */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleMineSentences}
            disabled={isMining}
            className="px-2.5 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition flex items-center gap-1 disabled:opacity-50"
            title="Lấy câu ví dụ thực tế từ kho từ vựng SQLite của bạn (0 token)"
          >
            {isMining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
            <span>Kho câu từ vựng (0 token)</span>
          </button>

          <button
            onClick={handleGenerateAI}
            disabled={isGeneratingAI}
            className="px-2.5 py-1.5 rounded-xl border border-cyan-300 dark:border-cyan-800/60 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 text-[11px] font-semibold hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition flex items-center gap-1 disabled:opacity-50"
            title="Sinh thêm câu hỏi mới bằng Gemini Flash CLI"
          >
            {isGeneratingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
            <span>Sinh câu AI</span>
          </button>
        </div>
      </div>

      {/* Dynamic Source Notification Banner */}
      {sourceNotice && (
        <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-800 dark:text-cyan-300 flex items-center gap-2 animate-in fade-in duration-200">
          <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
          <span>{sourceNotice}</span>
        </div>
      )}

      {/* Progress Line */}
      <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / exerciseList.length) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-6 md:p-8 shadow-sm space-y-6">
        {/* Origin tag if mined or AI */}
        {isMinedExercise && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
            <Layers className="w-3 h-3" />
            <span>Khai thác từ kho từ vựng cá nhân của bạn</span>
          </div>
        )}
        {isAIGenerated && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">
            <Bot className="w-3 h-3" />
            <span>Sinh tự động bởi Gemini Flash AI</span>
          </div>
        )}

        {/* Prompt Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-zinc-100 leading-snug">
              {currentExercise.type === "error_spotting" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {wordsForErrorSpotting.map((tok, idx) => {
                    if (tok.isTargetable) {
                      const isSelected = selectedWordToken === tok.text;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectWordToken(tok.text)}
                          disabled={isEvaluated}
                          className={`px-2 py-0.5 rounded-lg border font-mono font-medium transition-all ${
                            isSelected
                              ? isCorrect
                                ? "bg-emerald-100 dark:bg-emerald-950/80 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-400"
                                : "bg-rose-100 dark:bg-rose-950/80 border-rose-500 text-rose-800 dark:text-rose-300 ring-2 ring-rose-400"
                              : "bg-slate-100 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-cyan-400 hover:bg-cyan-50/50"
                          }`}
                        >
                          {tok.text}
                        </button>
                      );
                    }
                    return <span key={idx}>{tok.text}</span>;
                  })}
                </div>
              ) : (
                <span>{currentExercise.promptEn}</span>
              )}
            </h3>

            <button
              onClick={() => speakText(currentExercise.promptEn.replace(/\[|\]/g, ""))}
              className="p-2 rounded-xl text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition shrink-0"
              title="Nghe phát âm chuẩn"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          {currentExercise.promptVn && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 italic">
              {currentExercise.promptVn}
            </p>
          )}
        </div>

        {/* Interaction Area */}
        <div className="space-y-3">
          {/* 1. Multiple Choice & Option-based Questions */}
          {((currentExercise.type === "multiple_choice" || currentExercise.type === "error_spotting") &&
            currentExercise.options &&
            currentExercise.options.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentExercise.options.map((opt, idx) => {
                const isSelected = selectedOption === opt;
                let btnStyle =
                  "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/40 text-slate-800 dark:text-zinc-200 hover:border-cyan-400 hover:bg-cyan-50/30";

                if (isEvaluated) {
                  const normOpt = opt.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, "");
                  const isAnswerCorrect =
                    (Array.isArray(currentExercise.correctAnswer)
                      ? currentExercise.correctAnswer.map((a) =>
                          a.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, "")
                        )
                      : [
                          currentExercise.correctAnswer
                            .toLowerCase()
                            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, ""),
                        ]
                    ).includes(normOpt) ||
                    (currentExercise.errorWord &&
                      currentExercise.errorWord
                        .toLowerCase()
                        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, "") === normOpt);

                  if (isAnswerCorrect) {
                    btnStyle =
                      "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-400";
                  } else if (isSelected) {
                    btnStyle =
                      "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 ring-2 ring-rose-400";
                  } else {
                    btnStyle = "opacity-50 border-slate-200 dark:border-zinc-800";
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    disabled={isEvaluated}
                    className={`w-full p-3.5 rounded-2xl border text-left text-xs md:text-sm font-medium transition-all flex items-center justify-between group ${btnStyle}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-xs font-mono font-semibold text-slate-500 group-hover:text-cyan-500">
                        {idx + 1}
                      </span>
                      <span>{opt}</span>
                    </div>

                    {isEvaluated && isSelected && (
                      <span>
                        {isCorrect ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 2. Text Input for Conjugation & Sentence Transform */}
          {(currentExercise.type === "conjugation" || currentExercise.type === "sentence_transform") && (
            <form onSubmit={handleTextSubmit} className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  key={currentExercise.id}
                  ref={textInputRef}
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  disabled={isEvaluated}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-gramm="false"
                  data-enable-grammarly="false"
                  data-lpignore="true"
                  placeholder={
                    currentExercise.type === "conjugation"
                      ? "Nhập từ cần điền (xem gợi ý trong ngoặc)..."
                      : "Viết lại câu hoàn chỉnh..."
                  }
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
                />
                {!isEvaluated ? (
                  <>
                    <button
                      type="submit"
                      disabled={!typedAnswer.trim()}
                      className="px-5 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-cyan-500/20 transition shrink-0"
                    >
                      Kiểm Tra
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipQuestion}
                      className="px-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs"
                      title="Bỏ qua câu hỏi này nếu bạn chưa biết đáp án"
                    >
                      <SkipForward className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                      <span>Bỏ qua</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleRetryCurrent}
                    className="px-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition shrink-0"
                    title="Làm lại câu này"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          )}

          {/* 3. Error Spotting */}
          {currentExercise.type === "error_spotting" && !isEvaluated && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pt-1">
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              <span>Click trực tiếp vào từ ngữ bạn cho là bị sai ngữ pháp trong câu trên.</span>
            </p>
          )}
        </div>

        {/* Action row: Hint & Skip button (for multiple choice and error spotting) */}
        {!isEvaluated && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              {currentExercise.hint && (
                !showHint ? (
                  <button
                    type="button"
                    onClick={() => setShowHint(true)}
                    className="text-xs text-slate-400 hover:text-cyan-500 flex items-center gap-1 transition"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Xem gợi ý cấu trúc</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{currentExercise.hint}</span>
                  </div>
                )
              )}
            </div>

            {(currentExercise.type === "multiple_choice" || currentExercise.type === "error_spotting") && (
              <button
                type="button"
                onClick={handleSkipQuestion}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-medium transition flex items-center gap-1.5 ml-auto shadow-2xs"
                title="Bỏ qua câu hỏi này nếu bạn chưa biết đáp án"
              >
                <SkipForward className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                <span>Bỏ qua (Chưa biết)</span>
              </button>
            )}
          </div>
        )}

        {/* Diagnostic Explanation Card */}
        {isEvaluated && (
          <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-zinc-800/80 animate-in fade-in-50 duration-200">
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                isSkipped
                  ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300"
                  : isCorrect
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {isSkipped ? (
                  <>
                    <HelpCircle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <span className="text-xs md:text-sm font-semibold block">
                        Đã bỏ qua câu này!
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400/90 block">
                        Đã ghi nhận để nhắc bạn ôn luyện lại. Hãy xem phân tích chi tiết bên dưới:
                      </span>
                    </div>
                  </>
                ) : isCorrect ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-xs md:text-sm font-semibold">
                      Chính xác! Bạn đã hiểu đúng quy tắc ngữ pháp.
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                    <span className="text-xs md:text-sm font-semibold">
                      Chưa chính xác! Hãy xem phân tích bên dưới.
                    </span>
                  </>
                )}
              </div>

              <button
                onClick={handleNextQuestion}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 transition flex items-center gap-2 shrink-0 shadow-sm"
              >
                <span>Câu Tiếp Theo</span>
                <kbd className="hidden sm:inline-flex items-center text-[10px] opacity-75 font-mono bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded border border-white/20 dark:border-black/20">
                  Enter ↵
                </kbd>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  Đáp Án & Phân Tích Chuyên Sâu
                </span>
                <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  Đáp án chuẩn: {Array.isArray(currentExercise.correctAnswer) ? currentExercise.correctAnswer.join(" / ") : currentExercise.correctAnswer}
                </span>
              </div>

              <p className="text-xs md:text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                {currentExercise.explanation}
              </p>

              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                  📐 Công thức cốt lõi:
                </span>
                <div className="font-mono text-xs text-slate-800 dark:text-zinc-200 font-medium">
                  {lesson.formula.positive}
                </div>
              </div>

              {currentExercise.breakdown && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Phân tích cú pháp:
                  </span>
                  <SyntaxHighlighter tokens={currentExercise.breakdown} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
