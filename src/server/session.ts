import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { toCalendarDate, type CalendarDate } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "./errors";

/**
 * Camada de acesso (DAL). Toda página e ação com dados da família passa por
 * aqui: a identidade vem do token verificado (getClaims), nunca do cliente.
 */

export interface SessionUser {
  id: string;
  email: string;
  /** Nome informado no cadastro (pode estar vazio). */
  name: string;
}

export interface Membership {
  memberId: string;
  householdId: string;
  householdName: string;
  timezone: string;
  role: "owner" | "member";
  displayName: string;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const metadata = (data.claims.user_metadata ?? {}) as { display_name?: unknown };
  return {
    id: data.claims.sub,
    email: String(data.claims.email ?? ""),
    name: typeof metadata.display_name === "string" ? metadata.display_name : "",
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return user;
}

export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("id, role, display_name, households!inner(id, name, timezone)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logServerError("getMembership", error);
    // Falha real de leitura: não fingir que a pessoa não tem família.
    throw new Error("Não foi possível carregar os dados da família.");
  }
  if (!data) return null;

  return {
    memberId: data.id,
    householdId: data.households.id,
    householdName: data.households.name,
    timezone: data.households.timezone,
    role: data.role === "owner" ? "owner" : "member",
    displayName: data.display_name,
  };
});

/** Exige login e família; sem família, leva ao cadastro inicial. */
export async function requireMember(): Promise<Membership> {
  const membership = await getMembership();
  if (!membership) redirect("/bem-vindo");
  return membership;
}

export async function requireOwner(): Promise<Membership> {
  const membership = await requireMember();
  if (membership.role !== "owner") redirect("/ajustes");
  return membership;
}

/** "Hoje" no fuso da família (instante de referência injetável para testes). */
export function todayFor(membership: Pick<Membership, "timezone">, now: Date = new Date()): CalendarDate {
  return toCalendarDate(now, membership.timezone);
}
