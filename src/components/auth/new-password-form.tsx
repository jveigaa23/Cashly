"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { changePasswordAction, resetPasswordAction } from "@/server/auth-actions";

/**
 * Duas situações:
 * - com `token` (veio do link do e-mail): cria a senha sem estar logado;
 * - sem `token` (Ajustes → Alterar senha): exige a senha atual.
 */
export function NewPasswordForm({ token }: { token?: string }) {
  const [state, action] = useActionState(token ? resetPasswordAction : changePasswordAction, initialFormState);
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Link href={token ? "/entrar" : "/"} className={buttonClasses({ size: "lg" })}>
          {token ? "Entrar" : "Ir para o início"}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {token ? (
        <input type="hidden" name="token" value={token} />
      ) : (
        <TextField
          label="Senha atual"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.currentPassword}
        />
      )}
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
