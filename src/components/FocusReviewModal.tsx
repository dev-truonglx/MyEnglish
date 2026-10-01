import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Volume2,
  Clock,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowRight,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { getAllWords } from "@/services/db";
import { getDueWords, recordReview, Rating } from "@/services/srs";
import { recordDailyActivity } from "@/services/streak";
import {
  getReminderSettings,
  snoozeReminder,
  hideReviewPopup,
  recordPopupDisplayed,
  type ReminderSettings,
} from "@/services/reminderSettings";
import type { WordDetail } from "@/types/database";

interface FocusReviewModalProps {
  onClose?: () => void;
  isPreview?: boolean;
}

interface ChoiceOption {
  id: string;
  word: string;
  isCorrect: boolean;
}

/**
 * Trích xuất định nghĩa tiếng Việt ngắn gọn, súc tích và loại bỏ hoàn toàn việc lộ từ tiếng Anh
 */
export function getConciseMeaning(meaning: string, targetWord?: string): string {
  if (!meaning) return "";
  let text = meaning.trim();

  // 1. Kiểm tra cấu trúc: "Thuật ngữ (word): giải thích..." -> Lấy ngay phần "Thuật ngữ" đầu tiên
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    let head = text.substring(0, colonIdx).trim();
    if (targetWord) {
      head = head.replace(new RegExp(`\\s*\\([^)]*${escapeRegExp(targetWord)}[^)]*\\)`, "gi"), "");
      head = head.replace(new RegExp(`['"‘“\\[\\(]?${escapeRegExp(targetWord)}['"’”\\]\\)]?`, "gi"), "");
    }
    head = head.trim();
    if (head.length >= 3 && /[a-zà-ỹ]/i.test(head)) {
      return capitalize(head);
    }
  }

  // 2. Nếu có cụm tóm tắt trong ngoặc ngay sau từ tiếng Anh, ví dụ: 'dashboard' (bảng điều khiển trực quan)
  if (targetWord) {
    const bracketRegex = new RegExp(`${escapeRegExp(targetWord)}['"’”]?\\s*\\(([^)]{3,40})\\)`, "i");
    const bracketMatch = text.match(bracketRegex);
    if (bracketMatch && bracketMatch[1]) {
      const cand = bracketMatch[1].trim();
      if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(cand)) {
        return capitalize(cand);
      }
    }
  }

  // 3. Xoá bỏ triệt để từ tiếng Anh mục tiêu và các biến thể trong nháy đơn/ngoặc
  if (targetWord) {
    text = text.replace(new RegExp(`['"‘“]${escapeRegExp(targetWord)}['"’”]?`, "gi"), "");
    text = text.replace(new RegExp(`\\b${escapeRegExp(targetWord)}(?:s|es|ed|ing|d)?\\b`, "gi"), "");
  }

  // 4. Lọc bỏ các cụm từ mở đầu rườm rà
  text = text.replace(/^(Trong [^,.:;]+[,:;]?\s*)/gi, "");
  text = text.replace(/^(Trong [^,.:;]+[,:;]?\s*)/gi, ""); // Chạy lại nếu có 2 mệnh đề lồng nhau
  text = text.replace(/^(từ này|nó)?\s*(mang nghĩa là|có nghĩa là|dùng để chỉ|dùng để|là một|là)\s*/gi, "");

  // 5. Xử lý mở đầu bằng ngoặc, ví dụ: "(bảng điều khiển trực quan) là..."
  const bracketLead = text.match(/^\(([^)]+)\)\s*(là|mang nghĩa là)?\s*/i);
  if (bracketLead) {
    text = bracketLead[1].trim() + (text.substring(bracketLead[0].length).trim() ? ": " + text.substring(bracketLead[0].length).trim() : "");
  }

  // 6. Xoá các cụm ví dụ trong ngoặc như "(ví dụ: ...)", "(ngược lại với...)", "(e.g...)"
  text = text.replace(/\s*\((?:ví dụ|vd|e\.g\.|đối lập|ngược lại)[^)]*\)/gi, "");

  // 7. Lấy câu hoặc mệnh đề đầu tiên
  const sentences = text.split(/[.\n]/);
  let firstSentence = sentences[0]?.trim() || text;

  // Nếu câu đầu tiên vẫn quá dài (> 80 ký tự), tìm mệnh đề cô đọng
  if (firstSentence.length > 80) {
    const parenSummary = firstSentence.match(/\(([^)]{3,45})\)$/);
    if (parenSummary && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(parenSummary[1])) {
      firstSentence = parenSummary[1];
    } else {
      const clauses = firstSentence.split(";");
      if (clauses[0] && clauses[0].trim().length >= 15) {
        firstSentence = clauses[0].trim();
      } else {
        const firstComma = firstSentence.indexOf(",");
        if (firstComma > 25) {
          firstSentence = firstSentence.substring(0, firstComma).trim();
        }
      }
    }
  }

  // 8. Dọn dẹp khoảng trắng và dấu câu thừa
  firstSentence = firstSentence.replace(/\s+/g, " ");
  firstSentence = firstSentence.replace(/^[,:;\-–\s.()]+/g, "");
  firstSentence = firstSentence.replace(/[,:;\-–\s.]+$/g, "");

  return capitalize(firstSentence);
}

/**
 * Ẩn từ vựng trong câu ví dụ thành chỗ trống `______`
 */
export function maskWordInSentence(sentence: string, word: string): string {
  if (!sentence || !word) return sentence;
  const escaped = escapeRegExp(word);
  const regex = new RegExp(`\\b${escaped}(?:s|es|ed|ing|d)?\\b`, "gi");
  if (regex.test(sentence)) {
    return sentence.replace(regex, "______");
  }
  if (word.length >= 4) {
    const stem = escapeRegExp(word.slice(0, Math.min(word.length - 1, 5)));
    const stemRegex = new RegExp(`\\b${stem}[a-z]*\\b`, "gi");
    if (stemRegex.test(sentence)) {
      return sentence.replace(stemRegex, "______");
    }
  }
  return sentence.replace(new RegExp(escaped, "gi"), "______");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getPosLabel(pos?: string | null): string | null {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p.includes("verb") || p === "v") return "Động từ (verb)";
  if (p.includes("noun") || p === "n") return "Danh từ (noun)";
  if (p.includes("adj") || p === "a") return "Tính từ (adj)";
  if (p.includes("adv")) return "Trạng từ (adv)";
  if (p.includes("idiom") || p.includes("phrase")) return "Cụm từ / Thành ngữ";
  return pos;
}

export default function FocusReviewModal({ onClose, isPreview = false }: FocusReviewModalProps) {
  const [settings, setSettings] = useState<ReminderSettings>(getReminderSettings());
  const [queue, setQueue] = useState<WordDetail[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Active question mode: multiple_choice (50%) or typing (50%)
  const [activeMode, setActiveMode] = useState<"multiple_choice" | "typing">("multiple_choice");

  // Multiple choice state (4 English words)
  const [choices, setChoices] = useState<ChoiceOption[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Typing mode state
  const [typedInput, setTypedInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Auto-advance timer ref for proper cleanup
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentWord = queue[currentIndex];

  const handleClose = useCallback(async () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (onClose) onClose();
    if (!isPreview) {
      await hideReviewPopup();
    }
  }, [onClose, isPreview]);

  const handleSnooze = useCallback(async (minutes?: number) => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    const mins = snoozeReminder(minutes);
    setFeedbackMsg(`Đã hoãn nhắc nhở trong ${mins} phút.`);
    setTimeout(async () => {
      await handleClose();
    }, 600);
  }, [handleClose]);

  // Pick random question mode per card (multiple choice or typing)
  const pickRandomMode = useCallback((): "multiple_choice" | "typing" => {
    return Math.random() < 0.5 ? "multiple_choice" : "typing";
  }, []);

  // Advance to next word in queue or conclude session
  const advanceNextWord = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (currentIndex + 1 < queue.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Completed all words in session
      setFeedbackMsg("Hoàn thành phiên ôn tập! Cửa sổ sẽ đóng lại...");
      setTimeout(async () => {
        await handleClose();
      }, 1400);
    }
  }, [currentIndex, queue.length, handleClose]);

  // Load words for review queue based on settings
  const loadWords = async (forceSpinner = true) => {
    if (forceSpinner) setLoading(true);
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    try {
      const currentSettings = getReminderSettings();
      setSettings(currentSettings);

      const [dueWords, allWords] = await Promise.all([
        getDueWords().catch(() => [] as WordDetail[]),
        getAllWords().catch(() => [] as WordDetail[]),
      ]);

      let candidates: WordDetail[] = [];

      if (currentSettings.triggerCondition === "due_only") {
        candidates = dueWords;
      } else {
        candidates = dueWords.length > 0 ? dueWords : allWords;
      }

      // If no words are due (e.g. user tested popup or finished queue),
      // fallback to allWords so the popup always has cards to quiz!
      if (candidates.length === 0) {
        candidates = allWords;
      }

      // Target count: 3, 5, or 10 words (default 3)
      const targetCount = Math.max(3, currentSettings.wordsPerSession || 3);
      
      let selected: WordDetail[] = [];
      // If we are prioritizing due words, sort by oldest next_review_date first
      if (candidates === dueWords || (candidates.length > 0 && new Date(candidates[0].srs?.next_review_date) <= new Date())) {
        const sortedDue = [...candidates].sort(
          (a, b) => new Date(a.srs.next_review_date).getTime() - new Date(b.srs.next_review_date).getTime()
        );
        // Take top overdue, then shuffle so they aren't totally predictable
        selected = sortedDue.slice(0, targetCount).sort(() => 0.5 - Math.random());
      } else {
        // Fallback or random words (allWords)
        const shuffled = [...candidates].sort(() => 0.5 - Math.random());
        selected = shuffled.slice(0, targetCount);
      }

      // If candidates had fewer than targetCount words, supplement from allWords to meet targetCount
      if (selected.length < targetCount && allWords.length > selected.length) {
        const selectedIds = new Set(selected.map((w) => w.id));
        const extraCandidates = allWords
          .filter((w) => !selectedIds.has(w.id))
          .sort(() => 0.5 - Math.random());
        const needed = targetCount - selected.length;
        selected = [...selected, ...extraCandidates.slice(0, needed)];
      }

      setQueue(selected);
      setCurrentIndex(0);
      setActiveMode(pickRandomMode());
      setIsAnswered(false);
      setSelectedChoiceId(null);
      setIsCorrect(false);
      setTypedInput("");
      setFeedbackMsg(null);
    } catch (err) {
      console.error("Failed to load review words for modal:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recordPopupDisplayed(Date.now());
    loadWords(true);

    let unlistenFn: (() => void) | null = null;
    let isCancelled = false;

    // Listen to native Tauri event when review popup window is opened / focused
    listen("review-popup-opened", () => {
      if (isCancelled) return;
      recordPopupDisplayed(Date.now());
      loadWords(false);
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenFn = fn;
      })
      .catch((err) => {
        console.warn("Could not attach review-popup-opened listener:", err);
      });

    // In-app fallback preview event listener
    const onPreviewOpened = () => {
      recordPopupDisplayed(Date.now());
      loadWords(false);
    };
    window.addEventListener("open-review-popup-preview", onPreviewOpened);

    return () => {
      isCancelled = true;
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (unlistenFn) unlistenFn();
      window.removeEventListener("open-review-popup-preview", onPreviewOpened);
    };
  }, []);

  // When current word changes: randomize quiz mode, reset answer state, and prepare choices
  useEffect(() => {
    if (!currentWord) return;

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    setActiveMode(pickRandomMode());
    setIsAnswered(false);
    setSelectedChoiceId(null);
    setIsCorrect(false);
    setTypedInput("");
    setFeedbackMsg(null);

    // Prepare English choices for multiple choice mode
    getAllWords().then((all) => {
      const otherWords = all.filter(
        (w) => w.id !== currentWord.id && w.word.trim().toLowerCase() !== currentWord.word.trim().toLowerCase()
      );

      // Pick 3 distractors from library
      const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());
      const distractors: ChoiceOption[] = shuffledOthers.slice(0, 3).map((w) => ({
        id: w.id,
        word: w.word,
        isCorrect: false,
      }));

      // Fallback English words if library has fewer than 4 words
      const genericFallbacks = [
        "commit",
        "deploy",
        "refactor",
        "optimize",
        "pipeline",
        "cache",
        "thread",
        "execute",
      ];
      let fallbackIdx = 0;
      while (distractors.length < 3) {
        const fbWord = genericFallbacks[fallbackIdx % genericFallbacks.length];
        if (
          fbWord.toLowerCase() !== currentWord.word.toLowerCase() &&
          !distractors.some((d) => d.word.toLowerCase() === fbWord.toLowerCase())
        ) {
          distractors.push({
            id: `fallback-${fallbackIdx}`,
            word: fbWord,
            isCorrect: false,
          });
        }
        fallbackIdx++;
      }

      const correctChoice: ChoiceOption = {
        id: currentWord.id,
        word: currentWord.word,
        isCorrect: true,
      };

      const allChoices = [correctChoice, ...distractors].sort(() => 0.5 - Math.random());
      setChoices(allChoices);
    });
  }, [currentIndex, currentWord, pickRandomMode]);

  // Focus input when active mode is typing
  useEffect(() => {
    if (activeMode === "typing" && !isAnswered) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [activeMode, currentIndex, isAnswered]);

  // STRICT REQUIREMENT: DO NOT auto-play audio on display.
  // Only allow manual pronunciation click.
  const handleManualSpeak = () => {
    if (!currentWord?.word) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentWord.word);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
    }
  };

  // Submit multiple-choice answer
  const handleSelectChoice = async (choice: ChoiceOption) => {
    if (isAnswered) return;

    setSelectedChoiceId(choice.id);
    setIsAnswered(true);
    const correct = choice.isCorrect;
    setIsCorrect(correct);

    try {
      if (correct) {
        await recordReview(currentWord.id, Rating.Good);
        recordDailyActivity(1);
        setFeedbackMsg("Chính xác! Đã tích lũy mục tiêu hằng ngày 🎉");

        // Pause for 3.5s so user can comfortably review pronunciation & sentence context
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          advanceNextWord();
        }, 3500);
      } else {
        await recordReview(currentWord.id, Rating.Again);
        setFeedbackMsg(`Chưa chính xác! Từ đúng là: "${currentWord.word}"`);
        
        // Cải tiến: Đẩy từ trả lời sai vào cuối hàng đợi để buộc người dùng phải học lại trong phiên này
        setQueue((prev) => [...prev, currentWord]);
      }
    } catch (err) {
      console.warn("Failed to record review from popup:", err);
    }
  };

  // Submit typing answer
  const handleTypingSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentWord) return;

    const trimmedInput = typedInput.trim().toLowerCase();
    const target = currentWord.word.trim().toLowerCase();
    const correct = trimmedInput === target;

    setIsAnswered(true);
    setIsCorrect(correct);

    try {
      if (correct) {
        await recordReview(currentWord.id, Rating.Good);
        recordDailyActivity(1);
        setFeedbackMsg("Tuyệt vời! Bạn đã gõ chính xác 🚀");

        // Pause for 3.5s so user can comfortably review pronunciation & sentence context
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(() => {
          advanceNextWord();
        }, 3500);
      } else {
        await recordReview(currentWord.id, Rating.Again);
        setFeedbackMsg(`Chưa chính xác. Đáp án đúng là: "${currentWord.word}"`);
        
        // Cải tiến: Đẩy từ trả lời sai vào cuối hàng đợi
        setQueue((prev) => [...prev, currentWord]);
      }
    } catch (err) {
      console.warn("Failed to record typing review:", err);
    }
  };

  // Keyboard navigation: Esc to close, 1-4 for choices, S for snooze, Enter/Space to advance
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Escape key to dismiss immediately
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      // Snooze shortcut: key 's' or 'S' (when not actively typing)
      if (
        (e.key === "s" || e.key === "S") &&
        activeMode !== "typing" &&
        !isAnswered
      ) {
        e.preventDefault();
        handleSnooze();
        return;
      }

      // Keys 1, 2, 3, 4 for multiple choice
      if (["1", "2", "3", "4"].includes(e.key)) {
        const num = parseInt(e.key, 10);
        if (activeMode === "multiple_choice" && !isAnswered && choices.length >= num) {
          e.preventDefault();
          handleSelectChoice(choices[num - 1]);
        }
      }

      // Enter or Space to advance when answered
      if ((e.key === "Enter" || e.key === " ") && isAnswered) {
        e.preventDefault();
        advanceNextWord();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleClose,
    handleSnooze,
    isAnswered,
    choices,
    activeMode,
    currentIndex,
    queue.length,
    advanceNextWord,
  ]);

  // Stable solid alpha overlay scrim - avoids WebKit backdrop-filter compositor thrashing and flickering
  const overlayStyle = useMemo(() => {
    switch (settings.blurOverlay) {
      case "heavy":
        return { backgroundColor: "rgba(0, 0, 0, 0.85)" };
      case "light":
        return { backgroundColor: "rgba(0, 0, 0, 0.48)" };
      case "medium":
      default:
        return { backgroundColor: "rgba(0, 0, 0, 0.68)" };
    }
  }, [settings.blurOverlay]);

  // Concise Vietnamese meaning
  const conciseMeaning = useMemo(() => {
    if (!currentWord) return "";
    return getConciseMeaning(currentWord.meaning_vn, currentWord.word);
  }, [currentWord]);

  // Example sentence with masked blank
  const primaryExample = currentWord?.examples?.[0];
  const maskedSentence = useMemo(() => {
    if (!primaryExample?.sentence_en || !currentWord?.word) return null;
    return maskWordInSentence(primaryExample.sentence_en, currentWord.word);
  }, [primaryExample, currentWord]);

  const posLabel = useMemo(() => {
    return getPosLabel(currentWord?.part_of_speech);
  }, [currentWord]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none"
      style={overlayStyle}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-xl min-h-[500px] bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col justify-between animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white shadow-sm shadow-cyan-500/30">
              <Zap className="w-4 h-4 fill-white" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  Flash-Quiz
                </span>
                {queue.length > 0 && currentWord && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 font-bold border border-cyan-200 dark:border-cyan-800">
                    Từ {currentIndex + 1} / {queue.length}
                  </span>
                )}
                {currentWord && (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      new Date(currentWord.srs.next_review_date) <= new Date()
                        ? "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800"
                        : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                    }`}
                  >
                    {new Date(currentWord.srs.next_review_date) <= new Date() ? "Đến hạn ôn" : "Củng cố"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Snooze Button */}
            <button
              onClick={() => handleSnooze()}
              title={`Hoãn nhắc nhở ${settings.snoozeMinutes} phút (Phím S)`}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Hoãn</span>
              <span>{settings.snoozeMinutes}p</span>
            </button>

            {/* Quick Close Button (Esc) */}
            <button
              onClick={handleClose}
              title="Đóng cửa sổ (Phím Esc)"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                Đang chuẩn bị câu hỏi ôn tập...
              </p>
            </div>
          ) : !currentWord ? (
            <div className="py-10 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Chưa có từ vựng nào trong thư viện!
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Hãy mở thanh Quick Input (Cmd+Shift+E) hoặc vào Dashboard để thêm từ mới nhé.
              </p>
              <button
                onClick={handleClose}
                className="mt-2 px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
              >
                Đóng lại
              </button>
            </div>
          ) : (
            <>
              {/* ========================================================
                  QUESTION PROMPT AREA: Concise Vietnamese & Cloze Clue
                  ======================================================== */}
              <div className="space-y-3">
                {/* Header Hint / Tags */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-cyan-600 dark:text-cyan-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Nghĩa tiếng Việt:</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {posLabel && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-semibold text-[11px]">
                        {posLabel}
                      </span>
                    )}
                    {currentWord.topic && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px] border border-indigo-200 dark:border-indigo-800/60">
                        {currentWord.topic}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Prompt: Crisp, Concise Vietnamese Meaning */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/80 border border-slate-200/80 dark:border-zinc-800/80 text-center">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug tracking-tight">
                    {conciseMeaning || currentWord.meaning_vn}
                  </h2>
                </div>

                {/* Cloze Hint Context: Sentence with blank ______ */}
                {maskedSentence && (
                  <div className="p-3.5 rounded-2xl bg-cyan-50/40 dark:bg-cyan-950/20 border border-cyan-200/60 dark:border-cyan-800/50 text-xs leading-relaxed space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Ngữ cảnh trong câu:</span>
                    </div>
                    <p className="font-medium text-slate-800 dark:text-zinc-200 italic">
                      "{maskedSentence}"
                    </p>
                    {primaryExample?.sentence_vn && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        ({primaryExample.sentence_vn})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ========================================================
                  MODE 1: MULTIPLE CHOICE (4 Clean English Word Choices)
                  ======================================================== */}
              {activeMode === "multiple_choice" && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    <span>Chọn từ tiếng Anh chính xác:</span>
                    <span className="text-[11px] font-mono text-slate-400">Nhấn phím 1 - 4</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {choices.map((choice, idx) => {
                      const isSelected = selectedChoiceId === choice.id;
                      let btnStyle =
                        "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 hover:border-cyan-500 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20 shadow-xs";
                      let badgeStyle =
                        "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300";

                      if (isAnswered) {
                        if (choice.isCorrect) {
                          btnStyle =
                            "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30";
                          badgeStyle = "bg-emerald-500 text-white font-bold";
                        } else if (isSelected && !choice.isCorrect) {
                          btnStyle =
                            "border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100";
                          badgeStyle = "bg-rose-500 text-white font-bold";
                        } else {
                          btnStyle =
                            "border-slate-200 dark:border-zinc-800 opacity-40 bg-white dark:bg-zinc-900";
                        }
                      }

                      return (
                        <button
                          key={choice.id}
                          disabled={isAnswered}
                          onClick={() => handleSelectChoice(choice)}
                          className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all duration-150 ${btnStyle}`}
                        >
                          <span
                            className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${badgeStyle}`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-sm sm:text-base font-bold flex-1 tracking-tight">
                            {choice.word}
                          </span>
                          {isAnswered && choice.isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          {isAnswered && isSelected && !choice.isCorrect && (
                            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================
                  MODE 2: TYPING / SPELLING (Active Recall)
                  ======================================================== */}
              {activeMode === "typing" && (
                <form onSubmit={handleTypingSubmit} className="space-y-3.5 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      <span>Nhập từ tiếng Anh tương ứng:</span>
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                        Gợi ý: {currentWord.word[0].toUpperCase()}
                        {" · ".repeat(Math.max(0, currentWord.word.length - 1))}
                        ({currentWord.word.length} chữ cái)
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        ref={inputRef}
                        type="text"
                        autoFocus
                        disabled={isAnswered}
                        value={typedInput}
                        onChange={(e) => setTypedInput(e.target.value)}
                        placeholder="Gõ từ tiếng Anh vào đây..."
                        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base font-bold text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all shadow-xs"
                      />
                    </div>
                  </div>

                  {!isAnswered ? (
                    <button
                      type="submit"
                      disabled={!typedInput.trim()}
                      className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-sm shadow-cyan-600/20"
                    >
                      Kiểm tra đáp án (Enter)
                    </button>
                  ) : null}
                </form>
              )}

              {/* ========================================================
                  ANSWER REVEAL & LEARNING CARD (When Answered)
                  ======================================================== */}
              {isAnswered && (
                <div
                  className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-3 animate-in fade-in duration-200 ${
                    isCorrect
                      ? "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100"
                      : "bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100"
                  }`}
                >
                  {/* Status Banner */}
                  {feedbackMsg && (
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                      <span>{feedbackMsg}</span>
                    </div>
                  )}

                  {/* Word Reveal: English Word, Phonetic, Speaker */}
                  <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {currentWord.word}
                      </span>
                      {currentWord.phonetic && (
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-medium">
                          {currentWord.phonetic}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={handleManualSpeak}
                      title="Nghe phát âm (Nhấp để nghe)"
                      className="p-1.5 rounded-full text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Full Sentence Reveal */}
                  {primaryExample && (
                    <div className="text-[11px] text-slate-600 dark:text-zinc-300 italic pl-2 border-l-2 border-cyan-500/50">
                      "{primaryExample.sentence_en}"
                    </div>
                  )}

                  {/* Continue Button (Especially when incorrect, or to skip waiting) */}
                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={advanceNextWord}
                      className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-xs"
                    >
                      <span>Tiếp tục</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                      <kbd className="px-1 py-0.2 bg-white/20 dark:bg-black/20 rounded text-[9px] font-mono">
                        Enter
                      </kbd>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Keyboard Hint Bar */}
        <div className="px-6 py-3 bg-slate-50/60 dark:bg-zinc-950/40 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
          <div className="flex items-center gap-3">
            {activeMode === "multiple_choice" ? (
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                  1-4
                </kbd>
                <span>Chọn từ</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                  Enter
                </kbd>
                <span>Kiểm tra</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
                S
              </kbd>
              <span>Hoãn {settings.snoozeMinutes}p</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[10px] text-slate-700 dark:text-zinc-300">
              Esc
            </kbd>
            <span>Tắt nhanh</span>
          </div>
        </div>
      </div>
    </div>
  );
}


