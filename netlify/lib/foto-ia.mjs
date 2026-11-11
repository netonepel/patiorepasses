// IA para esconder placa e marcas da loja nas fotos.
//  - Placas: Plate Recognizer (api.platerecognizer.com), token em Configurações.
//  - Textos e logos: Google Cloud Vision (TEXT_DETECTION + LOGO_DETECTION), chave em Configurações.
// Devolve caixas em coordenadas relativas (0 a 1) com sugestão de borrar ou não.

const PLACA_RE = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/;
const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COMUNS = new Set(["auto", "autos", "car", "cars", "carro", "carros", "veiculos", "multimarcas", "motors", "repasse", "repasses", "comercio", "ltda", "loja", "store", "center"]);

export const iaConfigurada = cfg => !!(cfg.fotoIaAtivo && (cfg.plateRecToken || cfg.visionKey));

export async function detectarPlacas(cfg, buf) {
  if (!cfg.plateRecToken) return null;
  const fd = new FormData();
  fd.append("upload", new Blob([buf], { type: "image/jpeg" }), "foto.jpg");
  fd.append("regions", "br");
  const r = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
    method: "POST", headers: { Authorization: "Token " + String(cfg.plateRecToken).trim() }, body: fd, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Plate Recognizer respondeu " + r.status + (j.detail ? ": " + j.detail : ""));
  return (j.results || []).filter(x => x.box).map(x => ({ px: x.box, tipo: "placa", texto: String(x.plate || "").toUpperCase(), marcar: true }));
}

export async function detectarTextos(cfg, b64, nomeLoja) {
  if (!cfg.visionKey) return null;
  const r = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(String(cfg.visionKey).trim()), {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: "TEXT_DETECTION" }, { type: "LOGO_DETECTION", maxResults: 10 }] }] }) });
  const j = await r.json().catch(() => ({}));
  const resp = j.responses?.[0] || {};
  if (!r.ok || resp.error) throw new Error("Google Vision: " + (j.error?.message || resp.error?.message || r.status));
  const caixa = poly => { const v = poly?.vertices || []; const xs = v.map(p => p.x || 0), ys = v.map(p => p.y || 0);
    return { xmin: Math.min(...xs), ymin: Math.min(...ys), xmax: Math.max(...xs), ymax: Math.max(...ys) }; };
  const palavrasLoja = sem(nomeLoja).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !COMUNS.has(w));
  const out = [];
  for (const l of resp.logoAnnotations || []) out.push({ px: caixa(l.boundingPoly), tipo: "logo", texto: l.description || "logo", marcar: true });
  for (const t of (resp.textAnnotations || []).slice(1)) { // [0] é o texto inteiro
    const txt = String(t.description || "").trim(); if (!txt) continue;
    const up = txt.toUpperCase().replace(/[^A-Z0-9-]/g, ""), digitos = txt.replace(/\D/g, "");
    const n = sem(txt);
    let motivo = "";
    if (PLACA_RE.test(up)) motivo = "placa";
    else if (digitos.length >= 8) motivo = "telefone";
    else if (/@|www|\.com|\.br|instagram|insta|facebook|whats/i.test(txt)) motivo = "contato";
    else if (palavrasLoja.some(w => n.includes(w))) motivo = "nome da loja";
    out.push({ px: caixa(t.boundingPoly), tipo: motivo === "placa" ? "placa" : "texto", texto: txt, motivo, marcar: !!motivo });
  }
  return out;
}

/** Junta tudo e converte para 0..1, com uma folga em volta para garantir que nada fica legível. */
export function normalizar(caixas, w, h) {
  return caixas.filter(c => c.px && c.px.xmax > c.px.xmin && c.px.ymax > c.px.ymin).map(c => {
    const pw = (c.px.xmax - c.px.xmin), ph = (c.px.ymax - c.px.ymin);
    const folga = c.tipo === "texto" ? 0.12 : 0.18;
    const x = Math.max(0, (c.px.xmin - pw * folga) / w), y = Math.max(0, (c.px.ymin - ph * folga) / h);
    const x2 = Math.min(1, (c.px.xmax + pw * folga) / w), y2 = Math.min(1, (c.px.ymax + ph * folga) / h);
    return { x, y, w: x2 - x, h: y2 - y, tipo: c.tipo, texto: c.texto, motivo: c.motivo || c.tipo, marcar: c.marcar };
  });
}
