-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte. Serve schema-17.sql prima.
-- Panoramica per l'admin (Profilo → Statistiche): utenti registrati, contatti, visitatori e cose da sistemare.
-- Solo conteggi: nessuna email o dato personale esce dal database.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  week timestamptz := now() - interval '7 days';
  today timestamptz := date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome';
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  return jsonb_build_object(
    -- Utenti (account con email)
    'users_total', (select count(*) from auth.users),
    'users_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'users_google', (select count(distinct user_id) from auth.identities where provider = 'google'),
    'users_new_today', (select count(*) from auth.users where created_at >= today),
    'users_new_7d', (select count(*) from auth.users where created_at > week),
    'users_new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'users_active_7d', (select count(*) from auth.users where last_sign_in_at > week),
    'users_with_wishlist', (select count(*) from public.user_data where jsonb_array_length(wishlist) > 0),
    'wishlist_items', (select coalesce(sum(jsonb_array_length(wishlist)), 0) from public.user_data),
    -- Contatti e avvisi
    'news_optin', (select count(*) from public.user_data where email_news),
    'alerts_on', (select count(*) from public.user_data where email_alerts),
    'push_android', (select count(distinct user_id) from public.push_tokens where platform = 'android'),
    'push_web', (select count(distinct user_id) from public.push_tokens where platform = 'web'),
    'watchers', (
      select count(*) from public.user_data
      where exists (select 1 from jsonb_array_elements(wishlist) w where w ->> 'folder' = 'Quando scende')
    ),
    'brand_followers', (select count(*) from public.user_data where jsonb_array_length(follows) > 0),
    'price_alerts_7d', (select count(*) from public.price_alerts where last_sent_at > week),
    'brand_alerts_7d', (select count(*) from public.brand_alerts where last_sent_at > week),
    -- Visitatori (chi ha accettato le statistiche anonime)
    'devices_today', (select count(distinct device_id) from public.events where created_at >= today),
    'devices_7d', (select count(distinct device_id) from public.events where created_at > week),
    'devices_30d', (select count(distinct device_id) from public.events where created_at > now() - interval '30 days'),
    'devices_returning_7d', (
      select count(distinct e.device_id) from public.events e
      where e.created_at > week
        and exists (select 1 from public.events o where o.device_id = e.device_id and o.created_at <= week)
    ),
    'sessions_7d', (select count(*) from public.events where name = 'session' and created_at > week),
    'views_7d', (select count(*) from public.events where name = 'view' and created_at > week),
    'likes_7d', (select count(*) from public.events where name = 'like' and created_at > week),
    'clicks_today', (select count(*) from public.events where name = 'click' and created_at >= today),
    'clicks_7d', (select count(*) from public.events where name = 'click' and created_at > week),
    -- Da sistemare
    'errors_open', (select count(*) from public.app_errors where kind <> 'segnalazione'),
    'feedback_open', (select count(*) from public.app_errors where kind = 'segnalazione'),
    'reports_open', (select count(distinct product_id) from public.product_reports)
  );
end;
$$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
