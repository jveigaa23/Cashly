/**
 * Taxas percentuais como inteiros em "micro-pontos percentuais":
 * 1% = 1_000_000n. Evita ponto flutuante em cálculos de juros e multa.
 */
export const RATE_SCALE = 1_000_000n;

/** "2", "2,5", "0.033" → micro (BigInt). Até 6 casas decimais. */
export function parseRate(input: string | number): bigint | null {
  const text = String(input).trim().replace(",", ".");
  const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? "").padEnd(6, "0"));
}

/** micro → "2.500000" (para NUMERIC). */
export function rateToDecimal(micro: bigint): string {
  const int = micro / RATE_SCALE;
  const frac = (micro % RATE_SCALE).toString().padStart(6, "0");
  return `${int}.${frac}`;
}

/** micro → "2,5" (exibição/formulário, sem zeros à direita). */
export function formatRate(micro: bigint): string {
  const int = micro / RATE_SCALE;
  const frac = (micro % RATE_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${int},${frac}` : `${int}`;
}

/** Divide e arredonda meio-para-cima (valores não negativos). */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("divRoundHalfUp: valores inválidos");
  return (numerator * 2n + denominator) / (denominator * 2n);
}
