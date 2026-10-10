"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { acceptInviteAction } from "@/server/household-actions";

export function AcceptInviteForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, action] = useActionState(acceptInviteAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <TextField
        label="Como você quer ser chamado(a)"
        name="displayName"
        autoComplete="given-name"
        required
        defaultValue={state.values?.displayName ?? defaultName}
        errors={state.fieldErrors?.displayName}
      />
      <SubmitButton pendingText="Entrando na família…">Aceitar convite</SubmitButton>
    </form>
  );
}
