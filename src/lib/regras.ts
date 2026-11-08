// Regras da casa: confere a escala de uma semana e devolve a lista de alertas.
// Só lógica, sem tela e sem banco: recebe os dados prontos.
// As regras em si ficam no Supabase (tabelas `regras` e `configuracoes`) e
// são editadas na tela /regras.

import type { Configuracao, Escala, Funcionario, Horario, Regra, Turno } from "./tipos";
import { MESES_CURTO, paraData, paraISO, rotuloDia, somarDias } from "./datas";
import { restaurante } from "@/config/restaurante";

export type ConfigRegras = {
  folgasMinimas: number; // folgas por semana (0 = regra desligada)
  bloquearFecharEAbrir: boolean; // proíbe fechar um dia e abrir o seguinte
};

export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_ABRIR = "bloquear_fechar_e_abrir";

/** Lê as configurações do banco, com valores padrão se faltar alguma. */
export function lerConfigRegras(configs: Configuracao[]): ConfigRegras {
  const valor = (chave: string) => configs.find((c) => c.chave === chave)?.valor;
  const folgas = Number(valor(CHAVE_FOLGAS) ?? "1");
  return {
    folgasMinimas: Number.isFinite(folgas) && folgas >= 0 ? folgas : 1,
    bloquearFecharEAbrir: (valor(CHAVE_FECHAR_ABRIR) ?? "true") === "true",
  };
}

export type Alerta = {
  tipo: "minimo" | "folga" | "fechar-abrir" | "domingo" | "dobradinha" | "folga-segunda";
  texto: string; // frase completa, para a lista do resumo
  textoCurto: string; // aviso curto, dentro da célula
  celulas: { data: string; turnoId: string }[]; // células que ficam vermelhas
  funcionarioId?: string; // nome que fica em vermelho na grade
};

/**
 * Mínimos que valem para um turno num dia, por função.
 * A regra do dia da semana (ex.: sexta) vale mais que a regra geral (todos os dias).
 */
export function minimosDoTurno(
  regras: Regra[],
  turnoId: string,
  diaSemana: number,
): Map<string, number> {
  const minimos = new Map<string, number>();
  const doTurno = regras.filter((r) => r.turno_id === turnoId);
  for (const r of doTurno) if (r.dia_semana === null) minimos.set(r.funcao, r.minimo);
  for (const r of doTurno) if (r.dia_semana === diaSemana) minimos.set(r.funcao, r.minimo);
  return minimos;
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0];
}

export function conferirSemana(dados: {
  dias: string[]; // os 7 dias da semana (segunda a domingo)
  turnos: Turno[];
  funcionarios: Funcionario[];
  // Escalas da semana; para as regras de domingo, de preferência o mês inteiro
  // (do 1º dia do mês da segunda até o último dia do mês do domingo).
  escalas: Escala[];
  regras: Regra[];
  config: ConfigRegras;
  horarios?: Horario[]; // horário de cada funcionário por dia da semana
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas, regras, config } = dados;
  const horarios = dados.horarios ?? [];
  const alertas: Alerta[] = [];
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const naSemana = new Set(dias);
  const ativos = funcionarios.filter((f) => f.ativo);

  const escalados = (data: string, turnoId: string) =>
    escalas.filter((e) => e.data === data && e.turno_id === turnoId);
  const trabalha = (funcionarioId: string, data: string) =>
    escalas.some((e) => e.funcionario_id === funcionarioId && e.data === data);
  // Dia com a escala já montada (alguém escalado). Dia vazio não gera alerta de folga.
  const escalaFeita = (data: string) => escalas.some((e) => e.data === data);
  const horarioDe = (funcionarioId: string, diaSemana: number) =>
    horarios.find((h) => h.funcionario_id === funcionarioId && h.dia_semana === diaSemana);
  // Sem horários cadastrados, todo mundo é considerado.
  const trabalhaNormalmenteNo = (funcionarioId: string, diaSemana: number) =>
    horarios.length === 0 || Boolean(horarioDe(funcionarioId, diaSemana));
  const celulasDe = (funcionarioId: string, data: string) =>
    escalas
      .filter((e) => e.funcionario_id === funcionarioId && e.data === data)
      .map((e) => ({ data, turnoId: e.turno_id }));
  const turnoPorNome = (nome: string) => turnos.find((t) => t.nome === nome);

  // 1. Mínimo de pessoas por turno e função
  for (const data of dias) {
    for (const turno of turnos) {
      const minimos = minimosDoTurno(regras, turno.id, paraData(data).getDay());
      const lista = escalados(data, turno.id);
      for (const [funcao, minimo] of minimos) {
        const tem = lista.filter((e) => porId.get(e.funcionario_id)?.funcao === funcao).length;
        if (tem < minimo) {
          const falta = minimo - tem;
          alertas.push({
            tipo: "minimo",
            texto: `${rotuloDia(data)} · ${turno.nome} · ${funcao}: tem ${tem}, mínimo ${minimo} (falta ${falta})`,
            textoCurto: `Falta ${falta} ${funcao}`,
            celulas: [{ data, turnoId: turno.id }],
          });
        }
      }
    }
  }

  // 2. Folga semanal: dias sem nenhum turno
  if (config.folgasMinimas > 0) {
    for (const f of funcionarios) {
      if (!f.ativo) continue;
      const diasTrabalhados = new Set(
        escalas
          .filter((e) => e.funcionario_id === f.id && naSemana.has(e.data))
          .map((e) => e.data),
      ).size;
      const folgas = dias.length - diasTrabalhados;
      if (folgas < config.folgasMinimas) {
        alertas.push({
          tipo: "folga",
          texto: `${f.nome}: ${folgas === 0 ? "nenhuma folga" : `só ${folgas} folga`} na semana (mínimo ${config.folgasMinimas})`,
          textoCurto:
            folgas === 0
              ? `${primeiroNome(f.nome)} sem folga`
              : `${primeiroNome(f.nome)} só ${folgas} folga`,
          celulas: [],
          funcionarioId: f.id,
        });
      }
    }
  }

  // 3. Fechar um dia (último turno) e abrir o seguinte (primeiro turno)
  const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
  if (config.bloquearFecharEAbrir && ordenados.length >= 2) {
    const fecha = ordenados[ordenados.length - 1];
    const abre = ordenados[0];
    // Inclui a virada de domingo anterior -> segunda e domingo -> segunda seguinte.
    for (const dia of [somarDias(dias[0], -1), ...dias]) {
      const seguinte = somarDias(dia, 1);
      const quemAbre = new Set(escalados(seguinte, abre.id).map((e) => e.funcionario_id));
      for (const e of escalados(dia, fecha.id)) {
        if (!quemAbre.has(e.funcionario_id)) continue;
        // Só "fecha" quem termina tarde nesse dia (ex.: 23h ou meia-noite).
        const h = horarioDe(e.funcionario_id, paraData(dia).getDay());
        const fim = h?.hora_fim.slice(0, 5);
        if (fim && fim < restaurante.horaQueContaComoFechamento && fim >= "06:00") continue;
        const nome = porId.get(e.funcionario_id)?.nome ?? "?";
        alertas.push({
          tipo: "fechar-abrir",
          texto: `${nome} fecha ${rotuloDia(dia)} (${fecha.nome}) e abre ${rotuloDia(seguinte)} (${abre.nome})`,
          textoCurto: `${primeiroNome(nome)} fecha e abre`,
          celulas: [
            { data: dia, turnoId: fecha.id },
            { data: seguinte, turnoId: abre.id },
          ].filter((c) => naSemana.has(c.data)),
          funcionarioId: e.funcionario_id,
        });
      }
    }
  }

  // 4. Domingo do mês: quem trabalha aos domingos precisa folgar pelo menos um por mês.
  //    Só avisa quando todos os domingos do mês já têm escala.
  const domingo = dias[6];
  const domingosDoMes = domingosDoMesDe(domingo);
  if (domingosDoMes.every(escalaFeita)) {
    for (const f of ativos) {
      if (!trabalhaNormalmenteNo(f.id, 0)) continue; // ex.: estoque, que folga todo domingo
      if (!domingosDoMes.every((d) => trabalha(f.id, d))) continue;
      const mes = MESES_CURTO[paraData(domingo).getMonth()].toLowerCase();
      alertas.push({
        tipo: "domingo",
        texto: `${f.nome}: trabalha todos os ${domingosDoMes.length} domingos de ${mes} (precisa folgar 1)`,
        textoCurto: `${primeiroNome(f.nome)} sem domingo no mês`,
        celulas: celulasDe(f.id, domingo),
        funcionarioId: f.id,
      });
    }
  }

  // 5. Dobradinha: quem folga no domingo também folga na segunda seguinte.
  const domingoAnterior = somarDias(dias[0], -1);
  if (escalaFeita(domingoAnterior)) {
    for (const f of ativos) {
      if (!trabalhaNormalmenteNo(f.id, 0)) continue;
      if (trabalha(f.id, domingoAnterior) || !trabalha(f.id, dias[0])) continue;
      alertas.push({
        tipo: "dobradinha",
        texto: `${f.nome} folgou no domingo ${rotuloDia(domingoAnterior)} e está escalado na segunda ${rotuloDia(dias[0])} (dobradinha)`,
        textoCurto: `${primeiroNome(f.nome)} deveria folgar (dobradinha)`,
        celulas: celulasDe(f.id, dias[0]),
        funcionarioId: f.id,
      });
    }
  }

  // 6. Quem faz o almoço extra de segunda folga em algum dia de terça a quinta.
  const almoco = turnoPorNome(restaurante.turnoAlmocoExtra);
  const diasFolga = restaurante.diasFolgaAposAlmocoSegunda
    .map((ds) => dias.find((d) => paraData(d).getDay() === ds))
    .filter((d): d is string => Boolean(d));
  if (almoco && diasFolga.length > 0 && diasFolga.every(escalaFeita)) {
    for (const e of escalados(dias[0], almoco.id)) {
      if (!diasFolga.every((d) => trabalha(e.funcionario_id, d))) continue;
      const nome = porId.get(e.funcionario_id)?.nome ?? "?";
      alertas.push({
        tipo: "folga-segunda",
        texto: `${nome} fez o almoço de segunda ${rotuloDia(dias[0])} e não tem folga de terça a quinta`,
        textoCurto: `${primeiroNome(nome)} sem folga ter–qui`,
        celulas: [{ data: dias[0], turnoId: almoco.id }],
        funcionarioId: e.funcionario_id,
      });
    }
  }

  return alertas;
}

/** Todos os domingos do mês da data ("2026-11-08" -> 01, 08, 15, 22, 29/11). */
export function domingosDoMesDe(iso: string): string[] {
  const d = paraData(iso);
  const resultado: string[] = [];
  const dia = new Date(d.getFullYear(), d.getMonth(), 1);
  while (dia.getMonth() === d.getMonth()) {
    if (dia.getDay() === 0) resultado.push(paraISO(dia));
    dia.setDate(dia.getDate() + 1);
  }
  return resultado;
}

/** Período de escalas que a conferência da semana precisa (mês inteiro + vizinhos). */
export function periodoParaConferir(segundaISO: string): { inicio: string; fim: string } {
  const seg = paraData(segundaISO);
  const dom = paraData(somarDias(segundaISO, 6));
  const inicioMes = paraISO(new Date(seg.getFullYear(), seg.getMonth(), 1));
  const fimMes = paraISO(new Date(dom.getFullYear(), dom.getMonth() + 1, 0));
  const anterior = somarDias(segundaISO, -1);
  const seguinte = somarDias(segundaISO, 7);
  return {
    inicio: anterior < inicioMes ? anterior : inicioMes,
    fim: seguinte > fimMes ? seguinte : fimMes,
  };
}
