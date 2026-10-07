import { useEffect, useState } from "react";
import { BookOpen, Briefcase, Check, GitPullRequest, Keyboard, Loader2, Users } from "lucide-react";
import type { StarterDeck } from "@/data/starterDecks";
import type { GrammarLevel } from "@/types/grammar";
import { importStarterDecks, loadStarterDecks } from "@/services/starterDecks";
import { applyDailyPlan, DAILY_PLANS, markOnboardingDone, type DailyMinutes } from "@/services/onboarding";
import { setUserOverrideLevel, syncProficiencyWithReminderSettings } from "@/services/userProficiency";
import PlacementTest from "./PlacementTest";

const DECK_ICONS: Record<string, typeof BookOpen> = {
  docs: BookOpen,
  meetings: Users,
  "code-review": GitPullRequest,
  interview: Briefcase,
};

const LEVELS: Array<{ level: GrammarLevel; label: string; hint: string }> = [
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

/** First run: what for -> level -> minutes per day, then the first session (see services/onboarding.ts) */
export default function OnboardingFlow({ onFinish }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [decks, setDecks] = useState<StarterDeck[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [level, setLevel] = useState<GrammarLevel | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementDone, setPlacementDone] = useState(false);
  const [minutes, setMinutes] = useState<DailyMinutes>(10);
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStarterDecks().then(setDecks).catch(() => setDecks([]));
  }, []);

  const chosenDecks = decks.filter((d) => chosen.includes(d.id));
  const chosenWordCount = chosenDecks.reduce((n, d) => n + d.words.length, 0);

  const toggleDeck = (id: string) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const finish = async (startNow: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (level) {
        setUserOverrideLevel(level);
        syncProficiencyWithReminderSettings(level);
      }
      applyDailyPlan(minutes, reminders);
      if (chosenDecks.length > 0) await importStarterDecks(chosenDecks, level);
      markOnboardingDone();
      onFinish(startNow && chosenDecks.length > 0);
    } catch (err) {
      setError(`Không thêm được bộ từ: ${err}`);
      setBusy(false);
    }
  };

  const skipAll = () => {
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
            <span className="ml-2 text-[11px] font-mono text-slate-500 dark:text-zinc-500">Bước {step}/3</span>
          </div>
          <button onClick={skipAll} className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
            Bỏ qua phần thiết lập
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bạn học tiếng Anh để làm gì?</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Chọn một hoặc nhiều mục. Mỗi mục có sẵn khoảng 25 từ kèm phát âm, nghĩa và câu ví dụ, học được ngay mà
                không cần cài AI.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {decks.map((d) => {
                const Icon = DECK_ICONS[d.id] ?? BookOpen;
                const on = chosen.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleDeck(d.id)}
                    className={`text-left p-4 rounded-xl border transition-all space-y-2 ${on ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-500" : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
                        <Icon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        {d.goal}
                      </span>
                      {on && <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">{d.description}</p>
                    <p className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                      {d.words.length} từ · {d.words.slice(-3).map((w) => w.word).join(", ")}…
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => { setChosen([]); setStep(2); }} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                Tôi sẽ tự thêm từ
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={chosen.length === 0}
                className="py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold disabled:opacity-40"
              >
                Tiếp ({chosenWordCount} từ)
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Trình độ hiện tại của bạn?</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Từ vừa sức (trình độ của bạn và cao hơn một bậc) sẽ được học trước. Có thể đổi lại bất cứ lúc nào.
              </p>
            </div>
            <button
              onClick={() => setPlacementOpen(true)}
              className="w-full p-4 rounded-xl border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-500/10 text-left space-y-1 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 transition-colors"
            >
              <span className="block text-sm font-semibold text-cyan-800 dark:text-cyan-200">
                {placementDone && level ? `Kết quả kiểm tra: ${level} · làm lại` : "Kiểm tra nhanh (1–3 phút)"}
              </span>
              <span className="block text-[11px] text-cyan-700/80 dark:text-cyan-300/80">
                Tối đa 25 câu từ vựng, dừng sớm khi gặp mức khó.
              </span>
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  onClick={() => { setLevel(l.level); setPlacementDone(false); }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${level === l.level ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-500" : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"}`}
                >
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{l.level}</span>
                  <span className="block text-[11px] font-medium text-slate-700 dark:text-zinc-300">{l.label}</span>
                  <span className="block text-[10px] text-slate-500 dark:text-zinc-500 leading-tight mt-0.5">{l.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setStep(1)} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                Quay lại
              </button>
              <div className="flex items-center gap-3">
                {!level && (
                  <button onClick={() => setStep(3)} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                    Chưa rõ, bỏ qua
                  </button>
                )}
                <button
                  onClick={() => setStep(3)}
                  disabled={!level}
                  className="py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold disabled:opacity-40"
                >
                  Tiếp
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Mỗi ngày bạn dành bao nhiêu phút?</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Ít mà đều đặn nhớ lâu hơn học dồn. Số từ mới mỗi ngày được giữ thấp vì mỗi từ mới sẽ cần ôn lại vài lần.
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
                    <span className="block text-[11px] text-slate-600 dark:text-zinc-400">~{m * 4} câu trả lời</span>
                    <span className="block text-[11px] text-slate-600 dark:text-zinc-400">{p.newCardsPerDay} từ mới/ngày</span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 cursor-pointer">
              <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} className="mt-0.5 accent-cyan-600" />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium text-slate-800 dark:text-zinc-200">
                  Nhắc tôi ôn trong lúc làm việc (khoảng {DAILY_PLANS[minutes].reminderInterval} phút một lần)
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-500">
                  Một thẻ nhỏ ở góc màn hình, không chiếm focus. Tự hoãn khi bạn đang dùng app toàn màn hình, chia sẻ màn hình trên Zoom hoặc bật Focus.
                </span>
              </span>
            </label>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 text-[11px] text-slate-600 dark:text-zinc-400">
              <Keyboard className="w-4 h-4 shrink-0 text-slate-400" />
              <span>
                Gặp từ lạ khi làm việc? Copy từ (hoặc cả câu chứa nó) rồi nhấn <b>⌘⇧E</b> để thêm vào sổ. Phần phân tích
                nghĩa bằng AI cần cài Claude hoặc Gemini CLI, xem tab Hướng dẫn.
              </span>
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setStep(2)} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                Quay lại
              </button>
              <div className="flex items-center gap-3">
                {chosenDecks.length > 0 && (
                  <button onClick={() => finish(false)} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                    Để sau
                  </button>
                )}
                <button
                  onClick={() => finish(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 !text-white text-xs font-semibold shadow-lg shadow-orange-500/20 disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {busy
                    ? `Đang thêm ${chosenWordCount} từ…`
                    : chosenDecks.length > 0
                      ? `Học ${DAILY_PLANS[minutes].newCardsPerDay} từ đầu tiên ngay`
                      : "Hoàn tất"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {placementOpen && (
        <PlacementTest
          onClose={() => setPlacementOpen(false)}
          onDone={(lvl) => {
            setPlacementOpen(false);
            setLevel(lvl);
            setPlacementDone(true);
          }}
        />
      )}
    </div>
  );
}
