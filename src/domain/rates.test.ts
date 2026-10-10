import { describe, expect, it } from "vitest";
import { divRoundHalfUp, formatRate, parseRate, rateToDecimal } from "./rates";

describe("taxas", () => {
  it("lê taxas em formato brasileiro sem float", () => {
    expect(parseRate("2")).toBe(2_000_000n);
    expect(parseRate("2,5")).toBe(2_500_000n);
    expect(parseRate("0,033")).toBe(33_000n);
    expect(parseRate("0.000001")).toBe(1n);
    expect(parseRate("1.000000")).toBe(1_000_000n);
    expect(parseRate("-1")).toBeNull();
    expect(parseRate("1,0000001")).toBeNull();
    expect(parseRate("abc")).toBeNull();
  });

  it("converte de/para decimal e exibição", () => {
    expect(rateToDecimal(33_000n)).toBe("0.033000");
    expect(formatRate(2_500_000n)).toBe("2,5");
    expect(formatRate(2_000_000n)).toBe("2");
  });

  it("arredonda meio para cima", () => {
    expect(divRoundHalfUp(15n, 10n)).toBe(2n);
    expect(divRoundHalfUp(14n, 10n)).toBe(1n);
    expect(divRoundHalfUp(25n, 10n)).toBe(3n);
    expect(divRoundHalfUp(0n, 10n)).toBe(0n);
    expect(() => divRoundHalfUp(-1n, 10n)).toThrow(RangeError);
  });
});
