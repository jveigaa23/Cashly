/** Testes de banco: PostgreSQL temporário com as migrações (ver tests/support). */
import type { TestProject } from "vitest/node";
import { createMigratedDatabase, startPostgres } from "../support/postgres";

export const TEMPLATE_DB = "cashly_template";

export default async function setup(project: TestProject) {
  const pg = await startPostgres();
  try {
    await createMigratedDatabase(pg.port, TEMPLATE_DB);
  } catch (error) {
    pg.stop();
    throw error;
  }
  project.provide("pgPort", pg.port);
  return () => pg.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    pgPort: number;
  }
}
