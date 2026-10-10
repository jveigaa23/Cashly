import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createHousehold, createTestDatabase, createUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDatabase()));
afterAll(async () => drop());

const rpc = (sql: string, params: unknown[] = []) => (q: Client["query"]) => q(sql, params);

describe("create_household", () => {
  it("cria família, dono, categorias e conta padrão", async () => {
    const user = await createUser(db);
    const id = await createHousehold(db, user, "  Família Silva ");
    const data = await as(db, { user }, async (q) => ({
      household: (await q("select name, timezone from households where id = $1", [id])).rows[0],
      members: (await q("select role, display_name from household_members")).rows,
      categories: (await q("select kind, count(*)::int as n from categories group by kind order by kind")).rows,
      accounts: (await q("select name from accounts")).rows,
    }));
    expect(data.household).toEqual({ name: "Família Silva", timezone: "America/Sao_Paulo" });
    expect(data.members).toEqual([{ role: "owner", display_name: "Dono" }]);
    expect(data.categories).toEqual([
      { kind: "expense", n: 9 },
      { kind: "income", n: 4 },
    ]);
    expect(data.accounts).toEqual([{ name: "Conta principal" }]);
  });

  it("um usuário pertence a no máximo uma família", async () => {
    const user = await createUser(db);
    await createHousehold(db, user);
    await expect(createHousehold(db, user)).rejects.toThrow("already_member");
  });

  it("exige login", async () => {
    await expect(
      as(db, { user: { id: "", email: "" } }, rpc("select public.create_household('X', 'Y')")),
    ).rejects.toThrow();
  });

  it("valida nome e fuso", async () => {
    const user = await createUser(db);
    await expect(createHousehold(db, user, "   ")).rejects.toThrow(/check constraint/);
    const ok = await createUser(db);
    const id = await createHousehold(db, ok);
    await expect(
      as(db, { user: ok }, rpc("update households set timezone = 'Marte/Olimpo' where id = $1", [id])),
    ).rejects.toThrow(/time zone/);
  });
});

describe("convites", () => {
  async function setup() {
    const owner = await createUser(db);
    const householdId = await createHousehold(db, owner);
    const invited = await createUser(db);
    const createInvite = (email = invited.email, by = owner) =>
      as(db, { user: by }, async (q) => (await q("select public.create_household_invite($1) as t", [email])).rows[0].t as string);
    const accept = (token: string, user = invited) =>
      as(db, { user }, async (q) => (await q("select public.accept_household_invite($1, 'Pai') as h", [token])).rows[0].h as string);
    return { owner, householdId, invited, createInvite, accept };
  }

  it("convidado com o e-mail certo entra na família e passa a ver os dados", async () => {
    const { householdId, invited, createInvite, accept } = await setup();
    const token = await createInvite(invited.email.toUpperCase());
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await accept(token)).toBe(householdId);

    const { rows } = await as(db, { user: invited }, rpc("select count(*)::int as n from categories"));
    expect(rows[0].n).toBe(13);
    const member = await as(db, { user: invited }, rpc("select role from household_members where user_id = $1", [invited.id]));
    expect(member.rows[0].role).toBe("member");
  });

  it("guarda apenas o hash do token", async () => {
    const { createInvite } = await setup();
    const token = await createInvite();
    const { rows } = await db.query("select count(*)::int as n from household_invites where token_hash = $1", [token]);
    expect(rows[0].n).toBe(0);
  });

  it("token não pode ser reutilizado", async () => {
    const { createInvite, accept } = await setup();
    const token = await createInvite();
    await accept(token);
    const other = await createUser(db);
    await expect(accept(token, other)).rejects.toThrow("invite_invalid");
  });

  it("e-mail diferente do convidado é recusado", async () => {
    const { createInvite, accept } = await setup();
    const token = await createInvite();
    const intruder = await createUser(db);
    await expect(accept(token, intruder)).rejects.toThrow("invite_email_mismatch");
  });

  it("convite expirado ou revogado é recusado", async () => {
    const { createInvite, accept, owner } = await setup();
    const expired = await createInvite();
    await db.query("update household_invites set expires_at = now() - interval '1 minute' where revoked_at is null");
    await expect(accept(expired)).rejects.toThrow("invite_invalid");

    const second = await createInvite();
    const { rows } = await db.query("select id from household_invites where revoked_at is null and expires_at > now()");
    await as(db, { user: owner }, rpc("select public.revoke_household_invite($1)", [rows[0].id]));
    await expect(accept(second)).rejects.toThrow("invite_invalid");
  });

  it("novo convite para o mesmo e-mail invalida o anterior", async () => {
    const { createInvite, accept } = await setup();
    const first = await createInvite();
    const second = await createInvite();
    await expect(accept(first)).rejects.toThrow("invite_invalid");
    await expect(accept(second)).resolves.toBeTruthy();
  });

  it("só o dono convida; membro comum e estranhos não", async () => {
    const { createInvite, accept, invited } = await setup();
    await accept(await createInvite());
    await expect(createInvite("x@exemplo.test", invited)).rejects.toThrow("not_owner");
    const stranger = await createUser(db);
    await expect(createInvite("y@exemplo.test", stranger)).rejects.toThrow("not_owner");
  });

  it("membro comum não vê os convites; o dono vê", async () => {
    const { createInvite, accept, invited, owner } = await setup();
    await accept(await createInvite());
    await createInvite("outro@exemplo.test");
    const asMember = await as(db, { user: invited }, rpc("select count(*)::int as n from household_invites"));
    expect(asMember.rows[0].n).toBe(0);
    const asOwner = await as(db, { user: owner }, rpc("select count(*)::int as n from household_invites"));
    expect(asOwner.rows[0].n).toBe(2);
  });

  it("não convida quem já participa de uma família", async () => {
    const { createInvite } = await setup();
    const other = await createUser(db);
    await createHousehold(db, other);
    await expect(createInvite(other.email)).rejects.toThrow("already_member");
  });

  it("limita a quantidade de convites por dia", async () => {
    const { createInvite } = await setup();
    for (let i = 0; i < 10; i++) await createInvite(`p${i}@exemplo.test`);
    await expect(createInvite("p10@exemplo.test")).rejects.toThrow("rate_limited");
  });
});
