import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { as, createHousehold, createTestDatabase, createUser, type TestUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
let user: TestUser;
let partner: TestUser;
let stranger: TestUser;
let household: string;
let member: string;
let partnerMember: string;
let food: string;

const TODAY = "2026-03-10";

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  user = await createUser(db);
  partner = await createUser(db);
  stranger = await createUser(db);
  household = await createHousehold(db, user);
  await createHousehold(db, stranger);
  member = (await db.query("select id from household_members where user_id = $1", [user.id])).rows[0].id;
  partnerMember = (
    await db.query("insert into household_members (household_id, user_id, display_name, role) values ($1, $2, 'Par', 'member') returning id", [household, partner.id])
  ).rows[0].id;
  food = (await db.query("select id from categories where household_id = $1 and name = 'Alimentação'", [household])).rows[0].id;
});
afterAll(async () => drop());
beforeEach(async () => {
  await db.query("delete from notification_deliveries");
  await db.query("delete from notification_preferences");
  await db.query("delete from push_subscriptions");
  await db.query("delete from budgets");
});

const run = (sql: string, params: unknown[] = [], who: TestUser = user) => as(db, { user: who }, (q) => q(sql, params));
const service = (sql: string, params: unknown[] = []) => as(db, "service_role", (q) => q(sql, params));
const bill = (due: string, status = "pending") =>
  db
    .query("insert into bills (household_id, name, original_amount, due_date, status, canceled_at) values ($1, 'Luz', 100, $2, $3, $4) returning id", [
      household, due, status, status === "canceled" ? new Date() : null,
    ])
    .then((r) => r.rows[0].id as string);
const candidates = (channel = "in_app", today = TODAY, m = member) =>
  db
    .query("select event, reference_type, reference_id, scheduled_for::text, variant from private.notification_candidates($1, $2, $3, $4) order by event, variant", [
      household, m, channel, today,
    ])
    .then((r) => r.rows);
const refresh = (today = TODAY, m = member) => db.query("select private.refresh_in_app($1, $2, $3) as n", [household, m, today]).then((r) => r.rows[0].n as number);

describe("candidatos a aviso", () => {
  it("conta a vencer dentro de N dias (padrão 3), vencida até 30 dias; paga e cancelada ficam de fora", async () => {
    const soon = await bill("2026-03-13");
    await bill("2026-03-14"); // fora da janela de 3 dias
    const late = await bill("2026-03-01");
    await bill("2026-02-01"); // vencida há mais de 30 dias
    await bill("2026-03-11", "paid");
    await bill("2026-03-11", "canceled");
    const rows = await candidates();
    expect(rows).toEqual([
      { event: "due_soon", reference_type: "bill", reference_id: soon, scheduled_for: "2026-03-13", variant: "" },
      { event: "overdue", reference_type: "bill", reference_id: late, scheduled_for: "2026-03-01", variant: "" },
    ]);
    await db.query("delete from bills");
  });

  it("preferência: desligar o evento ou mudar os dias de antecedência", async () => {
    await bill("2026-03-15");
    expect(await candidates()).toHaveLength(0);
    await run("insert into notification_preferences (household_id, member_id, channel, event, days_before) values ($1, $2, 'in_app', 'due_soon', 5)", [household, member]);
    expect(await candidates()).toHaveLength(1);
    // A preferência é de cada pessoa e de cada canal.
    expect(await candidates("in_app", TODAY, partnerMember)).toHaveLength(0);
    expect(await candidates("push")).toHaveLength(0);
    await run("update notification_preferences set enabled = false where member_id = $1", [member]);
    expect(await candidates()).toHaveLength(0);
    // WhatsApp desligado por padrão.
    await bill("2026-03-11");
    expect(await candidates("whatsapp")).toHaveLength(0);
    await db.query("delete from bills");
  });

  it("parcelas: a vencer (evento installment) e vencidas (overdue); plano cancelado não avisa", async () => {
    const plan = (await run("select public.create_installment_plan('purchase', 'Geladeira', null, 300, 3, '2026-02-12', 'none', 0) as id")).rows[0].id;
    const due = await db.query("select id, number, due_date::text from installments where plan_id = $1 order by number", [plan]);
    const rows = await candidates();
    expect(rows).toEqual([
      { event: "installment", reference_type: "installment", reference_id: due.rows[1].id, scheduled_for: "2026-03-12", variant: "" },
      { event: "overdue", reference_type: "installment", reference_id: due.rows[0].id, scheduled_for: "2026-02-12", variant: "" },
    ]);
    await run("select public.cancel_installment_plan($1, 'Desisti da compra')", [plan]);
    expect(await candidates()).toEqual([]);
  });

  it("orçamento: perto do limite (alert) e ultrapassado (over), só despesas pagas do mês", async () => {
    await run("insert into budgets (household_id, month, category_id, limit_amount, alert_percent) values ($1, '2026-03-01', $2, 100, 80)", [household, food]);
    const tx = (amount: string, status = "confirmed", date = "2026-03-05") =>
      run("insert into transactions (household_id, type, status, amount, occurred_on, description, category_id) values ($1, 'expense', $2, $3, $4, 'x', $5)", [
        household, status, amount, date, food,
      ]);
    await tx("79.99");
    await tx("500", "planned");
    await tx("500", "confirmed", "2026-02-28");
    expect(await candidates()).toEqual([]);
    await tx("0.01");
    expect((await candidates()).map((r) => r.variant)).toEqual(["alert"]);
    await tx("20.01");
    expect((await candidates()).map((r) => r.variant)).toEqual(["alert", "over"]);
    await db.query("delete from transactions");
  });
});

describe("avisos internos", () => {
  it("idempotente: atualizar duas vezes não duplica; pagar a conta dá o aviso como lido", async () => {
    const id = await bill("2026-03-11");
    expect(await refresh()).toBe(1);
    expect(await refresh()).toBe(0);
    const { rows } = await db.query("select status, channel from notification_deliveries");
    expect(rows).toEqual([{ status: "sent", channel: "in_app" }]);

    await db.query("update bills set status = 'paid' where id = $1", [id]);
    await refresh();
    expect((await db.query("select status, read_at is not null as read from notification_deliveries")).rows).toEqual([{ status: "read", read: true }]);
    await db.query("delete from bills");
  });

  it("refresh_notifications: só para quem chama, devolve não lidos; outra família não vê", async () => {
    await bill(new Date().toISOString().slice(0, 10)); // vence "hoje" no relógio do banco
    const unread = (await run("select public.refresh_notifications() as n")).rows[0].n;
    expect(unread).toBeGreaterThanOrEqual(1);
    expect((await db.query("select distinct member_id from notification_deliveries")).rows).toEqual([{ member_id: member }]);

    expect((await run("select id from notification_feed", [], partner)).rows).toEqual([]);
    expect((await run("select id from notification_feed", [], stranger)).rows).toEqual([]);
    const feed = (await run("select reference_name, reference_status, event from notification_feed")).rows;
    expect(feed[0]).toMatchObject({ reference_name: "Luz", reference_status: "pending" });
    await db.query("delete from bills");
  });

  it("a pessoa só marca como lido; não cria nem altera outros campos", async () => {
    await bill("2026-03-11");
    await refresh();
    const id = (await db.query("select id from notification_deliveries")).rows[0].id;
    await expect(run("update notification_deliveries set status = 'sent' where id = $1", [id])).rejects.toThrow(/row-level security/);
    await expect(run("update notification_deliveries set event = 'budget' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(
      run("insert into notification_deliveries (household_id, member_id, channel, event, reference_type, reference_id, scheduled_for) values ($1, $2, 'in_app', 'budget', 'budget', gen_random_uuid(), $3)", [household, member, TODAY]),
    ).rejects.toThrow(/permission denied/);
    const r = await run("update notification_deliveries set status = 'read', read_at = now() where id = $1 returning id", [id]);
    expect(r.rowCount).toBe(1);
    // O parceiro não marca o aviso de outra pessoa.
    expect((await run("update notification_deliveries set status = 'read' where id = $1 returning id", [id], partner)).rowCount).toBe(0);
    await db.query("delete from bills");
  });
});

describe("push", () => {
  const P256 = "B".repeat(87);
  const AUTH = "a".repeat(22);

  it("registrar aparelho: valida, atualiza e transfere endpoint de aparelho compartilhado", async () => {
    const endpoint = "https://push.exemplo.test/abc";
    await run("select public.register_push_subscription($1, $2, $3, 'Teste')", [endpoint, P256, AUTH]);
    await run("select public.register_push_subscription($1, $2, $3, 'Teste')", [endpoint, P256, AUTH]);
    expect((await db.query("select member_id from push_subscriptions")).rows).toEqual([{ member_id: member }]);

    await run("select public.register_push_subscription($1, $2, $3, null)", [endpoint, P256, AUTH], partner);
    expect((await db.query("select member_id from push_subscriptions")).rows).toEqual([{ member_id: partnerMember }]);
    expect((await run("select id from push_subscriptions")).rows).toEqual([]);

    await expect(run("select public.register_push_subscription('http://inseguro', $1, $2)", [P256, AUTH])).rejects.toThrow(/invalid_subscription/);
    await expect(run("select public.register_push_subscription($1, 'curto', $2)", [endpoint, AUTH])).rejects.toThrow(/invalid_subscription/);
  });

  it("agendador enfileira só para quem tem aparelho ativo, na data da família, sem duplicar", async () => {
    await bill("2026-03-11");
    await run("select public.register_push_subscription('https://push.exemplo.test/1', $1, $2)", [P256, AUTH]);
    // 10/03 às 23h em São Paulo = 11/03 02h UTC: a data da família é 10/03.
    const now = "2026-03-11T02:00:00Z";
    expect((await service("select public.enqueue_push_notifications($1) as n", [now])).rows[0].n).toBe(1);
    expect((await service("select public.enqueue_push_notifications($1) as n", [now])).rows[0].n).toBe(0);
    expect((await db.query("select member_id, channel, status from notification_deliveries")).rows).toEqual([
      { member_id: member, channel: "push", status: "pending" },
    ]);
    await db.query("update push_subscriptions set expired_at = now()");
    await db.query("delete from notification_deliveries");
    expect((await service("select public.enqueue_push_notifications($1) as n", [now])).rows[0].n).toBe(0);
    await db.query("delete from bills");
  });

  it("só o service_role chama o agendador; anon não acessa nada", async () => {
    await expect(run("select public.enqueue_push_notifications()")).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (q) => q("select public.refresh_notifications()"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (q) => q("select * from notification_feed"))).rejects.toThrow(/permission denied/);
  });
});
