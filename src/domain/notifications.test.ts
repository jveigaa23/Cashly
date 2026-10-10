import { describe, expect, it } from "vitest";
import { describeNotification, dueText, type NotificationFacts } from "./notifications";

const base: NotificationFacts = {
  event: "due_soon", referenceType: "bill", referenceId: "b1", variant: "",
  referenceName: "Conta de luz", referenceDueDate: "2026-03-11", referenceStatus: "pending",
  installmentNumber: null, installmentCount: null, planId: null,
  budgetMonth: null, budgetAlertPercent: null, budgetGeneral: null,
};

describe("dueText", () => {
  it("relativo ao dia injetado", () => {
    expect(dueText("2026-03-10", "2026-03-10")).toBe("Vence hoje");
    expect(dueText("2026-03-11", "2026-03-10")).toBe("Vence amanhã");
    expect(dueText("2026-03-14", "2026-03-10")).toBe("Vence em 14/03 (em 4 dias)");
    expect(dueText("2026-03-09", "2026-03-10")).toBe("Venceu ontem");
    expect(dueText("2026-03-01", "2026-03-10")).toBe("Venceu em 01/03 (há 9 dias)");
  });
});

describe("describeNotification", () => {
  it("conta a vencer, vencida e já paga — sem valores em dinheiro", () => {
    const soon = describeNotification(base, "2026-03-10");
    expect(soon).toEqual({ title: "Conta de luz", body: "Vence amanhã.", href: "/contas/b1", gone: false, resolved: false });
    expect(describeNotification({ ...base, event: "overdue", referenceDueDate: "2026-03-01" }, "2026-03-10").body).toBe(
      "Venceu em 01/03 (há 9 dias) e ainda não foi paga.",
    );
    expect(describeNotification({ ...base, referenceStatus: "paid" }, "2026-03-10")).toMatchObject({ body: "Já foi paga.", resolved: true });
    expect(JSON.stringify(soon)).not.toMatch(/R\$/);
  });

  it("parcela leva ao parcelamento", () => {
    const t = describeNotification(
      { ...base, event: "installment", referenceType: "installment", referenceName: "Geladeira", installmentNumber: 2, installmentCount: 10, planId: "p1" },
      "2026-03-10",
    );
    expect(t).toMatchObject({ title: "Geladeira — parcela 2/10", href: "/parcelas/p1" });
  });

  it("orçamento: perto do limite, ultrapassado, geral e removido", () => {
    const b = { ...base, event: "budget" as const, referenceType: "budget" as const, referenceName: "Alimentação", budgetMonth: "2026-03-01", budgetAlertPercent: 80, budgetGeneral: false };
    expect(describeNotification({ ...b, variant: "alert" }, "2026-03-10")).toMatchObject({
      title: "Orçamento perto do limite: Alimentação",
      body: "As despesas pagas chegaram a 80% do limite de março de 2026.",
      href: "/orcamento?mes=2026-03",
    });
    expect(describeNotification({ ...b, variant: "over", budgetGeneral: true, referenceName: null }, "2026-03-10").title).toBe("Orçamento ultrapassado: limite geral");
    expect(describeNotification({ ...b, budgetMonth: null }, "2026-03-10")).toMatchObject({ gone: true });
  });

  it("referência inexistente", () => {
    expect(describeNotification({ ...base, referenceName: null, referenceDueDate: null }, "2026-03-10")).toMatchObject({ gone: true, href: "/contas" });
  });
});
