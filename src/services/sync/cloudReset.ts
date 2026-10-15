import { getSupabase } from "../supabase";

/**
 * "Reset all data" while signed in also empties the account's synced copy: otherwise the next sync would bring
 * everything back. No account, nothing to do. Throws when the account cannot be reached (the reset then stops
 * before it touches anything).
 */
export async function clearCloudProgress(): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client.rpc("sync_clear");
  if (error) throw new Error(`Không xóa được dữ liệu trên tài khoản (${error.message}). Cần có mạng để đặt lại khi đang đăng nhập.`);
}
