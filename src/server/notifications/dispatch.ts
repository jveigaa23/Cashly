import "server-only";
import { describeNotification, type NotificationFacts } from "@/domain/notifications";
import type { AdminClient } from "@/lib/supabase/admin";
import { logServerError } from "../errors";
import type { PushConfig } from "./config";
import { sendPush, type SendFn } from "./push";
import { feedRowToFacts, type FeedRow } from "./feed";

export const MAX_ATTEMPTS = 3;

export interface DispatchResult {
  enqueued: number;
  sent: number;
  failed: number;
  retrying: number;
  skipped: number;
  expiredDevices: number;
}

/**
 * Agendador de push: enfileira (idempotente, no banco) e envia os pendentes.
 * Um aviso conta como enviado se chegou a pelo menos um aparelho; falhas são
 * tentadas de novo nas próximas execuções até MAX_ATTEMPTS. Nada de valores
 * financeiros no conteúdo nem nos logs.
 */
export async function dispatchPush(
  db: AdminClient,
  config: PushConfig,
  { now = new Date(), send, limit = 500 }: { now?: Date; send?: SendFn; limit?: number } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { enqueued: 0, sent: 0, failed: 0, retrying: 0, skipped: 0, expiredDevices: 0 };
  const enq = await db.rpc("enqueue_push_notifications", { p_now: now.toISOString() });
  if (enq.error) {
    logServerError("enqueue_push", enq.error);
    throw new Error("enqueue_failed");
  }
  result.enqueued = enq.data;

  const pending = await db
    .from("notification_feed")
    .select("*")
    .eq("channel", "push")
    .eq("status", "pending")
    .order("created_at")
    .limit(limit);
  if (pending.error) {
    logServerError("pending_push", pending.error);
    throw new Error("pending_failed");
  }
  if (pending.data.length === 0) return result;

  const members = [...new Set(pending.data.map((d) => d.member_id))];
  const subs = await db.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth_secret").in("member_id", members).is("expired_at", null);
  if (subs.error) {
    logServerError("push_subscriptions", subs.error);
    throw new Error("subscriptions_failed");
  }
  const households = await db.from("households").select("id, timezone").in("id", [...new Set(pending.data.map((d) => d.household_id))]);
  const tz = new Map((households.data ?? []).map((h) => [h.id, h.timezone]));
  const expired = new Set<string>();

  for (const row of pending.data as FeedRow[]) {
    const today = now.toLocaleDateString("en-CA", { timeZone: tz.get(row.household_id) ?? "America/Sao_Paulo" });
    const facts: NotificationFacts = feedRowToFacts(row);
    const text = describeNotification(facts, today);
    const targets = (subs.data ?? []).filter((s) => s.member_id === row.member_id && !expired.has(s.id));

    if (text.gone || text.resolved || targets.length === 0) {
      // Resolvido antes do envio (pago, removido) ou sem aparelho: não envia.
      await db.from("notification_deliveries").update({ status: "failed", error_code: text.resolved ? "resolved" : "no_device" }).eq("id", row.id);
      result.skipped++;
      continue;
    }

    let delivered = false;
    let lastCode = "push_error";
    for (const s of targets) {
      const r = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, authSecret: s.auth_secret }, { title: text.title, body: text.body, url: text.href, tag: row.id }, config, send);
      if (r.ok) delivered = true;
      else {
        lastCode = r.code;
        if (r.expired) {
          expired.add(s.id);
          await db.from("push_subscriptions").update({ expired_at: now.toISOString() }).eq("id", s.id);
          result.expiredDevices++;
        }
      }
    }

    const attempts = row.attempts + 1;
    if (delivered) {
      await db.from("notification_deliveries").update({ status: "sent", sent_at: now.toISOString(), attempts, error_code: null }).eq("id", row.id);
      result.sent++;
    } else if (attempts >= MAX_ATTEMPTS) {
      await db.from("notification_deliveries").update({ status: "failed", attempts, error_code: lastCode }).eq("id", row.id);
      result.failed++;
    } else {
      await db.from("notification_deliveries").update({ attempts, error_code: lastCode }).eq("id", row.id);
      result.retrying++;
    }
  }
  return result;
}
