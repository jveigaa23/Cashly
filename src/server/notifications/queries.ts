import "server-only";
import { describeNotification, type NotificationEvent, type NotificationText } from "@/domain/notifications";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "../errors";
import { feedRowToFacts } from "./feed";

/** Gera os avisos internos que faltam e devolve quantos não lidos há. null = falhou. */
export async function refreshNotifications(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("refresh_notifications");
  if (error) {
    logServerError("refresh_notifications", error);
    return null;
  }
  return data;
}

export interface NotificationItem extends NotificationText {
  id: string;
  event: NotificationEvent;
  unread: boolean;
  createdAt: string;
}

/** Avisos internos da pessoa: não lidos + lidos dos últimos 30 dias. */
export async function listNotifications(today: string): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("notification_feed")
    .select("*")
    .eq("channel", "in_app")
    .or(`status.neq.read,created_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    logServerError("listNotifications", error);
    throw new Error("Não foi possível carregar os avisos.");
  }
  return data.map((row) => ({
    id: row.id,
    event: row.event as NotificationEvent,
    unread: row.status !== "read",
    createdAt: row.created_at,
    ...describeNotification(feedRowToFacts(row), today),
  }));
}

export interface PreferenceRow {
  event: NotificationEvent;
  inApp: boolean;
  push: boolean;
  daysBefore: number;
}

export const EVENTS: NotificationEvent[] = ["due_soon", "overdue", "installment", "budget"];

/** Preferências efetivas (padrão: interno e push ligados, 3 dias). */
export async function loadPreferences(): Promise<PreferenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_preferences").select("channel, event, enabled, days_before");
  if (error) {
    logServerError("loadPreferences", error);
    throw new Error("Não foi possível carregar as preferências de aviso.");
  }
  return EVENTS.map((event) => {
    const of = (channel: string) => data.find((p) => p.event === event && p.channel === channel);
    return {
      event,
      inApp: of("in_app")?.enabled ?? true,
      push: of("push")?.enabled ?? true,
      daysBefore: of("in_app")?.days_before ?? of("push")?.days_before ?? 3,
    };
  });
}

export async function countDevices(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).is("expired_at", null);
  if (error) {
    logServerError("countDevices", error);
    return 0;
  }
  return count ?? 0;
}
