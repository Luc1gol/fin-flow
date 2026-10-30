-- Esquema existente em produção em 30/10/2026, registrado a partir do banco.
-- Já aplicado; serve de referência e para recriar o banco do zero.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text,
  apelido text
);

create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  nome text not null,
  bandeira text,
  limite numeric not null,
  dia_fechamento integer not null check (dia_fechamento between 1 and 31),
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  created_at timestamptz not null default timezone('utc', now()),
  banco text
);

create table if not exists public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  descricao text not null,
  valor numeric not null,
  tipo text not null,
  frequencia text default 'mensal',
  status text default 'ativa',
  data_inicio date not null,
  created_at timestamptz default now()
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  descricao text not null,
  valor numeric not null,
  tipo text not null constraint lancamentos_tipo_check check (tipo in ('receita', 'despesa')),
  data date not null,
  tag text,
  conta_cartao text,
  created_at timestamptz not null default timezone('utc', now()),
  tags_extras text[],
  meio_pagamento text,
  recorrencia_id uuid references public.recorrencias (id) on delete cascade
);

alter table public.profiles enable row level security;
alter table public.cartoes enable row level security;
alter table public.recorrencias enable row level security;
alter table public.lancamentos enable row level security;

create policy "Usuários podem ver o próprio perfil" on public.profiles
  for select using (auth.uid() = id);
create policy "Usuários podem inserir o próprio perfil" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Usuários podem atualizar o próprio perfil" on public.profiles
  for update using (auth.uid() = id);

create policy "Usuários podem ver seus próprios cartões" on public.cartoes
  for select using (auth.uid() = user_id);
create policy "Usuários podem inserir seus próprios cartões" on public.cartoes
  for insert with check (auth.uid() = user_id);
create policy "Usuários podem atualizar seus próprios cartões" on public.cartoes
  for update using (auth.uid() = user_id);
create policy "Usuários podem deletar seus próprios cartões" on public.cartoes
  for delete using (auth.uid() = user_id);

create policy "Recorrências do próprio usuário" on public.recorrencias
  for all using (auth.uid() = user_id);

create policy "Usuários podem ver seus próprios lançamentos" on public.lancamentos
  for select using (auth.uid() = user_id);
create policy "Usuários podem inserir seus próprios lançamentos" on public.lancamentos
  for insert with check (auth.uid() = user_id);
create policy "Usuários podem atualizar seus próprios lançamentos" on public.lancamentos
  for update using (auth.uid() = user_id);
create policy "Usuários podem deletar seus próprios lançamentos" on public.lancamentos
  for delete using (auth.uid() = user_id);
