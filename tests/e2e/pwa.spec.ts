import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function waitForServiceWorkerControl(page: Page) {
  await page.goto("/entrar");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** Simula queda de conexão inclusive para as requisições do Service Worker. */
async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
  await context.route("**/*", (route) =>
    route.request().serviceWorker() ? route.abort("internetdisconnected") : route.continue(),
  );
}

async function goOnline(context: BrowserContext) {
  await context.unrouteAll();
  await context.setOffline(false);
}

function swVersion(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data.version);
        navigator.serviceWorker.controller!.postMessage({ type: "GET_VERSION" }, [channel.port2]);
      }),
  );
}

test("manifest é válido e os ícones existem", async ({ page, request }) => {
  await page.goto("/entrar");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({
    name: "Cashly — Finanças da Família",
    short_name: "Cashly",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("Service Worker controla a página e não guarda dados em cache", async ({ page, request }) => {
  const swResponse = await request.get("/sw.js");
  expect(swResponse.headers()["cache-control"]).toContain("no-store");

  await waitForServiceWorkerControl(page);

  // Navega pelo app e confere que nenhuma página entrou no cache.
  await page.goto("/cadastro");
  await page.goto("/esqueci-senha");
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) urls.push(new URL(req.url).pathname);
    }
    return urls.sort();
  });
  expect(cached).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"]);
});

test("sem conexão: aviso no app e página offline nas navegações", async ({ page, context }) => {
  await waitForServiceWorkerControl(page);

  await goOffline(context);
  await expect(page.getByText("Sem internet. Nada será salvo até a conexão voltar.")).toBeVisible();

  await page.goto("/cadastro");
  await expect(page.getByRole("heading", { name: "Você está sem internet" })).toBeVisible();
  await expect(page.getByText("Nada é salvo enquanto você estiver sem conexão.")).toBeVisible();

  await goOnline(context);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Criar conta" })).toBeVisible();
});

// O fluxo de atualização (nova versão em espera → aviso → ativação só após o
// clique) é coberto em src/components/pwa/pwa-store.test.ts: o Playwright não
// consegue interceptar a busca do script do SW feita pelo navegador em
// `registration.update()`.
test("Service Worker responde à versão atual", async ({ page }) => {
  await waitForServiceWorkerControl(page);
  expect(await swVersion(page)).toBe("1");
});
