// Quem está de folga em cada dia, a partir da escala.
// Folga = funcionário ativo que não está em nenhum turno do dia.

import type { Escala, Funcionario } from "./tipos";

export type FolgasDoDia = {
  data: string; // "2026-11-08"
  escalaFeita: boolean; // false = ninguém escalado no dia ainda
  folgas: Funcionario[];
};

export function folgasDosDias(
  dias: string[],
  funcionarios: Funcionario[],
  escalas: Escala[],
): FolgasDoDia[] {
  const ativos = funcionarios
    .filter((f) => f.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return dias.map((data) => {
    const trabalham = new Set(
      escalas.filter((e) => e.data === data).map((e) => e.funcionario_id),
    );
    return {
      data,
      escalaFeita: trabalham.size > 0,
      folgas: ativos.filter((f) => !trabalham.has(f.id)),
    };
  });
}
