import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from "../../../scripts/local-stack-config.ts";
import { createAccount, signIn, type Account } from "./session";

/**
 * Varredura de qualidade (Fase 7) em todas as telas, com dados reais da pilha
 * local: acessibilidade (axe, WCAG 2.1 AA), claro e escuro, sem rolagem
 * horizontal em 360 e 320 px, alvos de toque >= 44 px, sem violações de CSP
 * e sem erros no console.
 */

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const plus = (d: number) => {
  const t = new Date(`${today()}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

async function rest(account: Account, path: string, body?: unknown, method = body ? "POST" : "GET") {
  const res = await fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: LOCAL_ANON_KEY, Authorization: `Bearer ${account.token}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Uma família com conta vencida, a vencer, paga em parte, lançamentos, parcelamento e orçamento. */
async function seed(account: Account) {
  const [{ household_id: household }] = await rest(account, "household_members?select=household_id");
  const cats = (await rest(account, "categories?select=id,name")) as { id: string; name: string }[];
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const bills = await rest(account, "bills", [
    { household_id: household, name: "Conta de luz", original_amount: 189.9, due_date: plus(-5), category_id: cat("Contas de consumo") },
    { household_id: household, name: "Internet", original_amount: 120, due_date: plus(2), category_id: cat("Contas de consumo") },
    { household_id: household, name: "Condomínio com um nome bem comprido para testar quebra de linha", original_amount: 850, due_date: plus(10), category_id: cat("Moradia") },
  ]);
  await rest(account, "rpc/register_bill_payment", {
    p_bill_id: bills[2].id, p_paid_on: today(), p_amount: 300, p_charges_amount: 0, p_account_id: null, p_payment_method: "Pix", p_note: null, p_request_id: crypto.randomUUID(),
  });
  await rest(account, "transactions", [
    { household_id: household, type: "income", status: "confirmed", amount: 3200, occurred_on: today(), description: "Aposentadoria", category_id: cat("Aposentadoria") },
    { household_id: household, type: "expense", status: "confirmed", amount: 450.5, occurred_on: today(), description: "Supermercado", category_id: cat("Alimentação") },
    { household_id: household, type: "expense", status: "planned", amount: 99.9, occurred_on: plus(3), description: "Farmácia", category_id: cat("Saúde") },
  ]);
  const plan = await rest(account, "rpc/create_installment_plan", {
    p_kind: "purchase", p_description: "Geladeira", p_category_id: null, p_total: 2400, p_count: 10, p_first_due: plus(-20), p_method: "none", p_rate: 0, p_request_id: crypto.randomUUID(),
  });
  await rest(account, "budgets", [
    { household_id: household, month: `${today().slice(0, 7)}-01`, category_id: cat("Alimentação"), limit_amount: 500, alert_percent: 80 },
    { household_id: household, month: `${today().slice(0, 7)}-01`, category_id: null, limit_amount: 400, alert_percent: 80 },
  ]);
  const txs = (await rest(account, "transactions?select=id&description=eq.Supermercado")) as { id: string }[];
  return { billId: bills[0].id as string, planId: plan as string, txId: txs[0].id };
}

async function check(page: Page, path: string, problems: string[]) {
  const csp: string[] = [];
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    else if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onConsole);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of axe.violations) {
      problems.push(`${path} [${theme}] axe ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
  }

  for (const width of [360, 320]) {
    const size = page.viewportSize()!;
    if (size.width < width) continue;
    await page.setViewportSize({ width, height: size.height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`${path} rolagem horizontal de ${overflow}px em ${width}px`);
    await page.setViewportSize(size);
  }

  const small = await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("button, input:not([type=hidden]), select, textarea, summary, a")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Links dentro de texto corrido são isentos (WCAG 2.5.8).
        if (el.tagName === "A" && el.closest("p, li > span, dd, td") && !el.className.includes("min-h")) return false;
        const target = el.tagName === "INPUT" && /checkbox|radio/.test((el as HTMLInputElement).type) ? el.closest("label") ?? el : el;
        return target.getBoundingClientRect().height < 44;
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || el.getAttribute("name") || "").trim().slice(0, 40)}"`),
  );
  for (const s of small) problems.push(`${path} alvo de toque < 44px: ${s}`);

  page.off("console", onConsole);
  for (const c of csp) problems.push(`${path} CSP: ${c}`);
  for (const e of errors) problems.push(`${path} console: ${e.slice(0, 200)}`);
}

test("todas as telas com login: acessibilidade, responsividade, alvos de toque, CSP e console", async ({ page }) => {
  test.setTimeout(180_000);
  const account = await createAccount({ name: "Quality" });
  const ids = await seed(account);
  await signIn(page, account);
  const paths = [
    "/", "/contas", "/contas?ver=overdue", "/contas/nova", `/contas/${ids.billId}`,
    "/lancamentos", "/lancamentos/novo?tipo=despesa", `/lancamentos/${ids.txId}`,
    "/parcelas", "/parcelas/novo", `/parcelas/${ids.planId}`,
    "/orcamento", "/relatorios", `/relatorios?periodo=${today().slice(0, 4)}`, "/avisos", "/ajustes",
  ];
  const problems: string[] = [];
  for (const path of paths) await check(page, path, problems);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("telas sem login: acessibilidade, responsividade, CSP e console", async ({ page }) => {
  const problems: string[] = [];
  for (const path of ["/entrar", "/cadastro", "/esqueci-senha", "/pagina-que-nao-existe"]) await check(page, path, problems);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("cabeçalho CSP presente e restritivo", async ({ request }) => {
  const res = await request.get("/entrar");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("unsafe-eval");
});

test("confirmação pelo teclado: foco entra na confirmação e volta ao botão", async ({ page }) => {
  const account = await createAccount({ name: "Teclado" });
  await seed(account);
  await signIn(page, account);
  await page.goto("/orcamento");
  const trigger = page.getByRole("button", { name: "Remover limite" }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Remover este limite?")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Voltar" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Remover limite" }).first()).toBeFocused();

  // Com motivo: o foco vai direto para o campo.
  await page.goto("/lancamentos");
  await page.getByRole("link", { name: /Supermercado/ }).click();
  await page.getByRole("button", { name: "Cancelar lançamento" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Motivo")).toBeFocused();
});

test("fonte grande do celular (150% e 200%) não cria rolagem horizontal", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "verificação de celular");
  test.setTimeout(180_000);
  const account = await createAccount({ name: "Fonte" });
  const ids = await seed(account);
  await signIn(page, account);
  const problems: string[] = [];
  const paths = ["/", "/contas", `/contas/${ids.billId}`, "/contas/nova", "/lancamentos", "/lancamentos/novo?tipo=despesa", "/parcelas", `/parcelas/${ids.planId}`, "/orcamento", "/relatorios", "/avisos", "/ajustes"];
  // No Android, a fonte grande do Chrome amplia a página inteira: 360 px a
  // 150% equivalem a 240 px de largura; a 200%, a 180 px.
  for (const width of [240, 180]) {
    await page.setViewportSize({ width, height: 740 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
      const wide = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        return [...document.querySelectorAll<HTMLElement>("main *, header *")]
          .filter((el) => el.getBoundingClientRect().right > limit + 1)
          .slice(-3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.textContent || "").trim().slice(0, 30)}"`);
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const nav = await page.getByRole("navigation", { name: "Navegação principal" }).filter({ visible: true }).evaluate((n) => n.scrollWidth - n.clientWidth);
      const found = [
        ...(overflow > 0 ? [`${width}px ${path}: ${overflow}px — ${wide.join(" | ")}`] : []),
        ...(nav > 0 ? [`${width}px ${path}: barra de navegação ${nav}px mais larga que a tela`] : []),
      ];
      problems.push(...found);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
