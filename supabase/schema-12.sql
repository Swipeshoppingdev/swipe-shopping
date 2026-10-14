-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte. Serve schema-2.sql prima.
-- "Segnala prodotto": chiunque può segnalare un prodotto scegliendo un motivo già pronto (nessun testo scritto).
-- Anonime: si salva solo prodotto, motivo e ora. Le segnalazioni le legge solo l'admin (pagina Statistiche) e il server (riepilogo nell'aggiornamento del catalogo).

create table if not exists public.product_reports (
  id bigint generated always as identity primary key,
  product_id text not null check (length(product_id) between 3 and 80),
  reason text not null check (reason in ('foto', 'categoria', 'link', 'prezzo', 'esaurito')),
  created_at timestamptz not null default now()
);
create index if not exists product_reports_product on public.product_reports (product_id);
create index if not exists product_reports_created on public.product_reports (created_at desc);
alter table public.product_reports enable row level security;

create or replace function public.report_product(p_product_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Freno agli abusi: oltre 3000 segnalazioni in un giorno le altre si ignorano.
  if (select count(*) from public.product_reports where created_at > now() - interval '1 day') >= 3000 then
    return;
  end if;
  insert into public.product_reports (product_id, reason) values (p_product_id, p_reason);
end;
$$;
revoke all on function public.report_product(text, text) from public;
grant execute on function public.report_product(text, text) to anon, authenticated;

-- Per la pagina admin: prodotti segnalati, con quante volte per motivo.
create or replace function public.admin_reports()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if encode(sha256(convert_to(lower(coalesce(auth.jwt() ->> 'email', '')), 'UTF8')), 'hex') <> '661c2c44e6697e27434485a2dba44328ebfc61392493690bfbb3442360a7af92' then
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
revoke all on function public.admin_reports() from public, anon;
grant execute on function public.admin_reports() to authenticated;

-- "Sistemato": l'admin toglie le segnalazioni di un prodotto.
create or replace function public.admin_report_done(p_product_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if encode(sha256(convert_to(lower(coalesce(auth.jwt() ->> 'email', '')), 'UTF8')), 'hex') <> '661c2c44e6697e27434485a2dba44328ebfc61392493690bfbb3442360a7af92' then
    raise exception 'non autorizzato';
  end if;
  delete from public.product_reports where product_id = p_product_id;
end;
$$;
revoke all on function public.admin_report_done(text) from public, anon;
grant execute on function public.admin_report_done(text) to authenticated;
