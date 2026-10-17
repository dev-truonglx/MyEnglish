import { describe, it, expect, beforeEach } from "vitest";
import { cancelSnooze, getReminderSettings, snoozeEndText, snoozeReminder } from "@/services/reminderSettings";

describe("snoozeEndText (header chip)", () => {
  const now = new Date(2026, 9, 17, 14, 0).getTime();

  it("shows only the time for a pause ending today", () => {
    expect(snoozeEndText(new Date(2026, 9, 17, 14, 35).getTime(), now)).toBe("14:35");
  });

  it("adds 'mai' for a pause ending tomorrow (tray: until tomorrow morning)", () => {
    expect(snoozeEndText(new Date(2026, 9, 18, 7, 0).getTime(), now)).toBe("07:00 mai");
  });

  it("shows the date further away", () => {
    expect(snoozeEndText(new Date(2026, 9, 20, 7, 5).getTime(), now)).toBe("20/10 07:05");
  });
});

describe("cancel from the header", () => {
  beforeEach(() => localStorage.clear());

  it("clears the snooze the corner reminder set", () => {
    snoozeReminder(15);
    expect(getReminderSettings().snoozedUntil).toBeGreaterThan(Date.now());
    cancelSnooze();
    expect(getReminderSettings().snoozedUntil).toBeNull();
  });
});
