import { describe, expect, it } from "vitest";
import { fieldErrors } from "./auth";
import { billSchema, paymentSchema, planSchema, transactionSchema } from "./finance";

const UUID = "3f1c2a4e-8b7d-4c1a-9e2f-123456789abc";
const billBase = {
  name: "Luz", amount: "100", dueDate: "2026-10-10", categoryId: "", description: "",
  finePercent: "", interestRate: "", interestPeriod: "", interestBasis: "original", repeat: "", repeatUntil: "",
};

describe("formulário de conta", () => {
  it("converte valor pt-BR em centavos e campos vazios em null", () => {
    expect(billSchema.parse({ ...billBase, name: " Luz ", amount: "1.234,56", description: "  " })).toEqual({
      name: "Luz",
      amount: 123456,
      dueDate: "2026-10-10",
      categoryId: null,
      description: null,
      finePercent: 0n,
      interestRate: 0n,
      interestPeriod: null,
      interestBasis: "original",
      repeat: null,
      repeatUntil: null,
    });
  });

  it("mensagens claras para erros", () => {
    const r = billSchema.safeParse({ ...billBase, name: "", amount: "0", dueDate: "2026-02-30", categoryId: "x" });
    expect(fieldErrors(r.error!)).toEqual({
      name: ["Dê um nome para a conta."],
      amount: ["O valor precisa ser maior que zero."],
      dueDate: ["Informe a data de vencimento."],
      categoryId: ["Opção inválida."],
    });
    expect(fieldErrors(billSchema.safeParse({ ...billBase, amount: "" }).error!).amount)
      .toEqual(["Informe o valor da conta."]);
  });

  it("multa e juros: percentuais exatos, juros exigem período", () => {
    const ok = billSchema.parse({ ...billBase, finePercent: "2", interestRate: "0,033", interestPeriod: "daily" });
    expect(ok).toMatchObject({ finePercent: 2_000_000n, interestRate: 33_000n, interestPeriod: "daily" });
    expect(fieldErrors(billSchema.safeParse({ ...billBase, interestRate: "1" }).error!).interestPeriod).toEqual(["Escolha se os juros são ao dia ou ao mês."]);
    expect(fieldErrors(billSchema.safeParse({ ...billBase, finePercent: "101" }).error!).finePercent).toBeTruthy();
    expect(fieldErrors(billSchema.safeParse({ ...billBase, finePercent: "-1" }).error!).finePercent).toBeTruthy();
  });

  it("repetição: data final não pode ser antes do primeiro vencimento", () => {
    expect(billSchema.parse({ ...billBase, repeat: "monthly" }).repeat).toBe("monthly");
    expect(fieldErrors(billSchema.safeParse({ ...billBase, repeat: "monthly", repeatUntil: "2026-01-01" }).error!).repeatUntil).toBeTruthy();
  });
});

describe("formulário de pagamento", () => {
  it("encargos vazios valem zero", () => {
    const r = paymentSchema.parse({ amount: "100", charges: "", paidOn: "2026-10-10", accountId: "", paymentMethod: "Pix", note: "", requestId: UUID });
    expect(r).toMatchObject({ amount: 10000, charges: 0, paymentMethod: "Pix", accountId: null, note: null });
  });

  it("exige identificador do formulário (idempotência)", () => {
    const r = paymentSchema.safeParse({ amount: "1", charges: "", paidOn: "2026-10-10", accountId: "", paymentMethod: "", note: "", requestId: "" });
    expect(fieldErrors(r.error!).requestId).toBeTruthy();
  });
});

describe("formulário de lançamento", () => {
  it("receita prevista", () => {
    const r = transactionSchema.parse({
      type: "income", status: "planned", description: "Salário", amount: "3.500,00", occurredOn: "2026-10-05",
      categoryId: UUID, accountId: "", paymentMethod: "", nature: "", notes: "", repeatMonthly: "", requestId: UUID,
    });
    expect(r).toMatchObject({ type: "income", status: "planned", amount: 350000, nature: null, categoryId: UUID });
  });

  it("não aceita tipo ou situação fora da lista (ex.: 'canceled')", () => {
    const r = transactionSchema.safeParse({
      type: "expense", status: "canceled", description: "x", amount: "1", occurredOn: "2026-10-05",
      categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", repeatMonthly: "", requestId: UUID,
    });
    expect(fieldErrors(r.error!).status).toEqual(["Escolha a situação."]);
  });
});

describe("formulário de parcelamento", () => {
  const plan = { description: "TV", kind: "purchase", categoryId: "", total: "2.400,00", count: "10", firstDueDate: "2026-11-10", method: "none", rate: "", requestId: UUID };

  it("sem juros", () => {
    expect(planSchema.parse(plan)).toMatchObject({ total: 240000, count: 10, method: "none", rate: 0n });
  });

  it("com juros exige taxa; sem juros não aceita taxa", () => {
    expect(fieldErrors(planSchema.safeParse({ ...plan, method: "simple_monthly" }).error!).rate).toBeTruthy();
    expect(fieldErrors(planSchema.safeParse({ ...plan, rate: "1" }).error!).rate).toBeTruthy();
    expect(planSchema.parse({ ...plan, method: "simple_monthly", rate: "1,99" }).rate).toBe(1_990_000n);
  });

  it("parcelas válidas", () => {
    expect(fieldErrors(planSchema.safeParse({ ...plan, count: "0" }).error!).count).toBeTruthy();
    expect(fieldErrors(planSchema.safeParse({ ...plan, count: "2,5" }).error!).count).toBeTruthy();
    expect(fieldErrors(planSchema.safeParse({ ...plan, total: "0,01", count: "2" }).error!).count).toEqual(["Cada parcela precisa ter pelo menos R$ 0,01."]);
  });
});
