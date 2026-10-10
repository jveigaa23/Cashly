"use client";

import { useActionState, useMemo, useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { buildSchedule, interestFor } from "@/domain/installments";
import { parseRate } from "@/domain/rates";
import { formatCalendarDate } from "@/lib/format/date";
import { formatBRL, parseBRL } from "@/lib/format/money";
import type { Option } from "@/server/finance/queries";

export function PlanForm({
  action,
  categories,
  today,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  categories: Option[];
  today: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [requestId] = useState(() => crypto.randomUUID());
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [draft, setDraft] = useState({
    total: v.total ?? "",
    count: v.count ?? "",
    firstDueDate: v.firstDueDate ?? today,
    method: v.method ?? "none",
    rate: v.rate ?? "",
  });

  // Prévia com a MESMA regra que o banco usa para gerar as parcelas.
  const preview = useMemo(() => {
    const total = parseBRL(draft.total);
    const count = Number(draft.count);
    const rate = draft.method === "none" ? 0n : parseRate(draft.rate || "x");
    if (!total.ok || !Number.isInteger(count) || count < 1 || count > 600 || rate === null) return null;
    try {
      const input = { totalCents: total.cents, count, firstDueDate: draft.firstDueDate, method: draft.method as "none" | "simple_monthly", rateMicro: rate };
      return { schedule: buildSchedule(input), interest: interestFor(input) };
    } catch {
      return null;
    }
  }, [draft]);

  const onChange = (event: React.FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement;
    if (target.name in draft) setDraft((d) => ({ ...d, [target.name]: target.value }));
  };

  return (
    <form action={formAction} onChange={onChange} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <FormMessage state={state} />
      <TextField label="O que foi comprado ou financiado" name="description" placeholder="Ex.: Geladeira, empréstimo consignado" required defaultValue={v.description} errors={e.description} />
      <SelectField
        label="Tipo"
        name="kind"
        options={[
          { value: "purchase", label: "Compra parcelada" },
          { value: "loan", label: "Empréstimo" },
          { value: "other", label: "Outro compromisso" },
        ]}
        defaultValue={v.kind ?? "purchase"}
      />
      <SelectField
        label="Categoria"
        name="categoryId"
        emptyLabel="Sem categoria"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={v.categoryId}
        errors={e.categoryId}
      />
      <TextField label="Valor total (R$)" name="total" inputMode="decimal" placeholder="0,00" hint="Valor da compra ou valor emprestado." required defaultValue={draft.total} errors={e.total} />
      <TextField label="Número de parcelas" name="count" inputMode="numeric" placeholder="Ex.: 10" required defaultValue={draft.count} errors={e.count} />
      <TextField label="Vencimento da 1ª parcela" name="firstDueDate" type="date" required defaultValue={draft.firstDueDate} errors={e.firstDueDate} />
      <ChoiceGroup
        legend="Juros"
        name="method"
        defaultValue={draft.method}
        errors={e.method}
        options={[
          { value: "none", label: "Sem juros", hint: "O total é dividido igualmente." },
          { value: "simple_monthly", label: "Juros simples ao mês", hint: "Juros sobre o valor total pelo número de meses." },
        ]}
      />
      {draft.method === "simple_monthly" ? (
        <TextField label="Taxa de juros ao mês (%)" name="rate" inputMode="decimal" placeholder="Ex.: 1,99" required defaultValue={draft.rate} errors={e.rate} />
      ) : (
        <input type="hidden" name="rate" value="" />
      )}

      <section aria-live="polite" className="rounded-xl border-2 border-border bg-surface-muted p-3">
        <h3 className="font-semibold">Prévia</h3>
        {preview ? (
          <>
            <p className="mt-1">
              {preview.schedule.length}x de <strong className="tabular">{formatBRL(preview.schedule[0].amountCents)}</strong>
              {preview.schedule.length > 1 && preview.schedule.at(-1)!.amountCents !== preview.schedule[0].amountCents
                ? ` (última de ${formatBRL(preview.schedule.at(-1)!.amountCents)})`
                : ""}
            </p>
            {preview.interest > 0 ? <p className="text-sm text-muted">Juros totais estimados: {formatBRL(preview.interest)}</p> : null}
            <p className="text-sm text-muted">
              De {formatCalendarDate(preview.schedule[0].dueDate)} a {formatCalendarDate(preview.schedule.at(-1)!.dueDate)}.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Preencha valor, parcelas e vencimento para ver as parcelas.</p>
        )}
        <p className="mt-2 text-sm text-muted">Confira com o carnê ou contrato. Juros compostos (tabela Price) não são calculados nesta versão.</p>
      </section>

      <SubmitButton pendingText="Salvando…">Salvar parcelamento</SubmitButton>
    </form>
  );
}
