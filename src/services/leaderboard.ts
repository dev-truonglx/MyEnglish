/** Leaderboard and friend groups (Supabase RPCs, see supabase/migrations). Signed-in main window only. */
import { getSupabase } from "./supabase";
import { getLocalDateString } from "./streak";

export type BoardKind = "week" | "month" | "all" | "streak";

export interface LeaderRow {
  rank: number;
  displayName: string;
  avatar: string | null;
  xp: number;
  level: number;
  streak: number;
  isMe: boolean;
}

export interface GroupInfo {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  isOwner: boolean;
}

/** Monday of the week of `now` (local time) */
export function weekStart(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * The days a board counts, as local dates: `from` null = all time. There is no upper bound: XP of days to come
 * does not exist, and a bound in the learner's time zone would cut off what the server dates differently.
 */
export function boardRange(kind: BoardKind, now: Date = new Date()): { from: string | null } {
  if (kind === "week") return { from: getLocalDateString(weekStart(now)) };
  if (kind === "month") return { from: getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)) };
  return { from: null };
}

function client() {
  const c = getSupabase();
  if (!c) throw new Error("Chưa cấu hình tài khoản");
  return c;
}

export async function fetchLeaderboard(kind: BoardKind, groupId: string | null = null, limit = 50, now: Date = new Date()): Promise<LeaderRow[]> {
  const { data, error } = await client().rpc("leaderboard", {
    p_from: boardRange(kind, now).from,
    p_to: null,
    p_group: groupId,
    p_by: kind === "streak" ? "streak" : "xp",
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ rank: number; display_name: string; avatar?: string | null; xp: number; level: number; streak: number; is_me: boolean }>).map((r) => ({
    rank: Number(r.rank),
    displayName: r.display_name,
    avatar: r.avatar ?? null,
    xp: Number(r.xp),
    level: r.level,
    streak: r.streak,
    isMe: r.is_me,
  }));
}

function toGroup(r: { id: string; name: string; invite_code: string; member_count?: number; is_owner?: boolean }): GroupInfo {
  return { id: r.id, name: r.name, inviteCode: r.invite_code, memberCount: Number(r.member_count ?? 1), isOwner: !!r.is_owner };
}

export async function fetchMyGroups(): Promise<GroupInfo[]> {
  const { data, error } = await client().rpc("my_groups");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Parameters<typeof toGroup>[0][]).map(toGroup);
}

export async function createGroup(name: string): Promise<GroupInfo> {
  const { data, error } = await client().rpc("create_group", { p_name: name });
  if (error) throw new Error(error.message);
  return toGroup((data as Parameters<typeof toGroup>[0][])[0]);
}

export async function joinGroup(code: string): Promise<GroupInfo> {
  const { data, error } = await client().rpc("join_group", { p_code: code });
  if (error) throw new Error(error.message);
  return toGroup((data as Parameters<typeof toGroup>[0][])[0]);
}

export async function leaveGroup(id: string): Promise<void> {
  const { error } = await client().rpc("leave_group", { p_group: id });
  if (error) throw new Error(error.message);
}

/** Rows of the board shown beside Today */
export const BOARD_SIZE = 10;

export interface Standing {
  rank: number;
  total: number;
  xp: number;
  above: { name: string; xp: number } | null;
  below: { name: string; xp: number } | null;
  /** The top of the board (Today's side panel); the caller's own row is added when outside it */
  board: LeaderRow[];
}

/** The project has not run the migration that defines `fn` yet (PostgREST: function not in its schema cache) */
function isMissingFunction(error: { code?: string; message?: string }, fn: string): boolean {
  return error.code === "PGRST202" || (error.message ?? "").includes(`public.${fn}`);
}

type StandingRow = {
  rank: number; display_name: string; avatar?: string | null; xp: number; level: number; streak: number;
  is_me: boolean; is_above: boolean; is_below: boolean; total: number;
};

/**
 * Week's XP of the caller, with the neighbours on the board. Null when the account has no standing yet.
 * One call (standing_board, migration 0006) instead of my_standing + leaderboard, each of which scored every
 * profile; projects without 0006 still get the two calls.
 */
export async function fetchStanding(groupId: string | null, now: Date = new Date()): Promise<Standing | null> {
  const from = boardRange("week", now).from;
  const { data, error } = await client().rpc("standing_board", { p_from: from, p_group: groupId, p_limit: BOARD_SIZE });
  if (error) {
    if (isMissingFunction(error, "standing_board")) return fetchStandingLegacy(groupId, now);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as StandingRow[];
  const me = rows.find((r) => r.is_me);
  if (!me) return null;
  const above = rows.find((r) => r.is_above);
  const below = rows.find((r) => r.is_below);
  const toRow = (r: StandingRow): LeaderRow => ({
    rank: Number(r.rank),
    displayName: r.display_name,
    avatar: r.avatar ?? null,
    xp: Number(r.xp),
    level: r.level,
    streak: r.streak,
    isMe: r.is_me,
  });
  return {
    rank: Number(me.rank),
    total: Number(me.total),
    xp: Number(me.xp),
    above: above ? { name: above.display_name, xp: Number(above.xp) } : null,
    below: below ? { name: below.display_name, xp: Number(below.xp) } : null,
    // As the leaderboard returns it: the top of the board, plus the caller's own row when outside it
    board: rows.filter((r) => Number(r.rank) <= BOARD_SIZE || r.is_me).map(toRow),
  };
}

async function fetchStandingLegacy(groupId: string | null, now: Date): Promise<Standing | null> {
  const [standing, board] = await Promise.all([
    client().rpc("my_standing", { p_from: boardRange("week", now).from, p_group: groupId }),
    fetchLeaderboard("week", groupId, BOARD_SIZE, now),
  ]);
  if (standing.error) throw new Error(standing.error.message);
  const r = ((standing.data ?? []) as Array<{
    rank: number; total: number; xp: number; above_name: string | null; above_xp: number | null; below_name: string | null; below_xp: number | null;
  }>)[0];
  if (!r) return null;
  return {
    rank: Number(r.rank),
    total: Number(r.total),
    xp: Number(r.xp),
    above: r.above_name != null ? { name: r.above_name, xp: Number(r.above_xp) } : null,
    below: r.below_name != null ? { name: r.below_name, xp: Number(r.below_xp) } : null,
    board,
  };
}

/** XP still needed to pass the person just above (ties share a rank, so one more than their XP) */
export function xpToPass(s: Pick<Standing, "xp" | "above">): number | null {
  return s.above ? Math.max(1, s.above.xp - s.xp + 1) : null;
}

/** Next Monday 00:00 local: when the weekly board starts over */
export function weekEnd(now: Date = new Date()): Date {
  const d = weekStart(now);
  d.setDate(d.getDate() + 7);
  return d;
}

/** "còn 2 ngày" / "còn 5 giờ": time left in the week */
export function weekTimeLeft(now: Date = new Date()): string {
  const ms = weekEnd(now).getTime() - now.getTime();
  const hours = Math.max(1, Math.ceil(ms / 3_600_000));
  if (hours > 24) return `còn ${Math.ceil(hours / 24)} ngày`;
  return `còn ${hours} giờ`;
}

/** What changed between two standings (for the end of a session): null when there is nothing to say */
export function rankChange(before: Standing | null, after: Standing | null): { from: number; to: number; passed: string | null } | null {
  if (!before || !after) return null;
  return {
    from: before.rank,
    to: after.rank,
    // the person who was just above before and is not any more
    passed: after.rank < before.rank && before.above && !(after.above && after.above.name === before.above.name) ? before.above.name : null,
  };
}

/** The line that says what to do next: who is just above, or the lead */
export function standingMessage(s: Standing): string {
  if (s.xp === 0) return "Tuần này bạn chưa có XP. Ôn vài thẻ là lên bảng ngay.";
  const gap = xpToPass(s);
  if (gap !== null && s.above) return `Còn ${gap.toLocaleString("vi-VN")} XP nữa là vượt ${s.above.name}.`;
  if (s.below) return `Bạn đang dẫn đầu, hơn ${s.below.name} ${(s.xp - s.below.xp).toLocaleString("vi-VN")} XP.`;
  return "Bạn đang dẫn đầu tuần này!";
}
