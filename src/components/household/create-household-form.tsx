"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { createHouseholdAction } from "@/server/household-actions";

export function CreateHouseholdForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState(createHouseholdAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Nome da família"
        name="householdName"
        placeholder="Ex.: Família Silva"
        required
        defaultValue={state.values?.householdName}
        errors={state.fieldErrors?.householdName}
      />
      <TextField
        label="Como você quer ser chamado(a)"
        name="displayName"
        hint="Aparece no histórico de alterações."
        autoComplete="given-name"
        required
        defaultValue={state.values?.displayName ?? defaultName}
        errors={state.fieldErrors?.displayName}
      />
      <SubmitButton pendingText="Criando…">Criar família</SubmitButton>
    </form>
  );
}
