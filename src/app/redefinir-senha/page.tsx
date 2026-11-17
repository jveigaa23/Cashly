import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Nova senha" };

/** O link do e-mail traz ?token=... (ou ?error=INVALID_TOKEN se expirou). */
async function Gate({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert">Este link de nova senha expirou ou já foi usado. Peça um novo.</p>
        <Link href="/esqueci-senha" className="font-semibold text-primary underline underline-offset-4">
          Pedir novo link
        </Link>
      </div>
    );
  }
  if (token) return <NewPasswordForm token={token} />;
  await requireUser();
  return <NewPasswordForm />;
}

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Criar nova senha</h1>
        <Suspense fallback={<p className="text-muted">Carregando…</p>}>
          <Gate searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}
