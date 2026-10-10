import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { pushConfig, schedulerMissing, whatsappStatus } = await import("./config");

describe("configuração dos canais", () => {
  it("push exige as três variáveis VAPID e subject mailto:/https", () => {
    expect(pushConfig({})).toBeNull();
    expect(pushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "x@y" })).toBeNull();
    expect(pushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:x@y" })).toEqual({ publicKey: "a", privateKey: "b", subject: "mailto:x@y" });
  });
  it("agendador lista os nomes do que falta, nunca valores", () => {
    expect(schedulerMissing({ CRON_SECRET: "curto" })).toEqual(["CRON_SECRET", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT"]);
  });
  it("WhatsApp nunca aparece como configurado nesta versão", () => {
    expect(whatsappStatus({}).configured).toBe(false);
    expect(whatsappStatus({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_TEMPLATE_DUE_SOON: "x" }).configured).toBe(false);
  });
});
