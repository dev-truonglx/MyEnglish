/**
 * Runs the sync engine for the signed-in account (main window only): after sign-in and at start-up, a while
 * after the learner earns XP or changes words, when the window is hidden, when the network comes back and every
 * few minutes. A failed pass is silent apart from the status shown in the account section; the app keeps
 * working offline and the next pass catches up.
 */
import { useAuthStore } from "@/stores/authStore";
import { accountErrorMessage } from "../accountErrors";
import { getSupabase } from "../supabase";
import { AccountMismatchError, AccountResetElsewhereError, adoptAccount, getLastSyncAt, syncNow } from "./engine";
import { isSyncPaused, setRunningPass } from "./pause";
import { supabaseTransport } from "./supabaseTransport";
import type { SyncReport } from "./types";
import { WORDS_CHANGED_WHILE_HIDDEN_EVENT } from "../reviewRecorder";

const DEBOUNCE_MS = 30_000;
const INTERVAL_MS = 5 * 60_000;
const FIRST_DELAY_MS = 1_500;

let running: Promise<void> | null = null;
/** True while a pass applies pulled rows: the events that raises must not schedule another pass */
let applying = false;
let timer: number | null = null;

/** One pass now (a pass already running is awaited instead of started twice). */
export function runSync(): Promise<void> {
  if (running) return running;
  const { user, sync, setSync } = useAuthStore.getState();
  const client = getSupabase();
  if (!client || !user || sync.accountMismatch || isSyncPaused()) return Promise.resolve();

  setSync({ status: "syncing", error: null });
  applying = true;
  running = (async () => {
    try {
      const report = await syncNow(supabaseTransport(client, user.id), user.id);
      setSync({
        status: "idle",
        lastSyncAt: await getLastSyncAt(),
        lastReport: report,
        error: report.xpDeviceLimit ? accountErrorMessage(new Error("device limit")) : null,
      });
      if (report.applied > 0 || report.xpChanged) window.dispatchEvent(new CustomEvent("myenglish-cloud-synced", { detail: report }));
      window.dispatchEvent(new CustomEvent<SyncReport>("myenglish-sync-finished", { detail: report }));
      // The profile is read back only when this pass wrote it (or it was never read)
      if (report.profilePushed || !useAuthStore.getState().profile) void useAuthStore.getState().refreshProfile();
    } catch (err) {
      if (err instanceof AccountMismatchError) setSync({ status: "idle", accountMismatch: true, mismatchReason: "account" });
      else if (err instanceof AccountResetElsewhereError) setSync({ status: "idle", accountMismatch: true, mismatchReason: "reset" });
      else setSync({ status: "error", error: accountErrorMessage(err) });
    } finally {
      applying = false;
      running = null;
      setRunningPass(null);
    }
  })();
  setRunningPass(running);
  return running;
}

/** The learner chose what to do with this machine's data after signing in with another account */
export async function resolveAccountMismatch(choice: "merge" | "wipe"): Promise<void> {
  const { user, setSync } = useAuthStore.getState();
  if (!user) return;
  if (choice === "wipe") {
    const { resetAllAppData } = await import("../appReset");
    // The previous account's data on this machine goes (the account itself is not touched)
    const ok = await resetAllAppData({ keepCloud: true });
    if (!ok) {
      setSync({ status: "error", error: "Không xóa được dữ liệu trên máy này." });
      return;
    }
  }
  await adoptAccount(user.id);
  setSync({ accountMismatch: false, mismatchReason: undefined });
  await runSync();
  if (choice === "wipe") window.location.reload();
}

function schedule(delay: number): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void runSync();
  }, delay);
}

/** Starts the triggers; returns a function that stops them. Call once, in the main window. */
export function startSyncScheduler(): () => void {
  const onChange = () => {
    if (!applying && useAuthStore.getState().user) schedule(DEBOUNCE_MS);
  };
  const onHidden = () => {
    if (document.visibilityState === "hidden" && useAuthStore.getState().user) void runSync();
  };
  const onOnline = () => void runSync();
  const events = ["myenglish-xp-updated", "words-changed", WORDS_CHANGED_WHILE_HIDDEN_EVENT, "myenglish-grammar-updated"];
  events.forEach((e) => window.addEventListener(e, onChange));
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("online", onOnline);
  const interval = window.setInterval(() => void runSync(), INTERVAL_MS);
  // Sign-in (or a restored session) starts a pass shortly after; sign-out stops pending ones
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.user && state.user.id !== prev.user?.id) schedule(FIRST_DELAY_MS);
    if (!state.user && timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  });
  if (useAuthStore.getState().user) schedule(FIRST_DELAY_MS);
  return () => {
    events.forEach((e) => window.removeEventListener(e, onChange));
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("online", onOnline);
    window.clearInterval(interval);
    unsubscribe();
    if (timer !== null) window.clearTimeout(timer);
  };
}
