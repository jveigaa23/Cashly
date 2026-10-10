-- =============================================================================
-- Cashly — 0001: famílias, membros, convites e funções de autorização
-- =============================================================================
-- Convenções:
--   * Funções auxiliares ficam no schema "private" (não exposto pela API).
--   * Toda função SECURITY DEFINER usa search_path vazio e nomes qualificados.
--   * Um usuário pertence a no máximo uma família (simplifica o app; pode ser
--     relaxado no futuro removendo a restrição household_members_one_per_user).
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gatilhos genéricos
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Impede mover um registro para outra família e fixa o autor no servidor.
create or replace function private.guard_household_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    if new.household_id is distinct from old.household_id then
      raise exception 'household_id não pode ser alterado' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  timezone text not null default 'America/Sao_Paulo',
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.households is 'Família: unidade de compartilhamento dos dados financeiros.';
comment on column public.households.is_demo is 'Família de demonstração (dados fictícios). Nunca misturar com dados reais.';

create or replace function private.validate_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Lança erro se o fuso não existir.
  perform now() at time zone new.timezone;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.is_demo := old.is_demo;
  end if;
  return new;
end;
$$;

create trigger households_validate before insert or update on public.households
  for each row execute function private.validate_household();
create trigger households_updated_at before update on public.households
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_members_one_per_user unique (user_id),
  unique (household_id, id)
);

create index household_members_household_idx on public.household_members (household_id);

create trigger household_members_updated_at before update on public.household_members
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Funções de autorização usadas pelas políticas RLS.
-- SECURITY DEFINER para não recursar nas políticas de household_members.
-- Retornam conjuntos para que o Postgres avalie uma vez por consulta.
-- ---------------------------------------------------------------------------

create or replace function private.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid());
$$;

create or replace function private.user_owned_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid()) and m.role = 'owner';
$$;

create or replace function private.user_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.household_members m
  where m.user_id = (select auth.uid());
$$;

revoke all on function private.user_household_ids() from public;
revoke all on function private.user_owned_household_ids() from public;
revoke all on function private.user_member_ids() from public;
grant execute on function private.user_household_ids() to authenticated, service_role;
grant execute on function private.user_owned_household_ids() to authenticated, service_role;
grant execute on function private.user_member_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- household_invites
-- ---------------------------------------------------------------------------

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  email text not null check (
    email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  -- Apenas o hash SHA-256 do token é guardado; o token aparece uma única vez.
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (not (accepted_at is not null and revoked_at is not null))
);

create index household_invites_household_idx on public.household_invites (household_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

create policy "membros veem a própria família" on public.households
  for select to authenticated
  using (id in (select private.user_household_ids()));

create policy "dono altera a família" on public.households
  for update to authenticated
  using (id in (select private.user_owned_household_ids()))
  with check (id in (select private.user_owned_household_ids()));

create policy "membros veem membros da família" on public.household_members
  for select to authenticated
  using (household_id in (select private.user_household_ids()));

create policy "membro altera o próprio nome" on public.household_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "dono vê convites" on public.household_invites
  for select to authenticated
  using (household_id in (select private.user_owned_household_ids()));

-- Privilégios: nada para anon; inserções em membros/convites só via funções.
revoke all on table public.households, public.household_members, public.household_invites
  from anon, authenticated;
grant select on table public.households, public.household_members, public.household_invites
  to authenticated;
grant update (name, timezone) on table public.households to authenticated;
grant update (display_name) on table public.household_members to authenticated;

-- ---------------------------------------------------------------------------
-- Funções chamadas pelo app (RPC). Validam o usuário autenticado no servidor.
-- Erros usam mensagens estáveis (códigos) traduzidas pela aplicação.
-- ---------------------------------------------------------------------------

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_household_id uuid;
begin
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.households (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'owner', btrim(p_display_name));

  perform private.seed_household_defaults(v_household_id);
  return v_household_id;
end;
$$;

create or replace function public.create_household_invite(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_household_id uuid;
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  select household_id into v_household_id
  from public.household_members
  where user_id = v_uid and role = 'owner';

  if v_household_id is null then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.household_members m
    join auth.users u on u.id = m.user_id
    where lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  -- Limite simples contra abuso: 10 convites por família a cada 24h.
  if (
    select count(*) from public.household_invites
    where household_id = v_household_id and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  update public.household_invites
  set revoked_at = now()
  where household_id = v_household_id
    and email = v_email
    and accepted_at is null
    and revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.household_invites (household_id, email, token_hash, expires_at, created_by)
  values (
    v_household_id,
    v_email,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    now() + interval '7 days',
    v_uid
  );

  return v_token;
end;
$$;

create or replace function public.revoke_household_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.household_invites i
  set revoked_at = now()
  where i.id = p_invite_id
    and i.accepted_at is null
    and i.revoked_at is null
    and i.household_id in (
      select household_id from public.household_members
      where user_id = v_uid and role = 'owner'
    );
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.accept_household_invite(p_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_email text := lower((select auth.jwt()) ->> 'email');
  v_invite public.household_invites%rowtype;
begin
  select * into v_invite
  from public.household_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  if v_email is null or v_invite.email <> v_email then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_invite.household_id, v_uid, 'member', btrim(p_display_name));

  update public.household_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.create_household_invite(text) from public, anon;
revoke all on function public.revoke_household_invite(uuid) from public, anon;
revoke all on function public.accept_household_invite(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_household_invite(text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.accept_household_invite(text, text) to authenticated;
revoke all on function private.require_uid() from public;
