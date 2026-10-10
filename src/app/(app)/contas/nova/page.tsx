import type { Metadata } from "next";
import { Suspense } from "react";
import { BillForm } from "@/components/finance/bill-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { createBillAction } from "@/server/finance/actions";
import { listCategories } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Nova conta" };

async function NewBill() {
  const membership = await requireMember();
  const categories = await listCategories("expense");
  return (
    <BillForm
      action={createBillAction}
      categories={categories}
      initial={{
        name: "", amount: "", dueDate: todayFor(membership), categoryId: "", description: "",
        finePercent: "", interestRate: "", interestPeriod: "", interestBasis: "original",
      }}
      submitLabel="Salvar conta"
      allowRepeat
    />
  );
}

export default function NewBillPage() {
  return (
    <>
      <PageHeader title="Nova conta a pagar" description="Contas que se repetem todo mês podem ser cadastradas uma vez só." />
      <Card>
        <Suspense fallback={<p className="text-muted">Carregando…</p>}>
          <NewBill />
        </Suspense>
      </Card>
    </>
  );
}

