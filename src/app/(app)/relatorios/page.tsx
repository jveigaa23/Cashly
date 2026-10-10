import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { BudgetMeter } from "@/components/charts/budget-meter";
import { ColumnChart } from "@/components/charts/column-chart";
import { Money } from "@/components/finance/money";
import { PrintButton } from "@/components/finance/print-button";
import { LoadingCard } from "@/components/layout/loading-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { parsePeriod, periodKeyFor, shiftPeriod, type PeriodKind } from "@/domain/reports";
import { cn } from "@/lib/cn";
import { formatCalendarDate, formatMonthYear } from "@/lib/format/date";
import { loadPeriodReport } from "@/server/finance/reports";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Relatórios" };

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: "month", label: "Mês" },
  { kind: "quarter", label: "Trimestre" },
  { kind: "year", label: "Ano" },
];

async function Report({ searchParams }: { searchParams: PageProps<"/relatorios">["searchParams"] }) {
  const params = await searchParams;
  const membership = await requireMember();
  const today = todayFor(membership);
  const period = (typeof params.periodo === "string" && parsePeriod(params.periodo)) || parsePeriod(periodKeyFor("month", today))!;
  const r = await loadPeriodReport(period, today);
  const hasMovement = r.transactions.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 print:hidden">
        <ul className="flex flex-wrap gap-2" aria-label="Tipo de período">
          {KINDS.map((k) => (
            <li key={k.kind}>
              <Link
                href={`/relatorios?periodo=${periodKeyFor(k.kind, period.start)}`}
                aria-current={period.kind === k.kind ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-full border-2 px-4 font-semibold",
                  period.kind === k.kind ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
                )}
              >
                {k.label}
              </Link>
            </li>
          ))}
        </ul>
        <nav aria-label="Período" className="period-nav">
          <Link href={`/relatorios?periodo=${shiftPeriod(period, -1)}`} className={buttonClasses({ variant: "secondary" })} aria-label="Período anterior">←</Link>
          <p className="text-center text-lg font-bold first-letter:uppercase">{period.label}</p>
          <Link href={`/relatorios?periodo=${shiftPeriod(period, 1)}`} className={buttonClasses({ variant: "secondary" })} aria-label="Próximo período">→</Link>
        </nav>
        <div className="flex flex-wrap gap-2">
          <a href={`/relatorios/csv?periodo=${period.key}`} className={buttonClasses({ variant: "secondary" })} download>
            Baixar planilha (CSV)
          </a>
          <PrintButton />
        </div>
      </div>
      <h2 className="hidden text-xl font-bold print:block">Relatório — {period.label}</h2>

      <Card aria-labelledby="resumo">
        <CardTitle id="resumo">Receitas e despesas realizadas</CardTitle>
        <dl className="mt-3 pairs gap-y-1 text-lg">
          <dt>Receitas recebidas</dt>
          <dd className="text-right"><Money cents={r.sum.incomeCents} /></dd>
          <dt>Despesas pagas</dt>
          <dd className="text-right"><Money cents={r.sum.expenseCents} /></dd>
          <dt className="font-bold">Resultado</dt>
          <dd className="text-right font-bold"><Money cents={r.sum.resultCents} /></dd>
        </dl>
        <p className="mt-2 text-sm text-muted">
          Previstos no período (fora do resultado): receitas <Money cents={r.sum.plannedIncomeCents} /> · despesas <Money cents={r.sum.plannedExpenseCents} />.
        </p>
        <p className="mt-1 text-sm text-muted">{r.transactions.length} lançamentos considerados (cancelados ficam de fora).</p>
      </Card>

      {period.months.length > 1 ? (
        <Card>
          <ColumnChart
            title="Receitas e despesas por mês"
            series={[
              { key: "income", label: "Receitas recebidas", colorClass: "bg-series-income" },
              { key: "expense", label: "Despesas pagas", colorClass: "bg-series-expense" },
            ]}
            groups={r.totals.map((m) => ({ key: m.month, label: SHORT_MONTHS[Number(m.month.slice(5)) - 1], longLabel: formatMonthYear(m.month), values: { income: m.incomeCents, expense: m.expenseCents } }))}
          />
        </Card>
      ) : null}

      <Card>
        <BarList title="Gastos por categoria" rows={r.expenseCategories} emptyText="Nenhuma despesa paga no período." limit={12} />
      </Card>
      <Card>
        <BarList title="Receitas por categoria" rows={r.incomeCategories} emptyText="Nenhuma receita recebida no período." limit={12} />
      </Card>

      <Card aria-labelledby="saldo">
        <CardTitle id="saldo">Evolução do saldo registrado</CardTitle>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th scope="col" className="py-1 font-medium">Fim de</th>
                <th scope="col" className="py-1 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border text-muted">
                <th scope="row" className="py-2 text-left font-normal">Antes do período</th>
                <td className="py-2 text-right"><Money cents={r.openingBalanceCents} /></td>
              </tr>
              {r.balance.map((b) => (
                <tr key={b.month} className="border-t border-border">
                  <th scope="row" className="py-2 text-left font-normal first-letter:uppercase">{formatMonthYear(b.month)}</th>
                  {b.balanceCents === null ? (
                    <td className="py-2 text-right text-muted">Ainda não chegou</td>
                  ) : (
                    <td className={cn("py-2 text-right font-semibold", b.balanceCents < 0 && "text-danger")}><Money cents={b.balanceCents} /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card aria-labelledby="contas">
        <CardTitle id="contas">Contas a pagar com vencimento no período</CardTitle>
        <dl className="mt-3 pairs gap-y-1">
          <dt>Pagas ({r.bills.paid.count})</dt>
          <dd className="text-right"><Money cents={r.bills.paid.cents} /></dd>
          <dt>A vencer, em aberto ({r.bills.pending.count})</dt>
          <dd className="text-right"><Money cents={r.bills.pending.cents} /></dd>
          <dt className={r.bills.overdue.count ? "font-semibold text-danger" : ""}>Vencidas, em aberto ({r.bills.overdue.count})</dt>
          <dd className="text-right"><Money cents={r.bills.overdue.cents} /></dd>
        </dl>
        <p className="mt-2 text-sm text-muted">
          Pagas: total pago, incluindo encargos. Em aberto: o que falta do valor original, sem juros estimados.
          {r.bills.canceled ? ` ${r.bills.canceled} cancelada(s) não entram.` : ""}
        </p>
      </Card>

      <Card aria-labelledby="parcelas">
        <CardTitle id="parcelas">Parcelas</CardTitle>
        <dl className="mt-3 pairs gap-y-1">
          <dt>Pagas no período ({r.installments.paidInPeriodCount} pagamentos)</dt>
          <dd className="text-right"><Money cents={r.installments.paidInPeriodCents} /></dd>
          <dt>Vencendo no período, em aberto ({r.installments.dueInPeriodOpenCount})</dt>
          <dd className="text-right"><Money cents={r.installments.dueInPeriodOpenCents} /></dd>
          <dt>Parcelas futuras, depois do período</dt>
          <dd className="text-right"><Money cents={r.installments.futureAfterPeriodCents} /></dd>
        </dl>
      </Card>

      <Card aria-labelledby="orcado">
        <CardTitle id="orcado">Orçamento × realizado</CardTitle>
        {r.budgets.length === 0 ? (
          <p className="mt-2 text-muted">
            Nenhum limite definido no período. <Link href="/orcamento" className="font-semibold text-primary underline underline-offset-4">Definir orçamento</Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {r.budgets.map((b) => (
              <li key={b.id}>
                <BudgetMeter name={`${period.months.length > 1 ? `${SHORT_MONTHS[Number(b.month.slice(5)) - 1]}: ` : ""}${b.categoryName ?? "Limite geral"}`} usage={b.usage} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {hasMovement ? null : <p className="text-muted">Sem lançamentos no período.</p>}
      <p className="text-sm text-muted print:block">
        Gerado em {formatCalendarDate(today)}. Valores registrados manualmente no Cashly; não substituem extratos nem documentos oficiais.
      </p>
    </div>
  );
}

export default function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  return (
    <>
      <div className="mb-5 print:hidden">
        <h1 className="text-2xl font-bold sm:text-3xl">Relatórios</h1>
        <p className="mt-1 text-muted">Mensal, trimestral e anual. <Link href="/orcamento" className="font-semibold text-primary underline underline-offset-4">Orçamento</Link></p>
      </div>
      <Suspense fallback={<LoadingCard label="Montando o relatório…" />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </>
  );
}
