/** Topo "redondo" do eixo e marcas (1-2-2,5-5 × 10ⁿ), em centavos. */
export function niceScale(maxCents: number, ticks = 4): { max: number; step: number; values: number[] } {
  if (maxCents <= 0) return { max: 10000, step: 2500, values: [0, 2500, 5000, 7500, 10000] };
  const rough = maxCents / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const max = Math.ceil(maxCents / step) * step;
  const values: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) values.push(Math.round(v));
  return { max, step, values };
}
