import { describe, expect, it } from "vitest";
import { csvCell, csvMoney, toCsv } from "./csv";

describe("CSV", () => {
  it("formato brasileiro: BOM, ponto e vírgula, CRLF", () => {
    expect(toCsv([["Data", "Valor"], ["05/10/2026", csvMoney(123456)]])).toBe("\uFEFFData;Valor\r\n05/10/2026;1234,56\r\n");
  });

  it("escapa aspas, separadores e quebras de linha", () => {
    expect(csvCell('Mercado "Bom"; centro')).toBe('"Mercado ""Bom""; centro"');
    expect(csvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(csvCell(null)).toBe("");
  });

  it("neutraliza fórmulas (injeção de CSV)", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+5511999999999")).toBe("'+5511999999999");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("-19,90")).toBe("-19,90");
  });

  it("valores negativos em dinheiro saem como texto numérico", () => {
    expect(csvMoney(-1990)).toBe("-19,90");
    expect(csvMoney(5)).toBe("0,05");
  });
});
