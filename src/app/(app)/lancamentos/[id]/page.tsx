import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/finance/confirm-action";
import { Flash } from "@/components/finance/flash";
import { HistoryList } from "@/components/finance/history-list";
import { Money } from "@/components/finance/money";
import { TransactionForm } from "@/components/finance/transaction-form";
import { LoadingCard } from "@/components/layout/loading-card";
import { Card, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { TRANSACTION_STATUS_LABEL } from "@/domain/transactions";
import { formatCalendarDate } from "@/lib/format/date";
import { formatAmountInput } from "@/lib/format/money";
import { cancelTransactionAction, updateTransactionAction } from "@/server/finance/actions";
import { getHistory, getTransaction, listAccounts, listCategories } from "@/server/finance/queries";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Lançamento" };

async function TransactionDetail({ params, searchParams }: PageProps<"/lancamentos/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const membership = await requireMember();
  const tx = await getTransaction(id);
  if (!tx) notFound();
  const [categories, accounts, history] = await Promise.all([
    listCategories(tx.type),
    listAccounts(),
    getHistory([tx.id], membership),
  ]);
  const label = tx.type === "income" ? "Receita" : "Despesa";
  const canceled = tx.status === "canceled";

  return (
    <>
      <Flash params={query} messages={{ salvo: "Lançamento salvo.", cancelado: "Lançamento cancelado." }} />
      <div className="mb-5">
        <Link href={`/lancamentos?mes=${tx.occurredOn.slice(0, 7)}`} className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4">
          ← Lançamentos
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold break-words sm:text-3xl">{tx.description}</h1>
          <StatusBadge tone={canceled ? "neutral" : tx.status === "planned" ? "info" : "success"}>
            {TRANSACTION_STATUS_LABEL[tx.type][tx.status]}
          </StatusBadge>
        </div>
        <p className="mt-1 text-lg">
          {label} de <Money cents={tx.amountCents} className="font-bold" /> em {formatCalendarDate(tx.occurredOn)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {tx.billId ? (
          <Notice title="Veio do pagamento de uma conta">
            Valor e data só mudam cancelando o pagamento na{" "}
            <Link href={`/contas/${tx.billId}`} className="font-semibold text-primary underline underline-offset-4">página da conta</Link>.
          </Notice>
        ) : null}
        {canceled ? (
          <Notice tone="warning" title="Lançamento cancelado">
            {tx.cancelReason ? `Motivo: ${tx.cancelReason}. ` : ""}Ele não entra nos totais e não pode ser alterado.
          </Notice>
        ) : (
          <Card aria-labelledby="editar">
            <CardTitle id="editar">Editar</CardTitle>
            <div className="mt-3">
              <TransactionForm
                action={updateTransactionAction.bind(null, tx.id)}
                categories={categories}
                accounts={accounts}
                lockedToPayment={Boolean(tx.billPaymentId)}
                initial={{
                  type: tx.type,
                  status: tx.status === "planned" ? "planned" : "confirmed",
                  description: tx.description,
                  amount: formatAmountInput(tx.amountCents),
                  occurredOn: tx.occurredOn,
                  categoryId: tx.categoryId ?? "",
                  accountId: tx.accountId ?? "",
                  paymentMethod: tx.paymentMethod ?? "",
                  nature: tx.nature ?? "",
                  notes: tx.notes ?? "",
                }}
                submitLabel="Salvar alterações"
              />
            </div>
          </Card>
        )}

        {!canceled && !tx.billPaymentId ? (
          <ConfirmAction
            action={cancelTransactionAction.bind(null, tx.id)}
            triggerLabel="Cancelar lançamento"
            title="Cancelar este lançamento?"
            description="Use se ele foi registrado por engano. Ele continua no histórico, mas sai dos totais."
            confirmLabel="Sim, cancelar lançamento"
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

export default function TransactionPage(props: PageProps<"/lancamentos/[id]">) {
  return (
    <Suspense fallback={<LoadingCard />}>
      <TransactionDetail {...props} />
    </Suspense>
  );
}
