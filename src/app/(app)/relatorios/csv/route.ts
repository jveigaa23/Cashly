import { NextResponse, type NextRequest } from "next/server";
import { parsePeriod } from "@/domain/reports";
import { toCsv, csvMoney, type CsvCell } from "@/lib/csv";
import { formatCalendarDate } from "@/lib/format/date";
import { loadPeriodReport } from "@/server/finance/reports";
import { getMembership, todayFor } from "@/server/session";

/** Planilha do período: resumo + todos os lançamentos não cancelados. */
export async function GET(request: NextRequest) {
  const membership = await getMembership();
  if (!membership) return new NextResponse("Não autorizado", { status: 401 });
  const period = parsePeriod(request.nextUrl.searchParams.get("periodo") ?? "");
  if (!period) return new NextResponse("Período inválido", { status: 400 });

  const r = await loadPeriodReport(period, todayFor(membership));
  const rows: CsvCell[][] = [
    ["Cashly — relatório", period.label],
    [],
    ["Resumo", "Valor (R$)"],
    ["Receitas recebidas", csvMoney(r.sum.incomeCents)],
    ["Despesas pagas", csvMoney(r.sum.expenseCents)],
    ["Resultado", csvMoney(r.sum.resultCents)],
    ["Receitas previstas (fora do resultado)", csvMoney(r.sum.plannedIncomeCents)],
    ["Despesas previstas (fora do resultado)", csvMoney(r.sum.plannedExpenseCents)],
    [],
    ["Data", "Tipo", "Situação", "Descrição", "Categoria", "Forma de pagamento", "Valor (R$)"],
    ...r.transactions.map((t) => [
      formatCalendarDate(t.occurredOn),
      t.type === "income" ? "Receita" : "Despesa",
      t.status === "planned" ? "Prevista" : t.type === "income" ? "Recebida" : "Paga",
      t.description,
      t.categoryName ?? "Sem categoria",
      t.paymentMethod ?? "",
      csvMoney(t.amountCents),
    ]),
  ];

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cashly-${period.key}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
