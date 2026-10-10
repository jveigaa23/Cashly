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

### Autenticação e autorização (Fase 2)

- Supabase Auth com e-mail e senha, uma conta por pessoa, vinculada a uma
  família (`household_members`). Sessão em cookies via `@supabase/ssr`.
- `src/proxy.ts`: renova a sessão em toda requisição e redireciona quem não
  entrou para `/entrar?next=...` (destino validado contra redirecionamento aberto).
- `src/server/session.ts` (DAL): `getSessionUser` (token verificado com
  `getClaims`), `requireUser`, `requireMember`, `requireOwner`. Toda página e
  Server Action com dados chama a DAL; o proxy não é a única barreira.
- O cliente nunca informa `household_id`, papel ou status: vêm da sessão e o
  banco confere de novo (RLS, FKs compostas, funções).
- Cache Components continua ligado, mas **nenhum dado da família usa
  `use cache`**; leituras de sessão ficam atrás de `<Suspense>` e as respostas
  usam `Cache-Control: private, no-store`.
- Erros do Supabase são traduzidos (`src/server/errors.ts`); logs registram
  só o código do erro, sem e-mail, valores ou tokens.

### Domínio financeiro (Fase 3)

- `src/domain/bills.ts`: saldo, situação derivada (a vencer, vence hoje,
  vencida, paga em parte, paga, cancelada), dias de atraso e validação de
  pagamento. `today` sempre injetado.
- `src/domain/transactions.ts`: totais separando realizado e previsto,
  ignorando cancelados.
- `src/domain/charges.ts`, `rates.ts`: multa e juros estimados (BigInt).
- `src/domain/installments.ts`, `recurrence.ts`: cronogramas e datas, com
  equivalentes SQL testados lado a lado. Regras em
  [regras-financeiras.md](regras-financeiras.md).
- O banco aplica as mesmas regras nas funções; a interface valida antes para
  dar mensagens claras (inclusive na etapa de revisão do pagamento).
- `src/server/finance/queries.ts`: leituras com `::text` nos NUMERIC (sem float).
- `src/server/finance/actions.ts`: Server Actions com Zod + domínio + RPC.
- Despesa de pagamento de conta é criada automaticamente; por isso “Nova
  despesa” orienta a usar “Registrar pagamento” na conta.

### Painel, orçamento e relatórios (Fase 5)

- `src/domain/reports.ts`: totais mensais, categorias, comparação, uso do
  orçamento e períodos (`2026-10`, `2026-T4`, `2026`) — funções puras.
- `src/server/finance/reports.ts`: lê os registros de origem (paginado,
  NUMERIC como texto) e deriva todos os totais; falha de forma explícita
  acima de 20.000 lançamentos em vez de mostrar números incompletos.
- Gráficos em HTML/CSS (`src/components/charts/`), sem biblioteca: colunas
  agrupadas com legenda, valores em texto ao tocar/focar e “Ver em tabela”;
  barras horizontais com nome, valor e % em texto. Paleta validada para
  claro/escuro (tokens `--series-*`).
- CSV: `GET /relatorios/csv?periodo=…` (exige login; `;`, vírgula decimal,
  BOM UTF-8, proteção contra fórmulas em células). PDF via impressão do
  navegador (`@media print` esconde navegação e controles).
- Verificação de senha vazada no servidor (`src/server/password-check.ts`,
  k-anonimato) no cadastro e na troca de senha.

### Avisos (Fase 6)

- Avisos internos: o sino do cabeçalho chama `refresh_notifications()`, que
  cria (idempotente) os avisos da própria pessoa a partir dos registros e
  das preferências. Não precisa de chave secreta nem de agendador.
- Texto montado na leitura (`src/domain/notifications.ts`) a partir da view
  `notification_feed`; nada de conteúdo financeiro guardado nas entregas.
- Push: `GET /api/cron/notificacoes` (Vercel Cron, `vercel.json`) protegido
  por `CRON_SECRET` (comparação em tempo constante) e excluído do proxy de
  sessão. Usa `SUPABASE_SECRET_KEY` só ali (`src/lib/supabase/admin.ts`),
  enfileira no banco e envia com `web-push`; 404/410 expiram o aparelho,
  outras falhas tentam de novo até 3 vezes. Sem configuração: 503 com a lista
  do que falta.
- WhatsApp: `whatsappStatus()` sempre "não configurado" nesta versão.

### Qualidade e segurança (Fase 7)

- CSP em todas as páginas (`next.config.ts`): `default-src 'self'`,
  `connect-src 'self'` (o navegador não fala com o Supabase), `object-src
  'none'`, `frame-ancestors 'none'`, `form-action 'self'`. Scripts inline
  permitidos porque nonces não funcionam com Partial Prerendering.
- `createClient()` chama `connection()`: o cliente de Auth lê o relógio, o
  que não pode acontecer na pré-renderização (eliminou o aviso `Date.now()`).
- Varredura E2E de todas as telas (`quality.spec.ts`): axe WCAG 2.1 AA em
  claro e escuro, sem rolagem horizontal em 360/320 px e com a página
  ampliada a 150%/200% (como a fonte grande do Chrome no Android), alvos de
  toque >= 44 px, sem violação de CSP nem erro no console.
- Abaixo de 320 px (fonte grande): listas "rótulo — valor" empilham
  (`.pairs`), a navegação de mês quebra em duas linhas (`.period-nav`), a
  barra de baixo vira 2×2 e os gráficos rolam dentro do próprio quadro.
- Confirmações levam o foco para dentro e de volta ao botão.
- `tests/integration/security.test.ts`: outra família, com os ids certos,
  não consegue alterar contas, pagamentos, lançamentos, parcelas, orçamento,
  contas de registro nem avisos; campos forjados (`household_id`,
  `created_by`) são ignorados; categoria de outra família é recusada.

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
| Uma família por conta | Simplifica o app para o caso de uso; restrição removível no banco |
| Formulários com Server Actions + `useActionState` | Funcionam sem JS pesado; React Hook Form fica para formulários complexos (Fase 3+) |
| Testes de RLS em PostgreSQL local com réplica do `auth` | Isolados do projeto real e sem Docker |
| Pilha Supabase local (GoTrue + PostgREST binários) para integração/E2E | Testes com login reais sem tocar o projeto real nem depender de Docker |
| Formulários sem React Hook Form | Formulários simples; Server Actions + `useActionState` bastam |
| Gráficos em HTML/CSS em vez de biblioteca | Poucos tipos de gráfico; acessível (texto e tabela), leve e sem dependência |
| Saldo registrado calculado no banco (`registered_balance`) | Uma regra só para painel e relatórios, respeitando o RLS |
| Verificação de senha vazada no app | O recurso do Supabase exige plano Pro |
| Avisos internos sob demanda + push por Vercel Cron | Funciona sem chave secreta para o app; a chave fica só no agendador |
| CSP sem nonce | Partial Prerendering não aceita nonces; o resto da política continua estrito |
| Avisos sem valores em dinheiro | Notificação aparece na tela bloqueada; o valor fica dentro do app |
