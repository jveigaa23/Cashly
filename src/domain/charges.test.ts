import { describe, expect, it } from "vitest";
import { estimateCharges, type ChargeInput, type ChargeRules } from "./charges";
import { parseRate } from "./rates";

const rate = (s: string) => parseRate(s)!;
const rules = (over: Partial<ChargeRules> = {}): ChargeRules => ({
  fineMicro: rate("2"),
  interestMicro: rate("1"),
  interestPeriod: "monthly",
  basis: "original",
  ...over,
});
const bill = (over: Partial<ChargeInput> = {}): ChargeInput => ({
  originalCents: 100000, // R$ 1.000,00
  dueDate: "2026-10-10",
  rules: rules(),
  payments: [],
  referenceDate: "2026-10-10",
  ...over,
});

describe("sem atraso", () => {
  it("no dia do vencimento e antes não há encargos", () => {
    for (const referenceDate of ["2026-10-01", "2026-10-10"]) {
      expect(estimateCharges(bill({ referenceDate }))).toMatchObject({ daysLate: 0, fineCents: 0, interestCents: 0, totalDueCents: 100000 });
    }
  });

  it("paga até o vencimento: nada de multa ou juros, mesmo muito depois", () => {
    const r = estimateCharges(bill({ referenceDate: "2027-01-01", payments: [{ paidOn: "2026-10-10", principalCents: 100000, chargesCents: 0 }] }));
    expect(r).toMatchObject({ fineCents: 0, interestCents: 0, totalDueCents: 0, principalOutstandingCents: 0 });
  });
});

describe("multa aplicada uma única vez", () => {
  it("2% de R$ 1.000 = R$ 20, igual com 1 ou 100 dias de atraso", () => {
    const noInterest = rules({ interestMicro: 0n, interestPeriod: null });
    expect(estimateCharges(bill({ rules: noInterest, referenceDate: "2026-10-11" })).fineCents).toBe(2000);
    expect(estimateCharges(bill({ rules: noInterest, referenceDate: "2027-01-18" })).fineCents).toBe(2000);
  });

  it("base 'saldo': multa sobre o que faltava no vencimento", () => {
    const r = estimateCharges(
      bill({
        rules: rules({ basis: "outstanding", interestMicro: 0n, interestPeriod: null }),
        referenceDate: "2026-10-20",
        payments: [{ paidOn: "2026-10-05", principalCents: 40000, chargesCents: 0 }],
      }),
    );
    expect(r.fineCents).toBe(1200); // 2% de R$ 600
  });
});

describe("juros simples", () => {
  it("mensal pro rata die: 1% a.m. = 1/30% ao dia; 30 dias = 1%", () => {
    const r = estimateCharges(bill({ referenceDate: "2026-11-09" })); // 30 dias após 10/10
    expect(r).toMatchObject({ daysLate: 30, fineCents: 2000, interestCents: 1000, totalChargesCents: 3000, totalDueCents: 103000 });
  });

  it("mensal: 1 dia = R$ 0,33 (0,333… arredondado)", () => {
    expect(estimateCharges(bill({ referenceDate: "2026-10-11" })).interestCents).toBe(33);
  });

  it("diário: 0,033% ao dia sobre R$ 1.000 por 10 dias = R$ 3,30", () => {
    const r = estimateCharges(bill({ rules: rules({ interestMicro: rate("0,033"), interestPeriod: "daily", fineMicro: 0n }), referenceDate: "2026-10-20" }));
    expect(r).toMatchObject({ daysLate: 10, interestCents: 330, fineCents: 0 });
  });

  it("arredondamento meio-para-cima uma única vez no total", () => {
    // R$ 10,00 a 1% a.m. por 15 dias = 5 centavos exatos; por 1 dia = 0,333… → 0
    const small = { originalCents: 1000, rules: rules({ fineMicro: 0n }) };
    expect(estimateCharges(bill({ ...small, referenceDate: "2026-10-25" })).interestCents).toBe(5);
    expect(estimateCharges(bill({ ...small, referenceDate: "2026-10-11" })).interestCents).toBe(0);
    // R$ 0,15 a 10% a.d. por 1 dia = 1,5 centavo → 2 (meio para cima)
    expect(
      estimateCharges(bill({ originalCents: 15, rules: rules({ fineMicro: 0n, interestMicro: rate("10"), interestPeriod: "daily" }), referenceDate: "2026-10-11" })).interestCents,
    ).toBe(2);
  });

  it("acumulação para no dia da quitação", () => {
    const paidLate = bill({
      referenceDate: "2027-03-01",
      payments: [{ paidOn: "2026-11-09", principalCents: 100000, chargesCents: 3000 }],
    });
    expect(estimateCharges(paidLate)).toMatchObject({
      daysLate: 30,
      interestCents: 1000,
      fineCents: 2000,
      chargesPaidCents: 3000,
      chargesOutstandingCents: 0,
      totalDueCents: 0,
    });
  });

  it("pagamento parcial: base 'saldo' reduz os juros a partir do dia seguinte", () => {
    const r = estimateCharges(
      bill({
        rules: rules({ basis: "outstanding", fineMicro: 0n, interestMicro: rate("1"), interestPeriod: "daily" }),
        referenceDate: "2026-10-14", // 4 dias de atraso
        payments: [{ paidOn: "2026-10-12", principalCents: 50000, chargesCents: 0 }],
      }),
    );
    // dias 11 e 12: 1% de 1000 = 10,00 cada; dias 13 e 14: 1% de 500 = 5,00 cada → R$ 30,00
    expect(r).toMatchObject({ interestCents: 3000, principalOutstandingCents: 50000, totalDueCents: 53000, daysLate: 4 });
  });

  it("pagamento parcial com base 'original' não reduz os juros", () => {
    const r = estimateCharges(
      bill({
        rules: rules({ basis: "original", fineMicro: 0n, interestMicro: rate("1"), interestPeriod: "daily" }),
        referenceDate: "2026-10-14",
        payments: [{ paidOn: "2026-10-12", principalCents: 50000, chargesCents: 0 }],
      }),
    );
    expect(r.interestCents).toBe(4000);
  });

  it("encargos já pagos são abatidos do estimado; pagamento futuro é ignorado", () => {
    const r = estimateCharges(
      bill({
        referenceDate: "2026-11-09",
        payments: [
          { paidOn: "2026-10-20", principalCents: 0 + 10000, chargesCents: 2500 },
          { paidOn: "2026-12-01", principalCents: 90000, chargesCents: 0 },
        ],
      }),
    );
    expect(r.chargesPaidCents).toBe(2500);
    expect(r.principalOutstandingCents).toBe(90000);
    expect(r.chargesOutstandingCents).toBe(r.totalChargesCents - 2500);
  });
});

describe("calendário", () => {
  it("fevereiro bissexto e virada de ano contam dias corretos", () => {
    const daily = rules({ fineMicro: 0n, interestMicro: rate("1"), interestPeriod: "daily" });
    expect(estimateCharges(bill({ rules: daily, dueDate: "2024-02-28", referenceDate: "2024-03-01" })).daysLate).toBe(2);
    expect(estimateCharges(bill({ rules: daily, dueDate: "2026-02-28", referenceDate: "2026-03-01" })).daysLate).toBe(1);
    expect(estimateCharges(bill({ rules: daily, dueDate: "2026-12-31", referenceDate: "2027-01-02" })).daysLate).toBe(2);
  });

  it("vencimento no fim de semana não é adiado (estimativa conservadora)", () => {
    // 10/10/2026 é sábado: o atraso conta a partir de domingo.
    expect(estimateCharges(bill({ referenceDate: "2026-10-11" })).daysLate).toBe(1);
  });
});

describe("validação", () => {
  it("recusa valores e taxas inválidos", () => {
    expect(() => estimateCharges(bill({ originalCents: 0 }))).toThrow(RangeError);
    expect(() => estimateCharges(bill({ originalCents: -100 }))).toThrow(RangeError);
    expect(() => estimateCharges(bill({ rules: rules({ fineMicro: -1n }) }))).toThrow(RangeError);
  });

  it("sem regras configuradas, encargo é zero", () => {
    const none = rules({ fineMicro: 0n, interestMicro: 0n, interestPeriod: null });
    expect(estimateCharges(bill({ rules: none, referenceDate: "2027-10-10" }))).toMatchObject({ totalChargesCents: 0, daysLate: 365 });
  });
});
