import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Ear, Lightbulb, Mic, RotateCcw, Snail, Volume2 } from "lucide-react";
import type { PronunciationItem, PronunciationLesson } from "@/types/pronunciation";
import {
  getPronunciationProgress,
  isLessonPassed,
  loadPronunciationLessons,
  recordPronunciationQuiz,
  PRONUNCIATION_PASS_RATIO,
  type PronunciationProgress,
} from "@/services/pronunciation";
import { logLearningEvent } from "@/services/learningEvents";
import { handleSpeak, SLOW_RATE } from "../review/speech";
import { PAGE_CONTAINER } from "./shared";

/** One word with its IPA: normal and slow playback */
function SoundItem({ item }: { item: PronunciationItem }) {
  return (
    <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="min-w-0">
        <div className="text-base font-semibold text-slate-900 dark:text-white">{item.text}</div>
        <div className="text-sm font-mono text-slate-500 dark:text-zinc-400">{item.ipa}</div>
        {item.note && <div className="text-xs text-slate-500 dark:text-zinc-400">{item.note}</div>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => handleSpeak(item.text)}
          title="Nghe"
          className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 hover:bg-violet-100"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleSpeak(item.text, SLOW_RATE)}
          title="Nghe chậm"
          className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200"
        >
          <Snail className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Listen, say it aloud, rate yourself: never graded, logged as a "say_aloud" event */
function SayAloud({ lessonId, items }: { lessonId: string; items: PronunciationItem[] }) {
  const [index, setIndex] = useState(0);
  const [rated, setRated] = useState<number>(0);
  const item = items[index % items.length];
  if (!item) return null;
  const rate = (ok: boolean) => {
    logLearningEvent("say_aloud", { meta: { lessonId, text: item.text, ok } });
    setRated((n) => n + 1);
    setIndex((i) => i + 1);
  };
  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        <Mic className="w-4 h-4" /> Đọc to theo
      </div>
      <p className="text-xs text-slate-600 dark:text-zinc-400">
        Nghe 2 lần, rồi đọc to thành tiếng (không chỉ đọc thầm). Tự so với tiếng máy và chấm cho mình.
      </p>
      <div className="flex items-center gap-3">
        <div className="text-xl font-bold text-slate-900 dark:text-white">{item.text}</div>
        <div className="text-sm font-mono text-slate-500">{item.ipa}</div>
        <button onClick={() => handleSpeak(item.text)} className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700">
          <Volume2 className="w-4 h-4" />
        </button>
        <button onClick={() => handleSpeak(item.text, SLOW_RATE)} className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700">
          <Snail className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => rate(true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
          Mình đọc được ✓
        </button>
        <button onClick={() => rate(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs font-semibold">
          Chưa chắc, sang từ khác
        </button>
        {rated > 0 && <span className="text-xs text-slate-500 self-center">Đã luyện {rated} từ</span>}
      </div>
    </div>
  );
}

function Quiz({ lesson, onFinished }: { lesson: PronunciationLesson; onFinished: () => void }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<{ correct: number; passed: boolean } | null>(null);
  const q = lesson.quiz[index];

  useEffect(() => {
    if (q && !result) {
      const t = setTimeout(() => handleSpeak(q.say), 250);
      return () => clearTimeout(t);
    }
  }, [q, result]);

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setCorrect(0);
    setResult(null);
  };

  if (result) {
    const pct = Math.round((result.correct * 100) / lesson.quiz.length);
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3 text-center">
        {result.passed ? (
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Hoàn thành bài! 🎉 ({pct}%)</p>
        ) : (
          <p className="text-lg font-bold text-slate-800 dark:text-zinc-200">
            Đúng {result.correct}/{lesson.quiz.length}. Nghe thêm vài lần rồi thử lại nhé, tai sẽ quen dần.
          </p>
        )}
        <div className="flex justify-center gap-2">
          <button onClick={restart} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 text-sm inline-flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" /> Làm lại
          </button>
          <button onClick={onFinished} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold">
            Về danh sách bài
          </button>
        </div>
      </div>
    );
  }
  if (!q) return null;

  const choose = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    if (opt === q.answer) setCorrect((n) => n + 1);
  };
  const next = () => {
    const total = correct;
    if (index + 1 >= lesson.quiz.length) {
      const passed = recordPronunciationQuiz(lesson.id, total, lesson.quiz.length);
      setResult({ correct: total, passed });
    } else {
      setIndex((i) => i + 1);
      setPicked(null);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-white dark:bg-zinc-900 p-5 space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
          <Ear className="w-4 h-4" /> Nghe và chọn
        </span>
        <span>
          Câu {index + 1}/{lesson.quiz.length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => handleSpeak(q.say)} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold inline-flex items-center gap-1.5">
          <Volume2 className="w-4 h-4" /> Nghe lại
        </button>
        <button onClick={() => handleSpeak(q.say, SLOW_RATE)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm inline-flex items-center gap-1.5">
          <Snail className="w-4 h-4" /> Chậm
        </button>
      </div>
      <p className="text-base font-medium text-slate-800 dark:text-zinc-200">{q.question}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {q.options.map((opt) => {
          const isAnswer = opt === q.answer;
          const style = !picked
            ? "border-slate-200 dark:border-zinc-700 hover:border-violet-400"
            : isAnswer
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
              : opt === picked
                ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                : "border-slate-200 dark:border-zinc-800 opacity-60";
          return (
            <button key={opt} onClick={() => choose(opt)} className={`p-3 rounded-xl border-2 text-base font-semibold text-slate-900 dark:text-white ${style}`}>
              {opt}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="space-y-3">
          <p className={`text-sm ${picked === q.answer ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}>
            {picked === q.answer ? "Đúng rồi! " : `Đáp án: ${q.answer}. `}
            {q.explanation}
          </p>
          <button onClick={next} className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold">
            {index + 1 >= lesson.quiz.length ? "Xem kết quả" : "Câu tiếp"}
          </button>
        </div>
      )}
    </div>
  );
}

function LessonView({ lesson, onBack }: { lesson: PronunciationLesson; onBack: () => void }) {
  const [quizOpen, setQuizOpen] = useState(false);
  const sayItems = [...lesson.examples, ...(lesson.pairs ?? []).flatMap((p) => [p.a, p.b])];
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Danh sách bài
      </button>
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{lesson.title}</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400">{lesson.tagline}</p>
      </div>
      <div className="space-y-2 text-[15px] leading-relaxed text-slate-700 dark:text-zinc-300">
        {lesson.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <Lightbulb className="w-4 h-4" /> Cách phát âm
        </div>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-zinc-300">
          {lesson.tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Nghe ví dụ</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {lesson.examples.map((item) => (
            <SoundItem key={item.text} item={item} />
          ))}
        </div>
      </div>
      {lesson.pairs && lesson.pairs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Cặp dễ nhầm: nghe sự khác nhau</p>
          {lesson.pairs.map((pair) => (
            <div key={`${pair.a.text}-${pair.b.text}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <SoundItem item={pair.a} />
              <span className="text-xs text-slate-400">vs</span>
              <SoundItem item={pair.b} />
            </div>
          ))}
        </div>
      )}
      <SayAloud lessonId={lesson.id} items={sayItems} />
      {quizOpen ? (
        <Quiz lesson={lesson} onFinished={onBack} />
      ) : (
        <button onClick={() => setQuizOpen(true)} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-base font-bold">
          Làm bài nghe ({lesson.quiz.length} câu)
        </button>
      )}
    </div>
  );
}

/** Pronunciation lessons for beginners: sounds Vietnamese speakers miss, endings, stress, IT words */
export default function PronunciationTab() {
  const [lessons, setLessons] = useState<PronunciationLesson[]>([]);
  const [progress, setProgress] = useState<PronunciationProgress>(getPronunciationProgress);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadPronunciationLessons().then(setLessons).catch(() => setLessons([]));
  }, []);
  const refresh = useCallback(() => setProgress(getPronunciationProgress()), []);
  useEffect(() => {
    window.addEventListener("myenglish-pronunciation-updated", refresh);
    return () => window.removeEventListener("myenglish-pronunciation-updated", refresh);
  }, [refresh]);

  const open = lessons.find((l) => l.id === openId);
  return (
    <div className={PAGE_CONTAINER}>
      {open ? (
        <LessonView lesson={open} onBack={() => setOpenId(null)} />
      ) : (
        <div className="max-w-3xl mx-auto space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Phát âm</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Không đọc được thì khó nhớ từ. Mỗi bài khoảng 5 phút: nghe, đọc to theo, rồi làm bài nghe. Đạt{" "}
              {Math.round(PRONUNCIATION_PASS_RATIO * 100)}% là hoàn thành.
            </p>
          </div>
          <div className="space-y-2">
            {lessons.map((l, i) => {
              const p = progress[l.id];
              const passed = isLessonPassed(p);
              return (
                <button
                  key={l.id}
                  onClick={() => setOpenId(l.id)}
                  className="w-full text-left flex items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Bài {i + 1}. {l.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">{l.tagline}</div>
                  </div>
                  {passed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-4 h-4" /> Xong
                    </span>
                  ) : p ? (
                    <span className="text-xs text-slate-500 shrink-0">
                      Tốt nhất {p.best}/{p.total}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
