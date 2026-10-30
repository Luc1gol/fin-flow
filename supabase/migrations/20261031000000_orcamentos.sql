-- Orçamento mensal por categoria ("quanto posso gastar com Mercado por mês").
create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- mesmo texto usado em lancamentos.tag
  categoria text not null,
  valor_mensal numeric not null check (valor_mensal > 0),
  created_at timestamptz not null default now(),
  unique (user_id, categoria)
);

alter table public.orcamentos enable row level security;
create policy "Orçamentos do próprio usuário" on public.orcamentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
