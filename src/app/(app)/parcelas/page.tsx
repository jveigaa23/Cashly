import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Money } from "@/components/finance/money";
import { LoadingCard } from "@/components/layout/loading-card";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BillIcon, PlusIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatCalendarDate } from "@/lib/format/date";
import { listPlans } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Parcelamentos" };

const STATUS = {
  active: { label: "Em andamento", tone: "info" },
  finished: { label: "Quitado", tone: "success" },
  canceled: { label: "Cancelado", tone: "neutral" },
} as const;

async function Plans({ searchParams }: { searchParams: PageProps<"/parcelas">["searchParams"] }) {
  const params = await searchParams;
  const view = params.ver === "todos" ? "all" : "active";
  const membership = await requireMember();
  const today = todayFor(membership);
  const plans = await listPlans(today, view);
  const remaining = plans.filter((p) => p.status === "active").reduce((s, p) => s + p.summary.remainingCents, 0);

  return (
    <>
      <ul className="mb-4 flex gap-2">
        {[
          { value: "active", label: "Em andamento", href: "/parcelas" },
          { value: "all", label: "Todos", href: "/parcelas?ver=todos" },
        ].map((t) => (
          <li key={t.value}>
            <Link
              href={t.href}
              aria-current={view === t.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-12 items-center rounded-full border-2 px-4 font-semibold",
                view === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>

      {plans.length > 0 && view === "active" ? (
        <p className="mb-4 text-lg">
          Saldo devedor total: <Money cents={remaining} className="font-bold" />
        </p>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          icon={<BillIcon width={40} height={40} />}
          title="Nenhum parcelamento aqui"
          description="Cadastre compras parceladas, carnês e empréstimos para acompanhar as parcelas."
          action={<Link href="/parcelas/novo" className={buttonClasses()}><PlusIcon /> Novo parcelamento</Link>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link href={`/parcelas/${plan.id}`} className="block rounded-2xl border border-border bg-surface p-4 hover:bg-surface-muted">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-lg font-semibold break-words">{plan.description}</p>
                  <StatusBadge tone={STATUS[plan.status].tone}>{STATUS[plan.status].label}</StatusBadge>
                </div>
                <p className="mt-1">
                  {plan.summary.paidCount} de {plan.count} parcelas pagas
                  {plan.summary.overdueCount > 0 ? (
                    <span className="font-semibold text-danger"> · {plan.summary.overdueCount} vencida(s)</span>
                  ) : null}
                </p>
                {plan.status === "active" ? (
                  <p className="text-muted">
                    Falta <Money cents={plan.summary.remainingCents} className="font-semibold text-foreground" />
                    {plan.summary.nextDue ? ` · próxima em ${formatCalendarDate(plan.summary.nextDue)}` : ""}
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

export default function PlansPage({ searchParams }: PageProps<"/parcelas">) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/contas" className="font-semibold text-primary underline underline-offset-4">← Contas a pagar</Link>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Parcelamentos</h1>
          <p className="mt-1 text-muted">Compras parceladas, carnês e empréstimos.</p>
        </div>
        <Link href="/parcelas/novo" className={buttonClasses()}>
          <PlusIcon /> Novo parcelamento
        </Link>
      </div>
      <Suspense fallback={<LoadingCard label="Carregando parcelamentos…" />}>
        <Plans searchParams={searchParams} />
      </Suspense>
    </>
  );
}
