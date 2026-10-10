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
 * Atualização: ao alterar este arquivo, incremente SW_VERSION. A nova versão
 * fica "em espera" até a pessoa tocar em "Atualizar" (mensagem SKIP_WAITING).
 */
const SW_VERSION = "1";
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
