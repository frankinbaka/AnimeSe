-- ============================================================
-- AnimeSe — etapa 13: ajustes das páginas e republicar
--   1. Uma página por conta
--   2. Até 15 publicações por dia por página
--   3. Republicar publicações de páginas (aparece no perfil de quem republicou)
-- Rode em: Supabase > SQL Editor > Run (pode rodar de novo sem problema)
-- ============================================================

-- ---------- 1. Uma página por conta ----------
create or replace function public.proteger_pagina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.slug := lower(trim(new.slug));
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if exists (select 1 from public.pages where owner_id = new.owner_id and status in ('approved', 'pending', 'suspended')) then
        raise exception 'Cada conta pode ter só uma página.';
      end if;
      -- Pedido recusado antigo dá lugar ao novo
      delete from public.pages where owner_id = new.owner_id and status = 'rejected';
      new.status := 'pending';
      new.admin_note := null;
      new.followers_count := 0;
      new.posts_count := 0;
      new.reviewed_at := null;
      new.created_at := now();
    else
      new.owner_id := old.owner_id;
      new.followers_count := old.followers_count;
      new.posts_count := old.posts_count;
      new.created_at := old.created_at;
      new.reviewed_at := old.reviewed_at;
      new.admin_note := old.admin_note;
      if old.status = 'rejected' then new.status := 'pending'; else new.status := old.status; end if;
      if old.status = 'approved' then new.slug := old.slug; end if;
    end if;
  end if;
  return new;
end $$;

-- ---------- 2. Até 15 publicações por dia ----------
create or replace function public.antes_de_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.page_posts where page_id = new.page_id and created_at > now() - interval '1 day') >= 15 then
    raise exception 'Esta página já publicou 15 vezes nas últimas 24 horas. Tente mais tarde.';
  end if;
  new.body := nullif(trim(coalesce(new.body, '')), '');
  new.likes_count := 0;
  new.reposts_count := 0;
  new.created_at := now();
  return new;
end $$;

-- ---------- 3. Republicar ----------
alter table public.page_posts add column if not exists reposts_count integer not null default 0;

create table if not exists public.page_post_reposts (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    bigint not null references public.page_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists republicacoes_usuario on public.page_post_reposts (user_id, created_at desc);
create index if not exists republicacoes_publicacao on public.page_post_reposts (post_id);

alter table public.page_post_reposts enable row level security;

drop policy if exists "republicacoes visiveis" on public.page_post_reposts;
create policy "republicacoes visiveis" on public.page_post_reposts for select using (true);

drop policy if exists "republicar" on public.page_post_reposts;
create policy "republicar" on public.page_post_reposts for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "desfazer republicacao" on public.page_post_reposts;
create policy "desfazer republicacao" on public.page_post_reposts for delete to authenticated using (user_id = auth.uid());

grant select on public.page_post_reposts to anon, authenticated;
grant insert, delete on public.page_post_reposts to authenticated;

create or replace function public.contar_republicacoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.page_posts set reposts_count = reposts_count + 1 where id = new.post_id;
  else
    update public.page_posts set reposts_count = greatest(reposts_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;

drop trigger if exists page_post_reposts_contar on public.page_post_reposts;
create trigger page_post_reposts_contar after insert or delete on public.page_post_reposts
  for each row execute function public.contar_republicacoes();
