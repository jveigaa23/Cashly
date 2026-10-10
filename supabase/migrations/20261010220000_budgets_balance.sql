-- =============================================================================
-- Cashly — 0006: orçamentos e saldo registrado (Fase 5)
-- =============================================================================

-- Orçamento é planejamento, não registro financeiro: pode ser removido.
grant delete on table public.budgets to authenticated;
create policy "membros removem orçamentos" on public.budgets
  for delete to authenticated
  using (household_id in (select private.user_household_ids()));

-- Saldo inicial de uma conta vale a partir de uma data; sem data, a conta
-- considera todos os lançamentos (padrão para contas novas, saldo inicial 0).
alter table public.accounts alter column opening_date drop not null;
alter table public.accounts alter column opening_date drop default;
update public.accounts set opening_date = null where opening_balance = 0;
alter table public.accounts add constraint accounts_opening_date_required
  check (opening_balance = 0 or opening_date is not null);

-- Saldo registrado até uma data (inclusive):
--   soma dos saldos iniciais (com data <= p_until)
-- + receitas RECEBIDAS − despesas PAGAS (status confirmed), a partir da data
--   do saldo inicial da conta de cada lançamento.
-- Previstos e cancelados nunca entram. SECURITY INVOKER: o RLS limita à família.
create or replace function public.registered_balance(p_until date)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((
      select sum(a.opening_balance) from public.accounts a
      where a.opening_date is not null and a.opening_date <= p_until
    ), 0)
    + coalesce((
      select sum(case when t.type = 'income' then t.amount else -t.amount end)
      from public.transactions t
      left join public.accounts a on a.household_id = t.household_id and a.id = t.account_id
      where t.status = 'confirmed'
        and t.occurred_on <= p_until
        and (a.opening_date is null or t.occurred_on >= a.opening_date)
    ), 0);
$$;

revoke all on function public.registered_balance(date) from public, anon;
grant execute on function public.registered_balance(date) to authenticated;
