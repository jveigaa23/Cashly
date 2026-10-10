# Cashly — Finanças da Família

Aplicativo web instalável (PWA) para organizar as finanças da família:
contas a pagar, despesas, receitas, parcelas, juros, orçamentos e relatórios.
Feito para uso diário no celular por pessoas sem familiaridade técnica, e
utilizável também no computador.

> O Cashly **não movimenta dinheiro** nem se conecta a bancos. Todos os
> registros são manuais. Estimativas de juros e multas não substituem os
> valores oficiais do contrato, boleto ou credor.

## Estado do projeto

| Fase | Conteúdo | Situação |
| --- | --- | --- |
| 0 | Inspeção e planejamento — [docs/00-planejamento.md](docs/00-planejamento.md) | Concluída |
| 1 | Fundação, identidade visual e PWA | Concluída |
| 2 | Banco de dados, autenticação e segurança (Supabase) | Concluída — pendências de configuração abaixo |
| 3 | Contas, despesas, receitas e pagamentos manuais | Concluída |
| 4 | Juros, multas, recorrências e parcelas | Concluída |
| 5 | Dashboard, orçamento, gráficos e relatórios | Concluída |
| 6 | Notificações internas, push e WhatsApp (opcional) | Concluída — push depende de configuração (Fase 8); WhatsApp não ativado |
| 7 | Testes de integração, E2E, segurança, acessibilidade | Concluída |
| 8 | Produção, documentação final e implantação | Pendente |

**Ainda não está pronto para uso real.** Já funcionam: login, família,
convites, contas a pagar (com pagamentos parciais, encargos pagos,
cancelamentos e histórico) e lançamentos de receitas e despesas (realizados e
previstos), juros e multas estimados, contas e lançamentos que se repetem e
parcelamentos (com juros simples opcionais), painel com saldo registrado e
gráficos, orçamento mensal por categoria e relatórios mensal/trimestral/anual
com planilha (CSV) e impressão/PDF, avisos no app (contas a vencer e
vencidas, parcelas, orçamento) e avisos no celular (Web Push), que passam a
funcionar quando as chaves forem configuradas na hospedagem.

Pendências para uso real (ver [docs/supabase.md](docs/supabase.md)):
SMTP próprio para os e-mails de confirmação/recuperação, hospedagem com HTTPS
e configuração das URLs de redirecionamento no Supabase.

## Pré-requisitos

- Node.js 20.9 ou superior (desenvolvido com Node 22)
- pnpm 10 (`corepack enable` habilita a versão fixada em `package.json`)
- Para testes E2E: Chromium do Playwright (`pnpm exec playwright install chromium`
  se ainda não estiver instalado)

## Executar localmente

```bash
pnpm install
cp .env.example .env.local   # preencha URL e chave publishable do Supabase
pnpm dev                     # http://localhost:3000
```

O Service Worker só é registrado no build de produção, para não interferir
no recarregamento automático do modo de desenvolvimento. Para testar a PWA:

```bash
pnpm build && pnpm start
```

## Comandos

| Comando | Descrição |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` / `pnpm start` | Build e servidor de produção |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Tipos de rotas + `tsc --noEmit` |
| `pnpm test` | Testes unitários e de componentes (Vitest) |
| `pnpm test:watch` | Vitest em modo contínuo |
| `pnpm test:e2e` | Build + Playwright (celular 360 px e desktop) contra a pilha Supabase **local**, com login real; inclui a varredura de qualidade (`tests/e2e/authenticated/quality.spec.ts`: axe WCAG 2.1 AA em claro/escuro, 320/360 px, fonte grande 150%/200%, alvos de toque, CSP e console) |
| `pnpm test:db` | Testes de banco/RLS em PostgreSQL temporário e isolado |
| `pnpm test:integration` | Consultas e ações do servidor via supabase-js + PostgREST real, local |
| `pnpm check` | Lint + typecheck + unitários + banco + integração |
| `pnpm stack:local` | Sobe uma pilha Supabase local (PostgreSQL + Auth + REST) em `http://127.0.0.1:54321` |
| `pnpm icons` | Regera os ícones a partir do desenho em `scripts/generate-icons.mjs` |

## Documentação

- [Planejamento (Fase 0)](docs/00-planejamento.md): riscos, modelo de dados, plano por fases, variáveis e serviços externos.
- [Arquitetura](docs/arquitetura.md): estrutura, convenções de dinheiro e datas, decisões.
- [PWA](docs/pwa.md): manifest, Service Worker, atualização, instalação e limites offline.
- [Regras financeiras](docs/regras-financeiras.md): situação das contas, pagamentos, multa e juros, parcelas, recorrências e arredondamento.
- [Supabase](docs/supabase.md): migrações, modelo de segurança, testes do banco, configuração de autenticação, backup.

## Limitações conhecidas

- A política de segurança de conteúdo (CSP) permite scripts inline: o modo
  de pré-renderização parcial do Next não é compatível com nonces. Scripts de
  outros sites, `eval`, iframes e conexões externas continuam bloqueados.
- A acessibilidade foi verificada com axe (automático), teclado e larguras
  pequenas; ainda não houve teste com leitor de tela real (TalkBack) nem com
  os pais usando o app.

- Sem SMTP próprio, e-mails de confirmação/recuperação só chegam a membros
  da equipe do Supabase.
- Cada conta participa de uma única família.
- A preferência de tema fica salva no aparelho (`localStorage`), não na conta.
- Os testes (banco, integração e E2E) rodam numa pilha Supabase local
  (PostgreSQL 16 + GoTrue + PostgREST); o projeto real usa PostgreSQL 17.
  Requisitos: PostgreSQL 15+ instalado e acesso a github.com para baixar
  PostgREST/GoTrue na primeira execução.
- Uma página inexistente dentro do app (ex.: conta de outra família) mostra
  “Página não encontrada”, mas com status HTTP 200 por causa do streaming.
- Juros compostos (tabela Price) e ajuste de vencimento para dia útil não
  são calculados; as estimativas de encargos não são valores oficiais.
- Repetições semanais não existem (só mensal e anual); editar a regra de uma
  repetição exige parar e cadastrar de novo.
- Categorias ainda não podem ser editadas pela interface (usam o cadastro
  inicial). Contas de registro podem ter nome e saldo inicial ajustados em
  Ajustes, mas não criadas/arquivadas; o saldo inicial não pode ser negativo.
- O “Saldo registrado” é calculado só com o que foi lançado no Cashly; não é
  o saldo do banco.
- O relatório tem limite de 20.000 lançamentos por período (mostra erro em
  vez de totais incompletos).
- A verificação de senha vazada (HaveIBeenPwned, por k-anonimato) é feita
  pelo app no cadastro e na troca de senha; se o serviço estiver fora do ar,
  a senha é aceita (o login não fica bloqueado por um serviço externo).
- Uso offline limitado a uma página informativa; nada é salvo sem conexão.
- Avisos no app são gerados quando a pessoa abre o Cashly; avisos no celular
  dependem do agendador diário (Vercel Cron, ~8h de Brasília no plano grátis,
  horário aproximado) e das chaves VAPID. Contas vencidas há mais de 30 dias
  não geram aviso novo (continuam no painel e em Contas).
- WhatsApp não envia mensagens: exige conta Meta Business, número e modelos
  aprovados, com custo; aparece como "Não configurado".
- O teste E2E não cobre a atualização do Service Worker (limitação do
  Playwright); o fluxo é coberto por testes unitários.
