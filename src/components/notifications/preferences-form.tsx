"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { EVENT_LABELS, type NotificationEvent } from "@/domain/notifications";
import { savePreferencesAction } from "@/server/notifications/actions";

type Pref = { event: NotificationEvent; inApp: boolean; push: boolean; daysBefore: number };

export function PreferencesForm({ prefs }: { prefs: Pref[] }) {
  const [state, action] = useActionState(savePreferencesAction, initialFormState);
  const days = prefs[0]?.daysBefore ?? 3;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {prefs.map((p) => (
        <fieldset key={p.event} className="rounded-xl border border-border p-3">
          <legend className="px-1 font-semibold">{EVENT_LABELS[p.event]}</legend>
          <div className="flex flex-wrap gap-x-6">
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name={`in_app:${p.event}`} defaultChecked={p.inApp} className="size-6 accent-[var(--primary)]" />
              No app (sino)
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name={`push:${p.event}`} defaultChecked={p.push} className="size-6 accent-[var(--primary)]" />
              No celular
            </label>
          </div>
        </fieldset>
      ))}
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Avisar quantos dias antes do vencimento</span>
        <select name="daysBefore" defaultValue={String(days)} className="min-h-12 rounded-xl border-2 border-border bg-surface px-3 text-lg">
          {[0, 1, 2, 3, 5, 7, 10, 15].map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "Só no dia" : d === 1 ? "1 dia antes" : `${d} dias antes`}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pendingText="Salvando…">Salvar avisos</SubmitButton>
    </form>
  );
}
