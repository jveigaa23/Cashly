import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isGuestOnlyPath, isPublicPath } from "@/lib/auth/routes";
import { publicEnv } from "@/lib/env";

/**
 * Renova a sessão (cookies) a cada requisição e protege as rotas:
 * sem login → /entrar?next=...; já logado em /entrar → início.
 * A autorização fina (família, papel) é verificada de novo no servidor
 * em cada página/ação e pelo RLS do banco.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Não colocar código entre a criação do cliente e getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    const [p, q] = path.split("?");
    url.pathname = p;
    url.search = q ? `?${q}` : "";
    const redirect = NextResponse.redirect(url);
    // Mantém os cookies de sessão renovados.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!signedIn && !isPublicPath(pathname)) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return redirectTo(pathname === "/" ? "/entrar" : `/entrar?next=${next}`);
  }
  if (signedIn && isGuestOnlyPath(pathname)) {
    return redirectTo("/");
  }

  // Páginas com dados da família nunca devem ir para caches compartilhados.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
