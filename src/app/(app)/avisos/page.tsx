import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SimpleAction } from "@/components/finance/simple-action";
import { LoadingCard } from "@/components/layout/loading-card";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon, BellIcon, ChartIcon, ClockIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/format/date";
import { markAllReadAction, markNotificationReadAction } from "@/server/notifications/actions";
import { listNotifications, refreshNotifications, type NotificationItem } from "@/server/notifications/queries";
import { requireMember, todayFor } from "@/server/session";

export const metadata: Metadata = { title: "Avisos" };

const ICONS = { due_soon: ClockIcon, installment: ClockIcon, overdue: AlertIcon, budget: ChartIcon } as const;

function Item({ n, timezone }: { n: NotificationItem; timezone: string }) {
  const Icon = ICONS[n.event];
  return (
    <li className="flex gap-3 py-3">
      <Icon className={n.event === "overdue" && !n.resolved ? "mt-1 shrink-0 text-danger" : "mt-1 shrink-0 text-muted"} />
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold">
          {n.unread ? <span className="sr-only">Não lido: </span> : null}
          {n.title}
        </p>
        <p className={n.resolved ? "text-muted" : undefined}>{n.body}</p>
        <p className="text-sm text-muted">Aviso de {formatDateTime(n.createdAt, timezone)}</p>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          {!n.gone ? (
            <Link href={n.href} className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4">
              Abrir
            </Link>
          ) : null}
          {n.unread ? <SimpleAction action={markNotificationReadAction.bind(null, n.id)} label="Marcar como lido" pendingText="Marcando…" /> : null}
        </div>
      </div>
    </li>
  );
}

async function Feed() {
  const membership = await requireMember();
  await refreshNotifications();
  const items = await listNotifications(todayFor(membership));
  const unread = items.filter((n) => n.unread);
  const read = items.filter((n) => !n.unread);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<BellIcon />}
          title="Nenhum aviso por enquanto"
          description="Avisamos aqui quando uma conta ou parcela estiver perto de vencer ou vencida, e quando um limite do orçamento estiver perto de acabar."
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card aria-labelledby="nao-lidos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="nao-lidos">Não lidos ({unread.length})</CardTitle>
          {unread.length > 1 ? <SimpleAction action={markAllReadAction} label="Marcar todos como lidos" pendingText="Marcando…" /> : null}
        </div>
        {unread.length === 0 ? (
          <p className="mt-2 text-muted">Tudo em dia. Nenhum aviso novo.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {unread.map((n) => <Item key={n.id} n={n} timezone={membership.timezone} />)}
          </ul>
        )}
      </Card>
      {read.length > 0 ? (
        <Card aria-labelledby="lidos">
          <CardTitle id="lidos">Lidos nos últimos 30 dias</CardTitle>
          <ul className="mt-1 divide-y divide-border">
            {read.map((n) => <Item key={n.id} n={n} timezone={membership.timezone} />)}
          </ul>
        </Card>
      ) : null}
      <p className="text-sm text-muted">
        Avisos de conta paga ou cancelada saem sozinhos da lista de não lidos. Escolha o que avisar em{" "}
        <Link href="/ajustes#avisos" className="font-semibold text-primary underline underline-offset-4">Ajustes</Link>.
      </p>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold sm:text-3xl">Avisos</h1>
        <p className="mt-1 text-muted">Contas a vencer, vencidas, parcelas e orçamento.</p>
      </div>
      <Suspense fallback={<LoadingCard label="Carregando avisos…" />}>
        <Feed />
      </Suspense>
    </>
  );
}
