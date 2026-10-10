import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendPush } = await import("./push");

const target = { endpoint: "https://push.exemplo.test/1", p256dh: "k", authSecret: "a" };
const payload = { title: "Luz", body: "Vence amanhã.", url: "/contas/1", tag: "t" };
const config = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@exemplo.test" };

describe("sendPush", () => {
  it("envia com VAPID, TTL e o conteúdo em JSON", async () => {
    const send = vi.fn(async () => ({}));
    expect(await sendPush(target, payload, config, send)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: "k", auth: "a" } },
      JSON.stringify(payload),
      expect.objectContaining({ vapidDetails: { subject: config.subject, publicKey: "pub", privateKey: "priv" }, TTL: 86400 }),
    );
  });
  it("404/410 = aparelho expirado; outros erros só falham", async () => {
    const fail = (statusCode?: number) => vi.fn(async () => { throw Object.assign(new Error("x"), { statusCode }); });
    expect(await sendPush(target, payload, config, fail(410))).toEqual({ ok: false, expired: true, code: "push_410" });
    expect(await sendPush(target, payload, config, fail(404))).toEqual({ ok: false, expired: true, code: "push_404" });
    expect(await sendPush(target, payload, config, fail(500))).toEqual({ ok: false, expired: false, code: "push_500" });
    expect(await sendPush(target, payload, config, fail())).toEqual({ ok: false, expired: false, code: "push_error" });
  });
});
