import { describe, expect, it } from "vitest";
import { buildSchedule, interestFor, summarizePlan } from "./installments";
import { parseRate } from "./rates";

describe("cronograma sem juros", () => {
  it("centavos residuais vão para a última parcela e o total confere", () => {
    const s = buildSchedule({ totalCents: 10000, count: 3, firstDueDate: "2026-11-05", method: "none", rateMicro: 0n });
    expect(s.map((i) => i.amountCents)).toEqual([3333, 3333, 3334]);
    expect(s.reduce((a, i) => a + i.amountCents, 0)).toBe(10000);
    expect(s.map((i) => i.dueDate)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
  });

  it("divisão exata e parcela única", () => {
    expect(buildSchedule({ totalCents: 300000, count: 10, firstDueDate: "2026-11-05", method: "none", rateMicro: 0n }).every((i) => i.amountCents === 30000)).toBe(true);
    expect(buildSchedule({ totalCents: 999, count: 1, firstDueDate: "2026-11-05", method: "none", rateMicro: 0n })).toEqual([{ number: 1, dueDate: "2026-11-05", amountCents: 999 }]);
  });

  it("vencimento 31 respeita fim de mês e ano bissexto", () => {
    const s = buildSchedule({ totalCents: 400, count: 4, firstDueDate: "2024-01-31", method: "none", rateMicro: 0n });
    expect(s.map((i) => i.dueDate)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
  });

  it("recusa entradas inválidas", () => {
    const base = { totalCents: 100, count: 2, firstDueDate: "2026-11-05", method: "none" as const, rateMicro: 0n };
    expect(() => buildSchedule({ ...base, totalCents: 0 })).toThrow(RangeError);
    expect(() => buildSchedule({ ...base, count: 0 })).toThrow(RangeError);
    expect(() => buildSchedule({ ...base, count: 601 })).toThrow(RangeError);
    expect(() => buildSchedule({ ...base, rateMicro: 1n })).toThrow(RangeError);
    expect(() => buildSchedule({ ...base, totalCents: 1, count: 2 })).toThrow(RangeError);
  });
});

describe("juros simples mensais", () => {
  it("R$ 1.000 a 2% a.m. em 5x: juros R$ 100, parcelas de R$ 220", () => {
    const input = { totalCents: 100000, count: 5, firstDueDate: "2026-11-10", method: "simple_monthly" as const, rateMicro: parseRate("2")! };
    expect(interestFor(input)).toBe(10000);
    expect(buildSchedule(input).map((i) => i.amountCents)).toEqual([22000, 22000, 22000, 22000, 22000]);
  });

  it("juros com fração de centavo arredondam meio-para-cima e o resíduo vai para a última", () => {
    const input = { totalCents: 100001, count: 3, firstDueDate: "2026-11-10", method: "simple_monthly" as const, rateMicro: parseRate("1,5")! };
    // 1000,01 × 1,5% × 3 = 45,00045 → 45,00
    expect(interestFor(input)).toBe(4500);
    const s = buildSchedule(input);
    expect(s.reduce((a, i) => a + i.amountCents, 0)).toBe(104501);
    expect(s.map((i) => i.amountCents)).toEqual([34833, 34833, 34835]);
  });
});

describe("resumo do plano", () => {
  it("separa pagas, abertas, vencidas e saldo devedor", () => {
    const summary = summarizePlan(
      [
        { expectedCents: 1000, paidPrincipalCents: 1000, status: "paid", dueDate: "2026-09-05" },
        { expectedCents: 1000, paidPrincipalCents: 400, status: "partially_paid", dueDate: "2026-10-05" },
        { expectedCents: 1000, paidPrincipalCents: 0, status: "pending", dueDate: "2026-11-05" },
        { expectedCents: 1000, paidPrincipalCents: 0, status: "canceled", dueDate: "2026-12-05" },
      ],
      "2026-10-10",
    );
    expect(summary).toEqual({ totalPayableCents: 3000, paidCents: 1400, remainingCents: 1600, paidCount: 1, openCount: 2, overdueCount: 1, nextDue: "2026-10-05" });
  });
});
