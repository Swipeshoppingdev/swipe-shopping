-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte. Serve schema-14.sql prima.
-- Errori dell'app: quando l'app si inceppa su un telefono, l'errore arriva qui da solo.
-- Anonimi: solo il testo tecnico dell'errore, la pagina, il tipo di telefono e l'ora (nessun account, nessuna email).
-- Li legge solo l'admin (pagina Statistiche) e il server (riepilogo nell'aggiornamento del catalogo).

create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  happened_at timestamptz not null,
  kind text not null check (length(kind) <= 20),
  message text not null check (length(message) <= 300),
  stack text check (length(stack) <= 1500),
  route text check (length(route) <= 120),
  ua text check (length(ua) <= 200),
  native boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_created on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;

create or replace function public.report_error(p_at timestamptz, p_kind text, p_message text, p_stack text, p_route text, p_ua text, p_native boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Freno: oltre 500 errori al giorno gli altri si ignorano (un bug che si ripete basta vederlo qualche volta).
  if (select count(*) from public.app_errors where created_at > now() - interval '1 day') >= 500 then
    return;
  end if;
  insert into public.app_errors (happened_at, kind, message, stack, route, ua, native)
  values (least(coalesce(p_at, now()), now()), left(coalesce(p_kind, ''), 20), left(coalesce(p_message, ''), 300),
          left(p_stack, 1500), left(p_route, 120), left(p_ua, 200), coalesce(p_native, false));
end;
$$;
revoke all on function public.report_error(timestamptz, text, text, text, text, text, boolean) from public;
grant execute on function public.report_error(timestamptz, text, text, text, text, text, boolean) to anon, authenticated;

-- Per la pagina admin: gli ultimi 50 errori.
create or replace function public.admin_errors()
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
    select coalesce(jsonb_agg(to_jsonb(e) order by e.happened_at desc), '[]'::jsonb)
    from (select id, happened_at, kind, message, stack, route, ua, native from public.app_errors order by happened_at desc limit 50) e
  );
end;
$$;
revoke all on function public.admin_errors() from public, anon;
grant execute on function public.admin_errors() to authenticated;

-- "Svuota": l'admin cancella gli errori già visti.
create or replace function public.admin_errors_clear()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  delete from public.app_errors where true;
end;
$$;
revoke all on function public.admin_errors_clear() from public, anon;
grant execute on function public.admin_errors_clear() to authenticated;
