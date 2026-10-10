import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from "../../../scripts/local-stack-config.ts";

/**
 * Contas criadas na hora, na pilha Supabase LOCAL (dados descartáveis).
 * Nunca usa contas reais.
 */
export interface Account {
  email: string;
  password: string;
  name: string;
  token: string;
}

const headers = (token = LOCAL_ANON_KEY) => ({
  apikey: LOCAL_ANON_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function createAccount({ name = "Teste", family = true }: { name?: string; family?: boolean } = {}): Promise<Account> {
  const email = `e2e-${randomUUID()}@exemplo.test`;
  const password = `Senha-${randomUUID().slice(0, 8)}`;
  const res = await fetch(`${LOCAL_SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password, data: { display_name: name } }),
  });
  if (!res.ok) throw new Error(`signup falhou: ${res.status} ${await res.text()}`);
  const { access_token: token } = (await res.json()) as { access_token: string };
  if (family) {
    const rpc = await fetch(`${LOCAL_SUPABASE_URL}/rest/v1/rpc/create_household`, {
      method: "POST",
      headers: headers(token),
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
