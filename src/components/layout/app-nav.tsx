"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SettingsIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { BOTTOM_NAV_ITEMS, NAV_ITEMS, isActive } from "./nav-items";

/**
 * Com `pathname` fixo (fallback do Suspense, sem página destacada) não lê a
 * URL; caso contrário usa usePathname(). A regra dos hooks é respeitada
 * porque cada instância usa sempre o mesmo caminho.
 */
function usePathnameSafe(fixed: string | undefined): string {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return fixed ?? usePathname();
}

/** Navegação inferior fixa (celular). Sem `pathname`, lê a rota atual. */
export function BottomNav({ pathname: fixed }: { pathname?: string } = {}) {
  const pathname = usePathnameSafe(fixed);
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4 max-[279px]:grid-cols-2">
        {BOTTOM_NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-center text-xs font-medium",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <Icon />
                {/* Fonte grande do celular: o rótulo quebra (com hífen) em vez de vazar. */}
                <span className={cn("max-w-full hyphens-auto [overflow-wrap:anywhere]", active && "font-bold underline underline-offset-4")}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Navegação lateral (tablet e computador). */
export function SideNav({ pathname: fixed }: { pathname?: string } = {}) {
  const pathname = usePathnameSafe(fixed);
  return (
    <nav aria-label="Navegação principal" className="hidden md:block">
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium",
                  active
                    ? "bg-surface-muted font-bold text-primary"
                    : "text-foreground hover:bg-surface-muted",
                )}
              >
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Atalho para Ajustes no cabeçalho (apenas celular). */
export function SettingsLink({ pathname: fixed }: { pathname?: string } = {}) {
  const pathname = usePathnameSafe(fixed);
  const active = isActive(pathname, "/ajustes");
  return (
    <Link
      href="/ajustes"
      aria-label="Ajustes"
      title="Ajustes"
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex size-12 items-center justify-center rounded-xl hover:bg-surface-muted md:hidden",
        active ? "bg-surface-muted text-primary" : "text-foreground",
      )}
    >
      <SettingsIcon />
    </Link>
  );
}
