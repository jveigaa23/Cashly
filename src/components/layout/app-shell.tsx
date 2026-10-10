import Image from "next/image";
import Link from "next/link";
import { ConnectionStatus } from "@/components/pwa/connection-status";
import { ThemeQuickToggle } from "@/components/theme/theme-quick-toggle";
import { BottomNav, SettingsLink, SideNav } from "./app-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-xl bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-h-12 items-center gap-2 rounded-xl font-bold">
            <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="rounded-lg" priority />
            <span className="text-xl">Cashly</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeQuickToggle />
            <SettingsLink />
          </div>
        </div>
        <ConnectionStatus />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 pb-28 pt-4 md:pb-8">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-24">
            <SideNav />
          </div>
        </aside>
        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
