import { Trophy } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import AccountSettings from "./AccountSettings";
import { PAGE_CONTAINER } from "./shared";

/** The account screen: sign in / up, sync state, and a way into the leaderboard */
export default function AccountTab({ onOpenLeaderboard }: { onOpenLeaderboard?: () => void }) {
  const signedIn = useAuthStore((s) => !!s.user);
  return (
    <div className={PAGE_CONTAINER}>
      <div className="space-y-5 max-w-2xl">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Tài khoản</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Đăng nhập, đồng bộ tiến trình giữa các máy và đua XP với bạn bè.</p>
        </div>
        <AccountSettings />
        {signedIn && onOpenLeaderboard && (
          <button
            onClick={onOpenLeaderboard}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            <Trophy className="w-4 h-4 text-amber-500" /> Xem bảng xếp hạng
          </button>
        )}
      </div>
    </div>
  );
}
