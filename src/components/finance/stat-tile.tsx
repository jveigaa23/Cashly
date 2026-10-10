import { compare, formatBp } from "@/domain/reports";
import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/cn";

/**
 * Indicador com valor e variação contra o mês anterior. `upIsGood` define
 * se subir é bom (receitas) ou ruim (despesas); a direção é dita em texto.
 */
export function StatTile({
  label,
  cents,
  previousCents,
  upIsGood,
  previousLabel,
}: {
  label: string;
  cents: number;
  previousCents?: number;
  upIsGood?: boolean;
  previousLabel?: string;
}) {
  const delta = previousCents === undefined ? null : compare(cents, previousCents);
  const good = delta && delta.deltaCents !== 0 ? (delta.deltaCents > 0) === Boolean(upIsGood) : null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold max-[219px]:text-xl">{formatBRL(cents)}</p>
      {delta ? (
        <p className={cn("mt-1 text-sm", good === null ? "text-muted" : good ? "text-success" : "text-danger")}>
          {delta.deltaCents === 0
            ? `Igual a ${previousLabel}`
            : `${delta.deltaCents > 0 ? "▲ " : "▼ "}${formatBRL(Math.abs(delta.deltaCents))}${delta.deltaBp !== null ? ` (${formatBp(Math.abs(delta.deltaBp))})` : ""} ${delta.deltaCents > 0 ? "a mais" : "a menos"} que ${previousLabel}`}
        </p>
      ) : null}
    </div>
  );
}
