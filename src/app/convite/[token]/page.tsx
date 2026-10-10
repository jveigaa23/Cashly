import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/household/accept-invite-form";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getMembership, getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Convite" };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const here = encodeURIComponent(`/convite/${token}`);
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-3">
        <p>
          Para aceitar, entre com o <strong>mesmo e-mail que recebeu o convite</strong>.
          Se ainda não tem conta, crie uma.
        </p>
        <Link href={`/cadastro?next=${here}`} className={buttonClasses({ size: "lg" })}>
          Criar conta
        </Link>
        <Link href={`/entrar?next=${here}`} className={buttonClasses({ size: "lg", variant: "secondary" })}>
          Já tenho conta — entrar
        </Link>
      </div>
    );
  }

  if (await getMembership()) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="warning" title="Você já participa de uma família">
          Cada conta pode participar de uma família. Se o convite era para
          outra pessoa, saia e entre com a conta dela.
        </Notice>
        <Link href="/" className={buttonClasses({ size: "lg" })}>
          Ir para o início
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        Você está entrando como <strong>{user.email}</strong>.
      </p>
      <AcceptInviteForm token={token} defaultName={user.name} />
    </div>
  );
}

export default function InvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Convite para a família</h1>
        <Suspense fallback={<p className="text-muted">Carregando…</p>}>
          <Invite params={params} />
        </Suspense>
      </Card>
    </main>
  );
}
