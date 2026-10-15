/**
 * Lets work that must not overlap a sync pass (the app reset: it empties the account and this machine) wait
 * for a running pass and hold new ones off. Kept apart from the manager so the reset can use it without
 * loading the sync engine.
 */
let paused = 0;
let running: Promise<unknown> | null = null;

/** The manager reports its running pass here */
export function setRunningPass(pass: Promise<unknown> | null): void {
  running = pass;
}

export const isSyncPaused = () => paused > 0;

/** Runs `fn` with no sync pass running or starting meanwhile */
export async function withSyncPaused<T>(fn: () => Promise<T>): Promise<T> {
  paused++;
  try {
    await running?.catch(() => {});
    return await fn();
  } finally {
    paused--;
  }
}
