-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte. Serve schema-6.sql prima.
-- 1) Notifiche anche dal sito (iPhone con il sito nella schermata Home, computer): platform 'web'.
-- 2) "Segui una marca": le marche seguite (sincronizzate tra i dispositivi) e l'ultimo avviso mandato.

alter table public.push_tokens drop constraint if exists push_tokens_platform_check;
alter table public.push_tokens add constraint push_tokens_platform_check check (platform in ('android', 'ios', 'web'));

create or replace function public.push_register(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  if p_platform not in ('android', 'ios', 'web') then raise exception 'piattaforma non valida'; end if;
  -- Un token appartiene a un solo account (il telefono può cambiare account).
  delete from public.push_tokens where token = p_token;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform);
  -- Al massimo 10 telefoni/browser per account.
  delete from public.push_tokens where user_id = auth.uid() and token in (
    select token from public.push_tokens where user_id = auth.uid() order by updated_at desc offset 10);
end;
$$;
revoke all on function public.push_register(text, text) from public, anon;
grant execute on function public.push_register(text, text) to authenticated;

-- Marche seguite: un elenco di nomi (massimo 50, scelti toccando "Segui" su un prodotto).
alter table public.user_data add column if not exists follows jsonb not null default '[]'::jsonb;
alter table public.user_data drop constraint if exists user_data_follows_size;
alter table public.user_data add constraint user_data_follows_size check (
  jsonb_typeof(follows) = 'array' and jsonb_array_length(follows) <= 50 and pg_column_size(follows) < 8000
) not valid;

-- Avvisi "novità dalle tue marche": quando è partito l'ultimo (al massimo uno al giorno). Solo per gli script.
create table if not exists public.brand_alerts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_sent_at timestamptz not null default now()
);
alter table public.brand_alerts enable row level security;
