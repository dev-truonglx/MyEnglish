/**
 * The Supabase client of the account features (sign-in, sync, leaderboard). Used by the main window only.
 * Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app stays fully offline and this returns null.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isCloudConfigured(): boolean {
  return !!URL && !!ANON_KEY && /^https:\/\//.test(URL);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(URL!, ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The webview is not a browser tab: there is no OAuth redirect to read from its address
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
