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
      get: async k => (m.has(k) ? JSON.parse(m.get(k)) : null),
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
/** Quem está fazendo a chamada: {role:"admin"} | {role:"lojista", lojista} | null */
export async function sessao(req) {
  const t = lerToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!t) return null;
  if (t.role === "admin") return process.env.ADMIN_PASSWORD ? { role: "admin" } : null;
  const l = await store("lojistas").get(t.sub, { type: "json" });
  if (!l || !l.ativo || (l.senhaVersao || 0) !== t.v) return null; // desativado ou senha trocada
  return { role: "lojista", lojista: l };
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
export function taxaAgora() {
  const cheia = Number(process.env.TAXA_CHEIA || 1900), promocional = Number(process.env.TAXA_PROMO || 1000);
  const promoAte = process.env.PROMO_ATE || "2026-11-22";
  const promo = hojeBR() <= promoAte;
  return { valor: promo ? promocional : cheia, promo, promoAte, cheia, promocional };
}
