// Reservas com sinal. O cliente comprador paga o sinal, que é a comissão do Pátio Repasses.
//   POST /api/reservas        público: { repasseId, nome, whatsapp, documento?, obs?, aceite:true } -> reserva + dados do Pix
//   GET  /api/reservas        admin: todas | lojista: as pagas dos carros dele (com contato do comprador)
//   PUT  /api/reservas/:id    admin: { status: "pago" | "aguardando" | "cancelado", obs? }
//        pago      -> carro vira "reservado"
//        cancelado -> se o carro estava reservado por essa reserva, volta a "disponível"
import { store, todos, json, corpo, sessao, taxaAgora } from "../lib/core.mjs";

export default async (req, context) => {
  const st = store("reservas");
  const id = context.params?.id;

  if (req.method === "POST" && !id) {
    const b = await corpo(req) || {};
    const nome = String(b.nome || "").trim().slice(0, 120);
    const whatsapp = String(b.whatsapp || "").trim().slice(0, 40);
    const documento = String(b.documento || "").trim().slice(0, 30);
    if (!nome || whatsapp.replace(/\D/g, "").length < 10) return json({ erro: "Preencha seu nome e um WhatsApp com DDD." }, 400);
    if (b.aceite !== true) return json({ erro: "Para reservar, confirme que leu as condições do sinal." }, 400);
    const carro = await store("repasses").get(String(b.repasseId || ""), { type: "json" });
    if (!carro) return json({ erro: "Esse carro não está mais no portal." }, 404);
    const loja = await store("lojistas").get(carro.lojistaId, { type: "json" });
    if (!loja?.ativo || carro.status !== "disponivel") return json({ erro: "Esse carro já foi reservado ou vendido." }, 409);
    // evita pedidos repetidos do mesmo cliente para o mesmo carro
    const abertas = (await todos(st)).filter(r => r.repasseId === carro.id && r.status === "aguardando");
    const repetida = abertas.find(r => r.whatsapp.replace(/\D/g, "") === whatsapp.replace(/\D/g, ""));
    const t = taxaAgora();
    const reserva = repetida || {
      id: crypto.randomUUID(), codigo: codigo(), repasseId: carro.id, lojistaId: carro.lojistaId,
      carro: `${carro.marca} ${carro.modelo} ${carro.ano}`, placa: carro.placa, preco: carro.preco,
      nome, whatsapp, documento, obs: String(b.obs || "").trim().slice(0, 500),
      valor: t.valor, promo: t.promo, status: "aguardando", criadoEm: new Date().toISOString(),
    };
    if (!repetida) await st.setJSON(reserva.id, reserva);
    return json({ reserva: { id: reserva.id, codigo: reserva.codigo, carro: reserva.carro, valor: reserva.valor, promo: reserva.promo },
      pix: { chave: process.env.PIX_CHAVE || "", nome: process.env.PIX_NOME || "" },
      contatoWhatsapp: process.env.CONTATO_WHATSAPP || "" }, repetida ? 200 : 201);
  }

  const s = await sessao(req);
  if (!s) return json({ erro: "Sessão expirada. Entre de novo." }, 401);

  if (req.method === "GET" && !id) {
    const [rs, ls] = await Promise.all([todos(st), todos(store("lojistas"))]);
    const nome = Object.fromEntries(ls.map(l => [l.id, l.nome]));
    let lista = rs.map(r => ({ ...r, loja: nome[r.lojistaId] || "Loja removida" }));
    if (s.role === "lojista") // a loja só vê reservas já pagas dos carros dela, sem o valor da comissão
      lista = lista.filter(r => r.lojistaId === s.lojista.id && r.status === "pago").map(({ valor, promo, documento, ...r }) => r);
    return json(lista.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))));
  }

  if (req.method === "PUT" && id) {
    if (s.role !== "admin") return json({ erro: "Só o administrador altera reservas." }, 403);
    const r = await st.get(id, { type: "json" });
    if (!r) return json({ erro: "Reserva não encontrada." }, 404);
    const b = await corpo(req) || {};
    if (!["pago", "aguardando", "cancelado"].includes(b.status)) return json({ erro: "Situação inválida." }, 400);
    const rep = store("repasses");
    const carro = await rep.get(r.repasseId, { type: "json" });
    if (b.status === "pago" && r.status !== "pago") {
      if (carro && carro.status === "reservado" && carro.reservaId && carro.reservaId !== r.id)
        return json({ erro: "Esse carro já está reservado por outro cliente. Cancele a outra reserva antes." }, 409);
      if (carro && carro.status !== "vendido") await rep.setJSON(carro.id, { ...carro, status: "reservado", reservaId: r.id, atualizadoEm: new Date().toISOString() });
    }
    if (b.status !== "pago" && r.status === "pago" && carro && carro.reservaId === r.id && carro.status === "reservado") {
      const { reservaId, ...semReserva } = carro;
      await rep.setJSON(carro.id, { ...semReserva, status: "disponivel", atualizadoEm: new Date().toISOString() });
    }
    const novo = { ...r, status: b.status, atualizadoEm: new Date().toISOString() };
    if (b.status === "pago") novo.pagoEm = new Date().toISOString();
    if (b.obs != null) novo.obsAdmin = String(b.obs).slice(0, 300);
    await st.setJSON(id, novo);
    return json(novo);
  }
  return json({ erro: "Método não suportado." }, 405);
};

export const config = { path: ["/api/reservas", "/api/reservas/:id"] };

function codigo() { // código curto para o cliente citar no comprovante
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "PR-" + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => abc[b % abc.length]).join("");
}
