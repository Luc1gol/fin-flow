"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Landmark,
  Link2,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import {
  carregarCartoesComBanco,
  faturaPaga,
  mapCartaoManual,
  proximoVencimento,
  vincularContaAoCartao,
  type CartaoManual,
  type ContaCartaoBanco,
  type FaturaBanco,
} from "@/lib/dados/cartoes-banco";
import { formatBRL } from "@/lib/format-currency";
import { getBancoById } from "@/data/bancos";
import { labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import {
  formatMaskedValorDisplay,
  MAX_AMOUNT_DIGITS_LANCAMENTO,
  parseAmountDigitsToReais,
  reaisToAmountDigits,
} from "@/lib/currency-input-mask";
import { Botao, Card, LinhaLista, Secao, Valor, campoClasse } from "@/components/ui/base";
import { BancoLogo, corBrilhoBanco } from "@/components/cartoes/BancoLogo";
import { fechamentoDaFatura } from "@/lib/cartao-datas";
import { InstituicaoPickerSheet } from "@/components/cartoes/InstituicaoPickerSheet";

type CartaoUsuario = CartaoManual;

/** Lançamento de despesa feito em um cartão (só leitura, para a fatura aberta). */
type GastoCartao = { conta: string; data: string; valor: number };

function parseNumero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

const mapCartaoRow = mapCartaoManual;

const BANCO_PADRAO_ID = "nubank";

/* ------------------------------------------------------------------ */
/* Ciclo da fatura                                                     */
/* ------------------------------------------------------------------ */

const DIA_MS = 86_400_000;

function diaNoMes(ano: number, mes0: number, dia: number): Date {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  return new Date(ano, mes0, Math.min(Math.max(1, dia), ultimo));
}

function isoData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Ciclo = {
  /** Primeiro dia da fatura aberta (inclusive). */
  inicio: Date;
  /** Dia de fechamento da fatura aberta (compras a partir dele vão para a próxima). */
  fechamento: Date;
  vencimento: Date;
};

/** Fatura aberta hoje: do último fechamento até o próximo. */
function cicloAtual(diaFechamento: number, diaVencimento: number, hoje: Date): Ciclo {
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  const fechaEsteMes = diaNoMes(y, m, diaFechamento);
  const [inicio, fechamento] =
    hoje >= fechaEsteMes
      ? [fechaEsteMes, diaNoMes(y, m + 1, diaFechamento)]
      : [diaNoMes(y, m - 1, diaFechamento), fechaEsteMes];
  let vencimento = diaNoMes(fechamento.getFullYear(), fechamento.getMonth(), diaVencimento);
  if (vencimento <= fechamento) {
    vencimento = diaNoMes(fechamento.getFullYear(), fechamento.getMonth() + 1, diaVencimento);
  }
  return { inicio, fechamento, vencimento };
}

function hojeSemHora(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diasAte(alvo: Date, hoje: Date): number {
  return Math.round((alvo.getTime() - hoje.getTime()) / DIA_MS);
}

function textoDias(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

const fmtDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

function dataCurta(d: Date): string {
  return fmtDiaMes.format(d).replace(".", "");
}

function faturaDoCartao(cartao: CartaoUsuario, gastos: GastoCartao[], hoje: Date): number {
  const { inicio, fechamento } = cicloAtual(cartao.diaFechamento, cartao.diaVencimento, hoje);
  const de = isoData(inicio);
  const ate = isoData(fechamento);
  const rotulo = labelContaCartaoPersistido(cartao.nome).toLowerCase();
  let total = 0;
  for (const g of gastos) {
    if (g.conta === rotulo && g.data >= de && g.data < ate) total += g.valor;
  }
  return total;
}

/**
 * Valor da fatura atual: as compras do ciclo (lançadas ou ainda em Revisar). O saldo que o
 * banco informa para o cartão não serve aqui: ele é tudo o que ocupa o limite, inclusive
 * parcelas de faturas futuras.
 */
function faturaExibida(cartao: CartaoUsuario, gastos: GastoCartao[], hoje: Date): number {
  return faturaDoCartao(cartao, gastos, hoje);
}

/** "yyyy-mm-dd" → Date local (meia-noite). */
function dataDeIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const fmtAtualizado = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function textoAtualizado(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return fmtAtualizado.format(d).replace(",", "");
}

const fmtMesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const fmtMesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const fmtDiaMesNum = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rotuloConta(c: ContaCartaoBanco): string {
  const final = c.numeroConta ? c.numeroConta.replace(/\D/g, "").slice(-4) : "";
  return final ? `${c.nome || "Cartão"} · ${final}` : c.nome || "Cartão";
}

function SeloBanco() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-marca/12 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-marca">
      <Landmark className="h-2.5 w-2.5" aria-hidden />
      do banco
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Cartão visual (carrossel)                                           */
/* ------------------------------------------------------------------ */

function CartaoMini({
  cartao,
  fatura,
  doBanco,
  ativo,
  onSelect,
}: {
  cartao: CartaoUsuario;
  fatura: number;
  doBanco: boolean;
  ativo: boolean;
  onSelect: (el: HTMLElement) => void;
}) {
  const banco = getBancoById(cartao.banco || "outros");
  return (
    <button
      type="button"
      onClick={(e) => onSelect(e.currentTarget)}
      aria-pressed={ativo}
      aria-label={`${cartao.nome || banco.nome}, ${banco.nome}`}
      className={`vidro-suave relative flex aspect-[1.586] w-[68%] shrink-0 snap-center touch-manipulation flex-col justify-between overflow-hidden rounded-2xl p-3.5 text-left transition sm:w-[15rem] ${
        ativo ? "ring-2 ring-marca/70" : "opacity-75 hover:opacity-100"
      }`}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 0% 0%, ${corBrilhoBanco(banco, 0.45)} 0%, transparent 60%), radial-gradient(80% 70% at 100% 100%, ${corBrilhoBanco(banco, 0.18)} 0%, transparent 70%)`,
        }}
        aria-hidden
      />
      <span className="relative flex items-center gap-2">
        <BancoLogo banco={banco} className="h-7 w-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-texto">
            {cartao.nome || banco.nome}
          </span>
          <span className="block truncate text-[11px] text-texto-2">{banco.nome}</span>
        </span>
      </span>
      <span className="relative">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-texto-3">
          {doBanco ? "Fatura atual" : "Fatura aberta"}
          {doBanco ? <Landmark className="h-2.5 w-2.5 text-marca" aria-label="do banco" /> : null}
        </span>
        <span className="block text-base font-semibold text-texto">
          <Valor valor={fatura} />
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe do cartão selecionado                                       */
/* ------------------------------------------------------------------ */

function LinhaInfo({
  icone,
  rotulo,
  valor,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="text-texto-3">{icone}</span>
      <span className="flex-1 text-sm text-texto-2">{rotulo}</span>
      <span className="text-right text-sm text-texto">{valor}</span>
    </div>
  );
}

function BarraUso({ usado, limite }: { usado: number; limite: number }) {
  const uso = limite > 0 ? usado / limite : 0;
  const corBarra = uso > 1 ? "bg-negativo" : uso > 0.8 ? "bg-alerta" : "bg-marca";
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-white/[0.07]"
      role="progressbar"
      aria-label="Uso do limite"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(Math.max(uso, 0), 1) * 100)}
    >
      <div
        className={`h-full rounded-full transition-[width] ${corBarra}`}
        style={{ width: `${Math.min(Math.max(uso, 0), 1) * 100}%` }}
      />
    </div>
  );
}

type PontoFatura = { rotulo: string; valor: number; paga: boolean; vencimento: string };

function TooltipFatura({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PontoFatura }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="vidro rounded-xl px-3 py-2 text-xs">
      <p className="text-texto-3">Vence {fmtDiaMesNum.format(dataDeIso(p.vencimento))}</p>
      <p className="text-texto">{formatBRL(p.valor)}</p>
    </div>
  );
}

function StatusFatura({ fatura }: { fatura: FaturaBanco }) {
  if (faturaPaga(fatura)) return <span className="text-[11px] text-positivo">Paga</span>;
  if (fatura.valorPago > 0) {
    return <span className="text-[11px] text-alerta">Pago {formatBRL(fatura.valorPago)}</span>;
  }
  return <span className="text-[11px] text-texto-3">Em aberto</span>;
}

function HistoricoFaturas({ faturas }: { faturas: FaturaBanco[] }) {
  if (faturas.length === 0) return null;
  const serie: PontoFatura[] = faturas
    .slice(0, 6)
    .reverse()
    .map((f) => ({
      rotulo: fmtMesCurto.format(dataDeIso(f.vencimento)).replace(".", ""),
      valor: f.valorTotal,
      paga: faturaPaga(f),
      vencimento: f.vencimento,
    }));

  return (
    <Secao titulo="Histórico de faturas">
      <Card className="px-3 pt-3">
        {serie.length > 1 ? (
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="rotulo"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<TooltipFatura />} cursor={{ fill: "rgb(255 255 255 / 0.05)" }} />
                <Bar dataKey="valor" radius={[5, 5, 0, 0]} maxBarSize={28}>
                  {serie.map((p) => (
                    <Cell key={p.vencimento} fill={p.paga ? "#4f8cff" : "rgb(79 140 255 / 0.45)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <div className="divide-y divide-borda">
          {faturas.map((f) => {
            const venc = dataDeIso(f.vencimento);
            return (
              <LinhaLista
                key={f.id}
                icone={<ReceiptText className="h-4 w-4" aria-hidden />}
                titulo={capitalizar(fmtMesAno.format(venc))}
                subtitulo={`Vencimento ${fmtDiaMesNum.format(venc)}`}
                direita={
                  <span className="flex flex-col items-end leading-tight">
                    <Valor valor={f.valorTotal} />
                    <StatusFatura fatura={f} />
                  </span>
                }
              />
            );
          })}
        </div>
      </Card>
    </Secao>
  );
}

function DetalheCartao({
  cartao,
  fatura,
  conta,
  faturasBanco,
  podeVincular,
  onEdit,
  onDelete,
}: {
  cartao: CartaoUsuario;
  fatura: number;
  conta: ContaCartaoBanco | null;
  faturasBanco: FaturaBanco[];
  podeVincular: boolean;
  onEdit: (c: CartaoUsuario) => void;
  onDelete: (id: string) => void;
}) {
  const hoje = hojeSemHora();
  const ciclo = cicloAtual(cartao.diaFechamento, cartao.diaVencimento, hoje);

  const doBanco = conta !== null && conta.saldo !== null;

  // Limite: prefere o do banco; disponível idem (senão, limite − fatura).
  const limite = conta?.limite ?? (cartao.limite > 0 ? cartao.limite : 0);
  const limiteDoBanco = conta?.limite != null;
  const disponivel =
    conta?.limiteDisponivel != null && limiteDoBanco ? conta.limiteDisponivel : limite - fatura;
  const usado = limite - disponivel;
  const temLimite = limite > 0;
  const uso = temLimite ? usado / limite : 0;

  // Vencimento: o do banco (avançado se já passou) ou o do ciclo manual.
  const vencBancoIso = conta ? proximoVencimento(conta.faturaVencimento, null, hoje) : null;
  const vencimento = vencBancoIso ? dataDeIso(vencBancoIso) : ciclo.vencimento;
  const diasVence = diasAte(vencimento, hoje);

  // Fechamento: o do banco (ou calculado pelo vencimento do banco), avançado se já passou;
  // sem banco, o do ciclo manual.
  const fechBancoIso = conta
    ? proximoVencimento(fechamentoDaFatura(conta.faturaFechamento, conta.faturaVencimento, cartao.banco), null, hoje)
    : null;
  const fechamento = fechBancoIso ? dataDeIso(fechBancoIso) : ciclo.fechamento;
  const diasFecha = diasAte(fechamento, hoje);

  const atualizado = doBanco ? textoAtualizado(conta.saldoEm ?? conta.ultimaSincronizacao) : null;

  // Entre o fechamento e o vencimento: a fatura fechada (do banco) é a que vence; o resto do
  // que se deve no cartão são compras feitas depois do fechamento, que vão para a próxima.
  const hojeIso = isoData(hoje);
  const fechada = doBanco
    ? faturasBanco
        .filter((f) => f.vencimento >= hojeIso && f.valorTotal - f.valorPago > 0.005)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
    : undefined;
  const aPagarFechada = fechada ? fechada.valorTotal - fechada.valorPago : 0;

  // No computador o detalhe vira duas colunas. Com histórico, as datas ficam à esquerda (junto
  // da fatura) e o histórico à direita; sem histórico, as datas passam para a direita. A ordem
  // dos elementos (e o celular) não muda: só o ponto de divisão entre as colunas.
  const temHistorico = conta !== null && faturasBanco.length > 0;

  const cardDatas = (
    <Card className="divide-y divide-borda px-3">
      <LinhaInfo
        icone={<CalendarClock className="h-4 w-4" aria-hidden />}
        rotulo="Fechamento"
        valor={
          <span className="inline-flex items-center gap-1.5">
            {fechBancoIso ? <SeloBanco /> : null}
            Dia {fechamento.getDate()}
            <span className="text-xs text-texto-3">
              {dataCurta(fechamento)} · {textoDias(diasFecha)}
            </span>
          </span>
        }
      />
      <LinhaInfo
        icone={<CalendarCheck className="h-4 w-4" aria-hidden />}
        rotulo="Vencimento"
        valor={
          <span className="inline-flex items-center gap-1.5">
            {vencBancoIso ? <SeloBanco /> : null}
            Dia {vencimento.getDate()}
            <span className="text-xs text-texto-3">
              {dataCurta(vencimento)} · {textoDias(diasVence)}
            </span>
          </span>
        }
      />
      {conta?.pagamentoMinimo != null ? (
        <LinhaInfo
          icone={<ReceiptText className="h-4 w-4" aria-hidden />}
          rotulo="Pagamento mínimo"
          valor={
            <span className="inline-flex items-center gap-1.5">
              <SeloBanco />
              <Valor valor={conta.pagamentoMinimo} />
            </span>
          }
        />
      ) : null}
      <LinhaInfo
        icone={<ShoppingBag className="h-4 w-4" aria-hidden />}
        rotulo="Melhor dia de compra"
        valor={<span className="font-medium text-positivo">Dia {fechamento.getDate()}</span>}
      />
    </Card>
  );

  return (
    <section className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-6">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
      <div>
        {fechada ? (
          <p className="flex items-center gap-1.5 text-xs text-texto-3">
            Fatura fechada · vence {dataCurta(dataDeIso(fechada.vencimento))} <SeloBanco />
          </p>
        ) : (
          <p className="text-xs text-texto-3">
            Fatura atual · fecha {dataCurta(fechamento)} · vence {dataCurta(vencimento)}
          </p>
        )}
        <p className="mt-0.5 text-[28px] font-semibold leading-tight text-texto">
          <Valor valor={fechada ? aPagarFechada : fatura} />
        </p>
        {fechada ? (
          <p className="mt-1 text-sm text-texto-2">
            Fatura atual (aberta): <Valor valor={fatura} />
          </p>
        ) : null}
        <p className="mt-0.5 text-[11px] text-texto-3">
          {doBanco
            ? `Compras desde ${dataCurta(ciclo.inicio)}, inclusive as que ainda estão em Revisar${
                atualizado ? ` · banco atualizado ${atualizado}` : ""
              }`
            : `Soma das despesas lançadas neste cartão desde ${dataCurta(ciclo.inicio)}.`}
        </p>
      </div>

      {temLimite ? (
        <div>
          <BarraUso usado={usado} limite={limite} />
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 text-texto-3">
              {Math.round(uso * 100)}% de <Valor valor={limite} />
              {limiteDoBanco ? <SeloBanco /> : null}
            </span>
            <span className={disponivel < 0 ? "text-negativo" : "text-texto-2"}>
              {disponivel < 0 ? "Acima do limite " : "Disponível "}
              <Valor valor={Math.abs(disponivel)} />
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onEdit(cartao)}
          className="self-start touch-manipulation text-xs font-medium text-marca"
        >
          Informar limite para ver o uso
        </button>
      )}

      {!conta && podeVincular ? (
        <button
          type="button"
          onClick={() => onEdit(cartao)}
          className="vidro-suave flex touch-manipulation items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs text-texto-2 transition hover:text-texto"
        >
          <Link2 className="h-4 w-4 shrink-0 text-marca" aria-hidden />
          <span className="flex-1">Conecte este cartão ao banco para ver valores reais</span>
          <span className="font-medium text-marca">Conectar</span>
        </button>
      ) : null}

      {temHistorico ? cardDatas : null}
      </div>

      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
      {temHistorico ? null : cardDatas}

      {conta ? <HistoricoFaturas faturas={faturasBanco} /> : null}

      <div className="flex gap-2">
        <Botao className="flex-1" onClick={() => onEdit(cartao)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Editar
        </Botao>
        <Botao
          variante="fantasma"
          className="flex-1 !text-negativo hover:!bg-negativo/10"
          onClick={() => onDelete(cartao.id)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Excluir
        </Botao>
      </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tela                                                                */
/* ------------------------------------------------------------------ */

function noopSubscribe(): () => void {
  return () => {};
}

const rotuloCampo = "mb-1 block text-xs font-medium text-texto-2";

export function CartoesScreen() {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [cartoes, setCartoes] = useState<CartaoUsuario[]>([]);
  const [contas, setContas] = useState<ContaCartaoBanco[]>([]);
  const [faturasPorConta, setFaturasPorConta] = useState<Record<string, FaturaBanco[]>>({});
  const [gastos, setGastos] = useState<GastoCartao[]>([]);
  const [carregado, setCarregado] = useState(false);
  const isLoading = !carregado;
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pickerAberto, setPickerAberto] = useState(false);
  const [cartaoEditando, setCartaoEditando] = useState<string | null>(null);
  const [selectedBanco, setSelectedBanco] = useState<string>(BANCO_PADRAO_ID);
  const [nome, setNome] = useState("");
  const [diaFechamento, setDiaFechamento] = useState("1");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [limiteDigitos, setLimiteDigitos] = useState("");
  /** Conta do banco escolhida no formulário ("" = nenhuma). */
  const [contaVinculo, setContaVinculo] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const bancoModalVisual = useMemo(
    () => getBancoById(selectedBanco || "outros"),
    [selectedBanco],
  );

  useEffect(() => {
    let cancelado = false;

    async function fetchCartoes() {
      try {
        // Cartões manuais + contas de crédito do banco (com vínculo automático) + faturas.
        const dados = await carregarCartoesComBanco();
        if (cancelado) return;
        setCartoes(
          dados.cartoes.map((c) => ({
            id: c.id,
            banco: c.banco,
            nome: c.nome,
            diaFechamento: c.diaFechamento,
            diaVencimento: c.diaVencimento,
            limite: c.limite,
          })),
        );
        setContas(dados.contasCredito);
        setFaturasPorConta(dados.faturasPorConta);

        // Fatura estimada (fallback sem banco): lançamentos feitos nos cartões (desde 2 meses atrás).
        if (dados.cartoes.length > 0) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user || cancelado) return;
          const hoje = hojeSemHora();
          const desde = isoData(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1));
          const lanc = await supabase
            .from("lancamentos")
            .select("valor, data, conta_cartao")
            .eq("user_id", user.id)
            .eq("tipo", "despesa")
            .like("conta_cartao", "Cartão %")
            .gte("data", desde);
          // Compras do banco que ainda estão em Revisar também já são da fatura.
          const rotuloPorConta = new Map(
            dados.cartoes
              .filter((c) => c.conta)
              .map((c) => [c.conta!.id, labelContaCartaoPersistido(c.nome).toLowerCase()]),
          );
          const pend =
            rotuloPorConta.size > 0
              ? await supabase
                  .from("transacoes_importadas")
                  .select("conta_id, data, valor")
                  .in("conta_id", [...rotuloPorConta.keys()])
                  .eq("status", "pendente")
                  .lt("valor", 0)
                  .gte("data", desde)
              : { data: [], error: null };
          if (cancelado) return;
          if (lanc.error) console.error(lanc.error);
          if (pend.error) console.error(pend.error);
          setGastos([
            ...(lanc.data ?? []).map((r) => ({
              conta: String(r.conta_cartao ?? "").trim().toLowerCase(),
              data: String(r.data ?? "").slice(0, 10),
              valor: Math.abs(parseNumero(r.valor)),
            })),
            ...(pend.data ?? []).map((r) => ({
              conta: rotuloPorConta.get(String(r.conta_id)) ?? "",
              data: String(r.data ?? "").slice(0, 10),
              valor: Math.abs(parseNumero(r.valor)),
            })),
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelado) setCarregado(true);
      }
    }

    fetchCartoes();
    return () => {
      cancelado = true;
    };
  }, []);

  const cartoesOrdenados = useMemo(
    () =>
      [...cartoes].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      ),
    [cartoes],
  );

  /** Conta do banco vinculada a cada cartão (por `contas.cartao_id`). */
  const contaPorCartao = useMemo(() => {
    const mapa = new Map<string, ContaCartaoBanco>();
    for (const k of contas) if (k.cartaoId) mapa.set(k.cartaoId, k);
    return mapa;
  }, [contas]);

  const faturas = useMemo(() => {
    const hoje = hojeSemHora();
    const mapa = new Map<string, number>();
    for (const c of cartoes) {
      mapa.set(c.id, faturaExibida(c, gastos, hoje));
    }
    return mapa;
  }, [cartoes, gastos]);

  const totalFaturas = useMemo(
    () => [...faturas.values()].reduce((acc, v) => acc + v, 0),
    [faturas],
  );

  // Selecionado derivado: se o escolhido sumir (excluído), cai no primeiro da lista.
  const selecionado =
    cartoesOrdenados.find((c) => c.id === selecionadoId) ?? cartoesOrdenados[0] ?? null;

  function selecionar(id: string, el: HTMLElement) {
    setSelecionadoId(id);
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function resetForm() {
    setCartaoEditando(null);
    setSelectedBanco(BANCO_PADRAO_ID);
    setNome("");
    setDiaFechamento("1");
    setDiaVencimento("10");
    setLimiteDigitos("");
    setContaVinculo("");
    setErroForm(null);
  }

  const fecharModal = useCallback(() => {
    setPickerAberto(false);
    setIsModalOpen(false);
    setCartaoEditando(null);
    setSelectedBanco(BANCO_PADRAO_ID);
    setNome("");
    setDiaFechamento("1");
    setDiaVencimento("10");
    setLimiteDigitos("");
    setContaVinculo("");
    setErroForm(null);
  }, []);

  const handleEditar = useCallback((cartao: CartaoUsuario) => {
    setSelectedBanco(cartao.banco || "outros");
    setNome(cartao.nome);
    setDiaFechamento(String(cartao.diaFechamento));
    setDiaVencimento(String(cartao.diaVencimento));
    setLimiteDigitos(reaisToAmountDigits(cartao.limite));
    setContaVinculo(contas.find((k) => k.cartaoId === cartao.id)?.id ?? "");
    setErroForm(null);
    setCartaoEditando(cartao.id);
    setIsModalOpen(true);
  }, [contas]);

  /** Grava o vínculo cartão ↔ conta do banco (se mudou) e atualiza o estado local. */
  const aplicarVinculo = useCallback(
    async (cartaoId: string, contaId: string | null): Promise<string | null> => {
      const atual = contas.find((k) => k.cartaoId === cartaoId)?.id ?? null;
      if (atual === contaId) return null;
      try {
        await vincularContaAoCartao(cartaoId, contaId);
      } catch (err) {
        console.error("Erro Supabase:", err);
        return "Cartão salvo, mas não foi possível vincular a conta do banco.";
      }
      setContas((prev) =>
        prev.map((k) =>
          k.id === contaId
            ? { ...k, cartaoId }
            : k.cartaoId === cartaoId
              ? { ...k, cartaoId: null }
              : k,
        ),
      );
      return null;
    },
    [contas],
  );

  // Trava o scroll da página e fecha com Esc enquanto o formulário está aberto.
  useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !pickerAberto) fecharModal();
    }
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [isModalOpen, pickerAberto, fecharModal]);

  const handleSalvarCartao = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (salvando) return;
      setErroForm(null);

      let userId: string | null = null;
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) {
          console.error("Erro Supabase:", userErr);
        }
        userId = user?.id ?? null;
        if (!userId) {
          const { data: sessionData, error: sessionErr } =
            await supabase.auth.getSession();
          if (sessionErr) {
            console.error("Erro Supabase:", sessionErr);
          }
          userId = sessionData.session?.user?.id ?? null;
        }
      } catch (err) {
        console.error("Erro Supabase:", err);
        setErroForm("Não foi possível verificar sua sessão. Tente novamente ou entre de novo.");
        return;
      }

      if (!userId) {
        setErroForm("Não foi possível identificar o usuário. Entre novamente.");
        return;
      }

      if (!nome.trim()) {
        setErroForm("Preencha o nome do cartão.");
        return;
      }
      if (!cartaoEditando && !selectedBanco.trim()) {
        setErroForm("Selecione o banco do cartão.");
        return;
      }
      const df = Math.min(31, Math.max(1, Number(diaFechamento) || 1));
      const dv = Math.min(31, Math.max(1, Number(diaVencimento) || 1));
      const limite = parseAmountDigitsToReais(limiteDigitos);

      setSalvando(true);
      try {
        if (cartaoEditando) {
          const updatePayload = {
            nome: nome.trim(),
            dia_fechamento: df,
            dia_vencimento: dv,
            limite,
          };
          const { data: updated, error } = await supabase
            .from("cartoes")
            .update(updatePayload)
            .eq("id", cartaoEditando)
            .eq("user_id", userId)
            .select("*")
            .single();

          if (error) {
            console.error("Erro Supabase:", error);
            setErroForm(error.message ?? "Erro ao atualizar o cartão.");
            return;
          }

          if (updated) {
            const mapped = mapCartaoRow(updated as Record<string, unknown>);
            setCartoes((prev) =>
              prev.map((c) => (c.id === cartaoEditando ? mapped : c)),
            );
            const erroVinculo = await aplicarVinculo(cartaoEditando, contaVinculo || null);
            if (erroVinculo) {
              setErroForm(erroVinculo);
              return;
            }
            fecharModal();
          }
          return;
        }

        const insertRow = {
          user_id: userId,
          banco: selectedBanco,
          nome: nome.trim(),
          dia_fechamento: df,
          dia_vencimento: dv,
          limite,
        };

        const { data: inserted, error } = await supabase
          .from("cartoes")
          .insert(insertRow)
          .select("*")
          .single();

        if (error) {
          console.error("Erro Supabase:", error);
          setErroForm(error.message ?? "Erro ao salvar o cartão.");
          return;
        }

        if (inserted) {
          const novo = mapCartaoRow(inserted as Record<string, unknown>);
          setCartoes((prev) => [...prev, novo]);
          setSelecionadoId(novo.id);
          if (contaVinculo) {
            const erroVinculo = await aplicarVinculo(novo.id, contaVinculo);
            if (erroVinculo) {
              // O cartão já existe: passa a editar para permitir tentar o vínculo de novo.
              setCartaoEditando(novo.id);
              setErroForm(erroVinculo);
              return;
            }
          }
          fecharModal();
        }
      } catch (err) {
        console.error("Erro Supabase:", err);
        setErroForm("Erro inesperado ao salvar. Tente novamente.");
      } finally {
        setSalvando(false);
      }
    },
    [
      salvando,
      selectedBanco,
      nome,
      diaFechamento,
      diaVencimento,
      limiteDigitos,
      cartaoEditando,
      contaVinculo,
      aplicarVinculo,
      fecharModal,
    ],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Tem certeza que deseja excluir este cartão?")) {
        return;
      }
      // Desfaz o vínculo com a conta do banco antes de excluir (a conta continua existindo).
      if (contas.some((k) => k.cartaoId === id)) {
        try {
          await vincularContaAoCartao(id, null);
        } catch (err) {
          console.error(err);
        }
      }
      const { error } = await supabase.from("cartoes").delete().eq("id", id);
      if (error) {
        console.error(error);
        window.alert(error.message ?? "Não foi possível excluir o cartão.");
        return;
      }
      setCartoes((prev) => prev.filter((c) => c.id !== id));
      setContas((prev) => prev.map((k) => (k.cartaoId === id ? { ...k, cartaoId: null } : k)));
    },
    [contas],
  );

  function abrirNovo() {
    resetForm();
    setIsModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-texto">Cartões</h1>
          {!isLoading && cartoes.length > 0 ? (
            <p className="text-xs text-texto-3">
              {cartoes.length} {cartoes.length === 1 ? "cartão" : "cartões"} · faturas abertas{" "}
              <Valor valor={totalFaturas} className="text-texto-2" />
            </p>
          ) : null}
        </div>
        <Botao variante="primario" onClick={abrirNovo}>
          <Plus className="h-4 w-4" aria-hidden />
          Adicionar
        </Botao>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando cartões">
          <div className="flex gap-3 overflow-hidden">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="aspect-[1.586] w-[68%] shrink-0 animate-pulse rounded-2xl bg-superficie-2 sm:w-[15rem]"
              />
            ))}
          </div>
          <div className="h-8 w-40 animate-pulse rounded-lg bg-superficie-2" />
          <div className="h-28 animate-pulse rounded-2xl bg-superficie-2" />
        </div>
      ) : cartoesOrdenados.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <span className="vidro flex h-11 w-11 items-center justify-center rounded-full text-marca">
            <CreditCard className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-texto">Nenhum cartão cadastrado</p>
            <p className="mt-1 text-xs text-texto-3">
              Cadastre seus cartões para acompanhar fatura, fechamento e vencimento.
            </p>
          </div>
          <Botao variante="primario" onClick={abrirNovo}>
            <Plus className="h-4 w-4" aria-hidden />
            Adicionar cartão
          </Botao>
        </Card>
      ) : (
        <>
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:flex-wrap lg:overflow-visible lg:scroll-px-0 lg:px-0"
          >
            {cartoesOrdenados.map((c) => (
              <CartaoMini
                key={c.id}
                cartao={c}
                fatura={faturas.get(c.id) ?? 0}
                doBanco={contaPorCartao.get(c.id)?.saldo != null}
                ativo={selecionado?.id === c.id}
                onSelect={(el) => selecionar(c.id, el)}
              />
            ))}
            <button
              type="button"
              onClick={abrirNovo}
              className="vidro flex aspect-[1.586] w-[40%] shrink-0 snap-center touch-manipulation flex-col items-center justify-center gap-1.5 rounded-2xl text-xs font-medium text-texto-2 transition hover:text-texto sm:w-[9rem]"
            >
              <Plus className="h-5 w-5 text-marca" aria-hidden />
              Adicionar cartão
            </button>
          </div>

          {selecionado ? (
            <DetalheCartao
              key={selecionado.id}
              cartao={selecionado}
              fatura={faturas.get(selecionado.id) ?? 0}
              conta={contaPorCartao.get(selecionado.id) ?? null}
              faturasBanco={
                faturasPorConta[contaPorCartao.get(selecionado.id)?.id ?? ""] ?? []
              }
              podeVincular={contas.length > 0}
              onEdit={handleEditar}
              onDelete={handleDelete}
            />
          ) : null}
        </>
      )}

      {isClient && isModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6">
              <button
                type="button"
                className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                aria-label="Fechar formulário"
                onClick={fecharModal}
              />
              <div
                className="vidro relative z-[1] mx-auto flex max-h-[min(92dvh,640px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl !bg-superficie/90 lg:max-w-md lg:rounded-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-cartoes-titulo"
              >
                <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden />
                <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-2 lg:pt-4">
                  <h2 id="modal-cartoes-titulo" className="text-base font-semibold text-texto">
                    {cartaoEditando ? "Editar cartão" : "Novo cartão"}
                  </h2>
                  <button
                    type="button"
                    onClick={fecharModal}
                    aria-label="Fechar"
                    className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-texto-2 hover:bg-white/[0.06] hover:text-texto"
                  >
                    <X className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>

                <form onSubmit={handleSalvarCartao} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 [-webkit-overflow-scrolling:touch]">
                    {erroForm ? (
                      <p
                        role="alert"
                        className="rounded-lg border border-negativo/30 bg-negativo/10 px-3 py-2 text-xs text-negativo"
                      >
                        {erroForm}
                      </p>
                    ) : null}

                    <div>
                      <span className={rotuloCampo}>Banco</span>
                      {cartaoEditando ? (
                        <div
                          className={`${campoClasse} flex h-11 items-center gap-2.5 opacity-60`}
                          aria-readonly="true"
                        >
                          <BancoLogo banco={bancoModalVisual} className="h-6 w-6" />
                          <span className="min-w-0 flex-1 truncate">{bancoModalVisual.nome}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPickerAberto(true)}
                          className={`${campoClasse} flex h-11 touch-manipulation items-center gap-2.5 text-left`}
                        >
                          <BancoLogo banco={bancoModalVisual} className="h-6 w-6" />
                          <span className="min-w-0 flex-1 truncate">{bancoModalVisual.nome}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-texto-3" aria-hidden />
                        </button>
                      )}
                      {cartaoEditando ? (
                        <p className="mt-1 text-[11px] text-texto-3">
                          A instituição não pode ser alterada.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label htmlFor="cartao-nome" className={rotuloCampo}>
                        Nome do cartão
                      </label>
                      <input
                        id="cartao-nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        className={campoClasse}
                        placeholder="Ex.: Platinum, Gold…"
                        autoComplete="off"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="cartao-limite" className={rotuloCampo}>
                        Limite <span className="font-normal text-texto-3">(opcional)</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-3">
                          R$
                        </span>
                        <input
                          id="cartao-limite"
                          type="text"
                          inputMode="numeric"
                          value={limiteDigitos ? formatMaskedValorDisplay(limiteDigitos) : ""}
                          onChange={(e) =>
                            setLimiteDigitos(
                              e.target.value
                                .replace(/\D/g, "")
                                .replace(/^0+/, "")
                                .slice(0, MAX_AMOUNT_DIGITS_LANCAMENTO),
                            )
                          }
                          className={`${campoClasse} valor pl-9`}
                          placeholder="0,00"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="cartao-fechar" className={rotuloCampo}>
                          Dia de fechamento
                        </label>
                        <input
                          id="cartao-fechar"
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={diaFechamento}
                          onChange={(e) =>
                            setDiaFechamento(e.target.value.replace(/\D/g, "").slice(0, 2))
                          }
                          className={`${campoClasse} valor`}
                          placeholder="1–31"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label htmlFor="cartao-venc" className={rotuloCampo}>
                          Dia de vencimento
                        </label>
                        <input
                          id="cartao-venc"
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={diaVencimento}
                          onChange={(e) =>
                            setDiaVencimento(e.target.value.replace(/\D/g, "").slice(0, 2))
                          }
                          className={`${campoClasse} valor`}
                          placeholder="1–31"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-texto-3">
                      Compras a partir do dia de fechamento entram na fatura seguinte.
                    </p>

                    {contas.length > 0 ? (
                      <div>
                        <label htmlFor="cartao-conta-banco" className={rotuloCampo}>
                          Conta do banco
                        </label>
                        <div className="relative">
                          <select
                            id="cartao-conta-banco"
                            value={contaVinculo}
                            onChange={(e) => setContaVinculo(e.target.value)}
                            className={`${campoClasse} appearance-none pr-9`}
                          >
                            <option value="">Nenhuma</option>
                            {contas.map((k) => {
                              const outro =
                                k.cartaoId && k.cartaoId !== cartaoEditando
                                  ? cartoes.find((c) => c.id === k.cartaoId)
                                  : undefined;
                              return (
                                <option key={k.id} value={k.id}>
                                  {rotuloConta(k)}
                                  {outro ? ` (em ${outro.nome || "outro cartão"})` : ""}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3"
                            aria-hidden
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-texto-3">
                          Com uma conta vinculada, fatura, limite e vencimento vêm do banco a cada
                          sincronização.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2 border-t border-borda px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <Botao variante="fantasma" className="flex-1" onClick={fecharModal}>
                      Cancelar
                    </Botao>
                    <Botao type="submit" variante="primario" className="flex-1" disabled={salvando}>
                      {salvando ? "Salvando…" : cartaoEditando ? "Atualizar" : "Salvar"}
                    </Botao>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      <InstituicaoPickerSheet
        open={isModalOpen && pickerAberto}
        selectedId={selectedBanco}
        onClose={() => setPickerAberto(false)}
        onSelect={(id) => setSelectedBanco(id)}
      />
    </div>
  );
}
