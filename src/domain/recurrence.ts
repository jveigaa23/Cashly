/**
 * Datas de ocorrência de regras recorrentes (puro). O banco gera os registros
 * com a MESMA regra (função private.recurrence_dates) e a unicidade
 * (rule_id, data) garante que gerar de novo não duplica.
 *
 * - Mensal: no dia `dayOfMonth`; meses mais curtos usam o último dia
 *   (dia 31 → 30/04, 28/02 ou 29/02 em ano bissexto).
 * - Anual: no mesmo dia/mês de `startsOn`; 29/02 vira 28/02 em anos comuns.
 * - `intervalCount`: a cada N meses/anos, contados a partir de `startsOn`.
 * - A primeira ocorrência é a primeira data >= startsOn; `endsOn` é inclusivo.
 */
import { addMonthsClamped, daysBetween, type CalendarDate } from "@/lib/format/date";

export type Frequency = "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: Frequency;
  intervalCount: number;
  dayOfMonth: number | null;
  startsOn: CalendarDate;
  endsOn: CalendarDate | null;
}

/** Ocorrências dentro de [from, until] (inclusive), em ordem. */
export function occurrences(rule: RecurrenceRule, from: CalendarDate, until: CalendarDate, limit = 400): CalendarDate[] {
  if (rule.intervalCount < 1) throw new RangeError("Intervalo inválido");
  const [sy, sm, sd] = rule.startsOn.split("-").map(Number);
  const anchorDay = rule.frequency === "monthly" ? (rule.dayOfMonth ?? sd) : sd;
  const stepMonths = rule.frequency === "monthly" ? rule.intervalCount : rule.intervalCount * 12;
  const base = `${sy}-${String(sm).padStart(2, "0")}-01`;

  const dates: CalendarDate[] = [];
  for (let k = 0; dates.length < limit; k++) {
    const date = addMonthsClamped(base, k * stepMonths, anchorDay);
    if (daysBetween(rule.startsOn, date) < 0) continue; // antes do início
    if (rule.endsOn && daysBetween(date, rule.endsOn) < 0) break;
    if (daysBetween(date, until) < 0) break;
    if (daysBetween(from, date) >= 0) dates.push(date);
  }
  return dates;
}

export function describeRule(rule: Pick<RecurrenceRule, "frequency" | "dayOfMonth" | "startsOn" | "intervalCount">): string {
  if (rule.frequency === "yearly") {
    const [, m, d] = rule.startsOn.split("-");
    return rule.intervalCount === 1 ? `Todo ano, em ${d}/${m}` : `A cada ${rule.intervalCount} anos, em ${d}/${m}`;
  }
  const day = rule.dayOfMonth ?? Number(rule.startsOn.slice(8));
  const when = day >= 29 ? `dia ${day} (ou último dia do mês)` : `dia ${day}`;
  return rule.intervalCount === 1 ? `Todo mês, ${when}` : `A cada ${rule.intervalCount} meses, ${when}`;
}
