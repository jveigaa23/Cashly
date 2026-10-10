"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  withReason = true,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  /** Pede o motivo (padrão). Desligue para confirmações simples. */
  withReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialFormState);
  // Foco: ao abrir vai para a confirmação; ao voltar, retorna ao botão.
  const titleRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  useEffect(() => {
    if (!toggled.current) return;
    if (open && !withReason) titleRef.current?.focus();
    if (!open) triggerRef.current?.focus();
  }, [open, withReason]);
  const toggle = (value: boolean) => {
    toggled.current = true;
    setOpen(value);
  };

  if (!open) {
    return (
      <Button ref={triggerRef} variant="secondary" onClick={() => toggle(true)} className="text-danger">
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border-2 border-danger bg-danger-bg p-4" noValidate>
      <p ref={titleRef} tabIndex={-1} className="font-semibold focus:outline-none">
        {title}
      </p>
      <p className="text-muted">{description}</p>
      <FormMessage state={state} />
      {withReason ? (
        <TextField label="Motivo" name="reason" required autoFocus defaultValue={state.values?.reason} errors={state.fieldErrors?.reason} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" size="md" pendingText="Aguarde…">
          {confirmLabel}
        </SubmitButton>
        <Button variant="ghost" onClick={() => toggle(false)}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
