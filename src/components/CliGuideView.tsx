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
} from "lucide-react";
import {
  sendTestNotification,
  markWordDueImmediately,
} from "@/services/srs";

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

  // Notification state
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [testingNotif, setTestingNotif] = useState(false);
  const [testingDueWord, setTestingDueWord] = useState(false);

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
  }, []);

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
          <span>2. Kiểm tra Thông báo ôn tập (SM-2)</span>
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

      {/* TAB 2: NOTIFICATION SYSTEM & TESTING CENTER */}
      {activeGuideTab === "notification" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Explanation of how notifications work */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Zap className="w-4 h-4" />
              <span>Cơ chế hoạt động của Thông báo ôn tập (Spaced Repetition SM-2)</span>
            </div>
            <div className="text-xs text-slate-700 dark:text-zinc-300 space-y-2 leading-relaxed">
              <p>
                <strong>1. Thuật toán phân bổ chu kỳ (SM-2):</strong> Mỗi lần bạn ôn tập một từ và chấm điểm (
                <em>1: Quên, 2: Khó, 3: Nhớ tốt, 4: Rất dễ</em>), thuật toán sẽ tính toán ngày ôn tập tiếp theo (
                <code>next_review_date</code>): từ mới ôn lại ngay trong ngày, từ nhớ tốt sau 1 ngày, 3 ngày, 6 ngày, 14 ngày...
              </p>
              <p>
                <strong>2. Tiến trình chạy ngầm (SRS Background Worker):</strong> Khi ứng dụng MyEnglish đang mở (hoặc thu nhỏ ở thanh Dock/Menubar), tiến trình ngầm sẽ tự động quét cơ sở dữ liệu SQLite mỗi <strong>15 phút</strong>.
              </p>
              <p>
                <strong>3. Gửi thông báo hệ thống macOS:</strong> Nếu phát hiện có từ vựng đến hạn (<code>next_review_date &le; thời điểm hiện tại</code>), app sẽ gọi plugin thông báo gốc của macOS để gửi thông báo:{" "}
                <em>"MyEnglish • Spaced Repetition: Bạn có X từ vựng sẵn sàng để ôn tập!"</em>
              </p>
            </div>
          </div>

          {/* Interactive Test Panel */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BellRing className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Trung tâm kiểm tra thông báo thực tế (Notification Test Center)</span>
            </h3>

            {/* Permission & System Status */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    Cơ chế thông báo hệ thống macOS (Native Notification Service):
                  </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  ✓ Sẵn sàng hoạt động
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                Ứng dụng sử dụng dịch vụ thông báo Native macOS với chuông báo hệ thống "Glass". Thông báo hiển thị trực tiếp lên góc trên bên phải màn hình và lưu trong Trung tâm thông báo macOS.
              </p>
              <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-2.5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Mẹo trên macOS:</strong> Nếu màn hình đang bật chế độ <strong>Tập trung (Focus Mode / Do Not Disturb)</strong>, macOS sẽ ẩn banner pop-up. Bạn hãy nhấp vào <strong>Ngày/Giờ ở góc trên cùng bên phải thanh menu macOS</strong> để mở Trung tâm thông báo xem danh sách nhắc nhở!
                </span>
              </div>
            </div>

            {/* Test Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {/* Test 1: Send immediate notification */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 space-y-2.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>Test 1: Bắn thông báo thử nghiệm ngay</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                  Gửi ngay một thông báo test lên Notification Center của macOS để kiểm tra âm thanh và hiển thị pop-up.
                </p>
                <button
                  onClick={handleTestNotification}
                  disabled={testingNotif}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Bell className={`w-3.5 h-3.5 ${testingNotif ? "animate-bounce" : ""}`} />
                  <span>{testingNotif ? "Đang gửi..." : "Gửi thông báo test macOS"}</span>
                </button>
              </div>

              {/* Test 2: Mark word due immediately */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 space-y-2.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>Test 2: Tạo từ đến hạn ôn tập thật</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                  Đổi 1 từ trong thư viện về trạng thái quá hạn. Ngay lập tức badge <strong>Daily Review</strong> sẽ đổi số và gửi thông báo nhắc ôn tập thật.
                </p>
                <button
                  onClick={handleMarkDueTest}
                  disabled={testingDueWord}
                  className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>{testingDueWord ? "Đang thiết lập..." : "Đặt 1 từ thành 'Cần ôn tập ngay'"}</span>
                </button>
              </div>
            </div>

            {/* Feedback alert message */}
            {notifFeedback && (
              <div className="p-4 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs text-cyan-950 dark:text-cyan-200 flex items-start justify-between gap-3 animate-in fade-in flex-wrap sm:flex-nowrap">
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
