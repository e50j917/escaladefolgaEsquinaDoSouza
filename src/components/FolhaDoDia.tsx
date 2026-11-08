// Uma folha de calendário: dia da semana, número gigante e quem folga.

import { DIAS_SEMANA, DIAS_SEMANA_CURTO, MESES_CURTO, paraData } from "@/lib/datas";
import type { FolgasDoDia } from "@/lib/folgas";

const MAXIMO_NOMES = 3;

export function FolhaDoDia({ dia, ehHoje }: { dia: FolgasDoDia; ehHoje: boolean }) {
  const data = paraData(dia.data);
  const semana = data.getDay();
  const nomesDiaSemana = semana === 0 || semana === 6 ? DIAS_SEMANA[semana] : `${DIAS_SEMANA[semana]}-feira`;
  const visiveis = dia.folgas.slice(0, MAXIMO_NOMES);
  const restantes = dia.folgas.length - visiveis.length;

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] select-none ${
        ehHoje ? "outline outline-[3px] -outline-offset-1 outline-[var(--cor-principal)]" : ""
      }`}
    >
      <div
        className="py-1.5 text-center text-xs font-bold tracking-[0.08em] text-white lg:py-2 lg:text-sm"
        style={{ background: "var(--cor-principal)" }}
      >
        {DIAS_SEMANA_CURTO[semana].toUpperCase()} · {MESES_CURTO[data.getMonth()]}
        {ehHoje && (
          <span className="ml-1.5 rounded-md bg-white px-1.5 text-[var(--cor-principal)]">HOJE</span>
        )}
      </div>

      <div className="mt-1.5 text-center text-[3.8rem] leading-none font-extrabold text-[var(--cor-principal)] sm:text-[4.6rem] md:text-[5.4rem] lg:text-[6.5rem]">
        {String(data.getDate()).padStart(2, "0")}
      </div>
      <div className="mt-0.5 text-center text-[0.8rem] font-semibold text-neutral-700 lg:text-base">
        {nomesDiaSemana}
      </div>

      <div className="mx-2.5 mt-2 flex-1 border-t border-dashed border-neutral-300 pt-1.5 text-[0.72rem] sm:text-xs lg:text-sm">
        <p className="mb-0.5 text-[0.62rem] font-bold tracking-[0.06em] text-neutral-500 uppercase lg:text-xs">
          {dia.folgas.length === 1 ? "Folga" : "Folgas"}
        </p>
        {!dia.escalaFeita ? (
          <p className="text-neutral-400 italic">Escala ainda não feita</p>
        ) : visiveis.length === 0 ? (
          <p className="text-neutral-400 italic">Ninguém de folga</p>
        ) : (
          <ul>
            {visiveis.map((f) => (
              <li key={f.id} className="truncate leading-snug">
                <b>{f.nome.split(" ")[0]}</b> <span className="text-neutral-500">{f.funcao}</span>
              </li>
            ))}
            {restantes > 0 && (
              <li className="font-semibold text-[var(--cor-principal)]">+{restantes} de folga</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
