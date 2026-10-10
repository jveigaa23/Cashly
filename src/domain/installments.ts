/**
 * Cronograma de parcelas (puro). O banco gera com a MESMA regra
 * (private.installment_schedule); unicidade (plan_id, number) torna a
 * geração idempotente.
 *
 * - "none": total dividido igualmente; os centavos que sobram vão para a
 *   ÚLTIMA parcela (ex.: R$ 100,00 em 3 = 33,33 + 33,33 + 33,34).
 * - "simple_monthly": juros simples sobre o valor financiado pelo prazo:
 *   juros = total × taxa × parcelas (arredondado meio-para-cima ao centavo);
 *   (total + juros) dividido como acima. NÃO é tabela Price (juros compostos).
 * - Vencimentos: mensais a partir da 1ª data, mantendo o dia âncora
 *   (31/01 → 28/02 → 31/03).
 */
import { addMonthsClamped, type CalendarDate } from "@/lib/format/date";
import { divRoundHalfUp } from "./rates";

export type InterestMethod = "none" | "simple_monthly";

export interface ScheduleInput {
  totalCents: number;
  count: number;
  firstDueDate: CalendarDate;
  method: InterestMethod;
  /** Taxa mensal em micro-pontos percentuais (1% = 1_000_000n). */
  rateMicro: bigint;
}

export interface ScheduledInstallment {
  number: number;
  dueDate: CalendarDate;
  amountCents: number;
}

export function interestFor(input: Pick<ScheduleInput, "totalCents" | "count" | "method" | "rateMicro">): number {
  if (input.method === "none") return 0;
  return Number(divRoundHalfUp(BigInt(input.totalCents) * input.rateMicro * BigInt(input.count), 100n * 1_000_000n));
}

export function buildSchedule(input: ScheduleInput): ScheduledInstallment[] {
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents <= 0) throw new RangeError("Valor total inválido");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 600) throw new RangeError("Quantidade de parcelas inválida");
  if (input.method === "none" && input.rateMicro !== 0n) throw new RangeError("Sem juros, a taxa deve ser zero");
  if (input.rateMicro < 0n) throw new RangeError("Taxa inválida");

  const payable = input.totalCents + interestFor(input);
  const base = Math.floor(payable / input.count);
  if (base < 1) throw new RangeError("Cada parcela precisa ter pelo menos R$ 0,01");
  const anchorDay = Number(input.firstDueDate.slice(8));

  return Array.from({ length: input.count }, (_, i) => ({
    number: i + 1,
    dueDate: addMonthsClamped(input.firstDueDate, i, anchorDay),
    amountCents: i === input.count - 1 ? payable - base * (input.count - 1) : base,
  }));
}

export interface InstallmentFacts {
  expectedCents: number;
  paidPrincipalCents: number;
  status: "pending" | "partially_paid" | "paid" | "canceled";
  dueDate: CalendarDate;
}

export interface PlanSummary {
  totalPayableCents: number;
  paidCents: number;
  /** Saldo devedor: soma do que falta nas parcelas não canceladas. */
  remainingCents: number;
  paidCount: number;
  openCount: number;
  overdueCount: number;
  nextDue: CalendarDate | null;
}

export function summarizePlan(installments: InstallmentFacts[], today: CalendarDate): PlanSummary {
  const active = installments.filter((i) => i.status !== "canceled");
  const open = active.filter((i) => i.paidPrincipalCents < i.expectedCents);
  return {
    totalPayableCents: active.reduce((s, i) => s + i.expectedCents, 0),
    paidCents: active.reduce((s, i) => s + Math.min(i.paidPrincipalCents, i.expectedCents), 0),
    remainingCents: open.reduce((s, i) => s + (i.expectedCents - i.paidPrincipalCents), 0),
    paidCount: active.length - open.length,
    openCount: open.length,
    overdueCount: open.filter((i) => i.dueDate < today).length,
    nextDue: open.map((i) => i.dueDate).sort()[0] ?? null,
  };
}
