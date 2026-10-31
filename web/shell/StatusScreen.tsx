"use client";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

export interface Step {
  label: string;
  state: "waiting" | "running" | "done";
  note?: string;
}

/** Full-page card for start-up states: progress steps, a message, one action */
export function StatusScreen({
  title,
  message,
  steps,
  footer,
  action,
}: {
  title: string;
  message?: string;
  steps?: Step[];
  footer?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        {message && <p className="mt-2 text-sm text-muted-foreground break-words">{message}</p>}
        {steps && steps.length > 0 && (
          <ul className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex gap-2 text-sm">
                {s.state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                ) : s.state === "running" ? (
                  <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-primary shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <span>
                  {s.label}
                  {s.note && <span className="block text-xs text-muted-foreground">{s.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {footer && <p className="mt-4 text-xs text-muted-foreground">{footer}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {action.label}
          </button>
        )}
      </div>
    </main>
  );
}
