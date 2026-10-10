import { expect, test } from "@playwright/test";

test("abre o início com navegação e sem rolagem horizontal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  await expect(page).toHaveTitle(/Cashly/);

  const nav = page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  await nav.getByRole("link", { name: "Contas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contas a pagar" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Contas" })).toHaveAttribute("aria-current", "page");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("seções não implementadas não exibem valores simulados", async ({ page }) => {
  for (const path of ["/", "/contas", "/lancamentos", "/relatorios"]) {
    await page.goto(path);
    await expect(page.getByText(/Em construção — chega na Fase \d/)).toBeVisible();
    await expect(page.locator("main")).not.toContainText("R$");
  }
});

test("link para pular ao conteúdo é o primeiro foco do teclado", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#conteudo$/);
});

test("botões e links da navegação têm alvo de toque confortável", async ({ page }) => {
  await page.goto("/ajustes");
  const targets = page
    .getByRole("navigation", { name: "Navegação principal" })
    .filter({ visible: true })
    .getByRole("link");
  for (const box of await targets.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  )) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
});

test("Ajustes é acessível em qualquer tamanho de tela", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Ajustes" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
});

test("rótulos da navegação não se sobrepõem", async ({ page }) => {
  await page.goto("/");
  const labels = page
    .getByRole("navigation", { name: "Navegação principal" })
    .filter({ visible: true })
    .getByRole("link");
  const overflowing = await labels.evaluateAll((links) =>
    links.filter((link) => link.scrollWidth > link.clientWidth).map((l) => l.textContent),
  );
  expect(overflowing).toEqual([]);
});

test("rota inexistente mostra página amigável", async ({ page }) => {
  const response = await page.goto("/nao-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("envia cabeçalhos de segurança", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});
