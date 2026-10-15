import { describe, it, expect } from "vitest";
import { rankChange, standingMessage, weekEnd, weekTimeLeft, xpToPass, type Standing } from "@/services/leaderboard";
import { effectiveScope } from "@/stores/standingStore";
import type { GroupInfo } from "@/services/leaderboard";

const standing = (over: Partial<Standing> = {}): Standing => ({
  rank: 3, total: 10, xp: 300, above: { name: "Minh", xp: 500 }, below: { name: "Hà", xp: 100 }, board: [], ...over,
});

describe("rank widgets", () => {
  it("tells how far the next person is (one more than their XP: ties share a rank)", () => {
    expect(xpToPass(standing())).toBe(201);
    expect(xpToPass(standing({ above: null }))).toBeNull();
    expect(standingMessage(standing())).toBe("Còn 201 XP nữa là vượt Minh.");
  });

  it("speaks only of what can be gained: lead, no XP yet", () => {
    expect(standingMessage(standing({ rank: 1, above: null }))).toBe("Bạn đang dẫn đầu, hơn Hà 200 XP.");
    expect(standingMessage(standing({ rank: 1, above: null, below: null }))).toBe("Bạn đang dẫn đầu tuần này!");
    expect(standingMessage(standing({ xp: 0 }))).toMatch(/chưa có XP/);
  });

  it("names who was passed after a session", () => {
    const before = standing({ rank: 4, above: { name: "Hà", xp: 320 } });
    const after = standing({ rank: 3, xp: 360, above: { name: "Minh", xp: 500 } });
    expect(rankChange(before, after)).toEqual({ from: 4, to: 3, passed: "Hà" });
    expect(rankChange(before, before)).toEqual({ from: 4, to: 4, passed: null });
    expect(rankChange(null, after)).toBeNull();
  });

  it("counts the week down to Monday 00:00 local", () => {
    const wed = new Date(2026, 9, 14, 12, 0);
    expect(weekEnd(wed).getDay()).toBe(1);
    expect(weekEnd(wed).getDate()).toBe(19);
    expect(weekTimeLeft(wed)).toBe("còn 5 ngày");
    expect(weekTimeLeft(new Date(2026, 9, 18, 20, 0))).toBe("còn 4 giờ");
  });

  it("follows the first group unless the learner chose another board", () => {
    const g = (id: string): GroupInfo => ({ id, name: id, inviteCode: id, memberCount: 2, isOwner: false });
    expect(effectiveScope(null, [])).toBeNull();
    expect(effectiveScope(null, [g("a"), g("b")])).toBe("a");
    expect(effectiveScope("b", [g("a"), g("b")])).toBe("b");
    expect(effectiveScope("all", [g("a")])).toBeNull();
    expect(effectiveScope("gone", [g("a")])).toBe("a");
  });
});
