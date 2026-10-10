import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/server/auth-actions";
import { requireUser } from "@/server/session";

export async function AccountSection() {
  const user = await requireUser();
  return (
    <Card aria-labelledby="conta">
      <CardTitle id="conta">Sua conta</CardTitle>
      <p className="mt-2 break-all">{user.email}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/redefinir-senha" className={buttonClasses({ variant: "secondary" })}>
          Alterar senha
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={buttonClasses({ variant: "ghost" })}>
            Sair desta conta
          </button>
        </form>
      </div>
    </Card>
  );
}
