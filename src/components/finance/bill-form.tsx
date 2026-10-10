"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import type { Option } from "@/server/finance/queries";

export interface BillFormValues {
  name: string;
  amount: string;
  dueDate: string;
  categoryId: string;
  description: string;
}

export function BillForm({
  action,
  categories,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  categories: Option[];
  initial: BillFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const v = { ...initial, ...state.values };
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField label="Nome da conta" name="name" placeholder="Ex.: Conta de luz" required defaultValue={v.name} errors={state.fieldErrors?.name} />
      <TextField
        label="Valor (R$)"
        name="amount"
        inputMode="decimal"
        placeholder="0,00"
        hint="Use vírgula para os centavos. Ex.: 189,90"
        required
        defaultValue={v.amount}
        errors={state.fieldErrors?.amount}
      />
      <TextField label="Vencimento" name="dueDate" type="date" required defaultValue={v.dueDate} errors={state.fieldErrors?.dueDate} />
      <SelectField
        label="Categoria"
        name="categoryId"
        emptyLabel="Sem categoria"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={v.categoryId}
        errors={state.fieldErrors?.categoryId}
      />
      <TextField label="Observação (opcional)" name="description" defaultValue={v.description} errors={state.fieldErrors?.description} />
      <SubmitButton pendingText="Salvando…">{submitLabel}</SubmitButton>
    </form>
  );
}
