/**
 * Totais de receitas e despesas (puros). Regras:
 * - cancelados nunca entram;
 * - "previsto" (planned) fica separado do realizado (confirmed);
 * - contas a pagar NÃO entram aqui: só o lançamento gerado pelo pagamento,
 *   que existe uma única vez por pagamento (sem dupla contagem).
 */
export type TransactionType = "income" | "expense";
export type TransactionStatus = "planned" | "confirmed" | "canceled";

export interface TransactionFacts {
  type: TransactionType;
  status: TransactionStatus;
  amountCents: number;
}

export interface PeriodTotals {
  incomeCents: number;
  expenseCents: number;
  /** Receitas realizadas − despesas realizadas. */
  resultCents: number;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
}

export function totalsOf(transactions: TransactionFacts[]): PeriodTotals {
  const totals = { incomeCents: 0, expenseCents: 0, plannedIncomeCents: 0, plannedExpenseCents: 0 };
  for (const t of transactions) {
    if (t.status === "canceled") continue;
    if (t.status === "confirmed") {
      if (t.type === "income") totals.incomeCents += t.amountCents;
      else totals.expenseCents += t.amountCents;
    } else if (t.type === "income") totals.plannedIncomeCents += t.amountCents;
    else totals.plannedExpenseCents += t.amountCents;
  }
  return { ...totals, resultCents: totals.incomeCents - totals.expenseCents };
}

export const TRANSACTION_STATUS_LABEL: Record<TransactionType, Record<TransactionStatus, string>> = {
  income: { confirmed: "Recebida", planned: "Prevista", canceled: "Cancelada" },
  expense: { confirmed: "Paga", planned: "Prevista", canceled: "Cancelada" },
};
