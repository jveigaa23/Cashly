"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/form-message";
import { createClient } from "@/lib/supabase/server";
import { logServerError, rpcErrorMessage } from "../errors";
import { requireMember } from "../session";
import { pushConfig } from "./config";
import { sendPush } from "./push";
import { EVENTS } from "./queries";

function refreshShell() {
  revalidatePath("/", "layout");
}

export async function markNotificationReadAction(id: string): Promise<FormState> {
  await requireMember();
  if (!z.uuid().safeParse(id).success) return { status: "error", message: "Aviso inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("notification_deliveries").update({ status: "read", read_at: new Date().toISOString() }).eq("id", id).neq("status", "read");
  if (error) {
    logServerError("markRead", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  refreshShell();
  return { status: "success" };
}

export async function markAllReadAction(): Promise<FormState> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_deliveries")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("channel", "in_app")
    .neq("status", "read");
  if (error) {
    logServerError("markAllRead", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  refreshShell();
  return { status: "success", message: "Todos os avisos foram marcados como lidos." };
}

const daysSchema = z.coerce.number().int().min(0).max(30);

/** Preferências da própria pessoa (household/member vêm da sessão, nunca do formulário). */
export async function savePreferencesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const membership = await requireMember();
  const days = daysSchema.safeParse(form.get("daysBefore") ?? "3");
  if (!days.success) return { status: "error", message: "Escolha de 0 a 30 dias.", fieldErrors: { daysBefore: ["Escolha de 0 a 30 dias."] } };
  const rows = EVENTS.flatMap((event) =>
    (["in_app", "push"] as const).map((channel) => ({
      household_id: membership.householdId,
      member_id: membership.memberId,
      channel,
      event,
      enabled: form.get(`${channel}:${event}`) === "on",
      days_before: days.data,
    })),
  );
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "member_id,channel,event" });
  if (error) {
    logServerError("savePreferences", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  revalidatePath("/ajustes");
  return { status: "success", message: "Preferências de aviso salvas." };
}

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}={0,2}$/),
  }),
});

export async function registerPushAction(subscription: unknown, userAgent: string): Promise<FormState> {
  await requireMember();
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { status: "error", message: "O navegador devolveu uma inscrição inválida. Tente de novo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) {
    logServerError("registerPush", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  revalidatePath("/ajustes");
  return { status: "success", message: "Avisos ativados neste aparelho." };
}

export async function unregisterPushAction(endpoint: string): Promise<FormState> {
  await requireMember();
  if (!z.url().safeParse(endpoint).success) return { status: "error", message: "Aparelho inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    logServerError("unregisterPush", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  revalidatePath("/ajustes");
  return { status: "success", message: "Avisos desativados neste aparelho." };
}

/** Aviso de teste para os aparelhos da própria pessoa (não usa a chave secreta do banco). */
export async function sendTestPushAction(): Promise<FormState> {
  await requireMember();
  const config = pushConfig();
  if (!config) return { status: "error", message: "Os avisos no celular ainda não foram configurados no servidor." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth_secret").is("expired_at", null);
  if (error) {
    logServerError("testPush subs", error);
    return { status: "error", message: rpcErrorMessage(error) };
  }
  if (data.length === 0) return { status: "error", message: "Nenhum aparelho com avisos ativados." };
  let ok = 0;
  for (const s of data) {
    const r = await sendPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, authSecret: s.auth_secret },
      { title: "Cashly", body: "Aviso de teste: as notificações estão funcionando.", url: "/avisos", tag: "teste" },
      config,
    );
    if (r.ok) ok++;
    else if (r.expired) await supabase.from("push_subscriptions").delete().eq("id", s.id);
  }
  return ok > 0
    ? { status: "success", message: `Aviso de teste enviado para ${ok} ${ok === 1 ? "aparelho" : "aparelhos"}.` }
    : { status: "error", message: "Não foi possível enviar o aviso de teste. Desative e ative de novo neste aparelho." };
}
