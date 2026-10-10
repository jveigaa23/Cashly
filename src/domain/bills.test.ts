import { describe, expect, it } from "vitest";
import { checkPayment, statusFromPaid, summarizeBill, type BillFacts } from "./bills";

const base: BillFacts = { originalCents: 10000, dueDate: "2026-10-10", status: "pending", payments: [] };
const pay = (principalCents: number, chargesCents = 0, canceled = false) => ({
  amountCents: principalCents + chargesCents,
  principalCents,
  chargesCents,
  canceled,
});

describe("summarizeBill — sem atraso e com atraso", () => {
  it("a vencer, vence hoje, vencida (datas de calendário)", () => {
    expect(summarizeBill(base, "2026-10-01")).toMatchObject({ situation: "pending", daysUntilDue: 9, daysOverdue: 0, outstandingCents: 10000 });
    expect(summarizeBill(base, "2026-10-10").situation).toBe("due_today");
    expect(summarizeBill(base, "2026-10-11")).toMatchObject({ situation: "overdue", daysOverdue: 1 });
  });

  it("virada de mês e ano bissexto contam dias corretamente", () => {
    const feb = { ...base, dueDate: "2024-02-28" };
    expect(summarizeBill(feb, "2024-03-01").daysOverdue).toBe(2); // 29/02 existe em 2024
    expect(summarizeBill({ ...base, dueDate: "2026-02-28" }, "2026-03-01").daysOverdue).toBe(1);
    expect(summarizeBill({ ...base, dueDate: "2026-12-31" }, "2027-01-01").daysOverdue).toBe(1);
  });

  it("pagamento parcial reduz o saldo; atrasada continua vencida", () => {
    const bill = { ...base, status: "partially_paid" as const, payments: [pay(4000)] };
    expect(summarizeBill(bill, "2026-10-05")).toMatchObject({ situation: "partially_paid", outstandingCents: 6000, paidPrincipalCents: 4000 });
    expect(summarizeBill(bill, "2026-10-20")).toMatchObject({ situation: "partially_paid_overdue", daysOverdue: 10 });
  });

  it("encargos não abatem o saldo; quitada não fica vencida", () => {
    const bill = { ...base, status: "paid" as const, payments: [pay(10000, 1230)] };
    expect(summarizeBill(bill, "2026-11-30")).toEqual({
      paidPrincipalCents: 10000,
      paidChargesCents: 1230,
      paidTotalCents: 11230,
      outstandingCents: 0,
      situation: "paid",
      daysOverdue: 0,
      daysUntilDue: -51,
    });
  });

  it("pagamentos cancelados não contam", () => {
    const bill = { ...base, payments: [pay(10000, 0, true), pay(2500)] };
    expect(summarizeBill(bill, "2026-10-01")).toMatchObject({ paidPrincipalCents: 2500, outstandingCents: 7500 });
  });

  it("conta cancelada nunca aparece como vencida", () => {
    expect(summarizeBill({ ...base, status: "canceled" }, "2027-01-01")).toMatchObject({ situation: "canceled", daysOverdue: 0 });
  });

  it("statusFromPaid", () => {
    expect(statusFromPaid(100, 0)).toBe("pending");
    expect(statusFromPaid(100, 1)).toBe("partially_paid");
    expect(statusFromPaid(100, 100)).toBe("paid");
  });
});

describe("checkPayment", () => {
  const ok = { status: "pending" as const, outstandingCents: 10000, amountCents: 10000, chargesCents: 0, paidOn: "2026-10-10", today: "2026-10-10" };

  it("aceita pagamento integral e parcial", () => {
    expect(checkPayment(ok)).toEqual({ ok: true, principalCents: 10000 });
    expect(checkPayment({ ...ok, amountCents: 2500 })).toEqual({ ok: true, principalCents: 2500 });
  });

  it("aceita valor acima do saldo quando a diferença é encargo", () => {
    expect(checkPayment({ ...ok, amountCents: 10500, chargesCents: 500 })).toEqual({ ok: true, principalCents: 10000 });
  });

  it("recusa principal acima do saldo, valores inválidos, data futura e estados finais", () => {
    expect(checkPayment({ ...ok, amountCents: 10001 })).toMatchObject({ ok: false, field: "amount" });
    expect(checkPayment({ ...ok, amountCents: 0 })).toMatchObject({ ok: false, field: "amount" });
    expect(checkPayment({ ...ok, chargesCents: 10000 })).toMatchObject({ ok: false, field: "charges" });
    expect(checkPayment({ ...ok, chargesCents: -1 })).toMatchObject({ ok: false, field: "charges" });
    expect(checkPayment({ ...ok, paidOn: "2026-10-11" })).toMatchObject({ ok: false, field: "paidOn" });
    expect(checkPayment({ ...ok, status: "paid", outstandingCents: 0 })).toMatchObject({ ok: false, field: "form" });
    expect(checkPayment({ ...ok, status: "canceled" })).toMatchObject({ ok: false, field: "form" });
  });
});
