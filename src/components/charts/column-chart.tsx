"use client";

import { useState } from "react";
import { formatBRL, formatCompactBRL } from "@/lib/format/money";
import { niceScale } from "./scale";

export interface ColumnSeries {
  key: string;
  label: string;
  /** Classe Tailwind de fundo da série (tokens --series-*). */
  colorClass: string;
}

export interface ColumnGroup {
  key: string;
  label: string;
  /** Rótulo longo para dica e tabela ("outubro de 2026"). */
  longLabel: string;
  values: Record<string, number>;
}

/**
 * Colunas agrupadas (ex.: receitas × despesas por mês), em HTML/CSS para
 * texto nítido em qualquer tela. Um eixo só; legenda sempre visível;
 * dica ao passar o mouse, tocar ou focar; tabela equivalente.
 */
export function ColumnChart({ title, series, groups }: { title: string; series: ColumnSeries[]; groups: ColumnGroup[] }) {
  const [active, setActive] = useState<string | null>(null);
  // Muitas colunas (relatório anual) num celular de 360px: inicial do mês; a tabela traz o nome completo.
  const dense = groups.length > 6;
  const max = Math.max(0, ...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0)));
  const scale = niceScale(max);
  const focused = groups.find((g) => g.key === active) ?? null;

  return (
    <figure className="m-0">
      <figcaption className="text-lg font-semibold">{title}</figcaption>
      <ul className="mt-2 flex flex-wrap gap-4 text-sm text-muted" aria-label="Legenda">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`inline-block size-3 rounded-sm ${s.colorClass}`} />
            {s.label}
          </li>
        ))}
      </ul>

      <p className="mt-2 min-h-12 text-sm" aria-live="polite">
        {focused ? (
          <>
            <strong>{focused.longLabel}:</strong>{" "}
            {series.map((s, i) => (
              <span key={s.key}>
                {i > 0 ? " · " : ""}
                {s.label} <span className="tabular">{formatBRL(focused.values[s.key] ?? 0)}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted">Toque ou passe o mouse numa coluna para ver os valores.</span>
        )}
      </p>

      {/* Em telas muito estreitas (fonte grande), o gráfico rola sozinho; a página não. */}
      <div className="overflow-x-auto">
        <div className="min-w-56">
          <div className="relative mt-1 h-48 pl-14" onMouseLeave={() => setActive(null)}>
            {scale.values.map((v) => (
              <div key={v} className="pointer-events-none absolute inset-x-0" style={{ bottom: `${(v / scale.max) * 100}%` }} aria-hidden="true">
                <div className="ml-14 border-t border-grid" />
                <span className="absolute -top-2.5 left-0 w-12 text-right text-xs text-muted">{formatCompactBRL(v)}</span>
              </div>
            ))}
            <div className={`relative flex h-full items-end ${dense ? "gap-1" : "gap-2 max-[319px]:gap-1"}`}>
              {groups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onMouseEnter={() => setActive(g.key)}
                  onFocus={() => setActive(g.key)}
                  onClick={() => setActive(g.key)}
                  aria-label={`${g.longLabel}: ${series.map((s) => `${s.label} ${formatBRL(g.values[s.key] ?? 0)}`).join(", ")}`}
                  className={`flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-md ${active === g.key ? "bg-surface-muted" : ""}`}
                >
                  {series.map((s) => {
                    const v = g.values[s.key] ?? 0;
                    return (
                      <span
                        key={s.key}
                        aria-hidden="true"
                        className={`block w-full max-w-6 rounded-t-[4px] ${s.colorClass}`}
                        style={{ height: v > 0 ? `max(2px, ${(v / scale.max) * 100}%)` : 0 }}
                      />
                    );
                  })}
                </button>
              ))}
            </div>
          </div>
          <div className={`mt-1 flex pl-14 text-xs text-muted ${dense ? "gap-1" : "gap-2 max-[319px]:gap-1"}`} aria-hidden="true">
            {groups.map((g) => (
              <span key={g.key} className="min-w-0 flex-1 text-center">
                {dense ? g.label.charAt(0).toUpperCase() : g.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-primary">Ver em tabela</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 font-medium">Mês</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-1 text-right font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-t border-border">
                  <th scope="row" className="py-1 text-left font-normal">{g.longLabel}</th>
                  {series.map((s) => (
                    <td key={s.key} className="tabular py-1 text-right">{formatBRL(g.values[s.key] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
