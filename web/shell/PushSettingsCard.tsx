"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Info, AlertCircle } from "lucide-react";
import { getPushStatus, enablePush, disablePush, type PushStatus } from "./push";

/**
 * Settings card for web push notifications: allows learners to receive
 * review reminders even when the MyEnglish tab is closed.
 */
export default function PushSettingsCard() {
  const [status, setStatus] = useState<PushStatus>("off");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    if (working) return;
    setWorking(true);
    try {
      if (status === "on") {
        await disablePush();
        setStatus("off");
      } else if (status === "off") {
        await enablePush();
        const next = await getPushStatus();
        setStatus(next);
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 max-md:p-4 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 max-md:shrink-0">
            <Bell className="w-5 h-5" />
          </span>
          <div>
            <div className="flex items-center gap-2 max-md:flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Thông báo khi đóng tab
              </h3>
              {status === "on" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Đang bật
                </span>
              )}
              {status === "off" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                  Đang tắt
                </span>
              )}
              {status === "denied" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  Bị chặn
                </span>
              )}
              {status === "unsupported" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Chưa hỗ trợ
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Nhắc ôn theo giờ học bạn đã chọn, kể cả khi đã đóng MyEnglish. Không nhắc nếu bạn vừa học trên máy khác.
            </p>
          </div>
        </div>

        {/* Action Toggle / Button */}
        {status === "on" && (
          <button
            type="button"
            disabled={working}
            onClick={handleToggle}
            className="w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold transition-all flex items-center max-md:justify-center gap-2 shadow-sm max-md:shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>{working ? "Đang cập nhật..." : "Thông báo: Bật"}</span>
          </button>
        )}

        {status === "off" && (
          <button
            type="button"
            disabled={working}
            onClick={handleToggle}
            className="w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold transition-all flex items-center max-md:justify-center gap-2 shadow-sm max-md:shrink-0 bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-300 dark:hover:bg-zinc-700 disabled:opacity-50"
          >
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>{working ? "Đang bật..." : "Bật thông báo"}</span>
          </button>
        )}

        {status === "denied" && (
          <button
            type="button"
            disabled
            className="w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold flex items-center max-md:justify-center gap-2 max-md:shrink-0 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 cursor-not-allowed opacity-80"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>Bị chặn</span>
          </button>
        )}

        {status === "unsupported" && (
          <button
            type="button"
            disabled
            className="w-full sm:w-auto px-4 py-2.5 md:py-2 max-md:min-h-[40px] rounded-xl text-xs font-bold flex items-center max-md:justify-center gap-2 max-md:shrink-0 bg-slate-100 dark:bg-zinc-800/60 text-slate-400 dark:text-zinc-500 cursor-not-allowed"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>Chưa hỗ trợ</span>
          </button>
        )}
      </div>

      {status === "denied" && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span className="leading-relaxed">
            Trình duyệt đang chặn thông báo. Bạn hãy mở cài đặt trang web trên thanh địa chỉ của trình duyệt (biểu tượng ổ khóa hoặc nút cài đặt) và cho phép Thông báo (Notifications) cho MyEnglish.
          </span>
        </div>
      )}

      {status === "unsupported" && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-500 dark:text-zinc-400" />
          <span className="leading-relaxed">
            {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
              ? "Trên iPhone: thêm MyEnglish vào Màn hình chính rồi mở từ đó để bật thông báo."
              : "Máy chủ chưa cấu hình thông báo đẩy (thiếu NEXT_PUBLIC_VAPID_PUBLIC_KEY, xem supabase/README.md)."}
          </span>
        </div>
      )}
    </div>
  );
}
