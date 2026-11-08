"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, PAPEIS_PADRAO, type Funcionario, type Horario } from "@/lib/tipos";
import { DIAS_SEMANA } from "@/lib/datas";
import { ORDEM_DIAS, resumoHorarios } from "@/lib/horarios";

type DiaFormulario = { trabalha: boolean; inicio: string; fim: string };

type Formulario = {
  id: string | null; // null = novo funcionário
  nome: string;
  funcao: string;
  papel: string;
  telefone: string;
  dias: Record<number, DiaFormulario>; // 0 = domingo ... 6 = sábado
};

function diasVazios(): Record<number, DiaFormulario> {
  return Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { trabalha: false, inicio: "", fim: "" }]),
  );
}

const FORMULARIO_VAZIO: Formulario = {
  id: null,
  nome: "",
  funcao: "",
  papel: "",
  telefone: "",
  dias: diasVazios(),
};

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setErro("As variáveis do Supabase não foram configuradas. Veja a página Início.");
      setCarregando(false);
      return;
    }
    const db = supabase();
    const [f, h] = await Promise.all([
      db
        .from("funcionarios")
        .select("id, nome, funcao, telefone, cpf, ativo, papel, exemplo")
        .order("nome"),
      db.from("horarios").select("id, funcionario_id, dia_semana, hora_inicio, hora_fim"),
    ]);
    const falha = f.error ?? h.error;
    if (falha) setErro("Não foi possível carregar a equipe: " + falha.message);
    else {
      setErro(null);
      setFuncionarios((f.data ?? []) as Funcionario[]);
      setHorarios((h.data ?? []) as Horario[]);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const ativos = funcionarios.filter((f) => f.ativo);
  const desativados = funcionarios.filter((f) => !f.ativo);

  // Funções que já existem no banco + as funções padrão, sem repetir.
  const funcoes = useMemo(() => {
    const todas = new Set([...FUNCOES_PADRAO, ...funcionarios.map((f) => f.funcao)]);
    return Array.from(todas).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcionarios]);

  const papeis = useMemo(() => {
    const todos = new Set([
      ...PAPEIS_PADRAO,
      ...funcionarios.map((f) => f.papel).filter((p): p is string => Boolean(p)),
    ]);
    return Array.from(todos);
  }, [funcionarios]);

  // Ativos agrupados por setor (função), na ordem das funções padrão.
  const setores = useMemo(() => {
    const ordem = (funcao: string) => {
      const i = FUNCOES_PADRAO.indexOf(funcao);
      return i === -1 ? FUNCOES_PADRAO.length : i;
    };
    const grupos = new Map<string, Funcionario[]>();
    for (const f of ativos) grupos.set(f.funcao, [...(grupos.get(f.funcao) ?? []), f]);
    return Array.from(grupos.entries()).sort(
      ([a], [b]) => ordem(a) - ordem(b) || a.localeCompare(b, "pt-BR"),
    );
  }, [ativos]);

  const horariosDe = (id: string) => horarios.filter((h) => h.funcionario_id === id);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao = formulario.funcao.trim();
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    const diasMarcados = ORDEM_DIAS.filter((d) => formulario.dias[d].trabalha);
    const incompleto = diasMarcados.find((d) => !formulario.dias[d].inicio || !formulario.dias[d].fim);
    if (incompleto !== undefined) {
      setErro(`Preencha o horário de entrada e saída de ${DIAS_SEMANA[incompleto]}.`);
      return;
    }
    setSalvando(true);
    setErro(null);
    const db = supabase();
    const dados = {
      nome,
      funcao,
      papel: formulario.papel || null,
      telefone: formulario.telefone.trim() || null,
    };

    // 1. Funcionário
    let id = formulario.id;
    if (id) {
      const { error } = await db.from("funcionarios").update(dados).eq("id", id);
      if (error) return falhou("Não foi possível salvar: " + error.message);
    } else {
      const { data, error } = await db.from("funcionarios").insert(dados).select("id").single();
      if (error || !data) return falhou("Não foi possível salvar: " + (error?.message ?? ""));
      id = data.id as string;
    }

    // 2. Horários: grava os dias marcados e apaga os desmarcados
    const naoTrabalha = [0, 1, 2, 3, 4, 5, 6].filter((d) => !formulario.dias[d].trabalha);
    if (naoTrabalha.length > 0) {
      const { error } = await db
        .from("horarios")
        .delete()
        .eq("funcionario_id", id)
        .in("dia_semana", naoTrabalha);
      if (error) return falhou("Funcionário salvo, mas os horários não: " + error.message);
    }
    if (diasMarcados.length > 0) {
      const linhas = diasMarcados.map((d) => ({
        funcionario_id: id,
        dia_semana: d,
        hora_inicio: formulario.dias[d].inicio,
        hora_fim: formulario.dias[d].fim,
      }));
      const { error } = await db
        .from("horarios")
        .upsert(linhas, { onConflict: "funcionario_id,dia_semana" });
      if (error) return falhou("Funcionário salvo, mas os horários não: " + error.message);
    }

    setSalvando(false);
    setFormulario(null);
    await carregar();
  }

  async function falhou(mensagem: string) {
    setErro(mensagem);
    setSalvando(false);
    await carregar();
  }

  async function mudarAtivo(funcionario: Funcionario, ativo: boolean) {
    if (!ativo && !confirm(`Desativar ${funcionario.nome}? Ele(a) sai da lista da escala.`)) {
      return;
    }
    const { error } = await supabase()
      .from("funcionarios")
      .update({ ativo })
      .eq("id", funcionario.id);
    if (error) {
      setErro("Não foi possível atualizar: " + error.message);
      return;
    }
    await carregar();
  }

  function editar(f: Funcionario) {
    setErro(null);
    const dias = diasVazios();
    for (const h of horariosDe(f.id)) {
      dias[h.dia_semana] = {
        trabalha: true,
        inicio: h.hora_inicio.slice(0, 5),
        fim: h.hora_fim.slice(0, 5),
      };
    }
    setFormulario({
      id: f.id,
      nome: f.nome,
      funcao: f.funcao,
      papel: f.papel ?? "",
      telefone: f.telefone ?? "",
      dias,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function mudarDia(dia: number, mudanca: Partial<DiaFormulario>) {
    if (!formulario) return;
    setFormulario({
      ...formulario,
      dias: { ...formulario.dias, [dia]: { ...formulario.dias[dia], ...mudanca } },
    });
  }

  /** Copia o horário do primeiro dia marcado para todos os outros dias marcados. */
  function repetirHorario() {
    if (!formulario) return;
    const base = ORDEM_DIAS.map((d) => formulario.dias[d]).find(
      (d) => d.trabalha && d.inicio && d.fim,
    );
    if (!base) return;
    const dias = { ...formulario.dias };
    for (const d of ORDEM_DIAS) {
      if (dias[d].trabalha) dias[d] = { ...dias[d], inicio: base.inicio, fim: base.fim };
    }
    setFormulario({ ...formulario, dias });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && (
          <button
            className="botao"
            onClick={() => {
              setErro(null);
              setFormulario({ ...FORMULARIO_VAZIO, dias: diasVazios() });
            }}
          >
            + Adicionar
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função (setor)</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
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
            <span className="mb-1 block font-medium">Papel</span>
            <select
              className="campo"
              value={formulario.papel}
              onChange={(e) => setFormulario({ ...formulario, papel: e.target.value })}
            >
              <option value="">Sem papel fixo</option>
              {papeis.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">Horário de trabalho</legend>
            {ORDEM_DIAS.map((d) => {
              const dia = formulario.dias[d];
              return (
                <div
                  key={d}
                  className={`rounded-xl border p-2 ${dia.trabalha ? "border-neutral-300 bg-white" : "border-neutral-200"}`}
                >
                  <label className="flex cursor-pointer items-center gap-3 py-1">
                    <input
                      type="checkbox"
                      className="h-6 w-6 shrink-0"
                      checked={dia.trabalha}
                      onChange={(e) => mudarDia(d, { trabalha: e.target.checked })}
                    />
                    <span className="font-semibold">{DIAS_SEMANA[d]}</span>
                    {!dia.trabalha && <span className="text-sm text-neutral-500">não trabalha</span>}
                  </label>
                  {dia.trabalha && (
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-sm text-neutral-600">Entrada</span>
                        <input
                          type="time"
                          className="campo"
                          value={dia.inicio}
                          onChange={(e) => mudarDia(d, { inicio: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm text-neutral-600">Saída</span>
                        <input
                          type="time"
                          className="campo"
                          value={dia.fim}
                          onChange={(e) => mudarDia(d, { fim: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" className="botao-secundario w-full" onClick={repetirHorario}>
              Repetir o 1º horário nos dias marcados
            </button>
            <p className="text-sm text-neutral-600">
              Saída 00:00 = meia-noite (termina no dia seguinte).
            </p>
          </fieldset>

          <div className="flex gap-3 pt-1">
            <button type="submit" className="botao flex-1" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              className="botao-secundario flex-1"
              onClick={() => setFormulario(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="text-neutral-600">Carregando...</p>
      ) : ativos.length === 0 ? (
        <p className="cartao text-neutral-600">Nenhum funcionário ativo.</p>
      ) : (
        setores.map(([setor, lista]) => (
          <section key={setor} className="space-y-3">
            <h2 className="pt-2 text-xl font-bold">
              {setor} <span className="text-base font-normal text-neutral-500">({lista.length})</span>
            </h2>
            <ul className="space-y-3">
              {lista.map((f) => {
                const resumo = resumoHorarios(horariosDe(f.id));
                return (
                  <li key={f.id} className="cartao">
                    <p className="text-lg font-semibold">
                      {f.nome}
                      {f.papel && (
                        <span className="ml-2 rounded-md bg-[color-mix(in_srgb,var(--cor-destaque)_30%,white)] px-2 py-0.5 align-middle text-sm font-semibold text-neutral-800">
                          {f.papel}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-neutral-700">
                      🕒 {resumo || <span className="text-neutral-500 italic">sem horário cadastrado</span>}
                    </p>
                    {f.telefone && (
                      <a href={`tel:${f.telefone.replace(/\D/g, "")}`} className="text-neutral-700 underline">
                        {f.telefone}
                      </a>
                    )}
                    <div className="mt-3 flex gap-3">
                      <button className="botao-secundario flex-1" onClick={() => editar(f)}>
                        Editar
                      </button>
                      <button
                        className="botao-secundario flex-1 !border-red-400 !text-red-700"
                        onClick={() => mudarAtivo(f, false)}
                      >
                        Desativar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {desativados.length > 0 && (
        <section className="space-y-3 pt-2">
          <button
            className="botao-secundario w-full"
            onClick={() => setMostrarDesativados(!mostrarDesativados)}
          >
            {mostrarDesativados ? "Esconder" : "Ver"} desativados ({desativados.length})
          </button>
          {mostrarDesativados &&
            desativados.map((f) => (
              <div key={f.id} className="cartao flex items-center justify-between gap-3 opacity-80">
                <div>
                  <p className="font-semibold">
                    {f.nome}
                    {f.exemplo && (
                      <span className="ml-2 text-sm font-normal text-neutral-500">(exemplo)</span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-600">{f.funcao}</p>
                </div>
                <button className="botao" onClick={() => mudarAtivo(f, true)}>
                  Reativar
                </button>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
