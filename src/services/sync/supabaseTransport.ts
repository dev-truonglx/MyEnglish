import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileStats, PulledRow, SyncRow, SyncTransport, XpRow } from "./types";

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const XP_PAGE = 1000;

export function supabaseTransport(client: SupabaseClient, userId: string): SyncTransport {
  return {
    async push(rows: SyncRow[]) {
      if (rows.length === 0) return;
      const { error } = await client.rpc("sync_push", { p_rows: rows });
      fail("sync_push", error);
    },

    async pull(since: string, limit: number) {
      const { data, error } = await client
        .from("sync_rows")
        .select("kind, key, data, ts, updated_at")
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .limit(limit);
      fail("sync_pull", error);
      return (data ?? []) as PulledRow[];
    },

    async pushXp(rows: XpRow[]) {
      for (let i = 0; i < rows.length; i += XP_PAGE) {
        const { error } = await client.rpc("xp_push", { p_rows: rows.slice(i, i + XP_PAGE) });
        fail("xp_push", error);
      }
    },

    async pullXp(since?: string | null) {
      const out: Array<XpRow & { updated_at?: string }> = [];
      for (let from = 0; ; from += XP_PAGE) {
        let query = client.from("xp_daily").select("device_id, day, xp, updated_at");
        if (since) query = query.gt("updated_at", since);
        const { data, error } = await query
          .order("day", { ascending: true })
          .order("device_id", { ascending: true })
          .range(from, from + XP_PAGE - 1);
        fail("xp_pull", error);
        const page = (data ?? []) as Array<XpRow & { updated_at?: string }>;
        out.push(...page);
        if (page.length < XP_PAGE) return out;
      }
    },

    async getEpoch() {
      // `sync_epoch` exists after migration 0006; without it there is no reset detection
      const { data, error } = await client.from("profiles").select("sync_epoch").eq("user_id", userId).maybeSingle();
      if (error || !data) return null;
      const epoch = Number((data as { sync_epoch?: number }).sync_epoch);
      return Number.isFinite(epoch) ? epoch : null;
    },

    async pushProfile(stats: ProfileStats) {
      const { error } = await client
        .from("profiles")
        .update({ level: stats.level, streak: stats.streak, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      fail("profile", error);
    },
  };
}
