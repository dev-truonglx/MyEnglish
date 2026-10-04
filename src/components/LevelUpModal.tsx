import { useState, useEffect } from "react";
import { Sparkles, Trophy, Award, X } from "lucide-react";
import type { AchievementBadge } from "@/services/achievements";
import { triggerConfetti } from "@/utils/confetti";

export default function LevelUpModal() {
  const [levelUpData, setLevelUpData] = useState<{
    newLevel: number;
    totalXP: number;
  } | null>(null);

  const [unlockedBadges, setUnlockedBadges] = useState<AchievementBadge[]>([]);

  useEffect(() => {
    const handleXPUpdate = (e: CustomEvent) => {
      if (e.detail?.leveledUp) {
        setLevelUpData({
          newLevel: e.detail.newLevel,
          totalXP: e.detail.totalXP,
        });
        triggerConfetti(3000);
      }
    };

    const handleBadgeUnlocked = (e: CustomEvent) => {
      if (e.detail?.badges && e.detail.badges.length > 0) {
        const incoming = e.detail.badges as AchievementBadge[];
        // Dedupe by id (same badge may be dispatched twice); confetti is fired by achievements.ts
        setUnlockedBadges((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          const fresh: AchievementBadge[] = [];
          for (const b of incoming) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            fresh.push(b);
          }
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    };

    window.addEventListener("myenglish-xp-updated" as any, handleXPUpdate);
    window.addEventListener("myenglish-badge-unlocked" as any, handleBadgeUnlocked);

    return () => {
      window.removeEventListener("myenglish-xp-updated" as any, handleXPUpdate);
      window.removeEventListener("myenglish-badge-unlocked" as any, handleBadgeUnlocked);
    };
  }, []);

  const closeLevelUp = () => setLevelUpData(null);
  const closeBadge = (id: string) =>
    setUnlockedBadges((prev) => prev.filter((b) => b.id !== id));

  return (
    <>
      {/* Level Up Celebration Modal */}
      {levelUpData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 text-center space-y-5 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Background Glow */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 p-0.5 shadow-lg shadow-amber-500/30">
                <div className="w-full h-full rounded-[14px] bg-zinc-900 flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-amber-400 animate-bounce" />
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 mt-4">
                <Sparkles className="w-3.5 h-3.5" />
                <span>LEVEL UP!</span>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-black text-white tracking-tight">
                Cấp Độ {levelUpData.newLevel}
              </h3>
              <p className="text-xs text-zinc-400">
                Bạn vừa bứt phá giới hạn trí nhớ! Tiếp tục giữ vững phong độ nhé.
              </p>
            </div>

            <button
              onClick={closeLevelUp}
              className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-yellow-500 text-zinc-950 hover:from-amber-400 hover:to-yellow-400 transition-all shadow-md shadow-amber-500/20"
            >
              Tiếp tục học ngay
            </button>
          </div>
        </div>
      )}

      {/* Badge Unlocked Notification Toast */}
      {unlockedBadges.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9998] space-y-3 pointer-events-auto">
          {unlockedBadges.map((badge) => (
            <div
              key={badge.id}
              className="flex items-center gap-3 p-4 rounded-2xl border border-cyan-500/40 bg-zinc-900/95 backdrop-blur-md shadow-2xl text-left max-w-sm animate-in slide-in-from-bottom-5 duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-2xl shrink-0">
                {badge.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  <Award className="w-3 h-3" />
                  <span>Mở khóa danh hiệu</span>
                </div>
                <h4 className="text-sm font-bold text-white truncate">{badge.title}</h4>
                <p className="text-xs text-zinc-400 line-clamp-1">{badge.description}</p>
                <span className="inline-block text-[11px] font-mono font-bold text-emerald-400 mt-0.5">
                  +{badge.xpBonus} XP Thưởng
                </span>
              </div>
              <button
                onClick={() => closeBadge(badge.id)}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
