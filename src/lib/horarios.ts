// Horários de trabalho por dia da semana: textos curtos para a tela.

import { DIAS_SEMANA_CURTO } from "./datas";
import type { Horario } from "./tipos";

// Ordem de exibição: segunda a domingo.
export const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

/** "15:00:00" -> "15h"; "17:30:00" -> "17h30"; "00:00:00" -> "0h" */
export function horaH(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** "15h–23h" */
export function faixa(h: Pick<Horario, "hora_inicio" | "hora_fim">): string {
  return `${horaH(h.hora_inicio)}–${horaH(h.hora_fim)}`;
}

/**
 * Resumo agrupando dias seguidos com o mesmo horário:
 * "Seg–Sex 15h–23h · Sáb 10h–23h · Dom 10h–19h". Sem horários: "".
 */
export function resumoHorarios(horarios: Horario[]): string {
  const porDia = new Map(horarios.map((h) => [h.dia_semana, faixa(h)]));
  const grupos: { dias: number[]; faixa: string }[] = [];
  for (const dia of ORDEM_DIAS) {
    const f = porDia.get(dia);
    const ultimo = grupos[grupos.length - 1];
    const anteriorNaOrdem = ORDEM_DIAS[ORDEM_DIAS.indexOf(dia) - 1];
    if (f && ultimo && ultimo.faixa === f && ultimo.dias[ultimo.dias.length - 1] === anteriorNaOrdem) {
      ultimo.dias.push(dia);
    } else if (f) {
      grupos.push({ dias: [dia], faixa: f });
    }
  }
  return grupos
    .map((g) => {
      const primeiro = DIAS_SEMANA_CURTO[g.dias[0]];
      const ultimo = DIAS_SEMANA_CURTO[g.dias[g.dias.length - 1]];
      const dias = g.dias.length === 1 ? primeiro : `${primeiro}${g.dias.length === 2 ? "/" : "–"}${ultimo}`;
      return `${dias} ${g.faixa}`;
    })
    .join(" · ");
}
