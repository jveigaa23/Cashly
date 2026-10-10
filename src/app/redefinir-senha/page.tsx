import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Nova senha" };

async function Gate({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

export default function ResetPasswordPage() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Criar nova senha</h1>
        <Suspense fallback={<p className="text-muted">Carregando…</p>}>
          <Gate>
            <NewPasswordForm />
          </Gate>
        </Suspense>
      </Card>
    </main>
  );
}
