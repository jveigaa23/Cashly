"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { signUpAction } from "@/server/auth-actions";

export function SignUpForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(signUpAction, initialFormState);
  const next = params.get("next") ?? "";

  if (state.status === "success") {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Confira seu e-mail</h1>
        <div className="mt-4">
          <FormMessage state={state} />
        </div>
        <p className="mt-4 text-muted">Não chegou? Veja a pasta de spam ou lixo eletrônico.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold">Criar conta</h1>
      <p className="mt-1 text-muted">Cada pessoa da família usa a própria conta.</p>
      <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />
        <TextField label="Seu nome" name="name" autoComplete="given-name" required defaultValue={state.values?.name} errors={state.fieldErrors?.name} />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <TextField
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`Pelo menos ${PASSWORD_MIN} caracteres. Anote em lugar seguro.`}
          required
          errors={state.fieldErrors?.password}
        />
        <TextField
          label="Repita a senha"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          errors={state.fieldErrors?.confirmPassword}
        />
        <SubmitButton pendingText="Criando conta…">Criar conta</SubmitButton>
      </form>
      <p className="mt-5 text-center">
        Já tem conta?{" "}
        <Link href={next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar"} className="font-semibold text-primary underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
