-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte.
-- 1) Statistiche anonime d'uso (solo da chi ha dato il consenso)
-- 2) Avvisi email "prezzo sceso"

-- ── Statistiche ─────────────────────────────────────────────────────────────
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (name in ('session', 'view', 'like', 'dislike', 'click', 'remove', 'share')),
  product_id text,
  category text,
  brand text,
  device_id text not null check (length(device_id) between 8 and 64),
  user_id uuid default auth.uid()
);
create index if not exists events_created_at_idx on public.events (created_at);
alter table public.events enable row level security;

-- Chiunque usi l'app può aggiungere eventi, nessuno può leggerli direttamente.
drop policy if exists "Aggiungo eventi" on public.events;
create policy "Aggiungo eventi" on public.events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Numeri riassuntivi per la pagina riservata al titolare.
create or replace function public.admin_stats(days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => days);
  result jsonb;
begin
  if encode(sha256(convert_to(lower(coalesce(auth.jwt() ->> 'email', '')), 'UTF8')), 'hex') <> '661c2c44e6697e27434485a2dba44328ebfc61392493690bfbb3442360a7af92' then
    raise exception 'non autorizzato';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'alerts_on', (select count(*) from public.user_data where email_alerts),
    'devices_today', (select count(distinct device_id) from public.events where created_at > date_trunc('day', now())),
    'devices_7d', (select count(distinct device_id) from public.events where created_at > now() - interval '7 days'),
    'devices_period', (select count(distinct device_id) from public.events where created_at > since),
    'totals', (
      select coalesce(jsonb_object_agg(name, n), '{}'::jsonb)
      from (select name, count(*) n from public.events where created_at > since group by name) t
    ),
    'daily', (
      select coalesce(jsonb_agg(d order by d ->> 'day'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'devices', count(distinct device_id),
          'views', count(*) filter (where name = 'view'),
          'likes', count(*) filter (where name = 'like'),
          'clicks', count(*) filter (where name = 'click')
        ) d
        from public.events where created_at > since
        group by date_trunc('day', created_at)
      ) x
    ),
    'top_clicked', (
      select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'n', n) order by n desc), '[]'::jsonb)
      from (select product_id, count(*) n from public.events
            where name = 'click' and created_at > since and product_id is not null
            group by product_id order by n desc limit 10) t
    ),
    'top_liked', (
      select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'n', n) order by n desc), '[]'::jsonb)
      from (select product_id, count(*) n from public.events
            where name = 'like' and created_at > since and product_id is not null
            group by product_id order by n desc limit 10) t
    ),
    'top_categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', category, 'n', n) order by n desc), '[]'::jsonb)
      from (select category, count(*) n from public.events
            where name in ('like', 'click') and created_at > since and category is not null
            group by category order by n desc limit 8) t
    ),
    'top_brands', (
      select coalesce(jsonb_agg(jsonb_build_object('id', brand, 'n', n) order by n desc), '[]'::jsonb)
      from (select brand, count(*) n from public.events
            where name in ('like', 'click') and created_at > since and brand is not null
            group by brand order by n desc limit 8) t
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;

-- ── Avvisi "prezzo sceso" ───────────────────────────────────────────────────
-- Preferenza dell'utente (attiva di base, si spegne dal Profilo o dal link nell'email).
alter table public.user_data add column if not exists email_alerts boolean not null default true;

-- Quando abbiamo scritto l'ultima volta a ogni utente e a che prezzo: max 1 email ogni 3 giorni,
-- mai due volte per lo stesso calo. Solo il server (chiave service_role) la legge e la scrive.
create table if not exists public.price_alerts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_sent_at timestamptz,
  notified jsonb not null default '{}'::jsonb
);
alter table public.price_alerts enable row level security;
