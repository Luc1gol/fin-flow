-- Sincronização via Open Finance (Pluggy / Meu Pluggy).
-- Cada conta do banco (corrente ou cartão de crédito) vira uma linha em `contas`.

alter table public.contas drop constraint contas_tipo_check;
alter table public.contas add constraint contas_tipo_check
  check (tipo in ('corrente', 'poupanca', 'carteira', 'investimento', 'cartao_credito'));

alter table public.contas
  -- id da conta na Pluggy: liga a conta do app à conta do banco
  add column pluggy_account_id text unique,
  -- para contas de cartão: cartão do app usado em `lancamentos.conta_cartao`
  add column cartao_id uuid references public.cartoes (id) on delete set null,
  -- último saldo informado pelo banco
  add column saldo_banco numeric,
  add column saldo_banco_em timestamptz,
  add column ultima_sincronizacao timestamptz;
