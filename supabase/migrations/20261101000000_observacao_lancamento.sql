-- Observação livre do lançamento (campo "Observações" do Lançar e da edição no Extrato).
alter table public.lancamentos add column observacao text;
