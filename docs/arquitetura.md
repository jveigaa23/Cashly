# Arquitetura

## Stack

Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript
estrito · Tailwind CSS v4 · Vitest + Testing Library · Playwright.
Planejado: Supabase (PostgreSQL, Auth, RLS), Zod, React Hook Form, Recharts.
Ver justificativas e versões em [00-planejamento.md](00-planejamento.md).

## Estrutura

```
src/app/                 Rotas
  layout.tsx             <html>, metadados, scripts de tema e instalação, registro da PWA
  manifest.ts            Web App Manifest
  icon.svg, apple-icon.png
  (app)/                 Área com shell e navegação (será protegida por login na Fase 2)
src/components/
  ui/                    Primitivos: Button, Card, StatusBadge, Notice, EmptyState, ícones
  layout/                Shell, navegação, cabeçalho de página, aviso "em construção"
  theme/                 Preferência de tema (script anti-"piscar", store, seletores)
  pwa/                   Registro do SW, aviso de atualização, instalação, status de conexão
src/lib/
  format/money.ts        Dinheiro em centavos ↔ texto pt-BR ↔ NUMERIC
  format/date.ts         Datas de calendário, fuso da família, formatação pt-BR
public/sw.js             Service Worker (escrito à mão)
public/offline.html      Página offline autocontida
tests/e2e/               Playwright
```

## Convenções

### Dinheiro

- Persistência: `NUMERIC(14,2)`. Aplicação: **inteiros em centavos**.
- `parseBRL` lê o que a pessoa digitou ("1.234,56") e **rejeita** em vez de
  arredondar silenciosamente (mais de 2 casas, negativos, formatos ambíguos).
- `decimalToCents` / `centsToDecimalString` convertem de/para o banco sem
  aritmética de ponto flutuante.
- Arredondamento de cálculos (juros, rateios) será definido no módulo de
  domínio da Fase 4, com regra documentada e testada.

### Datas

- Vencimentos e competências são datas de calendário (`"AAAA-MM-DD"`), nunca
  convertidas com `new Date("AAAA-MM-DD")` (que vira meia-noite UTC e mostra o
  dia anterior no Brasil).
- "Hoje" é sempre calculado a partir de um instante **injetado** e do fuso da
  família (`toCalendarDate(agora, fuso)`), para testes determinísticos.
- Os testes unitários rodam com `TZ=UTC` para flagrar dependência do fuso do servidor.

### Interface

- Tokens de cor semânticos em `globals.css` (`bg-surface`, `text-muted`,
  `bg-danger-bg`…), redefinidos para o tema escuro via `[data-theme="dark"]`.
- Status nunca dependem só de cor: `StatusBadge` sempre tem ícone e texto.
- Alvos de toque ≥ 48 px; foco visível de 3 px; link "Pular para o conteúdo".
- Fonte base de 17 px, fontes do sistema (sem download de fontes externas).
- Telas ainda não implementadas usam `ComingSoon` e **nunca** exibem dados simulados.

### Tema

- Preferência `light` | `dark` | `system` salva em `localStorage` (`cashly-theme`).
- Um script inline no `<head>` aplica `data-theme` antes da primeira pintura e
  acompanha a mudança do sistema operacional no modo automático.

### Segurança (Fase 1)

- Cabeçalhos: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS; `X-Powered-By` desativado.
- Service Worker não armazena HTML nem dados (ver [pwa.md](pwa.md)).
- `experimental.useOffline` do Next **não** é usado: ele repetiria Server
  Actions automaticamente ao reconectar, com risco de lançamentos duplicados.

## Decisões registradas

| Decisão | Motivo |
| --- | --- |
| Service Worker manual em vez de Serwist/next-pwa | Política de cache mínima e auditável; nenhuma dependência extra |
| Ícones inline em vez de biblioteca de ícones | Poucos ícones; evita dependência |
| Fontes do sistema | Sem requisição externa no build ou no carregamento; boa legibilidade |
| Playwright 1.56.1 | Casa com o Chromium disponível no ambiente de CI/desenvolvimento |
| 4 abas no celular, "Ajustes" no cabeçalho | Rótulos inteiros e legíveis em 360 px |
