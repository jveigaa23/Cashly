/**
 * CSV no padrão brasileiro do Excel: separador ";", vírgula decimal, BOM
 * UTF-8 e quebra CRLF. Células que começam com = + - @ (ou tab/CR) recebem
 * apóstrofo para não virarem fórmula ao abrir na planilha (CSV injection).
 */
export type CsvCell = string | number | null | undefined;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Número negativo puro ("-19,90") não é fórmula: continua numérico.
  if (/^[=+\-@\t\r]/.test(text) && !/^-\d+(,\d+)?$/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: CsvCell[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Centavos → "1234,56" (sem símbolo, para a planilha somar). */
export function csvMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
