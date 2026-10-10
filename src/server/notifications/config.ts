import "server-only";

type Env = Record<string, string | undefined>;

/**
 * Configuração dos canais externos. Tudo opcional: sem as variáveis, o canal
 * fica "não configurado" e a tela diz isso — nunca finge que enviou.
 * Segredos só no servidor; a chave pública VAPID é a única que vai ao navegador.
 */

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfig(env: Env = process.env): PushConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/** Variáveis que faltam para o agendador funcionar (nomes, nunca valores). */
export function schedulerMissing(env: Env = process.env): string[] {
  const missing: string[] = [];
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) missing.push("CRON_SECRET");
  if (!env.SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY");
  if (!pushConfig(env)) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT");
  return missing;
}

export type WhatsAppStatus = { configured: false; reason: string } | { configured: true };

/**
 * WhatsApp Business Platform: exige conta Meta Business verificada, número
 * dedicado, modelos de mensagem aprovados e tem custo por conversa. Sem essas
 * credenciais (e sem decisão da família), o canal fica desativado.
 */
export function whatsappStatus(env: Env = process.env): WhatsAppStatus {
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE_DUE_SOON) {
    // Mesmo com as variáveis, o envio só será ligado depois de cadastrar o
    // número de cada pessoa e aprovar os modelos — ainda não implementado.
    return { configured: false, reason: "Credenciais presentes, mas o envio por WhatsApp ainda não foi ativado no Cashly." };
  }
  return { configured: false, reason: "Não configurado." };
}
