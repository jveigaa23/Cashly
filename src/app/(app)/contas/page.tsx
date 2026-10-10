import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BillBadge } from "@/components/finance/bill-badge";
import { Money } from "@/components/finance/money";
import { LoadingCard } from "@/components/layout/loading-card";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BillIcon, PlusIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { formatCalendarDate } from "@/lib/format/date";
import { listBills, type BillSort, type BillView } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Contas a pagar" };

const VIEWS: { value: BillView; label: string }[] = [
  { value: "open", label: "A pagar" },
  { value: "overdue", label: "Vencidas" },
  { value: "paid", label: "Pagas" },
  { value: "canceled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];
const SORTS: { value: BillSort; label: string }[] = [
  { value: "due", label: "Vencimento" },
  { value: "amount", label: "Maior valor em aberto" },
  { value: "name", label: "Nome" },
];

function pick<T extends string>(value: unknown, allowed: readonly { value: T }[], fallback: T): T {
  return allowed.some((a) => a.value === value) ? (value as T) : fallback;
}

async function BillsList({ searchParams }: { searchParams: PageProps<"/contas">["searchParams"] }) {
  const params = await searchParams;
  const view = pick(params.ver, VIEWS, "open");
  const sort = pick(params.ordem, SORTS, "due");
  const q = typeof params.busca === "string" ? params.busca.slice(0, 80) : "";
  const membership = await requireMember();
  const today = todayFor(membership);
  const { items, truncated } = await listBills({ view, q, sort }, today);

  const totalOpen = items.filter((b) => b.status !== "canceled").reduce((s, b) => s + b.summary.outstandingCents, 0);
  const overdueCount = items.filter((b) => b.summary.daysOverdue > 0).length;
  const href = (next: Partial<{ ver: string; ordem: string; busca: string }>) => {
    const sp = new URLSearchParams({ ver: view, ordem: sort, ...(q ? { busca: q } : {}), ...next });
    if (!sp.get("busca")) sp.delete("busca");
    return `/contas?${sp.toString()}`;
  };

  return (
    <>
      <nav aria-label="Filtrar contas" className="-mx-4 mb-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {VIEWS.map((v) => (
            <li key={v.value}>
              <Link
                href={href({ ver: v.value })}
                aria-current={v.value === view ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center whitespace-nowrap rounded-full border-2 px-4 font-semibold",
                  v.value === view ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
                )}
              >
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form method="get" action="/contas" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]" role="search">
        <input type="hidden" name="ver" value={view} />
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="font-semibold">Buscar pelo nome</span>
          <input name="busca" defaultValue={q} className="min-h-12 rounded-xl border-2 border-border bg-surface px-3 text-lg" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Ordenar por</span>
          <select name="ordem" defaultValue={sort} className="min-h-12 rounded-xl border-2 border-border bg-surface px-3 text-lg">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClasses({ variant: "secondary" })}>
          Aplicar
        </button>
      </form>

      {view !== "paid" && view !== "canceled" && items.length > 0 ? (
        <Card className="mb-4">
          <p className="text-muted">Em aberto nesta lista</p>
          <p className="text-2xl font-bold">
            <Money cents={totalOpen} />
          </p>
          {overdueCount > 0 ? (
            <p className="mt-1 font-semibold text-danger">
              {overdueCount} {overdueCount === 1 ? "conta vencida" : "contas vencidas"}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted">Valores originais, sem juros e multa estimados.</p>
        </Card>
      ) : null}

      {truncated ? (
        <Notice tone="warning" title="Mostrando só as primeiras 300 contas" className="mb-4">
          Use a busca ou os filtros para encontrar as demais.
        </Notice>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<BillIcon width={40} height={40} />}
          title={q ? "Nenhuma conta encontrada" : "Nenhuma conta aqui"}
          description={q ? "Confira o nome digitado ou mude o filtro." : "Cadastre as contas da casa para acompanhar os vencimentos."}
          action={
            <Link href="/contas/nova" className={buttonClasses()}>
              <PlusIcon /> Nova conta
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((bill) => (
            <li key={bill.id}>
              <Link href={`/contas/${bill.id}`} className="block rounded-2xl border border-border bg-surface p-4 hover:bg-surface-muted">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold break-words">{bill.name}</p>
                    <p className="text-muted">
                      Vence {formatCalendarDate(bill.dueDate)}
                      {bill.categoryName ? ` · ${bill.categoryName}` : ""}
                    </p>
                  </div>
                  <BillBadge situation={bill.summary.situation} />
                </div>
                <p className="mt-2 text-lg">
                  {bill.summary.outstandingCents > 0 && bill.status !== "canceled" ? (
                    <>
                      Falta pagar <Money cents={bill.summary.outstandingCents} className="font-bold" />
                      {bill.summary.paidPrincipalCents > 0 ? (
                        <span className="text-muted"> de <Money cents={bill.originalCents} /></span>
                      ) : null}
                    </>
                  ) : (
                    <Money cents={bill.originalCents} className="font-semibold" />
                  )}
                </p>
                {bill.summary.daysOverdue > 0 ? (
                  <p className="text-sm font-semibold text-danger">
                    {bill.summary.daysOverdue} {bill.summary.daysOverdue === 1 ? "dia" : "dias"} de atraso
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function BillsPage({ searchParams }: PageProps<"/contas">) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Contas a pagar</h1>
          <p className="mt-1 text-muted">Vencimentos e pagamentos da casa.</p>
        </div>
        <Link href="/contas/nova" className={buttonClasses()}>
          <PlusIcon /> Nova conta
        </Link>
      </div>
      <Suspense fallback={<LoadingCard label="Carregando contas…" />}>
        <BillsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
