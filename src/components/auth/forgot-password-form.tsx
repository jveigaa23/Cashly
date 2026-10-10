"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { forgotPasswordAction } from "@/server/auth-actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  return (
    <Card>
      <h1 className="text-2xl font-bold">Esqueci minha senha</h1>
      <p className="mt-1 text-muted">Enviaremos um link para você criar uma senha nova.</p>
      <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
        <FormMessage state={state} />
        {state.status === "success" ? null : (
          <>
            <TextField
              label="E-mail da conta"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              defaultValue={state.values?.email}
              errors={state.fieldErrors?.email}
            />
            <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
          </>
        )}
      </form>
      <p className="mt-5 text-center">
        <Link href="/entrar" className="font-semibold text-primary underline underline-offset-4">
          Voltar para entrar
        </Link>
      </p>
    </Card>
  );
}
