"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SettingsIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { BOTTOM_NAV_ITEMS, NAV_ITEMS, isActive } from "./nav-items";

/** Navegação inferior fixa (celular). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {BOTTOM_NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <Icon />
                <span className={cn(active && "font-bold underline underline-offset-4")}>
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
export function SideNav() {
  const pathname = usePathname();
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
export function SettingsLink() {
  const pathname = usePathname();
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
