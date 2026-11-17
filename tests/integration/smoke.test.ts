import { afterAll, expect, it } from "vitest";
import { anonClient, clientFor, closeAdminDb, createItUser } from "./helpers";

afterAll(closeAdminDb);

it("postgrest-js → PostgREST local: RPC, RLS e anonymous", async () => {
  const user = await createItUser("Ana");
  const db = clientFor(user);
  const { data: id, error } = await db.rpc("create_household", { p_name: "Família IT", p_display_name: "Ana" });
  expect(error).toBeNull();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  const { data: cats } = await db.from("categories").select("id, name").eq("kind", "income");
  expect(cats).toHaveLength(4);

  const anon = await anonClient().from("categories").select("id");
  expect(anon.error?.code).toBe("42501");
});
