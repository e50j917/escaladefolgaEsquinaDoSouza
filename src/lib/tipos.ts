// Tipos que espelham as tabelas do Supabase (veja supabase/schema.sql).

export type Funcionario = {
  id: string;
  nome: string;
  funcao: string;
  telefone: string | null;
  cpf: string | null;
  ativo: boolean;
  papel?: string | null; // ex.: Abertura, Fechamento, Passador de chope
  exemplo?: boolean; // true = funcionário fictício de exemplo
};

/** Horário de um funcionário num dia da semana (sem linha = não trabalha). */
export type Horario = {
  id?: string;
  funcionario_id: string;
  dia_semana: number; // 0 = domingo ... 6 = sábado
  hora_inicio: string; // "15:00:00"
  hora_fim: string; // "00:00:00" = meia-noite (termina no dia seguinte)
};

export type Turno = {
  id: string;
  nome: string;
  hora_inicio: string; // "11:00:00"
  hora_fim: string; // "15:30:00"
  ordem: number;
};

export type Escala = {
  id: string;
  data: string; // "2026-11-20"
  turno_id: string;
  funcionario_id: string;
};

export type Regra = {
  id: string;
  dia_semana: number | null; // 0 = domingo ... 6 = sábado; null = todos os dias
  turno_id: string;
  funcao: string;
  minimo: number;
};

export type Configuracao = {
  chave: string;
  valor: string;
};

export const FUNCOES_PADRAO = [
  "Salão",
  "Cozinha",
  "Bar",
  "Caixa",
  "Estoque",
  "Limpeza",
  "Entregador",
  "Gerência",
];

export const PAPEIS_PADRAO = [
  "Abertura",
  "Fechamento",
  "Passador de chope",
  "Gerente",
  "Subgerente",
];
