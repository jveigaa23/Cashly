import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TransactionForm } from "@/components/finance/transaction-form";
import { LoadingCard } from "@/components/layout/loading-card";
import { Card } from "@/components/ui/card";
import { createTransactionAction } from "@/server/finance/actions";
import { listAccounts, listCategories } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Novo lançamento" };

async function NewTransaction({ searchParams }: { searchParams: PageProps<"/lancamentos/novo">["searchParams"] }) {
  const params = await searchParams;
  const type = params.tipo === "receita" ? "income" : "expense";
  const membership = await requireMember();
  const [categories, accounts] = await Promise.all([listCategories(type), listAccounts()]);

  return (
    <>
      <div className="mb-5">
        <Link href="/lancamentos" className="font-semibold text-primary underline underline-offset-4">← Lançamentos</Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{type === "income" ? "Nova receita" : "Nova despesa"}</h1>
        {type === "expense" ? (
          <p className="mt-1 text-muted">
            Pagando uma conta cadastrada? Use “Registrar pagamento” na conta, para não contar duas vezes.
          </p>
        ) : null}
      </div>
      <Card>
        <TransactionForm
          action={createTransactionAction}
          categories={categories}
          accounts={accounts}
          initial={{
            type,
            status: "confirmed",
            description: "",
            amount: "",
            occurredOn: todayFor(membership),
            categoryId: "",
            accountId: "",
            paymentMethod: "",
            nature: "",
            notes: "",
          }}
          submitLabel={type === "income" ? "Salvar receita" : "Salvar despesa"}
        />
      </Card>
    </>
  );
}

export default function NewTransactionPage({ searchParams }: PageProps<"/lancamentos/novo">) {
  return (
    <Suspense fallback={<LoadingCard />}>
      <NewTransaction searchParams={searchParams} />
    </Suspense>
  );
}
