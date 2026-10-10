import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlanForm } from "@/components/finance/plan-form";
import { Card } from "@/components/ui/card";
import { createPlanAction } from "@/server/finance/actions";
import { listCategories } from "@/server/finance/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Novo parcelamento" };

async function NewPlan() {
  const membership = await requireMember();
  const categories = await listCategories("expense");
  return <PlanForm action={createPlanAction} categories={categories} today={todayFor(membership)} />;
}

export default function NewPlanPage() {
  return (
    <>
      <div className="mb-5">
        <Link href="/parcelas" className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4">← Parcelamentos</Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Novo parcelamento</h1>
      </div>
      <Card>
        <Suspense fallback={<p className="text-muted">Carregando…</p>}>
          <NewPlan />
        </Suspense>
      </Card>
    </>
  );
}
