-- Contas bancárias com saldo, tipo "transferência" e importação de extratos (OFX).
-- Só adiciona estruturas: nenhuma coluna existente muda de comportamento.

-- 1. Contas (corrente, poupança, carteira...) com saldo inicial
create table public.contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  -- id da instituição em src/data/bancos.ts
  banco text,
  tipo text not null default 'corrente'
    check (tipo in ('corrente', 'poupanca', 'carteira', 'investimento')),
  -- número da conta no banco, para reconhecer o arquivo OFX automaticamente
  numero_conta text,
  saldo_inicial numeric not null default 0,
  data_saldo_inicial date not null default current_date,
  arquivada boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.contas enable row level security;
create policy "Contas do próprio usuário" on public.contas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Lançamentos: novo tipo "transferencia", vínculo com conta e origem
alter table public.lancamentos drop constraint lancamentos_tipo_check;
alter table public.lancamentos add constraint lancamentos_tipo_check
  check (tipo in ('receita', 'despesa', 'transferencia'));

alter table public.lancamentos
  add column conta_id uuid references public.contas (id) on delete set null,
  add column origem text not null default 'manual'
    check (origem in ('manual', 'importacao', 'open_finance'));

create index lancamentos_user_data_idx on public.lancamentos (user_id, data desc);
create index lancamentos_conta_idx on public.lancamentos (conta_id) where conta_id is not null;

-- 3. Histórico de importações (permite desfazer uma importação inteira)
create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references public.contas (id) on delete cascade,
  arquivo_nome text,
  periodo_inicio date,
  periodo_fim date,
  total_transacoes integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.importacoes enable row level security;
create policy "Importações do próprio usuário" on public.importacoes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Transações vindas do banco, aguardando revisão ("A revisar").
--    Só viram lançamento depois de confirmadas, então não afetam as telas atuais.
create table public.transacoes_importadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references public.contas (id) on delete cascade,
  importacao_id uuid references public.importacoes (id) on delete cascade,
  -- FITID do OFX (ou id da transação no Open Finance): evita importar duas vezes
  id_externo text not null,
  data date not null,
  -- com sinal: negativo = saída
  valor numeric not null,
  memo text not null default '',
  -- sugestão gerada pelo classificador
  sugestao_tipo text not null check (sugestao_tipo in ('receita', 'despesa', 'transferencia')),
  sugestao_descricao text not null,
  sugestao_categoria text,
  sugestao_meio text,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmada', 'ignorada')),
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conta_id, id_externo)
);

create index transacoes_importadas_pendentes_idx
  on public.transacoes_importadas (user_id, status, data desc);

alter table public.transacoes_importadas enable row level security;
create policy "Transações importadas do próprio usuário" on public.transacoes_importadas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Regras de categorização aprendidas ("sempre que aparecer X, use categoria Y")
create table public.regras_categorizacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- trecho de texto procurado no memo/descrição (sem acento, minúsculo)
  padrao text not null,
  tipo text check (tipo in ('receita', 'despesa', 'transferencia')),
  categoria text,
  descricao text,
  created_at timestamptz not null default now(),
  unique (user_id, padrao)
);

alter table public.regras_categorizacao enable row level security;
create policy "Regras do próprio usuário" on public.regras_categorizacao
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
