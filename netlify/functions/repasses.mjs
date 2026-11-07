// Anúncios de repasse. Cada anúncio pertence a um lojista; nome e cidade vêm do cadastro da loja.
//   GET    /api/repasses           vitrine pública (só lojas ativas, sem vendidos, sem placa completa e sem contato da loja)
//   GET    /api/repasses?meus=1    lojista: os dele | admin: todos            (exige login)
//   POST   /api/repasses           cria   (lojista: na própria loja | admin: informa lojistaId)
//   PUT    /api/repasses/:id       edita  (dono ou admin)
//   DELETE /api/repasses/:id       apaga  (dono ou admin)
import { store, todos, json, corpo, sessao, pode } from "../lib/core.mjs";
import { apagarFotos, fotosPermitidas } from "./fotos.mjs";

const CAMPOS = ["placa","marca","modelo","versao","ano","km","cambio","combustivel","cor","preco","fipe","obs","status","chaveCopia","manual","cautelar"];
const STATUS = ["disponivel","reservado","vendido"];
const SIM_NAO = ["sim","nao",""];
const CAUTELAR = ["aprovada","apontamento","reprovada","nao",""];

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
  if (s.role === "admin" && !pode(s, "repasses")) return json({ erro: "Você não tem permissão para gerenciar repasses." }, 403);
  const dono = r => s.role === "admin" || r.lojistaId === s.lojista.id;

  if (req.method === "GET") {
    const [rs, lojas] = await Promise.all([todos(st), mapaLojas()]);
    return json(rs.filter(dono).sort(porData).map(r => juntar(r, lojas)));
  }

  if (req.method === "POST") {
    const b = await corpo(req); if (!b) return json({ erro: "Dados inválidos." }, 400);
    const r = limpar(b);
    const lojistaId = s.role === "lojista" ? s.lojista.id : String(b.lojistaId || "");
    if (s.role === "admin") {
      const l = await store("lojistas").get(lojistaId, { type: "json" });
      if (!l) return json({ erro: "Escolha a loja dona do carro." }, 400);
    }
    const erro = validar(r); if (erro) return json({ erro }, 400);
    r.fotos = await fotosPermitidas(r.fotos || [], s);
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
    if ("fotos" in b) novo.fotos = await fotosPermitidas(novo.fotos, s, atual.fotos || []);
    const erro = validar(novo); if (erro) return json({ erro }, 400);
    await st.setJSON(id, novo);
    if ("fotos" in b) await apagarFotos((atual.fotos || []).filter(f => !novo.fotos.includes(f)));
    return json(novo);
  }
  if (req.method === "DELETE") { await st.delete(id); await apagarFotos(atual.fotos); return json({ ok: true }); }
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
  if ("fotos" in b) o.fotos = (Array.isArray(b.fotos) ? b.fotos : []).map(String).filter(x => /^[a-z0-9-]{8,64}$/i.test(x)).slice(0, 10);
  else if (!parcial) o.fotos = [];
  for (const c of ["chaveCopia", "manual"]) if (c in o && !SIM_NAO.includes(o[c] ?? "")) o[c] = "";
  if ("cautelar" in o && !CAUTELAR.includes(o.cautelar ?? "")) o.cautelar = "";
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
// Vitrine: sem placa completa e sem contato da loja (a negociação passa pelo Pátio)
function publico(r) {
  const { placa, lojistaId, whatsapp, reservaId, ...resto } = r;
  return { ...resto, placaFinal: placa ? placa.slice(-1) : "" };
}
