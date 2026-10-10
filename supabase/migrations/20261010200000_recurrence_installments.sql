-- =============================================================================
-- Cashly — 0005: recorrências, parcelamentos e pagamento de parcelas (Fase 4)
-- =============================================================================
-- As regras de datas e cronogramas são as MESMAS de src/domain/recurrence.ts e
-- src/domain/installments.ts (testes cruzados garantem isso).
-- Geração idempotente: unique (recurrence_rule_id, recurrence_date) e
-- unique (plan_id, number) + "on conflict do nothing".
-- =============================================================================

alter table public.installment_plans add column request_id uuid unique;
alter table public.recurrence_rules add column request_id uuid unique;

-- Só mensal e anual nesta versão.
alter table public.recurrence_rules drop constraint recurrence_rules_frequency_check;
alter table public.recurrence_rules add constraint recurrence_rules_frequency_check
  check (frequency in ('monthly', 'yearly'));

-- ---------------------------------------------------------------------------
-- Calendário e cronogramas
-- ---------------------------------------------------------------------------

-- Soma meses mantendo o dia âncora (31/01 + 1 mês → 28/02; + 2 → 31/03).
create or replace function private.add_months_clamped(p_date date, p_months integer, p_anchor integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    extract(year from t)::int,
    extract(month from t)::int,
    least(p_anchor, extract(day from (t + interval '1 month' - interval '1 day'))::int)
  )
  from (select (date_trunc('month', p_date) + make_interval(months => p_months))::date as t) s;
$$;

create or replace function private.recurrence_dates(
  p_frequency text, p_interval integer, p_day integer,
  p_starts date, p_ends date, p_from date, p_until date
)
returns setof date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_anchor integer;
  v_step integer;
  v_base date := date_trunc('month', p_starts)::date;
  v_date date;
  k integer := 0;
begin
  if p_frequency not in ('monthly', 'yearly') or p_interval < 1 then
    raise exception 'invalid_recurrence' using errcode = 'P0001';
  end if;
  v_anchor := case when p_frequency = 'monthly' then coalesce(p_day, extract(day from p_starts)::int)
                   else extract(day from p_starts)::int end;
  v_step := case when p_frequency = 'monthly' then p_interval else p_interval * 12 end;
  loop
    v_date := private.add_months_clamped(v_base, k * v_step, v_anchor);
    k := k + 1;
    exit when k > 5000;
    continue when v_date < p_starts;
    exit when p_ends is not null and v_date > p_ends;
    exit when v_date > p_until;
    if v_date >= p_from then
      return next v_date;
    end if;
  end loop;
end;
$$;

create or replace function private.installment_schedule(
  p_total numeric, p_count integer, p_first date, p_method text, p_rate numeric
)
returns table (number integer, due_date date, amount numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_payable numeric;
  v_base numeric;
  v_anchor integer := extract(day from p_first)::int;
begin
  v_payable := p_total + case when p_method = 'simple_monthly' then round(p_total * p_rate * p_count / 100, 2) else 0 end;
  v_base := floor(v_payable * 100 / p_count) / 100;
  if v_base < 0.01 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  for i in 1..p_count loop
    number := i;
    due_date := private.add_months_clamped(p_first, i - 1, v_anchor);
    amount := case when i = p_count then v_payable - v_base * (p_count - 1) else v_base end;
    return next;
  end loop;
end;
$$;

create or replace function private.assert_rate(p_value numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value < 0 or p_value > 100 or p_value <> round(p_value, 6) then
    raise exception 'invalid_rate' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.user_household_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.household_members where user_id = private.require_uid();
  if v_household is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_household;
end;
$$;

create or replace function private.household_today(p_household uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone timezone)::date from public.households where id = p_household;
$$;

-- ---------------------------------------------------------------------------
-- Parcelamentos: somente por funções (cronograma consistente)
-- ---------------------------------------------------------------------------
revoke insert, update on table public.installment_plans from authenticated;
revoke insert, update on table public.installments from authenticated;
grant update (description, category_id) on table public.installment_plans to authenticated;

create or replace function private.installment_plans_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_category_kind(new.household_id, new.category_id, 'expense');
  if tg_op = 'UPDATE' and old.status = 'canceled' and private.is_api_caller() then
    raise exception 'plan_canceled' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger installment_plans_rules before insert or update on public.installment_plans
  for each row execute function private.installment_plans_rules();

create or replace function public.create_installment_plan(
  p_kind text,
  p_description text,
  p_category_id uuid,
  p_total numeric,
  p_count integer,
  p_first_due date,
  p_method text,
  p_rate numeric default 0,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.user_household_id();
  v_plan uuid;
begin
  if p_request_id is not null then
    select id into v_plan from public.installment_plans
    where request_id = p_request_id and household_id = v_household;
    if found then
      return v_plan;
    end if;
  end if;

  perform private.assert_money(p_total);
  if p_count is null or p_count < 1 or p_count > 600 then
    raise exception 'invalid_count' using errcode = 'P0001';
  end if;
  if p_method is null or p_method not in ('none', 'simple_monthly') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  perform private.assert_rate(coalesce(p_rate, 0));
  if p_method = 'none' and coalesce(p_rate, 0) <> 0 then
    raise exception 'invalid_rate' using errcode = 'P0001';
  end if;
  if p_first_due is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  insert into public.installment_plans
    (household_id, kind, description, category_id, total_amount, installment_count,
     first_due_date, interest_method, interest_rate, request_id)
  values
    (v_household, p_kind, btrim(p_description), p_category_id, p_total, p_count,
     p_first_due, p_method, coalesce(p_rate, 0), p_request_id)
  returning id into v_plan;

  insert into public.installments (household_id, plan_id, number, due_date, expected_amount)
  select v_household, v_plan, s.number, s.due_date, s.amount
  from private.installment_schedule(p_total, p_count, p_first_due, p_method, coalesce(p_rate, 0)) s
  on conflict (plan_id, number) do nothing;

  return v_plan;
end;
$$;

create or replace function private.installment_paid_principal(p_installment_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(principal_amount), 0)
  from public.bill_payments
  where installment_id = p_installment_id and canceled_at is null;
$$;

create or replace function private.refresh_plan_status(p_plan_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.installment_plans p
  set status = case
    when exists (
      select 1 from public.installments i
      where i.plan_id = p.id and i.status in ('pending', 'partially_paid')
    ) then 'active'
    else 'finished'
  end
  where p.id = p_plan_id and p.status <> 'canceled';
$$;

create or replace function public.register_installment_payment(
  p_installment_id uuid,
  p_paid_on date,
  p_amount numeric,
  p_charges_amount numeric default 0,
  p_account_id uuid default null,
  p_payment_method text default null,
  p_note text default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_inst public.installments%rowtype;
  v_plan public.installment_plans%rowtype;
  v_paid numeric;
  v_principal numeric;
  v_payment_id uuid;
begin
  if p_request_id is not null then
    select id into v_payment_id from public.bill_payments
    where request_id = p_request_id and household_id in (select private.user_household_ids());
    if found then
      return v_payment_id;
    end if;
  end if;

  select * into v_inst from public.installments
  where id = p_installment_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_plan from public.installment_plans where id = v_inst.plan_id for update;
  if v_inst.status = 'canceled' or v_plan.status = 'canceled' then
    raise exception 'plan_canceled' using errcode = 'P0001';
  end if;
  if v_inst.status = 'paid' then
    raise exception 'installment_already_paid' using errcode = 'P0001';
  end if;

  perform private.assert_money(p_amount);
  perform private.assert_money(coalesce(p_charges_amount, 0), true);
  if coalesce(p_charges_amount, 0) >= p_amount then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on > private.household_today(v_inst.household_id) then
    raise exception 'paid_on_in_future' using errcode = 'P0001';
  end if;

  v_paid := private.installment_paid_principal(v_inst.id);
  v_principal := p_amount - coalesce(p_charges_amount, 0);
  if v_principal > v_inst.expected_amount - v_paid then
    raise exception 'payment_exceeds_outstanding' using errcode = 'P0001';
  end if;

  insert into public.bill_payments
    (household_id, installment_id, paid_on, amount, principal_amount, charges_amount, note, request_id)
  values
    (v_inst.household_id, v_inst.id, p_paid_on, p_amount, v_principal, coalesce(p_charges_amount, 0),
     nullif(btrim(p_note), ''), p_request_id)
  returning id into v_payment_id;

  insert into public.transactions
    (household_id, type, status, amount, occurred_on, description, category_id,
     account_id, payment_method, bill_payment_id)
  values
    (v_inst.household_id, 'expense', 'confirmed', p_amount, p_paid_on,
     left(format('Parcela %s/%s: %s', v_inst.number, v_plan.installment_count, v_plan.description), 120),
     v_plan.category_id, p_account_id, nullif(btrim(p_payment_method), ''), v_payment_id);

  update public.installments
  set status = private.bill_status_for(expected_amount, v_paid + v_principal)
  where id = v_inst.id;
  perform private.refresh_plan_status(v_plan.id);

  return v_payment_id;
end;
$$;

-- Cancelar pagamento agora também atende parcelas.
create or replace function public.cancel_bill_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_payment public.bill_payments%rowtype;
  v_plan_id uuid;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select * into v_payment from public.bill_payments
  where id = p_payment_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_payment.canceled_at is not null then
    raise exception 'payment_canceled' using errcode = 'P0001';
  end if;

  if v_payment.bill_id is not null then
    perform 1 from public.bills where id = v_payment.bill_id for update;
  else
    select plan_id into v_plan_id from public.installments where id = v_payment.installment_id for update;
  end if;

  update public.bill_payments
  set canceled_at = now(), cancel_reason = btrim(p_reason)
  where id = v_payment.id;

  update public.transactions
  set status = 'canceled', canceled_at = now(), cancel_reason = 'Pagamento cancelado: ' || btrim(p_reason)
  where bill_payment_id = v_payment.id and status <> 'canceled';

  if v_payment.bill_id is not null then
    update public.bills
    set status = private.bill_status_for(original_amount, private.bill_paid_principal(id))
    where id = v_payment.bill_id and status <> 'canceled';
  else
    update public.installments
    set status = private.bill_status_for(expected_amount, private.installment_paid_principal(id))
    where id = v_payment.installment_id and status <> 'canceled';
    perform private.refresh_plan_status(v_plan_id);
  end if;
end;
$$;

create or replace function public.cancel_installment_plan(p_plan_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_plan public.installment_plans%rowtype;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into v_plan from public.installment_plans
  where id = p_plan_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_plan.status = 'canceled' then
    raise exception 'plan_canceled' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.bill_payments bp
    join public.installments i on i.id = bp.installment_id
    where i.plan_id = v_plan.id and bp.canceled_at is null
  ) then
    raise exception 'plan_has_payments' using errcode = 'P0001';
  end if;

  update public.installments set status = 'canceled' where plan_id = v_plan.id;
  update public.installment_plans
  set status = 'canceled', canceled_at = now(), cancel_reason = btrim(p_reason)
  where id = v_plan.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recorrências: somente por funções (modelo validado)
-- ---------------------------------------------------------------------------
revoke insert, update on table public.recurrence_rules from authenticated;

create or replace function private.generate_recurrences_for(p_household uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recurrence_rules%rowtype;
  d date;
  t jsonb;
  v_count integer := 0;
begin
  for r in
    select * from public.recurrence_rules where household_id = p_household and active
  loop
    t := r.template;
    for d in
      select * from private.recurrence_dates(r.frequency, r.interval_count, r.day_of_month,
                                             r.starts_on, r.ends_on, r.starts_on, p_until)
    loop
      if r.target = 'bill' then
        insert into public.bills
          (household_id, name, description, category_id, original_amount, due_date,
           fine_percent, interest_rate, interest_period, interest_basis, recurrence_rule_id, recurrence_date)
        values
          (p_household, t ->> 'name', t ->> 'description', (t ->> 'category_id')::uuid,
           (t ->> 'amount')::numeric, d,
           coalesce((t ->> 'fine_percent')::numeric, 0), coalesce((t ->> 'interest_rate')::numeric, 0),
           t ->> 'interest_period', coalesce(t ->> 'interest_basis', 'original'), r.id, d)
        on conflict (recurrence_rule_id, recurrence_date) do nothing;
      else
        insert into public.transactions
          (household_id, type, status, amount, occurred_on, description, notes, category_id,
           account_id, recurrence_rule_id, recurrence_date)
        values
          (p_household, r.target, 'planned', (t ->> 'amount')::numeric, d, t ->> 'description',
           t ->> 'notes', (t ->> 'category_id')::uuid, (t ->> 'account_id')::uuid, r.id, d)
        on conflict (recurrence_rule_id, recurrence_date) do nothing;
      end if;
      if found then
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Gera as ocorrências até ~1 mês à frente para a família do usuário.
create or replace function public.generate_recurrences()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.user_household_id();
begin
  return private.generate_recurrences_for(v_household, private.household_today(v_household) + 35);
end;
$$;

create or replace function public.create_recurrence(
  p_target text,
  p_frequency text,
  p_interval integer,
  p_day_of_month integer,
  p_starts_on date,
  p_ends_on date,
  p_template jsonb,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.user_household_id();
  v_rule uuid;
  v_amount numeric;
  v_category uuid;
  v_account uuid;
  v_template jsonb;
  v_text text;
begin
  if p_request_id is not null then
    select id into v_rule from public.recurrence_rules
    where request_id = p_request_id and household_id = v_household;
    if found then
      return v_rule;
    end if;
  end if;

  if p_target not in ('bill', 'income', 'expense') or p_frequency not in ('monthly', 'yearly')
     or p_interval is null or p_interval not between 1 and 12 or p_starts_on is null
     or (p_ends_on is not null and p_ends_on < p_starts_on)
     or (p_day_of_month is not null and p_day_of_month not between 1 and 31)
     or jsonb_typeof(p_template) <> 'object' then
    raise exception 'invalid_recurrence' using errcode = 'P0001';
  end if;

  begin
    v_amount := (p_template ->> 'amount')::numeric;
    v_category := nullif(p_template ->> 'category_id', '')::uuid;
    v_account := nullif(p_template ->> 'account_id', '')::uuid;
  exception when others then
    raise exception 'invalid_recurrence' using errcode = 'P0001';
  end;
  perform private.assert_money(v_amount);
  perform private.assert_category_kind(v_household, v_category, case when p_target = 'income' then 'income' else 'expense' end);
  if v_category is not null and not exists (select 1 from public.categories where id = v_category and household_id = v_household) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_account is not null and not exists (select 1 from public.accounts where id = v_account and household_id = v_household) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_target = 'bill' then
    v_text := btrim(coalesce(p_template ->> 'name', ''));
    if char_length(v_text) not between 1 and 80 then
      raise exception 'invalid_recurrence' using errcode = 'P0001';
    end if;
    perform private.assert_rate(coalesce((p_template ->> 'fine_percent')::numeric, 0));
    perform private.assert_rate(coalesce((p_template ->> 'interest_rate')::numeric, 0));
    if coalesce((p_template ->> 'interest_rate')::numeric, 0) > 0
       and coalesce(p_template ->> 'interest_period', '') not in ('daily', 'monthly') then
      raise exception 'invalid_rate' using errcode = 'P0001';
    end if;
    v_template := jsonb_build_object(
      'name', v_text,
      'amount', v_amount,
      'category_id', v_category,
      'description', nullif(btrim(coalesce(p_template ->> 'description', '')), ''),
      'fine_percent', coalesce((p_template ->> 'fine_percent')::numeric, 0),
      'interest_rate', coalesce((p_template ->> 'interest_rate')::numeric, 0),
      'interest_period', nullif(p_template ->> 'interest_period', ''),
      'interest_basis', coalesce(nullif(p_template ->> 'interest_basis', ''), 'original')
    );
  else
    v_text := btrim(coalesce(p_template ->> 'description', ''));
    if char_length(v_text) not between 1 and 120 then
      raise exception 'invalid_recurrence' using errcode = 'P0001';
    end if;
    v_template := jsonb_build_object(
      'description', v_text,
      'amount', v_amount,
      'category_id', v_category,
      'account_id', v_account,
      'notes', nullif(btrim(coalesce(p_template ->> 'notes', '')), '')
    );
  end if;

  insert into public.recurrence_rules
    (household_id, target, frequency, interval_count, day_of_month, starts_on, ends_on, template, request_id)
  values
    (v_household, p_target, p_frequency, p_interval,
     case when p_frequency = 'monthly' then coalesce(p_day_of_month, extract(day from p_starts_on)::int) end,
     p_starts_on, p_ends_on, v_template, p_request_id)
  returning id into v_rule;

  perform private.generate_recurrences_for(v_household, private.household_today(v_household) + 35);
  return v_rule;
end;
$$;

-- Para de repetir e cancela as ocorrências FUTURAS ainda sem pagamento.
create or replace function public.stop_recurrence(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.recurrence_rules%rowtype;
  v_today date;
begin
  perform private.require_uid();
  select * into v_rule from public.recurrence_rules
  where id = p_rule_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_today := private.household_today(v_rule.household_id);

  update public.recurrence_rules set active = false where id = v_rule.id;

  update public.bills b
  set status = 'canceled', canceled_at = now(), cancel_reason = 'Repetição encerrada'
  where b.recurrence_rule_id = v_rule.id and b.due_date > v_today and b.status = 'pending'
    and not exists (select 1 from public.bill_payments bp where bp.bill_id = b.id and bp.canceled_at is null);

  update public.transactions
  set status = 'canceled', canceled_at = now(), cancel_reason = 'Repetição encerrada'
  where recurrence_rule_id = v_rule.id and occurred_on > v_today and status = 'planned';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------
revoke all on function public.create_installment_plan(text, text, uuid, numeric, integer, date, text, numeric, uuid) from public, anon;
revoke all on function public.register_installment_payment(uuid, date, numeric, numeric, uuid, text, text, uuid) from public, anon;
revoke all on function public.cancel_installment_plan(uuid, text) from public, anon;
revoke all on function public.generate_recurrences() from public, anon;
revoke all on function public.create_recurrence(text, text, integer, integer, date, date, jsonb, uuid) from public, anon;
revoke all on function public.stop_recurrence(uuid) from public, anon;
grant execute on function public.create_installment_plan(text, text, uuid, numeric, integer, date, text, numeric, uuid) to authenticated;
grant execute on function public.register_installment_payment(uuid, date, numeric, numeric, uuid, text, text, uuid) to authenticated;
grant execute on function public.cancel_installment_plan(uuid, text) to authenticated;
grant execute on function public.generate_recurrences() to authenticated;
grant execute on function public.create_recurrence(text, text, integer, integer, date, date, jsonb, uuid) to authenticated;
grant execute on function public.stop_recurrence(uuid) to authenticated;

revoke all on function private.add_months_clamped(date, integer, integer) from public;
revoke all on function private.recurrence_dates(text, integer, integer, date, date, date, date) from public;
revoke all on function private.installment_schedule(numeric, integer, date, text, numeric) from public;
revoke all on function private.assert_rate(numeric) from public;
revoke all on function private.user_household_id() from public;
revoke all on function private.household_today(uuid) from public;
revoke all on function private.installment_paid_principal(uuid) from public;
revoke all on function private.refresh_plan_status(uuid) from public;
revoke all on function private.generate_recurrences_for(uuid, date) from public;
grant execute on function private.is_api_caller() to authenticated;
