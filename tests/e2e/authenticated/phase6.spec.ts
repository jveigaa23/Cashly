import { expect, test } from "@playwright/test";
import { createAccount, signIn } from "./session";

const todayPlus = (days: number) => {
  const now = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T12:00:00Z");
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
};

test.beforeEach(async ({ page }) => signIn(page, await createAccount({ name: "Cida" })));

test("aviso de conta a vencer: sino, lista, abrir e marcar como lido", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Avisos", exact: true })).toBeVisible();
  await page.goto("/avisos");
  await expect(page.getByText("Nenhum aviso por enquanto")).toBeVisible();

  await page.goto("/contas/nova");
  await page.getByLabel("Nome da conta").fill("Conta de gás");
  await page.getByLabel("Valor (R$)").fill("120,00");
  await page.getByLabel("Vencimento (o primeiro, se repetir)").fill(todayPlus(1));
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta salva.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Avisos: 1 não lido" })).toBeVisible();
  await page.getByRole("link", { name: "Avisos: 1 não lido" }).click();
  await expect(page.getByRole("heading", { name: "Não lidos (1)" })).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "Conta de gás" });
  await expect(item).toContainText("Vence amanhã.");
  await expect(item).not.toContainText("R$"); // avisos não mostram valores

  await page.getByRole("button", { name: "Marcar como lido" }).click();
  await expect(page.getByRole("heading", { name: "Não lidos (0)" })).toBeVisible();
  await expect(page.getByText("Lidos nos últimos 30 dias")).toBeVisible();
  await page.getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Conta de gás" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Avisos", exact: true })).toBeVisible();
});

test("ajustes: preferências de aviso, push sem configuração e WhatsApp desligado", async ({ page }) => {
  await page.goto("/ajustes#avisos");
  const section = page.locator("#avisos");
  await expect(section.getByText("Avisos no celular ainda não estão disponíveis")).toBeVisible();
  await expect(section.getByText("Não configurado", { exact: true })).toBeVisible();

  const budget = section.getByRole("group", { name: "Orçamento perto ou acima do limite" });
  await budget.getByLabel("No app (sino)").uncheck();
  await section.getByLabel("Avisar quantos dias antes do vencimento").selectOption("7");
  await section.getByRole("button", { name: "Salvar avisos" }).click();
  await expect(section.getByText("Preferências de aviso salvas.")).toBeVisible();
  await page.reload();
  await expect(page.locator("#avisos").getByRole("group", { name: "Orçamento perto ou acima do limite" }).getByLabel("No app (sino)")).not.toBeChecked();
  await expect(page.locator("#avisos").getByLabel("Avisar quantos dias antes do vencimento")).toHaveValue("7");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("agendador recusa chamada sem o segredo", async ({ request }) => {
  const res = await request.get("/api/cron/notificacoes");
  expect(res.status()).toBe(401);
});
