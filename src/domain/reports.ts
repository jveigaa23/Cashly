/**
 * Agregações para painel e relatórios (puras). Regras:
 * - "Realizado" = status confirmed; "previsto" = planned; cancelados nunca entram.
 * - Contas a pagar só entram como despesa pelo lançamento do pagamento
 *   (um por pagamento), então não há dupla contagem.
 * - Percentuais em pontos-base inteiros (10000 = 100%), sem float.
 */
import { addMonths, monthRange, type CalendarDate } from "@/lib/format/date";
import type { TransactionStatus, TransactionType } from "./transactions";

export interface TxFact {
  type: TransactionType;
  status: TransactionStatus;
  amountCents: number;
  occurredOn: CalendarDate;
  categoryId: string | null;
  categoryName: string | null;
}

export interface MonthTotals {
  month: string;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
}

/** Meses "AAAA-MM" de `from` a `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from; m <= to && months.length < 240; m = addMonths(m, 1)) months.push(m);
  return months;
}

export function monthlyTotals(txs: TxFact[], months: string[]): MonthTotals[] {
  const byMonth = new Map(months.map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0, resultCents: 0, plannedIncomeCents: 0, plannedExpenseCents: 0 }]));
  for (const t of txs) {
    const row = byMonth.get(t.occurredOn.slice(0, 7));
    if (!row || t.status === "canceled") continue;
    if (t.status === "confirmed") {
      if (t.type === "income") row.incomeCents += t.amountCents;
      else row.expenseCents += t.amountCents;
    } else if (t.type === "income") row.plannedIncomeCents += t.amountCents;
    else row.plannedExpenseCents += t.amountCents;
  }
  return months.map((m) => {
    const row = byMonth.get(m)!;
    return { ...row, resultCents: row.incomeCents - row.expenseCents };
  });
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  cents: number;
  /** Participação no total do tipo, em pontos-base (arredondamento para baixo). */
  shareBp: number;
}

/** Totais REALIZADOS por categoria, do maior para o menor. */
export function categoryBreakdown(txs: TxFact[], type: TransactionType): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type || t.status !== "confirmed") continue;
    const key = t.categoryId ?? "";
    const row = map.get(key) ?? { categoryId: t.categoryId, name: t.categoryName ?? "Sem categoria", cents: 0, shareBp: 0 };
    row.cents += t.amountCents;
    map.set(key, row);
    total += t.amountCents;
  }
  return [...map.values()]
    .map((r) => ({ ...r, shareBp: total === 0 ? 0 : Math.floor((r.cents * 10000) / total) }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, "pt-BR"));
}

export interface Comparison {
  deltaCents: number;
  /** Variação percentual em pontos-base; null quando o anterior é zero. */
  deltaBp: number | null;
}

export function compare(currentCents: number, previousCents: number): Comparison {
  const deltaCents = currentCents - previousCents;
  return {
    deltaCents,
    deltaBp: previousCents === 0 ? null : Math.trunc((deltaCents * 10000) / Math.abs(previousCents)),
  };
}

export type BudgetState = "ok" | "alert" | "over";

export interface BudgetUsage {
  limitCents: number;
  spentCents: number;
  plannedCents: number;
  remainingCents: number;
  usedBp: number;
  state: BudgetState;
}

/**
 * Uso de orçamento. "Gasto" = despesas realizadas do mês; "previsto" (contas
 * em aberto e despesas previstas) aparece separado e NÃO entra no consumido.
 */
export function budgetUsage(input: { limitCents: number; spentCents: number; plannedCents: number; alertPercent: number }): BudgetUsage {
  if (input.limitCents <= 0) throw new RangeError("Limite inválido");
  const usedBp = Math.floor((input.spentCents * 10000) / input.limitCents);
  const state: BudgetState = input.spentCents > input.limitCents ? "over" : usedBp >= input.alertPercent * 100 ? "alert" : "ok";
  return {
    limitCents: input.limitCents,
    spentCents: input.spentCents,
    plannedCents: input.plannedCents,
    remainingCents: input.limitCents - input.spentCents,
    usedBp,
    state,
  };
}

/** Formata pontos-base como "12,5%". */
export function formatBp(bp: number): string {
  const sign = bp < 0 ? "-" : "";
  const abs = Math.abs(bp);
  const int = Math.trunc(abs / 100);
  const frac = abs % 100;
  return `${sign}${int}${frac ? "," + String(frac).padStart(2, "0").replace(/0$/, "") : ""}%`;
}

// ---------------------------------------------------------------------------
// Períodos de relatório
// ---------------------------------------------------------------------------

export type PeriodKind = "month" | "quarter" | "year";

export interface Period {
  kind: PeriodKind;
  /** "2026-10", "2026-T4" ou "2026". */
  key: string;
  start: CalendarDate;
  end: CalendarDate;
  months: string[];
  label: string;
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function parsePeriod(key: string): Period | null {
  let m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (m) {
    const { start, end } = monthRange(key);
    return { kind: "month", key, start, end, months: [key], label: `${MONTH_NAMES[Number(m[2]) - 1]} de ${m[1]}` };
  }
  m = /^(\d{4})-T([1-4])$/.exec(key);
  if (m) {
    const first = `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}`;
    const months = monthsBetween(first, addMonths(first, 2));
    return { kind: "quarter", key, start: monthRange(months[0]).start, end: monthRange(months[2]).end, months, label: `${m[2]}º trimestre de ${m[1]}` };
  }
  m = /^(\d{4})$/.exec(key);
  if (m) {
    const months = monthsBetween(`${m[1]}-01`, `${m[1]}-12`);
    return { kind: "year", key, start: `${m[1]}-01-01`, end: `${m[1]}-12-31`, months, label: `ano de ${m[1]}` };
  }
  return null;
}

export function periodKeyFor(kind: PeriodKind, date: CalendarDate): string {
  const [y, mo] = date.split("-");
  if (kind === "month") return `${y}-${mo}`;
  if (kind === "quarter") return `${y}-T${Math.floor((Number(mo) - 1) / 3) + 1}`;
  return y;
}

export function shiftPeriod(period: Period, delta: number): string {
  if (period.kind === "month") return addMonths(period.key, delta);
  if (period.kind === "quarter") {
    const first = addMonths(period.months[0], delta * 3);
    return periodKeyFor("quarter", `${first}-01`);
  }
  return String(Number(period.key) + delta);
}
