-- Recorrências como "contas fixas": um modelo mensal (dia, valor, categoria) que não
-- gera lançamentos futuros. O app mostra o que já foi pago no mês e o que falta.
-- Recorrências antigas (que geraram 12 lançamentos de uma vez) continuam funcionando.
alter table public.recorrencias
  add column categoria text,
  add column meio_pagamento text,
  add column conta_cartao text,
  add column dia_do_mes integer check (dia_do_mes between 1 and 31),
  add column data_fim date;

-- status: 'ativa' | 'pausada' | 'encerrada'
update public.recorrencias set status = 'ativa' where status is null;
