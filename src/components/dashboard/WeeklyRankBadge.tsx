import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { fetchLeaderboard } from "@/services/leaderboard";

/** "Hạng #N tuần này" under the XP pill; nothing when signed out or the board is unreachable */
export default function WeeklyRankBadge() {
  const user = useAuthStore((s) => s.user);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setRank(null);
      return;
    }
    let cancelled = false;
    const load = () =>
      fetchLeaderboard("week", null, 50)
        .then((rows) => !cancelled && setRank(rows.find((r) => r.isMe)?.rank ?? null))
        .catch(() => {});
    void load();
    window.addEventListener("myenglish-cloud-synced", load);
    return () => {
      cancelled = true;
      window.removeEventListener("myenglish-cloud-synced", load);
    };
  }, [user]);

  if (rank === null) return null;
  return <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">🏆 Hạng {rank} tuần này</p>;
}
