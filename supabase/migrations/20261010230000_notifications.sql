-- =============================================================================
-- Cashly — 0007: avisos internos, Web Push e agendador (Fase 6)
-- =============================================================================

-- Variante do aviso de orçamento: "perto do limite" (alert) ou "limite
-- ultrapassado" (over). A chave de idempotência continua sendo
-- (membro, canal, evento, referência, scheduled_for); para o orçamento,
-- scheduled_for = 1º dia do mês (alert) ou 2º dia (over), de modo que os dois
-- avisos possam existir no mesmo mês sem alterar a restrição existente.
alter table public.notification_deliveries
  add column variant text not null default '' check (variant in ('', 'alert', 'over'));

-- ---------------------------------------------------------------------------
-- Candidatos a aviso para um membro/canal numa data.
--   due_soon     conta em aberto vencendo entre hoje e hoje + N dias
--   overdue      conta ou parcela em aberto vencida há até 30 dias
--   installment  parcela em aberto (plano ativo) vencendo entre hoje e hoje + N
--   budget       limite do mês atingiu o % de aviso (alert) ou passou (over)
-- Preferência ausente = padrão: interno e push ligados, WhatsApp desligado,
-- N = 3 dias. Um aviso por referência e data (scheduled_for = vencimento ou
-- 1º/2º dia do mês do orçamento): o mesmo aviso não se repete todo dia.
-- ---------------------------------------------------------------------------
create or replace function private.notification_candidates(
  p_household uuid,
  p_member uuid,
  p_channel text,
  p_today date
)
returns table (event text, reference_type text, reference_id uuid, scheduled_for date, variant text)
language sql
stable
security definer
set search_path = ''
as $$
  with prefs as (
    select e.event,
      coalesce(p.enabled, p_channel <> 'whatsapp') as enabled,
      coalesce(p.days_before, 3) as days_before
    from unnest(array['due_soon', 'overdue', 'installment', 'budget']) as e(event)
    left join public.notification_preferences p
      on p.member_id = p_member and p.channel = p_channel and p.event = e.event
  ),
  open_bills as (
    select b.id, b.due_date from public.bills b
    where b.household_id = p_household and b.status in ('pending', 'partially_paid')
  ),
  open_installments as (
    select i.id, i.due_date from public.installments i
    join public.installment_plans pl on pl.household_id = i.household_id and pl.id = i.plan_id
    where i.household_id = p_household and pl.status = 'active' and i.status in ('pending', 'partially_paid')
  ),
  month_budgets as (
    select bu.id, bu.month, bu.limit_amount, bu.alert_percent,
      coalesce((
        select sum(t.amount) from public.transactions t
        where t.household_id = bu.household_id
          and t.type = 'expense' and t.status = 'confirmed'
          and t.occurred_on >= bu.month and t.occurred_on < (bu.month + interval '1 month')::date
          and (bu.category_id is null or t.category_id = bu.category_id)
      ), 0) as spent
    from public.budgets bu
    where bu.household_id = p_household and bu.month = date_trunc('month', p_today)::date
  )
  select 'due_soon', 'bill', b.id, b.due_date, ''
  from open_bills b join prefs p on p.event = 'due_soon' and p.enabled
  where b.due_date between p_today and p_today + p.days_before
  union all
  select 'overdue', 'bill', b.id, b.due_date, ''
  from open_bills b join prefs p on p.event = 'overdue' and p.enabled
  where b.due_date < p_today and b.due_date >= p_today - 30
  union all
  select 'overdue', 'installment', i.id, i.due_date, ''
  from open_installments i join prefs p on p.event = 'overdue' and p.enabled
  where i.due_date < p_today and i.due_date >= p_today - 30
  union all
  select 'installment', 'installment', i.id, i.due_date, ''
  from open_installments i join prefs p on p.event = 'installment' and p.enabled
  where i.due_date between p_today and p_today + p.days_before
  union all
  select 'budget', 'budget', bu.id, bu.month, 'alert'
  from month_budgets bu join prefs p on p.event = 'budget' and p.enabled
  where bu.spent * 100 >= bu.limit_amount * bu.alert_percent
  union all
  select 'budget', 'budget', bu.id, bu.month + 1, 'over'
  from month_budgets bu join prefs p on p.event = 'budget' and p.enabled
  where bu.spent > bu.limit_amount;
$$;

-- Avisos internos: cria os que faltam e dá como lidos os que perderam o
-- sentido (conta/parcela paga ou cancelada). Idempotente.
create or replace function private.refresh_in_app(p_household uuid, p_member uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  insert into public.notification_deliveries
    (household_id, member_id, channel, event, reference_type, reference_id, scheduled_for, variant, status, sent_at)
  select p_household, p_member, 'in_app', c.event, c.reference_type, c.reference_id, c.scheduled_for, c.variant, 'sent', now()
  from private.notification_candidates(p_household, p_member, 'in_app', p_today) c
  on conflict (member_id, channel, event, reference_id, scheduled_for) do nothing;
  get diagnostics v_created = row_count;

  update public.notification_deliveries d
  set status = 'read', read_at = now()
  where d.member_id = p_member and d.channel = 'in_app' and d.status <> 'read'
    and (
      (d.reference_type = 'bill' and not exists (
        select 1 from public.bills b
        where b.household_id = d.household_id and b.id = d.reference_id and b.status in ('pending', 'partially_paid')))
      or (d.reference_type = 'installment' and not exists (
        select 1 from public.installments i
        join public.installment_plans pl on pl.household_id = i.household_id and pl.id = i.plan_id
        where i.household_id = d.household_id and i.id = d.reference_id
          and pl.status = 'active' and i.status in ('pending', 'partially_paid')))
      or (d.reference_type = 'budget' and not exists (
        select 1 from public.budgets bu where bu.household_id = d.household_id and bu.id = d.reference_id))
    );
  return v_created;
end;
$$;

-- Chamado pelo app ao abrir: só para a própria pessoa, na data da família.
-- Devolve quantos avisos internos não lidos ela tem.
create or replace function public.refresh_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.user_household_id();
  v_member uuid;
  v_unread integer;
begin
  select id into v_member from public.household_members
  where household_id = v_household and user_id = (select auth.uid());
  perform private.refresh_in_app(v_household, v_member, private.household_today(v_household));
  select count(*) into v_unread from public.notification_deliveries
  where member_id = v_member and channel = 'in_app' and status <> 'read';
  return v_unread;
end;
$$;

-- ---------------------------------------------------------------------------
-- Web Push
-- ---------------------------------------------------------------------------

-- Registra o aparelho para a pessoa logada. O endpoint é um segredo do
-- aparelho: se ele já estava ligado a outra conta (aparelho compartilhado
-- que trocou de login), passa para quem o apresentou agora.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.user_household_id();
  v_member uuid;
  v_id uuid;
begin
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;
  select id into v_member from public.household_members
  where household_id = v_household and user_id = (select auth.uid());

  insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth_secret, user_agent)
  values (v_household, v_member, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set household_id = excluded.household_id, member_id = excluded.member_id,
        p256dh = excluded.p256dh, auth_secret = excluded.auth_secret,
        user_agent = excluded.user_agent, expired_at = null
  returning id into v_id;
  return v_id;
end;
$$;

-- Agendador (somente service_role): enfileira avisos push pendentes para
-- quem tem aparelho ativo, na data de cada família. Idempotente.
create or replace function public.enqueue_push_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_total integer := 0;
  v_count integer;
begin
  for v_member in
    select distinct m.household_id, m.id, (p_now at time zone h.timezone)::date as today
    from public.household_members m
    join public.households h on h.id = m.household_id
    join public.push_subscriptions s on s.member_id = m.id and s.expired_at is null
  loop
    insert into public.notification_deliveries
      (household_id, member_id, channel, event, reference_type, reference_id, scheduled_for, variant, status)
    select v_member.household_id, v_member.id, 'push', c.event, c.reference_type, c.reference_id, c.scheduled_for, c.variant, 'pending'
    from private.notification_candidates(v_member.household_id, v_member.id, 'push', v_member.today) c
    on conflict (member_id, channel, event, reference_id, scheduled_for) do nothing;
    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed de avisos com os dados da referência. security_invoker: quem consulta
-- só vê o que o RLS das tabelas permite (a pessoa vê os próprios avisos).
-- ---------------------------------------------------------------------------
create view public.notification_feed
with (security_invoker = true)
as
select
  d.id, d.household_id, d.member_id, d.channel, d.event, d.reference_type, d.reference_id,
  d.scheduled_for, d.variant, d.status, d.attempts, d.created_at, d.read_at,
  coalesce(b.name, pl.description, c.name) as reference_name,
  coalesce(b.due_date, i.due_date) as reference_due_date,
  coalesce(b.status, i.status) as reference_status,
  i.number as installment_number,
  pl.installment_count,
  i.plan_id,
  bu.month as budget_month,
  bu.alert_percent as budget_alert_percent,
  (d.reference_type = 'budget' and bu.id is not null and bu.category_id is null) as budget_general
from public.notification_deliveries d
left join public.bills b
  on d.reference_type = 'bill' and b.household_id = d.household_id and b.id = d.reference_id
left join public.installments i
  on d.reference_type = 'installment' and i.household_id = d.household_id and i.id = d.reference_id
left join public.installment_plans pl
  on pl.household_id = i.household_id and pl.id = i.plan_id
left join public.budgets bu
  on d.reference_type = 'budget' and bu.household_id = d.household_id and bu.id = d.reference_id
left join public.categories c
  on c.household_id = bu.household_id and c.id = bu.category_id;

revoke all on table public.notification_feed from public, anon, authenticated;
grant select on table public.notification_feed to authenticated, service_role;

-- Agendador: envio e expiração (service_role ignora RLS, mas precisa de grant).
grant select, update on table public.notification_deliveries to service_role;
grant select, update on table public.push_subscriptions to service_role;

revoke all on function private.notification_candidates(uuid, uuid, text, date) from public;
revoke all on function private.refresh_in_app(uuid, uuid, date) from public;
revoke all on function public.refresh_notifications() from public, anon;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.enqueue_push_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_notifications() to authenticated;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.enqueue_push_notifications(timestamptz) to service_role;
