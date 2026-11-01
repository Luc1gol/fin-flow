-- Metas de economia e gastos divididos.

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  valor_alvo numeric not null check (valor_alvo > 0),
  data_alvo date,
  -- valor guardado informado à mão (usado quando não há investimentos vinculados)
  valor_manual numeric not null default 0,
  -- investimentos (investimentos.id) cujo saldo conta para a meta
  investimento_ids uuid[] not null default '{}',
  concluida_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.metas enable row level security;
create policy "Metas do próprio usuário" on public.metas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Gasto dividido: quem deve parte do valor e quanto; recebido_em marca o acerto.
alter table public.lancamentos
  add column dividido_com text,
  add column valor_a_receber numeric check (valor_a_receber is null or valor_a_receber > 0),
  add column recebido_em date;
