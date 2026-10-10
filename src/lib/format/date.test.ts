import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysBetween,
  daysInMonth,
  formatCalendarDate,
  formatDateTime,
  formatMonthYear,
  isCalendarDate,
  isLeapYear,
  monthRange,
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


describe("aritmética de calendário", () => {
  it("daysBetween atravessa meses, anos e fevereiro bissexto", () => {
    expect(daysBetween("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysBetween("2026-10-10", "2026-10-09")).toBe(-1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    // Horário de verão não existe mais no Brasil, mas o cálculo independe de fuso.
    expect(daysBetween("2018-11-03", "2018-11-05")).toBe(2);
  });

  it("monthRange e addMonths", () => {
    expect(monthRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(() => monthRange("2026-13")).toThrow(RangeError);
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", -12)).toBe("2025-10");
  });
});

describe("addMonthsClamped e addDays", () => {
  it("mantém o dia âncora e respeita fim de mês", async () => {
    const { addMonthsClamped, addDays } = await import("./date");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonthsClamped("2023-12-15", 2)).toBe("2024-02-15");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
