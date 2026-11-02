-- Aplicar e resgatar investimento não é gasto nem ganho: o dinheiro continua do usuário.
-- Lançamentos com categoria "Investimentos" passam a ser transferências (fora de entradas e
-- saídas): aplicação com valor negativo, resgate positivo. O app já grava assim daqui em diante.
update public.lancamentos
set
  valor = case when tipo = 'despesa' then -abs(valor) else abs(valor) end,
  tipo = 'transferencia'
where tipo in ('receita', 'despesa')
  and lower(translate(trim(tag), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) = 'investimentos';
