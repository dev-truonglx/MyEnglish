import { useEffect, useState } from "react";
import { cancelSnooze, getReminderSettings, REMINDER_SETTINGS_STORAGE_KEY } from "@/services/reminderSettings";

/** End of the active reminder pause, or null (no pause, an expired one, or reminders turned off) */
function activeSnoozeEnd(): number | null {
  const s = getReminderSettings();
  if (!s.enabled || s.intervalMinutes === 0) return null;
  return s.snoozedUntil && s.snoozedUntil > Date.now() ? s.snoozedUntil : null;
}

/**
 * The reminder pause picked in the corner reminder, the popup or the tray, kept current in this window: the
 * other windows write it to the shared storage (the `storage` event), this one sends its own event.
 */
export function useReminderSnooze(): { snoozedUntil: number | null; cancel: () => void } {
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(activeSnoozeEnd);

  useEffect(() => {
    const sync = () => setSnoozedUntil(activeSnoozeEnd());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === REMINDER_SETTINGS_STORAGE_KEY) sync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("myenglish-reminder-settings-updated", sync);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    // Safety net for a write that sent no event (another window on an older build)
    const poll = setInterval(onVisible, 30_000);
    return () => {
      window.removeEventListener("myenglish-reminder-settings-updated", sync);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
    };
  }, []);

  // The pause ends by itself: the chip goes away right then
  useEffect(() => {
    if (!snoozedUntil) return;
    const t = setTimeout(() => setSnoozedUntil(activeSnoozeEnd()), Math.max(0, snoozedUntil - Date.now()) + 500);
    return () => clearTimeout(t);
  }, [snoozedUntil]);

  return {
    snoozedUntil,
    cancel: () => {
      cancelSnooze();
      setSnoozedUntil(null);
    },
  };
}
