import { useEffect, useState, type ComponentProps } from "react";
import { BookOpen, GraduationCap, Sunrise, Flame, BarChart3, Dumbbell, Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { SIMPLE_NAV_GROUPS, type NavGroupId } from "./shared";

/** Everything Sidebar needs (MobileNav passes it through to the drawer's Sidebar) */
type MobileNavProps = Omit<ComponentProps<typeof Sidebar>, "variant" | "onNavigate">;

/** BOTTOM NAV (phones only): four main entries + "Thêm", which opens the full sidebar as a left drawer */
export default function MobileNav(props: MobileNavProps) {
  const { activeTab, setActiveTab, dueCount, simpleMode = false } = props;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groupIcon: Partial<Record<NavGroupId, typeof BookOpen>> = {
    today: Sunrise,
    vocab: BookOpen,
    grammar: GraduationCap,
    practice: Dumbbell,
  };
  const items: Array<{ key: string; label: string; icon: typeof BookOpen; badge: number; active: boolean; onClick: () => void }> = simpleMode
    ? SIMPLE_NAV_GROUPS.filter((g) => g.id !== "account" && g.id !== "quick")
        .slice(0, 4)
        .map((g) => ({
          key: g.id,
          label: g.label,
          icon: groupIcon[g.id] ?? BookOpen,
          badge: g.id === "vocab" ? dueCount : 0,
          active: g.tabs.some((t) => t.tab === activeTab),
          onClick: () => setActiveTab(g.tabs[0].tab),
        }))
    : [
        { key: "today", label: "Hôm nay", icon: Sunrise, badge: 0, active: activeTab === "today", onClick: () => setActiveTab("today") },
        { key: "review", label: "Ôn tập", icon: Flame, badge: dueCount, active: activeTab === "review", onClick: () => setActiveTab("review") },
        { key: "grammar", label: "Ngữ pháp", icon: GraduationCap, badge: 0, active: activeTab === "grammar", onClick: () => setActiveTab("grammar") },
        { key: "analytics", label: "Tiến độ", icon: BarChart3, badge: 0, active: activeTab === "analytics", onClick: () => setActiveTab("analytics") },
      ];

  const itemClass = (active: boolean) =>
    `relative flex-1 min-w-0 h-14 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
      active ? "text-cyan-700 dark:text-cyan-400" : "text-slate-500 dark:text-zinc-400 active:bg-slate-100 dark:active:bg-zinc-800/50"
    }`;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch h-14">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                aria-current={item.active ? "page" : undefined}
                className={itemClass(item.active)}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold leading-4 text-center">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full px-0.5">{item.label}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={itemClass(false)}>
            <Menu className="w-5 h-5" />
            <span>Thêm</span>
          </button>
        </div>
      </nav>

      {/* Drawer: the whole sidebar over a dimmed backdrop (click the backdrop to close) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50 cursor-default"
          />
          {/* Opaque behind the sidebar's translucent dark background */}
          <div className="relative h-full max-w-full bg-white dark:bg-zinc-900">
            <Sidebar {...props} variant="drawer" onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
