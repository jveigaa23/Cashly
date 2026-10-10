"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { addMonths } from "@/lib/format/date";
import { dbMoney } from "@/lib/supabase/money";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { accountSchema, budgetSchema } from "@/lib/validation/finance";
import { logServerError, rpcErrorMessage } from "../errors";
import { requireMember } from "../session";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const values = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, text(form, k)]));

/** Define (cria ou altera) o limite de um mês, geral ou por categoria. */
export async function saveBudgetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const v = values(form, ["month", "categoryId", "limit", "alertPercent"]);
  const parsed = budgetSchema.safeParse(v);
  if (!parsed.success) return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values: v };
  const b = parsed.data;

  const supabase = await createClient();
  let existing = supabase.from("budgets").select("id").eq("month", `${b.month}-01`);
  existing = b.categoryId ? existing.eq("category_id", b.categoryId) : existing.is("category_id", null);
  const found = await existing.maybeSingle();
  if (found.error) {
    logServerError("saveBudget lookup", found.error);
    return { status: "error", message: rpcErrorMessage(found.error), values: v };
  }

  const { error } = found.data
    ? await supabase.from("budgets").update({ limit_amount: dbMoney(b.limit), alert_percent: b.alertPercent }).eq("id", found.data.id)
    : await supabase.from("budgets").insert({
        household_id: membership.householdId,
        month: `${b.month}-01`,
        category_id: b.categoryId,
        limit_amount: dbMoney(b.limit),
        alert_percent: b.alertPercent,
      });
  if (error) {
    logServerError("saveBudget", error);
    const message = error.code === "23503" ? "Escolha uma categoria de despesa." : rpcErrorMessage(error);
    return { status: "error", message, values: v };
  }
  revalidatePath("/orcamento");
  redirect(`/orcamento?mes=${b.month}&salvo=1`);
}

export async function removeBudgetAction(budgetId: string, month: string): Promise<FormState> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
  if (error) {
    logServerError("removeBudget", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  revalidatePath("/orcamento");
  redirect(`/orcamento?mes=${month}&removido=1`);
}

/** Copia os limites do mês anterior que ainda não existem neste mês. */
export async function copyPreviousBudgetsAction(month: string): Promise<FormState> {
  const membership = await requireMember();
  if (!z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(month).success) return { status: "error", message: "Mês inválido." };
  const supabase = await createClient();
  const [prev, current] = await Promise.all([
    supabase.from("budgets").select("category_id, limit_amount::text, alert_percent").eq("month", `${addMonths(month, -1)}-01`),
    supabase.from("budgets").select("category_id").eq("month", `${month}-01`),
  ]);
  if (prev.error || current.error) {
    logServerError("copyBudgets", prev.error ?? current.error);
    return { status: "error", message: rpcErrorMessage(prev.error ?? current.error) };
  }
  const existing = new Set(current.data.map((b) => b.category_id ?? ""));
  const rows = (prev.data as unknown as { category_id: string | null; limit_amount: string; alert_percent: number }[])
    .filter((b) => !existing.has(b.category_id ?? ""))
    .map((b) => ({
      household_id: membership.householdId,
      month: `${month}-01`,
      category_id: b.category_id,
      limit_amount: b.limit_amount as unknown as number,
      alert_percent: b.alert_percent,
    }));
  if (rows.length === 0) return { status: "error", message: "Não há limites do mês anterior para copiar." };
  const { error } = await supabase.from("budgets").insert(rows);
  if (error) {
    logServerError("copyBudgets insert", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  revalidatePath("/orcamento");
  redirect(`/orcamento?mes=${month}&copiado=1`);
}

/** Nome e saldo inicial de uma conta de registro (não é conta bancária real). */
export async function updateAccountAction(accountId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireMember();
  const v = values(form, ["name", "openingBalance", "openingDate"]);
  const parsed = accountSchema.safeParse(v);
  if (!parsed.success) return { status: "error", message: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error), values: v };
  const a = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .update({ name: a.name, opening_balance: dbMoney(a.openingBalance), opening_date: a.openingDate })
    .eq("id", accountId)
    .select("id");
  if (error) {
    logServerError("updateAccount", error);
    return { status: "error", message: rpcErrorMessage(error), values: v };
  }
  if (data.length === 0) return { status: "error", message: rpcErrorMessage({ message: "not_found" }), values: v };
  revalidatePath("/");
  revalidatePath("/ajustes");
  return { status: "success", message: "Conta salva. O saldo registrado foi atualizado." };
}
