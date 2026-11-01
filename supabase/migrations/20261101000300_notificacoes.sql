-- Notificações push (app instalado no celular) e controle do que já foi avisado.
create table public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
create policy "Inscrições do próprio usuário" on public.push_inscricoes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Evita repetir o mesmo aviso (ex.: "Mercado passou de 80%" uma vez por mês).
create table public.notificacoes_enviadas (
  user_id uuid not null references auth.users (id) on delete cascade,
  chave text not null,
  enviada_em timestamptz not null default now(),
  primary key (user_id, chave)
);
alter table public.notificacoes_enviadas enable row level security;
create policy "Avisos do próprio usuário" on public.notificacoes_enviadas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
