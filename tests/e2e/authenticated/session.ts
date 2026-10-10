import { expect, test, type Page } from "@playwright/test";

/**
 * Suíte com login. Roda SOMENTE contra um ambiente de teste isolado
 * (projeto/stack Supabase de testes) com um usuário já confirmado e com
 * família criada, informado por variáveis:
 *   E2E_EMAIL, E2E_PASSWORD
 * Sem elas, os testes aparecem como "skipped" com o motivo — nunca como aprovados.
 * NUNCA use a conta de uma pessoa real da família.
 */
export const credentials = {
  email: process.env.E2E_EMAIL ?? "",
  password: process.env.E2E_PASSWORD ?? "",
};

export function requireTestAccount() {
  test.skip(
    !credentials.email || !credentials.password,
    "Defina E2E_EMAIL e E2E_PASSWORD de uma conta em ambiente de TESTE isolado.",
  );
}

export async function signIn(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
}
