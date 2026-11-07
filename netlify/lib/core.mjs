// Funções compartilhadas: banco (Netlify Blobs), sessões e senhas.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

/* ---------- banco ---------- */
const mem = (globalThis.__patioMem ||= new Map()); // usado só em teste local (LOCAL_BLOBS=1)
export function store(name) {
  if (process.env.LOCAL_BLOBS) {
    if (!mem.has(name)) mem.set(name, new Map());
    const m = mem.get(name);
    return {
      get: async (k, o) => { if (!m.has(k)) return null; const v = m.get(k); return v.bin ? (o?.type === "arrayBuffer" ? v.bin : v.bin) : (o?.type === "json" || !o ? JSON.parse(v) : v); },
      getWithMetadata: async (k) => m.has(k) ? { data: m.get(k).bin, metadata: m.get(k).meta } : null,
      set: async (k, data, o) => { m.set(k, { bin: data, meta: o?.metadata || {} }); },
      setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
      delete: async k => { m.delete(k); },
      list: async () => ({ blobs: [...m.keys()].map(key => ({ key })) }),
    };
  }
  return getStore({ name, consistency: "strong" });
}
export async function todos(st) {
  const { blobs } = await st.list();
  return (await Promise.all(blobs.map(b => st.get(b.key, { type: "json" })))).filter(Boolean);
}

/* ---------- resposta ---------- */
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
export async function corpo(req) {
  try { return await req.json(); } catch { return null; }
}

/* ---------- senhas ---------- */
export function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(String(senha), salt, 32).toString("hex");
}
export function confereSenha(senha, salvo) {
  const [salt, h] = String(salvo || "").split(":");
  if (!salt || !h) return false;
  const a = crypto.scryptSync(String(senha), salt, 32), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function gerarSenha() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789"; // sem letras/números que confundem (l, 1, o, 0)
  return Array.from(crypto.randomBytes(8), b => abc[b % abc.length]).join("");
}

/* ---------- sessões (token assinado, válido por 30 dias) ---------- */
const segredo = () => process.env.SESSION_SECRET || "patio:" + (process.env.ADMIN_PASSWORD || "");
export function criarToken(dados) {
  const p = Buffer.from(JSON.stringify({ ...dados, exp: Date.now() + 30 * 864e5 })).toString("base64url");
  const s = crypto.createHmac("sha256", segredo()).update(p).digest("base64url");
  return p + "." + s;
}
function lerToken(tok) {
  const [p, s] = String(tok || "").split(".");
  if (!p || !s) return null;
  const esperado = crypto.createHmac("sha256", segredo()).update(p).digest("base64url");
  if (!iguais(s, esperado)) return null;
  try {
    const o = JSON.parse(Buffer.from(p, "base64url").toString());
    return o.exp > Date.now() ? o : null;
  } catch { return null; }
}
/* ---------- permissões ---------- */
export const PERMS = ["repasses", "reservas", "lojistas", "config", "acessos"];
export const pode = (s, p) => !!s && s.role === "admin" && (s.master || (s.perms || []).includes(p));

/**
 * Quem está fazendo a chamada:
 *   {role:"admin", master:true, perms}            dono do portal (usuário "admin")
 *   {role:"admin", master:false, perms, usuario}  pessoa da equipe, com as permissões dadas pelo master
 *   {role:"lojista", lojista}
 */
export async function sessao(req) {
  const t = lerToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!t) return null;
  if (t.role === "admin") {
    const cfg = await getConfig();
    if (!cfg.masterHash && !process.env.ADMIN_PASSWORD) return null;
    if ((cfg.masterVersao || 0) !== (t.v || 0)) return null; // senha master trocada
    return { role: "admin", master: true, perms: PERMS, nome: "Administrador" };
  }
  if (t.role === "equipe") {
    const u = await store("usuarios").get(t.sub, { type: "json" });
    if (!u || !u.ativo || (u.senhaVersao || 0) !== t.v) return null;
    return { role: "admin", master: false, perms: u.perms || [], usuario: u, nome: u.nome };
  }
  const l = await store("lojistas").get(t.sub, { type: "json" });
  if (!l || !l.ativo || (l.senhaVersao || 0) !== t.v) return null; // desativado ou senha trocada
  return { role: "lojista", lojista: l, nome: l.nome };
}
export const quem = s => !s ? "Visitante" : s.master ? "Administrador" : s.usuario ? s.usuario.nome : s.lojista?.nome || "?";

/** Usuário de acesso já usado por loja ou pessoa da equipe? */
export async function usuarioEmUso(usuario, exceto) {
  if (usuario === "admin") return true;
  const [ls, us] = await Promise.all([todos(store("lojistas")), todos(store("usuarios"))]);
  return [...ls, ...us].some(x => x.usuario === usuario && x.id !== exceto);
}

/* ---------- configurações do portal (salvas no banco; variáveis do Netlify valem como padrão) ---------- */
const PADRAO = () => ({
  contatoWhatsapp: process.env.CONTATO_WHATSAPP || "",
  grupoWhatsapp: process.env.GRUPO_WHATSAPP || "",
  pixChave: process.env.PIX_CHAVE || "",
  pixNome: process.env.PIX_NOME || "",
  taxaCheia: Number(process.env.TAXA_CHEIA || 1900),
  taxaPromo: Number(process.env.TAXA_PROMO || 1000),
  promoAte: process.env.PROMO_ATE || "2026-11-22",
  avisoAtivo: true,
  avisoTitulo: "Bem-vindo ao Pátio Repasses",
  avisoTexto: "Estamos em fase de testes, então você pode encontrar ajustes acontecendo e poucos carros por enquanto.\nEntre no nosso grupo de WhatsApp para receber os repasses em primeira mão e ajudar a construir o portal.",
  placaProvedor: process.env.PLACA_PROVEDOR || "apibrasil",
  placaApiUrl: process.env.PLACA_API_URL || "",
  placaApiToken: process.env.PLACA_API_TOKEN || "",
  placaApiHeader: process.env.PLACA_API_HEADER || "",
  placaCacheDias: Number(process.env.PLACA_CACHE_DIAS || 30),
});
export async function getConfig() {
  const salvo = await store("config").get("geral", { type: "json" }).catch(() => null);
  return { ...PADRAO(), ...(salvo || {}) };
}
export async function salvarConfig(mudancas) {
  const atual = await store("config").get("geral", { type: "json" }).catch(() => null) || {};
  const novo = { ...atual, ...mudancas, atualizadoEm: new Date().toISOString() };
  await store("config").setJSON("geral", novo);
  return novo;
}

/* ---------- histórico de atividade (últimos 300 eventos) ---------- */
export async function registrar(s, acao, detalhe = "") {
  try {
    const st = store("log");
    const doc = await st.get("atividade", { type: "json" }) || { itens: [] };
    doc.itens.unshift({ em: new Date().toISOString(), quem: typeof s === "string" ? s : quem(s), acao, detalhe: String(detalhe).slice(0, 200) });
    doc.itens = doc.itens.slice(0, 300);
    await st.setJSON("atividade", doc);
  } catch { /* o histórico nunca derruba a ação principal */ }
}

/* ---------- lojistas ---------- */
export function lojistaPublico(l) {
  if (!l) return null;
  const { senhaHash, senhaVersao, ...resto } = l;
  return resto;
}
export const slug = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "").slice(0, 24);

/* ---------- taxa da plataforma (sinal) ---------- */
// TAXA_CHEIA e TAXA_PROMO em reais; PROMO_ATE = último dia da promoção (AAAA-MM-DD), horário de Brasília.
export function hojeBR() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
export async function taxaAgora(cfg) {
  cfg = cfg || await getConfig();
  const cheia = Number(cfg.taxaCheia) || 1900, promocional = Number(cfg.taxaPromo) || 1000;
  const promoAte = cfg.promoAte || "";
  const promo = !!promoAte && hojeBR() <= promoAte;
  return { valor: promo ? promocional : cheia, promo, promoAte, cheia, promocional };
}
