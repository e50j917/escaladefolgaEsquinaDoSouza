"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Configuracao, type Escala, type Funcionario, type Horario, type Regra, type Turno } from "@/lib/tipos";
import { conferirSemana, lerConfigRegras, periodoParaConferir } from "@/lib/regras";
import { faixa } from "@/lib/horarios";
import { restaurante } from "@/config/restaurante";
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

// A data de hoje é lida só no celular/navegador, depois de abrir a página.
// Se fosse lida no servidor, valeria a data da publicação no site.
export default function EscalaDaSemana() {
  const [hoje, setHoje] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHoje(hojeISO());
  }, []);
  if (!hoje) return <p className="text-neutral-600">Carregando...</p>;
  return <GradeDaSemana hoje={hoje} />;
}

function GradeDaSemana({ hoje }: { hoje: string }) {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hoje));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [configs, setConfigs] = useState<Configuracao[]>([]);
  const [verAlertas, setVerAlertas] = useState(false);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const dias = diasDaSemana(segunda);

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) {
        setErro("As variáveis do Supabase não foram configuradas. Veja a página Início.");
        setCarregando(false);
        return;
      }
      const db = supabase();
      const [t, f, r, c, h] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db
          .from("funcionarios")
          .select("id, nome, funcao, telefone, cpf, ativo, papel")
          .order("nome"),
        db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
        db.from("configuracoes").select("chave, valor"),
        db.from("horarios").select("funcionario_id, dia_semana, hora_inicio, hora_fim"),
      ]);
      const falha = t.error ?? f.error ?? r.error ?? c.error ?? h.error;
      if (falha) {
        setErro("Não foi possível carregar os dados: " + falha.message);
        return;
      }
      setRegras((r.data ?? []) as Regra[]);
      setConfigs((c.data ?? []) as Configuracao[]);
      setHorarios((h.data ?? []) as Horario[]);
      setTurnos((t.data ?? []) as Turno[]);
      setFuncionarios((f.data ?? []) as Funcionario[]);
    }
    carregarBase();
  }, []);

  // Escala recarregada ao trocar de semana. Carrega o mês inteiro (e os dias
  // vizinhos da semana) para as regras de domingo, dobradinha e fechar e abrir.
  const carregarEscalas = useCallback(async () => {
    if (!variaveisConfiguradas()) return;
    setCarregando(true);
    const periodo = periodoParaConferir(segunda);
    const { data, error } = await supabase()
      .from("escalas")
      .select("id, data, turno_id, funcionario_id")
      .gte("data", periodo.inicio)
      .lte("data", periodo.fim);
    if (error) setErro("Não foi possível carregar a escala: " + error.message);
    else setEscalas((data ?? []) as Escala[]);
    setCarregando(false);
  }, [segunda]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEscalas();
  }, [carregarEscalas]);

  const nomePorId = new Map(funcionarios.map((f) => [f.id, f]));

  // Regras da casa: recalculadas a cada mudança na escala.
  const alertas = useMemo(
    () =>
      turnos.length === 0
        ? []
        : conferirSemana({
            dias: diasDaSemana(segunda),
            turnos,
            funcionarios,
            escalas,
            regras,
            config: lerConfigRegras(configs),
            horarios,
          }),
    [segunda, turnos, funcionarios, escalas, regras, configs, horarios],
  );
  const semFolga = new Set(
    alertas.filter((a) => a.tipo === "folga").map((a) => a.funcionarioId),
  );

  function alertasDaCelula(data: string, turnoId: string) {
    return alertas.filter((a) => a.celulas.some((c) => c.data === data && c.turnoId === turnoId));
  }

  /** Nome em vermelho: sem folga na semana ou fecha e abre nesta célula. */
  function nomeComAlerta(funcionarioId: string, data: string, turnoId: string): boolean {
    return (
      semFolga.has(funcionarioId) ||
      alertasDaCelula(data, turnoId).some((a) => a.funcionarioId === funcionarioId)
    );
  }

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

  const horarioNoDia = (funcionarioId: string, data: string) =>
    horarios.find(
      (h) => h.funcionario_id === funcionarioId && h.dia_semana === paraData(data).getDay(),
    );
  const ordemSetor = (funcao: string) => {
    const i = FUNCOES_PADRAO.indexOf(funcao);
    return i === -1 ? FUNCOES_PADRAO.length : i;
  };
  const ehExpediente = aberta?.turno.nome === restaurante.turnoExpediente;

  // No modal: ativos + quem já está escalado mesmo que desativado depois, por setor.
  // No Expediente, primeiro só quem tem horário nesse dia da semana.
  const candidatos = aberta
    ? funcionarios
        .filter(
          (f) =>
            f.ativo ||
            escaladosNa(aberta.data, aberta.turno.id).some((e) => e.funcionario_id === f.id),
        )
        .sort(
          (a, b) =>
            ordemSetor(a.funcao) - ordemSetor(b.funcao) || a.nome.localeCompare(b.nome, "pt-BR"),
        )
    : [];
  const listaModal =
    aberta && ehExpediente && !mostrarTodos && horarios.length > 0
      ? candidatos.filter(
          (f) =>
            horarioNoDia(f.id, aberta.data) ||
            escaladosNa(aberta.data, aberta.turno.id).some((e) => e.funcionario_id === f.id),
        )
      : candidatos;
  const escondidos = candidatos.length - listaModal.length;

  /** Texto do horário do turno na grade. */
  function horarioDoTurno(t: Turno): string {
    if (t.nome === restaurante.turnoAlmocoExtra) return restaurante.horarioAlmocoExtra;
    if (t.nome === restaurante.turnoExpediente) return "horário de cada um";
    return `${horaCurta(t.hora_inicio)}–${horaCurta(t.hora_fim)}`;
  }

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

      {turnos.length > 0 && !carregando && (
        <div
          className={`cartao ${alertas.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}
        >
          {alertas.length === 0 ? (
            <p className="font-semibold text-green-800">✅ Nenhum alerta nesta semana</p>
          ) : (
            <>
              <button
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setVerAlertas(!verAlertas)}
              >
                <span className="text-lg font-semibold text-red-800">
                  ⚠️ {alertas.length} {alertas.length === 1 ? "alerta" : "alertas"} nesta semana
                </span>
                <span className="shrink-0 font-semibold text-red-800 underline">
                  {verAlertas ? "Esconder" : "Ver"}
                </span>
              </button>
              {verAlertas && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-red-900">
                  {alertas.map((a, i) => (
                    <li key={i}>{a.texto}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

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
                    d === hoje ? "destaque-hoje" : ""
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
                    {horarioDoTurno(t)}
                  </span>
                </th>
                {dias.map((d) => {
                  const lista = escaladosNa(d, t.id);
                  const avisos = alertasDaCelula(d, t.id);
                  const corFundo =
                    avisos.length > 0
                      ? "bg-red-100 ring-2 ring-red-400"
                      : d === hoje
                        ? "destaque-hoje"
                        : "bg-neutral-50";
                  return (
                    <td key={d} className="border-b border-neutral-200 p-1 align-top">
                      <button
                        className={`flex min-h-[88px] w-full flex-col items-start gap-1 rounded-lg p-2 text-left active:opacity-80 ${corFundo}`}
                        onClick={() => {
                          setMostrarTodos(false);
                          setAberta({ data: d, turno: t });
                        }}
                      >
                        {lista.length === 0 ? (
                          <span className="text-neutral-400">+ Escalar</span>
                        ) : (
                          lista
                            .map((e) => nomePorId.get(e.funcionario_id))
                            .sort((a, b) => (a?.nome ?? "").localeCompare(b?.nome ?? "", "pt-BR"))
                            .map((f, i) => (
                              <span
                                key={f?.id ?? i}
                                className={`leading-tight ${
                                  f && nomeComAlerta(f.id, d, t.id) ? "font-semibold text-red-700" : ""
                                }`}
                              >
                                {f?.nome.split(" ")[0] ?? "?"}
                              </span>
                            ))
                        )}
                        {avisos.map((a, i) => (
                          <span key={i} className="mt-1 text-xs font-semibold leading-tight text-red-800">
                            ⚠️ {a.textoCurto}
                          </span>
                        ))}
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
            {alertasDaCelula(aberta.data, aberta.turno.id).length > 0 && (
              <ul className="mb-3 space-y-1 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
                {alertasDaCelula(aberta.data, aberta.turno.id).map((a, i) => (
                  <li key={i}>⚠️ {a.textoCurto}</li>
                ))}
              </ul>
            )}
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
                          {f.papel && ` · ${f.papel}`}
                          {ehExpediente && horarioNoDia(f.id, aberta.data) &&
                            ` · ${faixa(horarioNoDia(f.id, aberta.data)!)}`}
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
            {ehExpediente && (escondidos > 0 || mostrarTodos) && (
              <button
                className="botao-secundario mt-3 w-full"
                onClick={() => setMostrarTodos(!mostrarTodos)}
              >
                {mostrarTodos
                  ? "Mostrar só quem trabalha neste dia"
                  : `Mostrar todos (+${escondidos} sem horário neste dia)`}
              </button>
            )}
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
