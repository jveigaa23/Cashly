import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/server/errors";

/**
 * Destino dos links enviados por e-mail (confirmação de conta e recuperação
 * de senha). Troca o código por uma sessão e segue para `next` (só interno).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) logServerError("auth/callback code", error);
    ok = !error;
  } else if (tokenHash && (type === "signup" || type === "email" || type === "recovery" || type === "invite")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) logServerError("auth/callback otp", error);
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/entrar?erro=link", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
