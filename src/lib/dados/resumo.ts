import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/importacao/classificar";

/** Mês no formato "YYYY-MM" decomposto (mes0 = 0–11). */
export type Mes = { ano: number; mes0: number };

export const NOMES_MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function nomeMes(m: Mes, comAno = true): string {
  const nome = NOMES_MESES[m.mes0];
  return comAno ? `${nome} de ${m.ano}` : nome;
}

export function chaveMes(m: Mes): string {
  return `${m.ano}-${String(m.mes0 + 1).padStart(2, "0")}`;
}

export function somarMeses(m: Mes, delta: number): Mes {
  const d = new Date(m.ano, m.mes0 + delta, 1);
  return { ano: d.getFullYear(), mes0: d.getMonth() };
}

/** Último mês fechado (o anterior ao de `hoje`). */
export function mesFechadoMaisRecente(hoje: Date = new Date()): Mes {
  return somarMeses({ ano: hoje.getFullYear(), mes0: hoje.getMonth() }, -1);
}

function compararMes(a: Mes, b: Mes): number {
  return a.ano - b.ano || a.mes0 - b.mes0;
}

/** Lê "YYYY-MM"; inválido ou ainda não fechado → último mês fechado. */
export function lerMes(param: string | null | undefined, hoje: Date = new Date()): Mes {
  const limite = mesFechadoMaisRecente(hoje);
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  if (!m) return limite;
  const mes0 = Number(m[2]) - 1;
  if (mes0 < 0 || mes0 > 11) return limite;
  const alvo = { ano: Number(m[1]), mes0 };
  return compararMes(alvo, limite) > 0 ? limite : alvo;
}

export function podeAvancar(m: Mes, hoje: Date = new Date()): boolean {
  return compararMes(m, mesFechadoMaisRecente(hoje)) < 0;
}

// ---------------------------------------------------------------------------

export type CategoriaResumo = {
  categoria: string;
  valor: number;
  /** Fração do total de saídas (0–1). */
  pct: number;
  anterior: number;
  /** Variação vs mês anterior (0.12 = +12%); null se não havia gasto antes. */
  variacao: number | null;
};

export type OrcamentoResumo = {
  categoria: string;
  limite: number;
  gasto: number;
};

export type GastoResumo = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria: string;
};

export type SemanaResumo = { label: string; valor: number };

export type PatrimonioResumo = {
  inicio: number;
  fim: number;
  dataInicio: string;
  dataFim: string;
};

export type ResumoMes = {
  mes: Mes;
  entradas: number;
  saidas: number;
  resultado: number;
  entradasAnterior: number;
  saidasAnterior: number;
  /** Variações vs mês anterior; null quando o mês anterior foi zero. */
  variacaoEntradas: number | null;
  variacaoSaidas: number | null;
  categorias: CategoriaResumo[];
  orcamentos: { total: number; dentro: number; estourados: OrcamentoResumo[] } | null;
  maioresGastos: GastoResumo[];
  semanas: SemanaResumo[];
  patrimonio: PatrimonioResumo | null;
  quantidadeLancamentos: number;
};

type LinhaLancamento = {
  id: string;
  descricao: string | null;
  valor: number | string | null;
  tipo: string;
  data: string;
  tag: string | null;
};

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function iso(ano: number, mes0: number, dia: number) {
  const d = new Date(ano, mes0, dia, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return (atual - anterior) / anterior;
}

async function usuarioId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

const PAGINA = 1000;

/** Receitas e despesas entre duas datas (transferências ficam de fora). */
async function buscarLancamentos(userId: string, desde: string, ate: string): Promise<LinhaLancamento[]> {
  const linhas: LinhaLancamento[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select("id, descricao, valor, tipo, data, tag")
      .eq("user_id", userId)
      .in("tipo", ["receita", "despesa"])
      .gte("data", desde)
      .lte("data", ate)
      .order("data")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    linhas.push(...((data ?? []) as LinhaLancamento[]));
    if (!data || data.length < PAGINA) break;
  }
  return linhas;
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86_400_000);
}

/** Linha de `patrimonio_diario` mais próxima de `alvo`, até `tolerancia` dias de distância. */
function maisProxima<T extends { data: string }>(linhas: T[], alvo: string, tolerancia: number): T | null {
  let melhor: T | null = null;
  let dist = Infinity;
  for (const l of linhas) {
    const d = Math.abs(diasEntre(l.data, alvo));
    if (d <= tolerancia && d < dist) {
      melhor = l;
      dist = d;
    }
  }
  return melhor;
}

async function carregarPatrimonio(userId: string, m: Mes): Promise<PatrimonioResumo | null> {
  // Início = virada do mês (último dia do anterior ou primeiro dia); fim = último dia.
  const inicio = iso(m.ano, m.mes0, 0);
  const fim = iso(m.ano, m.mes0 + 1, 0);
  const { data, error } = await supabase
    .from("patrimonio_diario")
    .select("data, contas, investimentos, cartoes")
    .eq("user_id", userId)
    .gte("data", iso(m.ano, m.mes0, -3))
    .lte("data", iso(m.ano, m.mes0 + 1, 3))
    .order("data");
  if (error) {
    console.error("[resumo] patrimônio", error);
    return null;
  }
  const linhas = (data ?? []).map((r) => ({
    data: String(r.data).slice(0, 10),
    total: numero(r.contas) + numero(r.investimentos) - Math.abs(numero(r.cartoes)),
  }));
  const a = maisProxima(linhas, inicio, 4);
  const b = maisProxima(linhas, fim, 3);
  if (!a || !b || a.data >= b.data) return null;
  return { inicio: a.total, fim: b.total, dataInicio: a.data, dataFim: b.data };
}

const TOP_CATEGORIAS = 5;

/** Resumo completo de um mês fechado, comparado com o mês anterior. */
export async function carregarResumoMes(m: Mes): Promise<ResumoMes> {
  const userId = await usuarioId();
  const inicioMes = iso(m.ano, m.mes0, 1);
  const fimMes = iso(m.ano, m.mes0 + 1, 0);
  const inicioAnterior = iso(m.ano, m.mes0 - 1, 1);

  const [lancamentos, orc, patrimonio] = await Promise.all([
    buscarLancamentos(userId, inicioAnterior, fimMes),
    supabase.from("orcamentos").select("categoria, valor_mensal"),
    carregarPatrimonio(userId, m),
  ]);
  if (orc.error) throw orc.error;

  let entradas = 0;
  let saidas = 0;
  let entradasAnterior = 0;
  let saidasAnterior = 0;
  let quantidade = 0;
  // Agrupa categorias ignorando acentos e maiúsculas.
  const cats = new Map<string, { categoria: string; valor: number; anterior: number }>();
  const despesasMes: GastoResumo[] = [];
  const diasNoMes = new Date(m.ano, m.mes0 + 1, 0).getDate();
  const semanas: SemanaResumo[] = [];
  for (let d = 1; d <= diasNoMes; d += 7) {
    semanas.push({ label: `${d}–${Math.min(d + 6, diasNoMes)}`, valor: 0 });
  }

  for (const l of lancamentos) {
    const data = String(l.data).slice(0, 10);
    const valor = Math.abs(numero(l.valor));
    const doMes = data >= inicioMes;
    if (doMes) quantidade++;
    if (l.tipo === "receita") {
      if (doMes) entradas += valor;
      else entradasAnterior += valor;
      continue;
    }
    if (doMes) saidas += valor;
    else saidasAnterior += valor;

    const categoria = l.tag?.trim() || "Sem categoria";
    const k = normalizarTexto(categoria);
    let c = cats.get(k);
    if (!c) {
      c = { categoria, valor: 0, anterior: 0 };
      cats.set(k, c);
    }
    if (doMes) {
      c.valor += valor;
      despesasMes.push({
        id: String(l.id),
        descricao: l.descricao?.trim() || categoria,
        valor,
        data,
        categoria,
      });
      const dia = Number(data.slice(8, 10));
      const s = semanas[Math.min(semanas.length - 1, Math.floor((dia - 1) / 7))];
      if (s) s.valor += valor;
    } else {
      c.anterior += valor;
    }
  }

  // Top 5 + Outros
  const ordenadas = [...cats.values()].filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  const topo = ordenadas.slice(0, TOP_CATEGORIAS);
  const resto = ordenadas.slice(TOP_CATEGORIAS);
  const chavesTopo = new Set(topo.map((c) => normalizarTexto(c.categoria)));
  const categorias: CategoriaResumo[] = topo.map((c) => ({
    categoria: c.categoria,
    valor: c.valor,
    pct: saidas > 0 ? c.valor / saidas : 0,
    anterior: c.anterior,
    variacao: variacao(c.valor, c.anterior),
  }));
  if (resto.length > 0) {
    const valor = resto.reduce((a, c) => a + c.valor, 0);
    // "Outros" do mês anterior = tudo que não está no topo deste mês.
    const anterior = [...cats.entries()]
      .filter(([k]) => !chavesTopo.has(k))
      .reduce((a, [, c]) => a + c.anterior, 0);
    categorias.push({
      categoria: "Outros",
      valor,
      pct: saidas > 0 ? valor / saidas : 0,
      anterior,
      variacao: variacao(valor, anterior),
    });
  }

  // Orçamentos
  const linhasOrc = (orc.data ?? []).filter((o) => numero(o.valor_mensal) > 0);
  let orcamentos: ResumoMes["orcamentos"] = null;
  if (linhasOrc.length > 0) {
    const itens: OrcamentoResumo[] = linhasOrc.map((o) => ({
      categoria: String(o.categoria),
      limite: numero(o.valor_mensal),
      gasto: cats.get(normalizarTexto(String(o.categoria)))?.valor ?? 0,
    }));
    const estourados = itens
      .filter((i) => i.gasto > i.limite)
      .sort((a, b) => b.gasto - b.limite - (a.gasto - a.limite));
    orcamentos = { total: itens.length, dentro: itens.length - estourados.length, estourados };
  }

  const maioresGastos = despesasMes.sort((a, b) => b.valor - a.valor).slice(0, 3);

  return {
    mes: m,
    entradas,
    saidas,
    resultado: entradas - saidas,
    entradasAnterior,
    saidasAnterior,
    variacaoEntradas: variacao(entradas, entradasAnterior),
    variacaoSaidas: variacao(saidas, saidasAnterior),
    categorias,
    orcamentos,
    maioresGastos,
    semanas,
    patrimonio,
    quantidadeLancamentos: quantidade,
  };
}

/** Só entradas e saídas do mês (para o cartão da tela inicial). */
export async function carregarResultadoMes(
  m: Mes,
): Promise<{ entradas: number; saidas: number; resultado: number }> {
  const userId = await usuarioId();
  const linhas = await buscarLancamentos(userId, iso(m.ano, m.mes0, 1), iso(m.ano, m.mes0 + 1, 0));
  let entradas = 0;
  let saidas = 0;
  for (const l of linhas) {
    const v = Math.abs(numero(l.valor));
    if (l.tipo === "receita") entradas += v;
    else saidas += v;
  }
  return { entradas, saidas, resultado: entradas - saidas };
}
