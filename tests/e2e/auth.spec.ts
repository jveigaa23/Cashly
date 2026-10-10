import { expect, test } from "@playwright/test";

test.describe("sem login", () => {
  test("início e páginas do app levam para Entrar, guardando o destino", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();

    await page.goto("/contas");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fcontas$/);
    await expect(page.locator('input[name="next"]')).toHaveValue("/contas");
  });

  test("validação no servidor com mensagens em português", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe o e-mail.")).toBeVisible();
    await expect(page.getByText("Informe a senha.")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  test("cadastro valida senha e confirmação antes de enviar", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Seu nome").fill("Ana");
    await page.getByLabel("E-mail").fill("ana@exemplo.test");
    await page.getByLabel("Senha", { exact: true }).fill("1234");
    await page.getByLabel("Repita a senha").fill("4321");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("A senha precisa ter pelo menos 8 caracteres.")).toBeVisible();
    await expect(page.getByText("As senhas não são iguais.")).toBeVisible();
    // O que foi digitado (exceto senhas) é mantido.
    await expect(page.getByLabel("E-mail")).toHaveValue("ana@exemplo.test");
    await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  });

  test("link de e-mail inválido explica o problema", async ({ page }) => {
    await page.goto("/auth/callback?code=invalido");
    await expect(page).toHaveURL(/\/entrar\?erro=link$/);
    await expect(page.getByText("O link não funcionou")).toBeVisible();
  });

  test("convite sem login orienta a criar conta ou entrar com o mesmo e-mail", async ({ page }) => {
    await page.goto("/convite/abc123");
    await expect(page.getByRole("heading", { name: "Convite para a família" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", "/cadastro?next=%2Fconvite%2Fabc123");
    await expect(page.getByRole("link", { name: /Já tenho conta/ })).toHaveAttribute("href", "/entrar?next=%2Fconvite%2Fabc123");
  });

  test("telas de acesso não têm rolagem horizontal e respondem com no-store", async ({ page }) => {
    for (const path of ["/entrar", "/cadastro", "/esqueci-senha"]) {
      const response = await page.goto(path);
      expect(response?.headers()["cache-control"]).toBe("private, no-store");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("rota inexistente mostra página amigável", async ({ page }) => {
    // Sem login o proxy leva a /entrar; a 404 aparece para quem está logado.
    const response = await page.goto("/entrar/nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  test("envia cabeçalhos de segurança", async ({ request }) => {
    const response = await request.get("/entrar");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
