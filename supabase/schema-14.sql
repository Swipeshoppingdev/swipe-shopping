-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte.
-- Controlli di sicurezza del 12/10/2026:
-- 1) Admin riconosciuto dall'account (id + email confermata), non solo dall'email scritta nel token.
-- 2) Limiti di dimensione su statistiche, segnalazioni e dati utente (niente database gonfiato apposta).
-- 3) Ricerca @tag limitata (niente scansione di tutti i profili) e reazioni che non mandano notifiche a raffica.
-- I nuovi limiti valgono per i dati nuovi ("not valid": le righe già salvate non vengono ricontrollate).

-- ── 1) Admin ────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid() and encode(sha256(convert_to(lower(email), 'UTF8')), 'hex') = '661c2c44e6697e27434485a2dba44328ebfc61392493690bfbb3442360a7af92' and email_confirmed_at is not null
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_check()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
end;
$$;

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
  if not public.is_admin() then
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

create or replace function public.admin_reports()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  return (
    select coalesce(jsonb_agg(r order by r ->> 'last' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', product_id,
        'n', sum(n_reason),
        'reasons', jsonb_object_agg(reason, n_reason),
        'last', max(last)
      ) r
      from (
        select product_id, reason, count(*) n_reason, max(created_at) last
        from public.product_reports group by product_id, reason
      ) x
      group by product_id
      limit 200
    ) t
  );
end;
$$;

create or replace function public.admin_report_done(p_product_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  delete from public.product_reports where product_id = p_product_id;
end;
$$;

create or replace function public.admin_insights(days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => days);
  prev_since timestamptz := now() - make_interval(days => days * 2);
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;

  select jsonb_build_object(
    -- Stesso numero di giorni, appena prima: per vedere se si cresce.
    'prev', (
      select jsonb_build_object(
        'devices', count(distinct device_id),
        'views', count(*) filter (where name = 'view'),
        'likes', count(*) filter (where name = 'like'),
        'clicks', count(*) filter (where name = 'click'),
        'shares', count(*) filter (where name in ('share', 'outfit_share'))
      )
      from public.events where created_at > prev_since and created_at <= since
    ),
    -- Persone nuove (primo evento nel periodo) e persone che tornano (attive in almeno 2 giorni diversi).
    'loyalty', (
      select jsonb_build_object(
        'devices', count(*),
        'new', count(*) filter (where first_seen > since),
        'returning', count(*) filter (where active_days >= 2),
        'avg_days', coalesce(round(avg(active_days)::numeric, 1), 0),
        'avg_views', coalesce(round(avg(views)::numeric, 1), 0),
        'avg_sessions', coalesce(round(avg(sessions)::numeric, 1), 0)
      )
      from (
        select p.device_id,
          count(distinct (p.created_at at time zone 'Europe/Rome')::date) active_days,
          count(*) filter (where p.name = 'view') views,
          count(*) filter (where p.name = 'session') sessions,
          (select min(e.created_at) from public.events e where e.device_id = p.device_id) first_seen
        from public.events p where p.created_at > since
        group by p.device_id
      ) d
    ),
    -- Tutte le categorie: viste, sì, no, click (le sezioni si ricavano dalla categoria nell'app).
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', category, 'views', v, 'likes', l, 'dislikes', d, 'clicks', c)), '[]'::jsonb)
      from (
        select category,
          count(*) filter (where name = 'view') v,
          count(*) filter (where name = 'like') l,
          count(*) filter (where name = 'dislike') d,
          count(*) filter (where name = 'click') c
        from public.events
        where created_at > since and category is not null and name in ('view', 'like', 'dislike', 'click')
        group by category
      ) t
    ),
    -- Marche più viste (fino a 300), con sì e click.
    'brands', (
      select coalesce(jsonb_agg(jsonb_build_object('id', brand, 'views', v, 'likes', l, 'clicks', c)), '[]'::jsonb)
      from (
        select brand,
          count(*) filter (where name = 'view') v,
          count(*) filter (where name = 'like') l,
          count(*) filter (where name = 'click') c
        from public.events
        where created_at > since and brand is not null and name in ('view', 'like', 'click')
        group by brand
        order by count(*) filter (where name = 'view') desc
        limit 300
      ) t
    ),
    'stores', (
      select coalesce(jsonb_object_agg(store, n), '{}'::jsonb)
      from (
        select split_part(product_id, ':', 1) store, count(*) n
        from public.events
        where created_at > since and name = 'click' and product_id like '%:%'
        group by 1
      ) t
    ),
    -- Ora italiana: quando la gente usa l'app (utile per pubblicare sui social).
    'hours', (
      select coalesce(jsonb_object_agg(h, n), '{}'::jsonb)
      from (
        select extract(hour from created_at at time zone 'Europe/Rome')::int h, count(*) n
        from public.events
        where created_at > since and name in ('view', 'outfit_like', 'outfit_dislike')
        group by 1
      ) t
    ),
    'weekdays', (
      select coalesce(jsonb_object_agg(w, n), '{}'::jsonb)
      from (
        select extract(isodow from created_at at time zone 'Europe/Rome')::int w, count(distinct device_id) n
        from public.events
        where created_at > since
        group by 1
      ) t
    ),
    'outfits', (
      select coalesce(jsonb_agg(jsonb_build_object('id', category, 'likes', l, 'dislikes', d, 'shares', s)), '[]'::jsonb)
      from (
        select category,
          count(*) filter (where name = 'outfit_like') l,
          count(*) filter (where name = 'outfit_dislike') d,
          count(*) filter (where name = 'outfit_share') s
        from public.events
        where created_at > since and name like 'outfit_%' and category is not null
        group by category
      ) t
    )
  ) into result;
  return result;
end;
$$;

-- ── 2) Limiti di dimensione ─────────────────────────────────────────────────
alter table public.events drop constraint if exists events_sizes;
alter table public.events add constraint events_sizes check (
  coalesce(length(product_id), 0) <= 80 and coalesce(length(category), 0) <= 60 and coalesce(length(brand), 0) <= 80
) not valid;

alter table public.product_reports drop constraint if exists product_reports_id_format;
alter table public.product_reports add constraint product_reports_id_format
  check (product_id ~ '^[A-Za-z0-9_.:-]+$') not valid;

-- Preferiti, scartati e filtri di un account: al massimo ~5 MB (un uso normale sta sotto i 500 KB).
alter table public.user_data drop constraint if exists user_data_size;
alter table public.user_data add constraint user_data_size check (
  pg_column_size(wishlist) + pg_column_size(disliked) + coalesce(pg_column_size(filters), 0) < 5000000
) not valid;

-- ── 3) Ricerca @tag: massimo 60 ricerche all'ora per account ───────────────
create table if not exists public.social_find_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists social_find_log_user on public.social_find_log (user_id, at desc);
alter table public.social_find_log enable row level security;

create or replace function public.social_find(p_tag text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  if (select count(*) from public.social_find_log where user_id = auth.uid() and at > now() - interval '1 hour') >= 60 then
    raise exception 'troppe ricerche, riprova più tardi';
  end if;
  insert into public.social_find_log (user_id) values (auth.uid());
  delete from public.social_find_log where at < now() - interval '1 day';
  select p.code into result from public.profiles p
  where p.tag = lower(regexp_replace(p_tag, '^\s*@|\s', '', 'g'))
    and not exists (select 1 from public.blocks b where b.blocker = p.user_id and b.blocked = auth.uid());
  return result;
end;
$$;
revoke all on function public.social_find(text) from public, anon;
grant execute on function public.social_find(text) to authenticated;

-- ── Reazioni: cambiare emoji aggiorna l'avviso già mandato invece di crearne uno nuovo ──
create or replace function public.react(p_kind text, p_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner_id uuid;
begin
  perform public.social_me();
  if p_kind = 'poll' then select owner into owner_id from public.polls where id = p_id;
  elsif p_kind = 'list' then select owner into owner_id from public.gift_lists where id = p_id;
  end if;
  if owner_id is null then raise exception 'non trovato'; end if;
  if owner_id = me then raise exception 'non puoi reagire alle tue cose'; end if;
  if p_emoji is null then
    delete from public.reactions where target_kind = p_kind and target_id = p_id and reactor = me;
    delete from public.inbox where recipient = owner_id and sender = me and kind = 'reazione' and ref_id = p_id;
  else
    if not (p_emoji = any (public.social_reaction_emojis())) then raise exception 'reazione non valida'; end if;
    insert into public.reactions (target_kind, target_id, reactor, emoji) values (p_kind, p_id, me, p_emoji)
    on conflict (target_kind, target_id, reactor) do update set emoji = excluded.emoji, created_at = now();
    update public.inbox set emoji = p_emoji
    where recipient = owner_id and sender = me and kind = 'reazione' and ref_id = p_id;
    if not found and not exists (select 1 from public.blocks where blocker = owner_id and blocked = me) then
      insert into public.inbox (recipient, sender, kind, ref_id, emoji) values (owner_id, me, 'reazione', p_id, p_emoji);
    end if;
  end if;
  return public.reaction_summary(p_kind, p_id);
end;
$$;
revoke all on function public.react(text, uuid, text) from public, anon;
grant execute on function public.react(text, uuid, text) to authenticated;
