"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { createInviteAction, type InviteState } from "@/server/household-actions";

const initial: InviteState = { status: "idle" };

export function InviteForm() {
  const [state, action] = useActionState(createInviteAction, initial);
  const [copied, setCopied] = useState(false);

  if (state.status === "success" && state.link) {
    const link = state.link;
    const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <p>
          Convite para <strong>{state.email}</strong>. O link só aparece agora:
          copie ou compartilhe antes de sair desta tela.
        </p>
        <input
          readOnly
          value={link}
          aria-label="Link do convite"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-12 w-full rounded-xl border-2 border-border bg-surface-muted px-3 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {canShare ? (
            <Button
              onClick={() =>
                navigator.share({ title: "Convite do Cashly", text: "Entre na nossa família no Cashly:", url: link }).catch(() => {})
              }
            >
              Compartilhar
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Link copiado" : "Copiar link"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <TextField
        label="E-mail da pessoa"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        hint="Ela precisará entrar no Cashly com este mesmo e-mail."
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <SubmitButton pendingText="Criando convite…">Criar convite</SubmitButton>
    </form>
  );
}
