import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDisplayTime, formatCountdown, getPauseReason } from "@/components/dashboard/Sidebar";
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from "@/services/reminderSettings";

describe("Sidebar Popup Reminder Widget helpers", () => {
  describe("formatDisplayTime", () => {
    it("returns 'Chưa có' when timestamp is 0 or negative", () => {
      expect(formatDisplayTime(0)).toBe("Chưa có");
      expect(formatDisplayTime(-1)).toBe("Chưa có");
    });

    it("formats today's time with HH:mm:ss", () => {
      const now = new Date();
      now.setHours(14, 30, 45, 0);
      const res = formatDisplayTime(now.getTime());
      expect(res).toMatch(/14:30:45/);
    });

    it("formats yesterday's time with 'Hôm qua HH:mm'", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(21, 15, 0, 0);
      const res = formatDisplayTime(yesterday.getTime());
      expect(res).toContain("Hôm qua");
      expect(res).toMatch(/21:15/);
    });

    it("formats older dates with day/month and HH:mm", () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      past.setHours(9, 45, 0, 0);
      const res = formatDisplayTime(past.getTime());
      expect(res).toMatch(/\d{2}[-/]\d{2}/);
      expect(res).toMatch(/09:45/);
    });
  });

  describe("formatCountdown", () => {
    it("returns 'Đến giờ!' when seconds <= 0", () => {
      expect(formatCountdown(0)).toBe("Đến giờ!");
      expect(formatCountdown(-10)).toBe("Đến giờ!");
    });

    it("formats seconds under 60", () => {
      expect(formatCountdown(45)).toBe("45s");
      expect(formatCountdown(5)).toBe("5s");
    });

    it("formats minutes and seconds", () => {
      expect(formatCountdown(65)).toBe("1m 05s");
      expect(formatCountdown(15 * 60)).toBe("15m");
      expect(formatCountdown(15 * 60 + 30)).toBe("15m 30s");
    });

    it("formats hours and minutes", () => {
      expect(formatCountdown(3600)).toBe("1h");
      expect(formatCountdown(3600 + 15 * 60)).toBe("1h 15m");
      expect(formatCountdown(2 * 3600 + 40 * 60)).toBe("2h 40m");
    });
  });

  describe("getPauseReason", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("returns 'Nghỉ ban đêm' when current hour is in quiet hours", () => {
      const settings: ReminderSettings = {
        ...DEFAULT_REMINDER_SETTINGS,
        nightQuiet: true,
      };
      // If mock date hour is 23
      vi.useFakeTimers();
      const nightDate = new Date();
      nightDate.setHours(23, 0, 0, 0);
      vi.setSystemTime(nightDate);

      const reason = getPauseReason(settings, false);
      expect(reason).toBe("Nghỉ ban đêm");

      vi.useRealTimers();
    });

    it("returns 'Đã xong mục tiêu' when goal is met and stopAfterGoal is enabled", () => {
      const settings: ReminderSettings = {
        ...DEFAULT_REMINDER_SETTINGS,
        stopAfterGoal: true,
        nightQuiet: false,
      };
      vi.useFakeTimers();
      const daytime = new Date();
      daytime.setHours(14, 0, 0, 0);
      vi.setSystemTime(daytime);

      const reason = getPauseReason(settings, true);
      expect(reason).toBe("Đã xong mục tiêu");

      vi.useRealTimers();
    });

    it("returns null when no pause conditions are met", () => {
      const settings: ReminderSettings = {
        ...DEFAULT_REMINDER_SETTINGS,
        nightQuiet: true,
        stopAfterGoal: true,
        maxNudgesPerDay: 8,
      };
      vi.useFakeTimers();
      const daytime = new Date();
      daytime.setHours(14, 0, 0, 0);
      vi.setSystemTime(daytime);

      const reason = getPauseReason(settings, false);
      expect(reason).toBeNull();

      vi.useRealTimers();
    });
  });
});
