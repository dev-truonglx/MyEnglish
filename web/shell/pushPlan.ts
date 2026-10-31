import { getReminderSettings, reminderPause } from "@/services/reminderSettings";
import { anchorTime, getBestReminderHour } from "@/services/reminderMoments";
import { countDueCards } from "@/services/db";

export interface PlanItem {
  at: string; // ISO string
  title: string;
  body: string;
  due: number;
}

/**
 * Builds the upcoming push notification schedule for the server to dispatch
 * when the web tab is closed.
 */
export async function buildPushPlan(now = new Date()): Promise<PlanItem[]> {
  const settings = getReminderSettings();
  if (!settings.enabled) return [];

  // Anchor and smart reminder slots per day
  const dailySlots: Array<{ hour: number; minute: number }> = [];
  for (const a of settings.anchors ?? []) {
    const t = anchorTime(a);
    if (t) dailySlots.push({ hour: t.hour, minute: t.minute });
  }

  if (settings.smartReminders) {
    const bestHour = getBestReminderHour();
    if (typeof bestHour === "number") {
      dailySlots.push({ hour: bestHour, minute: 0 });
    }
  }

  // No study time chosen and none learned yet: nothing to remind at (no invented default hour)
  if (dailySlots.length === 0) return [];

  // Candidates for today and tomorrow (local time)
  const days = [
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  ];

  const minTime = now.getTime() + 5 * 60 * 1000;
  const maxTime = now.getTime() + 48 * 60 * 60 * 1000;

  const candidateTimes: Date[] = [];
  for (const day of days) {
    for (const slot of dailySlots) {
      const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot.hour, slot.minute, 0, 0);

      // Keep times > now + 5 min and < now + 48 h
      if (t.getTime() <= minTime || t.getTime() >= maxTime) continue;

      // Drop if settings.snoozedUntil is later than the time
      if (settings.snoozedUntil != null && settings.snoozedUntil > t.getTime()) continue;

      // Drop if night quiet pause
      if (reminderPause(settings, { hour: t.getHours(), goalReached: false, shownToday: 0 }) === "night") continue;

      candidateTimes.push(t);
    }
  }

  // Sort candidate times chronologically
  candidateTimes.sort((a, b) => a.getTime() - b.getTime());

  // De-duplicate times closer than 30 min (keep the earlier)
  const deduplicated: Date[] = [];
  for (const t of candidateTimes) {
    if (deduplicated.length === 0) {
      deduplicated.push(t);
    } else {
      const prev = deduplicated[deduplicated.length - 1];
      if (t.getTime() - prev.getTime() >= 30 * 60 * 1000) {
        deduplicated.push(t);
      }
    }
  }

  const items: PlanItem[] = [];
  for (const t of deduplicated) {
    const c = await countDueCards(t);
    const due = c.reviews;
    if (settings.triggerCondition === "due_only" && due === 0) continue;

    items.push({
      at: t.toISOString(),
      title: "MyEnglish",
      body: due > 0 ? `${due} thẻ đang chờ bạn ôn` : "Dành vài phút ôn từ nhé",
      due,
    });

    if (items.length >= 12) break;
  }

  return items;
}
