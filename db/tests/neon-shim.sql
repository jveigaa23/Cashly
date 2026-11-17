-- Réplica mínima do ambiente Neon (Neon Auth + Data API) para testes locais.
-- NÃO aplicar em projeto real. Reproduz o que o Neon cria sozinho:
--   * papéis do Data API: "anonymous" (sem login) e "authenticated";
--   * neon_auth."user" (tabela de usuários do Neon Auth);
--   * auth.uid()/auth.jwt()/auth.user_id() (extensão pg_session_jwt), aqui
--     lendo as claims de request.jwt.claims, como o PostgREST local define.
-- O restante (service_role, privilégios) vem de db/migrations, como no Neon.

create role anonymous nologin noinherit;
create role authenticated nologin noinherit;

create schema neon_auth;
create table neon_auth."user" (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null unique,
  "emailVerified" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create schema auth;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.user_id() returns text
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select case when auth.user_id() ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then auth.user_id()::uuid end
$$;
