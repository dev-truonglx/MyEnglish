import { useAuthStore } from "@/stores/authStore";

export type AuthPromptReason = "exit_lesson" | "close_tab" | "manual";

export interface AuthPromptOptions {
  reason?: AuthPromptReason;
  title?: string;
  message?: string;
}

export const PROMPT_AUTH_SYNC_EVENT = "myenglish-prompt-auth-sync";

/**
 * Triggers the login / registration prompt modal if the user is currently not signed in
 * and cloud/auth is configured.
 *
 * Returns true if the prompt was dispatched, or false if user is already signed in (or auth not configured).
 */
export function promptAuthSyncIfGuest(options?: AuthPromptOptions | AuthPromptReason): boolean {
  if (typeof window === "undefined") return false;

  const { configured, user } = useAuthStore.getState();
  // If cloud is not configured or user is already signed in, do nothing (operates normally)
  if (!configured || user) return false;

  const detail: AuthPromptOptions =
    typeof options === "string" ? { reason: options } : (options ?? { reason: "exit_lesson" });

  window.dispatchEvent(new CustomEvent(PROMPT_AUTH_SYNC_EVENT, { detail }));
  return true;
}
