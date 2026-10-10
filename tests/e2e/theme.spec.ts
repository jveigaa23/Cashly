import { expect, test } from "@playwright/test";

test("tema segue o sistema por padrão", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/entrar");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.close();
});

test("escolha manual persiste após recarregar, sem piscar", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Registra o tema no primeiro momento em que o documento fica interativo.
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
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(13, 19, 17)");

  await page.getByRole("button", { name: "Usar tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
