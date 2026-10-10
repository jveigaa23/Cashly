import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BillForm } from "@/components/finance/bill-form";
import { LoadingCard } from "@/components/layout/loading-card";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { formatAmountInput, formatBRL } from "@/lib/format/money";
import { formatRate, parseRate } from "@/domain/rates";
import { updateBillAction } from "@/server/finance/actions";
import { getBill, listCategories } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Editar conta" };

function rateInput(value: string): string {
  const micro = parseRate(value) ?? 0n;
  return micro === 0n ? "" : formatRate(micro);
}

async function EditBill({ params }: { params: PageProps<"/contas/[id]/editar">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const membership = await requireMember();
  const [bill, categories] = await Promise.all([getBill(id, todayFor(membership)), listCategories("expense")]);
  if (!bill) notFound();

  return (
    <>
      <div className="mb-5">
        <Link href={`/contas/${bill.id}`} className="font-semibold text-primary underline underline-offset-4">
          ← {bill.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Editar conta</h1>
      </div>
      {bill.status === "canceled" ? (
        <Notice tone="warning" title="Conta cancelada">Contas canceladas não podem ser alteradas.</Notice>
      ) : (
        <Card>
          {bill.recurrence ? (
            <Notice title="Conta que se repete" className="mb-4">
              A alteração vale só para esta conta. As próximas seguem o cadastro da repetição.
            </Notice>
          ) : null}
          {bill.summary.paidPrincipalCents > 0 ? (
            <Notice title="Esta conta já tem pagamentos" className="mb-4">
              O valor não pode ficar abaixo do já pago ({formatBRL(bill.summary.paidPrincipalCents)}).
            </Notice>
          ) : null}
          <BillForm
            action={updateBillAction.bind(null, bill.id)}
            categories={categories}
            initial={{
              name: bill.name,
              amount: formatAmountInput(bill.originalCents),
              dueDate: bill.dueDate,
              categoryId: bill.categoryId ?? "",
              description: bill.description ?? "",
              finePercent: rateInput(bill.finePercent),
              interestRate: rateInput(bill.interestRate),
              interestPeriod: bill.interestPeriod ?? "",
              interestBasis: bill.interestBasis,
            }}
            submitLabel="Salvar alterações"
          />
        </Card>
      )}
    </>
  );
}

export default function EditBillPage({ params }: PageProps<"/contas/[id]/editar">) {
  return (
    <Suspense fallback={<LoadingCard />}>
      <EditBill params={params} />
    </Suspense>
  );
}
