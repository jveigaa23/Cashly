import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BillBadge } from "@/components/finance/bill-badge";
import { ConfirmAction } from "@/components/finance/confirm-action";
import { Flash } from "@/components/finance/flash";
import { HistoryList } from "@/components/finance/history-list";
import { Money } from "@/components/finance/money";
import { PaymentForm } from "@/components/finance/payment-form";
import { LoadingCard } from "@/components/layout/loading-card";
import { Card, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { summarizeBill } from "@/domain/bills";
import { formatRate, parseRate } from "@/domain/rates";
import { formatCalendarDate } from "@/lib/format/date";
import { cancelInstallmentPaymentAction, cancelPlanAction, payInstallmentAction } from "@/server/finance/actions";
import { getHistory, getPlan, listAccounts } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Parcelamento" };

const KIND = { purchase: "Compra parcelada", loan: "Empréstimo", other: "Compromisso" } as const;

async function PlanDetail({ params, searchParams }: PageProps<"/parcelas/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const membership = await requireMember();
  const today = todayFor(membership);
  const plan = await getPlan(id, today);
  if (!plan) notFound();
  const allPaymentIds = plan.installments.flatMap((i) => i.payments.map((p) => p.id));
  const [accounts, history] = await Promise.all([listAccounts(), getHistory([plan.id, ...plan.installments.map((i) => i.id), ...allPaymentIds], membership)]);
  const hasActivePayments = plan.installments.some((i) => i.payments.some((p) => !p.canceledAt));
  // Próxima parcela a pagar (a mais antiga em aberto) já abre com o formulário.
  const nextOpen = plan.installments.find((i) => i.status === "pending" || i.status === "partially_paid");

  return (
    <>
      <Flash params={query} messages={{ salvo: "Parcelamento salvo.", pago: "Pagamento da parcela registrado.", "pagamento-cancelado": "Pagamento cancelado.", cancelado: "Parcelamento cancelado." }} />
      <div className="mb-5">
        <Link href="/parcelas" className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4">← Parcelamentos</Link>
        <h1 className="mt-2 text-2xl font-bold break-words sm:text-3xl">{plan.description}</h1>
        <p className="mt-1 text-muted">
          {KIND[plan.kind]} em {plan.count}x{plan.categoryName ? ` · ${plan.categoryName}` : ""}
          {plan.interestMethod === "simple_monthly" ? ` · juros simples de ${formatRate(parseRate(plan.interestRate) ?? 0n)}% ao mês` : " · sem juros"}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {plan.status === "canceled" ? (
          <Notice tone="warning" title="Parcelamento cancelado">{plan.cancelReason ? `Motivo: ${plan.cancelReason}` : null}</Notice>
        ) : null}

        <Card aria-labelledby="resumo">
          <CardTitle id="resumo">Resumo</CardTitle>
          <dl className="mt-3 pairs gap-y-2 text-lg">
            <dt>Valor financiado</dt>
            <dd className="text-right"><Money cents={plan.totalCents} /></dd>
            <dt>Total das parcelas</dt>
            <dd className="text-right"><Money cents={plan.summary.totalPayableCents} /></dd>
            <dt>Já pago</dt>
            <dd className="text-right"><Money cents={plan.summary.paidCents} /></dd>
            <dt className="font-bold">Saldo devedor</dt>
            <dd className="text-right font-bold"><Money cents={plan.summary.remainingCents} /></dd>
          </dl>
          <p className="mt-2">
            {plan.summary.paidCount} pagas · {plan.summary.openCount} em aberto
            {plan.summary.overdueCount > 0 ? <span className="font-semibold text-danger"> · {plan.summary.overdueCount} vencida(s)</span> : null}
          </p>
        </Card>

        <Card aria-labelledby="parcelas">
          <CardTitle id="parcelas">Parcelas</CardTitle>
          <ol className="mt-2 divide-y divide-border">
            {plan.installments.map((inst) => {
              const s = summarizeBill(
                {
                  originalCents: inst.expectedCents,
                  dueDate: inst.dueDate,
                  status: inst.status,
                  payments: inst.payments.map((p) => ({ amountCents: p.amountCents, principalCents: p.principalCents, chargesCents: p.chargesCents, canceled: Boolean(p.canceledAt) })),
                },
                today,
              );
              const open = inst.status === "pending" || inst.status === "partially_paid";
              return (
                <li key={inst.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg">
                      <strong>{inst.number}ª</strong> · {formatCalendarDate(inst.dueDate)} · <Money cents={inst.expectedCents} />
                    </span>
                    <BillBadge situation={s.situation} />
                  </div>
                  {inst.payments.map((p) => (
                    <div key={p.id} className="mt-2 flex flex-col gap-2 rounded-xl bg-surface-muted p-3">
                      <p>
                        <Money cents={p.amountCents} className={p.canceledAt ? "line-through" : "font-semibold"} /> pago em {formatCalendarDate(p.paidOn)}
                        {p.canceledAt ? <StatusBadge tone="neutral" className="ml-2">Cancelado</StatusBadge> : null}
                      </p>
                      {!p.canceledAt ? (
                        <ConfirmAction
                          action={cancelInstallmentPaymentAction.bind(null, plan.id, p.id)}
                          triggerLabel="Cancelar este pagamento"
                          title="Cancelar este pagamento?"
                          description="Use se foi registrado por engano. A despesa ligada a ele também é cancelada."
                          confirmLabel="Sim, cancelar pagamento"
                        />
                      ) : null}
                    </div>
                  ))}
                  {open && plan.status !== "canceled" ? (
                    <details className="mt-2" open={nextOpen?.id === inst.id}>
                      <summary className="min-h-12 cursor-pointer py-2 font-semibold text-primary">Registrar pagamento da {inst.number}ª parcela</summary>
                      <div className="mt-2">
                        <PaymentForm
                          action={payInstallmentAction.bind(null, plan.id, inst.id)}
                          outstandingCents={s.outstandingCents}
                          today={today}
                          accounts={accounts}
                        />
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>

        {plan.status !== "canceled" && !hasActivePayments ? (
          <ConfirmAction
            action={cancelPlanAction.bind(null, plan.id)}
            triggerLabel="Cancelar parcelamento"
            title="Cancelar este parcelamento?"
            description="Use se foi cadastrado por engano ou a compra foi desfeita. Todas as parcelas serão canceladas e ficam no histórico."
            confirmLabel="Sim, cancelar parcelamento"
          />
        ) : null}

        <Card aria-labelledby="historico">
          <CardTitle id="historico">Histórico</CardTitle>
          <div className="mt-3">
            <HistoryList entries={history} timezone={membership.timezone} />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function PlanPage(props: PageProps<"/parcelas/[id]">) {
  return (
    <Suspense fallback={<LoadingCard />}>
      <PlanDetail {...props} />
    </Suspense>
  );
}
