# Supabase: banco, autenticação e segurança

## Projeto

| Item | Valor |
| --- | --- |
| Projeto | `cashly` (ref `fnukwrwfdwgufwnsqiia`) |
| Região | `sa-east-1` (São Paulo) |
| Plano | Gratuito (organização `jveigaa23's Org`) |
| URL | `https://fnukwrwfdwgufwnsqiia.supabase.co` |

## Migrações

Versionadas em `supabase/migrations/` e aplicadas em ordem:

| Arquivo | Conteúdo |
| --- | --- |
| `20261010160000_households.sql` | Famílias, membros, convites, funções de autorização (`private.*`), RPCs |
| `20261010160100_financial_schema.sql` | Contas, categorias, recorrências, contas a pagar, parcelas, pagamentos, lançamentos, orçamentos + RLS |
| `20261010160200_notifications_audit.sql` | Preferências e entregas de avisos, inscrições push, histórico de alterações |
| `20261010180000_bills_payments_rules.sql` | Fase 3: pagamentos e cancelamentos atômicos (RPC), status protegidos, idempotência (`request_id`), tipo de categoria |

Como aplicar em um projeto novo: SQL Editor do painel (colar cada arquivo em
ordem) ou `supabase db push` com a CLI ligada ao projeto.

**Conferir que o banco remoto é igual às migrações**: rode
`supabase/tests/schema-fingerprint.sql` no SQL Editor e no banco local de
teste; os hashes devem coincidir. (Conferido em 10/10/2026 após a migração
0004: idênticos.)

Após cada migração, regenere `src/lib/supabase/database.types.ts`.

## Modelo de segurança

1. **RLS em todas as tabelas** de `public`; nada concedido ao papel `anon`.
2. Acesso por família via `household_id in (select private.user_household_ids())`.
   As funções de `private` não são expostas pela API.
3. **FKs compostas** `(household_id, id)`: um registro não consegue apontar
   para categoria, conta ou conta a pagar de outra família.
4. `household_id` não pode mudar; `created_by` é preenchido pelo banco.
5. Ninguém apaga registros financeiros pela API (sem privilégio DELETE);
   correções usam cancelamento e ficam no `audit_log`.
6. `household_members` e `household_invites` só mudam por funções
   (`create_household`, `create_household_invite`, `revoke_household_invite`,
   `accept_household_invite`), que validam o usuário e o papel. O convite é
   vinculado ao e-mail, expira em 7 dias, é de uso único e só o hash do token
   fica no banco.
7. `audit_log` é escrito apenas por gatilho; ninguém altera nem apaga.
8. `notification_deliveries` só é criado pelo agendador (service role).
9. O app usa só a chave *publishable* + sessão do usuário; a chave secreta
   nunca vai para o navegador.
10. Status de contas, cancelamentos e pagamentos só mudam por funções
    (`register_bill_payment`, `cancel_bill_payment`, `cancel_bill`,
    `cancel_transaction`) que bloqueiam as linhas (`FOR UPDATE`) e fazem tudo
    numa transação: pagamento + despesa vinculada + novo status.
11. Cada pagamento gera exatamente uma despesa (`transactions.bill_payment_id`
    único); contas pendentes nunca são somadas como despesa.
12. `request_id` (gerado pelo formulário) torna reenvios idempotentes.

Avisos do Security Advisor: as 4 funções `SECURITY DEFINER` acima são
chamáveis por usuários logados **de propósito**; cada uma faz a própria
verificação e há testes para isso. Os avisos de desempenho (FKs sem índice
dedicado) são irrelevantes no volume de uma família.

## Pilha local e testes de integração

`pnpm stack:local` sobe PostgreSQL temporário + GoTrue v2.180 (Auth) +
PostgREST v14.1 com um gateway em `http://127.0.0.1:54321` (`/auth/v1`,
`/rest/v1`), igual à API do Supabase. Segredos fixos de teste ficam em
`scripts/local-stack-config.ts` (não usar em produção). Os binários são
baixados do GitHub na primeira vez e guardados em `node_modules/.cache`.

- `pnpm test:integration`: consultas e ações do servidor contra o PostgREST
  real (sessão e cache do Next simulados).
- `pnpm test:e2e`: build apontando para a pilha local + Playwright com
  cadastro/login reais (e-mails confirmados automaticamente).

## Testes do banco (isolados)

`pnpm test:db` sobe um PostgreSQL temporário, aplica
`supabase/tests/supabase-shim.sql` (papéis e `auth.*` como no Supabase) e as
migrações, e roda `tests/db/*.test.ts`: isolamento entre famílias, anon,
privilégios, convites, restrições financeiras, histórico e notificações.
Nunca toca o projeto real. Requer PostgreSQL 15+ instalado (ou `PG_BIN`).

## Configuração de autenticação (painel → Authentication)

| Configuração | Valor recomendado | Situação |
| --- | --- | --- |
| Provedor e-mail/senha | ligado | padrão |
| Confirmar e-mail | **ligado** | padrão |
| Tamanho mínimo da senha | 8 (o app já exige 8) | ajustar no painel |
| Site URL | URL de produção (`https://...`) | **pendente: hospedagem** |
| Redirect URLs | `https://<prod>/auth/callback`, `http://localhost:3000/auth/callback` | **pendente** |
| SMTP próprio | ex.: Resend, Brevo, Amazon SES | **pendente — ver abaixo** |
| Proteção contra senhas vazadas (HaveIBeenPwned) | ligada | pendente (aviso do Security Advisor; pode exigir plano pago) |

**SMTP é necessário para uso real.** O envio padrão do Supabase só entrega
e-mails para membros da equipe da organização e tem limite baixo por hora.
Sem SMTP próprio, os pais não recebem o e-mail de confirmação de conta nem o
de recuperação de senha.

## Backup e restauração

- Plano gratuito: **sem backups automáticos acessíveis**. Até migrar para um
  plano pago, fazer backup manual periódico (ex.: semanal):
  `pg_dump "<connection string>" --format=custom --file=cashly-AAAA-MM-DD.dump`
  (connection string em Project Settings → Database; guardar o arquivo em
  local seguro e criptografado, pois contém dados financeiros).
- Restauração: `pg_restore --clean --if-exists --no-owner -d "<connection string>" arquivo.dump`
  em um projeto novo/limpo; depois conferir a impressão digital do schema.
- Plano Pro: backups diários automáticos (7 dias) e opção de PITR.
- Projetos gratuitos são pausados após ~1 semana sem uso; reativar pelo painel
  (os dados não são perdidos).
