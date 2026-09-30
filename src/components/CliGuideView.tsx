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
} from "lucide-react";
import {
  sendTestNotification,
  markWordDueImmediately,
  srsWorker,
} from "@/services/srs";
import {
  getReminderSettings,
  saveReminderSettings,
  triggerReviewPopup,
  cancelSnooze,
  getSnoozeRemainingMinutes,
  type ReminderSettings,
  type ReminderInterval,
  type QuizMode,
  type SnoozeDuration,
  type BlurOverlayLevel,
} from "@/services/reminderSettings";

interface CliStatus {
  installed: boolean;
  path: string;
  details?: string;
  error?: string;
}

interface CliGuideViewProps {
  onRefreshWords?: () => void;
  onNavigateTab?: (tab: "library" | "capture" | "review" | "analytics" | "guide") => void;
}

export default function CliGuideView({ onRefreshWords, onNavigateTab }: CliGuideViewProps) {
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [checkingCli, setCheckingCli] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Notification & Pop-up state
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [testingNotif, setTestingNotif] = useState(false);
  const [testingDueWord, setTestingDueWord] = useState(false);
  const [testingPopup, setTestingPopup] = useState(false);

  // Reminder settings state
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(getReminderSettings());
  const [snoozeMinutesRemaining, setSnoozeMinutesRemaining] = useState<number>(getSnoozeRemainingMinutes());

  // API Key state (optional fallback)
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // Active guide subtab
  const [activeGuideTab, setActiveGuideTab] = useState<"cli" | "notification" | "apikey">("cli");

  const checkCli = async () => {
    setCheckingCli(true);
    try {
      const res = await invoke<CliStatus>("check_cli_status");
      setCliStatus(res);
    } catch (err) {
      setCliStatus({
        installed: false,
        path: "~/.gemini/bin/agy",
        error: String(err),
      });
    } finally {
      setCheckingCli(false);
    }
  };

  useEffect(() => {
    checkCli();

    try {
      const savedKey = localStorage.getItem("myenglish_gemini_api_key");
      if (savedKey) setApiKey(savedKey);
    } catch {}

    const syncSettings = () => {
      setReminderSettings(getReminderSettings());
      setSnoozeMinutesRemaining(getSnoozeRemainingMinutes());
    };
    window.addEventListener("myenglish-reminder-settings-updated", syncSettings);
    const interval = setInterval(syncSettings, 3000);
    return () => {
      window.removeEventListener("myenglish-reminder-settings-updated", syncSettings);
      clearInterval(interval);
    };
  }, []);

  const handleUpdateReminder = (partial: Partial<ReminderSettings>) => {
    const updated = saveReminderSettings(partial);
    setReminderSettings(updated);
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

  const handleCopy = (text: string, index: number) => {
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
                {cliStatus?.path || "~/.gemini/bin/agy"}
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
          onClick={checkCli}
          disabled={checkingCli}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-colors flex items-center justify-center gap-2 shrink-0 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checkingCli ? "animate-spin" : ""}`} />
          <span>Kiểm tra lại kết nối</span>
        </button>
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

          {/* Installation Steps */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Các bước cài đặt & kích hoạt CLI</span>
            </h3>

            {/* Step 1 */}
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                    1
                  </span>
                  Cấp quyền thực thi và đưa binary CLI vào thư mục người dùng
                </span>
                <button
                  onClick={() => handleCopy("chmod +x ~/.gemini/bin/agy", 1)}
                  className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                >
                  {copiedIndex === 1 ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedIndex === 1 ? "Đã copy" : "Copy"}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                <code>chmod +x ~/.gemini/bin/agy</code>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Lệnh này cấp quyền thực thi cho binary CLI Antigravity trên macOS.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                    2
                  </span>
                  Đăng nhập tài khoản Google (Free hoặc Plus)
                </span>
                <button
                  onClick={() => handleCopy("~/.gemini/bin/agy auth login", 2)}
                  className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                >
                  {copiedIndex === 2 ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedIndex === 2 ? "Đã copy" : "Copy"}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                <code>~/.gemini/bin/agy auth login</code>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Mở Terminal và chạy lệnh trên. Trình duyệt sẽ mở trang xác thực của Google để bạn đăng nhập tài khoản.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[11px] font-mono">
                    3
                  </span>
                  Kiểm tra thử lệnh sinh từ trực tiếp
                </span>
                <button
                  onClick={() =>
                    handleCopy('~/.gemini/bin/agy --dangerously-skip-permissions -p "Say hello"', 3)
                  }
                  className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                >
                  {copiedIndex === 3 ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedIndex === 3 ? "Đã copy" : "Copy"}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                <code>~/.gemini/bin/agy --dangerously-skip-permissions -p "Say hello"</code>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Nếu lệnh in ra câu chào phản hồi từ Gemini, ứng dụng MyEnglish đã sẵn sàng sinh từ tự động 100%!
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-300 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 flex items-center justify-center text-[11px] font-mono">
                    4
                  </span>
                  Thêm vào PATH hệ thống (Để gõ lệnh ngắn gọn `agy`)
                </span>
                <button
                  onClick={() =>
                    handleCopy('echo \'export PATH="$HOME/.gemini/bin:$PATH"\' >> ~/.zshrc && source ~/.zshrc', 4)
                  }
                  className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 flex items-center gap-1 font-mono"
                >
                  {copiedIndex === 4 ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedIndex === 4 ? "Đã copy" : "Copy"}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto select-all">
                <code>echo 'export PATH="$HOME/.gemini/bin:$PATH"' &gt;&gt; ~/.zshrc &amp;&amp; source ~/.zshrc</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NOTIFICATION & FOCUS REVIEW SETTINGS */}
      {activeGuideTab === "notification" && (
        <div className="space-y-6 animate-in fade-in duration-150">
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
                    <span className="text-xs font-bold">Chỉ khi có từ đến hạn SM-2</span>
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

              {/* Field 4: Preferred Quiz Mode */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                  Dạng câu hỏi trên Pop-up:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { mode: "multiple_choice" as QuizMode, label: "Trắc nghiệm 1-4" },
                    { mode: "typing" as QuizMode, label: "Gõ từ vựng" },
                    { mode: "flashcard" as QuizMode, label: "Lật thẻ SM-2" },
                  ].map((item) => {
                    const isSelected = reminderSettings.quizMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        onClick={() => handleUpdateReminder({ quizMode: item.mode })}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                            : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-indigo-500"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                  Trắc nghiệm 1-4 cho phép bạn trả lời cực nhanh chỉ bằng 1 ngón tay mà không cần chạm chuột.
                </p>
              </div>

              {/* Field 5: Words per Session & Fullscreen Blur Overlay */}
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block">
                  Số lượng từ mỗi lần Pop-up:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { count: 1, label: "1 từ (Micro ~ 5s)" },
                    { count: 3, label: "3 từ (Mini ~ 15s)" },
                    { count: 5, label: "5 từ (Deep)" },
                  ].map((item) => {
                    const isSelected = reminderSettings.wordsPerSession === item.count;
                    return (
                      <button
                        key={item.count}
                        onClick={() => handleUpdateReminder({ wordsPerSession: item.count })}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all text-center ${
                          isSelected
                            ? "bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"
                            : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-cyan-500"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
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

          {/* SECTION 3: SM-2 ALGORITHM EXPLANATION */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Zap className="w-4 h-4" />
              <span>Cơ chế hoạt động của Thuật toán Spaced Repetition (SM-2)</span>
            </div>
            <div className="text-xs text-slate-700 dark:text-zinc-300 space-y-2 leading-relaxed">
              <p>
                <strong>1. Phân bổ chu kỳ giãn cách (SM-2):</strong> Mỗi lần bạn hoàn thành 1 câu hỏi trên Pop-up hoặc lật flashcard, thuật toán sẽ tự động tính toán thời điểm ôn tập tiếp theo (<code>next_review_date</code>): từ quên ôn lại ngay trong ngày, từ nhớ tốt sau 1 ngày, 3 ngày, 6 ngày, 14 ngày...
              </p>
              <p>
                <strong>2. Tiến trình quét ngầm (SRS Background Worker):</strong> Khi ứng dụng MyEnglish đang mở (hoặc thu nhỏ ở thanh Dock), tiến trình ngầm sẽ tự động quét cơ sở dữ liệu SQLite định kỳ theo số phút bạn cấu hình ở trên (mặc định 30 phút).
              </p>
              <p>
                <strong>3. Hiển thị Pop-up thông minh:</strong> Khi đến lịch hẹn, nếu có từ cần ôn tập và bạn không đang ở trạng thái Hoãn (Snooze), màn hình sẽ mờ lại và Pop-up xuất hiện ngay giữa màn hình để bạn ôn luyện nhanh 5 giây.
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
