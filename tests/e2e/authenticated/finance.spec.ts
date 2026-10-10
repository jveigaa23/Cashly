import { expect, test, type Page } from "@playwright/test";
import { createAccount, signIn } from "./session";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => signIn(page, await createAccount({ name: "Rosa" })));

test("conta a pagar: cadastrar, pagar em parte com revisão, quitar e cancelar pagamento", async ({ page }) => {
  await page.getByRole("link", { name: "Conta a pagar" }).click();
  await expect(page.getByRole("heading", { name: "Nova conta a pagar" })).toBeVisible();

  // Validação.
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Dê um nome para a conta.")).toBeVisible();
  await expect(page.getByText("Informe o valor da conta.")).toBeVisible();

  await page.getByLabel("Nome da conta").fill("Conta de luz");
  await page.getByLabel("Valor (R$)").fill("189,90");
  await page.getByLabel("Categoria").selectOption({ label: "Contas de consumo" });
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta salva.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Conta de luz" })).toBeVisible();
  await expect(page.getByText("Vence hoje")).toBeVisible();
  await noHorizontalScroll(page);

  // Pagamento parcial: valor acima do saldo é barrado antes da revisão.
  await page.getByLabel("Valor pago (R$)").fill("200,00");
  await page.getByRole("button", { name: "Revisar pagamento" }).click();
  await expect(page.getByText(/maior que o que falta pagar/)).toBeVisible();

  await page.getByLabel("Valor pago (R$)").fill("89,90");
  await page.getByRole("button", { name: "Revisar pagamento" }).click();
  const review = page.getByRole("group", { name: "Confirmar pagamento" });
  await expect(review).toContainText("R$ 89,90");
  await expect(review).toContainText("R$ 100,00"); // falta depois
  await review.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pagamento registrado.")).toBeVisible();
  await expect(page.getByText("Paga em parte", { exact: true })).toBeVisible();

  // Quitação com encargos.
  await page.getByLabel("Valor pago (R$)").fill("105,00");
  await page.getByLabel("Encargos incluídos no valor (opcional)").fill("5,00");
  await page.getByRole("button", { name: "Revisar pagamento" }).click();
  await page.getByRole("group", { name: "Confirmar pagamento" }).getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Pagamento registrado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registrar pagamento" })).toHaveCount(0);
  await expect(page.getByText("Paga", { exact: true })).toBeVisible();

  // Cancelar um pagamento exige confirmação e motivo; a conta reabre.
  await page.getByRole("button", { name: "Cancelar este pagamento" }).first().click();
  await page.getByRole("button", { name: "Sim, cancelar pagamento" }).click();
  await expect(page.getByText("Explique o motivo em poucas palavras.")).toBeVisible();
  await page.getByLabel("Motivo").fill("Registrei duas vezes");
  await page.getByRole("button", { name: "Sim, cancelar pagamento" }).click();
  await expect(page.getByText("Pagamento cancelado.")).toBeVisible();
  await expect(page.getByText("Paga em parte", { exact: true })).toBeVisible();

  // Histórico mostra quem fez.
  await expect(page.getByRole("region", { name: "Histórico" }).or(page.locator("section", { hasText: "Histórico" })).first()).toContainText("Rosa");

  // A despesa do pagamento aparece em Lançamentos, uma vez só.
  await page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true }).getByRole("link", { name: "Lançamentos" }).click();
  await expect(page.getByText("Pagamento: Conta de luz")).toHaveCount(1);
  await expect(page.getByLabel("Totais do mês").getByText("Despesas pagas")).toBeVisible();
});

test("lançamentos: receita prevista, despesa paga, totais e cancelamento", async ({ page }) => {
  await page.getByRole("link", { name: "Receita" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Nova receita" })).toBeVisible();
  await page.getByText("Vou receber (previsto)").click();
  await page.getByLabel("Descrição", { exact: true }).fill("Aposentadoria");
  await page.getByLabel("Valor (R$)").fill("1.518,00");
  await page.getByLabel("Categoria").selectOption({ label: "Aposentadoria" });
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();

  await page.getByRole("link", { name: "Despesa" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Nova despesa" })).toBeVisible();
  await page.getByLabel("Descrição", { exact: true }).fill("Feira");
  await page.getByLabel("Valor (R$)").fill("87,35");
  await page.getByLabel("Data").fill(today());
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();

  const totals = page.locator("section", { has: page.getByRole("heading", { name: "Totais do mês" }) });
  await expect(totals).toContainText("Receitas recebidasR$ 0,00");
  await expect(totals).toContainText("Despesas pagasR$ 87,35");
  await expect(totals).toContainText("Receitas previstas R$ 1.518,00");
  await noHorizontalScroll(page);

  // Filtro por tipo.
  await page.getByRole("link", { name: "Receitas", exact: true }).click();
  await expect(page.getByText("Feira")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Aposentadoria/ })).toBeVisible();

  // Previsto vira recebido.
  await page.getByRole("link", { name: /Aposentadoria/ }).click();
  await page.getByText("Já recebi").click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await expect(page.getByText("Recebida", { exact: true })).toBeVisible();

  // Cancelamento.
  await page.getByRole("button", { name: "Cancelar lançamento" }).click();
  await page.getByLabel("Motivo").fill("Lancei errado");
  await page.getByRole("button", { name: "Sim, cancelar lançamento" }).click();
  await expect(page.getByText("Lançamento cancelado.", { exact: true })).toBeVisible();
  await expect(page.getByText("Motivo: Lancei errado.", { exact: false })).toBeVisible();
});

test("dados persistem após recarregar e não vazam para outra família", async ({ page, context }) => {
  await page.goto("/contas/nova");
  await page.getByLabel("Nome da conta").fill("Aluguel secreto");
  await page.getByLabel("Valor (R$)").fill("1.200,00");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta salva.")).toBeVisible();
  const billUrl = page.url().replace(/\?.*$/, "");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Aluguel secreto" })).toBeVisible();

  await context.clearCookies();
  await signIn(page, await createAccount({ name: "Outra" }));
  await page.goto("/contas?ver=all");
  await expect(page.getByText("Aluguel secreto")).toHaveCount(0);
  // Com streaming, o status HTTP já foi enviado; o importante é não mostrar nada.
  await page.goto(billUrl);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.getByText("Aluguel secreto")).toHaveCount(0);
});
