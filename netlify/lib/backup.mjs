// Cópias de segurança do banco (Netlify Blobs). As fotos não entram no arquivo (ficam no Netlify),
// só a lista de fotos de cada carro.
import { store, todos } from "./core.mjs";

const COLECOES = ["lojistas", "usuarios", "repasses", "reservas"];

export async function gerarCopia() {
  const dados = {};
  for (const c of COLECOES) dados[c] = await todos(store(c));
  dados.config = await store("config").get("geral", { type: "json" }).catch(() => null) || {};
  dados.log = await store("log").get("atividade", { type: "json" }).catch(() => null) || { itens: [] };
  const contagem = Object.fromEntries(COLECOES.map(c => [c, dados[c].length]));
  return { app: "patio-repasses", versao: 1, em: new Date().toISOString(), contagem, dados };
}

/** Guarda uma cópia dentro do próprio Netlify. tipo "dia" (guarda 14) ou "antes" (guarda 5). */
export async function guardarCopia(tipo = "dia") {
  const st = store("backups"), copia = await gerarCopia();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const chave = tipo === "dia" ? `dia-${hoje}` : `antes-${Date.now()}`;
  await st.setJSON(chave, copia);
  const { blobs } = await st.list();
  const doTipo = blobs.map(b => b.key).filter(k => k.startsWith(tipo + "-")).sort().reverse();
  for (const k of doTipo.slice(tipo === "dia" ? 14 : 5)) await st.delete(k);
  return { chave, contagem: copia.contagem };
}

/** Restaura uma cópia somando ao que existe (não apaga nada que não esteja no arquivo). */
export async function restaurar(copia) {
  if (!copia || copia.app !== "patio-repasses" || !copia.dados) throw new Error("Esse arquivo não é uma cópia do Pátio Repasses.");
  const res = {};
  for (const c of COLECOES) {
    const lista = Array.isArray(copia.dados[c]) ? copia.dados[c] : [];
    const st = store(c);
    let n = 0;
    for (const doc of lista) if (doc && typeof doc.id === "string" && doc.id) { await st.setJSON(doc.id, doc); n++; }
    res[c] = n;
  }
  if (copia.dados.config && typeof copia.dados.config === "object") await store("config").setJSON("geral", copia.dados.config);
  return res;
}
