"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { signInAction } from "@/server/auth-actions";

export function SignInForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(signInAction, initialFormState);
  const next = params.get("next") ?? "";

  return (
    <Card>
      <h1 className="text-2xl font-bold">Entrar</h1>
      {params.get("erro") === "link" ? (
        <Notice tone="warning" title="O link não funcionou" className="mt-4">
          Ele pode ter expirado ou já ter sido usado. Entre com seu e-mail e
          senha, ou peça um novo link.
        </Notice>
      ) : null}
      <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />
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
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
        <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
      </form>
      <div className="mt-5 flex flex-col gap-3 text-center">
        <Link href="/esqueci-senha" className="font-semibold text-primary underline underline-offset-4">
          Esqueci minha senha
        </Link>
        <p>
          Ainda não tem conta?{" "}
          <Link
            href={next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro"}
            className="font-semibold text-primary underline underline-offset-4"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </Card>
  );
}
