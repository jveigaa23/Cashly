import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BudgetMeter } from "@/components/charts/budget-meter";
import { BudgetForm } from "@/components/finance/budget-form";
import { ConfirmAction } from "@/components/finance/confirm-action";
import { Flash } from "@/components/finance/flash";
import { SimpleAction } from "@/components/finance/simple-action";
import { LoadingCard } from "@/components/layout/loading-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { addMonths, formatMonthYear, monthRange } from "@/lib/format/date";
import { copyPreviousBudgetsAction, removeBudgetAction } from "@/server/finance/budget-actions";
import { listCategories } from "@/server/finance/queries";
import { loadBudgets, loadOpenObligations, loadTransactions, plannedByMonthCategory } from "@/server/finance/reports";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Orçamento" };

async function Budget({ searchParams }: { searchParams: PageProps<"/orcamento">["searchParams"] }) {
  const params = await searchParams;
  const membership = await requireMember();
  const current = todayFor(membership).slice(0, 7);
  const month = typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : current;
  const { start, end } = monthRange(month);
  const [txs, obligations, categories] = await Promise.all([loadTransactions(start, end), loadOpenObligations(), listCategories("expense")]);
  const budgets = await loadBudgets([month], txs, plannedByMonthCategory(obligations));

  return (
    <>
      <Flash params={params} messages={{ salvo: "Limite salvo.", removido: "Limite removido.", copiado: "Limites copiados do mês anterior." }} />
      <nav aria-label="Mês" className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/orcamento?mes=${addMonths(month, -1)}`} className={buttonClasses({ variant: "secondary" })} aria-label="Mês anterior">←</Link>
        <p className="text-lg font-bold first-letter:uppercase">{formatMonthYear(month)}</p>
        <Link href={`/orcamento?mes=${addMonths(month, 1)}`} className={buttonClasses({ variant: "secondary" })} aria-label="Próximo mês">→</Link>
      </nav>

      <div className="flex flex-col gap-4">
        <Card aria-labelledby="limites">
          <CardTitle id="limites">Limites</CardTitle>
          <p className="mt-1 text-sm text-muted">
            “Gasto” conta só despesas pagas no mês. Contas em aberto e despesas previstas aparecem à parte, como previsão.
          </p>
          {budgets.length === 0 ? (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-muted">Nenhum limite para este mês.</p>
              <SimpleAction action={copyPreviousBudgetsAction.bind(null, month)} label="Copiar limites do mês anterior" />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {budgets.map((b) => (
                <li key={b.id} className="flex flex-col gap-2 py-4">
                  <BudgetMeter name={b.categoryName ?? "Limite geral (todas as despesas)"} usage={b.usage} />
                  <p className="text-sm text-muted">Aviso ao chegar a {b.alertPercent}%.</p>
                  <ConfirmAction
                    action={removeBudgetAction.bind(null, b.id, month)}
                    triggerLabel="Remover limite"
                    title="Remover este limite?"
                    description="Só o limite é removido. Nenhum lançamento é alterado."
                    confirmLabel="Sim, remover"
                    withReason={false}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="definir">
          <CardTitle id="definir">Definir ou alterar um limite</CardTitle>
          <div className="mt-3">
            <BudgetForm month={month} categories={categories} />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function BudgetPage({ searchParams }: PageProps<"/orcamento">) {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold sm:text-3xl">Orçamento</h1>
        <p className="mt-1 text-muted">Limites de gasto por mês, geral ou por categoria.</p>
      </div>
      <Suspense fallback={<LoadingCard label="Carregando orçamento…" />}>
        <Budget searchParams={searchParams} />
      </Suspense>
    </>
  );
}
