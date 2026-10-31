import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const OPEN_KEY = "myenglish_settings_open_v1";

function readOpen(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

interface SettingsSectionProps {
  id: string;
  icon: ReactNode;
  title: string;
  /** One line under the title (what the section is for) */
  description?: string;
  /** Shown on the right while closed: the current state at a glance ("Đã kết nối", "90%") */
  summary?: ReactNode;
  /** primary: the settings that shape studying, highlighted; normal; muted: optional extras */
  tone?: "primary" | "normal" | "muted";
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A block of the Settings screen that can be folded. The learner's choice (open or closed) is remembered per
 * section, so extras folded once stay out of the way.
 */
export default function SettingsSection({ id, icon, title, description, summary, tone = "normal", defaultOpen = true, children }: SettingsSectionProps) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? defaultOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: next }));
    } catch {}
  };
  const shell =
    tone === "primary"
      ? "border-cyan-300 dark:border-cyan-800/70 bg-gradient-to-br from-cyan-50/70 to-white dark:from-cyan-950/25 dark:to-zinc-900 shadow-md shadow-cyan-500/5"
      : tone === "muted"
        ? "border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40"
        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm";

  return (
    <section id={`settings-${id}`} className={`scroll-mt-4 rounded-2xl border ${shell}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-3 px-3.5 md:px-5 py-3 md:py-4 text-left">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            tone === "primary"
              ? "bg-cyan-600 text-white shadow-sm shadow-cyan-600/30"
              : tone === "muted"
                ? "bg-slate-200/70 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-bold text-slate-900 dark:text-white ${tone === "primary" ? "text-base" : "text-sm"}`}>{title}</span>
          {description && <span className="block text-xs text-slate-500 dark:text-zinc-400">{description}</span>}
        </span>
        {!open && summary && <span className="hidden sm:block shrink-0 text-xs text-slate-500 dark:text-zinc-400 text-right max-w-[45%] truncate">{summary}</span>}
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3.5 md:px-5 pb-4 md:pb-5 space-y-4">{children}</div>}
    </section>
  );
}
