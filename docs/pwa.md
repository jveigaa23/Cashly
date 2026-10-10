# PWA

## Manifest

Gerado por `src/app/manifest.ts` em `/manifest.webmanifest`:
nome, `short_name`, `lang: pt-BR`, `display: standalone`, `start_url` e `scope`
em `/`, cores e ícones 192/512 (`any`) e 512 (`maskable`). O ícone Apple
(`src/app/apple-icon.png`) e o favicon (`src/app/icon.svg`) usam as
convenções de arquivo do Next.

Os ícones são gerados por `pnpm icons` a partir do desenho vetorial em
`scripts/generate-icons.mjs` (sem texto, para não depender de fontes).

## Service Worker (`public/sw.js`)

Política de cache **restrita** por segurança:

| Requisição | Comportamento |
| --- | --- |
| Navegação (HTML) | Sempre da rede. Sem conexão → `/offline.html` pré-armazenada. **Nunca** guardada em cache. |
| Server Actions, dados, `POST` | Não interceptados. Falham explicitamente sem conexão. |
| Arquivos estáticos do Next | Não interceptados; o cache HTTP do navegador cuida (nomes com hash). |
| Pré-cache | Somente `/offline.html` e dois ícones. |

Assim nenhum dado financeiro, credencial ou token fica no Cache Storage do
aparelho. O teste E2E `Service Worker controla a página e não guarda dados em
cache` verifica o conteúdo do cache após navegar pelo app.

## Atualização

1. Ao mudar `public/sw.js`, incremente `SW_VERSION`.
2. O navegador baixa o novo SW (sem cache HTTP: `Cache-Control: no-store` e
   `updateViaCache: "none"`) ao abrir o app ou quando ele volta a ficar visível.
3. A nova versão fica **em espera**; o app mostra “Há uma nova versão do
   Cashly disponível” com o botão **Atualizar**.
4. Só após o toque o SW recebe `SKIP_WAITING`, assume o controle e a página recarrega.

Como o HTML nunca é servido do cache, alterações nas páginas e no código do
app chegam imediatamente em cada deploy, mesmo sem trocar o SW.

## Instalação

- **Android/Chrome e Edge/desktop**: o convite nativo (`beforeinstallprompt`)
  é capturado no `<head>` e oferecido pelo botão “Instalar aplicativo” em
  Ajustes, sempre por ação explícita.
- **iPhone/iPad**: Safari não tem convite programático; a tela de Ajustes
  mostra o passo a passo “Compartilhar → Adicionar à Tela de Início”.
- Requisitos: HTTPS em produção (localhost é aceito em desenvolvimento) e
  manifest válido.

## Sem conexão

- Uma faixa “Sem internet. Nada será salvo até a conexão voltar.” aparece
  no topo enquanto o aparelho estiver offline.
- Navegações sem rede mostram `/offline.html`, que explica que nada é salvo
  sem conexão e oferece “Tentar novamente”.

## Testes

- `tests/e2e/pwa.spec.ts`: manifest e ícones, controle do SW, conteúdo do
  cache, comportamento offline, orientação de instalação.
  Usa `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` porque
  `context.setOffline` não afeta as requisições feitas pelo SW.
- `src/components/pwa/pwa-store.test.ts`: registro, primeira instalação vs.
  atualização, ativação só após confirmação, falha de registro, convite de
  instalação.

## Push (Fase 6)

Os eventos `push`/`notificationclick` serão adicionados a este SW na Fase 6,
com chaves VAPID e inscrições por dispositivo salvas no servidor.
