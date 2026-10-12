-- Da incollare in Supabase: SQL Editor → New query → Run. Si può eseguire più volte. Serve schema-5.sql e schema-7.sql prima.
-- "Sfida un amico": Indovina il prezzo con gli stessi 5 prodotti per tutti gli amici sfidati.
-- Si salva solo il punteggio (0-5) di ognuno; i risultati degli altri si vedono dopo aver giocato.
-- Nessun testo libero: solo prodotti del catalogo e numeri.

create table if not exists public.price_challenges (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null references public.profiles (user_id) on delete cascade,
  product_ids text[] not null check (public.social_valid_products(product_ids, 3, 5)),
  created_at timestamptz not null default now()
);
create index if not exists price_challenges_creator on public.price_challenges (creator, created_at desc);

create table if not exists public.price_challenge_players (
  challenge_id uuid not null references public.price_challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  score smallint not null check (score between 0 and 5),
  played_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.price_challenges enable row level security;
alter table public.price_challenge_players enable row level security;

drop trigger if exists price_challenges_cleanup on public.price_challenges;
create trigger price_challenges_cleanup after delete on public.price_challenges for each row execute function public.social_cleanup_ref();

alter table public.inbox drop constraint if exists inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('consiglio', 'sondaggio', 'lista', 'swipe', 'reazione', 'segreto', 'estrazione', 'sfida'));

-- Chi può vedere e giocare: chi l'ha creata e gli amici a cui è arrivata.
create or replace function public.challenge_allowed(c public.price_challenges, me uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select me is not null and (me = c.creator
    or exists (select 1 from public.inbox i where i.recipient = me and i.kind = 'sfida' and i.ref_id = c.id));
$$;
revoke all on function public.challenge_allowed(public.price_challenges, uuid) from public, anon, authenticated;

-- Nuova sfida a uno o più amici (codici profilo). Ritorna l'id; il creatore la gioca subito dopo.
create or replace function public.challenge_create(p_codes text[], p_product_ids text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  friend uuid;
  sent int := 0;
begin
  perform public.social_me();
  if coalesce(cardinality(p_codes), 0) not between 1 and 30 then raise exception 'scegli da 1 a 30 amici'; end if;
  if (select count(*) from public.price_challenges where creator = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'massimo 20 sfide al giorno';
  end if;
  insert into public.price_challenges (creator, product_ids) values (me, p_product_ids) returning id into new_id;
  for friend in select user_id from public.profiles where code = any (p_codes) loop
    if public.social_are_friends(me, friend) then
      insert into public.inbox (recipient, sender, kind, ref_id) values (friend, me, 'sfida', new_id);
      sent := sent + 1;
    end if;
  end loop;
  if sent = 0 then
    delete from public.price_challenges where id = new_id;
    raise exception 'puoi sfidare solo i tuoi amici';
  end if;
  return new_id;
end;
$$;

create or replace function public.challenge_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.price_challenges;
  me uuid := auth.uid();
  mine smallint;
begin
  select * into c from public.price_challenges where id = p_id;
  if not found or not public.challenge_allowed(c, me) then return null; end if;
  select score into mine from public.price_challenge_players where challenge_id = c.id and user_id = me;
  return jsonb_build_object(
    'id', c.id, 'product_ids', c.product_ids, 'created_at', c.created_at, 'is_creator', me = c.creator,
    'creator', (select public.social_card(p) from public.profiles p where p.user_id = c.creator),
    'my_score', mine,
    'invited', (select count(*) from public.inbox i where i.kind = 'sfida' and i.ref_id = c.id),
    -- Classifica solo dopo aver giocato (niente sbirciate prima).
    'players', case when mine is null then null else (
      select coalesce(jsonb_agg(public.social_card(p) || jsonb_build_object('score', x.score, 'me', x.user_id = me)
        order by x.score desc, x.played_at), '[]')
      from public.price_challenge_players x join public.profiles p on p.user_id = x.user_id
      where x.challenge_id = c.id) end
  );
end;
$$;

-- Un solo punteggio a testa (niente secondo tentativo).
create or replace function public.challenge_play(p_id uuid, p_score int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.price_challenges;
begin
  select * into c from public.price_challenges where id = p_id;
  if not found or not public.challenge_allowed(c, auth.uid()) then raise exception 'non trovata'; end if;
  if p_score < 0 or p_score > cardinality(c.product_ids) then raise exception 'punteggio non valido'; end if;
  insert into public.price_challenge_players (challenge_id, user_id, score) values (p_id, auth.uid(), p_score)
  on conflict (challenge_id, user_id) do nothing;
end;
$$;

-- Le mie sfide degli ultimi 30 giorni (create o ricevute), per la sezione in Amici.
create or replace function public.challenge_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'created_at', c.created_at, 'product_ids', c.product_ids,
      'is_creator', c.creator = auth.uid(),
      'creator', (select public.social_card(p) from public.profiles p where p.user_id = c.creator),
      'my_score', (select x.score from public.price_challenge_players x where x.challenge_id = c.id and x.user_id = auth.uid()),
      'played', (select count(*) from public.price_challenge_players x where x.challenge_id = c.id))
    order by c.created_at desc), '[]')
  from public.price_challenges c
  where c.created_at > now() - interval '30 days'
    and (c.creator = auth.uid() or c.id in (select i.ref_id from public.inbox i where i.recipient = auth.uid() and i.kind = 'sfida'));
$$;

create or replace function public.challenge_delete(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.price_challenges where id = p_id and creator = auth.uid();
$$;

do $$
declare
  f text;
begin
  foreach f in array array['challenge_create(text[], text[])', 'challenge_get(uuid)', 'challenge_play(uuid, int)', 'challenge_list()', 'challenge_delete(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
