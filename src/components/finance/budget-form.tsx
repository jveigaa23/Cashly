"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { saveBudgetAction } from "@/server/finance/budget-actions";
import type { Option } from "@/server/finance/queries";

export function BudgetForm({ month, categories }: { month: string; categories: Option[] }) {
  const [state, action] = useActionState(saveBudgetAction, initialFormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="month" value={month} />
      <FormMessage state={state} />
      <SelectField
        label="Limite para"
        name="categoryId"
        emptyLabel="Todas as despesas (limite geral)"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={v.categoryId ?? ""}
        hint="Se já existir um limite para essa escolha, ele será atualizado."
      />
      <TextField label="Limite do mês (R$)" name="limit" inputMode="decimal" placeholder="0,00" required defaultValue={v.limit} errors={state.fieldErrors?.limit} />
      <TextField
        label="Avisar quando chegar a (%)"
        name="alertPercent"
        inputMode="numeric"
        defaultValue={v.alertPercent ?? "80"}
        hint="Ex.: 80 avisa quando 80% do limite for gasto."
        errors={state.fieldErrors?.alertPercent}
      />
      <SubmitButton pendingText="Salvando…">Salvar limite</SubmitButton>
    </form>
  );
}
