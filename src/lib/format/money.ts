/**
 * Formatação e leitura de valores monetários em reais.
 *
 * Convenção do projeto: na aplicação, valores monetários são inteiros em
 * centavos (`number`), nunca frações em ponto flutuante. No banco, NUMERIC(14,2).
 * A conversão acontece apenas nas bordas (formulários, banco, exibição).
 */

/** Maior valor aceito: limite de NUMERIC(14,2) = 999.999.999.999,99. */
export const MAX_CENTS = 99_999_999_999_999;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Valor em centavos inválido: ${cents}`);
  }
}

/** 123456 → "R$ 1.234,56" (com espaço não separável, como no padrão pt-BR). */
export function formatBRL(cents: number): string {
  assertCents(cents);
  // Formata só a parte inteira (exata) e encaixa os centavos como texto,
  // sem nenhuma soma em ponto flutuante.
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const fraction = String(abs % 100).padStart(2, "0");
  const formatted = brl
    .formatToParts(Math.trunc(abs / 100))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
  return negative ? `-${formatted}` : formatted;
}

export type ParseMoneyResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Lê um valor digitado por uma pessoa no formato brasileiro.
 *
 * Regras:
 * - vírgula é o separador decimal e ponto separa milhares ("1.234,56");
 * - sem vírgula, um único ponto seguido de 1 ou 2 dígitos é tratado como
 *   decimal ("12.5" → R$ 12,50), porque alguns teclados numéricos de
 *   celular só oferecem ponto; "1.234" continua sendo mil duzentos e trinta e quatro;
 * - "R$" e espaços são ignorados;
 * - mais de 2 casas decimais, sinal negativo ou texto inválido são rejeitados
 *   (nunca arredondamos silenciosamente o que a pessoa digitou).
 */
export function parseBRL(input: string): ParseMoneyResult {
  const raw = input.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  if (raw === "") return { ok: false, error: "Informe um valor." };
  if (raw.startsWith("-")) {
    return { ok: false, error: "O valor não pode ser negativo." };
  }
  if (!/^[\d.,]+$/.test(raw)) {
    return { ok: false, error: "Use apenas números, ponto e vírgula." };
  }

  let integerPart: string;
  let decimalPart = "";

  const commaCount = raw.split(",").length - 1;
  if (commaCount > 1) {
    return { ok: false, error: "Use vírgula apenas para os centavos." };
  }

  if (commaCount === 1) {
    [integerPart, decimalPart] = raw.split(",");
    if (!isValidThousands(integerPart)) {
      return { ok: false, error: "Valor em formato inválido." };
    }
    integerPart = integerPart.replace(/\./g, "");
  } else {
    const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(raw);
    if (dotDecimal) {
      [, integerPart, decimalPart] = dotDecimal;
    } else {
      if (!isValidThousands(raw)) {
        return { ok: false, error: "Valor em formato inválido." };
      }
      integerPart = raw.replace(/\./g, "");
    }
  }

  if (decimalPart.length > 2) {
    return { ok: false, error: "Use no máximo 2 casas decimais (centavos)." };
  }
  if (integerPart === "") integerPart = "0";
  if (!/^\d+$/.test(integerPart) || !/^\d*$/.test(decimalPart)) {
    return { ok: false, error: "Valor em formato inválido." };
  }
  if (integerPart.replace(/^0+/, "").length > 12) {
    return { ok: false, error: "Valor acima do limite permitido." };
  }

  const cents =
    Number(integerPart) * 100 + Number(decimalPart.padEnd(2, "0") || "0");
  if (cents > MAX_CENTS) {
    return { ok: false, error: "Valor acima do limite permitido." };
  }
  return { ok: true, cents };
}

/** Grupos de milhar só são válidos se tiverem exatamente 3 dígitos. */
function isValidThousands(value: string): boolean {
  if (!value.includes(".")) return true;
  return /^\d{1,3}(\.\d{3})+$/.test(value);
}

/** 123456 → "1234.56" (para gravar em NUMERIC). */
export function centsToDecimalString(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const integer = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

/**
 * Converte um NUMERIC vindo do banco ("1234.5", "1234.56" ou o número
 * 1234.56 do JSON) para centavos, sem aritmética de ponto flutuante.
 */
export function decimalToCents(value: string | number): number {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new TypeError(`Valor decimal inválido: ${text}`);
  }
  const [, sign, integer, fraction = ""] = match;
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  assertCents(cents);
  return sign ? -cents : cents;
}
