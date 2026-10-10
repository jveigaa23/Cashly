import { describe, expect, it } from "vitest";
import { fieldErrors } from "./auth";
import { billSchema, paymentSchema, transactionSchema } from "./finance";

const UUID = "3f1c2a4e-8b7d-4c1a-9e2f-123456789abc";

describe("formulário de conta", () => {
  it("converte valor pt-BR em centavos e campos vazios em null", () => {
    expect(billSchema.parse({ name: " Luz ", amount: "1.234,56", dueDate: "2026-10-10", categoryId: "", description: "  " })).toEqual({
      name: "Luz",
      amount: 123456,
      dueDate: "2026-10-10",
      categoryId: null,
      description: null,
    });
  });

  it("mensagens claras para erros", () => {
    const r = billSchema.safeParse({ name: "", amount: "0", dueDate: "2026-02-30", categoryId: "x", description: "" });
    expect(fieldErrors(r.error!)).toEqual({
      name: ["Dê um nome para a conta."],
      amount: ["O valor precisa ser maior que zero."],
      dueDate: ["Informe a data de vencimento."],
      categoryId: ["Opção inválida."],
    });
    expect(fieldErrors(billSchema.safeParse({ name: "a", amount: "", dueDate: "2026-10-10", categoryId: "", description: "" }).error!).amount)
      .toEqual(["Informe o valor da conta."]);
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
      categoryId: UUID, accountId: "", paymentMethod: "", nature: "", notes: "", requestId: UUID,
    });
    expect(r).toMatchObject({ type: "income", status: "planned", amount: 350000, nature: null, categoryId: UUID });
  });

  it("não aceita tipo ou situação fora da lista (ex.: 'canceled')", () => {
    const r = transactionSchema.safeParse({
      type: "expense", status: "canceled", description: "x", amount: "1", occurredOn: "2026-10-05",
      categoryId: "", accountId: "", paymentMethod: "", nature: "", notes: "", requestId: UUID,
    });
    expect(fieldErrors(r.error!).status).toEqual(["Escolha a situação."]);
  });
});
