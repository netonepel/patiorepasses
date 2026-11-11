// Fotos dos anúncios, guardadas no Netlify Blobs.
//   POST /api/fotos        (logado) { full: "data:image/jpeg;base64,...", thumb: "data:image/jpeg;base64,..." } -> { id }
//   GET  /api/fotos/:id    imagem grande  |  GET /api/fotos/:id?t=1  miniatura
// O navegador já reduz as fotos antes de enviar (grande ~1600px, miniatura ~560px).
import { store, json, corpo, sessao, pode, getConfig } from "../lib/core.mjs";
import { iaConfigurada, detectarPlacas, detectarTextos, normalizar } from "../lib/foto-ia.mjs";

const MAX = 2.5 * 1024 * 1024; // por imagem, depois de reduzida

export default async (req, context) => {
  const st = store("fotos");
  const id = context.params?.id;

  if (req.method === "GET" && id) {
    if (!/^[a-z0-9-]{8,64}$/i.test(id)) return new Response("Foto inválida", { status: 400 });
    const mini = new URL(req.url).searchParams.get("t") === "1";
    const r = await st.getWithMetadata(id + (mini ? "_t" : ""), { type: "arrayBuffer" });
    if (!r || !r.data) return new Response("Foto não encontrada", { status: 404 });
    return new Response(r.data, { headers: { "content-type": r.metadata?.tipo || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }

  // IA: acha placas, logos e textos da loja para borrar antes do envio
  if (req.method === "POST" && id === "analisar") {
    const s = await sessao(req);
    if (!s) return json({ erro: "Entre para usar a análise de fotos." }, 401);
    const cfg = await getConfig();
    if (!iaConfigurada(cfg)) return json({ erro: "A análise de fotos por IA não está ligada." }, 503);
    // limite: 150 análises por hora por conta
    const quem = s.lojista?.id || s.usuario?.id || "admin", lim = store("ia-uso"), agora = Date.now();
    const u = await lim.get(quem, { type: "json" }).catch(() => null) || { usos: [] };
    u.usos = (u.usos || []).filter(t => agora - t < 3600e3);
    if (u.usos.length >= 150) return json({ erro: "Limite de análises por hora atingido. Tente daqui a pouco." }, 429);
    u.usos.push(agora); await lim.setJSON(quem, u);
    const b = await corpo(req), img = decodifica(b?.full);
    const w = Number(b?.w), h = Number(b?.h);
    if (!img || !(w > 0 && h > 0)) return json({ erro: "Imagem inválida." }, 400);
    let nomeLoja = s.lojista?.nome || "";
    if (!nomeLoja && b.lojistaId) nomeLoja = (await store("lojistas").get(String(b.lojistaId), { type: "json" }))?.nome || "";
    const avisos = [];
    const [pl, tx] = await Promise.all([
      detectarPlacas(cfg, img.buf).catch(e => { console.error(e); avisos.push("Placa: " + e.message); return null; }),
      detectarTextos(cfg, img.buf.toString("base64"), nomeLoja).catch(e => { console.error(e); avisos.push("Textos: " + e.message); return null; }),
    ]);
    // texto com cara de placa já coberto pelo Plate Recognizer não precisa repetir
    return json({ caixas: normalizar([...(pl || []), ...(tx || [])], w, h), usou: { placa: !!pl, textos: !!tx }, avisos });
  }

  if (req.method === "POST" && !id) {
    const s = await sessao(req);
    if (!s) return json({ erro: "Entre para enviar fotos." }, 401);
    if (s.role === "admin" && !pode(s, "repasses")) return json({ erro: "Sem permissão para enviar fotos." }, 403);
    const b = await corpo(req);
    const full = decodifica(b?.full), thumb = decodifica(b?.thumb);
    if (!full) return json({ erro: "Imagem inválida. Use foto JPG, PNG ou WEBP." }, 400);
    if (full.buf.length > MAX || (thumb && thumb.buf.length > MAX)) return json({ erro: "Foto grande demais mesmo depois de reduzida." }, 413);
    const novo = crypto.randomUUID();
    const meta = { tipo: full.tipo, dono: s.lojista?.id || "admin", em: new Date().toISOString() };
    await st.set(novo, full.buf, { metadata: meta });
    await st.set(novo + "_t", (thumb || full).buf, { metadata: { ...meta, tipo: (thumb || full).tipo } });
    return json({ id: novo }, 201);
  }
  return json({ erro: "Método não suportado." }, 405);
};

export const config = { path: ["/api/fotos", "/api/fotos/:id"] }; // /api/fotos/analisar usa o mesmo caminho

function decodifica(d) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ""));
  if (!m) return null;
  return { tipo: m[1], buf: Buffer.from(m[2], "base64") };
}

/** Apaga as fotos (grande + miniatura). Usado quando o anúncio troca ou remove fotos. */
export async function apagarFotos(ids) {
  const st = store("fotos");
  for (const id of ids || []) { await st.delete(id).catch(() => {}); await st.delete(id + "_t").catch(() => {}); }
}

/** Mantém só as fotos que a pessoa enviou (ou que já eram do anúncio). Admin pode usar qualquer uma. */
export async function fotosPermitidas(ids, s, jaDoAnuncio = []) {
  if (s.role === "admin") return ids;
  const st = store("fotos"), ok = [];
  for (const id of ids) {
    if (jaDoAnuncio.includes(id)) { ok.push(id); continue; }
    const r = await st.getWithMetadata(id, { type: "arrayBuffer" }).catch(() => null);
    if (r?.metadata?.dono === s.lojista.id) ok.push(id);
  }
  return ok;
}
