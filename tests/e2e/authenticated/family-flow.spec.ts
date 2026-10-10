import { expect, test } from "@playwright/test";
import { credentials } from "./session";

/**
 * Fluxo completo: dono cria a família, convida; o convidado aceita.
 * Requer DUAS contas confirmadas e SEM família, em ambiente de TESTE:
 *   E2E_EMAIL / E2E_PASSWORD (dono)  e  E2E_INVITEE_EMAIL / E2E_INVITEE_PASSWORD
 * Consome as contas (depois disso elas têm família): rode antes da suíte app.spec.
 */
const invitee = {
  email: process.env.E2E_INVITEE_EMAIL ?? "",
  password: process.env.E2E_INVITEE_PASSWORD ?? "",
};

test.describe.configure({ mode: "serial" });

test("dono cria a família, convida e o convidado entra", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Fluxo consome as contas: roda uma vez só.");
  test.skip(
    !credentials.email || !invitee.email,
    "Defina E2E_EMAIL/E2E_PASSWORD e E2E_INVITEE_EMAIL/E2E_INVITEE_PASSWORD (contas de TESTE sem família).",
  );

  // Dono entra: sem família, vai para o cadastro inicial.
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/bem-vindo$/);

  // Validação do servidor.
  await page.getByLabel("Nome da família").fill("   ");
  await page.getByRole("button", { name: "Criar família" }).click();
  await expect(page.getByText("Dê um nome para a família.")).toBeVisible();

  await page.getByLabel("Nome da família").fill("Família E2E");
  await page.getByLabel("Como você quer ser chamado(a)").fill("Dono E2E");
  await page.getByRole("button", { name: "Criar família" }).click();
  await expect(page.getByText("Olá, Dono E2E! Família Família E2E.")).toBeVisible();

  // Convite.
  await page.goto("/ajustes");
  await page.getByLabel("E-mail da pessoa").fill(invitee.email.toUpperCase());
  await page.getByRole("button", { name: "Criar convite" }).click();
  const link = await page.getByLabel("Link do convite").inputValue();
  expect(link).toMatch(/\/convite\/[0-9a-f]{64}$/);
  await page.reload();
  await expect(page.getByText(invitee.email.toLowerCase())).toBeVisible();

  await page.getByRole("button", { name: "Sair desta conta" }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // Convidado abre o link, entra e aceita.
  const invitePath = new URL(link).pathname;
  await page.goto(invitePath);
  await page.getByRole("link", { name: /Já tenho conta/ }).click();
  await page.getByLabel("E-mail").fill(invitee.email);
  await page.getByLabel("Senha", { exact: true }).fill(invitee.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(new RegExp(`${invitePath}$`));
  await page.getByLabel("Como você quer ser chamado(a)").fill("Convidado E2E");
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page.getByText("Olá, Convidado E2E! Família Família E2E.")).toBeVisible();

  // O convidado vê a família, mas não pode convidar.
  await page.goto("/ajustes");
  await expect(page.getByText("Dono E2E")).toBeVisible();
  await expect(page.getByLabel("E-mail da pessoa")).toHaveCount(0);

  // Link já usado não funciona de novo.
  await context.clearCookies();
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Olá, Dono E2E!", { exact: false })).toBeVisible();
  await page.goto("/ajustes");
  await expect(page.getByText("Convidado E2E")).toBeVisible();
});
