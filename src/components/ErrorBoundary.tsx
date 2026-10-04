import { Component, type ErrorInfo, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { hideReviewNudge, hideReviewPopup } from "@/services/reminderSettings";

interface ErrorBoundaryProps {
  /** Window label: floating windows hide themselves instead of showing an error */
  windowLabel: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Event that shows each floating window again: the boundary resets so the next showing remounts */
const REOPEN_EVENTS: Record<string, string> = {
  "review-popup": "review-popup-opened",
  "review-nudge": "review-nudge-opened",
};

/** Catches render errors so a crash never leaves a blank (or invisible always-on-top) window. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  private unlistenReopen: UnlistenFn | null = null;
  private listening = false;
  private unmounted = false;

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.windowLabel}]`, error, info.componentStack);
    const { windowLabel } = this.props;
    if (windowLabel === "review-popup") void hideReviewPopup();
    else if (windowLabel === "review-nudge") void hideReviewNudge();

    const reopenEvent = REOPEN_EVENTS[windowLabel];
    if (reopenEvent && !this.listening && "__TAURI_INTERNALS__" in window) {
      this.listening = true;
      listen(reopenEvent, () => {
        this.stopListening();
        if (!this.unmounted) this.setState({ hasError: false });
      })
        .then((fn) => {
          if (this.unmounted || !this.state.hasError) fn();
          else this.unlistenReopen = fn;
        })
        .catch(() => {
          this.listening = false;
        });
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    this.stopListening();
  }

  private stopListening() {
    this.listening = false;
    this.unlistenReopen?.();
    this.unlistenReopen = null;
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { windowLabel } = this.props;
    if (windowLabel === "review-popup" || windowLabel === "review-nudge") return null;
    return (
      <div className="w-screen h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-xl">
          <div className="text-sm font-bold text-slate-900 dark:text-white">Đã xảy ra lỗi</div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-zinc-400">
            Ứng dụng gặp sự cố không mong muốn. Dữ liệu học của bạn vẫn được giữ nguyên.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold transition-colors"
          >
            Tải lại
          </button>
        </div>
      </div>
    );
  }
}
