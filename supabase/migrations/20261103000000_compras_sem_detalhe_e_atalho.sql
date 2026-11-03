-- O banco atualiza o saldo na hora, mas só detalha as transações do dia anterior perto do
-- meio-dia. `sem_detalhe` guarda quanto o saldo da conta mudou sem transação que explique
-- (negativo = saiu dinheiro), para a tela Revisar mostrar logo de manhã.
alter table public.contas
  add column if not exists sem_detalhe numeric not null default 0,
  add column if not exists sem_detalhe_desde timestamptz;

-- Atalho do iPhone (automação "Transação" do app Atalhos): o pagamento com Apple Pay chega
-- na hora em /api/atalho. Guardamos só o hash (SHA-256) da chave, nunca a chave em si.
alter table public.profiles
  add column if not exists atalho_chave_hash text unique;
