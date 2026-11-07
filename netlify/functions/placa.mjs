// Consulta de placa — roda no servidor do Netlify, a chave da API nunca vai para o navegador.
// GET /api/placa/ABC1D23  ->  { placa, marca, modelo, versao, anoFab, anoModelo, cor, combustivel, fipe, cidade, uf, cache }
//
// Variáveis de ambiente (Netlify > Site configuration > Environment variables):
//   PLACA_API_URL      URL da consulta, com {placa} e, se a API usar, {token}
//                      ex.: https://wdapi2.com.br/consulta/{placa}/{token}
//   PLACA_API_TOKEN    sua chave/token da API de placas
//   PLACA_API_HEADER   (opcional) nome do cabeçalho onde a chave vai, se a API pedir assim
//                      ex.: Authorization  (o valor enviado será o PLACA_API_TOKEN inteiro, ex.: "Bearer abc123")
//   Só lojistas logados e o administrador consultam placa (evita gastar seus créditos)
//   PLACA_CACHE_DIAS   (opcional) por quantos dias guardar uma consulta já feita. Padrão: 30

import { store, sessao, getConfig } from "../lib/core.mjs";
import { chamarApi } from "../lib/placa-api.mjs";

const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export default async (req, context) => {
  const placa = String(context.params.placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!PLACA_RE.test(placa)) return json({ erro: "Placa inválida. Use ABC1D23 ou ABC1234." }, 400);

  if (!(await sessao(req))) return json({ erro: "Entre como lojista para consultar placas." }, 401);

  const cfg = await getConfig();
  if (!cfg.placaApiToken) return json({ erro: "A consulta de placa ainda não foi configurada. O administrador precisa colocar a chave em Configurações." }, 500);

  // cache: placa já consultada não gasta crédito de novo
  const cache = store("placas");
  const dias = Number(cfg.placaCacheDias || 30);
  const salvo = await cache.get(placa, { type: "json" }).catch(() => null);
  if (salvo && Date.now() - salvo.em < dias * 864e5) return json({ ...salvo.dados, cache: true });

  const resp = await chamarApi(cfg, placa);
  if (resp.erro) {
    console.error("Consulta de placa falhou:", JSON.stringify(resp.tentativas).slice(0, 1200));
    return json({ erro: resp.erro }, 502);
  }
  const bruto = resp.bruto;

  if (bruto && bruto.codigo !== undefined && Number(bruto.codigo) !== 1 && !bruto.informacoes_veiculo) {
    console.error("API de placa recusou:", JSON.stringify(bruto).slice(0, 300));
    return json({ erro: bruto.msg ? `A consulta não deu certo: ${bruto.msg}.` : "Placa não encontrada na base da API." }, 404);
  }
  const dados = normalizar(bruto, placa);
  if (!dados.marca && !dados.modelo) {
    console.error("Resposta sem marca/modelo:", JSON.stringify(bruto).slice(0, 500));
    return json({ erro: "Placa não encontrada na base da API." }, 404);
  }
  await cache.setJSON(placa, { em: Date.now(), dados, bruto }).catch(() => {});
  return json({ ...dados, cache: false });
};

export const config = { path: "/api/placa/:placa" };

/* ---------- normalização: funciona com os formatos mais comuns das APIs de placa do Brasil ---------- */
const k = s => String(s).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

function acha(obj, nomes, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  const alvo = nomes.map(k);
  for (const [key, v] of Object.entries(obj)) {
    if (alvo.includes(k(key)) && v !== null && v !== "" && typeof v !== "object") return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") { const r = acha(v, nomes, depth + 1); if (r !== undefined) return r; }
  }
}

function dinheiro(v) {
  if (v == null) return null;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).replace(/[^\d,.-]/g, "");
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function fipeDe(obj) {
  // WDAPI e similares: { fipe: { dados: [ { texto_valor: "R$ 45.000,00", score: 100 }, ... ] } }
  const lista = acha2(obj, ["dados", "fipes", "fipe"]);
  if (Array.isArray(lista) && lista.length) {
    const melhor = [...lista].sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0];
    const v = acha(melhor, ["texto_valor", "valor", "preco", "price", "valor_fipe"]);
    if (dinheiro(v)) return dinheiro(v);
  }
  return dinheiro(acha(obj, ["valor_fipe", "valorFipe", "fipe_valor", "preco_fipe", "texto_valor", "valor"]));
}
function acha2(obj, nomes, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  for (const [key, v] of Object.entries(obj)) if (nomes.map(k).includes(k(key)) && Array.isArray(v)) return v;
  for (const v of Object.values(obj)) if (v && typeof v === "object") { const r = acha2(v, nomes, depth + 1); if (r) return r; }
}

function combustivel(v) {
  const s = String(v || "").toLowerCase().normalize("NFD").replace(/[^a-z/ ]/g, "");
  if (!s) return "";
  if (s.includes("flex") || (s.includes("alcool") && s.includes("gasolina"))) return "Flex";
  if (s.includes("eletric") && (s.includes("gasolina") || s.includes("hibrid"))) return "Híbrido";
  if (s.includes("eletric")) return "Elétrico";
  if (s.includes("diesel")) return "Diesel";
  if (s.includes("gas natural") || s.includes("gnv")) return "GNV";
  if (s.includes("gasolina")) return "Gasolina";
  return TITLE(v);
}
const TITLE = s => s ? String(s).toLowerCase().replace(/(^|\s|-)\S/g, c => c.toUpperCase()) : "";

/* Formato da Placa Fipe (api.placafipe.com.br/getplacafipe):
   { codigo: 1, msg, informacoes_veiculo: { marca, modelo, ano, ano_modelo, cor, combustivel, municipio, uf, ... },
     fipe: [ { marca, modelo, ano_modelo, valor, similaridade, correspondencia, ... } ] } */
function placaFipe(b, placa) {
  const iv = b.informacoes_veiculo || {};
  const lista = Array.isArray(b.fipe) ? b.fipe : [];
  const nota = f => Number(f?.correspondencia ?? f?.similaridade ?? 0);
  const melhor = [...lista].sort((x, y) => nota(y) - nota(x))[0];
  const base = normalizar({ MARCA: iv.marca || melhor?.marca, MODELO: iv.modelo, ano: iv.ano, anoModelo: iv.ano_modelo || melhor?.ano_modelo,
    cor: iv.cor, combustivel: iv.combustivel || melhor?.combustivel, municipio: iv.municipio, uf: iv.uf }, placa, true);
  // versão: o nome da FIPE é mais completo (ex.: "Gol 1.0 Flex 12V 5p") — tira o nome do modelo do começo
  if (melhor?.modelo) {
    const fm = String(melhor.modelo).trim(), mod = base.modelo.toLowerCase();
    base.versao = (mod && fm.toLowerCase().startsWith(mod) ? fm.slice(mod.length) : fm).trim() || base.versao;
    if (!base.modelo) base.modelo = TITLE(fm.split(/\s+/)[0]);
  }
  if (!base.marca && melhor?.marca) base.marca = limpaMarca(melhor.marca);
  base.fipe = dinheiro(melhor?.valor) || null;
  return base;
}

function limpaMarca(m) {
  let s = String(m || "").trim().replace(/^I\s*\//i, "");
  if (s.includes(" - ")) s = s.split(" - ").pop();           // "VW - VolksWagen" -> "VolksWagen"
  const MAP = { VW: "Volkswagen", VOLKSWAGEN: "Volkswagen", GM: "Chevrolet", CHEV: "Chevrolet", CHEVROLET: "Chevrolet",
    "M.BENZ": "Mercedes-Benz", MBENZ: "Mercedes-Benz", "MERCEDES-BENZ": "Mercedes-Benz", "CAOA CHERY": "Caoa Chery", CHERY: "Caoa Chery",
    "LAND ROVER": "Land Rover", LR: "Land Rover", BMW: "BMW", BYD: "BYD", GWM: "GWM", JAC: "JAC", RAM: "RAM", "CITROEN": "Citroën" };
  return MAP[s.toUpperCase()] ?? TITLE(s);
}

/* Formato da APIBrasil (fipe-chassi): { error:false, data: { resultados: [ { marca, modelo, anoFabricacao, anoModelo,
   combustivel, cor, codigoFipe, valor, principal, historico } ] } } */
function apiBrasil(b, placa) {
  const lista = b.data?.resultados || b.resultados || b.data?.data?.resultados || [];
  const v = lista.find(x => x?.principal) || lista[0] || {};
  const fm = String(v.modelo || "").trim();
  const partes = fm.split(/\s+/);
  return {
    placa,
    marca: limpaMarca(v.marca),
    modelo: TITLE(partes[0] || ""),
    versao: partes.slice(1).join(" "),
    anoFab: v.anoFabricacao ? String(v.anoFabricacao).slice(0, 4) : "",
    anoModelo: v.anoModelo ? String(v.anoModelo).slice(0, 4) : "",
    cor: TITLE(v.cor),
    combustivel: combustivel(v.combustivel),
    fipe: dinheiro(v.valor),
    cidade: TITLE(v.municipio || v.cidade || ""),
    uf: String(v.uf || "").toUpperCase().slice(0, 2),
  };
}

export function normalizar(b, placa, interno = false) {
  if (!interno && b && (Array.isArray(b.data?.resultados) || Array.isArray(b.resultados))) return apiBrasil(b, placa);
  if (!interno && b && (b.informacoes_veiculo || (Array.isArray(b.fipe) && b.fipe[0]?.similaridade !== undefined))) return placaFipe(b, placa);
  let marca = acha(b, ["MARCA", "marca", "brand", "fabricante"]);
  let modelo = acha(b, ["MODELO", "modelo", "model"]);
  let versao = acha(b, ["versao", "version", "SUBMODELO", "submodelo"]);
  // "I/" = importado; muitas APIs devolvem "VW/GOL 1.0" ou "TOYOTA COROLLA XEI" num campo só
  if (marca) marca = String(marca).trim().replace(/^I\s*\//i, "");
  if (marca && !modelo) {
    if (marca.includes("/")) { const [a, ...r] = marca.split("/"); marca = a; modelo = r.join("/"); }
    else if (/\s/.test(marca)) { const [a, ...r] = marca.split(/\s+/); marca = a; modelo = r.join(" "); }
  }
  if (modelo && String(modelo).includes("/")) {
    const [a, ...r] = String(modelo).split("/"); if (!marca) marca = a; modelo = r.join("/");
  }
  if (modelo && !versao) {
    const m = String(modelo).trim().match(/^(\S+)\s+(.+)$/);
    if (m) { modelo = m[1]; versao = m[2]; }
  }
  const anoFab = acha(b, ["ano", "anoFabricacao", "ano_fabricacao", "anofab"]);
  const anoModelo = acha(b, ["anoModelo", "ano_modelo", "anomod"]);
  const marcaN = limpaMarca(marca);
  return {
    placa,
    marca: marcaN,
    modelo: TITLE(modelo),
    versao: versao ? String(versao).trim().toUpperCase() : "",
    anoFab: anoFab ? String(anoFab).slice(0, 4) : "",
    anoModelo: anoModelo ? String(anoModelo).slice(0, 4) : "",
    cor: TITLE(acha(b, ["cor", "color", "corVeiculo"])),
    combustivel: combustivel(acha(b, ["combustivel", "fuel", "tipoCombustivel"])),
    fipe: fipeDe(b),
    cidade: TITLE(acha(b, ["municipio", "cidade", "city"])),
    uf: String(acha(b, ["uf", "estado", "state"]) || "").toUpperCase().slice(0, 2),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
