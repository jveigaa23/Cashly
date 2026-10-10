"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { updatePasswordAction } from "@/server/auth-actions";

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initialFormState);
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Link href="/" className={buttonClasses({ size: "lg" })}>
          Ir para o início
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}
        required
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Repita a nova senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
