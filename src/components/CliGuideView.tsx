import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
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
  GraduationCap,
  Power,
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
  getRemainingSecondsToNextReminder,
  type ReminderSettings,
  type ReminderInterval,
  type SnoozeDuration,
  type BlurOverlayLevel,
  type GrammarLevel,
} from "@/services/reminderSettings";

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
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [checkingCli, setCheckingCli] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | number | null>(null);

  // Notification & Pop-up state
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [fsrsSettings, setFsrsSettings] = useState(() => getFSRSSettings());
  const [studyLimits, setStudyLimits] = useState(() => getStudyLimits());
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
  const [remainingSeconds, setRemainingSeconds] = useState<number>(getRemainingSecondsToNextReminder());

  const formatDisplayTime = (ms: number) => {
    if (!ms || ms <= 0) return "Chưa từng hiển thị";
    const d = new Date(ms);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const formatCountdown = (totalSec: number) => {
    if (totalSec <= 0) return "Đang đến giờ hiển thị!";
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s < 10 ? "0" : ""}${s}s`;
  };

  // API Key state (optional fallback)
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Custom CLI Path state
  const [customCliPath, setCustomCliPath] = useState("");
  const [customCliSaved, setCustomCliSaved] = useState(false);

  // Active guide subtab
  const [activeGuideTab, setActiveGuideTab] = useState<"cli" | "notification" | "apikey">("cli");
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
      setCliStatus(res);
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

    try {
      const savedKey = localStorage.getItem("myenglish_gemini_api_key");
      if (savedKey) setApiKey(savedKey);
    } catch {}

    const syncSettings = () => {
      setReminderSettings(getReminderSettings());
      setSnoozeMinutesRemaining(getSnoozeRemainingMinutes());
      setLastDisplayMs(getLastPopupDisplayTime());
      setNextReminderMs(getNextReminderTime());
      setRemainingSeconds(getRemainingSecondsToNextReminder());
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
    const interval = setInterval(syncSettings, 1000);
    return () => {
      window.removeEventListener("myenglish-autostart-changed", onAutostartChanged);
      window.removeEventListener("myenglish-reminder-settings-updated", syncSettings);
      window.removeEventListener("myenglish-popup-displayed", syncSettings);
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
    setRemainingSeconds(getRemainingSecondsToNextReminder());
    srsWorker.restart();
    setNotifFeedback("Đã lưu thiết lập nhắc học và cập nhật bộ đếm thời gian!");
  };

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

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (apiKey.trim()) {
        localStorage.setItem("myenglish_gemini_api_key", apiKey.trim());
      } else {
        localStorage.removeItem("myenglish_gemini_api_key");
      }
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2500);
    } catch {}
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

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-4xl mx-auto w-full space-y-6">

      {/* Top Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Hướng dẫn CLI & Tính năng Thông báo
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Kiểm tra trạng thái kết nối AI, cấu hình tài khoản Free/Plus và kiểm thử hệ thống thông báo ôn tập
            </p>
          </div>
        </div>
      </div>

      {/* CLI Live Status Banner */}
      <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              cliStatus?.installed
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                : "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
            }`}
          >
            {cliStatus?.installed ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Trạng thái Antigravity CLI:
              </span>
              <span
                className={`text-xs font-semibold font-mono px-2.5 py-0.5 rounded-full ${
                  cliStatus?.installed
                    ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                }`}
              >
                {cliStatus?.installed ? "● ĐÃ KẾT NỐI (Sẵn sàng)" : "○ CHƯA TÌM THẤY"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
              Đường dẫn nhị phân:{" "}
              <span className="text-slate-800 dark:text-zinc-200 font-bold">
                {cliStatus?.path || "~/.gemini/antigravity-cli"}
              </span>
            </p>
            {cliStatus?.details && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ {cliStatus.details}
              </p>
            )}
            {cliStatus?.error && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Chú ý: {cliStatus.error}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => checkCli()}
          disabled={checkingCli}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-colors flex items-center justify-center gap-2 shrink-0 shadow-sm"
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
        <form onSubmit={handleSaveCustomPath} className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            value={customCliPath}
            onChange={(e) => setCustomCliPath(e.target.value)}
            placeholder="Ví dụ: C:\Users\longn\.gemini\antigravity-cli (hoặc C:\Users\longn\.gemini\antigravity-cli\agy.exe)"
            className="flex-1 w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            type="submit"
            disabled={checkingCli}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs transition-colors shrink-0 shadow-sm flex items-center justify-center gap-1.5"
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

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <button
          onClick={() => setActiveGuideTab("cli")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeGuideTab === "cli"
              ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>1. Cài đặt & Cấu hình CLI (Free & Plus)</span>
        </button>

        <button
          onClick={() => setActiveGuideTab("notification")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeGuideTab === "notification"
              ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>2. Cài đặt Nhắc học & Pop-up Quiz (Focus Review)</span>
        </button>

        <button
          onClick={() => setActiveGuideTab("apikey")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeGuideTab === "apikey"
              ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>3. Tùy chọn Gemini API Key (Không cần CLI)</span>
        </button>
      </div>

      {/* TAB 1: CLI INSTALLATION & CONFIGURATION GUIDE */}
      {activeGuideTab === "cli" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* OS Switcher Tabs */}
          <div className="p-1.5 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedOs("macos")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
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
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
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
        </div>
      )}

      {/* TAB 2: NOTIFICATION & FOCUS REVIEW SETTINGS */}
      {activeGuideTab === "notification" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* SECTION 0: AUTOSTART SYSTEM SETTING */}
          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-md shadow-rose-500/20">
                  <Power className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
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
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 ${
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
          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white shadow-md shadow-cyan-500/20">
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
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
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
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-purple-500/10 border border-cyan-200/80 dark:border-cyan-800/60 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold shrink-0">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Lần hiển thị kế tiếp:
                      </span>
                      <span className="text-xs font-mono font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-100/80 dark:bg-cyan-950/80 px-2 py-0.5 rounded-md">
                        {formatDisplayTime(nextReminderMs)}
                      </span>
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        (Còn lại: {formatCountdown(remainingSeconds)})
                      </span>
                    </div>
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
                  className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{testingPopup ? "Đang mở..." : "Hiển thị ngay"}</span>
                </button>
              </div>
            )}

            {/* Active Snooze Alert if currently snoozed */}
            {snoozeMinutesRemaining > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                  <Hourglass className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin-slow shrink-0" />
                  <span>
                    Đang trong thời gian hoãn (Snooze): Còn khoảng{" "}
                    <strong>{snoozeMinutesRemaining} phút</strong> trước lần nhắc kế tiếp.
                  </span>
                </div>
                <button
                  onClick={handleCancelSnooze}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
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
                        className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition-all text-center ${
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
                        className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition-all text-center ${
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

              {/* Field 3: Trigger Condition */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                  Điều kiện kích hoạt hiển thị:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      thao tác; bỏ qua thì bài ôn tự mở sau 20 giây, bấm Hoãn để dời lại.
                    </span>
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
                  Các câu hỏi trong phiên pop-up được tự động phân bổ ngẫu nhiên giữa trắc nghiệm 1-4 và gõ từ vựng.
                </p>
              </div>

              {/* Field 5: Grammar Review in Popup & Level Multi-Select */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Ôn tập ngữ pháp trong Pop-up:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateReminder({ includeGrammar: !reminderSettings.includeGrammar })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      reminderSettings.includeGrammar !== false ? "bg-cyan-600" : "bg-slate-300 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        reminderSettings.includeGrammar !== false ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                  Tự động xen kẽ câu hỏi ngữ pháp song song với từ vựng trong mỗi phiên Pop-up theo thuật toán Spaced Repetition.
                </p>

                {reminderSettings.includeGrammar !== false && (
                  <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 dark:text-zinc-300">
                        Cấp độ ngữ pháp ôn tập (chọn nhiều):
                      </span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">
                        {(reminderSettings.grammarLevels || []).join(", ") || "Chưa chọn"}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {(["A1", "A2", "B1", "B2", "C1"] as GrammarLevel[]).map((lvl) => {
                        const currentLevels = reminderSettings.grammarLevels || ["A1", "A2", "B1"];
                        const isSelected = currentLevels.includes(lvl);
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              let next: GrammarLevel[];
                              if (isSelected) {
                                next = currentLevels.filter((l) => l !== lvl);
                                if (next.length === 0) next = [lvl];
                              } else {
                                next = [...currentLevels, lvl];
                              }
                              handleUpdateReminder({ grammarLevels: next });
                            }}
                            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center border ${
                              isSelected
                                ? "bg-cyan-600 border-cyan-500 text-white shadow-sm shadow-cyan-600/30"
                                : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-cyan-400"
                            }`}
                          >
                            {lvl}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 italic">
                      Chỉ các câu hỏi thuộc cấp độ được chọn ở trên sẽ được đưa vào hàng đợi Pop-up.
                    </p>
                  </div>
                )}
              </div>

              {/* Field 6: Fullscreen Overlay Blur Level & Audio Policy */}
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
              </div>
            </div>
          </div>

          {/* SECTION 2: INTERACTIVE TEST CENTER */}
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
                    <span>Test 2: Bắn thông báo macOS</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug pt-1">
                    Gửi thông báo test lên Notification Center của macOS kèm chuông báo "Glass".
                  </p>
                </div>
                <button
                  onClick={handleTestNotification}
                  disabled={testingNotif}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Bell className={`w-3.5 h-3.5 ${testingNotif ? "animate-bounce" : ""}`} />
                  <span>{testingNotif ? "Đang gửi..." : "Gửi thông báo test macOS"}</span>
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
          </div>

          {/* SECTION 3: FSRS ALGORITHM EXPLANATION & CONFIGURATION */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Thuật toán Spaced Repetition Thế Hệ Mới: FSRS (DSR Model)</span>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
                FSRS-6 Active
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
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[0.8, 0.85, 0.9, 0.95].map((val) => (
                  <button
                    key={val}
                    onClick={() => {
                      saveFSRSSettings({ requestRetention: val });
                      setFsrsSettings((prev) => ({ ...prev, requestRetention: val }));
                      setNotifFeedback(`Đã cập nhật mục tiêu ghi nhớ FSRS thành ${Math.round(val * 100)}%!`);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
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

            {/* Daily study limits */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-3">
              {([
                {
                  key: "newCardsPerDay" as const,
                  title: "Số từ mới mỗi ngày",
                  desc: "Giới hạn số từ chưa học được đưa vào ôn mỗi ngày để lượng ôn tập không dồn ứ.",
                  options: [5, 10, 20, 30],
                },
                {
                  key: "maxSessionSize" as const,
                  title: "Số thẻ tối đa mỗi phiên",
                  desc: "Từ đến hạn được ưu tiên trước, từ mới xen kẽ đều trong phiên.",
                  options: [15, 30, 50, 100],
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
                  <div className="grid grid-cols-4 gap-2">
                    {cfg.options.map((val) => (
                      <button
                        key={val}
                        onClick={() => {
                          saveStudyLimits({ [cfg.key]: val });
                          setStudyLimits((prev) => ({ ...prev, [cfg.key]: val }));
                          setNotifFeedback(`Đã cập nhật "${cfg.title}" thành ${val}!`);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
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
            </div>

            <div className="text-xs text-slate-700 dark:text-zinc-300 space-y-2 leading-relaxed">
              <p>
                <strong>1. Khắc phục hoàn toàn "Ease Hell" của SM-2:</strong> FSRS không dùng hệ số cố định mà mô hình hóa trí nhớ theo 3 biến số <strong>DSR (Độ khó - Độ bền - Khả năng nhớ lại)</strong>. Khi bạn bấm quên một từ, thuật toán sẽ tự cân bằng lại chứ không phạt kẹt từ ở chu kỳ ngắn vĩnh viễn.
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
      )}

      {/* TAB 3: GEMINI API KEY OPTION (STANDALONE ALTERNATIVE) */}
      {activeGuideTab === "apikey" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Key className="w-4 h-4" />
              <span>Giải pháp thay thế: Sử dụng Google Gemini API Key trực tiếp</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Nếu bạn muốn mang ứng dụng MyEnglish sang một máy tính khác (hoặc gửi cho người khác dùng) mà máy đó <strong>không cài đặt Antigravity CLI</strong>, bạn chỉ cần lấy một <strong>Gemini API Key miễn phí</strong> từ Google AI Studio dán vào đây:
            </p>

            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Cách lấy Gemini API Key miễn phí 100%:</h4>
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
                <li>Bấm nút <strong>"Create API key"</strong> và copy chuỗi key tạo ra.</li>
                <li>Dán key vào ô bên dưới và bấm Lưu.</li>
              </ol>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-3">
              <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 block">
                Cấu hình Gemini API Key:
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-cyan-500 shadow-sm"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  Lưu cấu hình
                </button>
              </div>
              {apiKeySaved && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 animate-in fade-in">
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã lưu API Key thành công vào bộ nhớ ứng dụng!</span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
