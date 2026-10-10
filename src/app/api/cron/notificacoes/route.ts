import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/server/notifications/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfig, schedulerMissing } from "@/server/notifications/config";
import { dispatchPush } from "@/server/notifications/dispatch";

/**
 * Agendador de avisos push (Vercel Cron, 1x por dia). Protegido por
 * CRON_SECRET (cabeçalho Authorization: Bearer ...). Sem configuração,
 * responde 503 dizendo o que falta — nunca finge que enviou.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const missing = schedulerMissing();
  const db = createAdminClient();
  const config = pushConfig();
  if (missing.length > 0 || !db || !config) {
    return NextResponse.json({ status: "not_configured", missing }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await dispatchPush(db, config);
    return NextResponse.json({ status: "ok", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
