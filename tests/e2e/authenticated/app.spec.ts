import { expect, test } from "@playwright/test";
import { createAccount, signIn } from "./session";

test.describe("com login", () => {
  test.beforeEach(async ({ page }) => signIn(page, await createAccount({ name: "Maria" })));

  test("navegação principal, sem rolagem horizontal e sem rótulos cortados", async ({ page }) => {
    await expect(page.getByText("Olá, Maria! Família Família Maria.")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true });
    await nav.getByRole("link", { name: "Contas" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Contas a pagar" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Contas" })).toHaveAttribute("aria-current", "page");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const cut = await nav.getByRole("link").evaluateAll((links) => links.filter((l) => l.scrollWidth > l.clientWidth).length);
    expect(cut).toBe(0);
    for (const h of await nav.getByRole("link").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(h).toBeGreaterThanOrEqual(44);
    }
  });

  test("link para pular ao conteúdo é o primeiro foco do teclado", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  });

  test("ajustes: família, aparência, instalação e conta", async ({ page }) => {
    await page.getByRole("link", { name: "Ajustes" }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { name: /^Família: / })).toBeVisible();
    await expect(page.getByText("(você)")).toBeVisible();

    await page.getByText("Escuro", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
    await page.getByText("Automático", { exact: true }).click();

    await expect(page.getByRole("heading", { name: "Instalar no celular ou computador" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair desta conta" })).toBeVisible();
  });

  test("páginas de visitante levam quem está logado ao início", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page).toHaveURL(/\/$/);
  });

  test("sair encerra a sessão", async ({ page }) => {
    await page.goto("/ajustes");
    await page.getByRole("button", { name: "Sair desta conta" }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goto("/contas");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fcontas$/);
  });
});
