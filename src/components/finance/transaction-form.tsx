"use client";

import { useActionState, useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { PAYMENT_METHODS } from "@/lib/validation/finance";
import type { Option } from "@/server/finance/queries";

export interface TransactionFormValues {
  type: "income" | "expense";
  status: "confirmed" | "planned";
  description: string;
  amount: string;
  occurredOn: string;
  categoryId: string;
  accountId: string;
  paymentMethod: string;
  nature: string;
  notes: string;
}

export function TransactionForm({
  action,
  categories,
  accounts,
  initial,
  submitLabel,
  lockedToPayment = false,
  allowRepeat = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  categories: Option[];
  accounts: Option[];
  initial: TransactionFormValues;
  submitLabel: string;
  /** Despesa gerada por pagamento de conta: só descrição, categoria e observação. */
  lockedToPayment?: boolean;
  /** Só na criação: repetir todo mês (gera previstos). */
  allowRepeat?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [requestId] = useState(() => crypto.randomUUID());
  const v = { ...initial, ...state.values } as TransactionFormValues;
  const isExpense = initial.type === "expense";
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="type" value={initial.type} />
      <input type="hidden" name="requestId" value={requestId} />
      <FormMessage state={state} />

      {lockedToPayment ? (
        <>
          <input type="hidden" name="status" value={initial.status} />
          <input type="hidden" name="amount" value={initial.amount} />
          <input type="hidden" name="occurredOn" value={initial.occurredOn} />
        </>
      ) : (
        <ChoiceGroup
          legend="Situação"
          name="status"
          defaultValue={v.status}
          errors={e.status}
          options={
            isExpense
              ? [
                  { value: "confirmed", label: "Já paguei", hint: "Entra nos gastos do mês." },
                  { value: "planned", label: "Vou pagar (previsto)", hint: "Não é contado como gasto realizado." },
                ]
              : [
                  { value: "confirmed", label: "Já recebi", hint: "Entra nas receitas do mês." },
                  { value: "planned", label: "Vou receber (previsto)", hint: "Não é dinheiro disponível ainda." },
                ]
          }
        />
      )}

      <TextField label="Descrição" name="description" placeholder={isExpense ? "Ex.: Mercado" : "Ex.: Aposentadoria"} required defaultValue={v.description} errors={e.description} />
      {lockedToPayment ? null : (
        <>
          <TextField label="Valor (R$)" name="amount" inputMode="decimal" placeholder="0,00" hint="Use vírgula para os centavos." required defaultValue={v.amount} errors={e.amount} />
          <TextField label="Data" name="occurredOn" type="date" required defaultValue={v.occurredOn} errors={e.occurredOn} />
        </>
      )}
      <SelectField
        label="Categoria"
        name="categoryId"
        emptyLabel="Sem categoria"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={v.categoryId}
        errors={e.categoryId}
      />
      {lockedToPayment ? null : accounts.length > 1 ? (
        <SelectField
          label={isExpense ? "Saiu de qual conta" : "Entrou em qual conta"}
          name="accountId"
          emptyLabel="Não informar"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          defaultValue={v.accountId}
        />
      ) : (
        <input type="hidden" name="accountId" value={v.accountId || accounts[0]?.id || ""} />
      )}
      {isExpense && !lockedToPayment ? (
        <>
          <SelectField
            label="Forma de pagamento (só para registro)"
            name="paymentMethod"
            emptyLabel="Não informar"
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            defaultValue={v.paymentMethod}
          />
          <SelectField
            label="Tipo de despesa"
            name="nature"
            emptyLabel="Não informar"
            options={[
              { value: "fixed", label: "Fixa (todo mês)" },
              { value: "variable", label: "Variável" },
            ]}
            defaultValue={v.nature}
          />
        </>
      ) : (
        <>
          <input type="hidden" name="paymentMethod" value="" />
          <input type="hidden" name="nature" value="" />
        </>
      )}
      <TextField label="Observação (opcional)" name="notes" defaultValue={v.notes} errors={e.notes} />
      {allowRepeat ? (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3">
          <input type="checkbox" name="repeatMonthly" value="on" defaultChecked={state.values?.repeatMonthly === "on"} className="mt-1 size-5 accent-[var(--primary)]" />
          <span>
            <span className="font-semibold">Repetir todo mês</span>
            <span className="block text-sm text-muted">
              Ex.: salário, aposentadoria, aluguel. Cada mês aparece como previsto até você confirmar.
            </span>
          </span>
        </label>
      ) : (
        <input type="hidden" name="repeatMonthly" value="" />
      )}
      <SubmitButton pendingText="Salvando…">{submitLabel}</SubmitButton>
    </form>
  );
}
