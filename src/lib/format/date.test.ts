import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  formatCalendarDate,
  formatDateTime,
  formatMonthYear,
  isCalendarDate,
  isLeapYear,
  toCalendarDate,
} from "./date";

describe("datas de calendário", () => {
  it("formata sem deslocar o dia (o processo de teste roda em UTC)", () => {
    expect(formatCalendarDate("2026-10-01")).toBe("01/10/2026");
    expect(formatCalendarDate("2026-12-31")).toBe("31/12/2026");
  });

  it("valida datas reais, incluindo fim de mês e bissextos", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-1-01")).toBe(false);
    expect(() => formatCalendarDate("2026-02-30")).toThrow(RangeError);
  });

  it("regras de ano bissexto", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("nome do mês em português", () => {
    expect(formatMonthYear("2026-10")).toBe("outubro de 2026");
    expect(formatMonthYear("2026-01-01")).toBe("janeiro de 2026");
    expect(() => formatMonthYear("2026-13")).toThrow(RangeError);
  });
});

describe("fusos horários", () => {
  // 02:30 UTC de 10/10 ainda é 09/10 em São Paulo (UTC−3).
  const instant = new Date("2026-10-10T02:30:00Z");

  it("'hoje' depende do fuso da família, não do servidor", () => {
    expect(toCalendarDate(instant)).toBe("2026-10-09");
    expect(toCalendarDate(instant, "UTC")).toBe("2026-10-10");
    expect(toCalendarDate(instant, "Asia/Tokyo")).toBe("2026-10-10");
  });

  it("virada de ano", () => {
    expect(toCalendarDate(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
  });

  it("exibe instantes no fuso informado", () => {
    expect(formatDateTime(instant)).toBe("09/10/2026 23:30");
    expect(formatDateTime("2026-10-10T15:00:00Z", "UTC")).toBe("10/10/2026 15:00");
    expect(() => formatDateTime("não é data")).toThrow(RangeError);
  });
});
