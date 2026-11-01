import { create } from "zustand";
import { getSupabase, isCloudConfigured } from "@/services/supabase";
import { accountErrorMessage } from "@/services/accountErrors";
import { AVATAR_ID_PATTERN } from "@/services/avatars";
import type { SyncReport } from "@/services/sync/types";

export interface AccountUser {
  id: string;
  email: string;
}

export interface AccountProfile {
  displayName: string;
  /** Id of a preset avatar (services/avatars.ts), null when none was chosen */
  avatar: string | null;
  level: number;
  streak: number;
}

export type SyncStatus = "idle" | "syncing" | "error";

interface AuthState {
  /** Supabase keys are present in this build */
  configured: boolean;
  /** The stored session has been read (the account section can show its real state) */
  ready: boolean;
  user: AccountUser | null;
  profile: AccountProfile | null;
  busy: boolean;
  /** Message after an action that needs the user's attention (e.g. confirm the email) */
  notice: string | null;
  error: string | null;
  sync: {
    status: SyncStatus;
    lastSyncAt: string | null;
    error: string | null;
    lastReport: SyncReport | null;
    /** This machine last synced with another account: the user must choose what happens to its data */
    accountMismatch: boolean;
    /** Why: another account ("account"), or this account was reset from another machine ("reset") */
    mismatchReason?: "account" | "reset";
  };

  init: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  updateDisplayName: (name: string) => Promise<boolean>;
  updateAvatar: (id: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  setSync: (patch: Partial<AuthState["sync"]>) => void;
  clearMessages: () => void;
}

const initialSync: AuthState["sync"] = { status: "idle", lastSyncAt: null, error: null, lastReport: null, accountMismatch: false };

let initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  /** Run an auth call, keeping `busy` and `error` right whatever happens */
  const run = async (fn: () => Promise<boolean>): Promise<boolean> => {
    set({ busy: true, error: null, notice: null });
    try {
      return await fn();
    } catch (err) {
      set({ error: accountErrorMessage(err) });
      return false;
    } finally {
      set({ busy: false });
    }
  };

  return {
    configured: isCloudConfigured(),
    ready: false,
    user: null,
    profile: null,
    busy: false,
    notice: null,
    error: null,
    sync: initialSync,

    init: async () => {
      const client = getSupabase();
      if (!client) {
        set({ ready: true });
        return;
      }
      if (initPromise) {
        await initPromise;
        return;
      }
      initPromise = (async () => {
        const apply = (session: { user: { id: string; email?: string | null } } | null) => {
          const user = session ? { id: session.user.id, email: session.user.email ?? "" } : null;
          if (user?.id === get().user?.id) return;
          set({ user, profile: user ? get().profile : null, sync: user ? get().sync : initialSync });
          if (user) void get().refreshProfile();
        };
        client.auth.onAuthStateChange((_event, session) => apply(session));
        try {
          const { data } = await client.auth.getSession();
          apply(data.session);
        } catch {
          // offline start: the stored session is used once the network is back
        }
        set({ ready: true });
      })();
      await initPromise;
    },

    signUp: (email, password, displayName) =>
      run(async () => {
        const client = getSupabase();
        if (!client) return false;
        const name = displayName.trim();
        if (name.length < 3 || name.length > 20) {
          set({ error: "Tên hiển thị cần từ 3 đến 20 ký tự." });
          return false;
        }
        const { data: free, error: nameError } = await client.rpc("display_name_available", { p_name: name });
        if (nameError) throw nameError;
        if (!free) {
          set({ error: "Tên hiển thị này đã có người dùng." });
          return false;
        }
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name } } });
        if (error) throw error;
        if (!data.session) set({ notice: "Đã gửi thư xác nhận. Mở thư để xác nhận email, rồi đăng nhập." });
        return true;
      }),

    signIn: (email, password) =>
      run(async () => {
        const client = getSupabase();
        if (!client) return false;
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        return true;
      }),

    signOut: async () => {
      const client = getSupabase();
      set({ busy: true, error: null, notice: null });
      try {
        // Local data stays, still tied to this account: another account signing in here is asked first
        const { forgetAccount } = await import("@/services/sync/engine");
        await forgetAccount().catch(() => {});
        if (client) await client.auth.signOut();
      } catch (err) {
        set({ error: accountErrorMessage(err) });
      } finally {
        set({ busy: false, user: null, profile: null, sync: initialSync });
      }
    },

    resetPassword: (email) =>
      run(async () => {
        const client = getSupabase();
        if (!client) return false;
        const { error } = await client.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        set({ notice: "Đã gửi thư đặt lại mật khẩu (nếu email có tài khoản)." });
        return true;
      }),

    updateDisplayName: (name) =>
      run(async () => {
        const client = getSupabase();
        const user = get().user;
        if (!client || !user) return false;
        const clean = name.trim();
        if (clean.length < 3 || clean.length > 20) {
          set({ error: "Tên hiển thị cần từ 3 đến 20 ký tự." });
          return false;
        }
        const { error } = await client
          .from("profiles")
          .update({ display_name: clean, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) throw error;
        await get().refreshProfile();
        return true;
      }),

    updateAvatar: (id) =>
      run(async () => {
        const client = getSupabase();
        const user = get().user;
        if (!client || !user || !AVATAR_ID_PATTERN.test(id)) return false;
        const { error } = await client
          .from("profiles")
          .update({ avatar: id, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) {
          // Column missing: migration 0003 has not been run on the project
          if (/avatar/i.test(error.message)) throw new Error("Máy chủ chưa hỗ trợ avatar: hãy chạy supabase/migrations/0003_avatar.sql.");
          throw error;
        }
        const profile = get().profile;
        if (profile) set({ profile: { ...profile, avatar: id } });
        return true;
      }),

    refreshProfile: async () => {
      const client = getSupabase();
      const user = get().user;
      if (!client || !user) return;
      // `avatar` exists after migration 0003: without it the profile still loads, just without a face
      const query = (columns: string) => client.from("profiles").select(columns).eq("user_id", user.id).maybeSingle();
      let res = await query("display_name, level, streak, avatar");
      if (res.error) res = await query("display_name, level, streak");
      const row = res.data as unknown as { display_name: string; level: number; streak: number; avatar?: string | null } | null;
      if (row && get().user?.id === user.id) {
        set({ profile: { displayName: row.display_name, level: row.level, streak: row.streak, avatar: row.avatar ?? null } });
      }
    },

    setSync: (patch) => set({ sync: { ...get().sync, ...patch } }),
    clearMessages: () => set({ error: null, notice: null }),
  };
});
