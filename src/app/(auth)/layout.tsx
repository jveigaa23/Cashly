import Image from "next/image";
import { ConnectionStatus } from "@/components/pwa/connection-status";
import { ThemeQuickToggle } from "@/components/theme/theme-quick-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <Image src="/icons/icon-192.png" alt="" width={48} height={48} className="rounded-xl" priority />
        <div className="flex-1">
          <p className="text-2xl font-bold">Cashly</p>
          <p className="text-muted">Finanças da família</p>
        </div>
        <ThemeQuickToggle />
      </div>
      <ConnectionStatus />
      {children}
    </main>
  );
}
