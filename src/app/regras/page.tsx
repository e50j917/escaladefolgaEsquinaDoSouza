"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Configuracao, type Regra, type Turno } from "@/lib/tipos";
import { DIAS_SEMANA } from "@/lib/datas";
import { CHAVE_FECHAR_ABRIR, CHAVE_FOLGAS, lerConfigRegras } from "@/lib/regras";

// Ordem de exibição dos dias: segunda a domingo.
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

type NovaRegra = { turnoId: string; dia: string; funcao: string; minimo: number };

export default function Regras() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [configs, setConfigs] = useState<Configuracao[]>([]);
  const [funcoesEquipe, setFuncoesEquipe] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nova, setNova] = useState<NovaRegra | null>(null);

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setErro("As variáveis do Supabase não foram configuradas. Veja a página Início.");
      setCarregando(false);
      return;
    }
    const db = supabase();
    const [t, r, c, f] = await Promise.all([
      db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
      db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
      db.from("configuracoes").select("chave, valor"),
      db.from("funcionarios").select("funcao"),
    ]);
    const falha = t.error ?? r.error ?? c.error ?? f.error;
    if (falha) setErro("Não foi possível carregar as regras: " + falha.message);
    else {
      setErro(null);
      setTurnos((t.data ?? []) as Turno[]);
      setRegras((r.data ?? []) as Regra[]);
      setConfigs((c.data ?? []) as Configuracao[]);
      setFuncoesEquipe(((f.data ?? []) as { funcao: string }[]).map((x) => x.funcao));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const config = lerConfigRegras(configs);

  const funcoes = useMemo(
    () =>
      Array.from(new Set([...FUNCOES_PADRAO, ...funcoesEquipe])).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [funcoesEquipe],
  );

  // Regras ordenadas: turno, depois "todos os dias" antes dos dias específicos, depois função.
  const ordemTurno = new Map(turnos.map((t) => [t.id, t.ordem]));
  const regrasOrdenadas = [...regras].sort(
    (a, b) =>
      (ordemTurno.get(a.turno_id) ?? 0) - (ordemTurno.get(b.turno_id) ?? 0) ||
      (a.dia_semana === null ? -1 : ORDEM_DIAS.indexOf(a.dia_semana)) -
        (b.dia_semana === null ? -1 : ORDEM_DIAS.indexOf(b.dia_semana)) ||
      a.funcao.localeCompare(b.funcao, "pt-BR"),
  );

  async function executar(acao: () => PromiseLike<{ error: { message: string } | null }>) {
    setOcupado(true);
    setErro(null);
    const { error } = await acao();
    if (error) setErro("Não foi possível salvar: " + error.message);
    await carregar();
    setOcupado(false);
  }

  function salvarConfig(chave: string, valor: string) {
    return executar(() => supabase().from("configuracoes").upsert({ chave, valor }));
  }

  function mudarMinimo(regra: Regra, minimo: number) {
    if (minimo < 0) return;
    return executar(() => supabase().from("regras").update({ minimo }).eq("id", regra.id));
  }

  function remover(regra: Regra) {
    if (!confirm("Remover esta regra?")) return;
    return executar(() => supabase().from("regras").delete().eq("id", regra.id));
  }

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nova) return;
    if (!nova.turnoId || !nova.funcao) {
      setErro("Escolha o turno e a função.");
      return;
    }
    const dia = nova.dia === "" ? null : Number(nova.dia);
    const repetida = regras.some(
      (r) => r.turno_id === nova.turnoId && r.funcao === nova.funcao && r.dia_semana === dia,
    );
    if (repetida) {
      setErro("Já existe uma regra para esse turno, dia e função. Mude o número dela na lista.");
      return;
    }
    await executar(() =>
      supabase()
        .from("regras")
        .insert({ turno_id: nova.turnoId, dia_semana: dia, funcao: nova.funcao, minimo: nova.minimo }),
    );
    setNova(null);
  }

  const nomeTurno = (id: string) => turnos.find((t) => t.id === id)?.nome ?? "?";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Regras da casa</h1>
      <p className="text-neutral-700">
        A Escala da semana mostra um alerta vermelho quando alguma regra não é cumprida. As
        regras só avisam: não impedem de salvar.
      </p>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {carregando ? (
        <p className="text-neutral-600">Carregando...</p>
      ) : (
        <>
          <section className="cartao space-y-4">
            <h2 className="text-lg font-semibold">Folgas e descanso</h2>

            <div>
              <p className="font-medium">Folgas mínimas por semana</p>
              <p className="text-sm text-neutral-600">0 desliga esta regra.</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  className="botao-secundario h-12 w-14 text-2xl"
                  disabled={ocupado || config.folgasMinimas <= 0}
                  onClick={() => salvarConfig(CHAVE_FOLGAS, String(config.folgasMinimas - 1))}
                  aria-label="Diminuir folgas"
                >
                  −
                </button>
                <span className="w-10 text-center text-2xl font-bold">{config.folgasMinimas}</span>
                <button
                  className="botao-secundario h-12 w-14 text-2xl"
                  disabled={ocupado || config.folgasMinimas >= 7}
                  onClick={() => salvarConfig(CHAVE_FOLGAS, String(config.folgasMinimas + 1))}
                  aria-label="Aumentar folgas"
                >
                  +
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 p-3">
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0"
                checked={config.bloquearFecharEAbrir}
                disabled={ocupado}
                onChange={(e) => salvarConfig(CHAVE_FECHAR_ABRIR, String(e.target.checked))}
              />
              <span>
                <span className="block font-medium">Não fechar e abrir no dia seguinte</span>
                <span className="block text-sm text-neutral-600">
                  Avisa quando alguém trabalha no último turno de um dia e no primeiro do dia
                  seguinte.
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Mínimo de pessoas por turno</h2>
              {!nova && (
                <button
                  className="botao"
                  onClick={() =>
                    setNova({ turnoId: turnos[0]?.id ?? "", dia: "", funcao: "", minimo: 1 })
                  }
                >
                  + Adicionar
                </button>
              )}
            </div>
            <p className="text-sm text-neutral-600">
              A regra de um dia específico (ex.: sexta) vale mais que a de &quot;Todos os
              dias&quot;.
            </p>

            {nova && (
              <form onSubmit={adicionar} className="cartao space-y-3">
                <h3 className="font-semibold">Nova regra</h3>
                <label className="block">
                  <span className="mb-1 block font-medium">Turno</span>
                  <select
                    className="campo"
                    value={nova.turnoId}
                    onChange={(e) => setNova({ ...nova, turnoId: e.target.value })}
                  >
                    {turnos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Dia</span>
                  <select
                    className="campo"
                    value={nova.dia}
                    onChange={(e) => setNova({ ...nova, dia: e.target.value })}
                  >
                    <option value="">Todos os dias</option>
                    {ORDEM_DIAS.map((d) => (
                      <option key={d} value={d}>
                        {DIAS_SEMANA[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Função</span>
                  <select
                    className="campo"
                    value={nova.funcao}
                    onChange={(e) => setNova({ ...nova, funcao: e.target.value })}
                  >
                    <option value="">Escolha a função</option>
                    {funcoes.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Mínimo de pessoas</span>
                  <input
                    className="campo"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={nova.minimo}
                    onChange={(e) => setNova({ ...nova, minimo: Math.max(0, Number(e.target.value)) })}
                  />
                </label>
                <div className="flex gap-3 pt-1">
                  <button type="submit" className="botao flex-1" disabled={ocupado}>
                    Salvar
                  </button>
                  <button
                    type="button"
                    className="botao-secundario flex-1"
                    onClick={() => setNova(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {regrasOrdenadas.length === 0 && (
              <p className="cartao text-neutral-600">Nenhuma regra de mínimo cadastrada.</p>
            )}
            {regrasOrdenadas.map((r) => (
              <div key={r.id} className="cartao flex flex-wrap items-center gap-3">
                <div className="min-w-[150px] flex-1">
                  <p className="font-semibold">
                    {nomeTurno(r.turno_id)} ·{" "}
                    {r.dia_semana === null ? "Todos os dias" : DIAS_SEMANA[r.dia_semana]}
                  </p>
                  <p className="text-neutral-700">{r.funcao}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="botao-secundario h-12 w-12 text-2xl"
                    disabled={ocupado || r.minimo <= 0}
                    onClick={() => mudarMinimo(r, r.minimo - 1)}
                    aria-label="Diminuir mínimo"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-xl font-bold">{r.minimo}</span>
                  <button
                    className="botao-secundario h-12 w-12 text-2xl"
                    disabled={ocupado}
                    onClick={() => mudarMinimo(r, r.minimo + 1)}
                    aria-label="Aumentar mínimo"
                  >
                    +
                  </button>
                  <button
                    className="botao-secundario h-12 !border-red-400 px-3 !text-red-700"
                    disabled={ocupado}
                    onClick={() => remover(r)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
