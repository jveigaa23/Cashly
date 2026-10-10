import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-muted">O endereço pode ter mudado ou não existe.</p>
      <Link href="/" className={buttonClasses()}>
        Voltar ao início
      </Link>
    </main>
  );
}
