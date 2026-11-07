// Verificação de telefone e Facebook.
//   POST /api/verificar/enviar     { whatsapp }          envia código por WhatsApp (lojista logado: vai para o WhatsApp da loja)
//   POST /api/verificar/confirmar  { whatsapp, codigo }  lojista: marca a loja como verificada | cliente: devolve { token } para a reserva
//   POST /api/facebook/link        cria o "state" do login (lojista logado ou cliente)
//   GET  /api/facebook/inicio      abre o login oficial do Facebook
//   GET  /api/facebook/retorno     volta do Facebook, salva/gera a verificação e fecha a janela
import { store, json, corpo, sessao, getConfig, criarToken, lerTokenAssinado, registrar } from "../lib/core.mjs";
import { normFone, whatsConfigurado, fbConfigurado, enviarCodigo, confirmarCodigo, urlLoginFb, perfilFb } from "../lib/verifica.mjs";

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const cfg = await getConfig();

  /* ----- WhatsApp ----- */
  if (path === "/api/verificar/enviar" && req.method === "POST") {
    if (!whatsConfigurado(cfg)) return json({ erro: "A verificação por WhatsApp ainda não foi configurada." }, 503);
    const b = await corpo(req) || {};
    const s = b.para === "loja" ? await sessao(req) : null; // só verifica a loja quando o pedido vem do painel
    if (b.para === "loja" && s?.role !== "lojista") return json({ erro: "Entre como lojista para verificar a loja." }, 401);
    const fone = normFone(s?.role === "lojista" ? s.lojista.whatsapp : b.whatsapp);
    if (!fone) return json({ erro: s?.role === "lojista" ? "O WhatsApp da sua loja está incompleto. Peça ao Pátio para corrigir." : "Digite um WhatsApp com DDD." }, 400);
    const r = await enviarCodigo(cfg, fone, context.ip || req.headers.get("x-nf-client-connection-ip") || "");
    if (r.erro) return json({ erro: r.erro }, r.status || 400);
    return json({ ok: true, final: fone.slice(-4) });
  }

  if (path === "/api/verificar/confirmar" && req.method === "POST") {
    const b = await corpo(req) || {};
    const s = b.para === "loja" ? await sessao(req) : null;
    if (b.para === "loja" && s?.role !== "lojista") return json({ erro: "Entre como lojista para verificar a loja." }, 401);
    const fone = normFone(s?.role === "lojista" ? s.lojista.whatsapp : b.whatsapp);
    if (!fone) return json({ erro: "WhatsApp inválido." }, 400);
    const r = await confirmarCodigo(fone, b.codigo);
    if (r.erro) return json({ erro: r.erro }, 400);
    if (s?.role === "lojista") {
      const l = { ...s.lojista, telefoneVerificado: fone, telefoneVerificadoEm: new Date().toISOString() };
      await store("lojistas").setJSON(l.id, l);
      await registrar(s, "Verificou o WhatsApp da loja");
      return json({ ok: true });
    }
    return json({ ok: true, token: criarToken({ role: "tel", tel: fone }, 1) }); // vale 1 dia para concluir a reserva
  }

  /* ----- Facebook ----- */
  if (path === "/api/facebook/link" && req.method === "POST") {
    if (!fbConfigurado(cfg)) return json({ erro: "O login com Facebook ainda não foi configurado." }, 503);
    const b = await corpo(req) || {};
    const s = b.para === "loja" ? await sessao(req) : null;
    const state = s?.role === "lojista" ? criarToken({ role: "fbstate", para: "loja", sub: s.lojista.id }, 0.01)
      : criarToken({ role: "fbstate", para: "cliente", n: crypto.randomUUID() }, 0.01); // ~15 minutos
    return json({ url: "/api/facebook/inicio?state=" + encodeURIComponent(state) });
  }

  if (path === "/api/facebook/inicio" && req.method === "GET") {
    const state = new URL(req.url).searchParams.get("state") || "";
    if (!fbConfigurado(cfg) || lerTokenAssinado(state)?.role !== "fbstate") return pagina(false, "Link de login inválido ou vencido. Feche esta janela e tente de novo.");
    return Response.redirect(urlLoginFb(cfg, req, state), 302);
  }

  if (path === "/api/facebook/retorno" && req.method === "GET") {
    const u = new URL(req.url);
    const st = lerTokenAssinado(u.searchParams.get("state") || "");
    if (!st || st.role !== "fbstate") return pagina(false, "O login demorou demais. Feche esta janela e tente de novo.");
    if (u.searchParams.get("error")) return pagina(false, "Login com Facebook cancelado.");
    let perfil;
    try { perfil = await perfilFb(cfg, req, u.searchParams.get("code") || ""); }
    catch (e) { console.error("Facebook:", e); return pagina(false, "Não foi possível confirmar com o Facebook: " + e.message + "."); }
    if (st.para === "loja") {
      const lj = store("lojistas"), l = await lj.get(st.sub, { type: "json" });
      if (!l) return pagina(false, "Loja não encontrada.");
      await lj.setJSON(l.id, { ...l, facebook: { ...perfil, em: new Date().toISOString() } });
      await registrar(l.nome, "Conectou o Facebook da loja", perfil.nome);
      return pagina(true, `Facebook de ${perfil.nome} conectado à loja.`, { nome: perfil.nome });
    }
    return pagina(true, `Confirmado como ${perfil.nome}.`, { nome: perfil.nome, token: criarToken({ role: "fb", id: perfil.id, nome: perfil.nome }, 1) });
  }
  return json({ erro: "Não encontrado." }, 404);
};

export const config = { path: ["/api/verificar/enviar", "/api/verificar/confirmar", "/api/facebook/link", "/api/facebook/inicio", "/api/facebook/retorno"] };

// Página que fecha a janela do Facebook e avisa o site
function pagina(ok, texto, dados = {}) {
  const msg = JSON.stringify({ tipo: "pr-facebook", ok, texto, ...dados }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pátio Repasses</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0c0d;color:#f2f1ec;font:16px system-ui,sans-serif;text-align:center;padding:24px}b{color:${ok ? "#ffc600" : "#ff8a80"}}</style></head>
<body><div><b>${ok ? "Pronto!" : "Não deu certo"}</b><p>${texto.replace(/[<>&]/g, "")}</p><p style="color:#a3a39c;font-size:14px">Você pode fechar esta janela.</p></div>
<script>try{if(window.opener){window.opener.postMessage(${msg},location.origin);setTimeout(function(){window.close()},900)}}catch(e){}</script></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
