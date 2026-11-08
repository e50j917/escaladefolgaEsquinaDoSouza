"use client";

// Calendário de folgas em leque: 15 dias (7 antes, hoje, 7 depois), hoje no centro.

import { useEffect, useMemo, useState } from "react";
import SocialCards from "@/components/ui/card-fan-carousel";
import { FolhaDoDia } from "@/components/FolhaDoDia";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { folgasDosDias } from "@/lib/folgas";
import { DIAS_SEMANA, diaMes, hojeISO, paraData, somarDias } from "@/lib/datas";
import type { Escala, Funcionario } from "@/lib/tipos";

const DIAS_ANTES = 7;
const DIAS_DEPOIS = 7;

type Dados = { hoje: string; funcionarios: Funcionario[]; escalas: Escala[] };

export function FolgasEmLeque() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      if (!variaveisConfiguradas()) return;
      // A data de hoje vem do celular, não do servidor.
      const hoje = hojeISO();
      const db = supabase();
      const [f, e] = await Promise.all([
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo"),
        db
          .from("escalas")
          .select("id, data, turno_id, funcionario_id")
          .gte("data", somarDias(hoje, -DIAS_ANTES))
          .lte("data", somarDias(hoje, DIAS_DEPOIS)),
      ]);
      const falha = f.error ?? e.error;
      if (falha) {
        setErro("Não foi possível carregar as folgas: " + falha.message);
        return;
      }
      setDados({
        hoje,
        funcionarios: (f.data ?? []) as Funcionario[],
        escalas: (e.data ?? []) as Escala[],
      });
    }
    carregar();
  }, []);

  // Memorizado para o carrossel não refazer as animações a cada renderização.
  const cartas = useMemo(() => {
    if (!dados) return [];
    const dias = Array.from({ length: DIAS_ANTES + 1 + DIAS_DEPOIS }, (_, i) =>
      somarDias(dados.hoje, i - DIAS_ANTES),
    );
    return folgasDosDias(dias, dados.funcionarios, dados.escalas).map((dia) => ({
      alt: `${DIAS_SEMANA[paraData(dia.data).getDay()]} ${diaMes(dia.data)}`,
      content: <FolhaDoDia dia={dia} ehHoje={dia.data === dados.hoje} />,
    }));
  }, [dados]);

  if (!variaveisConfiguradas()) return null;

  return (
    <section>
      <h1 className="text-2xl font-bold">Folgas</h1>
      <p className="text-neutral-600">Hoje no centro. Use as setas para ver outros dias.</p>
      {erro && <p className="cartao mt-3 border-red-300 text-red-700">{erro}</p>}
      {!dados && !erro && (
        <div className="fan-layout flex items-center justify-center text-neutral-500">
          Carregando folgas...
        </div>
      )}
      {/* Só monta o carrossel com os dados prontos: ele escolhe a carta do centro ao montar. */}
      {dados && (
        <div className="relative left-1/2 w-screen -translate-x-1/2 overflow-x-clip">
          <SocialCards
            cards={cartas}
            initialIndex={DIAS_ANTES}
            prevLabel="Dia anterior"
            nextLabel="Próximo dia"
          />
        </div>
      )}
    </section>
  );
}
