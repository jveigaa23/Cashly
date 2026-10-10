import { formatBp, type CategoryTotal } from "@/domain/reports";
import { formatBRL } from "@/lib/format/money";

/**
 * Barras horizontais de uma série (ex.: gastos por categoria). Cada linha
 * já mostra nome, valor e participação em texto: a barra é reforço visual,
 * nunca a única forma de ler o dado.
 */
export function BarList({ title, rows, emptyText, limit = 8 }: { title: string; rows: CategoryTotal[]; emptyText: string; limit?: number }) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const items = rest.length
    ? [...shown, { categoryId: "__outros", name: `Outras (${rest.length})`, cents: rest.reduce((s, r) => s + r.cents, 0), shareBp: rest.reduce((s, r) => s + r.shareBp, 0) }]
    : shown;
  const max = Math.max(1, ...items.map((r) => r.cents));

  return (
    <figure className="m-0">
      <figcaption className="text-lg font-semibold">{title}</figcaption>
      {items.length === 0 ? (
        <p className="mt-2 text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((r) => (
            <li key={r.categoryId ?? "sem"}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0">{r.name}</span>
                <span className="tabular ml-auto whitespace-nowrap font-semibold">
                  {formatBRL(r.cents)} <span className="text-sm font-normal text-muted">({formatBp(r.shareBp)})</span>
                </span>
              </div>
              <div className="mt-1 h-3 rounded-[4px] bg-surface-muted" aria-hidden="true" title={`${r.name}: ${formatBRL(r.cents)}`}>
                <div className="h-3 rounded-[4px] bg-series-income" style={{ width: `${Math.max(1, (r.cents / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
