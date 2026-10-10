import { describe, expect, it } from "vitest";
import { describeRule, occurrences } from "./recurrence";

describe("recorrência mensal", () => {
  it("dia 31 cai no último dia dos meses curtos (bissexto incluso) e volta ao 31", () => {
    const rule = { frequency: "monthly" as const, intervalCount: 1, dayOfMonth: 31, startsOn: "2024-01-01", endsOn: null };
    expect(occurrences(rule, "2024-01-01", "2024-05-31")).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30", "2024-05-31"]);
    expect(occurrences({ ...rule, startsOn: "2026-01-15" }, "2026-01-01", "2026-03-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("primeira ocorrência é a primeira data >= início", () => {
    const rule = { frequency: "monthly" as const, intervalCount: 1, dayOfMonth: 10, startsOn: "2026-10-15", endsOn: null };
    expect(occurrences(rule, "2026-01-01", "2026-12-31")).toEqual(["2026-11-10", "2026-12-10"]);
  });

  it("respeita fim (inclusivo), janela e intervalo", () => {
    const rule = { frequency: "monthly" as const, intervalCount: 2, dayOfMonth: 5, startsOn: "2026-01-05", endsOn: "2026-07-05" };
    expect(occurrences(rule, "2026-01-01", "2030-01-01")).toEqual(["2026-01-05", "2026-03-05", "2026-05-05", "2026-07-05"]);
    expect(occurrences(rule, "2026-04-01", "2026-06-01")).toEqual(["2026-05-05"]);
  });

  it("virada de ano", () => {
    const rule = { frequency: "monthly" as const, intervalCount: 1, dayOfMonth: 20, startsOn: "2026-11-20", endsOn: null };
    expect(occurrences(rule, "2026-11-01", "2027-02-28")).toEqual(["2026-11-20", "2026-12-20", "2027-01-20", "2027-02-20"]);
  });
});

describe("recorrência anual", () => {
  it("29/02 vira 28/02 em anos comuns", () => {
    const rule = { frequency: "yearly" as const, intervalCount: 1, dayOfMonth: null, startsOn: "2024-02-29", endsOn: null };
    expect(occurrences(rule, "2024-01-01", "2028-12-31")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
});

describe("descrição", () => {
  it("texto para a interface", () => {
    expect(describeRule({ frequency: "monthly", intervalCount: 1, dayOfMonth: 10, startsOn: "2026-10-10" })).toBe("Todo mês, dia 10");
    expect(describeRule({ frequency: "monthly", intervalCount: 1, dayOfMonth: 31, startsOn: "2026-10-31" })).toBe("Todo mês, dia 31 (ou último dia do mês)");
    expect(describeRule({ frequency: "yearly", intervalCount: 1, dayOfMonth: null, startsOn: "2026-03-15" })).toBe("Todo ano, em 15/03");
  });
});
