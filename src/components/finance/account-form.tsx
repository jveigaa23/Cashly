"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { updateAccountAction } from "@/server/finance/budget-actions";

type Props = { accountId: string; name: string; openingBalance: string; openingDate: string };

export function AccountForm({ accountId, name, openingBalance, openingDate }: Props) {
  const [state, action] = useActionState(updateAccountAction.bind(null, accountId), initialFormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField label="Nome" name="name" required defaultValue={v.name ?? name} errors={state.fieldErrors?.name} />
      <TextField
        label="Saldo inicial (R$)"
        name="openingBalance"
        inputMode="decimal"
        placeholder="0,00"
        defaultValue={v.openingBalance ?? openingBalance}
        hint="Quanto havia nessa conta no dia abaixo. Use 0 se não quiser informar."
        errors={state.fieldErrors?.openingBalance}
      />
      <TextField
        label="Dia em que o saldo foi conferido"
        name="openingDate"
        type="date"
        defaultValue={v.openingDate ?? openingDate}
        hint="Lançamentos anteriores a esse dia não mudam o saldo desta conta."
        errors={state.fieldErrors?.openingDate}
      />
      <SubmitButton pendingText="Salvando…">Salvar conta</SubmitButton>
    </form>
  );
}
