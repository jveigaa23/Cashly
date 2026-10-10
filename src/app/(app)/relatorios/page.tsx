import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Relatórios" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Relatórios" description="Mensal, trimestral e anual." />
      <ComingSoon phase={5}>
        Relatórios de receitas e despesas, gastos por categoria, orçamento
        versus realizado e exportação em CSV.
      </ComingSoon>
    </>
  );
}
