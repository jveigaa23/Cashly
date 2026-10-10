/**
 * Datas.
 *
 * - Datas de calendário (vencimento, competência) são strings "AAAA-MM-DD"
 *   e NUNCA passam por `new Date("AAAA-MM-DD")`, que as interpreta como
 *   meia-noite UTC e mostra o dia anterior no Brasil.
 * - Instantes (eventos) são ISO 8601 com fuso e são exibidos no fuso da família.
 * - "Hoje" sempre depende de um instante de referência injetado, para que os
 *   cálculos sejam determinísticos nos testes.
 */

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CalendarDate = string;

export function isCalendarDate(value: string): value is CalendarDate {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
}

function assertCalendarDate(value: string): void {
  if (!isCalendarDate(value)) {
    throw new RangeError(`Data inválida: ${value}`);
  }
}

/** "2026-10-05" → "05/10/2026". */
export function formatCalendarDate(date: CalendarDate): string {
  assertCalendarDate(date);
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10" ou "2026-10-01" → "outubro de 2026". */
export function formatMonthYear(value: string): string {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new RangeError(`Mês inválido: ${value}`);
  }
  // Meio-dia UTC evita qualquer troca de dia na formatação.
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
}

/** Instante → "10/10/2026 14:30" no fuso informado. */
export function formatDateTime(
  instant: Date | string,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Instante inválido: ${String(instant)}`);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(",", "");
}

/** Data de calendário correspondente a um instante, no fuso informado. */
export function toCalendarDate(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Dias de calendário de `from` até `to` (positivo se `to` é depois). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  assertCalendarDate(from);
  assertCalendarDate(to);
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Primeiro e último dia do mês "AAAA-MM". */
export function monthRange(month: string): { start: CalendarDate; end: CalendarDate } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError(`Mês inválido: ${month}`);
  const [y, m] = [Number(match[1]), Number(match[2])];
  if (m < 1 || m > 12) throw new RangeError(`Mês inválido: ${month}`);
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
}

/** "2026-10" ± n meses. */
export function addMonths(month: string, delta: number): string {
  const { start } = monthRange(month);
  const [y, m] = start.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Soma meses a uma data mantendo o dia "âncora": 31/01 + 1 → 28/02 (ou 29),
 * 31/01 + 2 → 31/03. O dia nunca "escorrega" de vez para o menor valor.
 */
export function addMonthsClamped(date: CalendarDate, months: number, anchorDay?: number): CalendarDate {
  assertCalendarDate(date);
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Data + n dias. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  assertCalendarDate(date);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
