/** Páginas acessíveis sem login (a rota exata e tudo abaixo dela). */
const PUBLIC_ROUTES = ["/entrar", "/cadastro", "/esqueci-senha", "/auth", "/convite"];

/** Páginas só para quem ainda não entrou (quem já entrou vai ao início). */
const GUEST_ONLY_ROUTES = ["/entrar", "/cadastro", "/esqueci-senha"];

const matches = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => matches(pathname, route));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.some((route) => matches(pathname, route));
}

/**
 * Só aceita destinos internos ("/algo"), evitando redirecionamento aberto
 * para outros sites ("//site.com", "https://...", "/\\site.com").
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  try {
    const url = new URL(value, "http://interno.invalid");
    if (url.origin !== "http://interno.invalid") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
