import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CreateHouseholdForm } from "@/components/household/create-household-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getMembership, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Bem-vindo" };

async function Onboarding() {
  const user = await requireUser();
  if (await getMembership()) redirect("/");
  return (
    <>
      <Card aria-labelledby="criar-familia">
        <CardTitle id="criar-familia">Começar uma família nova</CardTitle>
        <p className="mb-4 mt-1 text-muted">
          Para quem vai organizar as contas. Depois você convida os outros
          responsáveis.
        </p>
        <CreateHouseholdForm defaultName={user.name} />
      </Card>
      <Notice title="Recebeu um convite?">
        Abra o link do convite que mandaram para você. Use este mesmo e-mail:{" "}
        <strong>{user.email}</strong>.
      </Notice>
    </>
  );
}

export default function WelcomePage() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-3xl font-bold">Bem-vindo ao Cashly</h1>
      <Suspense fallback={<p className="text-muted">Carregando…</p>}>
        <Onboarding />
      </Suspense>
    </main>
  );
}
