import { centsToDecimalString } from "@/lib/format/money";

/**
 * Valor monetário para enviar ao banco. O PostgREST aceita NUMERIC como texto
 * JSON ("1234.56") e o converte sem ponto flutuante; os tipos gerados declaram
 * `number`, por isso o cast é concentrado (e explicado) só aqui.
 */
export function dbMoney(cents: number): number {
  return centsToDecimalString(cents) as unknown as number;
}
