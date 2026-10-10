import { useState } from "react";
import { Keyboard, Loader2 } from "lucide-react";
import type { StudyLevel } from "@/services/vocabCatalog";
import { defaultStudyLevelsFor, setStudyLevels, topUpNewWords } from "@/services/vocabFeed";
import {
  applyDailyPlan,
  applyLevelChoice,
  DAILY_PLANS,
  markOnboardingDone,
  type DailyMinutes,
  type LevelChoice,
} from "@/services/onboarding";
import { ANCHOR_TIMES, type ReminderAnchor } from "@/services/reminderMoments";
import PlacementTest from "./PlacementTest";
import { LevelPicker, mixDescription } from "./dashboard/VocabTab";

const LEVELS: Array<{ level: LevelChoice; label: string; hint: string }> = [
  { level: "A0", label: "Mất gốc", hint: "Quên gần hết, muốn học lại từ đầu" },
  { level: "A1", label: "Mới bắt đầu", hint: "Biết vài từ cơ bản" },
  { level: "A2", label: "Cơ bản", hint: "Hiểu câu ngắn, quen thuộc" },
  { level: "B1", label: "Trung cấp", hint: "Đọc được tài liệu đơn giản" },
  { level: "B2", label: "Khá", hint: "Đọc docs mà ít phải tra từ" },
  { level: "C1", label: "Thành thạo", hint: "Đọc, viết, họp khá tự nhiên" },
];

interface OnboardingFlowProps {
  /** startNow = open the first session right after the words are added */
  onFinish: (startNow: boolean) => void;
}

/**
 * First run, in the order a teacher would ask:
 *  1. level (quick adaptive test, or pick one; "mất gốc" = A0)
 *  2. vocabulary levels: the Oxford deck from A1, mixed with the next levels up to the learner's own
 *  3. minutes per day and WHEN to study (a fixed moment of the day builds the habit better than reminders
 *     every N minutes)
 * then the first session right away.
 */
export default function OnboardingFlow({ onFinish }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [studyLevels, setStudyLevelsState] = useState<StudyLevel[]>(["A1"]);
  const [level, setLevel] = useState<LevelChoice | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementDone, setPlacementDone] = useState(false);
  const [minutes, setMinutes] = useState<DailyMinutes>(10);
  const [reminders, setReminders] = useState(true);
  const [anchors, setAnchors] = useState<ReminderAnchor[]>(["after_lunch"]);
  const [transitions, setTransitions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAnchor = (a: ReminderAnchor) =>
    setAnchors((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const goToLevels = () => {
    // Up to the learner's own level (A0 = A1): words they may know are skipped with "Đã biết"
    setStudyLevelsState(defaultStudyLevelsFor(level === "A0" ? "A1" : level));
    setStep(2);
  };

  const finish = async (startNow: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (level) applyLevelChoice(level);
      applyDailyPlan(minutes, reminders, { anchors, transitions });
      setStudyLevels(studyLevels);
      await topUpNewWords();
      markOnboardingDone();
      onFinish(startNow);
    } catch (err) {
      setError(`Không chuẩn bị được từ vựng: ${err}`);
      setBusy(false);
    }
  };

  const skipAll = async () => {
    // Defaults: A1 words, 10 minutes a day
    setStudyLevels(["A1"]);
    await topUpNewWords().catch(() => {});
    markOnboardingDone();
    onFinish(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all ${s === step ? "w-8 bg-cyan-500" : s < step ? "w-4 bg-cyan-300 dark:bg-cyan-700" : "w-4 bg-slate-200 dark:bg-zinc-700"}`}
              />
            ))}
            <span className="ml-2 text-xs text-slate-500 dark:text-zinc-500">Bước {step}/3</span>
          </div>
          <button onClick={skipAll} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
            Bỏ qua phần thiết lập
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Tiếng Anh của bạn đang ở mức nào?</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Không sao nếu bạn đã quên gần hết: app sẽ bắt đầu từ những từ và mẫu câu cơ bản nhất, đi chậm mà chắc.
              </p>
            </div>
            <button
              onClick={() => setPlacementOpen(true)}
              className="w-full p-4 rounded-xl border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-500/10 text-left space-y-1 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 transition-colors"
            >
              <span className="block text-sm font-semibold text-cyan-800 dark:text-cyan-200">
                {placementDone && level ? `Kết quả kiểm tra: ${level} · làm lại` : "Kiểm tra nhanh (2–4 phút)"}
              </span>
              <span className="block text-xs text-cyan-700/80 dark:text-cyan-300/80">
                Từ vựng, ngữ pháp và nghe; câu hỏi tự dễ hơn hoặc khó hơn theo câu trả lời của bạn.
              </span>
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  onClick={() => {
                    setLevel(l.level);
                    setPlacementDone(false);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${level === l.level ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-500" : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"}`}
                >
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    {l.level} · {l.label}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-zinc-500 leading-tight mt-0.5">{l.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              {!level && (
                <button onClick={goToLevels} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                  Chưa rõ, bỏ qua
                </button>
              )}
              <button
                onClick={goToLevels}
                disabled={!level}
                className="py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-sm font-semibold disabled:opacity-40"
              >
                Tiếp
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bạn muốn học từ vựng cấp nào?</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                5.004 từ Oxford 3000 và 5000, có nghĩa tiếng Việt, câu ví dụ và phát âm. Việc học luôn bắt đầu từ A1; chọn thêm cấp cao hơn để trộn vào. Từ nào bạn đã biết thì bấm "Đã biết" là bỏ qua được.
              </p>
            </div>
            <LevelPicker value={studyLevels} onChange={setStudyLevelsState} />
            <p className="text-xs text-slate-500 dark:text-zinc-400">{mixDescription(studyLevels)}</p>
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setStep(1)} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                Quay lại
              </button>
              <button
                onClick={() => setStep(3)}
                className="py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-sm font-semibold"
              >
                Tiếp
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Mỗi ngày bạn học bao lâu, vào lúc nào?</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Ít mà đều đặn nhớ lâu hơn học dồn. Gắn việc học vào một lúc cố định trong ngày giúp tạo thói quen nhanh nhất.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([5, 10, 15] as DailyMinutes[]).map((m) => {
                const p = DAILY_PLANS[m];
                return (
                  <button
                    key={m}
                    onClick={() => setMinutes(m)}
                    className={`p-4 rounded-xl border text-left transition-all ${minutes === m ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-500" : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"}`}
                  >
                    <span className="block text-lg font-extrabold text-slate-900 dark:text-white">{m} phút</span>
                    <span className="block text-xs text-slate-600 dark:text-zinc-400">{p.newCardsPerDay} từ mới/ngày</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-zinc-800">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} className="accent-cyan-600" />
                <span className="text-sm font-medium text-slate-800 dark:text-zinc-200">Nhắc tôi học vào:</span>
              </label>
              {reminders && (
                <div className="pl-6 space-y-1.5">
                  {(Object.keys(ANCHOR_TIMES) as ReminderAnchor[]).map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={anchors.includes(a)} onChange={() => toggleAnchor(a)} className="accent-cyan-600" />
                      {ANCHOR_TIMES[a].label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={transitions} onChange={(e) => setTransitions(e.target.checked)} className="accent-cyan-600" />
                    Lúc mở máy buổi sáng, hoặc vừa xong cuộc họp
                  </label>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">
                    Một thẻ nhỏ ở góc màn hình, không chiếm bàn phím. Không nhắc ban đêm, không nhắc khi đã xong mục tiêu ngày.
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 text-xs text-slate-600 dark:text-zinc-400">
              <Keyboard className="w-4 h-4 shrink-0 text-slate-400" />
              <span>
                Gặp từ lạ khi làm việc? Nhấn <b>⌘⇧E</b> và gõ từ đó: nếu có trong 5.000 từ Oxford, nó sẽ là từ mới tiếp theo bạn học.
              </span>
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setStep(2)} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                Quay lại
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => finish(false)} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                  Để sau
                </button>
                <button
                  onClick={() => finish(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 !text-white text-sm font-semibold shadow-lg shadow-orange-500/20 disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {busy ? "Đang chuẩn bị từ vựng…" : `Học ${DAILY_PLANS[minutes].newCardsPerDay} từ đầu tiên ngay`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {placementOpen && (
        <PlacementTest
          onClose={() => setPlacementOpen(false)}
          onDone={(choice) => {
            setPlacementOpen(false);
            setLevel(choice);
            setPlacementDone(true);
          }}
        />
      )}
    </div>
  );
}
