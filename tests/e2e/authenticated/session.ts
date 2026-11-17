import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { E2E_SITE_URL, e2eNeon } from "../../../scripts/e2e-config.ts";

/**
 * Contas criadas na hora, na branch de TESTE do Neon (dados descartáveis).
 * Nunca usa contas reais.
 */
export interface Account {
  email: string;
  password: string;
  name: string;
  /** JWT do Neon Auth (15 min), para preparar dados direto no Data API. */
  token: string;
}

/** Cadastro direto no Neon Auth; devolve o JWT da sessão criada. */
export async function createAccount({ name = "Teste", family = true }: { name?: string; family?: boolean } = {}): Promise<Account> {
  const { authUrl, dataApiUrl } = e2eNeon();
  const email = `e2e-${randomUUID()}@exemplo.test`;
  const password = `Senha-${randomUUID().slice(0, 8)}`;
  const res = await fetch(`${authUrl}/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: E2E_SITE_URL },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) throw new Error(`sign-up falhou: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("session_token"))
    .join("; ");
  const tokenRes = await fetch(`${authUrl}/token`, { headers: { Cookie: cookie, Origin: E2E_SITE_URL } });
  if (!tokenRes.ok) throw new Error(`token falhou: ${tokenRes.status} ${await tokenRes.text()}`);
  const { token } = (await tokenRes.json()) as { token: string };
  if (family) {
    const rpc = await fetch(`${dataApiUrl}/rpc/create_household`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_name: `Família ${name}`, p_display_name: name }),
    });
    if (!rpc.ok) throw new Error(`create_household falhou: ${rpc.status} ${await rpc.text()}`);
  }
  return { email, password, name, token };
}

export async function signIn(page: Page, account: Pick<Account, "email" | "password">, expectHome = true) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  if (expectHome) await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
}
