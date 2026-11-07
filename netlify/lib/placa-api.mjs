// Chamada à API de placa, compartilhada pela consulta e pelo diagnóstico do painel.
// APIBrasil: POST com Bearer Token. Outros serviços: GET no endereço configurado; se falhar, POST com { placa, token } (formato da Placa Fipe).
export const APIBRASIL_URL = "https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits";
export const ehApiBrasil = cfg => cfg.placaProvedor === "apibrasil" || (!cfg.placaProvedor && /apibrasil\.io/i.test(cfg.placaApiUrl || ""));

export async function chamarApi(cfg, placa) {
  const tpl = String(cfg.placaApiUrl || "").trim();
  const token = String(cfg.placaApiToken || "").trim();
  const tentativas = [];
  if (!tpl && !ehApiBrasil(cfg)) return { tentativas, erro: "A consulta de placa ainda não foi configurada. O administrador precisa preencher em Configurações." };
  if (!token) return { tentativas, erro: "A chave (token) da API de placa não foi cadastrada em Configurações." };

  const headers = { Accept: "application/json", "User-Agent": "PatioRepasses/1.0 (+netlify)" };
  if (cfg.placaApiHeader) headers[String(cfg.placaApiHeader).trim()] = token;
  const esconde = s => token ? String(s).split(token).join("••••") : String(s);

  async function tenta(metodo, url, body, extra = {}) {
    const t0 = Date.now(), reg = { metodo, url: esconde(url) };
    try {
      const r = await fetch(url, { method: metodo, headers: { ...headers, ...extra, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
      const txt = await r.text();
      let json = null; try { json = JSON.parse(txt); } catch {}
      Object.assign(reg, { status: r.status, ms: Date.now() - t0, corpo: esconde(txt.slice(0, 1500)), json });
    } catch (e) {
      Object.assign(reg, { status: 0, ms: Date.now() - t0, corpo: "Sem resposta: " + (e?.name === "TimeoutError" ? "a API demorou mais de 20 segundos" : e?.message || e) });
    }
    tentativas.push(reg);
    return reg;
  }
  const valido = r => r.status >= 200 && r.status < 300 && r.json && typeof r.json === "object" && !r.json.error;

  // APIBrasil (apibrasil.io): POST com Bearer Token e { tipo, placa }
  if (ehApiBrasil(cfg)) {
    // só usa o endereço salvo se for um endereço completo da APIBrasil; senão, o oficial
    const url = /^https:\/\/[^/]*apibrasil\.io\/api\//i.test(tpl) ? tpl : APIBRASIL_URL;
    const auth = /^bearer\s/i.test(token) ? token : "Bearer " + token;
    const r = await tenta("POST", url, { tipo: "fipe-chassi", placa, homolog: false }, { Authorization: auth });
    if (valido(r)) return { tentativas, bruto: r.json };
    const msg = r.json?.message || r.json?.msg || r.json?.erro || "";
    return { tentativas, erro: r.status === 402 ? "Saldo insuficiente na APIBrasil. Recarregue o saldo para consultar placas."
      : r.status === 401 || r.status === 403 ? "A APIBrasil recusou o token. Confira o Bearer Token em Configurações."
      : r.status === 0 ? "Não foi possível falar com a APIBrasil agora (" + r.corpo.replace("Sem resposta: ", "") + ")."
      : `A APIBrasil respondeu com erro ${r.status}${msg ? ": " + msg : ""}.` };
  }

  // 1) GET no endereço configurado
  const url = tpl.replaceAll("{placa}", placa).replaceAll("{token}", encodeURIComponent(token));
  let r = await tenta("GET", url);

  // 2) POST { placa, token } no endereço sem os pedaços /{placa}/{token} (como a Placa Fipe documenta)
  if (!valido(r) && token) {
    const base = tpl.replace(/\/?\{placa\}/g, "").replace(/\/?\{token\}/g, "").replace(/\/+$/, "");
    if (base && base !== url) { const r2 = await tenta("POST", base, { placa, token }); if (valido(r2)) r = r2; }
  }
  if (!valido(r)) {
    const ultimo = tentativas[tentativas.length - 1];
    const msg = r.json?.msg || r.json?.mensagem || r.json?.message || r.json?.erro || "";
    return { tentativas, erro: ultimo.status === 0 ? "Não foi possível falar com a API de placas agora (" + ultimo.corpo.replace("Sem resposta: ", "") + ")."
      : `A API de placas respondeu com erro ${r.status}${msg ? ": " + msg : ""}.` };
  }
  return { tentativas, bruto: r.json };
}
