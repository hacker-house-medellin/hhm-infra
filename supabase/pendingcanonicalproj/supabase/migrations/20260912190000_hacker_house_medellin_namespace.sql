-- hacker-house-medellin: private application namespace inside the shared oresoftware Supabase project.
begin;

create schema if not exists hacker_house_medellin;
comment on schema hacker_house_medellin is 'hacker-house-medellin application namespace; Shared Auth remains authoritative for identity.';

revoke all on schema hacker_house_medellin from public, anon, authenticated;
alter default privileges in schema hacker_house_medellin revoke all on tables from public, anon, authenticated;
alter default privileges in schema hacker_house_medellin revoke all on sequences from public, anon, authenticated;
alter default privileges in schema hacker_house_medellin revoke all on functions from public, anon, authenticated;

commit;
