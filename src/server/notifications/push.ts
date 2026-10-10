import "server-only";
import webpush from "web-push";
import type { PushConfig } from "./config";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  authSecret: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export type PushResult = { ok: true } | { ok: false; expired: boolean; code: string };

export type SendFn = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

/** Envia um aviso a um aparelho. 404/410 = inscrição expirada (remover). */
export async function sendPush(target: PushTarget, payload: PushPayload, config: PushConfig, send: SendFn = webpush.sendNotification): Promise<PushResult> {
  try {
    await send({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.authSecret } }, JSON.stringify(payload), {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: 24 * 60 * 60,
      urgency: "normal",
      timeout: 10_000,
    });
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return { ok: false, expired: status === 404 || status === 410, code: status ? `push_${status}` : "push_error" };
  }
}
