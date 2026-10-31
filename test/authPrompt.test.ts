import { describe, it, expect, beforeEach, vi } from "vitest";
import { promptAuthSyncIfGuest, PROMPT_AUTH_SYNC_EVENT } from "@/services/authPrompt";
import { useAuthStore } from "@/stores/authStore";

describe("authPrompt", () => {
  beforeEach(() => {
    // Reset state before each test
    useAuthStore.setState({
      configured: true,
      user: null,
    });
  });

  it("does not prompt if cloud is not configured", () => {
    useAuthStore.setState({ configured: false, user: null });
    const dispatched = vi.fn();
    window.addEventListener(PROMPT_AUTH_SYNC_EVENT, dispatched);

    const result = promptAuthSyncIfGuest("exit_lesson");

    expect(result).toBe(false);
    expect(dispatched).not.toHaveBeenCalled();
    window.removeEventListener(PROMPT_AUTH_SYNC_EVENT, dispatched);
  });

  it("does not prompt if user is already signed in (operates normally)", () => {
    useAuthStore.setState({
      configured: true,
      user: { id: "user-123", email: "test@example.com" },
    });
    const dispatched = vi.fn();
    window.addEventListener(PROMPT_AUTH_SYNC_EVENT, dispatched);

    const result = promptAuthSyncIfGuest("exit_lesson");

    expect(result).toBe(false);
    expect(dispatched).not.toHaveBeenCalled();
    window.removeEventListener(PROMPT_AUTH_SYNC_EVENT, dispatched);
  });

  it("prompts user to sync if guest exits a lesson", () => {
    useAuthStore.setState({
      configured: true,
      user: null,
    });
    let eventDetail: unknown = null;
    const listener = (e: Event) => {
      eventDetail = (e as CustomEvent).detail;
    };
    window.addEventListener(PROMPT_AUTH_SYNC_EVENT, listener);

    const result = promptAuthSyncIfGuest("exit_lesson");

    expect(result).toBe(true);
    expect(eventDetail).toEqual({ reason: "exit_lesson" });
    window.removeEventListener(PROMPT_AUTH_SYNC_EVENT, listener);
  });

  it("prompts user to sync if guest closes the tab while studying", () => {
    useAuthStore.setState({
      configured: true,
      user: null,
    });
    let eventDetail: unknown = null;
    const listener = (e: Event) => {
      eventDetail = (e as CustomEvent).detail;
    };
    window.addEventListener(PROMPT_AUTH_SYNC_EVENT, listener);

    const result = promptAuthSyncIfGuest({
      reason: "close_tab",
      title: "Lưu tiến độ",
      message: "Vui lòng đăng nhập",
    });

    expect(result).toBe(true);
    expect(eventDetail).toEqual({
      reason: "close_tab",
      title: "Lưu tiến độ",
      message: "Vui lòng đăng nhập",
    });
    window.removeEventListener(PROMPT_AUTH_SYNC_EVENT, listener);
  });
});
