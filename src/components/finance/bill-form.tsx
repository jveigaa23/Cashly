"use client";

import { useActionState, useState } from "react";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import type { Option } from "@/server/finance/queries";

export interface BillFormValues {
  name: string;
  amount: string;
  dueDate: string;
  categoryId: string;
  description: string;
  finePercent: string;
  interestRate: string;
  interestPeriod: string;
  interestBasis: string;
}

export function BillForm({
  action,
  categories,
  initial,
  submitLabel,
  allowRepeat = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  categories: Option[];
  initial: BillFormValues;
  submitLabel: string;
  /** Só na criação: permite repetir todo mês/ano. */
  allowRepeat?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [requestId] = useState(() => crypto.randomUUID());
  const v = { repeat: "", repeatUntil: "", ...initial, ...state.values };
  const e = state.fieldErrors ?? {};
  const chargesOpen = Boolean(v.finePercent || v.interestRate || e.finePercent || e.interestRate || e.interestPeriod);
  const [repeat, setRepeat] = useState(v.repeat);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <FormMessage state={state} />
      <TextField label="Nome da conta" name="name" placeholder="Ex.: Conta de luz" required defaultValue={v.name} errors={e.name} />
      <TextField
        label="Valor (R$)"
        name="amount"
        inputMode="decimal"
        placeholder="0,00"
        hint="Use vírgula para os centavos. Ex.: 189,90"
        required
        defaultValue={v.amount}
        errors={e.amount}
      />
      <TextField label={allowRepeat ? "Vencimento (o primeiro, se repetir)" : "Vencimento"} name="dueDate" type="date" required defaultValue={v.dueDate} errors={e.dueDate} />
      <SelectField
        label="Categoria"
        name="categoryId"
        emptyLabel="Sem categoria"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={v.categoryId}
        errors={e.categoryId}
      />

      {allowRepeat ? (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-border p-3">
          <SelectField
            label="Repetir esta conta"
            name="repeat"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            options={[
              { value: "", label: "Não repetir (conta única)" },
              { value: "monthly", label: "Todo mês, no mesmo dia" },
              { value: "yearly", label: "Todo ano, na mesma data" },
            ]}
            errors={e.repeat}
          />
          {repeat ? (
            <TextField
              label="Repetir até (opcional)"
              name="repeatUntil"
              type="date"
              hint="Deixe em branco para repetir sem data para acabar. Dia 31 cai no último dia dos meses mais curtos."
              defaultValue={v.repeatUntil}
              errors={e.repeatUntil}
            />
          ) : (
            <input type="hidden" name="repeatUntil" value="" />
          )}
        </div>
      ) : (
        <>
          <input type="hidden" name="repeat" value="" />
          <input type="hidden" name="repeatUntil" value="" />
        </>
      )}

      <details open={chargesOpen} className="rounded-xl border-2 border-border p-3">
        <summary className="min-h-10 cursor-pointer font-semibold">Multa e juros por atraso (opcional)</summary>
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-sm text-muted">
            Copie do boleto ou contrato. O Cashly só faz uma <strong>estimativa</strong>; o valor oficial é o do credor.
          </p>
          <TextField label="Multa (%)" name="finePercent" inputMode="decimal" placeholder="Ex.: 2" hint="Cobrada uma única vez após o vencimento." defaultValue={v.finePercent} errors={e.finePercent} />
          <TextField label="Juros (%)" name="interestRate" inputMode="decimal" placeholder="Ex.: 1 ou 0,033" defaultValue={v.interestRate} errors={e.interestRate} />
          <SelectField
            label="Os juros são"
            name="interestPeriod"
            emptyLabel="Escolha"
            options={[
              { value: "monthly", label: "Ao mês (proporcional por dia)" },
              { value: "daily", label: "Ao dia" },
            ]}
            defaultValue={v.interestPeriod}
            errors={e.interestPeriod}
          />
          <SelectField
            label="Calcular sobre"
            name="interestBasis"
            options={[
              { value: "original", label: "O valor original da conta" },
              { value: "outstanding", label: "O que ainda falta pagar" },
            ]}
            defaultValue={v.interestBasis || "original"}
          />
        </div>
      </details>

      <TextField label="Observação (opcional)" name="description" defaultValue={v.description} errors={e.description} />
      <SubmitButton pendingText="Salvando…">{submitLabel}</SubmitButton>
    </form>
  );
}
