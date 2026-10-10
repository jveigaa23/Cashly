import { afterAll, expect, it } from "vitest";
import { anonClient, clientFor, closeAdminDb, createItUser } from "./helpers";

afterAll(closeAdminDb);

it("supabase-js → PostgREST local: RPC, RLS e anon", async () => {
  const user = await createItUser("Ana");
  const supabase = clientFor(user);
  const { data: id, error } = await supabase.rpc("create_household", { p_name: "Família IT", p_display_name: "Ana" });
  expect(error).toBeNull();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  const { data: cats } = await supabase.from("categories").select("id, name").eq("kind", "income");
  expect(cats).toHaveLength(4);

  const anon = await anonClient().from("categories").select("id");
  expect(anon.error?.code).toBe("42501");
});
