import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Unbiased Fisher–Yates shuffle into a new array (`sort(() => Math.random() - 0.5)` is biased) */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Items left in a session, the one on screen included. An item asked again (a forgotten card, a new word's quiz
 * after its introduction) joins the queue as the current one is answered, so this count never goes up, where
 * "Thẻ 3 / 5" became "4 / 9" as the queue grew. ((currentIndex + 1) / length never goes down either.)
 */
export function itemsLeft(queueLength: number, currentIndex: number): number {
  return Math.max(0, queueLength - currentIndex);
}
