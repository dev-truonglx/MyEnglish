/** What is synced and how rows are matched across machines. */

/**
 * A word's identity on every machine: the deck entry's id, else the lower-cased text of a word the learner
 * added. (`words.id` is a random UUID per machine, so it can never be shared.)
 */
export function wordKey(w: { catalog_id?: string | null; word: string }): string {
  return w.catalog_id ? w.catalog_id : `w:${w.word.trim().toLowerCase()}`;
}

export const isFreeWordKey = (key: string) => key.startsWith("w:");

/** SQL for the same key, for a `words` row aliased `w` */
export const WORD_KEY_SQL = "COALESCE(w.catalog_id, 'w:' || LOWER(TRIM(w.word)))";

/** Local timestamps are ISO, but old rows may hold SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) */
export function toIso(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
}

/** The oldest possible time: a value first seen on a machine never beats a remote one */
export const EPOCH = "1970-01-01T00:00:00.000Z";

export type KvStrategy =
  | "lww" // newest change wins
  | "maxMap" // { key: number }: the larger number per key
  | "unionObj" // { key: value }: keys of both, the local value wins a clash
  | "arrayUnion" // [string]: both lists
  | "newestAt" // { key: { at } }: the entry with the later `at` per key
  | "pronunciation"; // { lesson: { best, total, attempts, passedAt? } }

/**
 * The localStorage keys that travel with the account. An allowlist on purpose: the grammar book's own keys
 * (revision, hidden items, accepted answers), the API key, the CLI path, window/device preferences and
 * per-day transient state must never leave the machine.
 */
export const SYNCED_KV: Record<string, KvStrategy> = {
  // Study settings
  myenglish_daily_goal_v1: "lww",
  myenglish_study_limits_v1: "lww",
  myenglish_leech_settings_v1: "lww",
  myenglish_fsrs_request_retention: "lww",
  myenglish_fsrs_max_interval: "lww",
  myenglish_fsrs_weights_v1: "lww",
  myenglish_study_levels_v1: "lww",
  myenglish_picked_words_v1: "unionObj",
  myenglish_user_cefr_override_v1: "lww",
  myenglish_onboarding_done_v1: "lww",
  myenglish_starter_decks_v1: "lww",
  myenglish_foundation_mode_v1: "lww",
  myenglish_simple_mode_v1: "lww",
  myenglish_pretest_enabled_v1: "lww",
  myenglish_auto_replenish_settings_v1: "lww",
  myenglish_mnemonics_v1: "unionObj",
  // Progress kept outside SQLite
  myenglish_study_logs_v1: "maxMap",
  myenglish_achievements_v1: "unionObj",
  myenglish_pronunciation_v1: "pronunciation",
  myenglish_grammar_introduced_v1: "arrayUnion",
  myenglish_grammar_intro_dates_v1: "unionObj",
  myenglish_grammar_item_levels_v1: "maxMap",
  myenglish_grammar_set_scores_v1: "newestAt",
  // Today's quests and whether the chest was opened: another machine must not open it a second time
  myenglish_daily_quests_v1: "lww",
  myenglish_weekly_challenges_v1: "lww",
  myenglish_bonus_freezes_v1: "arrayUnion",
};

export function isSyncedKvKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(SYNCED_KV, key);
}

function parseObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseArray(raw: string | null | undefined): unknown[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The value a key should hold given the local and the remote one. Returns null when the strategy keeps the
 * local value as it is (or either side is unreadable). `remoteNewer` only matters for "lww".
 */
export function mergeKv(strategy: KvStrategy, local: string | null, remote: string, remoteNewer: boolean): string | null {
  if (local === null) return remote;
  if (local === remote) return null;
  switch (strategy) {
    case "lww":
      return remoteNewer ? remote : null;
    case "maxMap": {
      const a = parseObject(local);
      const b = parseObject(remote);
      if (!a || !b) return remoteNewer ? remote : null;
      const out: Record<string, unknown> = { ...a };
      for (const [k, v] of Object.entries(b)) {
        const x = Number(out[k]);
        const y = Number(v);
        out[k] = Number.isFinite(x) && Number.isFinite(y) ? Math.max(x, y) : (out[k] ?? v);
      }
      return JSON.stringify(out);
    }
    case "unionObj": {
      const a = parseObject(local);
      const b = parseObject(remote);
      if (!a || !b) return remoteNewer ? remote : null;
      return JSON.stringify({ ...b, ...a });
    }
    case "arrayUnion": {
      const a = parseArray(local);
      const b = parseArray(remote);
      if (!a || !b) return remoteNewer ? remote : null;
      return JSON.stringify([...new Set([...a, ...b].map(String))]);
    }
    case "newestAt": {
      const a = parseObject(local);
      const b = parseObject(remote);
      if (!a || !b) return remoteNewer ? remote : null;
      const out: Record<string, unknown> = { ...a };
      for (const [k, v] of Object.entries(b)) {
        const lv = out[k] as { at?: string } | undefined;
        const rv = v as { at?: string };
        if (!lv || (rv?.at && (!lv.at || rv.at > lv.at))) out[k] = v;
      }
      return JSON.stringify(out);
    }
    case "pronunciation": {
      type Lesson = { best?: number; total?: number; attempts?: number; passedAt?: string };
      const a = parseObject(local) as Record<string, Lesson> | null;
      const b = parseObject(remote) as Record<string, Lesson> | null;
      if (!a || !b) return remoteNewer ? remote : null;
      const out: Record<string, Lesson> = { ...a };
      for (const [k, r] of Object.entries(b)) {
        const l = out[k];
        if (!l) {
          out[k] = r;
          continue;
        }
        const passedAt = [l.passedAt, r.passedAt].filter(Boolean).sort()[0];
        out[k] = {
          ...l,
          best: Math.max(l.best ?? 0, r.best ?? 0),
          total: Math.max(l.total ?? 0, r.total ?? 0),
          attempts: Math.max(l.attempts ?? 0, r.attempts ?? 0),
          ...(passedAt ? { passedAt } : {}),
        };
      }
      return JSON.stringify(out);
    }
  }
}
