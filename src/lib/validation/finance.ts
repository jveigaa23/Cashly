import { z } from "zod";
import { isCalendarDate } from "@/lib/format/date";
import { parseBRL } from "@/lib/format/money";

/** Valor digitado em reais → centavos (rejeita em vez de arredondar). */
export const moneyField = (label = "o valor", { allowZero = false } = {}) =>
  z.string().transform((value, ctx) => {
    if (allowZero && value.trim() === "") return 0;
    const parsed = parseBRL(value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error.replace("Informe um valor.", `Informe ${label}.`) });
      return z.NEVER;
    }
    if (!allowZero && parsed.cents === 0) {
      ctx.addIssue({ code: "custom", message: "O valor precisa ser maior que zero." });
      return z.NEVER;
    }
    return parsed.cents;
  });

export const dateField = (message = "Informe uma data válida.") =>
  z.string().refine((v) => isCalendarDate(v), { message });

const optionalUuid = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v))
  .pipe(z.uuid({ error: "Opção inválida." }).nullable());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

export const billSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para a conta.").max(80, "Use no máximo 80 caracteres."),
  amount: moneyField("o valor da conta"),
  dueDate: dateField("Informe a data de vencimento."),
  categoryId: optionalUuid,
  description: optionalText(500),
});

export const paymentSchema = z.object({
  amount: moneyField("o valor pago"),
  charges: moneyField("os encargos", { allowZero: true }),
  paidOn: dateField("Informe a data do pagamento."),
  accountId: optionalUuid,
  paymentMethod: optionalText(40),
  note: optionalText(300),
  requestId: z.uuid({ error: "Formulário inválido. Recarregue a página." }),
});

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Explique o motivo em poucas palavras.").max(300, "Use no máximo 300 caracteres."),
});

export const transactionSchema = z.object({
  type: z.enum(["income", "expense"], { error: "Tipo inválido." }),
  status: z.enum(["confirmed", "planned"], { error: "Escolha a situação." }),
  description: z.string().trim().min(1, "Descreva o lançamento.").max(120, "Use no máximo 120 caracteres."),
  amount: moneyField(),
  occurredOn: dateField(),
  categoryId: optionalUuid,
  accountId: optionalUuid,
  paymentMethod: optionalText(40),
  nature: z
    .enum(["fixed", "variable", ""])
    .transform((v) => (v === "" ? null : v)),
  notes: optionalText(500),
  requestId: z.uuid({ error: "Formulário inválido. Recarregue a página." }),
});

export const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência", "Débito automático"] as const;
