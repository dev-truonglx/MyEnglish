import DisplaySettings from "./dashboard/DisplaySettings";
import SettingsSection from "./dashboard/SettingsSection";
import { FOCUS_DURATIONS, getFocusSettings, saveFocusSettings } from "@/services/focusSettings";
import AdvancedLearningSettings from "./dashboard/AdvancedLearningSettings";
import ResetAppDataModal from "./dashboard/ResetAppDataModal";
import Jargon from "./Jargon";
import { isPretestEnabled, setPretestEnabled } from "@/services/pretest";
import {
  ANCHOR_TIMES,
  anchorTime,
  customAnchor,
  getBestReminderHour,
  getQuietHours,
  isCustomAnchor,
  MAX_CUSTOM_ANCHORS,
  type PresetAnchor,
  type ReminderAnchor,
} from "@/services/reminderMoments";
import { dismissStudyAnchorSuggestion, loadStudyAnchorSuggestion, type StudyAnchorSuggestion } from "@/services/habits";
import { getActivityLogs, getDailyGoal, getLocalDateString, setDailyGoal } from "@/services/streak";
import { isMainSessionActive } from "@/services/activeSession";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Bell,
  BellRing,
  ExternalLink,
  ShieldCheck,
  Zap,
  Key,
  Flame,
  Clock,
  Sliders,
  Maximize2,
  VolumeX,
  Hourglass,
  Sparkles,
  Power,
  RotateCcw,
  AlertTriangle,
  GraduationCap,
  Palette,
  Bot,
  Brain,
  Database,
  Target,
  Timer,
} from "lucide-react";
import {
  getSavedAutostartPreference,
  setAutostartEnabled,
  checkSystemAutostartStatus,
} from "@/services/autostartService";
import {
  sendTestNotification,
  markWordDueImmediately,
  srsWorker,
  getFSRSSettings,
  saveFSRSSettings,
  getStudyLimits,
  saveStudyLimits,
} from "@/services/srs";
import {
  getReminderSettings,
  saveReminderSettings,
  triggerReviewPopup,
  cancelSnooze,
  getSnoozeRemainingMinutes,
  getLastPopupDisplayTime,
  getNextReminderTime,
  getNudgesShownToday,
  isSnoozed,
  reminderPause,
  NIGHT_QUIET_START,
  NIGHT_QUIET_END,
  type ReminderSettings,
  type ReminderInterval,
  type SnoozeDuration,
  type BlurOverlayLevel,
} from "@/services/reminderSettings";
import { PAGE_CONTAINER } from "./dashboard/shared";
import { platformSlots } from "@/lib/platformSlots";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Today's activity has reached the daily goal (the same test the reminder worker makes, minus the due-review check) */
function isDailyGoalMet(): boolean {
  return (getActivityLogs()[getLocalDateString()] || 0) >= getDailyGoal();
}

interface CliStatus {
  installed: boolean;
  path: string;
  details?: string;
  error?: string;
}

interface CliGuideViewProps {
  onRefreshWords?: () => void;
  onNavigateTab?: (tab: "library" | "capture" | "review" | "analytics" | "guide" | "grammar") => void;
}

export default function CliGuideView({ onRefreshWords, onNavigateTab }: CliGuideViewProps) {
  const isDesktopApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [checkingCli, setCheckingCli] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | number | null>(null);

  // Notification & Pop-up state
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [fsrsSettings, setFsrsSettings] = useState(() => getFSRSSettings());
  const [studyLimits, setStudyLimits] = useState(() => getStudyLimits());
  const [pretestOn, setPretestOn] = useState(isPretestEnabled);
  const [dailyGoal, setDailyGoalState] = useState(getDailyGoal);
  const [focusMinutes, setFocusMinutes] = useState(() => getFocusSettings().minutes);
  const [testingNotif, setTestingNotif] = useState(false);
  const [testingDueWord, setTestingDueWord] = useState(false);
  const [testingPopup, setTestingPopup] = useState(false);

  // Autostart state
  const [autostart, setAutostart] = useState<boolean>(() => getSavedAutostartPreference());
  const [togglingAutostart, setTogglingAutostart] = useState(false);

  // Reminder settings state
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(getReminderSettings());
  const [snoozeMinutesRemaining, setSnoozeMinutesRemaining] = useState<number>(getSnoozeRemainingMinutes());
  const [lastDisplayMs, setLastDisplayMs] = useState<number>(getLastPopupDisplayTime());
  const [nextReminderMs, setNextReminderMs] = useState<number>(getNextReminderTime());
  const [goalMet, setGoalMet] = useState<boolean>(isDailyGoalMet);
  const [showResetModal, setShowResetModal] = useState(false);
  const [anchorSuggestion, setAnchorSuggestion] = useState<StudyAnchorSuggestion | null>(null);

  const formatDisplayTime = (ms: number) => {
    if (!ms || ms <= 0) return "Chưa từng hiển thị";
    const d = new Date(ms);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // Custom CLI Path state
  const [customCliPath, setCustomCliPath] = useState("");
  const [customCliSaved, setCustomCliSaved] = useState(false);

  const [selectedOs, setSelectedOs] = useState<"macos" | "windows">(() => {
    if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("win")) {
      return "windows";
    }
    return "macos";
  });

  const checkCli = async (pathToTest?: string) => {
    setCheckingCli(true);
    try {
      const storedPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
      const pathParam = pathToTest !== undefined ? (pathToTest.trim() || undefined) : storedPath;
      const res = await invoke<CliStatus>("check_cli_status", { customPath: pathParam });
      setCliStatus(res ?? null);
    } catch (err) {
      setCliStatus({
        installed: false,
        path: pathToTest || customCliPath || "~/.gemini/antigravity-cli",
        error: String(err),
      });
    } finally {
      setCheckingCli(false);
    }
  };

  useEffect(() => {
    try {
      const savedPath = localStorage.getItem("myenglish_custom_cli_path");
      if (savedPath) {
        setCustomCliPath(savedPath);
        checkCli(savedPath);
      } else {
        checkCli();
      }
    } catch {
      checkCli();
    }

    // A key used to be saved here in plain text but was never used: remove it
    try {
      localStorage.removeItem("myenglish_gemini_api_key");
    } catch {}

    const syncSettings = () => {
      setReminderSettings(getReminderSettings());
      setSnoozeMinutesRemaining(getSnoozeRemainingMinutes());
      setLastDisplayMs(getLastPopupDisplayTime());
      setNextReminderMs(getNextReminderTime());
      setGoalMet(isDailyGoalMet());
    };
    syncSettings();

    // Check system autostart status
    checkSystemAutostartStatus().then((active) => {
      setAutostart(active);
    });

    const onAutostartChanged = (e: Event) => {
      const custom = e as CustomEvent<{ enabled: boolean }>;
      if (custom.detail?.enabled !== undefined) {
        setAutostart(custom.detail.enabled);
      }
    };
    window.addEventListener("myenglish-autostart-changed", onAutostartChanged);

    window.addEventListener("myenglish-reminder-settings-updated", syncSettings);
    window.addEventListener("myenglish-popup-displayed", syncSettings);
    // Re-read the settings every 5 s, and only while this page is on screen (the countdown ticks by itself)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") syncSettings();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncSettings();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("myenglish-autostart-changed", onAutostartChanged);
      window.removeEventListener("myenglish-reminder-settings-updated", syncSettings);
      window.removeEventListener("myenglish-popup-displayed", syncSettings);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  const handleToggleAutostart = async (checked: boolean) => {
    setTogglingAutostart(true);
    setAutostart(checked);
    const ok = await setAutostartEnabled(checked);
    setTogglingAutostart(false);
    if (ok) {
      setNotifFeedback(
        checked
          ? "Đã bật tự khởi động cùng hệ điều hành (mặc định mở khay hệ thống)."
          : "Đã tắt tự khởi động cùng hệ điều hành."
      );
    } else {
      setNotifFeedback("Đã lưu thiết lập vào ứng dụng.");
    }
  };

  const handleUpdateReminder = (partial: Partial<ReminderSettings>) => {
    const updated = saveReminderSettings(partial);
    setReminderSettings(updated);
    setNextReminderMs(getNextReminderTime());
    srsWorker.restart();
    setNotifFeedback("Đã lưu thiết lập nhắc học và cập nhật bộ đếm thời gian!");
  };

  // The study time the learner already has a habit of (from their answers), offered as a reminder time
  const anchorsKey = (reminderSettings.anchors ?? []).join(",");
  useEffect(() => {
    let cancelled = false;
    const existing = (reminderSettings.anchors ?? []).map(anchorTime).filter((t): t is NonNullable<typeof t> => t !== null);
    loadStudyAnchorSuggestion(existing)
      .then((s) => {
        if (!cancelled) setAnchorSuggestion(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorsKey]);

  const customAnchors = (reminderSettings.anchors ?? []).filter(isCustomAnchor);

  const handleTestPopupQuiz = async () => {
    setTestingPopup(true);
    setNotifFeedback(null);
    try {
      await triggerReviewPopup();
      setNotifFeedback(
        "Đã kích hoạt Pop-up Focus Review toàn màn hình! Bạn có thể nhấn Esc để tắt nhanh, dùng phím 1-4 để chọn đáp án, hoặc bấm Hoãn (Snooze)."
      );
    } catch (e) {
      setNotifFeedback(`Lỗi khi mở pop-up: ${e}`);
    } finally {
      setTestingPopup(false);
    }
  };

  const handleCancelSnooze = () => {
    cancelSnooze();
    setSnoozeMinutesRemaining(0);
    setNotifFeedback("Đã hủy trạng thái hoãn. Lịch nhắc học hoạt động bình thường.");
  };

  const handleCopy = (text: string, index: string | number) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const handleTestNotification = async () => {
    setTestingNotif(true);
    setNotifFeedback(null);
    try {
      const res = await sendTestNotification();
      setNotifFeedback(res.message);
    } catch (e) {
      setNotifFeedback(`Lỗi: ${e}`);
    } finally {
      setTestingNotif(false);
    }
  };

  const handleMarkDueTest = async () => {
    setTestingDueWord(true);
    try {
      const word = await markWordDueImmediately();
      if (word) {
        onRefreshWords?.();
        setNotifFeedback(
          `Đã chuyển từ "${word}" thành trạng thái đến hạn ôn tập ngay! Bạn có thể nhấp vào thông báo nổi bên trên hoặc mở Daily Review.`
        );
      } else {
        setNotifFeedback("Thư viện hiện chưa có từ vựng nào. Hãy thêm từ vựng trước.");
      }
    } catch (e) {
      setNotifFeedback(`Lỗi: ${e}`);
    } finally {
      setTestingDueWord(false);
    }
  };

  const handleSaveCustomPath = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customCliPath.trim();
    if (trimmed) {
      localStorage.setItem("myenglish_custom_cli_path", trimmed);
    } else {
      localStorage.removeItem("myenglish_custom_cli_path");
    }
    setCustomCliSaved(true);
    setTimeout(() => setCustomCliSaved(false), 2000);
    checkCli(trimmed || undefined);
  };

  const handleResetCustomPath = () => {
    setCustomCliPath("");
    localStorage.removeItem("myenglish_custom_cli_path");
    checkCli(undefined);
  };

  const anchorsActive = reminderSettings.enabled && reminderSettings.intervalMinutes > 0;
  // Why the clock reminder is not showing right now, or null
  const pauseReason =
    reminderSettings.enabled && reminderSettings.intervalMinutes > 0 ? getPauseReason(reminderSettings, goalMet) : null;

  return (
    <div className={`${PAGE_CONTAINER} space-y-8`}>

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
          <Terminal className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Cài đặt</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {isDesktopApp
              ? "Phần quan trọng cho việc học ở trên cùng; giao diện, AI và phần nâng cao được thu gọn, cần thì mở ra. Mỗi thay đổi được lưu ngay."
              : "Phần quan trọng cho việc học ở trên cùng; giao diện và phần nâng cao được thu gọn, cần thì mở ra. Mỗi thay đổi được lưu ngay."}
          </p>
        </div>
      </div>

      {/* Jump to a section */}
      <nav className="-mt-4 flex flex-wrap gap-1.5" aria-label="Các mục cài đặt">
        {(
          [
            ["study", "Học mỗi ngày"],
            ["reminders", "Nhắc học"],
            ["display", "Giao diện & âm thanh"],
            ...(isDesktopApp ? ([["ai", "AI"]] as const) : []),
            ["algorithm", "Thuật toán lịch ôn"],
            ["data", "Dữ liệu"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700"
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Feedback alert message */}
      {notifFeedback && (
        <div className="p-4 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs text-cyan-950 dark:text-cyan-200 flex items-start justify-between gap-3 animate-in fade-in flex-wrap sm:flex-nowrap">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{notifFeedback}</span>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab("review")}
              className="shrink-0 px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Mở Daily Review ngay →</span>
            </button>
          )}
        </div>
      )}

      {platformSlots.settingsTop && <platformSlots.settingsTop />}

      {/* 1. HỌC MỖI NGÀY: what shapes the learning, first and highlighted */}
      <SettingsSection
        id="study"
        tone="primary"
        icon={<GraduationCap className="w-5 h-5" />}
        title="Học mỗi ngày"
        description="Bạn học bao nhiêu mỗi ngày: mục tiêu, số từ mới, độ dài một phiên."
        summary={`${dailyGoal} câu/ngày · ${studyLimits.newCardsPerDay} thẻ mới`}
      >
          <div className="grid gap-3 md:grid-cols-2">
            {/* Daily goal: the answers that count a day as done (streak, Today) */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-emerald-500" /> Mục tiêu mỗi ngày
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">Số câu trả lời để tính là đã học xong hôm nay (giữ chuỗi ngày học).</p>
                </div>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{dailyGoal}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[10, 15, 30, 45, 60].map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setDailyGoal(g);
                      setDailyGoalState(g);
                      setNotifFeedback(`Đã đặt mục tiêu mỗi ngày: ${g} câu.`);
                    }}
                    className={`py-2 md:py-1.5 max-md:min-h-[40px] rounded-lg text-xs font-mono font-medium transition-all ${
                      dailyGoal === g
                        ? "bg-emerald-600 text-white shadow-sm font-bold"
                        : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Focus session length: what "Tập trung" starts everywhere */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-violet-500" /> Độ dài phiên tập trung
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">Bấm "Tập trung" ở bất kỳ đâu sẽ học trọn chừng này phút, tắt nhắc nhở.</p>
                </div>
                <span className="text-sm font-bold font-mono text-violet-600 dark:text-violet-400">{focusMinutes}′</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {FOCUS_DURATIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      saveFocusSettings({ minutes: m });
                      setFocusMinutes(m);
                    }}
                    className={`py-2 md:py-1.5 max-md:min-h-[40px] rounded-lg text-xs font-mono font-medium transition-all ${
                      focusMinutes === m
                        ? "bg-violet-600 text-white shadow-sm font-bold"
                        : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300"
                    }`}
                  >
                    {m} phút
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Daily study limits */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-3">
            {([
              {
                key: "newCardsPerDay" as const,
                title: "Số thẻ mới mỗi ngày",
                desc: "Gồm từ mới và lượt tập gõ lại từ đã nhớ (thẻ nhớ lại mới). Giữ thấp để lượng ôn các ngày sau không dồn ứ.",
                options: [3, 5, 8, 10, 20],
              },
              {
                key: "maxSessionSize" as const,
                title: "Số thẻ tối đa mỗi phiên",
                desc: "Từ đến hạn được ưu tiên trước, từ mới xen kẽ đều trong phiên.",
                options: [20, 30, 40, 50, 100],
              },
            ]).map((cfg) => (
              <div key={cfg.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{cfg.title}</div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">{cfg.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                    {studyLimits[cfg.key]}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {cfg.options.map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        saveStudyLimits({ [cfg.key]: val });
                        setStudyLimits((prev) => ({ ...prev, [cfg.key]: val }));
                        setNotifFeedback(`Đã cập nhật "${cfg.title}" thành ${val}!`);
                      }}
                      className={`py-2 md:py-1.5 max-md:min-h-[40px] rounded-lg text-xs font-mono font-medium transition-all ${
                        studyLimits[cfg.key] === val
                          ? "bg-cyan-600 text-white shadow-sm font-bold"
                          : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className="flex items-start justify-between gap-3 pt-2 border-t border-slate-200 dark:border-zinc-800 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Đoán nghĩa trước khi học từ mới</div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Trước thẻ giới thiệu, đoán nghĩa từ trong một câu ví dụ (3 lựa chọn). Đoán trước, kể cả đoán sai, giúp nhớ lâu hơn. Không tính điểm.
                </p>
              </div>
              <input
                type="checkbox"
                checked={pretestOn}
                onChange={(e) => {
                  setPretestEnabled(e.target.checked);
                  setPretestOn(e.target.checked);
                }}
                className="mt-1 accent-cyan-600"
              />
            </label>
          </div>
      </SettingsSection>

      {/* 2. NHẮC HỌC: khi nào app nhắc bạn */}
      <SettingsSection
        id="reminders"
        icon={<Bell className="w-5 h-5" />}
        title="Nhắc học"
        description="Khi nào app nhắc bạn ôn: mỗi bao lâu, vào giờ nào, giờ yên tĩnh."
        summary={reminderSettings.enabled ? (reminderSettings.intervalMinutes > 0 ? `Bật · mỗi ${reminderSettings.intervalMinutes} phút` : "Bật · theo giờ học") : "Đang tắt"}
      >
        <div className="space-y-6">
          {/* SECTION 0: AUTOSTART SYSTEM SETTING */}
          <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="md:flex-wrap flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="md:items-center flex max-md:items-start gap-3">
                <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-md shadow-rose-500/20 max-md:shrink-0">
                  <Power className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 max-md:flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Tự khởi động cùng hệ điều hành
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      Mặc định: Bật
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Tự động mở MyEnglish khi khởi động máy tính để không bỏ lỡ lịch nhắc từ vựng và phím tắt tra từ nhanh
                  </p>
                </div>
              </div>

              {/* Autostart Toggle */}
              <button
                type="button"
                disabled={togglingAutostart}
                onClick={() => handleToggleAutostart(!autostart)}
                className={`w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold transition-all flex items-center max-md:justify-center gap-2 shadow-sm max-md:shrink-0 disabled:opacity-50 ${
                  autostart
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    autostart ? "bg-white animate-pulse" : "bg-slate-400"
                  }`}
                />
                <span>
                  {togglingAutostart
                    ? "Đang cập nhật..."
                    : autostart
                    ? "Tự khởi động: Bật"
                    : "Tự khởi động: Tắt"}
                </span>
              </button>
            </div>
          </div>

          {/* SECTION 1: SETTINGS & SCHEDULE CONFIGURATION */}
          <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-6 shadow-sm">
            <div className="md:flex-wrap flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white shadow-md shadow-cyan-500/20 max-md:shrink-0">
                  <Sliders className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Cấu hình Lịch nhắc & Pop-up Quiz (Focus Review)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Tùy chỉnh tần suất nhắc nhở, thời gian hoãn (Snooze), dạng câu hỏi và hiệu ứng mờ màn hình
                  </p>
                </div>
              </div>

              {/* Master Toggle */}
              <button
                onClick={() => handleUpdateReminder({ enabled: !reminderSettings.enabled })}
                className={`w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold transition-all flex items-center max-md:justify-center gap-2 shadow-sm max-md:shrink-0 ${
                  reminderSettings.enabled
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${reminderSettings.enabled ? "bg-white animate-pulse" : "bg-slate-400"}`} />
                <span>{reminderSettings.enabled ? "Đang bật Pop-up" : "Đã tạm dừng"}</span>
              </button>
            </div>

            {/* Realtime Schedule & Countdown Card */}
            {reminderSettings.enabled && reminderSettings.intervalMinutes > 0 && (
              <div className="md:flex-wrap p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-purple-500/10 border border-cyan-200/80 dark:border-cyan-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold shrink-0">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    {pauseReason ? (
                      <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Đang tạm dừng: {pauseReason}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Lần hiển thị kế tiếp:</span>
                        <span className="text-xs font-mono font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-100/80 dark:bg-cyan-950/80 px-2 py-0.5 rounded-md">
                          {formatDisplayTime(nextReminderMs)}
                        </span>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          (Còn lại: <ReminderCountdown nextMs={nextReminderMs} />)
                        </span>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      Lần hiển thị gần nhất: <strong className="text-slate-700 dark:text-zinc-300 font-mono">{formatDisplayTime(lastDisplayMs)}</strong>
                      <span className="ml-2 text-cyan-600 dark:text-cyan-400 font-medium">
                        • Chu kỳ: {reminderSettings.intervalMinutes} phút (tính từ lần cuối popup hiển thị)
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleTestPopupQuiz}
                  disabled={testingPopup}
                  className="w-full sm:w-auto px-3.5 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center max-md:justify-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{testingPopup ? "Đang mở..." : "Hiển thị ngay"}</span>
                </button>
              </div>
            )}

            {/* Active Snooze Alert if currently snoozed */}
            {snoozeMinutesRemaining > 0 && (
              <div className="md:flex-wrap p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                  <Hourglass className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin-slow shrink-0" />
                  <span>
                    Đang trong thời gian hoãn (Snooze): Còn khoảng{" "}
                    <strong>{snoozeMinutesRemaining} phút</strong> trước lần nhắc kế tiếp.
                  </span>
                </div>
                <button
                  onClick={handleCancelSnooze}
                  className="w-full sm:w-auto px-3 py-2 md:py-1.5 max-md:min-h-[40px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors max-md:flex max-md:items-center max-md:justify-center shrink-0"
                >
                  Hủy hoãn ngay
                </button>
              </div>
            )}

            {/* SETTING FIELDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Field 1: Reminder Interval */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Khoảng thời gian nhắc học:
                  </span>
                  <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                    {reminderSettings.intervalMinutes === 0 ? "Chỉ mở thủ công" : `Mỗi ${reminderSettings.intervalMinutes} phút`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([15, 30, 45, 60, 120, 0] as ReminderInterval[]).map((val) => {
                    const isSelected = reminderSettings.intervalMinutes === val;
                    const label = val === 0 ? "Tắt tự động" : val >= 60 ? `${val / 60} giờ` : `${val} phút`;
                    return (
                      <button
                        key={val}
                        onClick={() => handleUpdateReminder({ intervalMinutes: val })}
                        className={`py-2 md:py-1.5 px-2 max-md:min-h-[40px] rounded-xl text-xs font-semibold transition-all text-center ${
                          isSelected
                            ? "bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"
                            : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-cyan-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                  Khuyên dùng: <strong>30 phút</strong> để vừa tập trung làm việc vừa duy trì nhịp ôn tập đều đặn.
                </p>
              </div>

              {/* Field 2: Snooze Duration */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Hourglass className="w-3.5 h-3.5 text-amber-500" />
                    Thời gian Hoãn học (Snooze):
                  </span>
                  <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                    {reminderSettings.snoozeMinutes} phút
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {([5, 10, 15, 30] as SnoozeDuration[]).map((val) => {
                    const isSelected = reminderSettings.snoozeMinutes === val;
                    return (
                      <button
                        key={val}
                        onClick={() => handleUpdateReminder({ snoozeMinutes: val })}
                        className={`py-2 md:py-1.5 px-2 max-md:min-h-[40px] rounded-xl text-xs font-semibold transition-all text-center ${
                          isSelected
                            ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                            : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-amber-500"
                        }`}
                      >
                        {val} phút
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                  Khi đang bận, bạn chỉ cần bấm nút <strong>Hoãn [S]</strong> trên pop-up để dời thời điểm ôn.
                </p>
              </div>

              {/* Field: fixed study times, e.g. after lunch (the reminder worker only acts on them when the popup is on) */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Giờ học cố định:
                </span>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                  Nhắc đúng lúc bạn hay học trong ngày, mỗi mốc một lần mỗi ngày. Mốc này không bị giới hạn số lần nhắc tối đa.
                </p>
                <div className="space-y-1.5">
                  {(Object.keys(ANCHOR_TIMES) as PresetAnchor[]).map((anchor) => {
                    const chosen = (reminderSettings.anchors ?? []).includes(anchor);
                    return (
                      <label
                        key={anchor}
                        className={`flex items-center gap-2 text-xs ${
                          anchorsActive
                            ? "cursor-pointer text-slate-700 dark:text-zinc-300"
                            : "text-slate-400 dark:text-zinc-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-600"
                          checked={chosen}
                          disabled={!anchorsActive}
                          onChange={(e) => {
                            const current = reminderSettings.anchors ?? [];
                            handleUpdateReminder({
                              anchors: e.target.checked ? [...current, anchor] : current.filter((a) => a !== anchor),
                            });
                          }}
                        />
                        <span>{ANCHOR_TIMES[anchor].label}</span>
                      </label>
                    );
                  })}
                  {customAnchors.map((anchor) => (
                    <label
                      key={anchor}
                      className={`flex items-center gap-2 text-xs ${
                        anchorsActive ? "cursor-pointer text-slate-700 dark:text-zinc-300" : "text-slate-400 dark:text-zinc-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-cyan-600"
                        checked
                        disabled={!anchorsActive}
                        onChange={() =>
                          handleUpdateReminder({ anchors: (reminderSettings.anchors ?? []).filter((a) => a !== anchor) })
                        }
                      />
                      <span>{anchorTime(anchor)?.label}</span>
                    </label>
                  ))}
                </div>
                {anchorsActive && anchorSuggestion && customAnchors.length < MAX_CUSTOM_ANCHORS && (
                  <div className="rounded-xl border border-cyan-200/80 dark:border-cyan-900/60 bg-cyan-50/70 dark:bg-cyan-950/30 p-2.5 space-y-1.5">
                    <p className="text-[11px] text-slate-700 dark:text-zinc-300 leading-snug">
                      Bạn thường bắt đầu học khoảng{" "}
                      <strong>
                        {String(anchorSuggestion.hour).padStart(2, "0")}:{String(anchorSuggestion.minute).padStart(2, "0")}
                      </strong>{" "}
                      ({anchorSuggestion.days}/{anchorSuggestion.activeDays} ngày có học trong 30 ngày qua). Thêm làm giờ nhắc?
                    </p>
                    <div className="flex items-center gap-3 text-[11px] font-semibold">
                      <button
                        className="text-cyan-700 dark:text-cyan-400 hover:underline"
                        onClick={() =>
                          handleUpdateReminder({
                            anchors: [
                              ...(reminderSettings.anchors ?? []),
                              customAnchor(anchorSuggestion.hour, anchorSuggestion.minute) as ReminderAnchor,
                            ],
                          })
                        }
                      >
                        Thêm mốc này
                      </button>
                      <button
                        className="text-slate-500 dark:text-zinc-400 hover:underline"
                        onClick={() => {
                          dismissStudyAnchorSuggestion();
                          setAnchorSuggestion(null);
                        }}
                      >
                        Để sau
                      </button>
                    </div>
                  </div>
                )}
                {!anchorsActive && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                    Chỉ có tác dụng khi bật pop-up và chọn một khoảng thời gian nhắc (không phải &quot;Tắt tự động&quot;).
                  </p>
                )}
              </div>

              {/* Field 3: Trigger Condition */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                  Điều kiện kích hoạt hiển thị:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => handleUpdateReminder({ triggerCondition: "due_only" })}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      reminderSettings.triggerCondition === "due_only"
                        ? "border-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/30 text-cyan-900 dark:text-cyan-200 ring-1 ring-cyan-500"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold">Chỉ khi có từ đến hạn (FSRS)</span>
                    <span className="text-[10px] opacity-75">Tôn trọng chu kỳ phân bổ khoa học</span>
                  </button>

                  <button
                    onClick={() => handleUpdateReminder({ triggerCondition: "due_then_random" })}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      reminderSettings.triggerCondition === "due_then_random"
                        ? "border-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/30 text-cyan-900 dark:text-cyan-200 ring-1 ring-cyan-500"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold">Đến hạn → Hết thì ngẫu nhiên</span>
                    <span className="text-[10px] opacity-75">Ưu tiên đúng hạn, hết thì ôn thêm</span>
                  </button>

                  <button
                    onClick={() => handleUpdateReminder({ triggerCondition: "all_words" })}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      reminderSettings.triggerCondition === "all_words"
                        ? "border-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/30 text-cyan-900 dark:text-cyan-200 ring-1 ring-cyan-500"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold">Luôn nhắc nhở ngẫu nhiên</span>
                    <span className="text-[10px] opacity-75">Duy trì phản xạ từ vựng liên tục</span>
                  </button>
                </div>
              </div>

              {/* Field 3b: Do not disturb */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80">
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Không làm phiền khi đang bận
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Tự hoãn pop-up khi có ứng dụng toàn màn hình (trình chiếu, video, họp), khi đang chia sẻ màn
                      hình Zoom, khi bật Focus/Không làm phiền (nếu macOS cho phép đọc) hoặc khi bạn rời máy quá 5
                      phút. Khi đến giờ, một thẻ nhỏ hiện ở góc màn hình (không chiếm bàn phím) lúc bạn tạm dừng
                      thao tác; bỏ qua thì thẻ tự hoãn sau 20 giây, bấm Học ngay để mở bài ôn.
                    </span>
                    {!IS_MAC && (
                      <span className="block text-[11px] font-semibold text-amber-700 dark:text-amber-400 pt-1">
                        Hiện chỉ hoạt động trên macOS.
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.respectFocus}
                    onChange={(e) => handleUpdateReminder({ respectFocus: e.target.checked })}
                  />
                </label>
                <label className="mt-3 pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Luôn hiện trên màn hình chính
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Mặc định nhắc nhở hiện trên màn hình bạn đang làm việc (nơi có con trỏ chuột).
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.preferPrimaryMonitor}
                    onChange={(e) => handleUpdateReminder({ preferPrimaryMonitor: e.target.checked })}
                  />
                </label>
                <label className="mt-3 pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Nhắc thông minh
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Học theo thói quen của bạn. Ngoài chu kỳ trên, nhắc sớm hơn vào lúc bạn vừa quay lại máy (buổi
                      sáng, sau khi rời máy hoặc máy ngủ), vừa tắt chia sẻ màn hình hoặc vừa thoát ứng dụng toàn màn
                      hình, cách lời nhắc trước ít nhất 20 phút. Đồng thời né giờ mà 30 ngày gần nhất lời nhắc gần như
                      luôn bị hoãn hoặc bỏ qua (lời nhắc lúc chuyển việc vẫn hiện, và vài ngày một lần app thử nhắc lại
                      ở giờ đó để xem thói quen của bạn có đổi không). Giờ bạn hay trả lời nhất luôn giữ được một lời
                      nhắc mỗi ngày, kể cả khi đã hết số lần nhắc tối đa. Chỉ khi có thẻ cần ôn.
                      {getQuietHours().length > 0 && ` Hiện đang né: ${getQuietHours().map((h) => `${h}h`).join(", ")}.`}
                      {getBestReminderHour() !== null && ` Giờ bạn hay trả lời nhất: ${getBestReminderHour()}h.`}
                    </span>
                    {!IS_MAC && (
                      <span className="block text-[11px] font-semibold text-amber-700 dark:text-amber-400 pt-1">
                        Phần nhắc lúc chuyển việc hiện chỉ hoạt động trên macOS.
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.smartReminders}
                    onChange={(e) => handleUpdateReminder({ smartReminders: e.target.checked })}
                  />
                </label>
                <label className="mt-3 pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Thông báo hệ thống khi bỏ lỡ lời nhắc
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Thẻ nhắc ở góc màn hình tự đóng sau vài giây. Nếu 2 thẻ liên tiếp trôi qua mà bạn chưa kịp nhìn
                      (chưa rê chuột vào), lần nhắc kế tiếp sẽ là một thông báo nằm lại trong Trung tâm thông báo cho
                      đến khi bạn xem. Tối đa 2 lần mỗi ngày, vẫn tôn trọng giờ ban đêm, giới hạn số lần nhắc mỗi
                      ngày và mục tiêu ngày.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.escalateMissed}
                    onChange={(e) => handleUpdateReminder({ escalateMissed: e.target.checked })}
                  />
                </label>
                <label className="mt-3 pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Xong mục tiêu ngày thì thôi nhắc
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Đạt mục tiêu hôm nay rồi thì nghỉ, mai nhắc tiếp. Bạn vẫn có thể tự mở bài ôn bất cứ lúc nào.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.stopAfterGoal}
                    onChange={(e) => handleUpdateReminder({ stopAfterGoal: e.target.checked })}
                  />
                </label>
                <label className="mt-3 pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Không nhắc ban đêm ({NIGHT_QUIET_START}:00–{String(NIGHT_QUIET_END).padStart(2, "0")}:00)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Ngủ đủ giúp nhớ từ tốt hơn học khuya.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.nightQuiet}
                    onChange={(e) => handleUpdateReminder({ nightQuiet: e.target.checked })}
                  />
                </label>
                <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3">
                  <span className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Tối đa số lần nhắc mỗi ngày
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Nhắc quá nhiều dễ thành thói quen bấm bỏ qua.
                    </span>
                  </span>
                  <select
                    className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 shrink-0"
                    value={reminderSettings.maxNudgesPerDay}
                    onChange={(e) => handleUpdateReminder({ maxNudgesPerDay: Number(e.target.value) })}
                  >
                    {[4, 6, 8, 12, 0].map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "Không giới hạn" : `${n} lần`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Field 4: Words per Session */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Số lượng từ mỗi lần Pop-up:
                  </span>
                  <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                    {reminderSettings.wordsPerSession} từ / phiên
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { count: 3, label: "3 từ", desc: "~15s nhanh" },
                    { count: 5, label: "5 từ", desc: "~30s chuẩn" },
                    { count: 10, label: "10 từ", desc: "~1p sâu" },
                  ].map((item) => {
                    const isSelected = reminderSettings.wordsPerSession === item.count;
                    return (
                      <button
                        key={item.count}
                        onClick={() => handleUpdateReminder({ wordsPerSession: item.count })}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center flex flex-col items-center gap-0.5 ${
                          isSelected
                            ? "bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"
                            : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-cyan-500"
                        }`}
                      >
                        <span className="font-bold">{item.label}</span>
                        <span className={`text-[10px] ${isSelected ? "text-cyan-100" : "text-slate-400 dark:text-zinc-500"}`}>
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                  Các câu hỏi trong phiên pop-up được tự động phân bổ ngẫu nhiên giữa trắc nghiệm 1-4, gõ từ vựng và tự động xen kẽ các bài ngữ pháp đã học.
                </p>
              </div>

              {/* Field 5: Fullscreen Overlay Blur Level & Audio Policy */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />
                    Độ mờ màn hình (Backdrop Blur):
                  </span>
                  <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                    {reminderSettings.blurOverlay === "light" ? "Mờ nhẹ" : reminderSettings.blurOverlay === "heavy" ? "Mờ đậm" : "Mờ vừa"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "medium", "heavy"] as BlurOverlayLevel[]).map((level) => {
                    const isSelected = reminderSettings.blurOverlay === level;
                    const label = level === "light" ? "Mờ nhẹ" : level === "heavy" ? "Mờ đậm" : "Mờ vừa";
                    return (
                      <button
                        key={level}
                        onClick={() => handleUpdateReminder({ blurOverlay: level })}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                            : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-indigo-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 pt-1">
                  <VolumeX className="w-3.5 h-3.5 shrink-0" />
                  <span>Đã tắt âm thanh tự động khi hiển thị từ để không làm phiền bạn.</span>
                </div>
                <label className="pt-2 border-t border-slate-200/80 dark:border-zinc-800/80 flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                      Âm báo nhẹ khi hiện thẻ nhắc
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 block leading-snug">
                      Phát một tiếng chuông gió ngắn và êm khi thẻ nhắc xuất hiện ở góc màn hình để bạn dễ nhận biết.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-cyan-600 shrink-0"
                    checked={reminderSettings.nudgeSound !== false}
                    onChange={(e) => handleUpdateReminder({ nudgeSound: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 3. GIAO DIỆN: chế độ, cỡ chữ, âm thanh, giọng đọc */}
      <SettingsSection
        id="display"
        icon={<Palette className="w-5 h-5" />}
        title="Giao diện, âm thanh & giọng đọc"
        description="Chế độ đơn giản, chế độ mất gốc, cỡ chữ, âm thanh phản hồi, giọng đọc tiếng Anh."
        defaultOpen={false}
      >
        <DisplaySettings />
      </SettingsSection>

      {/* 4. AI: không bắt buộc để học, thu gọn (chỉ hiển thị trên bản Desktop) */}
      {isDesktopApp && (
      <SettingsSection
        id="ai"
        tone="muted"
        icon={<Bot className="w-5 h-5" />}
        title="AI (không bắt buộc)"
        description="Chỉ cần cho các tính năng AI như Viết và sửa lỗi. Không có AI bạn vẫn học bình thường."
        summary={!cliStatus ? "Đang kiểm tra…" : cliStatus.installed ? "● Đã kết nối" : "○ Chưa kết nối"}
        defaultOpen={false}
      >
        <div className="space-y-6">
          {/* AI CLI status: information only. Without it the app still works; only the AI features are off */}
          <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  cliStatus?.installed
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700"
                }`}
              >
                {cliStatus?.installed ? <CheckCircle2 className="w-5 h-5" /> : <Terminal className="w-5 h-5" />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Trạng thái AI CLI (Claude hoặc Gemini):
                  </span>
                  <span
                    className={`text-xs font-semibold font-mono px-2.5 py-0.5 rounded-full border ${
                      cliStatus?.installed
                        ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700"
                    }`}
                  >
                    {cliStatus === null ? "○ ĐANG KIỂM TRA" : cliStatus.installed ? "● ĐÃ KẾT NỐI" : "○ CHƯA KẾT NỐI"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {cliStatus?.installed
                    ? "Sẵn sàng cho các tính năng AI."
                    : "Bạn vẫn học bình thường khi chưa có. Chỉ các tính năng AI (như Viết và sửa lỗi) cần AI CLI."}
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                  Đường dẫn:{" "}
                  <span className="text-slate-800 dark:text-zinc-200 font-bold">
                    {cliStatus?.path || "~/.gemini/antigravity-cli"}
                  </span>
                </p>
                {cliStatus?.details && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ {cliStatus.details}</p>
                )}
                {cliStatus?.error && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Chi tiết: {cliStatus.error}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => checkCli()}
              disabled={checkingCli}
              className="w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-colors flex items-center justify-center gap-2 shrink-0 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingCli ? "animate-spin" : ""}`} />
              <span>Kiểm tra lại kết nối</span>
            </button>
          </div>

          {/* Custom CLI Path Configuration (Especially for Windows or custom install paths) */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Đường dẫn CLI tùy chỉnh (Tự động nhận diện hoặc chỉ định thủ công)
                </span>
              </div>
              {customCliPath && (
                <button
                  type="button"
                  onClick={handleResetCustomPath}
                  className="text-[11px] text-slate-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
                >
                  Đặt lại mặc định
                </button>
              )}
            </div>
            <form onSubmit={handleSaveCustomPath} autoComplete="off" className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={customCliPath}
                onChange={(e) => setCustomCliPath(e.target.value)}
                placeholder="Ví dụ: C:\Users\<tên bạn>\.gemini\antigravity-cli (hoặc C:\Users\<tên bạn>\.gemini\antigravity-cli\agy.exe)"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-gramm="false"
                data-enable-grammarly="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                className="flex-1 w-full px-3.5 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-base md:text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="submit"
                disabled={checkingCli}
                className="w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs transition-colors shrink-0 shadow-sm flex items-center justify-center gap-1.5"
              >
                {customCliSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Đã lưu!</span>
                  </>
                ) : (
                  <span>Lưu & Kiểm tra</span>
                )}
              </button>
            </form>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              Hệ thống tự động tìm trong <code className="font-mono text-cyan-600 dark:text-cyan-400">.gemini\antigravity-cli</code>, <code className="font-mono text-cyan-600 dark:text-cyan-400">.gemini\bin</code>, và biến môi trường PATH. Nếu bạn cài đặt ở đường dẫn riêng, hãy dán đường dẫn thư mục hoặc file <code className="font-mono text-cyan-600 dark:text-cyan-400">agy.exe</code> vào ô trên.
            </p>
          </div>
          {/* OS Switcher Tabs */}
          <div className="p-1.5 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedOs("macos")}
                className={`px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold transition-all flex items-center max-md:justify-center gap-2 shadow-sm ${
                  selectedOs === "macos"
                    ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white border border-slate-200/80 dark:border-zinc-700 shadow-md"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.87-.93.04-2.02.63-2.67 1.38-.56.65-.98 1.7-0.85 2.76 1.04.08 2.07-.53 2.6-1.27z" />
                </svg>
                <span>Hướng dẫn macOS</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOs("windows")}
                className={`px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold transition-all flex items-center max-md:justify-center gap-2 shadow-sm ${
                  selectedOs === "windows"
                    ? "bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-400 border border-slate-200/80 dark:border-zinc-700 shadow-md"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801" />
                </svg>
                <span>Hướng dẫn Windows (10 / 11)</span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-200/60 dark:bg-zinc-700/50 text-[11px] font-mono text-slate-600 dark:text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              <span>Đang chọn: {selectedOs === "macos" ? "macOS" : "Windows"}</span>
            </div>
          </div>

          {/* Account compatibility notice */}
          <div className="p-4 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/50 space-y-2">
            <div className="flex items-center gap-2 text-cyan-800 dark:text-cyan-300 font-bold text-xs uppercase tracking-wider font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>Khả năng tương thích tài khoản Google (Free vs Plus)</span>
            </div>
            <ul className="text-xs text-slate-700 dark:text-zinc-300 space-y-1.5 list-disc pl-5 leading-relaxed">
              <li>
                <strong className="text-slate-900 dark:text-white">Tài khoản cá nhân Free (Gmail miễn phí):</strong>{" "}
                Hoàn toàn sử dụng được! Bạn chỉ cần đăng nhập qua trình duyệt khi CLI yêu cầu. Hệ thống cấp hạn ngạch (quota) hàng ngày đủ để bạn tra cứu và học hàng trăm từ vựng mới mỗi ngày.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-white">Tài khoản Plus / Advanced (Google One AI Premium / Workspace):</strong>{" "}
                Được ưu tiên băng thông, tốc độ sinh từ vựng và câu ví dụ nhanh hơn với giới hạn request cao hơn.
              </li>
            </ul>
          </div>

          {/* ============================================================== */}
          {/* GUIDE FOR MACOS                                                */}
          {/* ============================================================== */}
          {selectedOs === "macos" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="p-1 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.87-.93.04-2.02.63-2.67 1.38-.56.65-.98 1.7-0.85 2.76 1.04.08 2.07-.53 2.6-1.27z" />
                    </svg>
                  </span>
                  <span>Quy trình cài đặt & Kết nối Antigravity CLI trên macOS</span>
                </h3>
                <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                  Binary: ~/.gemini/bin/agy
                </span>
              </div>

              {/* Step 1: Install */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      1
                    </span>
                    Tải & Cài đặt Antigravity CLI
                  </span>
                  <button
                    onClick={() => handleCopy("curl -fsSL https://antigravity.google/install.sh | bash", "mac-1")}
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "mac-1" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "mac-1" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>curl -fsSL https://antigravity.google/install.sh | bash</code>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
                  <p>• Hoặc nếu máy bạn đã có Node.js / npm, có thể chạy lệnh: <code className="text-cyan-600 dark:text-cyan-400 font-mono">npm install -g @google/antigravity-cli</code></p>
                  <p>• Script sẽ tự động tải binary và đặt vào thư mục người dùng: <code className="text-cyan-600 dark:text-cyan-400 font-mono">~/.gemini/bin/agy</code></p>
                </div>
              </div>

              {/* Step 2: Permissions & PATH */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      2
                    </span>
                    Cấp quyền thực thi & Đưa vào biến môi trường PATH
                  </span>
                  <button
                    onClick={() =>
                      handleCopy("chmod +x ~/.gemini/bin/agy && echo 'export PATH=\"$HOME/.gemini/bin:$PATH\"' >> ~/.zshrc && source ~/.zshrc", "mac-2")
                    }
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "mac-2" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "mac-2" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>chmod +x ~/.gemini/bin/agy &amp;&amp; echo 'export PATH="$HOME/.gemini/bin:$PATH"' &gt;&gt; ~/.zshrc &amp;&amp; source ~/.zshrc</code>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Lệnh này đảm bảo binary có quyền chạy trên macOS và bạn có thể gõ trực tiếp lệnh <code className="text-cyan-600 dark:text-cyan-400 font-mono">agy</code> trong mọi cửa sổ Terminal.
                </p>
              </div>

              {/* Step 3: Auth */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      3
                    </span>
                    Đăng nhập tài khoản Google (Xác thực 1 lần duy nhất)
                  </span>
                  <button
                    onClick={() => handleCopy("~/.gemini/bin/agy auth login", "mac-3")}
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "mac-3" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "mac-3" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>~/.gemini/bin/agy auth login</code>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Mở Terminal và dán lệnh trên. Trình duyệt Safari/Chrome sẽ tự động mở trang xác thực của Google. Bạn chỉ cần chọn tài khoản Gmail và bấm <strong>Cho phép (Allow)</strong>.
                </p>
              </div>

              {/* Step 4: Test & App Connection */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      4
                    </span>
                    Kiểm tra phản hồi & Kết nối với MyEnglish
                  </span>
                  <button
                    onClick={() =>
                      handleCopy('~/.gemini/bin/agy --dangerously-skip-permissions --model gemini-3.8-flash-low -p "Hello, world!"', "mac-4")
                    }
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "mac-4" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "mac-4" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>~/.gemini/bin/agy --dangerously-skip-permissions --model gemini-3.8-flash-low -p "Hello, world!"</code>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
                  <p>• Khi lệnh in ra câu chào phản hồi từ Gemini, CLI đã hoạt động hoàn toàn chính xác.</p>
                  <p>• <strong>Trong app MyEnglish</strong>: Ứng dụng tự động phát hiện đường dẫn <code className="text-cyan-600 dark:text-cyan-400 font-mono">~/.gemini/bin/agy</code>. Bạn chỉ cần nhấn nút <strong>"Kiểm tra lại kết nối"</strong> ở banner trên để thấy trạng thái xanh lá.</p>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* GUIDE FOR WINDOWS (10 / 11)                                    */}
          {/* ============================================================== */}
          {selectedOs === "windows" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="p-1 rounded-md bg-cyan-600 text-white">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801" />
                    </svg>
                  </span>
                  <span>Quy trình cài đặt & Kết nối Antigravity CLI trên Windows (10 / 11)</span>
                </h3>
                <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                  Binary: agy.exe
                </span>
              </div>

              {/* Step 1: Install Windows */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      1
                    </span>
                    Cài đặt Antigravity CLI qua PowerShell (Khuyên dùng)
                  </span>
                  <button
                    onClick={() => handleCopy("iwr -useb https://antigravity.google/install.ps1 | iex", "win-1")}
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "win-1" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "win-1" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>iwr -useb https://antigravity.google/install.ps1 | iex</code>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
                  <p>• Nhấn phím <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 border text-[10px]">Win</kbd> + <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 border text-[10px]">X</kbd>, chọn <strong>Terminal</strong> hoặc <strong>PowerShell</strong> và dán lệnh trên.</p>
                  <p>• Hoặc nếu máy bạn đã có Node.js: <code className="text-cyan-600 dark:text-cyan-400 font-mono">npm install -g @google/antigravity-cli</code></p>
                  <p>• Thư mục cài đặt mặc định trên Windows: <code className="text-cyan-600 dark:text-cyan-400 font-mono">%USERPROFILE%\.gemini\antigravity-cli\agy.exe</code></p>
                </div>
              </div>

              {/* Step 2: Auth Windows */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      2
                    </span>
                    Đăng nhập tài khoản Google (OAuth Web Login)
                  </span>
                  <button
                    onClick={() => handleCopy("agy auth login", "win-2")}
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "win-2" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "win-2" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>agy auth login</code>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
                  <p>• Nếu PowerShell báo chưa tìm thấy lệnh, hãy dùng đường dẫn đầy đủ: <code className="text-cyan-600 dark:text-cyan-400 font-mono">&amp; "$env:USERPROFILE\.gemini\antigravity-cli\agy.exe" auth login</code></p>
                  <p>• Trình duyệt Edge/Chrome sẽ mở trang đăng nhập Google để bạn xác thực tài khoản Gmail (miễn phí hoặc Plus).</p>
                </div>
              </div>

              {/* Step 3: Test Windows */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      3
                    </span>
                    Chạy thử nghiệm lệnh phân tích trên PowerShell
                  </span>
                  <button
                    onClick={() =>
                      handleCopy('agy --dangerously-skip-permissions --model gemini-3.8-flash-low -p "Hello, world!"', "win-3")
                    }
                    className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                  >
                    {copiedIndex === "win-3" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedIndex === "win-3" ? "Đã copy" : "Copy"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                  <code>agy --dangerously-skip-permissions --model gemini-3.8-flash-low -p "Hello, world!"</code>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Khi nhận được phản hồi câu chào từ Gemini, CLI đã hoạt động thành công trên máy Windows của bạn.
                </p>
              </div>

              {/* Step 4: Configure App on Windows */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                      4
                    </span>
                    Cấu hình & Kết nối trong MyEnglish (Windows)
                  </span>
                </div>
                <div className="text-xs text-slate-700 dark:text-zinc-300 space-y-2 leading-relaxed">
                  <p>
                    Ứng dụng MyEnglish tự động quét các vị trí cài đặt phổ biến trên Windows:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-cyan-700 dark:text-cyan-400">
                    <li>%USERPROFILE%\.gemini\antigravity-cli\agy.exe</li>
                    <li>%LOCALAPPDATA%\Programs\antigravity\agy.exe</li>
                    <li>%APPDATA%\npm\agy.cmd (nếu cài qua npm)</li>
                    <li>Biến môi trường PATH hệ thống (lệnh where agy.exe)</li>
                  </ul>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 space-y-1.5 text-[11px]">
                    <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-cyan-600" />
                      Nếu bạn cài đặt ở thư mục tùy chỉnh (Ví dụ ổ D:\tools\agy.exe):
                    </p>
                    <p className="text-slate-600 dark:text-zinc-400">
                      Hãy dán đường dẫn file <code className="font-mono text-cyan-600 dark:text-cyan-400">agy.exe</code> vào ô <strong>"Đường dẫn CLI tùy chỉnh"</strong> ở trên và bấm <strong>"Lưu &amp; Kiểm tra"</strong>.
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    💡 <em>Lưu ý: Trên Windows, ứng dụng MyEnglish đã được tích hợp cờ <code className="font-mono text-slate-700 dark:text-zinc-300">CREATE_NO_WINDOW</code>, bảo đảm hoàn toàn không xuất hiện cửa sổ Command Prompt màu đen nhấp nháy khi bạn tra từ.</em>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Dùng API key cho CLI: app không có ô nhập key, key được khai báo cho chính CLI */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Key className="w-4 h-4" />
              <span>Dùng API key cho CLI</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Nếu không muốn đăng nhập Google trong CLI, bạn có thể dùng Gemini API Key miễn phí. Ứng dụng không có ô nhập
              key: key được khai báo cho chính CLI trên máy, và mọi lời gọi AI vẫn đi qua CLI đó.
            </p>

            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Cách lấy Gemini API Key:</h4>
              <ol className="text-xs text-slate-600 dark:text-zinc-400 space-y-1.5 list-decimal pl-5 leading-relaxed">
                <li>
                  Truy cập vào trang{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-600 dark:text-cyan-400 underline font-semibold inline-flex items-center gap-1"
                  >
                    Google AI Studio (aistudio.google.com)
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>Đăng nhập bằng tài khoản Google (Gmail thông thường miễn phí).</li>
                <li>Bấm nút <strong>&quot;Create API key&quot;</strong> và copy chuỗi key tạo ra.</li>
                <li>Khai báo key cho CLI theo đoạn bên dưới.</li>
              </ol>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Khai báo key cho chính CLI (ví dụ biến môi trường <code className="font-mono">GEMINI_API_KEY</code> trong shell
              của bạn, hoặc lệnh đăng nhập của CLI). Ứng dụng không lưu API key.
            </p>
          </div>

        </div>
      </SettingsSection>
      )}

      {/* 5. THUẬT TOÁN LỊCH ÔN: nâng cao, đã có sẵn cấu hình mặc định */}
      <SettingsSection
        id="algorithm"
        tone="muted"
        icon={<Brain className="w-5 h-5" />}
        title="Thuật toán lịch ôn (nâng cao)"
        description="Mục tiêu ghi nhớ, từ khó, tối ưu tham số FSRS. Mặc định đã tốt, ít khi cần đổi."
        summary={`Mục tiêu ghi nhớ ${Math.round(fsrsSettings.requestRetention * 100)}%`}
        defaultOpen={false}
      >
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono">
                <Zap className="w-4 h-4 text-amber-500" />
                <Jargon
                  term="Thuật toán Spaced Repetition Thế Hệ Mới: FSRS"
                  plain="Thuật toán lịch ôn thông minh"
                  hint="FSRS: tính ngày ôn lại theo độ khó, độ bền và khả năng nhớ của từng từ"
                />
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
                <Jargon term="FSRS-6 Active (DSR Model)" plain="Đang bật" hint="Phiên bản FSRS-6 đang chạy trong app" />
              </span>
            </div>

            {/* Retention Control Widget */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Mục tiêu ghi nhớ (Desired Retention)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Xác suất bạn muốn nhớ được từ khi đến ngày hẹn ôn tập. Mặc định 90% (tối ưu nhất).
                  </p>
                </div>
                <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                  {Math.round(fsrsSettings.requestRetention * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[0.8, 0.85, 0.9, 0.95].map((val) => (
                  <button
                    key={val}
                    onClick={() => {
                      saveFSRSSettings({ requestRetention: val });
                      setFsrsSettings((prev) => ({ ...prev, requestRetention: val }));
                      setNotifFeedback(`Đã cập nhật mục tiêu ghi nhớ FSRS thành ${Math.round(val * 100)}%!`);
                    }}
                    className={`py-2 md:py-1.5 max-md:min-h-[40px] rounded-lg text-xs font-mono font-medium transition-all ${
                      fsrsSettings.requestRetention === val
                        ? "bg-cyan-600 text-white shadow-sm font-bold"
                        : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300"
                    }`}
                  >
                    {Math.round(val * 100)}%{val === 0.9 ? " (Chuẩn)" : ""}
                  </button>
                ))}
              </div>
            </div>

            <AdvancedLearningSettings onWordsChanged={onRefreshWords} />

            <div className="text-xs text-slate-700 dark:text-zinc-300 space-y-2 leading-relaxed">
              <p>
                <strong>
                  1.{" "}
                  <Jargon
                    term='Khắc phục "Ease Hell" của SM-2'
                    plain="Không bị kẹt ở chu kỳ ngắn"
                    hint="SM-2 là thuật toán cũ: sau nhiều lần quên, hệ số ôn bị hạ mãi nên từ hiện quá dày"
                  />
                  :
                </strong>{" "}
                FSRS không dùng hệ số cố định mà mô hình hóa trí nhớ theo 3 biến số <strong>DSR (Độ khó - Độ bền - Khả năng nhớ lại)</strong>. Khi bạn bấm quên một từ, thuật toán sẽ tự cân bằng lại chứ không phạt kẹt từ ở chu kỳ ngắn vĩnh viễn.
              </p>
              <p>
                <strong>2. Giảm 20% – 30% số lượt ôn tập:</strong> Khoảng cách ôn được tính toán toán học chính xác theo đường cong quên Ebbinghaus hiện đại, giúp bạn nhớ lâu hơn nhưng tốn ít thời gian lặp lại hơn.
              </p>
              <p>
                <strong>3. Tiến trình quét ngầm thông minh:</strong> Khi ứng dụng MyEnglish đang mở (hoặc thu nhỏ ở Dock/Tray), tiến trình ngầm sẽ tự động quét cơ sở dữ liệu định kỳ theo số phút bạn cấu hình ở trên để nhắc bạn ôn tập kịp thời.
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 6. DỮ LIỆU & ĐẶT LẠI */}
      <SettingsSection
        id="data"
        tone="muted"
        icon={<Database className="w-5 h-5" />}
        title="Dữ liệu & đặt lại"
        description="Xoá toàn bộ quá trình học để bắt đầu lại như bản cài mới."
        defaultOpen={false}
      >
        <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>Đặt lại ứng dụng từ đầu (Reset Data)</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                Xóa toàn bộ quá trình học, lịch sử ôn tập FSRS, từ vựng cá nhân, chuỗi Streak và điểm XP.
                Ứng dụng sẽ tự động nạp lại trọn bộ 5.000 từ vựng Oxford và 31 chương ngữ pháp, sau đó mở lại màn hình khảo sát ban đầu (chọn trình độ, thì bắt đầu học, kế hoạch mỗi ngày).
              </p>
            </div>
            <button
              onClick={() => setShowResetModal(true)}
              className="w-full sm:w-auto px-4 py-2.5 max-md:min-h-[40px] rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center max-md:justify-center gap-2 shrink-0 transition-all shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Đặt lại dữ liệu...</span>
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* 7. CÔNG CỤ CHO NHÀ PHÁT TRIỂN: thu gọn, người học không cần dùng */}
      <details className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-950/40 p-4">
        <summary className="cursor-pointer select-none text-xs font-bold text-slate-600 dark:text-zinc-400">
          Công cụ cho nhà phát triển (kiểm thử thông báo, tạo từ đến hạn)
        </summary>
        <div className="mt-4 space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BellRing className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Trung tâm kiểm tra thực tế (Testing Center)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {/* Test 1: Pop-up Focus Review */}
              <div className="p-4 rounded-2xl border border-cyan-200 dark:border-cyan-800/80 bg-cyan-50/50 dark:bg-cyan-950/20 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span>Test 1: Pop-up Quiz toàn màn hình</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-snug pt-1">
                    Bật ngay cửa sổ làm mờ toàn màn hình. Bạn có thể nhấn <strong>Esc</strong> để tắt nhanh, dùng phím <strong>1-4</strong> để chọn, hoặc <strong>S</strong> để hoãn.
                  </p>
                </div>
                <button
                  onClick={handleTestPopupQuiz}
                  disabled={testingPopup}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all shadow-cyan-600/20"
                >
                  <Zap className={`w-3.5 h-3.5 ${testingPopup ? "animate-bounce" : ""}`} />
                  <span>{testingPopup ? "Đang mở..." : "Bật thử Pop-up Quiz ngay"}</span>
                </button>
              </div>

              {/* Test 2: Native Desktop Notification */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-indigo-500" />
                    <span>Test 2: Gửi thông báo thử</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug pt-1">
                    Gửi một thông báo thử lên màn hình hệ thống (trên macOS kèm tiếng chuông "Glass").
                  </p>
                </div>
                <button
                  onClick={handleTestNotification}
                  disabled={testingNotif}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Bell className={`w-3.5 h-3.5 ${testingNotif ? "animate-bounce" : ""}`} />
                  <span>{testingNotif ? "Đang gửi..." : "Gửi thông báo thử"}</span>
                </button>
              </div>

              {/* Test 3: Mark word due in SQLite */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span>Test 3: Tạo từ đến hạn ôn tập thật</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug pt-1">
                    Đặt 1 từ trong SQLite về quá hạn để kiểm tra thuật toán tự động nhận diện từ đến hạn.
                  </p>
                </div>
                <button
                  onClick={handleMarkDueTest}
                  disabled={testingDueWord}
                  className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>{testingDueWord ? "Đang thiết lập..." : "Đặt 1 từ thành 'Cần ôn ngay'"}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </details>

      <ResetAppDataModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
      />
    </div>
  );
}

/** Whole seconds to the next reminder, as "12m 05s" */
function formatCountdown(totalSec: number) {
  if (totalSec <= 0) return "Đang đến giờ hiển thị!";
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}

/** Counts down by itself, so the page does not re-render every second */
function ReminderCountdown({ nextMs }: { nextMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatCountdown(Math.max(0, Math.ceil((nextMs - now) / 1000)))}</>;
}

/** Why the clock reminder is not showing now, in the same order as the reminder worker (srs.ts) */
function getPauseReason(settings: ReminderSettings, goalMet: boolean): string | null {
  if (isSnoozed()) {
    const until = new Date(settings.snoozedUntil ?? 0).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return `đang hoãn đến ${until}`;
  }
  if (isMainSessionActive()) return "bạn đang ôn trong cửa sổ chính";
  const pause = reminderPause(settings, {
    hour: new Date().getHours(),
    goalReached: goalMet,
    shownToday: getNudgesShownToday(),
  });
  if (pause === "night") return `ban đêm (${NIGHT_QUIET_START}:00–${String(NIGHT_QUIET_END).padStart(2, "0")}:00)`;
  if (pause === "goal_reached") return "đã đạt mục tiêu hôm nay";
  if (pause === "daily_cap") return "đủ số lần nhắc hôm nay";
  return null;
}
