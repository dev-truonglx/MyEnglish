import { describe, it, expect } from "vitest";
import { createEmptyCard, Rating, State } from "ts-fsrs";
import { getFSRSScheduler } from "@/services/srs";

const at = (iso: string) => new Date(iso);

describe("learning steps: Hard moves on like Good", () => {
  it("a new card answered Hard goes to the next learning step, then Hard again graduates", () => {
    const f = getFSRSScheduler();
    const first = f.next(createEmptyCard(at("2026-10-15T08:00:00Z")), at("2026-10-15T08:00:00Z"), Rating.Hard).card;
    expect(first.state).toBe(State.Learning);
    expect(first.learning_steps).toBe(1);
    // Next day (the next session): Hard on the last step leaves learning
    const second = f.next(first, at("2026-10-16T08:00:00Z"), Rating.Hard).card;
    expect(second.state).toBe(State.Review);
    expect(second.scheduled_days).toBeGreaterThanOrEqual(1);
  });

  it("a relearning card answered Hard returns to Review", () => {
    const f = getFSRSScheduler();
    let card = createEmptyCard(at("2026-10-01T08:00:00Z"));
    card = f.next(card, at("2026-10-01T08:00:00Z"), Rating.Good).card;
    card = f.next(card, at("2026-10-02T08:00:00Z"), Rating.Good).card;
    expect(card.state).toBe(State.Review);
    card = f.next(card, at("2026-10-10T08:00:00Z"), Rating.Again).card;
    expect(card.state).toBe(State.Relearning);
    const after = f.next(card, at("2026-10-11T08:00:00Z"), Rating.Hard).card;
    expect(after.state).toBe(State.Review);
  });

  it("Again still restarts the learning steps", () => {
    const f = getFSRSScheduler();
    const first = f.next(createEmptyCard(at("2026-10-15T08:00:00Z")), at("2026-10-15T08:00:00Z"), Rating.Good).card;
    const again = f.next(first, at("2026-10-16T08:00:00Z"), Rating.Again).card;
    expect(again.state).toBe(State.Learning);
    expect(again.learning_steps).toBe(0);
  });
});
