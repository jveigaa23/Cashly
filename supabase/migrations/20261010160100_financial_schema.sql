-- =============================================================================
-- Cashly — 0002: schema financeiro
-- =============================================================================
-- Convenções:
--   * Valores monetários: numeric(14,2). Datas de calendário: date.
--   * Referências dentro da família usam FK composta (household_id, id): o banco
--     impede apontar para categoria/conta/conta a pagar de OUTRA família.
--   * Registros financeiros não são apagados: usam status 'canceled' +
--     canceled_at (lançamentos, contas, pagamentos) ou archived_at (cadastros).
--   * Status "vencida" NÃO é armazenado: é derivado de due_date < hoje (no fuso
--     da família) com saldo em aberto.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- accounts — onde o dinheiro está registrado (não há integração bancária)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null default 'checking' check (kind in ('checking', 'savings', 'cash', 'other')),
  opening_balance numeric(14, 2) not null default 0,
  opening_date date not null default current_date,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create unique index accounts_name_unique on public.accounts (household_id, lower(name))
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, kind, id)
);
create unique index categories_name_unique on public.categories (household_id, kind, lower(name))
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- recurrence_rules — geram contas/lançamentos de forma idempotente
-- ---------------------------------------------------------------------------
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  target text not null check (target in ('bill', 'income', 'expense')),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval_count integer not null default 1 check (interval_count between 1 and 12),
  -- Dia 29–31 em meses mais curtos cai no último dia do mês (regra da Fase 4).
  day_of_month integer check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  -- Modelo validado no servidor (Zod) antes de gravar.
  template jsonb not null default '{}'::jsonb check (jsonb_typeof(template) = 'object'),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (frequency <> 'monthly' or day_of_month is not null)
);

-- ---------------------------------------------------------------------------
-- bills — contas a pagar
-- ---------------------------------------------------------------------------
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 500),
  category_id uuid,
  original_amount numeric(14, 2) not null check (original_amount > 0),
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'partially_paid', 'paid', 'canceled')),
  -- Encargos configuráveis (cálculo na Fase 4; estimativa, não valor oficial).
  fine_percent numeric(7, 4) not null default 0 check (fine_percent between 0 and 100),
  interest_rate numeric(9, 6) not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  interest_period text check (interest_period in ('daily', 'monthly')),
  interest_basis text not null default 'original' check (interest_basis in ('original', 'outstanding')),
  recurrence_rule_id uuid,
  recurrence_date date,
  canceled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, category_id) references public.categories (household_id, id),
  foreign key (household_id, recurrence_rule_id) references public.recurrence_rules (household_id, id),
  -- Idempotência: uma regra gera no máximo uma conta por data.
  unique (recurrence_rule_id, recurrence_date),
  check ((recurrence_rule_id is null) = (recurrence_date is null)),
  check ((status = 'canceled') = (canceled_at is not null)),
  check (interest_rate = 0 or interest_period is not null)
);
create index bills_household_due_idx on public.bills (household_id, due_date);
create index bills_household_status_idx on public.bills (household_id, status);
create index bills_category_idx on public.bills (category_id);

-- ---------------------------------------------------------------------------
-- installment_plans e installments — compras parceladas, empréstimos
-- ---------------------------------------------------------------------------
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  kind text not null check (kind in ('purchase', 'loan', 'other')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  category_id uuid,
  total_amount numeric(14, 2) not null check (total_amount > 0),
  installment_count integer not null check (installment_count between 1 and 600),
  first_due_date date not null,
  -- Cada método é explícito e testado (Fase 4). Juros compostos fora do escopo.
  interest_method text not null default 'none' check (interest_method in ('none', 'simple_monthly')),
  interest_rate numeric(9, 6) not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  status text not null default 'active' check (status in ('active', 'finished', 'canceled')),
  canceled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, category_id) references public.categories (household_id, id),
  check ((status = 'canceled') = (canceled_at is not null)),
  check (interest_method <> 'none' or interest_rate = 0)
);
create index installment_plans_household_idx on public.installment_plans (household_id, status);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  plan_id uuid not null,
  number integer not null check (number >= 1),
  due_date date not null,
  expected_amount numeric(14, 2) not null check (expected_amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'partially_paid', 'paid', 'canceled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, plan_id) references public.installment_plans (household_id, id),
  -- Geração idempotente: cada número de parcela existe uma única vez no plano.
  unique (plan_id, number)
);
create index installments_household_due_idx on public.installments (household_id, due_date);
create index installments_plan_idx on public.installments (plan_id);

-- ---------------------------------------------------------------------------
-- bill_payments — pagamentos manuais (inclusive parciais) de contas e parcelas
-- ---------------------------------------------------------------------------
create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  bill_id uuid,
  installment_id uuid,
  paid_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  principal_amount numeric(14, 2) not null check (principal_amount >= 0),
  charges_amount numeric(14, 2) not null default 0 check (charges_amount >= 0),
  note text check (char_length(note) <= 300),
  canceled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, bill_id) references public.bills (household_id, id),
  foreign key (household_id, installment_id) references public.installments (household_id, id),
  check ((bill_id is null) <> (installment_id is null)),
  check (principal_amount + charges_amount = amount)
);
create index bill_payments_bill_idx on public.bill_payments (bill_id);
create index bill_payments_installment_idx on public.bill_payments (installment_id);
create index bill_payments_household_paid_idx on public.bill_payments (household_id, paid_on);

-- ---------------------------------------------------------------------------
-- transactions — receitas e despesas (realizadas ou previstas)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  -- planned = previsto (não é dinheiro realizado); confirmed = efetivo.
  status text not null default 'confirmed' check (status in ('planned', 'confirmed', 'canceled')),
  amount numeric(14, 2) not null check (amount > 0),
  occurred_on date not null,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  notes text check (char_length(notes) <= 500),
  category_id uuid,
  account_id uuid,
  -- Apenas informativo; o Cashly não executa pagamentos.
  payment_method text check (char_length(payment_method) <= 40),
  nature text check (nature in ('fixed', 'variable')),
  -- Despesa gerada por um pagamento de conta/parcela: no máximo uma por pagamento,
  -- evitando contar duas vezes.
  bill_payment_id uuid unique,
  recurrence_rule_id uuid,
  recurrence_date date,
  canceled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, category_id) references public.categories (household_id, id),
  foreign key (household_id, account_id) references public.accounts (household_id, id),
  foreign key (household_id, bill_payment_id) references public.bill_payments (household_id, id),
  foreign key (household_id, recurrence_rule_id) references public.recurrence_rules (household_id, id),
  unique (recurrence_rule_id, recurrence_date),
  check ((recurrence_rule_id is null) = (recurrence_date is null)),
  check ((status = 'canceled') = (canceled_at is not null)),
  check (bill_payment_id is null or type = 'expense')
);
create index transactions_household_date_idx on public.transactions (household_id, occurred_on);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_account_idx on public.transactions (account_id);

-- ---------------------------------------------------------------------------
-- budgets — limite mensal geral (category_id nulo) ou por categoria
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  category_id uuid,
  category_kind text not null default 'expense' check (category_kind = 'expense'),
  limit_amount numeric(14, 2) not null check (limit_amount > 0),
  alert_percent integer not null default 80 check (alert_percent between 1 and 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  -- Orçamento só vale para categorias de despesa da mesma família.
  foreign key (household_id, category_kind, category_id)
    references public.categories (household_id, kind, id),
  unique nulls not distinct (household_id, month, category_id)
);

-- ---------------------------------------------------------------------------
-- Gatilhos: updated_at e proteção de household_id/created_by
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'recurrence_rules', 'bills', 'installment_plans',
    'installments', 'bill_payments', 'transactions', 'budgets'
  ] loop
    execute format(
      'create trigger %1$s_guard before insert or update on public.%1$I
         for each row execute function private.guard_household_row()', t);
    execute format(
      'create trigger %1$s_updated_at before update on public.%1$I
         for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: membros da família leem, inserem e alteram. Ninguém apaga pela API.
-- Transições de status e pagamentos passarão a funções validadas na Fase 3.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'recurrence_rules', 'bills', 'installment_plans',
    'installments', 'bill_payments', 'transactions', 'budgets'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format(
      'create policy "membros leem" on public.%I for select to authenticated
         using (household_id in (select private.user_household_ids()))', t);
    execute format(
      'create policy "membros inserem" on public.%I for insert to authenticated
         with check (household_id in (select private.user_household_ids()))', t);
    execute format(
      'create policy "membros alteram" on public.%I for update to authenticated
         using (household_id in (select private.user_household_ids()))
         with check (household_id in (select private.user_household_ids()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastros iniciais de uma família nova (chamado por create_household)
-- ---------------------------------------------------------------------------
create or replace function private.seed_household_defaults(p_household_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (household_id, name, kind)
  select p_household_id, name, kind
  from (values
    ('Moradia', 'expense'),
    ('Alimentação', 'expense'),
    ('Contas de consumo', 'expense'),
    ('Saúde', 'expense'),
    ('Transporte', 'expense'),
    ('Educação', 'expense'),
    ('Lazer', 'expense'),
    ('Impostos e taxas', 'expense'),
    ('Outras despesas', 'expense'),
    ('Salário', 'income'),
    ('Aposentadoria', 'income'),
    ('Rendimentos', 'income'),
    ('Outras receitas', 'income')
  ) as defaults (name, kind);

  insert into public.accounts (household_id, name, kind)
  values (p_household_id, 'Conta principal', 'checking');
$$;

revoke all on function private.seed_household_defaults(uuid) from public;
