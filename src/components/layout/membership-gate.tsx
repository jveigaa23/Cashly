import { requireMember } from "@/server/session";

/**
 * Garante login + família em toda a área do app (sem família → /bem-vindo).
 * Proteção de interface; os dados em si são protegidos em cada consulta
 * (DAL) e pelo RLS do banco.
 */
export async function MembershipGate() {
  await requireMember();
  return null;
}
