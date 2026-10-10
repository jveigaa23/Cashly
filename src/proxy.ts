import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos estáticos, ícones, manifest, SW, página offline e o
    // agendador (protegido por CRON_SECRET, sem sessão de usuário) e o
    // .well-known (vínculo do app Android, público por definição).
    "/((?!_next/static|_next/image|api/cron/|\\.well-known/|icons/|manifest.webmanifest|sw.js|offline.html|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
