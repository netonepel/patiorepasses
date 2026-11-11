// Roda sozinho todo dia (função agendada do Netlify) e guarda uma cópia do banco. Mantém as últimas 14.
import { guardarCopia } from "../lib/backup.mjs";
import { registrar } from "../lib/core.mjs";

export default async () => {
  const r = await guardarCopia("dia");
  await registrar("Sistema", "Cópia de segurança automática", `${r.contagem.repasses} carros, ${r.contagem.lojistas} lojistas, ${r.contagem.reservas} reservas`);
};

export const config = { schedule: "0 6 * * *" }; // todo dia às 6h UTC (3h da manhã em Brasília)
