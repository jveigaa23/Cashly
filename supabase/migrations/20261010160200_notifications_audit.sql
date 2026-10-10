-- =============================================================================
-- Cashly — 0003: notificações e histórico de alterações (auditoria)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- notification_preferences — por membro, canal e tipo de aviso
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  member_id uuid not null,
  channel text not null check (channel in ('in_app', 'push', 'whatsapp')),
  event text not null check (event in ('due_soon', 'overdue', 'installment', 'budget')),
  enabled boolean not null default true,
  days_before integer not null default 3 check (days_before between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.household_members (household_id, id) on delete cascade,
  unique (member_id, channel, event)
);

-- ---------------------------------------------------------------------------
-- notification_deliveries — registro de envios. Sem conteúdo financeiro:
-- guarda apenas o tipo, a referência e o status real de entrega.
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  member_id uuid not null,
  channel text not null check (channel in ('in_app', 'push', 'whatsapp')),
  event text not null check (event in ('due_soon', 'overdue', 'installment', 'budget')),
  reference_type text not null check (reference_type in ('bill', 'installment', 'budget')),
  reference_id uuid not null,
  scheduled_for date not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'not_configured', 'read')),
  error_code text check (char_length(error_code) <= 60),
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.household_members (household_id, id) on delete cascade,
  -- Idempotência do agendador: um aviso por membro/canal/evento/referência/dia.
  unique (member_id, channel, event, reference_id, scheduled_for)
);
create index notification_deliveries_member_idx on public.notification_deliveries (member_id, status);

-- ---------------------------------------------------------------------------
-- push_subscriptions — uma inscrição Web Push por dispositivo
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  member_id uuid not null,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth_secret text not null,
  user_agent text check (char_length(user_agent) <= 300),
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.household_members (household_id, id) on delete cascade
);
create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();
create trigger notification_deliveries_updated_at before update on public.notification_deliveries
  for each row execute function private.set_updated_at();
create trigger push_subscriptions_updated_at before update on public.push_subscriptions
  for each row execute function private.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on table public.notification_preferences, public.notification_deliveries,
  public.push_subscriptions from anon, authenticated;

-- Preferências: cada pessoa gerencia as suas.
grant select, insert, update on table public.notification_preferences to authenticated;
create policy "membro gerencia suas preferências" on public.notification_preferences
  for all to authenticated
  using (member_id in (select private.user_member_ids()))
  with check (
    member_id in (select private.user_member_ids())
    and household_id in (select private.user_household_ids())
  );

-- Entregas: criadas só pelo agendador (service_role). A pessoa vê as suas e
-- pode apenas marcar como lida.
grant select on table public.notification_deliveries to authenticated;
grant update (status, read_at) on table public.notification_deliveries to authenticated;
create policy "membro vê seus avisos" on public.notification_deliveries
  for select to authenticated
  using (member_id in (select private.user_member_ids()));
create policy "membro marca aviso como lido" on public.notification_deliveries
  for update to authenticated
  using (member_id in (select private.user_member_ids()))
  with check (member_id in (select private.user_member_ids()) and status = 'read');

-- Inscrições push: cada pessoa gerencia os próprios dispositivos.
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
create policy "membro gerencia seus dispositivos" on public.push_subscriptions
  for all to authenticated
  using (member_id in (select private.user_member_ids()))
  with check (
    member_id in (select private.user_member_ids())
    and household_id in (select private.user_household_ids())
  );

-- ---------------------------------------------------------------------------
-- audit_log — histórico de alterações. Só o gatilho escreve; ninguém altera
-- nem apaga pela API.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete restrict,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update')),
  actor_id uuid references auth.users (id) on delete set null,
  changes jsonb not null,
  at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, at);
create index audit_log_household_idx on public.audit_log (household_id, at);

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb := to_jsonb(new) - 'updated_at';
  v_changes jsonb;
  v_household_id uuid;
begin
  v_household_id := case when tg_table_name = 'households' then new.id else (v_new ->> 'household_id')::uuid end;

  if tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_old := to_jsonb(old) - 'updated_at';
    select coalesce(jsonb_object_agg(key, jsonb_build_object('old', v_old -> key, 'new', value)), '{}'::jsonb)
      into v_changes
    from jsonb_each(v_new)
    where v_new -> key is distinct from v_old -> key;

    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_log (household_id, entity, entity_id, action, actor_id, changes)
  values (v_household_id, tg_table_name, new.id, lower(tg_op), auth.uid(), v_changes);
  return null;
end;
$$;

revoke all on function private.audit_row() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'households', 'household_members', 'accounts', 'categories', 'recurrence_rules',
    'bills', 'installment_plans', 'installments', 'bill_payments', 'transactions', 'budgets'
  ] loop
    execute format(
      'create trigger %1$s_audit after insert or update on public.%1$I
         for each row execute function private.audit_row()', t);
  end loop;
end;
$$;

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
create policy "membros leem o histórico" on public.audit_log
  for select to authenticated
  using (household_id in (select private.user_household_ids()));
