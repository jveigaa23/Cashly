import { daysBetween, formatCalendarDate, formatMonthYear, type CalendarDate } from "@/lib/format/date";

/**
 * Texto dos avisos (internos e push), montado na hora a partir dos dados
 * atuais da referência. Sem valores em dinheiro: o aviso chama para o app,
 * onde os valores aparecem com o contexto certo.
 */

export type NotificationEvent = "due_soon" | "overdue" | "installment" | "budget";

export interface NotificationFacts {
  event: NotificationEvent;
  referenceType: "bill" | "installment" | "budget";
  referenceId: string;
  variant: "" | "alert" | "over";
  referenceName: string | null;
  referenceDueDate: CalendarDate | null;
  referenceStatus: string | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  planId: string | null;
  budgetMonth: string | null;
  budgetAlertPercent: number | null;
  budgetGeneral: boolean | null;
}

export interface NotificationText {
  title: string;
  body: string;
  href: string;
  /** A referência deixou de existir (ex.: orçamento removido). */
  gone: boolean;
  /** Já foi resolvido (pago/cancelado) depois do aviso. */
  resolved: boolean;
}

/** "Vence hoje", "Vence amanhã", "Vence em 14/03 (em 4 dias)", "Venceu em 01/03". */
export function dueText(due: CalendarDate, today: CalendarDate): string {
  const days = daysBetween(today, due);
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days > 1) return `Vence em ${formatCalendarDate(due).slice(0, 5)} (em ${days} dias)`;
  if (days === -1) return "Venceu ontem";
  return `Venceu em ${formatCalendarDate(due).slice(0, 5)} (há ${-days} dias)`;
}

const OPEN = new Set(["pending", "partially_paid"]);

export function describeNotification(n: NotificationFacts, today: CalendarDate): NotificationText {
  if (n.referenceType === "budget") {
    const month = n.budgetMonth ? formatMonthYear(n.budgetMonth) : "";
    if (!n.budgetMonth) return { title: "Orçamento removido", body: "Este limite foi removido.", href: "/orcamento", gone: true, resolved: true };
    const name = n.budgetGeneral ? "limite geral" : (n.referenceName ?? "categoria");
    return {
      title: n.variant === "over" ? `Orçamento ultrapassado: ${name}` : `Orçamento perto do limite: ${name}`,
      body: n.variant === "over"
        ? `As despesas pagas passaram do limite de ${month}.`
        : `As despesas pagas chegaram a ${n.budgetAlertPercent ?? 80}% do limite de ${month}.`,
      href: `/orcamento?mes=${n.budgetMonth.slice(0, 7)}`,
      gone: false,
      resolved: false,
    };
  }

  const isInstallment = n.referenceType === "installment";
  const href = isInstallment ? (n.planId ? `/parcelas/${n.planId}` : "/parcelas") : `/contas/${n.referenceId}`;
  if (!n.referenceName || !n.referenceDueDate) {
    return { title: "Item não encontrado", body: "O item deste aviso não existe mais.", href: isInstallment ? "/parcelas" : "/contas", gone: true, resolved: true };
  }
  const resolved = !OPEN.has(n.referenceStatus ?? "");
  const title = isInstallment
    ? `${n.referenceName} — parcela ${n.installmentNumber}/${n.installmentCount}`
    : n.referenceName;
  let body = dueText(n.referenceDueDate, today);
  if (resolved) body = n.referenceStatus === "paid" ? "Já foi paga." : "Foi cancelada.";
  else if (n.referenceDueDate < today) body += " e ainda não foi paga.";
  else body += ".";
  return { title, body, href, gone: false, resolved };
}

export const EVENT_LABELS: Record<NotificationEvent, string> = {
  due_soon: "Contas a vencer",
  overdue: "Contas e parcelas vencidas",
  installment: "Parcelas a vencer",
  budget: "Orçamento perto ou acima do limite",
};
