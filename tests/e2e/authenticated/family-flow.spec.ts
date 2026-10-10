import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn } from "./session";

/** Fluxo completo pela interface: cadastro → família → convite → aceite. */
test("cadastro, criação da família, convite e entrada do segundo responsável", async ({ page, context }) => {
  const owner = { email: `dono-${randomUUID()}@exemplo.test`, password: "Senha-segura-1" };
  const invitee = { email: `conv-${randomUUID()}@exemplo.test`, password: "Senha-segura-2" };

  // Cadastro (a pilha local confirma o e-mail automaticamente).
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Dona Ana");
  await page.getByLabel("E-mail").fill(owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(owner.password);
  await page.getByLabel("Repita a senha").fill(owner.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/bem-vindo$/);

  // Validação do servidor e criação da família.
  await page.getByLabel("Nome da família").fill("   ");
  await page.getByRole("button", { name: "Criar família" }).click();
  await expect(page.getByText("Dê um nome para a família.")).toBeVisible();
  await page.getByLabel("Nome da família").fill("Silva");
  await expect(page.getByLabel("Como você quer ser chamado(a)")).toHaveValue("Dona Ana");
  await page.getByRole("button", { name: "Criar família" }).click();
  await expect(page.getByText("Olá, Dona Ana! Família Silva.")).toBeVisible();

  // Convite.
  await page.goto("/ajustes");
  await page.getByLabel("E-mail da pessoa").fill(invitee.email.toUpperCase());
  await page.getByRole("button", { name: "Criar convite" }).click();
  const link = await page.getByLabel("Link do convite").inputValue();
  expect(link).toMatch(/\/convite\/[0-9a-f]{64}$/);
  await page.reload();
  await expect(page.getByText(invitee.email)).toBeVisible();
  await page.getByRole("button", { name: "Sair desta conta" }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // Convidado abre o link, cria a conta e aceita.
  const invitePath = new URL(link).pathname;
  await page.goto(invitePath);
  await page.getByRole("link", { name: "Criar conta" }).click();
  await page.getByLabel("Seu nome").fill("Seu João");
  await page.getByLabel("E-mail").fill(invitee.email);
  await page.getByLabel("Senha", { exact: true }).fill(invitee.password);
  await page.getByLabel("Repita a senha").fill(invitee.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(new RegExp(`${invitePath}$`));
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page.getByText("Olá, Seu João! Família Silva.")).toBeVisible();

  // O convidado vê a família, mas não convida.
  await page.goto("/ajustes");
  await expect(page.getByText("Dona Ana")).toBeVisible();
  await expect(page.getByLabel("E-mail da pessoa")).toHaveCount(0);

  // O link usado não serve para mais ninguém.
  await context.clearCookies();
  const stranger = { email: `x-${randomUUID()}@exemplo.test`, password: "Senha-segura-3" };
  await page.goto(`/cadastro?next=${encodeURIComponent(invitePath)}`);
  await page.getByLabel("Seu nome").fill("Estranho");
  await page.getByLabel("E-mail").fill(stranger.email);
  await page.getByLabel("Senha", { exact: true }).fill(stranger.password);
  await page.getByLabel("Repita a senha").fill(stranger.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page.getByText(/Este convite não é mais válido/)).toBeVisible();

  // E a dona vê os dois membros.
  await context.clearCookies();
  await signIn(page, owner);
  await page.goto("/ajustes");
  await expect(page.getByText("Seu João")).toBeVisible();
});
