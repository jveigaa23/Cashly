import { describe, expect, it } from "vitest";
import { totalsOf } from "./transactions";

describe("totalsOf", () => {
  it("separa realizado de previsto e ignora cancelados", () => {
    expect(
      totalsOf([
        { type: "income", status: "confirmed", amountCents: 300000 },
        { type: "income", status: "planned", amountCents: 50000 },
        { type: "expense", status: "confirmed", amountCents: 12050 },
        { type: "expense", status: "confirmed", amountCents: 8000 },
        { type: "expense", status: "planned", amountCents: 99900 },
        { type: "expense", status: "canceled", amountCents: 777777 },
        { type: "income", status: "canceled", amountCents: 1 },
      ]),
    ).toEqual({
      incomeCents: 300000,
      expenseCents: 20050,
      resultCents: 279950,
      plannedIncomeCents: 50000,
      plannedExpenseCents: 99900,
    });
  });

  it("período vazio dá zero, e resultado pode ser negativo", () => {
    expect(totalsOf([]).resultCents).toBe(0);
    expect(totalsOf([{ type: "expense", status: "confirmed", amountCents: 1 }]).resultCents).toBe(-1);
  });
});
