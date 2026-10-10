"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, initialFormState, type FormState } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { checkPayment } from "@/domain/bills";
import { formatCalendarDate } from "@/lib/format/date";
import { formatBRL, parseBRL } from "@/lib/format/money";
import { PAYMENT_METHODS } from "@/lib/validation/finance";
import type { Option } from "@/server/finance/queries";

/**
 * Registro de pagamento em duas etapas: preencher → revisar e confirmar.
 * Quitar uma conta é sempre uma ação explícita. O servidor valida de novo.
 */
export function PaymentForm({
  action,
  outstandingCents,
  estimatedChargesCents = 0,
  today,
  accounts,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  outstandingCents: number;
  /** Encargos estimados ainda não pagos (só informativo). */
  estimatedChargesCents?: number;
  today: string;
  accounts: Option[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [review, setReview] = useState<null | { amount: number; charges: number; paidOn: string; method: string }>(null);
  const [localError, setLocalError] = useState<{ field: string; error: string } | null>(null);
  // Um identificador por formulário: reenvios não duplicam o pagamento.
  const [requestId] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  const v = state.values ?? {};
  const errors = (field: string) =>
    localError?.field === field ? [localError.error] : state.fieldErrors?.[field];

  function goToReview() {
    const data = new FormData(formRef.current!);
    const amount = parseBRL(String(data.get("amount") ?? ""));
    const chargesText = String(data.get("charges") ?? "").trim();
    const charges = chargesText === "" ? { ok: true as const, cents: 0 } : parseBRL(chargesText);
    if (!amount.ok) return setLocalError({ field: "amount", error: amount.error });
    if (!charges.ok) return setLocalError({ field: "charges", error: charges.error });
    const paidOn = String(data.get("paidOn") ?? "");
    const check = checkPayment({ status: "pending", outstandingCents, amountCents: amount.cents, chargesCents: charges.cents, paidOn, today });
    if (!check.ok) return setLocalError({ field: check.field, error: check.error });
    setLocalError(null);
    setReview({ amount: amount.cents, charges: charges.cents, paidOn, method: String(data.get("paymentMethod") ?? "") });
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <FormMessage state={state} />
      {localError?.field === "form" ? <Notice tone="danger" role="alert" title={localError.error} /> : null}

      <div className={review ? "hidden" : "flex flex-col gap-4"}>
        <TextField
          label="Valor pago (R$)"
          name="amount"
          inputMode="decimal"
          placeholder="0,00"
          hint={`Falta pagar ${formatBRL(outstandingCents)}. Pode pagar só uma parte.`}
          required
          defaultValue={v.amount ?? ""}
          errors={errors("amount")}
        />
        <TextField
          label="Encargos incluídos no valor (opcional)"
          name="charges"
          inputMode="decimal"
          placeholder="0,00"
          hint={
            estimatedChargesCents > 0
              ? `Juros ou multa pagos junto. Estimativa de hoje: ${formatBRL(estimatedChargesCents)} — confira no boleto.`
              : "Juros ou multa que você pagou junto. Não diminuem o que falta pagar."
          }
          defaultValue={v.charges ?? ""}
          errors={errors("charges")}
        />
        <TextField label="Data do pagamento" name="paidOn" type="date" max={today} required defaultValue={v.paidOn ?? today} errors={errors("paidOn")} />
        <SelectField
          label="Forma de pagamento (só para registro)"
          name="paymentMethod"
          emptyLabel="Não informar"
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          defaultValue={v.paymentMethod ?? ""}
        />
        {accounts.length > 1 ? (
          <SelectField
            label="Saiu de qual conta"
            name="accountId"
            emptyLabel="Não informar"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            defaultValue={v.accountId ?? ""}
          />
        ) : (
          <input type="hidden" name="accountId" value={accounts[0]?.id ?? ""} />
        )}
        <TextField label="Observação (opcional)" name="note" defaultValue={v.note ?? ""} />
        <Button size="lg" onClick={goToReview}>
          Revisar pagamento
        </Button>
      </div>

      {review ? (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-surface-muted p-4" role="group" aria-label="Confirmar pagamento">
          <p className="text-lg font-semibold">Confirme o pagamento</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">Valor pago</dt>
            <dd className="tabular font-semibold">{formatBRL(review.amount)}</dd>
            {review.charges > 0 ? (
              <>
                <dt className="text-muted">Encargos</dt>
                <dd className="tabular">{formatBRL(review.charges)}</dd>
              </>
            ) : null}
            <dt className="text-muted">Data</dt>
            <dd>{formatCalendarDate(review.paidOn)}</dd>
            <dt className="text-muted">Falta depois</dt>
            <dd className="tabular">{formatBRL(outstandingCents - (review.amount - review.charges))}</dd>
          </dl>
          <p className="text-sm text-muted">O Cashly só registra. Nenhum pagamento é feito no banco.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Registrando…">Confirmar pagamento</SubmitButton>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Corrigir
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
