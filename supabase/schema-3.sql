-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte.
-- Email "comunicazioni" scritte a mano dal titolare dalla pagina Statistiche (#/admin).
-- Il sito salva solo il messaggio; l'invio lo fa GitHub Actions (scripts/broadcast.ts) con la chiave Resend.

-- Preferenza dell'utente: attiva di base, si spegne dal Profilo o dal link in fondo all'email.
alter table public.user_data add column if not exists email_news boolean not null default true;

-- Scelta fatta alla registrazione (casella "novità"): il sito la manda nei metadati dell'account,
-- qui la copiamo in user_data appena l'account nasce. Poi si cambia dal Profilo.
create or replace function public.user_data_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_data (user_id, email_news)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'email_news')::boolean, true))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists user_data_on_signup on auth.users;
create trigger user_data_on_signup after insert on auth.users
  for each row execute function public.user_data_on_signup();

create table if not exists public.broadcasts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  subject text not null check (length(subject) between 3 and 120),
  body text not null check (length(body) between 10 and 5000),
  -- Prova: va solo all'email del titolare.
  test boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  total int,
  sent_count int not null default 0,
  sent_to jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  error text
);
alter table public.broadcasts enable row level security;
-- Nessuna policy: nessuno la legge o la scrive direttamente, solo con le funzioni qui sotto o dal server.

create or replace function public.admin_check()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if encode(sha256(convert_to(lower(coalesce(auth.jwt() ->> 'email', '')), 'UTF8')), 'hex') <> '661c2c44e6697e27434485a2dba44328ebfc61392493690bfbb3442360a7af92' then
    raise exception 'non autorizzato';
  end if;
end;
$$;
revoke all on function public.admin_check() from public, anon;
grant execute on function public.admin_check() to authenticated;

-- Nuova comunicazione (in coda: parte entro pochi minuti).
create or replace function public.admin_broadcast_create(subject text, body text, test boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  perform public.admin_check();
  insert into public.broadcasts (subject, body, test) values (trim(subject), trim(body), test) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.admin_broadcast_create(text, text, boolean) from public, anon;
grant execute on function public.admin_broadcast_create(text, text, boolean) to authenticated;

-- Annulla una comunicazione ancora in coda.
create or replace function public.admin_broadcast_cancel(broadcast_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_check();
  update public.broadcasts set status = 'cancelled' where id = broadcast_id and status = 'pending';
end;
$$;
revoke all on function public.admin_broadcast_cancel(bigint) from public, anon;
grant execute on function public.admin_broadcast_cancel(bigint) to authenticated;

-- Ultime comunicazioni e quante persone le riceverebbero (account confermati che non le hanno spente).
create or replace function public.admin_broadcasts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_check();
  return jsonb_build_object(
    'recipients', (
      select count(*) from auth.users u
      left join public.user_data d on d.user_id = u.id
      where u.email_confirmed_at is not null and coalesce(d.email_news, true)
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'created_at', created_at, 'subject', subject, 'test', test, 'status', status,
        'total', total, 'sent_count', sent_count, 'sent_at', sent_at, 'error', error
      ) order by id desc), '[]'::jsonb)
      from (select * from public.broadcasts order by id desc limit 10) b
    )
  );
end;
$$;
revoke all on function public.admin_broadcasts() from public, anon;
grant execute on function public.admin_broadcasts() to authenticated;
