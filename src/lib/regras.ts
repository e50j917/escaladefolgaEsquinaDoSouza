// Regras da casa: confere a escala de uma semana e devolve a lista de alertas.
// Só lógica, sem tela e sem banco: recebe os dados prontos.
// As regras em si ficam no Supabase (tabelas `regras` e `configuracoes`) e
// são editadas na tela /regras.

import type { Configuracao, Escala, Funcionario, Regra, Turno } from "./tipos";
import { paraData, rotuloDia, somarDias } from "./datas";

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
  tipo: "minimo" | "folga" | "fechar-abrir";
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
  escalas: Escala[]; // pode incluir o dia anterior e o seguinte à semana
  regras: Regra[];
  config: ConfigRegras;
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas, regras, config } = dados;
  const alertas: Alerta[] = [];
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const naSemana = new Set(dias);

  const escalados = (data: string, turnoId: string) =>
    escalas.filter((e) => e.data === data && e.turno_id === turnoId);

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
          texto: `${f.nome}: ${folgas === 0 ? "nenhuma folga" : `só ${folgas} folga(s)`} na semana (mínimo ${config.folgasMinimas})`,
          textoCurto: `${primeiroNome(f.nome)} sem folga`,
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

  return alertas;
}
