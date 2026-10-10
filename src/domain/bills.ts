/**
 * Regras de contas a pagar (puras, sem banco nem interface).
 * Valores em centavos inteiros; datas "AAAA-MM-DD"; `today` sempre injetado.
 * O banco aplica as mesmas regras (funções register_bill_payment etc.):
 * aqui elas servem para exibir e para validar antes de enviar.
 */
import { daysBetween, type CalendarDate } from "@/lib/format/date";

export type BillStatus = "pending" | "partially_paid" | "paid" | "canceled";

export interface BillPayment {
  amountCents: number;
  principalCents: number;
  chargesCents: number;
  canceled: boolean;
}

export interface BillFacts {
  originalCents: number;
  dueDate: CalendarDate;
  status: BillStatus;
  payments: BillPayment[];
}

/** Situação mostrada à pessoa. "Vencida" é derivada, nunca gravada. */
export type BillSituation =
  | "pending"
  | "due_today"
  | "overdue"
  | "partially_paid"
  | "partially_paid_overdue"
  | "paid"
  | "canceled";

export interface BillSummary {
  paidPrincipalCents: number;
  paidChargesCents: number;
  paidTotalCents: number;
  outstandingCents: number;
  situation: BillSituation;
  /** Dias de atraso (0 se não vencida). */
  daysOverdue: number;
  /** Dias até o vencimento (negativo se já passou). */
  daysUntilDue: number;
}

export function statusFromPaid(originalCents: number, paidPrincipalCents: number): Exclude<BillStatus, "canceled"> {
  if (paidPrincipalCents >= originalCents) return "paid";
  if (paidPrincipalCents > 0) return "partially_paid";
  return "pending";
}

export function summarizeBill(bill: BillFacts, today: CalendarDate): BillSummary {
  const active = bill.payments.filter((p) => !p.canceled);
  const paidPrincipalCents = active.reduce((s, p) => s + p.principalCents, 0);
  const paidChargesCents = active.reduce((s, p) => s + p.chargesCents, 0);
  const outstandingCents = Math.max(0, bill.originalCents - paidPrincipalCents);
  const daysUntilDue = daysBetween(today, bill.dueDate);
  const daysOverdue = bill.status !== "canceled" && outstandingCents > 0 && daysUntilDue < 0 ? -daysUntilDue : 0;

  let situation: BillSituation;
  if (bill.status === "canceled") situation = "canceled";
  else if (outstandingCents === 0) situation = "paid";
  else if (paidPrincipalCents > 0) situation = daysOverdue > 0 ? "partially_paid_overdue" : "partially_paid";
  else if (daysOverdue > 0) situation = "overdue";
  else if (daysUntilDue === 0) situation = "due_today";
  else situation = "pending";

  return {
    paidPrincipalCents,
    paidChargesCents,
    paidTotalCents: paidPrincipalCents + paidChargesCents,
    outstandingCents,
    situation,
    daysOverdue,
    daysUntilDue,
  };
}

export const SITUATION_LABEL: Record<BillSituation, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  pending: { label: "A vencer", tone: "warning" },
  due_today: { label: "Vence hoje", tone: "warning" },
  overdue: { label: "Vencida", tone: "danger" },
  partially_paid: { label: "Paga em parte", tone: "info" },
  partially_paid_overdue: { label: "Vencida, paga em parte", tone: "danger" },
  paid: { label: "Paga", tone: "success" },
  canceled: { label: "Cancelada", tone: "neutral" },
};

export type PaymentCheck =
  | { ok: true; principalCents: number }
  | { ok: false; field: "amount" | "charges" | "paidOn" | "form"; error: string };

/** Valida um pagamento antes de enviar (o banco valida de novo). */
export function checkPayment(input: {
  status: BillStatus;
  outstandingCents: number;
  amountCents: number;
  chargesCents: number;
  paidOn: CalendarDate;
  today: CalendarDate;
}): PaymentCheck {
  if (input.status === "canceled") return { ok: false, field: "form", error: "Esta conta foi cancelada." };
  if (input.status === "paid" || input.outstandingCents === 0) return { ok: false, field: "form", error: "Esta conta já está paga." };
  if (input.amountCents <= 0) return { ok: false, field: "amount", error: "Informe um valor maior que zero." };
  if (input.chargesCents < 0) return { ok: false, field: "charges", error: "Os encargos não podem ser negativos." };
  if (input.chargesCents >= input.amountCents) {
    return { ok: false, field: "charges", error: "Os encargos precisam ser menores que o valor pago." };
  }
  if (daysBetween(input.today, input.paidOn) > 0) {
    return { ok: false, field: "paidOn", error: "A data do pagamento não pode ser no futuro." };
  }
  const principalCents = input.amountCents - input.chargesCents;
  if (principalCents > input.outstandingCents) {
    return {
      ok: false,
      field: "amount",
      error: "O valor é maior que o que falta pagar. Se a diferença for juros ou multa, informe em “Encargos”.",
    };
  }
  return { ok: true, principalCents };
}
