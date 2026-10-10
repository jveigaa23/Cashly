import { describe, expect, it } from "vitest";
import {
  MAX_CENTS,
  centsToDecimalString,
  decimalToCents,
  formatBRL,
  parseBRL,
} from "./money";

const NBSP = " ";

describe("formatBRL", () => {
  it.each([
    [0, `R$${NBSP}0,00`],
    [5, `R$${NBSP}0,05`],
    [100, `R$${NBSP}1,00`],
    [123456, `R$${NBSP}1.234,56`],
    [100000000, `R$${NBSP}1.000.000,00`],
    [-1990, `-R$${NBSP}19,90`],
    [MAX_CENTS, `R$${NBSP}999.999.999.999,99`],
  ])("%i centavos → %s", (cents, expected) => {
    expect(formatBRL(cents)).toBe(expected);
  });

  it("recusa valores que não são centavos inteiros", () => {
    expect(() => formatBRL(10.5)).toThrow(TypeError);
    expect(() => formatBRL(Number.NaN)).toThrow(TypeError);
  });
});

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["R$ 1.234,56", 123456],
    [`R$${NBSP}10,00`, 1000],
    ["0,05", 5],
    [",5", 50],
    ["10,5", 1050],
    ["10,", 1000],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0", 0],
    ["  42 ", 4200],
    ["999.999.999.999,99", MAX_CENTS],
  ])("%j → %i centavos", (input, cents) => {
    expect(parseBRL(input)).toEqual({ ok: true, cents });
  });

  it("valores com centavos que quebram ponto flutuante continuam exatos", () => {
    // 0,1 + 0,2 e 1,005 são casos clássicos de erro em float.
    expect(parseBRL("0,30")).toEqual({ ok: true, cents: 30 });
    expect(parseBRL("1,01")).toEqual({ ok: true, cents: 101 });
    expect(parseBRL("4,35")).toEqual({ ok: true, cents: 435 });
  });

  it.each([
    ["", "Informe um valor."],
    ["   ", "Informe um valor."],
    ["-10,00", "O valor não pode ser negativo."],
    ["abc", "Use apenas números, ponto e vírgula."],
    ["1e5", "Use apenas números, ponto e vírgula."],
    ["1,234,56", "Use vírgula apenas para os centavos."],
    ["10,555", "Use no máximo 2 casas decimais (centavos)."],
    ["12.345.6", "Valor em formato inválido."],
    ["1.23,45", "Valor em formato inválido."],
    ["1000000000000,00", "Valor acima do limite permitido."],
  ])("%j é rejeitado", (input, error) => {
    expect(parseBRL(input)).toEqual({ ok: false, error });
  });
});

describe("conversão com NUMERIC do banco", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [123456, "1234.56"],
    [-1990, "-19.90"],
  ])("%i centavos ↔ %s", (cents, decimal) => {
    expect(centsToDecimalString(cents)).toBe(decimal);
    expect(decimalToCents(decimal)).toBe(cents);
  });

  it("aceita número JSON e decimais com 1 casa", () => {
    expect(decimalToCents(1234.56)).toBe(123456);
    expect(decimalToCents(0.1)).toBe(10);
    expect(decimalToCents("19.9")).toBe(1990);
    expect(decimalToCents("7")).toBe(700);
  });

  it("rejeita mais de 2 casas ou texto inválido", () => {
    expect(() => decimalToCents("1.005")).toThrow(TypeError);
    expect(() => decimalToCents("1,00")).toThrow(TypeError);
    expect(() => decimalToCents("")).toThrow(TypeError);
  });
});
