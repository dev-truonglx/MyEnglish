# Supabase backend (accounts, sync, leaderboard)

The app works fully offline without any of this. With a Supabase project connected, a learner can sign in,
keep their progress in step across machines and race others on XP.

## Set up

1. Create a project at <https://supabase.com> (free tier is enough).
2. **SQL editor** → paste and run [`migrations/0001_init.sql`](migrations/0001_init.sql), then [`migrations/0002_standing.sql`](migrations/0002_standing.sql) (rank widgets), then [`migrations/0003_avatar.sql`](migrations/0003_avatar.sql) (profile avatars), then [`migrations/0004_progress_merge.sql`](migrations/0004_progress_merge.sql) (conflicts settled by progress first), then [`migrations/0005_xp_limits.sql`](migrations/0005_xp_limits.sql) (XP and streak limits per account), then [`migrations/0006_sync_scale.sql`](migrations/0006_sync_scale.sql) (scale and hardening). Each file is run once, in order.

   0006 changes:
   - the leaderboard sums the XP ledger once instead of per profile, and `standing_board` returns the rank widgets' data (top, you, the people just above and below, the total) in one call
   - `sync_push` skips a row with an unreadable timestamp instead of failing the batch, and an account stores at most 300,000 synced rows
   - `profiles.sync_epoch` goes up on "reset all data", so other devices can notice the reset
   - invite codes come from a cryptographically random source (10 characters)
   - display names are trimmed and their spaces collapsed, 3-20 characters, checked in the database
   - row level security policies use `(select auth.uid())`, which Postgres evaluates once per query
3. **Authentication → Providers → Email**: keep email + password on.
   - Easiest: turn **Confirm email** off, so a new account can sign in at once.
   - With it on, sign-up shows "check your email" and sign-in works after the link is opened.
4. **Project Settings → API**: copy the *Project URL* and the *anon / publishable key*.
5. In the repo root create `.env.local` (gitignored, see `.env.example`):

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
   ```

   The anon key is meant to ship inside client apps; row level security is what protects the data.
   Never put the `service_role` key here.
6. Restart `npm run tauri dev` (or rebuild). Without these two variables the account section says the
   feature is not configured and nothing else changes.

## What is stored

| Table | Content |
|---|---|
| `profiles` | display name, avatar (preset id), level, streak, reset counter (`sync_epoch`) |
| `sync_rows` | generic synced rows (`card`, `word`, `log`, `event`, `mistake`, `grammar`, `kv`) as JSON |
| `sync_usage` | rows stored per account (the 300,000-row quota; not readable through the API) |
| `xp_daily` | XP earned per device per day (the leaderboard sums it) |
| `groups`, `group_members` | friend groups joined with an invite code |

Never uploaded: the imported grammar book, custom grammar exercises, the Oxford deck itself, API keys and
machine paths. Only an allowlist of settings is synced.

## Trust

XP is reported by the app. The database bounds it but cannot prove it was earned: the ranking is meant for
friends, not for prizes. The limits (0005):

- 5000 XP per account per day, all devices together; a device's day never decreases.
- XP from before the first sync (opening balance): 100,000 per account in all, written once per device.
- XP from at most 10 devices per account (a reinstall gets a new device id). An 11th device still syncs progress,
  but its XP is refused and the account section says so.
- The streak shown on the board is at most the number of days with XP in the streak's span.

Still possible for a modified client: claiming up to the daily cap on days it did not study.
