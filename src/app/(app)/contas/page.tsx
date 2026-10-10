import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Contas a pagar" };

export default function BillsPage() {
  return (
    <>
      <PageHeader title="Contas a pagar" description="Vencimentos, pagamentos e encargos." />
      <ComingSoon phase={3}>
        Cadastro de contas, registro de pagamentos (inclusive parciais) e
        histórico. Juros e multas estimados chegam na Fase 4.
      </ComingSoon>
    </>
  );
}
