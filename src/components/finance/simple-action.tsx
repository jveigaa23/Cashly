"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

/** Botão que executa uma ação sem campos e mostra o erro, se houver. */
export function SimpleAction({ action, label, pendingText = "Aguarde…" }: { action: () => Promise<FormState>; label: string; pendingText?: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="md" pendingText={pendingText}>
        {label}
      </SubmitButton>
    </form>
  );
}
