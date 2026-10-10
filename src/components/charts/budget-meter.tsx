import { formatBp, type BudgetUsage } from "@/domain/reports";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL } from "@/lib/format/money";

const STATE = {
  ok: { label: "Dentro do limite", tone: "success", fill: "bg-series-income" },
  alert: { label: "Perto do limite", tone: "warning", fill: "bg-warning" },
  over: { label: "Limite ultrapassado", tone: "danger", fill: "bg-danger" },
} as const;

/** Medidor de orçamento: gasto realizado × limite; previsto em texto à parte. */
export function BudgetMeter({ name, usage }: { name: string; usage: BudgetUsage }) {
  const s = STATE[usage.state];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{name}</span>
        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
      </div>
      <div
        className="mt-2 h-4 rounded-[4px] bg-surface-muted"
        role="meter"
        aria-label={`${name}: ${formatBp(usage.usedBp)} do limite usado`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.floor(usage.usedBp / 100))}
      >
        <div className={`h-4 rounded-[4px] ${s.fill}`} style={{ width: `${Math.min(100, usage.usedBp / 100)}%` }} />
      </div>
      <p className="mt-1 text-sm">
        Gasto <strong className="tabular">{formatBRL(usage.spentCents)}</strong> de <span className="tabular">{formatBRL(usage.limitCents)}</span> ({formatBp(usage.usedBp)}) ·{" "}
        {usage.remainingCents >= 0 ? (
          <>restam <span className="tabular">{formatBRL(usage.remainingCents)}</span></>
        ) : (
          <>passou <span className="tabular font-semibold">{formatBRL(-usage.remainingCents)}</span></>
        )}
      </p>
      {usage.plannedCents > 0 ? (
        <p className="text-sm text-muted">
          Previsto ainda neste mês (contas em aberto e despesas previstas): <span className="tabular">{formatBRL(usage.plannedCents)}</span>
        </p>
      ) : null}
    </div>
  );
}
