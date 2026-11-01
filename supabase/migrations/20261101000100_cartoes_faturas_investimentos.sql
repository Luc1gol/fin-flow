-- Dados reais vindos do banco (Pluggy): cartão, faturas, investimentos e patrimônio.

-- Cartão de crédito conectado: limite e datas do ciclo atual
alter table public.contas
  add column limite numeric,
  add column limite_disponivel numeric,
  add column fatura_fechamento date,
  add column fatura_vencimento date,
  add column pagamento_minimo numeric;

-- Faturas informadas pelo banco (atual e anteriores)
create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references public.contas (id) on delete cascade,
  pluggy_bill_id text not null,
  vencimento date not null,
  valor_total numeric not null,
  pagamento_minimo numeric,
  valor_pago numeric not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (conta_id, pluggy_bill_id)
);
alter table public.faturas enable row level security;
create policy "Faturas do próprio usuário" on public.faturas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Investimentos (CDB, fundos...) com o saldo atual
create table public.investimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pluggy_investment_id text not null unique,
  nome text not null,
  tipo text,
  subtipo text,
  instituicao text,
  saldo numeric not null default 0,
  taxa text,
  atualizado_em timestamptz not null default now()
);
alter table public.investimentos enable row level security;
create policy "Investimentos do próprio usuário" on public.investimentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Uma foto do patrimônio por dia (para o gráfico de evolução)
create table public.patrimonio_diario (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  contas numeric not null default 0,
  investimentos numeric not null default 0,
  cartoes numeric not null default 0,
  primary key (user_id, data)
);
alter table public.patrimonio_diario enable row level security;
create policy "Patrimônio do próprio usuário" on public.patrimonio_diario
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
