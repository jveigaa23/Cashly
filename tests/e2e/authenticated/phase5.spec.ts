import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createAccount, signIn } from "./session";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function addTransaction(page: Page, kind: "Receita" | "Despesa", description: string, amount: string, category: string) {
  await page.goto(`/lancamentos/novo?tipo=${kind === "Receita" ? "receita" : "despesa"}`);
  await page.getByLabel("Descrição", { exact: true }).fill(description);
  await page.getByLabel("Valor (R$)").fill(amount);
  await page.getByLabel("Data").fill(today());
  await page.getByLabel("Categoria").selectOption({ label: category });
  await page.getByRole("button", { name: `Salvar ${kind.toLowerCase()}` }).click();
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => signIn(page, await createAccount({ name: "Helena" })));

test("painel sem dados mostra só valores reais (zero) e convida a começar", async ({ page }) => {
  await expect(page.getByText("Comece registrando a vida financeira da casa")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saldo registrado hoje" })).toBeVisible();
  await expect(page.getByText("Em construção")).toHaveCount(0);
  await noHorizontalScroll(page);
});

test("painel, saldo inicial, orçamento, relatório e CSV com os mesmos números", async ({ page }) => {
  await addTransaction(page, "Receita", "Aposentadoria", "2.000,00", "Aposentadoria");
  await addTransaction(page, "Despesa", "Supermercado", "450,50", "Alimentação");

  await page.goto("/");
  const tile = (label: string) => page.locator("div", { has: page.getByText(label, { exact: true }) }).last();
  await expect(tile("Receitas recebidas")).toContainText("R$ 2.000,00");
  await expect(tile("Despesas pagas")).toContainText("R$ 450,50");
  await expect(tile("Resultado do mês")).toContainText("R$ 1.549,50");
  await expect(page.locator("#saldo + p")).toHaveText(/R\$\s1\.549,50/);
  // Gráfico com legenda e tabela acessível.
  await expect(page.getByRole("list", { name: "Legenda" }).first()).toContainText("Receitas recebidas");
  await page.getByText("Ver em tabela").first().click();
  await expect(page.getByRole("table").first()).toContainText("R$ 450,50");
  await noHorizontalScroll(page);

  // Saldo inicial em Ajustes muda o saldo registrado.
  await page.getByRole("link", { name: "Ajustar saldo inicial" }).click();
  const account = page.getByRole("region", { name: "Conta Conta principal" });
  await account.getByLabel("Saldo inicial (R$)").fill("1.000,00");
  await account.getByRole("button", { name: "Salvar conta" }).click();
  await expect(account.getByText("Informe em que dia esse saldo foi conferido.")).toBeVisible();
  await account.getByLabel("Dia em que o saldo foi conferido").fill(today());
  await account.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta salva. O saldo registrado foi atualizado.")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("#saldo + p")).toHaveText(/R\$\s2\.549,50/);

  // Orçamento: limite de Alimentação em alerta (450,50 de 500 = 90%).
  await page.goto("/orcamento");
  await page.getByLabel("Limite para").selectOption({ label: "Alimentação" });
  await page.getByLabel("Limite do mês (R$)").fill("500,00");
  await page.getByRole("button", { name: "Salvar limite" }).click();
  await expect(page.getByText("Limite salvo.")).toBeVisible();
  const meter = page.getByRole("meter", { name: /Alimentação/ });
  await expect(meter).toBeVisible();
  await expect(page.getByText("Perto do limite").first()).toBeVisible();
  await page.goto("/");
  await expect(page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Orçamento do mês" }) }).last()).toContainText("Alimentação");

  // Relatório do mês e CSV.
  await page.goto("/relatorios");
  await expect(page.getByText("Receitas e despesas realizadas")).toBeVisible();
  await expect(page.locator("main")).toContainText("R$ 1.549,50");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Baixar planilha/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^cashly-\d{4}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Receitas recebidas;2000,00");
  expect(csv).toContain("Despesas pagas;450,50");
  expect(csv).toContain("Supermercado;Alimentação;;450,50");

  await page.getByRole("link", { name: "Ano" }).click();
  await expect(page).toHaveURL(/periodo=\d{4}$/);
  await expect(page.locator("main")).toContainText("Evolução do saldo registrado");
  await noHorizontalScroll(page);
});

