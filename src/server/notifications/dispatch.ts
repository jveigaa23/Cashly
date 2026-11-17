import "server-only";
import { describeNotification, type NotificationFacts } from "@/domain/notifications";
import type { ServiceDb } from "@/lib/db/admin";
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

interface Subscription {
  id: string;
  member_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
}

/** Erros do pg têm `code` (SQLSTATE); só ele vai para o log. */
function dbError(context: string, error: unknown): never {
  logServerError(context, { code: (error as { code?: string })?.code });
  throw new Error(`${context}_failed`);
}

/**
 * Agendador de push: enfileira (idempotente, no banco) e envia os pendentes.
 * Um aviso conta como enviado se chegou a pelo menos um aparelho; falhas são
 * tentadas de novo nas próximas execuções até MAX_ATTEMPTS. Nada de valores
 * financeiros no conteúdo nem nos logs.
 *
 * Leituras e enfileiramento numa transação; cada envio grava seu resultado na
 * sua própria transação (um aparelho lento não segura o banco).
 */
export async function dispatchPush(
  db: ServiceDb,
  config: PushConfig,
  { now = new Date(), send, limit = 500 }: { now?: Date; send?: SendFn; limit?: number } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { enqueued: 0, sent: 0, failed: 0, retrying: 0, skipped: 0, expiredDevices: 0 };

  const loaded = await db
    .transaction(async (q) => {
      const [enq] = await q<{ n: number }>("select public.enqueue_push_notifications($1) as n", [now.toISOString()]);
      const pending = await q<FeedRow>(
        "select * from public.notification_feed where channel = 'push' and status = 'pending' order by created_at limit $1",
        [limit],
      );
      const members = [...new Set(pending.map((d) => d.member_id))];
      const households = [...new Set(pending.map((d) => d.household_id))];
      const subs = pending.length
        ? await q<Subscription>(
            "select id, member_id, endpoint, p256dh, auth_secret from public.push_subscriptions where member_id = any($1::uuid[]) and expired_at is null",
            [members],
          )
        : [];
      const zones = pending.length
        ? await q<{ id: string; timezone: string }>("select id, timezone from public.households where id = any($1::uuid[])", [households])
        : [];
      return { enqueued: Number(enq?.n ?? 0), pending, subs, zones };
    })
    .catch((error) => dbError("enqueue_push", error));

  result.enqueued = loaded.enqueued;
  if (loaded.pending.length === 0) return result;

  const tz = new Map(loaded.zones.map((h) => [h.id, h.timezone]));
  const expired = new Set<string>();
  const update = (sql: string, params: unknown[]) =>
    db.transaction((q) => q(sql, params)).catch((error) => dbError("push_update", error));

  for (const row of loaded.pending) {
    const today = now.toLocaleDateString("en-CA", { timeZone: tz.get(row.household_id) ?? "America/Sao_Paulo" });
    const facts: NotificationFacts = feedRowToFacts(row);
    const text = describeNotification(facts, today);
    const targets = loaded.subs.filter((s) => s.member_id === row.member_id && !expired.has(s.id));

    if (text.gone || text.resolved || targets.length === 0) {
      // Resolvido antes do envio (pago, removido) ou sem aparelho: não envia.
      await update("update public.notification_deliveries set status = 'failed', error_code = $2 where id = $1", [
        row.id,
        text.resolved ? "resolved" : "no_device",
      ]);
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
          await update("update public.push_subscriptions set expired_at = $2 where id = $1", [s.id, now.toISOString()]);
          result.expiredDevices++;
        }
      }
    }

    const attempts = row.attempts + 1;
    if (delivered) {
      await update(
        "update public.notification_deliveries set status = 'sent', sent_at = $2, attempts = $3, error_code = null where id = $1",
        [row.id, now.toISOString(), attempts],
      );
      result.sent++;
    } else if (attempts >= MAX_ATTEMPTS) {
      await update("update public.notification_deliveries set status = 'failed', attempts = $2, error_code = $3 where id = $1", [
        row.id,
        attempts,
        lastCode,
      ]);
      result.failed++;
    } else {
      await update("update public.notification_deliveries set attempts = $2, error_code = $3 where id = $1", [row.id, attempts, lastCode]);
      result.retrying++;
    }
  }
  return result;
}
