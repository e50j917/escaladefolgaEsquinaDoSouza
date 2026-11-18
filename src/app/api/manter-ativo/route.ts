// Mantém o banco do Supabase acordado.
// No plano gratuito, o Supabase pausa o projeto depois de 7 dias sem uso.
// A Vercel chama este endereço uma vez por dia (veja vercel.json), e ele faz
// uma leitura mínima no banco, que conta como uso. Só lê, nunca grava.
//
// Proteção: se a variável de ambiente CRON_SECRET estiver cadastrada na Vercel,
// só responde a quem enviar "Authorization: Bearer <CRON_SECRET>" — e a própria
// Vercel envia isso sozinha nas chamadas agendadas.

import { supabase, variaveisConfiguradas } from "@/lib/supabase";

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return Response.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }

  if (!variaveisConfiguradas()) {
    return Response.json(
      { ok: false, erro: "variáveis do Supabase não configuradas" },
      { status: 500 },
    );
  }

  const { data, error } = await supabase().from("turnos").select("nome").limit(1);
  if (error) {
    // Aparece nos registros da Vercel (Logs) para facilitar o diagnóstico.
    console.error("manter-ativo: o banco não respondeu:", error.message);
    return Response.json({ ok: false, erro: error.message }, { status: 502 });
  }

  return Response.json({
    ok: true,
    banco: "respondeu",
    leu: data?.length ?? 0,
    em: new Date().toISOString(),
  });
}
