-- Neon: depois de reproduzir as migrações, novas tabelas e funções não ganham
-- mais privilégios automaticamente. Cada migração futura concede o que precisa.
alter default privileges in schema public revoke all on tables from anonymous, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anonymous, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anonymous, authenticated, service_role;
