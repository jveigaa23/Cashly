# Banco, autenticação e segurança (Neon)

## Projeto

| Item | Valor |
| --- | --- |
| Projeto | `cashly` (id `broad-leaf-06438164`), branch `main` |
| Região | `aws-sa-east-1` (São Paulo), PostgreSQL 17 |
| Banco | `cashly` |
| Login | Neon Auth (Better Auth gerenciado), usuários em `neon_auth."user"` |
| API de dados | Neon Data API (PostgREST), valida o JWT do Neon Auth |

Migrado do Supabase em 17/11/2026: schema, permissões, RLS, funções e
todos os registros foram copiados e conferidos por hash (tabela a tabela,
linha a linha). Os usuários mantiveram os mesmos IDs; **as senhas não foram
migradas** (formato de hash diferente), então cada pessoa cria uma nova senha
em "Esqueci minha senha" no primeiro acesso.

## Como o app fala com o banco

- **Pessoas logadas**: o servidor do Next pede ao Neon Auth o JWT da sessão
  (`src/lib/db/server.ts`) e consulta o Data API com ele. O banco valida o
  token e o RLS usa `auth.uid()` (extensão `pg_session_jwt`), igual ao
  Supabase. O navegador nunca fala com o Neon.
- **Agendador de avisos** (`/api/cron/notificacoes`): conexão direta
  (`DATABASE_URL`) e, em cada transação, `SET LOCAL ROLE service_role`
  (`src/lib/db/admin.ts`). É o único lugar com acesso privilegiado.

Papéis: `anonymous` (sem login, nenhum privilégio), `authenticated` (logado,
limitado pelo RLS) e `service_role` (sem login próprio, ignora o RLS; só o
agendador assume).

## Migrações

Em `db/migrations/`, aplicadas em ordem:

| Arquivo | Conteúdo |
| --- | --- |
| `20261010000000_neon_prelude.sql` | `service_role`, permissões em `auth`, privilégios padrão iguais aos do Supabase (as migrações seguintes foram escritas para eles) |
| `20261010160000_households.sql` | Famílias, membros, convites, funções de autorização (`private.*`), RPCs |
| `20261010160100_financial_schema.sql` | Contas, categorias, recorrências, contas a pagar, parcelas, pagamentos, lançamentos, orçamentos + RLS |
| `20261010160200_notifications_audit.sql` | Preferências e entregas de avisos, inscrições push, histórico de alterações |
| `20261010180000_bills_payments_rules.sql` | Pagamentos e cancelamentos atômicos (RPC), status protegidos, idempotência (`request_id`) |
| `20261010200000_recurrence_installments.sql` | Recorrências e parcelamentos |
| `20261010220000_budgets_balance.sql` | Remoção de orçamentos, saldo inicial, `registered_balance(date)` |
| `20261010230000_notifications.sql` | Avisos internos, push, `notification_feed` |
| `20261117000000_neon_default_privileges.sql` | Desliga os privilégios automáticos: daqui em diante cada migração concede o que precisa |

Como aplicar uma migração nova: SQL Editor do Console do Neon (ou `psql`
com a connection string). Teste antes numa branch do Neon (Branches →
Create branch), que copia banco e usuários do Neon Auth.

**Conferir que o banco remoto é igual às migrações**: rode
`db/tests/schema-fingerprint.sql` no SQL Editor e no banco local de teste;
os hashes devem coincidir.

Após cada migração, atualize `src/lib/db/database.types.ts` (tipos do
PostgREST; o formato é o mesmo do gerador do Supabase).

## Modelo de segurança

1. **RLS em todas as tabelas** de `public`; nada concedido ao papel `anonymous`.
2. Acesso por família via `household_id in (select private.user_household_ids())`.
   As funções de `private` não são expostas pela API.
3. **FKs compostas** `(household_id, id)`: um registro não consegue apontar
   para categoria, conta ou conta a pagar de outra família.
4. `household_id` não pode mudar; `created_by` é preenchido pelo banco.
5. Ninguém apaga registros financeiros pela API (sem privilégio DELETE);
   correções usam cancelamento e ficam no `audit_log`.
6. `household_members` e `household_invites` só mudam por funções que
   validam o usuário e o papel. O convite é vinculado ao e-mail (claim
   `email` do JWT), expira em 7 dias, é de uso único e só o hash do token
   fica no banco.
7. `audit_log` é escrito apenas por gatilho; ninguém altera nem apaga.
8. `notification_deliveries` push só é criado pelo agendador (`service_role`).
9. Status de contas, cancelamentos e pagamentos só mudam por funções que
   bloqueiam as linhas (`FOR UPDATE`) e fazem tudo numa transação.
10. `request_id` (gerado pelo formulário) torna reenvios idempotentes.

## Neon Auth (Console → Auth)

| Configuração | Valor | Situação |
| --- | --- | --- |
| E-mail e senha | ligado, cadastro aberto | configurado |
| Verificação de e-mail | desligada (como era no Supabase) | configurado |
| Domínios confiáveis | `https://cashly-familia.vercel.app` | **conferir** |
| Envio de e-mails | remetente compartilhado do Neon (`auth@mail.myneon.app`) | funciona; um remetente próprio é opcional |
| Senha vazada (HaveIBeenPwned) | o app verifica no cadastro e nas trocas de senha (`src/server/password-check.ts`) | ativo |

Senha nova: "Esqueci minha senha" → e-mail do Neon Auth → link abre
`/redefinir-senha?token=...` no app. Troca de senha logado: Ajustes →
"Alterar senha" (pede a senha atual).

## Testes do banco (isolados)

`pnpm test:db` sobe um PostgreSQL temporário, aplica `db/tests/neon-shim.sql`
(papéis, `neon_auth."user"` e `auth.*` como no Neon) e as migrações, e roda
`tests/db/*.test.ts`: isolamento entre famílias, `anonymous`, privilégios,
convites, restrições financeiras, histórico e notificações. Nunca toca o
projeto real. Requer PostgreSQL 15+ instalado (ou `PG_BIN`).

`pnpm test:integration` faz o mesmo com um PostgREST real (o motor do Data
API) e roda as consultas e ações do servidor com JWTs de teste.

## Backup e restauração

- O Neon guarda o histórico para restaurar a um ponto no tempo (janela de
  6 horas no plano gratuito): Console → Restore. Antes de mudanças grandes,
  crie uma branch (é uma cópia instantânea).
- Backup manual: `pg_dump "<connection string>" --format=custom --file=cashly-AAAA-MM-DD.dump`
  (guardar em local seguro e criptografado: contém dados financeiros).
- O banco do plano gratuito desliga sozinho sem uso e liga na primeira
  consulta (alguns centésimos de segundo a mais); não perde dados.
