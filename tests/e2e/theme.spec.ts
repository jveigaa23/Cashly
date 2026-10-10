import { expect, test } from "@playwright/test";

const theme = (page: import("@playwright/test").Page) =>
  page.locator("html").getAttribute("data-theme");

test("tema segue o sistema por padrão", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  expect(await theme(page)).toBe("dark");
  await context.close();
});

test("escolha manual persiste após recarregar, sem piscar", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/ajustes");
  await page.getByText("Escuro", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Registra o tema no primeiro momento em que o <body> existe.
  await page.addInitScript(() => {
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") {
        (window as unknown as { firstTheme: string | null }).firstTheme =
          document.documentElement.getAttribute("data-theme");
      }
    }, { once: true });
  });
  await page.reload();
  expect(
    await page.evaluate(() => (window as unknown as { firstTheme: string | null }).firstTheme),
  ).toBe("dark");
  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();

  // A cor de fundo realmente muda.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(13, 19, 17)");
});

test("botão do cabeçalho alterna o tema", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Usar tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
