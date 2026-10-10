-- Impressão digital do schema da aplicação. Rodar no banco local de teste e no
-- projeto Supabase: os hashes devem coincidir (garante que o remoto = migrações).
with parts as (
  select 'col' as k, string_agg(format('%s.%s:%s:%s:%s', table_name, column_name, data_type, is_nullable, coalesce(column_default, '')), '|' order by table_name, column_name) as v
  from information_schema.columns where table_schema = 'public'
  union all
  select 'con', string_agg(format('%s.%s:%s', conrelid::regclass, conname, pg_get_constraintdef(oid)), '|' order by conrelid::regclass::text, conname)
  from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'pol', string_agg(format('%s.%s:%s:%s:%s:%s', tablename, policyname, cmd, roles, coalesce(qual, ''), coalesce(with_check, '')), '|' order by tablename, policyname)
  from pg_policies where schemaname = 'public'
  union all
  select 'fn', string_agg(format('%s.%s:%s:%s:%s', n.nspname, p.proname, md5(p.prosrc), p.prosecdef, coalesce(p.proconfig::text, '')), '|' order by n.nspname, p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
  union all
  select 'trg', string_agg(format('%s.%s', tgrelid::regclass, tgname), '|' order by tgrelid::regclass::text, tgname)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  union all
  select 'idx', string_agg(indexdef, '|' order by indexname) from pg_indexes where schemaname = 'public'
  union all
  select 'grant', string_agg(format('%s:%s:%s', grantee, table_name, privilege_type), '|' order by grantee, table_name, privilege_type)
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'colgrant', string_agg(format('%s:%s.%s:%s', grantee, table_name, column_name, privilege_type), '|' order by grantee, table_name, column_name, privilege_type)
  from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and (table_name, privilege_type) not in (select table_name, privilege_type from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = column_privileges.grantee)
  union all
  select 'exec', string_agg(format('%s:%s', r.rolname, p.proname), '|' order by r.rolname, p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
  where n.nspname in ('public', 'private') and has_function_privilege(r.rolname, p.oid, 'execute')
)
select k, md5(coalesce(v, '')) as hash from parts order by k;
