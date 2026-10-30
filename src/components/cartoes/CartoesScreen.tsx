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
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getBancoById } from "@/data/bancos";
import { labelContaCartaoPersistido } from "@/lib/conta-cartao-lancamento";
import {
  formatMaskedValorDisplay,
  MAX_AMOUNT_DIGITS_LANCAMENTO,
  parseAmountDigitsToReais,
  reaisToAmountDigits,
} from "@/lib/currency-input-mask";
import { Botao, Card, Valor, campoClasse } from "@/components/ui/base";
import { BancoLogo, corBrilhoBanco } from "@/components/cartoes/BancoLogo";
import { InstituicaoPickerSheet } from "@/components/cartoes/InstituicaoPickerSheet";

type CartaoUsuario = {
  id: string;
  /** Id da instituição em `BANCOS` (ex.: nubank, itau). */
  banco: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
  limite: number;
};

/** Lançamento de despesa feito em um cartão (só leitura, para a fatura aberta). */
type GastoCartao = { conta: string; data: string; valor: number };

function parseIntSafe(v: unknown): number {
  const n =
    typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseNumero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function mapCartaoRow(row: Record<string, unknown>): CartaoUsuario {
  const bancoRaw = String(row.banco ?? "").trim();
  return {
    id: String(row.id),
    banco: bancoRaw || "outros",
    nome: String(row.nome ?? "").trim(),
    diaFechamento: parseIntSafe(row.dia_fechamento),
    diaVencimento: parseIntSafe(row.dia_vencimento),
    limite: parseNumero(row.limite),
  };
}

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

/* ------------------------------------------------------------------ */
/* Cartão visual (carrossel)                                           */
/* ------------------------------------------------------------------ */

function CartaoMini({
  cartao,
  fatura,
  ativo,
  onSelect,
}: {
  cartao: CartaoUsuario;
  fatura: number;
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
        <span className="block text-[10px] uppercase tracking-wider text-texto-3">Fatura aberta</span>
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

function DetalheCartao({
  cartao,
  fatura,
  onEdit,
  onDelete,
}: {
  cartao: CartaoUsuario;
  fatura: number;
  onEdit: (c: CartaoUsuario) => void;
  onDelete: (id: string) => void;
}) {
  const hoje = hojeSemHora();
  const ciclo = cicloAtual(cartao.diaFechamento, cartao.diaVencimento, hoje);
  const diasFecha = diasAte(ciclo.fechamento, hoje);
  const diasVence = diasAte(ciclo.vencimento, hoje);

  const temLimite = cartao.limite > 0;
  const uso = temLimite ? fatura / cartao.limite : 0;
  const corBarra = uso > 1 ? "bg-negativo" : uso > 0.8 ? "bg-alerta" : "bg-marca";
  const disponivel = cartao.limite - fatura;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-texto-3">
          Fatura aberta · fecha {dataCurta(ciclo.fechamento)}
        </p>
        <p className="mt-0.5 text-[28px] font-semibold leading-tight text-texto">
          <Valor valor={fatura} />
        </p>
        <p className="mt-0.5 text-[11px] text-texto-3">
          Soma das despesas lançadas neste cartão desde {dataCurta(ciclo.inicio)}.
        </p>
      </div>

      {temLimite ? (
        <div>
          <div
            className="h-2 overflow-hidden rounded-full bg-white/[0.07]"
            role="progressbar"
            aria-label="Uso do limite"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(uso, 1) * 100)}
          >
            <div
              className={`h-full rounded-full transition-[width] ${corBarra}`}
              style={{ width: `${Math.min(uso, 1) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-xs">
            <span className="text-texto-3">
              {Math.round(uso * 100)}% de <Valor valor={cartao.limite} />
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

      <Card className="divide-y divide-borda px-3">
        <LinhaInfo
          icone={<CalendarClock className="h-4 w-4" aria-hidden />}
          rotulo="Fechamento"
          valor={
            <>
              Dia {cartao.diaFechamento}
              <span className="ml-1.5 text-xs text-texto-3">{textoDias(diasFecha)}</span>
            </>
          }
        />
        <LinhaInfo
          icone={<CalendarCheck className="h-4 w-4" aria-hidden />}
          rotulo="Vencimento"
          valor={
            <>
              Dia {cartao.diaVencimento}
              <span className="ml-1.5 text-xs text-texto-3">
                {dataCurta(ciclo.vencimento)} · {textoDias(diasVence)}
              </span>
            </>
          }
        />
        <LinhaInfo
          icone={<ShoppingBag className="h-4 w-4" aria-hidden />}
          rotulo="Melhor dia de compra"
          valor={<span className="font-medium text-positivo">Dia {cartao.diaFechamento}</span>}
        />
      </Card>

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
  const [gastos, setGastos] = useState<GastoCartao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pickerAberto, setPickerAberto] = useState(false);
  const [cartaoEditando, setCartaoEditando] = useState<string | null>(null);
  const [selectedBanco, setSelectedBanco] = useState<string>(BANCO_PADRAO_ID);
  const [nome, setNome] = useState("");
  const [diaFechamento, setDiaFechamento] = useState("1");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [limiteDigitos, setLimiteDigitos] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const bancoModalVisual = useMemo(
    () => getBancoById(selectedBanco || "outros"),
    [selectedBanco],
  );

  useEffect(() => {
    async function fetchCartoes() {
      setIsLoading(true);
      try {
        const {
          data: { user },
          error: uErr,
        } = await supabase.auth.getUser();
        if (uErr || !user) {
          console.error(uErr);
          setCartoes([]);
          return;
        }

        const bundle = await supabase
          .from("cartoes")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const error = bundle.error;
        let data = bundle.data;

        if (error) {
          const retry = await supabase
            .from("cartoes")
            .select("*")
            .eq("user_id", user.id);
          if (retry.error) {
            console.error(error, retry.error);
            setCartoes([]);
            return;
          }
          data = retry.data;
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        const lista = rows.map(mapCartaoRow);
        setCartoes(lista);

        // Fatura aberta: só leitura dos lançamentos feitos nos cartões (desde 2 meses atrás).
        if (lista.length > 0) {
          const hoje = hojeSemHora();
          const desde = isoData(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1));
          const lanc = await supabase
            .from("lancamentos")
            .select("valor, data, conta_cartao")
            .eq("user_id", user.id)
            .eq("tipo", "despesa")
            .like("conta_cartao", "Cartão %")
            .gte("data", desde);
          if (lanc.error) {
            console.error(lanc.error);
          } else {
            setGastos(
              (lanc.data ?? []).map((r) => ({
                conta: String(r.conta_cartao ?? "").trim().toLowerCase(),
                data: String(r.data ?? "").slice(0, 10),
                valor: Math.abs(parseNumero(r.valor)),
              })),
            );
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchCartoes();
  }, []);

  const cartoesOrdenados = useMemo(
    () =>
      [...cartoes].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
      ),
    [cartoes],
  );

  const faturas = useMemo(() => {
    const hoje = hojeSemHora();
    const mapa = new Map<string, number>();
    for (const c of cartoes) mapa.set(c.id, faturaDoCartao(c, gastos, hoje));
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
    setErroForm(null);
  }, []);

  const handleEditar = useCallback((cartao: CartaoUsuario) => {
    setSelectedBanco(cartao.banco || "outros");
    setNome(cartao.nome);
    setDiaFechamento(String(cartao.diaFechamento));
    setDiaVencimento(String(cartao.diaVencimento));
    setLimiteDigitos(reaisToAmountDigits(cartao.limite));
    setErroForm(null);
    setCartaoEditando(cartao.id);
    setIsModalOpen(true);
  }, []);

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
      fecharModal,
    ],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este cartão?")) {
      return;
    }
    const { error } = await supabase.from("cartoes").delete().eq("id", id);
    if (error) {
      console.error(error);
      window.alert(error.message ?? "Não foi possível excluir o cartão.");
      return;
    }
    setCartoes((prev) => prev.filter((c) => c.id !== id));
  }, []);

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
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:scroll-px-0 lg:px-0"
          >
            {cartoesOrdenados.map((c) => (
              <CartaoMini
                key={c.id}
                cartao={c}
                fatura={faturas.get(c.id) ?? 0}
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
