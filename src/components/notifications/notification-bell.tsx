import Link from "next/link";
import { BellIcon } from "@/components/ui/icons";
import { refreshNotifications } from "@/server/notifications/queries";
import { getMembership } from "@/server/session";

/** Sino do cabeçalho: gera os avisos que faltam e mostra quantos não foram lidos. */
export async function NotificationBell() {
  const membership = await getMembership();
  if (!membership) return null;
  const unread = await refreshNotifications();
  const label = unread ? `Avisos: ${unread} ${unread === 1 ? "não lido" : "não lidos"}` : "Avisos";
  return <BellLink label={label} count={unread ?? 0} />;
}

export function BellLink({ label = "Avisos", count = 0 }: { label?: string; count?: number }) {
  return (
    <Link href="/avisos" aria-label={label} title={label} className="relative inline-flex size-12 items-center justify-center rounded-xl hover:bg-surface-muted">
      <BellIcon />
      {count > 0 ? (
        <span aria-hidden="true" className="tabular absolute right-1 top-1 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-bold leading-5 text-white dark:text-black">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
