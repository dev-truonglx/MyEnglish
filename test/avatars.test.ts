import { describe, it, expect } from "vitest";
import { AVATARS, AVATAR_ID_PATTERN, fallbackDisc, findAvatar, initialOf } from "@/services/avatars";

describe("preset avatars", () => {
  it("has unique ids the server's check accepts", () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(AVATAR_ID_PATTERN);
    for (const a of AVATARS) {
      expect(a.emoji.length).toBeGreaterThan(0);
      expect(a.disc).toMatch(/^bg-/);
    }
  });

  it("finds a preset by id and falls back to a letter for unknown or missing ids", () => {
    expect(findAvatar("fox-amber")?.emoji).toBe("🦊");
    expect(findAvatar("gone-forever")).toBeNull();
    expect(findAvatar(null)).toBeNull();
    expect(initialOf("  linh")).toBe("L");
    expect(initialOf("đạt")).toBe("Đ");
    expect(initialOf("")).toBe("?");
  });

  it("colours the fallback disc the same way for the same name", () => {
    expect(fallbackDisc("Minh")).toBe(fallbackDisc("Minh"));
    expect(fallbackDisc("Minh")).toMatch(/^bg-/);
  });

  it("rejects ids the database would refuse", () => {
    for (const bad of ["", "Fox-Amber", "fox amber", "x".repeat(25), "fox;drop"]) expect(AVATAR_ID_PATTERN.test(bad)).toBe(false);
  });
});
