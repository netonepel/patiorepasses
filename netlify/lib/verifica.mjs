// Verificação de telefone (código por WhatsApp via APIBrasil) e de Facebook (login oficial da Meta).
import crypto from "node:crypto";
import { store } from "./core.mjs";

/** "(48) 99999-0000" -> "5548999990000". Devolve "" se não parecer celular brasileiro. */
export function normFone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return /^55\d{10,11}$/.test(d) ? d : "";
}
export const whatsConfigurado = cfg => !!(cfg.verifDeviceToken && (cfg.verifBearer || cfg.placaApiToken) && cfg.verifWhatsUrl);
export const fbConfigurado = cfg => !!(cfg.fbAppId && cfg.fbAppSecret);

const hash = (codigo, fone) => crypto.createHash("sha256").update(`${codigo}:${fone}:${process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "patio"}`).digest("hex");

/** Envia uma mensagem de WhatsApp pela APIBrasil. Devolve { ok, status, corpo }. */
export async function enviarWhats(cfg, fone, texto) {
  const bearer = String(cfg.verifBearer || cfg.placaApiToken || "").trim();
  const headers = { "Content-Type": "application/json", Accept: "application/json",
    Authorization: /^bearer\s/i.test(bearer) ? bearer : "Bearer " + bearer, DeviceToken: String(cfg.verifDeviceToken || "").trim() };
  try {
    const r = await fetch(cfg.verifWhatsUrl, { method: "POST", headers, body: JSON.stringify({ number: fone, text: texto }), signal: AbortSignal.timeout(20000) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
    const ok = r.ok && !(j && (j.error === true || j.status === false || j.status === "error"));
    return { ok, status: r.status, corpo: txt.slice(0, 800), msg: j?.message || j?.msg || j?.erro || "" };
  } catch (e) {
    return { ok: false, status: 0, corpo: String(e?.message || e), msg: e?.name === "TimeoutError" ? "a APIBrasil demorou para responder" : "" };
  }
}

/** Gera e envia um código de 6 dígitos, com limites contra abuso. */
export async function enviarCodigo(cfg, fone, ip) {
  const st = store("codigos"), agora = Date.now();
  const doc = await st.get(fone, { type: "json" }).catch(() => null) || { envios: [] };
  doc.envios = (doc.envios || []).filter(t => agora - t < 3600e3);
  const ultimo = doc.envios[doc.envios.length - 1];
  if (ultimo && agora - ultimo < 60e3) return { erro: `Espere ${Math.ceil((60e3 - (agora - ultimo)) / 1000)} segundos para pedir outro código.`, status: 429 };
  if (doc.envios.length >= 5) return { erro: "Muitos códigos pedidos para esse número. Tente de novo em 1 hora.", status: 429 };
  if (ip) {
    const sip = store("codigos-ip"), dip = await sip.get(ip, { type: "json" }).catch(() => null) || { envios: [] };
    dip.envios = (dip.envios || []).filter(t => agora - t < 3600e3);
    if (dip.envios.length >= 12) return { erro: "Muitos pedidos de código. Tente de novo mais tarde.", status: 429 };
    dip.envios.push(agora); await sip.setJSON(ip, dip);
  }
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  const texto = String(cfg.verifMensagem || "Seu código: {codigo}").replaceAll("{codigo}", codigo);
  const r = await enviarWhats(cfg, fone, texto);
  if (!r.ok) {
    console.error("Envio de código falhou:", r.status, r.corpo);
    return { erro: r.status === 0 ? `Não foi possível enviar o código agora (${r.msg || "sem resposta"}).`
      : r.status === 401 || r.status === 403 ? "O envio por WhatsApp não está autorizado. O administrador precisa conferir os tokens da APIBrasil."
      : `Não foi possível enviar o código${r.msg ? ": " + r.msg : ""}.`, status: 502 };
  }
  doc.envios.push(agora);
  await st.setJSON(fone, { envios: doc.envios, hash: hash(codigo, fone), expira: agora + 10 * 60e3, tentativas: 0 });
  return { ok: true };
}

/** Confere o código digitado. */
export async function confirmarCodigo(fone, codigo) {
  const st = store("codigos");
  const doc = await st.get(fone, { type: "json" }).catch(() => null);
  if (!doc?.hash) return { erro: "Peça um código primeiro." };
  if (Date.now() > doc.expira) return { erro: "O código venceu. Peça um novo." };
  if ((doc.tentativas || 0) >= 5) return { erro: "Muitas tentativas erradas. Peça um novo código." };
  const certo = hash(String(codigo || "").replace(/\D/g, ""), fone) === doc.hash;
  if (!certo) { doc.tentativas = (doc.tentativas || 0) + 1; await st.setJSON(fone, doc); return { erro: `Código errado. Você ainda tem ${5 - doc.tentativas} tentativa(s).` }; }
  await st.setJSON(fone, { envios: doc.envios || [] }); // código usado não vale de novo
  return { ok: true };
}

/* ---------- Facebook ---------- */
const GRAPH = "https://graph.facebook.com/v19.0";
export const urlRetornoFb = req => (process.env.URL || new URL(req.url).origin).replace(/\/+$/, "") + "/api/facebook/retorno";
export function urlLoginFb(cfg, req, state) {
  const q = new URLSearchParams({ client_id: cfg.fbAppId, redirect_uri: urlRetornoFb(req), state, scope: "public_profile", response_type: "code" });
  return (process.env.FB_DIALOG_URL || "https://www.facebook.com/v19.0/dialog/oauth") + "?" + q;
}
export async function perfilFb(cfg, req, code) {
  const q = new URLSearchParams({ client_id: cfg.fbAppId, client_secret: cfg.fbAppSecret, redirect_uri: urlRetornoFb(req), code });
  const t = await fetch(`${GRAPH}/oauth/access_token?${q}`, { signal: AbortSignal.timeout(15000) }).then(r => r.json());
  if (!t.access_token) throw new Error(t.error?.message || "o Facebook não liberou o acesso");
  const me = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(t.access_token)}`, { signal: AbortSignal.timeout(15000) }).then(r => r.json());
  if (!me.id) throw new Error(me.error?.message || "não foi possível ler o perfil");
  return { id: String(me.id), nome: String(me.name || "") };
}
