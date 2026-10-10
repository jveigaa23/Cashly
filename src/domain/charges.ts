/**
 * Estimativa de multa e juros de uma conta em atraso (função pura).
 *
 * ATENÇÃO: é uma ESTIMATIVA. Valem os termos do contrato, boleto ou credor.
 *
 * Regras (documentadas em docs/regras-financeiras.md):
 * - Atraso começa no dia seguinte ao vencimento; sem ajuste para dia útil.
 * - Multa: percentual aplicado UMA vez, se ainda havia saldo após o vencimento.
 *   Base "original" = valor original; base "outstanding" = saldo no vencimento.
 * - Juros simples: diários (taxa ao dia) ou mensais pro rata die (taxa/30 ao dia).
 *   Base "original": valor original enquanto houver saldo.
 *   Base "outstanding": saldo de cada dia (pagamento no dia D reduz a partir de D+1).
 * - Acúmulo vai até a data de referência ou até o dia da quitação, o que vier antes.
 * - Pagamentos com data posterior à referência são ignorados.
 * - Arredondamento: soma exata em inteiros; um único arredondamento
 *   meio-para-cima por componente (multa e juros).
 * - Encargos já pagos (registrados nos pagamentos) são abatidos do estimado.
 */
import { addDays, daysBetween, type CalendarDate } from "@/lib/format/date";
import { divRoundHalfUp } from "./rates";

export type InterestPeriod = "daily" | "monthly";
export type InterestBasis = "original" | "outstanding";

export interface ChargeRules {
  /** Multa em micro-pontos percentuais (1% = 1_000_000n). */
  fineMicro: bigint;
  /** Juros em micro-pontos percentuais por período. */
  interestMicro: bigint;
  interestPeriod: InterestPeriod | null;
  basis: InterestBasis;
}

export interface ChargeInput {
  originalCents: number;
  dueDate: CalendarDate;
  rules: ChargeRules;
  payments: { paidOn: CalendarDate; principalCents: number; chargesCents: number }[];
  referenceDate: CalendarDate;
}

export interface ChargeEstimate {
  daysLate: number;
  fineCents: number;
  interestCents: number;
  totalChargesCents: number;
  chargesPaidCents: number;
  chargesOutstandingCents: number;
  principalOutstandingCents: number;
  /** Principal em aberto + encargos estimados ainda não pagos. */
  totalDueCents: number;
}

const PERCENT = 100n * 1_000_000n;

export function estimateCharges(input: ChargeInput): ChargeEstimate {
  const { originalCents, dueDate, rules, referenceDate } = input;
  if (!Number.isSafeInteger(originalCents) || originalCents <= 0) throw new RangeError("Valor original inválido");
  if (rules.fineMicro < 0n || rules.interestMicro < 0n) throw new RangeError("Taxas não podem ser negativas");

  const payments = input.payments
    .filter((p) => daysBetween(p.paidOn, referenceDate) >= 0)
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn));

  const paidUntil = (day: CalendarDate, inclusive: boolean) =>
    payments
      .filter((p) => (inclusive ? p.paidOn <= day : p.paidOn < day))
      .reduce((s, p) => s + p.principalCents, 0);

  const principalOutstandingCents = Math.max(0, originalCents - paidUntil(referenceDate, true));
  const chargesPaidCents = payments.reduce((s, p) => s + p.chargesCents, 0);
  const atDue = Math.max(0, originalCents - paidUntil(dueDate, true));
  const lateDays = Math.max(0, daysBetween(dueDate, referenceDate));

  let fine = 0n;
  let interest = 0n;
  let daysLate = 0;

  if (lateDays > 0 && atDue > 0) {
    fine = divRoundHalfUp(BigInt(rules.basis === "original" ? originalCents : atDue) * rules.fineMicro, PERCENT);

    // Juros: percorre os dias de atraso em blocos entre datas de pagamento.
    const perDayDenominator = rules.interestPeriod === "monthly" ? PERCENT * 30n : PERCENT;
    let numerator = 0n;
    let day = addDays(dueDate, 1);
    while (daysBetween(day, referenceDate) >= 0) {
      const balance = originalCents - paidUntil(day, false);
      if (balance <= 0) break; // quitada: acúmulo para
      // Próxima mudança de saldo: dia seguinte ao próximo pagamento >= day.
      const next = payments.find((p) => p.paidOn >= day);
      const blockEnd = next && daysBetween(next.paidOn, referenceDate) >= 0 ? next.paidOn : referenceDate;
      const days = daysBetween(day, blockEnd) + 1;
      const basisCents = rules.basis === "original" ? originalCents : balance;
      if (rules.interestPeriod) numerator += BigInt(basisCents) * rules.interestMicro * BigInt(days);
      daysLate += days;
      day = addDays(blockEnd, 1);
    }
    interest = rules.interestPeriod ? divRoundHalfUp(numerator, perDayDenominator) : 0n;
  }

  const totalChargesCents = Number(fine + interest);
  const chargesOutstandingCents = Math.max(0, totalChargesCents - chargesPaidCents);
  return {
    daysLate,
    fineCents: Number(fine),
    interestCents: Number(interest),
    totalChargesCents,
    chargesPaidCents,
    chargesOutstandingCents,
    principalOutstandingCents,
    totalDueCents: principalOutstandingCents + chargesOutstandingCents,
  };
}
