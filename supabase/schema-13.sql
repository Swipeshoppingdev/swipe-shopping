-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte. Serve schema-2.sql prima.
-- Statistiche più utili per il titolare (pagina Statistiche):
-- confronto con il periodo prima, persone che tornano, sezioni, categorie e marche che piacciono di più o di meno,
-- click per negozio, orari, outfit per stile.

-- Eventi degli outfit (sì / no / condivisione): category = stile, product_id = id dell'outfit.
alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check
  check (name in ('session', 'view', 'like', 'dislike', 'click', 'remove', 'share', 'outfit_like', 'outfit_dislike', 'outfit_share'));

create index if not exists events_device_idx on public.events (device_id, created_at);

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
  if encode(sha256(convert_to(lower(coalesce(auth.jwt() ->> 'email', '')), 'UTF8')), 'hex') <> '661c2c44e6697e27434485a2dba44328ebfc61392493690bfbb3442360a7af92' then
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
revoke all on function public.admin_insights(int) from public, anon;
grant execute on function public.admin_insights(int) to authenticated;
