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
| 2 | Banco de dados, autenticação e segurança (Supabase) | Pendente — requer projeto Supabase |
| 3 | Contas, despesas, receitas e pagamentos manuais | Pendente |
| 4 | Juros, multas, recorrências e parcelas | Pendente |
| 5 | Dashboard, orçamento, gráficos e relatórios | Pendente |
| 6 | Notificações internas, push e WhatsApp (opcional) | Pendente |
| 7 | Testes de integração, E2E, segurança, acessibilidade | Pendente |
| 8 | Produção, documentação final e implantação | Pendente |

**Ainda não está pronto para uso real**: não há persistência nem login
(Fase 2). As telas de contas, lançamentos e relatórios informam a fase em que
serão liberadas e não exibem dados simulados.

## Pré-requisitos

- Node.js 20.9 ou superior (desenvolvido com Node 22)
- pnpm 10 (`corepack enable` habilita a versão fixada em `package.json`)
- Para testes E2E: Chromium do Playwright (`pnpm exec playwright install chromium`
  se ainda não estiver instalado)

## Executar localmente

```bash
pnpm install
cp .env.example .env.local   # nenhuma variável é necessária na Fase 1
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
| `pnpm test:e2e` | Build de produção + Playwright (celular 360 px e desktop) |
| `pnpm check` | Lint + typecheck + testes unitários |
| `pnpm icons` | Regera os ícones a partir do desenho em `scripts/generate-icons.mjs` |

## Documentação

- [Planejamento (Fase 0)](docs/00-planejamento.md): riscos, modelo de dados, plano por fases, variáveis e serviços externos.
- [Arquitetura](docs/arquitetura.md): estrutura, convenções de dinheiro e datas, decisões.
- [PWA](docs/pwa.md): manifest, Service Worker, atualização, instalação e limites offline.

## Limitações conhecidas (Fase 1)

- Sem banco de dados e sem login: nenhum dado financeiro é salvo ainda.
- A preferência de tema fica salva no aparelho (`localStorage`), não na conta.
- Uso offline limitado a uma página informativa; nada é salvo sem conexão.
- O teste E2E não cobre a atualização do Service Worker (limitação do
  Playwright); o fluxo é coberto por testes unitários.
