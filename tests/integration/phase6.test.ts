import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { Membership } from "@/server/session";
import { adminDb, clientFor, closeAdminDb, createItUser, signJwt, type ItUser } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const state: { client?: ReturnType<typeof clientFor>; membership?: Membership } = {};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/session")>()),
  requireMember: async () => state.membership,
  getMembership: async () => state.membership,
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const actions = await import("@/server/notifications/actions");
const queries = await import("@/server/notifications/queries");
const { dispatchPush } = await import("@/server/notifications/dispatch");

const serviceClient = () =>
  createSupabaseClient<Database>(inject("restUrl"), "chave-publica-de-teste", {
    global: { headers: { Authorization: `Bearer ${signJwt({ role: "service_role" })}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const CONFIG = { publicKey: "pub", privateKey: "priv", subject: "mailto:teste@exemplo.test" };
const SUB = (n: number) => ({ endpoint: `https://push.exemplo.test/${n}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });

let user: ItUser;
let membership: Membership;
let householdId: string;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const plusDays = (d: number) => {
  const t = new Date(`${today()}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  user = await createItUser("Ana");
  const client = clientFor(user);
  const { data } = await client.rpc("create_household", { p_name: "Família Ana", p_display_name: "Ana" });
  householdId = data!;
  const { data: m } = await client.from("household_members").select("id").eq("user_id", user.id).single();
  membership = { memberId: m!.id, householdId, householdName: "Família Ana", timezone: "America/Sao_Paulo", role: "owner", displayName: "Ana" };
  const db = await adminDb();
  await db.query("insert into bills (household_id, name, original_amount, due_date) values ($1, 'Conta de água', 80, $2), ($1, 'Aluguel', 1500, $3)", [
    householdId, plusDays(1), plusDays(20),
  ]);
});
afterAll(closeAdminDb);
beforeEach(() => {
  state.client = clientFor(user);
  state.membership = membership;
});

describe("avisos internos", () => {
  it("o sino gera o aviso da conta que vence amanhã (e não da que vence em 20 dias)", async () => {
    expect(await queries.refreshNotifications()).toBe(1);
    const items = await queries.listNotifications(today());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Conta de água", body: "Vence amanhã.", unread: true, event: "due_soon" });
    expect(items[0].href).toMatch(/^\/contas\/[0-9a-f-]{36}$/);
  });

  it("marcar como lido e marcar todos", async () => {
    const [item] = await queries.listNotifications(today());
    expect(await actions.markNotificationReadAction(item.id)).toMatchObject({ status: "success" });
    expect(await queries.refreshNotifications()).toBe(0);
    expect(await actions.markAllReadAction()).toMatchObject({ status: "success" });
    expect(await actions.markNotificationReadAction("x")).toMatchObject({ status: "error" });
  });

  it("preferências: 30 dias antes passa a avisar o aluguel; desligar o interno para de gerar", async () => {
    const on: Record<string, string> = { daysBefore: "30" };
    for (const e of ["due_soon", "overdue", "installment", "budget"]) on[`in_app:${e}`] = "on";
    expect(await actions.savePreferencesAction({ status: "idle" }, form(on))).toMatchObject({ status: "success" });
    const prefs = await queries.loadPreferences();
    expect(prefs.find((p) => p.event === "due_soon")).toEqual({ event: "due_soon", inApp: true, push: false, daysBefore: 30 });
    expect(await queries.refreshNotifications()).toBe(1);
    expect((await queries.listNotifications(today())).map((n) => n.title)).toContain("Aluguel");

    expect(await actions.savePreferencesAction({ status: "idle" }, form({ daysBefore: "99" }))).toMatchObject({ status: "error" });
    // Volta ao padrão para os próximos testes.
    const db = await adminDb();
    await db.query("delete from notification_preferences");
  });
});

describe("push", () => {
  it("registrar e remover aparelho; inscrição inválida é recusada", async () => {
    expect(await actions.registerPushAction(SUB(1), "Teste")).toMatchObject({ status: "success" });
    expect(await queries.countDevices()).toBe(1);
    expect(await actions.registerPushAction({ endpoint: "http://x", keys: {} }, "")).toMatchObject({ status: "error" });
    expect(await actions.unregisterPushAction(SUB(1).endpoint)).toMatchObject({ status: "success" });
    expect(await queries.countDevices()).toBe(0);
  });

  it("agendador: envia sem valores, não repete, expira aparelho 410 e tenta de novo em falha temporária", async () => {
    await actions.registerPushAction(SUB(2), "Celular");
    await actions.registerPushAction(SUB(3), "Tablet");
    const sent: { endpoint: string; payload: string }[] = [];
    const send = vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.endsWith("/3")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload });
    });
    const r = await dispatchPush(serviceClient(), CONFIG, { send });
    expect(r).toMatchObject({ enqueued: 1, sent: 1, failed: 0, expiredDevices: 1 });
    expect(sent).toHaveLength(1);
    const payload = JSON.parse(sent[0].payload);
    expect(payload).toMatchObject({ title: "Conta de água", body: "Vence amanhã." });
    expect(payload.url).toMatch(/^\/contas\//);
    expect(Object.keys(payload).sort()).toEqual(["body", "tag", "title", "url"]);
    // Nenhum valor da conta (R$ 80,00) no texto; a URL tem UUID e não entra na checagem.
    expect(`${payload.title} ${payload.body}`).not.toMatch(/R\$|\b80([,.]00)?\b/);

    // Idempotente: nada novo para enviar.
    expect(await dispatchPush(serviceClient(), CONFIG, { send })).toMatchObject({ enqueued: 0, sent: 0 });
    expect(await queries.countDevices()).toBe(1);

    // Falha temporária: fica pendente e desiste após 3 tentativas.
    const db = await adminDb();
    await db.query("delete from notification_deliveries where channel = 'push'");
    const failing = vi.fn(async () => {
      throw Object.assign(new Error("tmp"), { statusCode: 503 });
    });
    expect(await dispatchPush(serviceClient(), CONFIG, { send: failing })).toMatchObject({ retrying: 1 });
    expect(await dispatchPush(serviceClient(), CONFIG, { send: failing })).toMatchObject({ retrying: 1 });
    expect(await dispatchPush(serviceClient(), CONFIG, { send: failing })).toMatchObject({ failed: 1 });
    const { rows } = await db.query("select status, attempts, error_code from notification_deliveries where channel = 'push'");
    expect(rows).toEqual([{ status: "failed", attempts: 3, error_code: "push_503" }]);
  });

  it("usuário comum não chama o agendador", async () => {
    const { error } = await clientFor(user).rpc("enqueue_push_notifications", {});
    expect(error?.code).toBe("42501");
  });
});

describe("rota do agendador", () => {
  it("401 sem o segredo; 503 dizendo o que falta quando não configurado; nada de dados na resposta", async () => {
    const { GET } = await import("@/app/api/cron/notificacoes/route");
    const { NextRequest } = await import("next/server");
    const secret = "c".repeat(40);
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const unauthorized = await GET(new NextRequest("http://localhost/api/cron/notificacoes"));
    expect(unauthorized.status).toBe(401);
    const wrong = await GET(new NextRequest("http://localhost/api/cron/notificacoes", { headers: { authorization: "Bearer errado" } }));
    expect(wrong.status).toBe(401);
    const res = await GET(new NextRequest("http://localhost/api/cron/notificacoes", { headers: { authorization: `Bearer ${secret}` } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not_configured");
    expect(body.missing).toContain("SUPABASE_SECRET_KEY");
    expect(res.headers.get("cache-control")).toBe("no-store");
    vi.unstubAllEnvs();
  });
});
