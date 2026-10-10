import { formatCalendarDate, formatDateTime } from "@/lib/format/date";
import { decimalToCents, formatBRL } from "@/lib/format/money";
import type { HistoryEntry } from "@/server/finance/queries";

const ENTITY: Record<string, string> = {
  bills: "a conta",
  bill_payments: "um pagamento",
  transactions: "o lançamento",
  installment_plans: "o parcelamento",
  installments: "uma parcela",
};

const FIELD: Record<string, string> = {
  name: "nome",
  description: "descrição",
  original_amount: "valor",
  expected_amount: "valor da parcela",
  fine_percent: "multa (%)",
  interest_rate: "juros (%)",
  amount: "valor",
  due_date: "vencimento",
  occurred_on: "data",
  category_id: "categoria",
  account_id: "conta",
  status: "situação",
  notes: "observação",
  payment_method: "forma de pagamento",
  nature: "fixa/variável",
  canceled_at: "cancelamento",
  cancel_reason: "motivo do cancelamento",
};

const STATUS: Record<string, string> = {
  pending: "a pagar",
  partially_paid: "paga em parte",
  paid: "paga",
  canceled: "cancelada",
  planned: "prevista",
  confirmed: "realizada",
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vazio";
  if ((field === "amount" || field === "original_amount") && (typeof value === "number" || typeof value === "string")) {
    return formatBRL(decimalToCents(value));
  }
  if ((field === "due_date" || field === "occurred_on") && typeof value === "string") return formatCalendarDate(value);
  if (field === "status" && typeof value === "string") return STATUS[value] ?? value;
  if (field.endsWith("_id")) return "alterada";
  if (field === "canceled_at") return "sim";
  return String(value);
}

function describe(entry: HistoryEntry): string[] {
  if (entry.action === "insert") {
    if (entry.entity === "bill_payments") {
      const amount = entry.changes.amount;
      return [`registrou um pagamento de ${show("amount", amount)}`];
    }
    return [`criou ${ENTITY[entry.entity] ?? "o registro"}`];
  }
  const changes = Object.entries(entry.changes as Record<string, { old: unknown; new: unknown }>)
    .filter(([field]) => FIELD[field] && field !== "canceled_at")
    .map(([field, diff]) =>
      field.endsWith("_id") ? `alterou ${FIELD[field]}` : `alterou ${FIELD[field]}: ${show(field, diff.old)} → ${show(field, diff.new)}`,
    );
  if (entry.entity === "bill_payments" && "canceled_at" in entry.changes) return ["cancelou um pagamento"];
  return changes.length ? changes : [`atualizou ${ENTITY[entry.entity] ?? "o registro"}`];
}

/** Histórico legível (quem, quando, o quê). Dados vêm do audit_log. */
export function HistoryList({ entries, timezone }: { entries: HistoryEntry[]; timezone: string }) {
  if (entries.length === 0) return <p className="text-muted">Sem alterações registradas.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-4 border-border pl-3">
          <p className="text-sm text-muted">
            {formatDateTime(entry.at, timezone)} · {entry.actorName}
          </p>
          {describe(entry).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </li>
      ))}
    </ol>
  );
}
