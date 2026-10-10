import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Lançamentos" };

export default function TransactionsPage() {
  return (
    <>
      <PageHeader title="Lançamentos" description="Receitas e despesas da família." />
      <ComingSoon phase={3}>
        Registro de receitas e despesas, com filtros por mês, categoria e
        descrição. Parcelamentos chegam na Fase 4.
      </ComingSoon>
    </>
  );
}
