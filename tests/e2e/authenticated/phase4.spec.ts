import { expect, test } from "@playwright/test";
import { createAccount, signIn } from "./session";

const todayPlus = (days: number) => {
  const now = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T12:00:00Z");
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
};

test.beforeEach(async ({ page }) => signIn(page, await createAccount({ name: "Lúcia" })));

test("conta vencida mostra encargos estimados separados do valor original", async ({ page }) => {
  await page.goto("/contas/nova");
  await page.getByLabel("Nome da conta").fill("Cartão de loja");
  await page.getByLabel("Valor (R$)").fill("1.000,00");
  await page.getByLabel("Vencimento (o primeiro, se repetir)").fill(todayPlus(-30));
  await page.getByText("Multa e juros por atraso (opcional)").click();
  await page.getByLabel("Multa (%)").fill("2");
  await page.getByLabel("Juros (%)").fill("1");
  await page.getByLabel("Os juros são").selectOption("monthly");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta salva.")).toBeVisible();

  const charges = page.locator("section", { has: page.getByRole("heading", { name: "Encargos estimados até hoje" }) });
  await expect(charges).toContainText("MultaR$ 20,00");
  await expect(charges).toContainText("Juros (30 dias)R$ 10,00");
  await expect(charges).toContainText("Total estimado a pagar hojeR$ 1.030,00");
  await expect(charges).toContainText("O valor oficial é o do boleto");
  // Valor original continua separado.
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Valores" }) })).toContainText("Valor originalR$ 1.000,00");
  await expect(page.getByText(/Estimativa de hoje: R\$\s30,00/)).toBeVisible();
});

test("conta repetida todo mês: gera as próximas e pode parar de repetir", async ({ page }) => {
  await page.goto("/contas/nova");
  await page.getByLabel("Nome da conta").fill("Plano de saúde");
  await page.getByLabel("Valor (R$)").fill("450,00");
  await page.getByLabel("Vencimento (o primeiro, se repetir)").fill(todayPlus(2));
  await page.getByLabel("Repetir esta conta").selectOption("monthly");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta repetida cadastrada.")).toBeVisible();

  const items = page.getByRole("link", { name: /Plano de saúde/ });
  expect(await items.count()).toBeGreaterThanOrEqual(1);
  await expect(items.first()).toContainText("Repete");

  await page.reload();
  expect(await page.getByRole("link", { name: /Plano de saúde/ }).count()).toBe(await items.count()); // não duplica

  await items.first().click();
  await expect(page.getByText(/^Todo mês, dia \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Parar de repetir" }).click();
  await page.getByRole("button", { name: "Sim, parar de repetir" }).click();
  await expect(page.getByText(/Repetição encerrada\. As próximas/)).toBeVisible();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
});

test("parcelamento: prévia, cronograma com resíduo e pagamento de parcela", async ({ page }) => {
  await page.goto("/contas");
  await page.locator("main").getByRole("link", { name: "Parcelamentos" }).click();
  await page.getByRole("link", { name: "Novo parcelamento" }).first().click();
  await page.getByLabel("O que foi comprado ou financiado").fill("Geladeira");
  await page.getByLabel("Valor total (R$)").fill("1.000,00");
  await page.getByLabel("Número de parcelas").fill("3");
  await page.getByLabel("Vencimento da 1ª parcela").fill(todayPlus(0));
  await expect(page.getByText("3x de R$ 333,33 (última de R$ 333,34)")).toBeVisible();

  await page.getByText("Juros simples ao mês").click();
  await page.getByLabel("Taxa de juros ao mês (%)").fill("2");
  await expect(page.getByText("3x de R$ 353,33 (última de R$ 353,34)")).toBeVisible();
  await expect(page.getByText("Juros totais estimados: R$ 60,00")).toBeVisible();
  await page.getByText("Sem juros", { exact: true }).click();

  await page.getByRole("button", { name: "Salvar parcelamento" }).click();
  await expect(page.getByText("Parcelamento salvo.")).toBeVisible();
  const resumo = page.locator("section", { has: page.getByRole("heading", { name: "Resumo" }) });
  await expect(resumo).toContainText("Saldo devedorR$ 1.000,00");
  await expect(page.getByText("0 pagas · 3 em aberto")).toBeVisible();

  // A 1ª parcela já vem aberta para pagamento.
  await page.getByLabel("Valor pago (R$)").first().fill("333,33");
  await page.getByRole("button", { name: "Revisar pagamento" }).first().click();
  await page.getByRole("group", { name: "Confirmar pagamento" }).getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pagamento da parcela registrado.")).toBeVisible();
  await expect(page.getByText("1 pagas · 2 em aberto")).toBeVisible();
  await expect(resumo).toContainText("Saldo devedorR$ 666,67");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.goto("/lancamentos");
  await expect(page.getByText("Parcela 1/3: Geladeira")).toHaveCount(1);
});

test("receita mensal entra como prevista", async ({ page }) => {
  await page.goto("/lancamentos/novo?tipo=receita");
  await page.getByLabel("Descrição", { exact: true }).fill("Aposentadoria");
  await page.getByLabel("Valor (R$)").fill("1.518,00");
  await page.getByText("Repetir todo mês").click();
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.getByText("Lançamento mensal cadastrado.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Aposentadoria/ }).first()).toContainText("Prevista");
  const totals = page.locator("section", { has: page.getByRole("heading", { name: "Totais do mês" }) });
  await expect(totals).toContainText("Receitas recebidasR$ 0,00");
});
