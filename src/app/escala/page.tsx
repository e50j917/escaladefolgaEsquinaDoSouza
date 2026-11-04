"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

type CelulaAberta = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const dias = diasDaSemana(segunda);
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) {
        setErro("As variáveis do Supabase não foram configuradas. Veja a página Início.");
        setCarregando(false);
        return;
      }
      const db = supabase();
      const [t, f] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db
          .from("funcionarios")
          .select("id, nome, funcao, telefone, cpf, ativo")
          .order("nome"),
      ]);
      if (t.error || f.error) {
        setErro("Não foi possível carregar os dados: " + (t.error ?? f.error)?.message);
        return;
      }
      setTurnos((t.data ?? []) as Turno[]);
      setFuncionarios((f.data ?? []) as Funcionario[]);
    }
    carregarBase();
  }, []);

  // Escala da semana: recarregada ao trocar de semana.
  const carregarEscalas = useCallback(async () => {
    if (!variaveisConfiguradas()) return;
    setCarregando(true);
    const { data, error } = await supabase()
      .from("escalas")
      .select("id, data, turno_id, funcionario_id")
      .gte("data", segunda)
      .lte("data", somarDias(segunda, 6));
    if (error) setErro("Não foi possível carregar a escala: " + error.message);
    else setEscalas((data ?? []) as Escala[]);
    setCarregando(false);
  }, [segunda]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEscalas();
  }, [carregarEscalas]);

  const nomePorId = new Map(funcionarios.map((f) => [f.id, f]));

  function escaladosNa(data: string, turnoId: string): Escala[] {
    return escalas.filter((e) => e.data === data && e.turno_id === turnoId);
  }

  async function alternar(funcionario: Funcionario) {
    if (!aberta) return;
    const { data, turno } = aberta;
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id,
    );
    setSalvandoId(funcionario.id);
    setErro(null);
    const db = supabase().from("escalas");
    if (existente) {
      const { error } = await db.delete().eq("id", existente.id);
      if (error) setErro("Não foi possível tirar da escala: " + error.message);
      else setEscalas((atual) => atual.filter((e) => e.id !== existente.id));
    } else {
      const { data: nova, error } = await db
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro("Não foi possível colocar na escala: " + error.message);
      else setEscalas((atual) => [...atual, nova as Escala]);
    }
    setSalvandoId(null);
  }

  // No modal: ativos + quem já está escalado mesmo que desativado depois.
  const listaModal = aberta
    ? funcionarios.filter(
        (f) =>
          f.ativo ||
          escaladosNa(aberta.data, aberta.turno.id).some((e) => e.funcionario_id === f.id),
      )
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {diaMes(dias[0])} a {diaMes(dias[6])}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button className="botao-secundario" onClick={() => setSegunda(somarDias(segunda, -7))}>
            ◀ Anterior
          </button>
          <button className="botao-secundario" onClick={() => setSegunda(somarDias(segunda, 7))}>
            Próxima ▶
          </button>
        </div>
        {segunda !== inicioDaSemana(hoje) && (
          <button className="botao w-full" onClick={() => setSegunda(inicioDaSemana(hoje))}>
            Voltar para esta semana
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      <p className="text-sm text-neutral-600">
        Toque em um quadro para escolher quem trabalha. Arraste para o lado para ver todos os dias.
      </p>

      <div className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm ${carregando ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[84px] border-b border-r border-neutral-200 bg-white p-2 text-left">
                Turno
              </th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-[110px] border-b border-neutral-200 p-2 text-center ${
                    d === hoje ? "bg-amber-50" : ""
                  }`}
                >
                  {rotuloDia(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <th className="sticky left-0 z-[1] border-r border-b border-neutral-200 bg-white p-2 text-left align-top">
                  <span className="block font-semibold">{t.nome}</span>
                  <span className="block text-xs font-normal text-neutral-600">
                    {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const lista = escaladosNa(d, t.id);
                  return (
                    <td key={d} className="border-b border-neutral-200 p-1 align-top">
                      <button
                        className={`flex min-h-[88px] w-full flex-col items-start gap-1 rounded-lg p-2 text-left active:bg-neutral-100 ${
                          d === hoje ? "bg-amber-50" : "bg-neutral-50"
                        }`}
                        onClick={() => setAberta({ data: d, turno: t })}
                      >
                        {lista.length === 0 ? (
                          <span className="text-neutral-400">+ Escalar</span>
                        ) : (
                          lista
                            .map((e) => nomePorId.get(e.funcionario_id))
                            .sort((a, b) => (a?.nome ?? "").localeCompare(b?.nome ?? "", "pt-BR"))
                            .map((f, i) => (
                              <span key={f?.id ?? i} className="leading-tight">
                                {f?.nome.split(" ")[0] ?? "?"}
                              </span>
                            ))
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberta && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setAberta(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              {aberta.turno.nome} · {DIAS_SEMANA[paraData(aberta.data).getDay()]}{" "}
              {diaMes(aberta.data)}
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Marque quem trabalha. Salva na hora.
            </p>
            <ul className="space-y-2">
              {listaModal.map((f) => {
                const marcado = escaladosNa(aberta.data, aberta.turno.id).some(
                  (e) => e.funcionario_id === f.id,
                );
                return (
                  <li key={f.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                        marcado ? "border-green-500 bg-green-50" : "border-neutral-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-6 w-6 shrink-0"
                        checked={marcado}
                        disabled={salvandoId !== null}
                        onChange={() => alternar(f)}
                      />
                      <span className="flex-1">
                        <span className="block font-semibold">{f.nome}</span>
                        <span className="block text-sm text-neutral-600">
                          {f.funcao}
                          {!f.ativo && " · desativado"}
                        </span>
                      </span>
                      {salvandoId === f.id && (
                        <span className="text-sm text-neutral-500">Salvando...</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            {erro && <p className="mt-3 text-red-700">{erro}</p>}
            <button className="botao mt-4 w-full" onClick={() => setAberta(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
