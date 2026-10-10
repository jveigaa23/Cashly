<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Convenções do Cashly

- Leia `docs/00-planejamento.md` e `docs/arquitetura.md` antes de mudar algo.
- Dinheiro: inteiros em centavos na aplicação, `NUMERIC(14,2)` no banco. Nunca float.
- Datas de calendário como `"AAAA-MM-DD"`; "hoje" sempre a partir de um instante injetado.
- Nunca exibir dados simulados como reais; telas incompletas usam `ComingSoon`.
- O Service Worker não pode armazenar HTML nem respostas de dados.
- Antes de concluir: `pnpm check` e `pnpm test:e2e`.
