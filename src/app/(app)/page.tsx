import Link from "next/link";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { BudgetMeter } from "@/components/charts/budget-meter";
import { ColumnChart } from "@/components/charts/column-chart";
import { Money } from "@/components/finance/money";
import { StatTile } from "@/components/finance/stat-tile";
import { Greeting } from "@/components/layout/greeting";
import { LoadingCard } from "@/components/layout/loading-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PlusIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { addMonths, formatCalendarDate, formatMonthYear } from "@/lib/format/date";
import { ensureRecurrences } from "@/server/finance/queries";
import { loadDashboard } from "@/server/finance/reports";
import { requireMember, todayFor } from "@/server/session";

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const membership = await requireMember();
  const today = todayFor(membership);
  const currentMonth = today.slice(0, 7);
  const month = typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) && params.mes <= currentMonth ? params.mes : currentMonth;
  const generated = await ensureRecurrences();
  const d = await loadDashboard(month, today);
  const prevLabel = formatMonthYear(addMonths(month, -1)).replace(/ de \d+$/, "");
  const isCurrent = month === currentMonth;
  const general = d.budgets.find((b) => b.categoryId === null);
  const alerts = d.budgets.filter((b) => b.categoryId !== null && b.usage.state !== "ok");
  const hasAnyData = d.history.some((m) => m.incomeCents || m.expenseCents || m.plannedIncomeCents || m.plannedExpenseCents) || d.overdue.length > 0 || d.dueSoon.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {!generated.ok ? (
        <Notice tone="warning" role="alert" title="Não foi possível criar as próximas contas repetidas agora.">
          Os valores abaixo consideram o que já está cadastrado.
        </Notice>
      ) : null}

      <Card aria-labelledby="saldo">
        <h2 id="saldo" className="text-muted">Saldo registrado {isCurrent ? "hoje" : `no fim de ${formatMonthYear(month)}`}</h2>
        <p className="tabular mt-1 break-words text-4xl font-bold sm:text-5xl">
          <Money cents={d.balanceCents} />
        </p>
        <p className="mt-2 text-sm text-muted">
          Saldo inicial das contas + receitas recebidas − despesas pagas registradas no Cashly. Não inclui previsões nem contas
          ainda não pagas. <Link href="/ajustes#contas" className="font-semibold text-primary underline underline-offset-4">Ajustar saldo inicial</Link>
        </p>
      </Card>

      <nav aria-label="Mês do painel" className="flex items-center justify-between gap-2">
        <Link href={`/?mes=${addMonths(month, -1)}`} className={buttonClasses({ variant: "secondary" })} aria-label="Mês anterior">←</Link>
        <p className="text-lg font-bold first-letter:uppercase">{formatMonthYear(month)}</p>
        {isCurrent ? (
          <span className="size-12" aria-hidden="true" />
        ) : (
          <Link href={`/?mes=${addMonths(month, 1)}`} className={buttonClasses({ variant: "secondary" })} aria-label="Próximo mês">→</Link>
        )}
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Receitas recebidas" cents={d.current.incomeCents} previousCents={d.previous.incomeCents} upIsGood previousLabel={prevLabel} />
        <StatTile label="Despesas pagas" cents={d.current.expenseCents} previousCents={d.previous.expenseCents} upIsGood={false} previousLabel={prevLabel} />
        <StatTile label="Resultado do mês" cents={d.current.resultCents} previousCents={d.previous.resultCents} upIsGood previousLabel={prevLabel} />
      </div>
      {d.current.plannedIncomeCents || d.current.plannedExpenseCents ? (
        <p className="text-sm text-muted">
          Ainda previsto neste mês (não entra nos valores acima): receitas <Money cents={d.current.plannedIncomeCents} /> · despesas{" "}
          <Money cents={d.current.plannedExpenseCents} />.
        </p>
      ) : null}

      <Card aria-labelledby="obrigacoes">
        <CardTitle id="obrigacoes">Contas e parcelas</CardTitle>
        {d.overdue.length > 0 ? (
          <Notice tone="danger" title={`${d.overdue.length} ${d.overdue.length === 1 ? "conta vencida" : "contas vencidas"}`} className="mt-3">
            Total em aberto <Money cents={d.overdue.reduce((s, o) => s + o.outstandingCents, 0)} className="font-semibold" /> (sem juros e multa).{" "}
            <Link href="/contas?ver=overdue" className="font-semibold underline underline-offset-4">Ver vencidas</Link>
          </Notice>
        ) : (
          <p className="mt-2 text-success">Nenhuma conta vencida.</p>
        )}
        <h3 className="mt-4 font-semibold">Vencem nos próximos 7 dias</h3>
        {d.dueSoon.length === 0 ? (
          <p className="text-muted">Nada vence nos próximos 7 dias.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {d.dueSoon.slice(0, 6).map((o) => (
              <li key={`${o.kind}-${o.id}`}>
                <Link href={o.href} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:bg-surface-muted">
                  <span className="min-w-0 break-words">
                    {o.name}
                    <span className="block text-sm text-muted">{o.dueDate === today ? "Vence hoje" : `Vence ${formatCalendarDate(o.dueDate)}`}</span>
                  </span>
                  <Money cents={o.outstandingCents} className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border pt-3">
          <dt>A pagar em {formatMonthYear(month).replace(/ de \d+$/, "")} (previsão)</dt>
          <dd className="text-right"><Money cents={d.dueThisMonthCents} /></dd>
          <dt>Parcelas futuras ({d.futureInstallmentsCount})</dt>
          <dd className="text-right"><Money cents={d.futureInstallmentsCents} /></dd>
        </dl>
        <p className="mt-2 text-sm text-muted">Obrigações a pagar não são dinheiro disponível nem gasto realizado.</p>
      </Card>

      <Card aria-labelledby="orcamento">
        <CardTitle id="orcamento">Orçamento do mês</CardTitle>
        <div className="mt-3 space-y-4">
          {general ? <BudgetMeter name="Limite geral" usage={general.usage} /> : null}
          {alerts.map((b) => (
            <BudgetMeter key={b.id} name={b.categoryName ?? "Categoria"} usage={b.usage} />
          ))}
          {!general && alerts.length === 0 ? (
            <p className="text-muted">{d.budgets.length ? "Todas as categorias estão dentro do limite." : "Nenhum limite definido para este mês."}</p>
          ) : null}
        </div>
        <Link href={`/orcamento?mes=${month}`} className={`${buttonClasses({ variant: "secondary" })} mt-3`}>
          {d.budgets.length ? "Ver orçamento completo" : "Definir orçamento"}
        </Link>
      </Card>

      {hasAnyData ? (
        <>
          <Card>
            <ColumnChart
              title="Receitas e despesas realizadas — últimos 6 meses"
              series={[
                { key: "income", label: "Receitas recebidas", colorClass: "bg-series-income" },
                { key: "expense", label: "Despesas pagas", colorClass: "bg-series-expense" },
              ]}
              groups={d.history.map((m) => ({
                key: m.month,
                label: SHORT_MONTHS[Number(m.month.slice(5)) - 1],
                longLabel: formatMonthYear(m.month),
                values: { income: m.incomeCents, expense: m.expenseCents },
              }))}
            />
          </Card>
          <Card>
            <BarList title={`Gastos por categoria em ${formatMonthYear(month)}`} rows={d.categories} emptyText="Nenhuma despesa paga neste mês." />
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-lg font-semibold">Comece registrando a vida financeira da casa</p>
          <p className="mt-1 text-muted">Cadastre as contas do mês, as receitas e os gastos. O painel se monta sozinho.</p>
        </Card>
      )}
    </div>
  );
}

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Início</h1>
        <Suspense fallback={<p className="mt-1 text-muted">&nbsp;</p>}>
          <Greeting />
        </Suspense>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link href="/lancamentos/novo?tipo=despesa" className={buttonClasses({ size: "lg" })}>
          <PlusIcon /> Despesa
        </Link>
        <Link href="/lancamentos/novo?tipo=receita" className={buttonClasses({ size: "lg", variant: "secondary" })}>
          <PlusIcon /> Receita
        </Link>
        <Link href="/contas/nova" className={buttonClasses({ size: "lg", variant: "secondary" })}>
          <PlusIcon /> Conta a pagar
        </Link>
      </div>
      <Suspense fallback={<LoadingCard label="Carregando o resumo…" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
