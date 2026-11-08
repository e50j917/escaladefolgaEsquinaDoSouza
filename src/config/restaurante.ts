// Regras e nomes próprios da Esquina do Souza.
// Os mínimos por turno e função ficam no banco (tela Regras);
// aqui ficam os nomes que o sistema usa para reconhecer cada turno.

export const restaurante = {
  // Nomes dos turnos, iguais aos da tabela `turnos` no Supabase.
  turnoAlmocoExtra: "Almoço extra",
  turnoExpediente: "Expediente",

  // Texto do horário do almoço extra mostrado na grade (não tem no sábado e domingo).
  horarioAlmocoExtra: "Seg 10h–15h · Ter–Sex 10h–17h",

  // Valor pago por almoço extra (usado no relatório, próxima etapa).
  valorAlmocoExtra: 150,

  // Quem faz o almoço de segunda precisa folgar em um destes dias (2 = terça ... 4 = quinta).
  diasFolgaAposAlmocoSegunda: [2, 3, 4],

  // Quem termina o expediente a partir deste horário (ou depois da meia-noite) "fecha" o dia.
  horaQueContaComoFechamento: "22:00",
};
