import Link from "next/link";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Início"
        description="Resumo das finanças da família."
      />

      <div className="space-y-4">
        <ComingSoon phase={5}>
          O painel com saldo registrado, contas a pagar, parcelas e gráficos
          será liberado depois que o cadastro de contas e lançamentos estiver
          pronto. Nenhum valor é exibido aqui até existirem dados reais.
        </ComingSoon>

        <Card aria-labelledby="como-ler">
          <CardTitle id="como-ler">Como o Cashly mostra os valores</CardTitle>
          <ul className="mt-3 space-y-3">
            <li className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="success">Realizado</StatusBadge>
              <span>dinheiro que de fato entrou ou saiu.</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="warning">Pendente</StatusBadge>
              <span>contas que ainda precisam ser pagas.</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="danger">Vencida</StatusBadge>
              <span>contas com vencimento já passado.</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">Previsto</StatusBadge>
              <span>valores futuros — não é dinheiro disponível.</span>
            </li>
          </ul>
        </Card>

        <Link href="/ajustes" className={buttonClasses({ variant: "secondary" })}>
          Instalar o app e escolher a aparência
        </Link>
      </div>
    </>
  );
}
