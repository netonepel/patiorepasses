// Anúncios de repasse. Cada anúncio pertence a um lojista; nome, WhatsApp e cidade vêm do cadastro da loja.
//   GET    /api/repasses           vitrine pública (só lojas ativas, sem vendidos, sem a placa completa)
//   GET    /api/repasses?meus=1    lojista: os dele | admin: todos            (exige login)
//   POST   /api/repasses           cria   (lojista: na própria loja | admin: informa lojistaId)
//   PUT    /api/repasses/:id       edita  (dono ou admin)
//   DELETE /api/repasses/:id       apaga  (dono ou admin)
import { store, todos, json, corpo, sessao } from "../lib/core.mjs";

const CAMPOS = ["placa","marca","modelo","versao","ano","km","cambio","combustivel","cor","preco","fipe","obs","status"];
const STATUS = ["disponivel","reservado","vendido"];

export default async (req, context) => {
  const st = store("repasses");
  const id = context.params?.id;
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("meus") !== "1") {
    const [rs, lojas] = await Promise.all([todos(st), mapaLojas()]);
    return json(rs.filter(r => r.status !== "vendido" && lojas[r.lojistaId]?.ativo)
      .sort(porData).map(r => publico(juntar(r, lojas))));
  }

  const s = await sessao(req);
  if (!s) return json({ erro: "Sessão expirada. Entre de novo." }, 401);
  const dono = r => s.role === "admin" || r.lojistaId === s.lojista.id;

  if (req.method === "GET") {
    const [rs, lojas] = await Promise.all([todos(st), mapaLojas()]);
    return json(rs.filter(dono).sort(porData).map(r => juntar(r, lojas)));
  }

  if (req.method === "POST") {
    const b = await corpo(req); if (!b) return json({ erro: "Dados inválidos." }, 400);
    const r = limpar(b);
    let lojistaId = s.role === "lojista" ? s.lojista.id : String(b.lojistaId || "");
    if (s.role === "admin") {
      const l = await store("lojistas").get(lojistaId, { type: "json" });
      if (!l) return json({ erro: "Escolha a loja dona do carro." }, 400);
    }
    const erro = validar(r); if (erro) return json({ erro }, 400);
    if ((await todos(st)).some(o => o.placa === r.placa && o.status !== "vendido"))
      return json({ erro: "Essa placa já está anunciada no portal." }, 409);
    const novo = { ...r, id: crypto.randomUUID(), lojistaId, status: "disponivel", criadoEm: new Date().toISOString() };
    await st.setJSON(novo.id, novo);
    return json(novo, 201);
  }

  if (!id) return json({ erro: "Anúncio não informado." }, 400);
  const atual = await st.get(id, { type: "json" });
  if (!atual || !dono(atual)) return json({ erro: "Anúncio não encontrado." }, 404);

  if (req.method === "PUT") {
    const b = await corpo(req); if (!b) return json({ erro: "Dados inválidos." }, 400);
    const novo = { ...atual, ...limpar(b, true), id, atualizadoEm: new Date().toISOString() };
    if (s.role === "admin" && b.lojistaId) novo.lojistaId = String(b.lojistaId);
    const erro = validar(novo); if (erro) return json({ erro }, 400);
    await st.setJSON(id, novo);
    return json(novo);
  }
  if (req.method === "DELETE") { await st.delete(id); return json({ ok: true }); }
  return json({ erro: "Método não suportado." }, 405);
};

export const config = { path: ["/api/repasses", "/api/repasses/:id"] };

async function mapaLojas() {
  const m = {}; for (const l of await todos(store("lojistas"))) m[l.id] = l; return m;
}
function juntar(r, lojas) {
  const l = lojas[r.lojistaId];
  return { ...r, loja: l?.nome || "Loja removida", whatsapp: l?.whatsapp || "", cidade: l?.cidade || "" };
}
const porData = (a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm));
function limpar(b, parcial = false) {
  const o = {};
  for (const c of CAMPOS) {
    if (!(c in b)) { if (!parcial) o[c] = null; continue; }
    let v = b[c];
    if (c === "km" || c === "preco" || c === "fipe") v = v == null || v === "" ? null : Math.max(0, Math.round(Number(v))) || null;
    else v = v == null ? "" : String(v).trim().slice(0, c === "obs" ? 1000 : 120);
    o[c] = v;
  }
  if (o.placa) o.placa = o.placa.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (!parcial || "status" in b) o.status = STATUS.includes(o.status) ? o.status : "disponivel";
  return o;
}
function validar(r) {
  const falta = [];
  if (!r.placa) falta.push("placa"); if (!r.marca) falta.push("marca"); if (!r.modelo) falta.push("modelo");
  if (!r.ano) falta.push("ano"); if (!r.preco) falta.push("preço");
  if (falta.length) return "Preencha: " + falta.join(", ") + ".";
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(r.placa)) return "Placa inválida. Use ABC1D23 ou ABC1234.";
}
function publico(r) {
  const { placa, lojistaId, ...resto } = r;
  return { ...resto, placaFinal: placa ? placa.slice(-1) : "" };
}
