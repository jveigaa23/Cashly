-- =============================================================================
-- Cashly — 0004: regras de contas, pagamentos e lançamentos (Fase 3)
-- =============================================================================
-- * Status, cancelamentos e pagamentos só mudam por funções validadas
--   (atômicas, com bloqueio de linha). O cliente não grava status.
-- * Gatilhos "*_rules" impõem as regras quando a escrita vem da API
--   (papel authenticated). Dentro das funções SECURITY DEFINER o usuário
--   corrente é o dono do banco, e a própria função faz as validações.
-- * request_id: chave de idempotência gerada pelo formulário. Reenviar o
--   mesmo formulário (toque duplo, rede instável) não duplica registros.
-- =============================================================================

alter table public.bill_payments add column request_id uuid unique;
alter table public.transactions add column request_id uuid unique;

create or replace function private.is_api_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon');
$$;

-- Categoria precisa ser do tipo certo (despesa/receita). Categoria de outra
-- família não é visível aqui e é barrada pela FK composta.
create or replace function private.assert_category_kind(p_household_id uuid, p_category_id uuid, p_kind text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_kind text;
begin
  if p_category_id is null then
    return;
  end if;
  select kind into v_kind from public.categories
  where household_id = p_household_id and id = p_category_id;
  if v_kind is not null and v_kind <> p_kind then
    raise exception 'category_kind_mismatch' using errcode = 'P0001';
  end if;
end;
$$;

-- Status de uma conta a partir do principal já pago.
create or replace function private.bill_status_for(p_original numeric, p_paid numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_paid >= p_original then 'paid'
    when p_paid > 0 then 'partially_paid'
    else 'pending'
  end;
$$;

create or replace function private.bill_paid_principal(p_bill_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(principal_amount), 0)
  from public.bill_payments
  where bill_id = p_bill_id and canceled_at is null;
$$;

create or replace function private.assert_money(p_value numeric, p_allow_zero boolean default false)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null
     or p_value <> round(p_value, 2)
     or p_value < 0
     or (p_value = 0 and not p_allow_zero)
     or p_value > 999999999999.99 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------
create or replace function private.bills_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_paid numeric;
begin
  perform private.assert_category_kind(new.household_id, new.category_id, 'expense');

  if tg_op = 'INSERT' then
    if private.is_api_caller() then
      new.status := 'pending';
      new.canceled_at := null;
      new.cancel_reason := null;
    end if;
    return new;
  end if;

  if old.status = 'canceled' and private.is_api_caller() then
    raise exception 'bill_canceled' using errcode = 'P0001';
  end if;

  if new.original_amount is distinct from old.original_amount and new.status <> 'canceled' then
    v_paid := private.bill_paid_principal(new.id);
    if new.original_amount < v_paid then
      raise exception 'amount_below_paid' using errcode = 'P0001';
    end if;
    new.status := private.bill_status_for(new.original_amount, v_paid);
  end if;
  return new;
end;
$$;

create trigger bills_rules before insert or update on public.bills
  for each row execute function private.bills_rules();

revoke insert, update on table public.bills from authenticated;
grant insert (household_id, name, description, category_id, original_amount, due_date,
              fine_percent, interest_rate, interest_period, interest_basis)
  on table public.bills to authenticated;
grant update (name, description, category_id, original_amount, due_date,
              fine_percent, interest_rate, interest_period, interest_basis)
  on table public.bills to authenticated;

-- ---------------------------------------------------------------------------
-- bill_payments: somente pelas funções abaixo
-- ---------------------------------------------------------------------------
revoke insert, update on table public.bill_payments from authenticated;

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create or replace function private.transactions_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_category_kind(new.household_id, new.category_id, new.type);

  if not private.is_api_caller() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.bill_payment_id is not null then
      raise exception 'linked_to_payment' using errcode = 'P0001';
    end if;
    if new.status = 'canceled' or new.canceled_at is not null then
      raise exception 'use_cancel_function' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if old.status = 'canceled' then
    raise exception 'transaction_canceled' using errcode = 'P0001';
  end if;
  if new.status = 'canceled' then
    raise exception 'use_cancel_function' using errcode = 'P0001';
  end if;
  if old.bill_payment_id is not null
     and (new.amount, new.occurred_on, new.type, new.status)
         is distinct from (old.amount, old.occurred_on, old.type, old.status) then
    raise exception 'linked_to_payment' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger transactions_rules before insert or update on public.transactions
  for each row execute function private.transactions_rules();

revoke insert, update on table public.transactions from authenticated;
grant insert (household_id, type, status, amount, occurred_on, description, notes,
              category_id, account_id, payment_method, nature, request_id)
  on table public.transactions to authenticated;
grant update (type, status, amount, occurred_on, description, notes,
              category_id, account_id, payment_method, nature)
  on table public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Funções (RPC). Todas: exigem login, conferem a família pelo token,
-- bloqueiam as linhas envolvidas e fazem tudo numa única transação.
-- ---------------------------------------------------------------------------

create or replace function public.register_bill_payment(
  p_bill_id uuid,
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
  v_bill public.bills%rowtype;
  v_today date;
  v_paid numeric;
  v_principal numeric;
  v_payment_id uuid;
begin
  if p_request_id is not null then
    select id into v_payment_id from public.bill_payments
    where request_id = p_request_id
      and household_id in (select private.user_household_ids());
    if found then
      return v_payment_id; -- reenvio do mesmo formulário
    end if;
  end if;

  select * into v_bill from public.bills
  where id = p_bill_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_bill.status = 'canceled' then
    raise exception 'bill_canceled' using errcode = 'P0001';
  end if;
  if v_bill.status = 'paid' then
    raise exception 'bill_already_paid' using errcode = 'P0001';
  end if;

  perform private.assert_money(p_amount);
  perform private.assert_money(coalesce(p_charges_amount, 0), true);
  if coalesce(p_charges_amount, 0) >= p_amount then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  select (now() at time zone h.timezone)::date into v_today
  from public.households h where h.id = v_bill.household_id;
  if p_paid_on is null or p_paid_on > v_today then
    raise exception 'paid_on_in_future' using errcode = 'P0001';
  end if;

  v_paid := private.bill_paid_principal(v_bill.id);
  v_principal := p_amount - coalesce(p_charges_amount, 0);
  if v_principal > v_bill.original_amount - v_paid then
    raise exception 'payment_exceeds_outstanding' using errcode = 'P0001';
  end if;

  insert into public.bill_payments
    (household_id, bill_id, paid_on, amount, principal_amount, charges_amount, note, request_id)
  values
    (v_bill.household_id, v_bill.id, p_paid_on, p_amount, v_principal, coalesce(p_charges_amount, 0),
     nullif(btrim(p_note), ''), p_request_id)
  returning id into v_payment_id;

  -- A despesa efetiva nasce do pagamento (uma por pagamento): é ela que entra
  -- nos totais; a conta a pagar em si nunca é somada como despesa.
  insert into public.transactions
    (household_id, type, status, amount, occurred_on, description, category_id,
     account_id, payment_method, bill_payment_id)
  values
    (v_bill.household_id, 'expense', 'confirmed', p_amount, p_paid_on, 'Pagamento: ' || v_bill.name,
     v_bill.category_id, p_account_id, nullif(btrim(p_payment_method), ''), v_payment_id);

  update public.bills
  set status = private.bill_status_for(original_amount, v_paid + v_principal)
  where id = v_bill.id;

  return v_payment_id;
end;
$$;

create or replace function public.cancel_bill_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_payment public.bill_payments%rowtype;
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

  perform 1 from public.bills where id = v_payment.bill_id for update;

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
  end if;
end;
$$;

create or replace function public.cancel_bill(p_bill_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_bill public.bills%rowtype;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select * into v_bill from public.bills
  where id = p_bill_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_bill.status = 'canceled' then
    raise exception 'bill_canceled' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bill_payments where bill_id = v_bill.id and canceled_at is null) then
    raise exception 'bill_has_payments' using errcode = 'P0001';
  end if;

  update public.bills
  set status = 'canceled', canceled_at = now(), cancel_reason = btrim(p_reason)
  where id = v_bill.id;
end;
$$;

create or replace function public.cancel_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_tx public.transactions%rowtype;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select * into v_tx from public.transactions
  where id = p_transaction_id and household_id in (select private.user_household_ids())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_tx.status = 'canceled' then
    raise exception 'transaction_canceled' using errcode = 'P0001';
  end if;
  if v_tx.bill_payment_id is not null then
    raise exception 'linked_to_payment' using errcode = 'P0001';
  end if;

  update public.transactions
  set status = 'canceled', canceled_at = now(), cancel_reason = btrim(p_reason)
  where id = v_tx.id;
end;
$$;

revoke all on function public.register_bill_payment(uuid, date, numeric, numeric, uuid, text, text, uuid) from public, anon;
revoke all on function public.cancel_bill_payment(uuid, text) from public, anon;
revoke all on function public.cancel_bill(uuid, text) from public, anon;
revoke all on function public.cancel_transaction(uuid, text) from public, anon;
grant execute on function public.register_bill_payment(uuid, date, numeric, numeric, uuid, text, text, uuid) to authenticated;
grant execute on function public.cancel_bill_payment(uuid, text) to authenticated;
grant execute on function public.cancel_bill(uuid, text) to authenticated;
grant execute on function public.cancel_transaction(uuid, text) to authenticated;

revoke all on function private.is_api_caller() from public;
revoke all on function private.assert_category_kind(uuid, uuid, text) from public;
revoke all on function private.bill_status_for(numeric, numeric) from public;
revoke all on function private.bill_paid_principal(uuid) from public;
revoke all on function private.assert_money(numeric, boolean) from public;
grant execute on function private.is_api_caller() to authenticated, service_role;
grant execute on function private.assert_category_kind(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.bill_status_for(numeric, numeric) to authenticated, service_role;
grant execute on function private.bill_paid_principal(uuid) to authenticated, service_role;
