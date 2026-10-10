import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Money } from "@/components/finance/money";
import { LoadingCard } from "@/components/layout/loading-card";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListIcon, PlusIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { TRANSACTION_STATUS_LABEL } from "@/domain/transactions";
import { cn } from "@/lib/cn";
import { addMonths, formatCalendarDate, formatMonthYear } from "@/lib/format/date";
import { listCategories, listTransactions } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Lançamentos" };

const TYPES = [
  { value: "", label: "Todos" },
  { value: "income", label: "Receitas" },
  { value: "expense", label: "Despesas" },
] as const;

async function TransactionsList({ searchParams }: { searchParams: PageProps<"/lancamentos">["searchParams"] }) {
  const params = await searchParams;
  const membership = await requireMember();
  const currentMonth = todayFor(membership).slice(0, 7);
  const month = typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : currentMonth;
  const type = params.tipo === "income" || params.tipo === "expense" ? params.tipo : undefined;
  const q = typeof params.busca === "string" ? params.busca.slice(0, 80) : "";
  const categoryId = typeof params.categoria === "string" && /^[0-9a-f-]{36}$/i.test(params.categoria) ? params.categoria : undefined;

  const [{ items, totals, truncated }, incomeCats, expenseCats] = await Promise.all([
    listTransactions({ month, type, categoryId, q }),
    listCategories("income"),
    listCategories("expense"),
  ]);
  const filtered = Boolean(type || q || categoryId);
  const href = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { mes: month, tipo: type, busca: q || undefined, categoria: categoryId, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/lancamentos?${sp.toString()}`;
  };

  return (
    <>
      {typeof params.salvo === "string" ? <Notice tone="success" role="status" title="Lançamento salvo." className="mb-4" /> : null}

      <nav aria-label="Mês" className="mb-4 flex items-center justify-between gap-2">
        <Link href={href({ mes: addMonths(month, -1) })} className={buttonClasses({ variant: "secondary" })} aria-label="Mês anterior">
          ←
        </Link>
        <p className="text-lg font-bold first-letter:uppercase" aria-live="polite">{formatMonthYear(month)}</p>
        <Link href={href({ mes: addMonths(month, 1) })} className={buttonClasses({ variant: "secondary" })} aria-label="Próximo mês">
          →
        </Link>
      </nav>

      <ul className="mb-4 flex gap-2" aria-label="Tipo">
        {TYPES.map((t) => (
          <li key={t.value}>
            <Link
              href={href({ tipo: t.value || undefined })}
              aria-current={(type ?? "") === t.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-12 items-center rounded-full border-2 px-4 font-semibold",
                (type ?? "") === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>

      <form method="get" action="/lancamentos" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]" role="search">
        <input type="hidden" name="mes" value={month} />
        {type ? <input type="hidden" name="tipo" value={type} /> : null}
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="font-semibold">Buscar na descrição</span>
          <input name="busca" defaultValue={q} className="min-h-12 rounded-xl border-2 border-border bg-surface px-3 text-lg" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="font-semibold">Categoria</span>
          <select name="categoria" defaultValue={categoryId ?? ""} className="min-h-12 max-w-full rounded-xl border-2 border-border bg-surface px-3 text-lg">
            <option value="">Todas</option>
            <optgroup label="Despesas">
              {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Receitas">
              {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
        </label>
        <button type="submit" className={buttonClasses({ variant: "secondary" })}>
          Aplicar
        </button>
      </form>

      <Card className="mb-4" aria-labelledby="totais">
        <h2 id="totais" className="font-semibold">{filtered ? "Totais deste filtro" : "Totais do mês"}</h2>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-lg">
          <dt>Receitas recebidas</dt>
          <dd className="text-right text-success"><Money cents={totals.incomeCents} /></dd>
          <dt>Despesas pagas</dt>
          <dd className="text-right text-danger"><Money cents={totals.expenseCents} /></dd>
          <dt className="font-bold">Resultado realizado</dt>
          <dd className="text-right font-bold"><Money cents={totals.resultCents} /></dd>
        </dl>
        {totals.plannedIncomeCents > 0 || totals.plannedExpenseCents > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-sm text-muted">Previstos (ainda não aconteceram, não entram no resultado):</p>
            <p>
              Receitas previstas <Money cents={totals.plannedIncomeCents} /> · Despesas previstas <Money cents={totals.plannedExpenseCents} />
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-sm text-muted">Contas a pagar só entram aqui quando você registra o pagamento.</p>
      </Card>

      {truncated ? <Notice tone="warning" title="Mostrando só os primeiros 300 lançamentos" className="mb-4">Use os filtros para ver os demais.</Notice> : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<ListIcon width={40} height={40} />}
          title={filtered ? "Nada encontrado com esse filtro" : "Nenhum lançamento neste mês"}
          description={filtered ? "Mude o filtro ou o mês." : "Registre receitas e despesas para acompanhar o mês."}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/lancamentos/${t.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-muted">
                <div className="min-w-0">
                  <p className="text-lg font-semibold break-words">{t.description}</p>
                  <p className="text-muted">
                    {formatCalendarDate(t.occurredOn)}
                    {t.categoryName ? ` · ${t.categoryName}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("text-lg font-bold", t.type === "income" ? "text-success" : "text-foreground")}>
                    {t.type === "income" ? "+ " : "− "}
                    <Money cents={t.amountCents} />
                  </span>
                  {t.status === "planned" ? (
                    <StatusBadge tone="info">{TRANSACTION_STATUS_LABEL[t.type].planned}</StatusBadge>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TransactionsPage({ searchParams }: PageProps<"/lancamentos">) {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold sm:text-3xl">Lançamentos</h1>
        <p className="mt-1 text-muted">Receitas e despesas da família.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          <Link href="/lancamentos/novo?tipo=despesa" className={buttonClasses()}>
            <PlusIcon /> Despesa
          </Link>
          <Link href="/lancamentos/novo?tipo=receita" className={buttonClasses({ variant: "secondary" })}>
            <PlusIcon /> Receita
          </Link>
        </div>
      </div>
      <Suspense fallback={<LoadingCard label="Carregando lançamentos…" />}>
        <TransactionsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
