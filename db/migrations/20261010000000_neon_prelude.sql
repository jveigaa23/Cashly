-- Neon: preparação do banco antes das migrações do Cashly.
--
-- O Neon Auth (Better Auth gerenciado) guarda os usuários em neon_auth."user"
-- e o Data API (PostgREST) troca de papel conforme o JWT: "authenticated"
-- (logado) ou "anonymous". A extensão pg_session_jwt, instalada pelo Data
-- API, fornece auth.uid() e auth.jwt() com a mesma semântica do Supabase.
--
-- service_role: papel sem login, que ignora o RLS, usado SOMENTE pelo agendador
-- de avisos (conexão direta com o dono do banco + SET LOCAL ROLE service_role).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;
grant service_role to current_user;

-- As políticas e funções chamam auth.uid()/auth.jwt() no papel de quem consulta.
grant usage on schema auth to authenticated, anonymous, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.user_id() to authenticated, anonymous, service_role;
grant usage on schema public to authenticated, anonymous, service_role;

-- As migrações seguintes foram escritas para os privilégios padrão do Supabase
-- (tudo concedido em "public" e depois revogado/concedido explicitamente).
-- Reproduzimos esse ponto de partida para que o resultado final seja o mesmo;
-- 20261117000000_neon_default_privileges.sql desfaz o padrão ao final.
alter default privileges in schema public grant all on tables to anonymous, authenticated, service_role;
alter default privileges in schema public grant all on functions to anonymous, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anonymous, authenticated, service_role;
