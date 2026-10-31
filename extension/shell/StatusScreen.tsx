import { CheckCircle2, Circle, Loader2, ExternalLink } from "lucide-react";

export interface Step {
  label: string;
  state: "waiting" | "running" | "done";
  note?: string;
}

export function StatusScreen({
  title,
  message,
  steps,
  footer,
  action,
  secondaryAction,
}: {
  title: string;
  message?: string;
  steps?: Step[];
  footer?: string;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-md space-y-4">
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-32.png" alt="MyEnglish" className="w-7 h-7 rounded-lg" />
          <h1 className="text-base font-bold text-slate-900 dark:text-white">{title}</h1>
        </div>

        {message && <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed break-words">{message}</p>}

        {steps && steps.length > 0 && (
          <ul className="space-y-2.5 pt-1">
            {steps.map((s) => (
              <li key={s.label} className="flex items-start gap-2.5 text-xs">
                {s.state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                ) : s.state === "running" ? (
                  <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-cyan-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 mt-0.5 text-slate-300 dark:text-zinc-600 shrink-0" />
                )}
                <div>
                  <span className="font-medium text-slate-700 dark:text-zinc-200">{s.label}</span>
                  {s.note && <span className="block text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{s.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {footer && <p className="text-[11px] text-slate-400 dark:text-zinc-500 pt-1">{footer}</p>}

        <div className="pt-2 space-y-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-white shadow transition"
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
