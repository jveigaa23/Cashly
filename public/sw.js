/*
 * Service Worker do Cashly.
 *
 * Política de cache (deliberadamente restrita):
 * - NÃO armazena páginas HTML, respostas de dados, Server Actions nem nada
 *   autenticado: dados financeiros nunca ficam em cache no aparelho.
 * - Pré-armazena apenas a página offline estática e os ícones.
 * - Navegações vão sempre à rede; sem conexão, mostra /offline.html.
 * - Demais requisições seguem direto para a rede (cache HTTP do navegador
 *   cuida dos arquivos estáticos versionados do Next).
 *
 * Avisos (Web Push): mostra a notificação recebida e, ao tocar, abre a página
 * do aviso no próprio app (somente endereços do mesmo site).
 *
 * Atualização: ao alterar este arquivo, incremente SW_VERSION. A nova versão
 * fica "em espera" até a pessoa tocar em "Atualizar" (mensagem SKIP_WAITING).
 */
const SW_VERSION = "2";
const CACHE_NAME = `cashly-shell-v${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("cashly-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ||
          new Response("Sem conexão com a internet.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Cashly";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "Você tem um novo aviso.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url: typeof data.url === "string" ? data.url : "/avisos" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/avisos", self.location.origin);
  // Nunca abre endereços de fora do app.
  const url = target.origin === self.location.origin ? target.href : new URL("/avisos", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
