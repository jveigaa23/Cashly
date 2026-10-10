import { describe, expect, it } from "vitest";
import {
  budgetUsage,
  categoryBreakdown,
  compare,
  formatBp,
  monthlyTotals,
  monthsBetween,
  parsePeriod,
  shiftPeriod,
  type TxFact,
} from "./reports";

const tx = (over: Partial<TxFact>): TxFact => ({
  type: "expense", status: "confirmed", amountCents: 1000, occurredOn: "2026-10-05", categoryId: "c1", categoryName: "Mercado", ...over,
});

describe("totais mensais", () => {
  it("separa realizado e previsto, ignora cancelados e meses fora da janela", () => {
    const totals = monthlyTotals(
      [
        tx({ type: "income", amountCents: 300000, occurredOn: "2026-09-05" }),
        tx({ amountCents: 12000, occurredOn: "2026-09-10" }),
        tx({ type: "income", status: "planned", amountCents: 50000, occurredOn: "2026-10-20" }),
        tx({ amountCents: 9990, occurredOn: "2026-10-31" }),
        tx({ status: "canceled", amountCents: 999999, occurredOn: "2026-10-01" }),
        tx({ amountCents: 1, occurredOn: "2026-11-01" }),
      ],
      ["2026-09", "2026-10"],
    );
    expect(totals).toEqual([
      { month: "2026-09", incomeCents: 300000, expenseCents: 12000, resultCents: 288000, plannedIncomeCents: 0, plannedExpenseCents: 0 },
      { month: "2026-10", incomeCents: 0, expenseCents: 9990, resultCents: -9990, plannedIncomeCents: 50000, plannedExpenseCents: 0 },
    ]);
  });

  it("meses entre datas atravessam o ano", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

});

describe("por categoria", () => {
  it("só realizado, ordenado, com participação e 'Sem categoria'", () => {
    const rows = categoryBreakdown(
      [
        tx({ amountCents: 3000 }),
        tx({ amountCents: 1000, categoryId: "c2", categoryName: "Farmácia" }),
        tx({ amountCents: 2000, categoryId: null, categoryName: null }),
        tx({ amountCents: 3000 }),
        tx({ amountCents: 5000, status: "planned" }),
        tx({ type: "income", amountCents: 9999 }),
      ],
      "expense",
    );
    expect(rows).toEqual([
      { categoryId: "c1", name: "Mercado", cents: 6000, shareBp: 6666 },
      { categoryId: null, name: "Sem categoria", cents: 2000, shareBp: 2222 },
      { categoryId: "c2", name: "Farmácia", cents: 1000, shareBp: 1111 },
    ]);
    expect(rows.reduce((s, r) => s + r.cents, 0)).toBe(9000);
  });
});

describe("comparação e percentuais", () => {
  it("variação em centavos e pontos-base", () => {
    expect(compare(12000, 10000)).toEqual({ deltaCents: 2000, deltaBp: 2000 });
    expect(compare(5000, 10000)).toEqual({ deltaCents: -5000, deltaBp: -5000 });
    expect(compare(100, 0)).toEqual({ deltaCents: 100, deltaBp: null });
    expect(formatBp(1250)).toBe("12,5%");
    expect(formatBp(10000)).toBe("100%");
    expect(formatBp(-333)).toBe("-3,33%");
    expect(formatBp(5)).toBe("0,05%");
  });
});

describe("orçamento", () => {
  it("ok, alerta no percentual configurado e estourado", () => {
    expect(budgetUsage({ limitCents: 100000, spentCents: 50000, plannedCents: 20000, alertPercent: 80 })).toEqual({
      limitCents: 100000, spentCents: 50000, plannedCents: 20000, remainingCents: 50000, usedBp: 5000, state: "ok",
    });
    expect(budgetUsage({ limitCents: 100000, spentCents: 80000, plannedCents: 0, alertPercent: 80 }).state).toBe("alert");
    expect(budgetUsage({ limitCents: 100000, spentCents: 100000, plannedCents: 0, alertPercent: 80 }).state).toBe("alert");
    expect(budgetUsage({ limitCents: 100000, spentCents: 100001, plannedCents: 0, alertPercent: 80 })).toMatchObject({ state: "over", remainingCents: -1 });
  });

  it("previsto não conta como consumido", () => {
    expect(budgetUsage({ limitCents: 1000, spentCents: 0, plannedCents: 5000, alertPercent: 80 })).toMatchObject({ usedBp: 0, state: "ok" });
  });

  it("limite inválido", () => {
    expect(() => budgetUsage({ limitCents: 0, spentCents: 0, plannedCents: 0, alertPercent: 80 })).toThrow(RangeError);
  });
});

describe("períodos", () => {
  it("mês, trimestre e ano", () => {
    expect(parsePeriod("2024-02")).toMatchObject({ kind: "month", start: "2024-02-01", end: "2024-02-29", label: "fevereiro de 2024" });
    expect(parsePeriod("2026-T4")).toMatchObject({ kind: "quarter", start: "2026-10-01", end: "2026-12-31", months: ["2026-10", "2026-11", "2026-12"] });
    expect(parsePeriod("2026")).toMatchObject({ kind: "year", start: "2026-01-01", end: "2026-12-31" });
    expect(parsePeriod("2026")!.months).toHaveLength(12);
    expect(parsePeriod("2026-13")).toBeNull();
    expect(parsePeriod("2026-T5")).toBeNull();
    expect(parsePeriod("abc")).toBeNull();
  });

  it("navegação entre períodos", () => {
    expect(shiftPeriod(parsePeriod("2026-01")!, -1)).toBe("2025-12");
    expect(shiftPeriod(parsePeriod("2026-T1")!, -1)).toBe("2025-T4");
    expect(shiftPeriod(parsePeriod("2026-T4")!, 1)).toBe("2027-T1");
    expect(shiftPeriod(parsePeriod("2026")!, 1)).toBe("2027");
  });
});
