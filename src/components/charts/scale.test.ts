import { describe, expect, it } from "vitest";
import { niceScale } from "./scale";

describe("niceScale", () => {
  it("arredonda o topo para valores limpos", () => {
    expect(niceScale(950000)).toMatchObject({ max: 1000000, step: 250000 });
    expect(niceScale(123456).max).toBeGreaterThanOrEqual(123456);
    expect(niceScale(0).max).toBeGreaterThan(0);
    expect(niceScale(300000).values).toEqual([0, 100000, 200000, 300000]);
  });
});
