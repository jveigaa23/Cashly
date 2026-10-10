"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";

/**
 * Ação que exige confirmação explícita e motivo (cancelar conta, pagamento,
 * lançamento). Nada acontece no primeiro toque.
 */
export function ConfirmAction({
  action,
  triggerLabel,
  title,
  description,
  confirmLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialFormState);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="text-danger">
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border-2 border-danger bg-danger-bg p-4" noValidate>
      <p className="font-semibold">{title}</p>
      <p className="text-muted">{description}</p>
      <FormMessage state={state} />
      <TextField label="Motivo" name="reason" required autoFocus defaultValue={state.values?.reason} errors={state.fieldErrors?.reason} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" size="md" pendingText="Cancelando…">
          {confirmLabel}
        </SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
