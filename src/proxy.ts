import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { isGuestOnlyPath, isPublicPath } from "@/lib/auth/routes";

/**
 * Renova a sessão (cookies do Neon Auth) a cada requisição e protege as rotas:
 * sem login → /entrar?next=...; já logado em /entrar → início.
 * A autorização fina (família, papel) é verificada de novo no servidor
 * em cada página/ação e pelo RLS do banco.
 *
 * O middleware do Neon Auth decide se há sessão válida: com sessão, deixa
 * passar (e renova os cookies); sem sessão, responde com um redirecionamento.
 * Aqui ele roda em modo "tudo protegido" e a decisão de rota é nossa.
 */
const CHECK_LOGIN_URL = "/__sem-sessao";

let checkSession: ((request: NextRequest) => Promise<Response>) | undefined;

function isRedirect(response: Response) {
  return response.status >= 300 && response.status < 400 && response.headers.has("location");
}

function redirectTo(request: NextRequest, path: string, from: Response) {
  const url = request.nextUrl.clone();
  const [p, q] = path.split("?");
  url.pathname = p;
  url.search = q ? `?${q}` : "";
  const redirect = NextResponse.redirect(url);
  // Mantém os cookies renovados (ou limpos) pelo Neon Auth.
  from.headers.getSetCookie().forEach((cookie) => redirect.headers.append("Set-Cookie", cookie));
  return redirect;
}

export async function proxy(request: NextRequest) {
  checkSession ??= auth().middleware({ loginUrl: CHECK_LOGIN_URL });
  const result = await checkSession(request);
  const signedIn = !isRedirect(result);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return redirectTo(request, pathname === "/" ? "/entrar" : `/entrar?next=${next}`, result);
  }
  if (signedIn && isGuestOnlyPath(pathname)) {
    return redirectTo(request, "/", result);
  }

  const response = signedIn ? result : NextResponse.next();
  if (!signedIn) result.headers.getSetCookie().forEach((cookie) => response.headers.append("Set-Cookie", cookie));
  // Páginas com dados da família nunca devem ir para caches compartilhados.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos estáticos, ícones, manifest, SW, página offline e o
    // agendador (protegido por CRON_SECRET, sem sessão de usuário) e o
    // .well-known (vínculo do app Android, público por definição).
    "/((?!_next/static|_next/image|api/cron/|\\.well-known/|icons/|manifest.webmanifest|sw.js|offline.html|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
