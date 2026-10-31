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
- XP from at most 30 devices (10 before 0009) per account (a reinstall gets a new device id). A 31st device still syncs progress,
  but its XP is refused and the account section says so.
- The streak shown on the board is at most the number of days with XP in the streak's span.

Still possible for a modified client: claiming up to the daily cap on days it did not study.

## Web version content (0008, 0009)

The web version reads the word list and the grammar catalog from the database instead of the app bundle.

1. In the SQL editor run `migrations/0008_content.sql`, then `migrations/0009_xp_device_limit.sql` (in that order,
   after 0001-0007). 0008 creates `catalog_meta`, `catalog_words` and `grammar_content` (read-only through the
   API); 0009 raises the XP device limit from 10 to 30 because each browser counts as a device. The daily XP caps
   per account are unchanged.
2. Upload the content from your own machine. Always dry-run first (no network, prints counts and sizes):

   ```
   node scripts/web/upload-content.mjs --dry-run
   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/web/upload-content.mjs
   ```

   Flags: `--vocab`, `--grammar` (no flag = both), `--grammar-enabled=true|false`.
3. To hide all grammar content without deleting it:
   `... node scripts/web/upload-content.mjs --grammar-enabled=false` (only updates the flag). Use `=true` to show it again.
4. The `service_role` key bypasses RLS. Keep it on the admin's machine only: never commit it, never put it in
   the web app's environment variables, never ship it in a build.

## Web Push (0010)

Delivers study reminders while the browser tab is closed. The browser computes its own reminder schedule
and uploads it to `push_plan`; an Edge Function checks pending reminders every 5 minutes and sends
Web Push notifications to active subscriptions. The server never invents reminders.

1. In the SQL editor run `migrations/0010_web_push.sql` to create `push_subscriptions`, `push_plan`, and the RPCs
   (`push_subscribe`, `push_unsubscribe`, `push_plan_set`).
2. Generate a VAPID key pair on your machine:

   ```bash
   node scripts/web/gen-vapid-keys.mjs
   ```

3. Set the Edge Function secrets in Supabase CLI (the private key is never exposed to the client):

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com
   ```

4. Deploy the Edge Function:

   ```bash
   supabase functions deploy send-reminders --no-verify-jwt
   ```

5. Store your `service_role` key in Supabase Vault so pg_cron can invoke the function securely:

   ```sql
   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key', 'Supabase service role key for cron');
   ```

6. Schedule the function every 5 minutes with `pg_cron` and `pg_net` (turn both on first under **Database → Extensions**):

   ```sql
   select cron.schedule('send-reminders', '*/5 * * * *', $$ select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/send-reminders', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), 'Content-Type', 'application/json')) $$);
   ```

7. Web app configuration: the web frontend needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `web/.env.local` (see `web/.env.example`).

