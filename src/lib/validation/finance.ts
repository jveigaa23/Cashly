import { z } from "zod";
import { isCalendarDate } from "@/lib/format/date";
import { parseBRL } from "@/lib/format/money";
import { RATE_SCALE, parseRate } from "@/domain/rates";

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

/** Percentual digitado ("2", "0,033") → micro-pontos (BigInt). Vazio = 0. */
export const rateField = () =>
  z.string().transform((value, ctx) => {
    if (value.trim() === "") return 0n;
    const rate = parseRate(value.replace("%", "").trim());
    if (rate === null || rate > 100n * RATE_SCALE) {
      ctx.addIssue({ code: "custom", message: "Use um percentual entre 0 e 100, com até 6 casas (ex.: 2 ou 0,033)." });
      return z.NEVER;
    }
    return rate;
  });

const optionalDate = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v))
  .refine((v) => v === null || isCalendarDate(v), { message: "Data inválida." });

export const billSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome para a conta.").max(80, "Use no máximo 80 caracteres."),
    amount: moneyField("o valor da conta"),
    dueDate: dateField("Informe a data de vencimento."),
    categoryId: optionalUuid,
    description: optionalText(500),
    finePercent: rateField(),
    interestRate: rateField(),
    interestPeriod: z.enum(["", "daily", "monthly"], { error: "Período inválido." }).transform((v) => (v === "" ? null : v)),
    interestBasis: z.enum(["", "original", "outstanding"], { error: "Escolha a base de cálculo." }).transform((v) => v || "original"),
    repeat: z.enum(["", "monthly", "yearly"], { error: "Opção inválida." }).transform((v) => (v === "" ? null : v)),
    repeatUntil: optionalDate,
  })
  .refine((b) => b.interestRate === 0n || b.interestPeriod !== null, {
    path: ["interestPeriod"],
    message: "Escolha se os juros são ao dia ou ao mês.",
  })
  .refine((b) => !b.repeatUntil || b.repeatUntil >= b.dueDate, {
    path: ["repeatUntil"],
    message: "A data final precisa ser depois do primeiro vencimento.",
  });

export const planSchema = z
  .object({
    description: z.string().trim().min(1, "Descreva a compra ou empréstimo.").max(120, "Use no máximo 120 caracteres."),
    kind: z.enum(["purchase", "loan", "other"], { error: "Escolha o tipo." }),
    categoryId: optionalUuid,
    total: moneyField("o valor total"),
    count: z.coerce
      .number({ error: "Informe o número de parcelas." })
      .int("Use um número inteiro.")
      .min(1, "Pelo menos 1 parcela.")
      .max(600, "No máximo 600 parcelas."),
    firstDueDate: dateField("Informe o vencimento da 1ª parcela."),
    method: z.enum(["none", "simple_monthly"], { error: "Escolha se há juros." }),
    rate: rateField(),
    requestId: z.uuid({ error: "Formulário inválido. Recarregue a página." }),
  })
  .refine((p) => (p.method === "none" ? p.rate === 0n : p.rate > 0n), {
    path: ["rate"],
    message: "Informe a taxa de juros ao mês (ou escolha “Sem juros”).",
  })
  .refine((p) => Math.floor(p.total / p.count) >= 1, {
    path: ["count"],
    message: "Cada parcela precisa ter pelo menos R$ 0,01.",
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
  repeatMonthly: z.enum(["", "on"]).transform((v) => v === "on"),
  requestId: z.uuid({ error: "Formulário inválido. Recarregue a página." }),
});

export const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência", "Débito automático"] as const;
