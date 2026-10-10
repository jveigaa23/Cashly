import { Card, CardTitle } from "@/components/ui/card";
import { decimalToCents, formatAmountInput } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/server/errors";
import { requireMember } from "@/server/session";
import { AccountForm } from "./account-form";

/** Contas de registro (carteira, banco…) e seu saldo inicial, base do "Saldo registrado". */
export async function AccountsSection() {
  await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, opening_balance::text, opening_date")
    .is("archived_at", null)
    .order("name");
  if (error) {
    logServerError("AccountsSection", error);
    throw new Error("Não foi possível carregar as contas.");
  }
  return (
    <Card aria-labelledby="contas-titulo" id="contas" className="scroll-mt-20">
      <CardTitle id="contas-titulo">Contas e saldo inicial</CardTitle>
      <p className="mt-1 text-muted">
        O Cashly não se conecta ao banco. O “Saldo registrado” do início é o saldo inicial informado aqui mais o que foi
        recebido e pago no app.
      </p>
      <div className="mt-4 space-y-6">
        {data.map((a) => (
          <section key={a.id} aria-label={`Conta ${a.name}`} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
            <AccountForm
              accountId={a.id}
              name={a.name}
              openingBalance={formatAmountInput(decimalToCents(a.opening_balance))}
              openingDate={a.opening_date ?? ""}
            />
          </section>
        ))}
      </div>
    </Card>
  );
}
