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
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCalendarDate } from "@/lib/format/date";
import { cancelBillAction, cancelPaymentAction, payBillAction } from "@/server/finance/actions";
import { getBill, getHistory, listAccounts } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Conta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function BillDetail({ params, searchParams }: PageProps<"/contas/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const membership = await requireMember();
  const today = todayFor(membership);
  const bill = await getBill(id, today);
  if (!bill) notFound();
  const [accounts, history] = await Promise.all([listAccounts(), getHistory([bill.id, ...bill.payments.map((p) => p.id)], membership)]);
  const s = bill.summary;
  const canPay = bill.status === "pending" || bill.status === "partially_paid";
  const activePayments = bill.payments.filter((p) => !p.canceledAt);

  return (
    <>
      <Flash
        params={query}
        messages={{ pago: "Pagamento registrado.", salvo: "Conta salva.", cancelada: "Conta cancelada.", "pagamento-cancelado": "Pagamento cancelado." }}
      />
      <div className="mb-5">
        <Link href="/contas" className="font-semibold text-primary underline underline-offset-4">
          ← Contas a pagar
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold break-words sm:text-3xl">{bill.name}</h1>
          <BillBadge situation={s.situation} />
        </div>
        <p className="mt-1 text-muted">
          Vence {formatCalendarDate(bill.dueDate)}
          {bill.categoryName ? ` · ${bill.categoryName}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Card aria-labelledby="valores">
          <CardTitle id="valores">Valores</CardTitle>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-lg">
            <dt>Valor original</dt>
            <dd className="text-right"><Money cents={bill.originalCents} /></dd>
            <dt>Já pago (principal)</dt>
            <dd className="text-right"><Money cents={s.paidPrincipalCents} /></dd>
            {s.paidChargesCents > 0 ? (
              <>
                <dt>Encargos pagos</dt>
                <dd className="text-right"><Money cents={s.paidChargesCents} /></dd>
              </>
            ) : null}
            <dt className="font-bold">Falta pagar</dt>
            <dd className="text-right font-bold"><Money cents={bill.status === "canceled" ? 0 : s.outstandingCents} /></dd>
          </dl>
          {s.daysOverdue > 0 ? (
            <p className="mt-3 font-semibold text-danger">
              Vencida há {s.daysOverdue} {s.daysOverdue === 1 ? "dia" : "dias"}. Juros e multa podem ser cobrados pelo credor;
              a estimativa chega na próxima etapa do Cashly.
            </p>
          ) : null}
          {bill.description ? <p className="mt-3 text-muted">{bill.description}</p> : null}
          {bill.status === "canceled" && bill.cancelReason ? (
            <p className="mt-3 text-muted">Motivo do cancelamento: {bill.cancelReason}</p>
          ) : null}
        </Card>

        {canPay ? (
          <Card aria-labelledby="pagar">
            <CardTitle id="pagar">Registrar pagamento</CardTitle>
            <div className="mt-3">
              <PaymentForm action={payBillAction.bind(null, bill.id)} outstandingCents={s.outstandingCents} today={today} accounts={accounts} />
            </div>
          </Card>
        ) : null}

        <Card aria-labelledby="pagamentos">
          <CardTitle id="pagamentos">Pagamentos</CardTitle>
          {bill.payments.length === 0 ? (
            <p className="mt-2 text-muted">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {bill.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg">
                      <Money cents={p.amountCents} className={p.canceledAt ? "line-through" : "font-semibold"} /> em {formatCalendarDate(p.paidOn)}
                    </span>
                    {p.canceledAt ? <StatusBadge tone="neutral">Cancelado</StatusBadge> : <StatusBadge tone="success">Registrado</StatusBadge>}
                  </div>
                  {p.chargesCents > 0 ? (
                    <p className="text-sm text-muted">
                      Inclui <Money cents={p.chargesCents} /> de encargos
                    </p>
                  ) : null}
                  {p.note ? <p className="text-sm text-muted">{p.note}</p> : null}
                  {p.canceledAt && p.cancelReason ? <p className="text-sm text-muted">Motivo: {p.cancelReason}</p> : null}
                  {!p.canceledAt ? (
                    <ConfirmAction
                      action={cancelPaymentAction.bind(null, bill.id, p.id)}
                      triggerLabel="Cancelar este pagamento"
                      title="Cancelar este pagamento?"
                      description="Use se ele foi registrado por engano. A despesa ligada a ele também será cancelada e a conta volta a ficar em aberto."
                      confirmLabel="Sim, cancelar pagamento"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {bill.status !== "canceled" ? (
          <Card aria-labelledby="acoes">
            <CardTitle id="acoes">Outras ações</CardTitle>
            <div className="mt-3 flex flex-col items-start gap-3">
              <Link href={`/contas/${bill.id}/editar`} className={buttonClasses({ variant: "secondary" })}>
                Editar conta
              </Link>
              {activePayments.length === 0 ? (
                <ConfirmAction
                  action={cancelBillAction.bind(null, bill.id)}
                  triggerLabel="Cancelar conta"
                  title="Cancelar esta conta?"
                  description="Use se a conta não existe mais ou foi cadastrada por engano. Ela continua no histórico, mas sai das contas a pagar."
                  confirmLabel="Sim, cancelar conta"
                />
              ) : (
                <p className="text-sm text-muted">Para cancelar a conta, cancele antes os pagamentos registrados.</p>
              )}
            </div>
          </Card>
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

export default function BillPage(props: PageProps<"/contas/[id]">) {
  return (
    <Suspense fallback={<LoadingCard label="Carregando conta…" />}>
      <BillDetail {...props} />
    </Suspense>
  );
}
