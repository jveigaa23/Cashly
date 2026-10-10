import { afterAll, beforeAll, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./helpers";

let db: Client;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDatabase()));
afterAll(async () => drop());

it("aplica as migrações", async () => {
  const { rows } = await db.query("select count(*)::int as n from pg_tables where schemaname = 'public'");
  expect(rows[0].n).toBeGreaterThanOrEqual(16);
});
