// Supabase Edge Function to deliver scheduled Web Push reminders.
// Called every 5 minutes via pg_cron + pg_net.
// Requires service role key in Authorization header.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** A review this close before the reminder time makes the reminder pointless */
const RECENT_STUDY_MS = 2 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  // Only callable with the service role key
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!serviceRoleKey || !authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error("Missing required push environment configuration");
    return new Response(JSON.stringify({ error: "Configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const thirtyMinutesAgoIso = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  // Fetch pending reminder plans due up to now, within the last 30 minutes
  const { data: plans, error: planError } = await supabase
    .from("push_plan")
    .select("user_id, at, title, body, due, created_at")
    .lte("at", nowIso)
    .gt("at", thirtyMinutesAgoIso)
    .is("sent_at", null)
    .is("skipped", null)
    .limit(500);

  if (planError) {
    console.error("Failed to query push plans:", planError.message);
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const plan of plans ?? []) {
    try {
      // Studied shortly before this reminder (on any device, after the plan was made): no need to remind.
      // Only the last 2 hours count, so a morning session does not cancel the evening study time.
      const recentFrom = Math.max(new Date(plan.created_at).getTime(), new Date(plan.at).getTime() - RECENT_STUDY_MS);
      const { data: logs, error: logError } = await supabase
        .from("sync_rows")
        .select("key")
        .eq("user_id", plan.user_id)
        .eq("kind", "log")
        .gt("updated_at", new Date(recentFrom).toISOString())
        .limit(1);

      if (logError) {
        console.error("Failed to query sync logs:", logError.message);
        failed++;
        continue;
      }

      if (logs && logs.length > 0) {
        const { error: skipErr } = await supabase
          .from("push_plan")
          .update({ skipped: "studied" })
          .eq("user_id", plan.user_id)
          .eq("at", plan.at);

        if (skipErr) {
          console.error("Failed to mark plan skipped:", skipErr.message);
          failed++;
        } else {
          skipped++;
        }
        continue;
      }

      // Fetch active subscriptions for this user
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", plan.user_id);

      if (subError) {
        console.error("Failed to query subscriptions:", subError.message);
        failed++;
        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        const { error: skipErr } = await supabase
          .from("push_plan")
          .update({ skipped: "no_subscription" })
          .eq("user_id", plan.user_id)
          .eq("at", plan.at);

        if (skipErr) {
          console.error("Failed to mark plan skipped:", skipErr.message);
          failed++;
        } else {
          skipped++;
        }
        continue;
      }

      const payload = JSON.stringify({
        title: plan.title,
        body: plan.body,
        url: "/learn/review",
        tag: "myenglish-reminder",
      });

      let delivered = false;

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
            {
              TTL: 3600,
              urgency: "normal",
            }
          );

          delivered = true;
          await supabase
            .from("push_subscriptions")
            .update({ last_ok_at: new Date().toISOString() })
            .eq("endpoint", sub.endpoint);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number; status?: number })?.statusCode ??
            (err as { statusCode?: number; status?: number })?.status;

          if (status === 404 || status === 410) {
            // Subscription expired or unregistered: prune it
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
          console.error("Push delivery error status:", status ?? "network error");
        }
      }

      // Mark the plan row as sent
      const { error: markError } = await supabase
        .from("push_plan")
        .update({ sent_at: new Date().toISOString() })
        .eq("user_id", plan.user_id)
        .eq("at", plan.at);

      if (markError) {
        console.error("Failed to mark plan sent:", markError.message);
        failed++;
      } else if (delivered) {
        sent++;
      } else {
        // Subscriptions existed but none succeeded
        failed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error("Error processing reminder plan row:", msg);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, skipped, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
