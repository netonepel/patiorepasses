// Painel master.
//   GET  /api/admin/config              configurações (token da API de placa vem mascarado)   [config]
//   PUT  /api/admin/config              salva configurações                                    [config]
//   GET  /api/admin/usuarios            pessoas da equipe                                      [acessos]
//   POST /api/admin/usuarios            cria { nome, usuario?, perms[] } -> { usuario, senha } [acessos]
//   PUT  /api/admin/usuarios/:id        edita { nome, usuario, perms, ativo }                  [acessos]
//   POST /api/admin/usuarios/:id/senha  gera senha nova                                        [acessos]
//   GET  /api/admin/log                 histórico de atividade                                 [acessos]
import { store, todos, json, corpo, sessao, pode, PERMS, getConfig, salvarConfig, registrar,
  hashSenha, gerarSenha, slug, usuarioEmUso } from "../lib/core.mjs";
import { chamarApi } from "../lib/placa-api.mjs";
import { normFone, whatsConfigurado, enviarWhats } from "../lib/verifica.mjs";
import { normalizar } from "./placa.mjs";

const CONFIG_CAMPOS = {
  contatoWhatsapp: "texto", grupoWhatsapp: "texto", pixChave: "texto", pixNome: "texto",
  taxaCheia: "numero", taxaPromo: "numero", promoAte: "data",
  avisoAtivo: "bool", avisoTitulo: "texto", avisoTexto: "longo",
  placaProvedor: "texto", placaApiUrl: "texto", placaApiHeader: "texto", placaApiToken: "segredo", placaCacheDias: "numero",
  verifWhatsUrl: "texto", verifBearer: "segredo", verifDeviceToken: "segredo", verifMensagem: "longo",
  exigirTelefoneReserva: "bool", exigirFacebookReserva: "bool", fbAppId: "texto", fbAppSecret: "segredo",
  margensAtivo: "bool", margemBase: "texto", margens: "margens",
  fotoIaAtivo: "bool", plateRecToken: "segredo", visionKey: "segredo",
};

export default async (req, context) => {
  const s = await sessao(req);
  if (!s || s.role !== "admin") return json({ erro: "Acesso restrito." }, 403);
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const id = context.params?.id;

  /* ----- configurações ----- */
  if (path === "/api/admin/config") {
    if (!pode(s, "config")) return json({ erro: "Você não tem permissão para mudar configurações." }, 403);
    if (req.method === "GET") {
      const c = await getConfig();
      const out = {}; for (const k of Object.keys(CONFIG_CAMPOS)) out[k] = c[k];
      for (const [k, tipo] of Object.entries(CONFIG_CAMPOS)) if (tipo === "segredo") { out["tem_" + k] = !!c[k]; out[k] = c[k] ? "••••" + String(c[k]).slice(-4) : ""; }
      out.temToken = !!c.placaApiToken;
      out.fbRetorno = (process.env.URL || new URL(req.url).origin).replace(/\/+$/, "") + "/api/facebook/retorno";
      return json(out);
    }
    if (req.method === "PUT") {
      const b = await corpo(req) || {}, m = {};
      for (const [k, tipo] of Object.entries(CONFIG_CAMPOS)) {
        if (!(k in b)) continue;
        let v = b[k];
        if (tipo === "segredo") { if (v === "" || v == null || String(v).startsWith("••••")) continue; v = String(v).trim().slice(0, 500); }
        else if (tipo === "numero") { v = Math.max(0, Math.round(Number(v))); if (!Number.isFinite(v)) return json({ erro: `Valor inválido em ${k}.` }, 400); }
        else if (tipo === "data") { v = String(v || ""); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return json({ erro: "Data da promoção inválida." }, 400); }
        else if (tipo === "bool") v = !!v;
        else if (tipo === "margens") {
          if (!Array.isArray(v) || !v.length || v.length > 20) return json({ erro: "Tabela de margens inválida." }, 400);
          v = v.map(f => ({ ate: f.ate === null || f.ate === "" ? null : Math.round(Number(f.ate)), min: Number(f.min), ...(Number(f.comissao) > 0 ? { comissao: Math.round(Number(f.comissao)) } : {}) }));
          if (v.some(f => (f.ate !== null && !(f.ate > 0)) || !(f.min >= 0 && f.min < 100))) return json({ erro: "Confira a tabela de margens: valores e percentuais precisam ser números (percentual de 0 a 99)." }, 400);
          v.sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
          if (v.filter(f => f.ate === null).length > 1) return json({ erro: "Só pode existir uma faixa \"acima de\"." }, 400);
        }
        else v = String(v ?? "").trim().slice(0, tipo === "longo" ? 1000 : 300);
        m[k] = v;
      }
      if (b.limparToken === true) m.placaApiToken = "";
      for (const k of ["verifBearer", "verifDeviceToken", "fbAppSecret", "plateRecToken", "visionKey"]) if (b["limpar_" + k] === true) m[k] = "";
      const atual = await getConfig();
      if (("avisoTitulo" in m && m.avisoTitulo !== atual.avisoTitulo) || ("avisoTexto" in m && m.avisoTexto !== atual.avisoTexto) || (m.avisoAtivo && !atual.avisoAtivo))
        m.avisoVersao = (atual.avisoVersao || 1) + 1; // aviso mudou: aparece de novo para quem já tinha visto
      const NOMES = { contatoWhatsapp: "WhatsApp do Pátio", grupoWhatsapp: "link do grupo", pixChave: "chave Pix", pixNome: "favorecido do Pix",
        taxaCheia: "valor do sinal", taxaPromo: "valor da promoção", promoAte: "fim da promoção", avisoAtivo: "aviso ligado/desligado",
        avisoTitulo: "título do aviso", avisoTexto: "texto do aviso", placaProvedor: "serviço de placa", placaApiUrl: "endereço da API de placa", placaApiHeader: "cabeçalho da API",
        placaApiToken: "chave da API de placa", placaCacheDias: "dias de cache da placa",
        verifWhatsUrl: "endereço de envio do WhatsApp", verifBearer: "Bearer Token do envio", verifDeviceToken: "DeviceToken do WhatsApp", verifMensagem: "mensagem do código",
        fotoIaAtivo: "IA das fotos ligada/desligada", plateRecToken: "token do Plate Recognizer", visionKey: "chave do Google Vision",
        margensAtivo: "regra de margem ligada/desligada", margemBase: "base da margem", margens: "tabela de margens",
        exigirTelefoneReserva: "exigir WhatsApp na reserva", exigirFacebookReserva: "exigir Facebook na reserva", fbAppId: "App ID do Facebook", fbAppSecret: "chave secreta do Facebook" };
      const mudou = Object.keys(m).filter(k => NOMES[k] && JSON.stringify(m[k]) !== JSON.stringify(atual[k]));
      await salvarConfig(m);
      if (mudou.length) await registrar(s, "Alterou configurações", mudou.map(k => NOMES[k]).join(", "));
      return json({ ok: true });
    }
  }

  /* ----- diagnóstico da API de placa (gasta 1 consulta, não usa cache) ----- */
  if (path === "/api/admin/placa-teste" && req.method === "POST") {
    if (!pode(s, "config")) return json({ erro: "Sem permissão." }, 403);
    const placa = String((await corpo(req))?.placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return json({ erro: "Digite uma placa válida para o teste." }, 400);
    const cfg = await getConfig();
    const r = await chamarApi(cfg, placa);
    const dados = r.bruto ? normalizar(r.bruto, placa) : null;
    await registrar(s, "Testou a API de placa", placa + (r.erro ? " (falhou)" : " (ok)"));
    return json({ ok: !r.erro && !!(dados?.marca || dados?.modelo), erro: r.erro || "", dados,
      tentativas: r.tentativas.map(({ json, ...t }) => t), configurado: { url: cfg.placaApiUrl, temToken: !!cfg.placaApiToken, cabecalho: cfg.placaApiHeader || "" } });
  }

  /* ----- teste de envio por WhatsApp ----- */
  if (path === "/api/admin/verif-teste" && req.method === "POST") {
    if (!pode(s, "config")) return json({ erro: "Sem permissão." }, 403);
    const fone = normFone((await corpo(req))?.whatsapp);
    if (!fone) return json({ erro: "Digite um WhatsApp com DDD para o teste." }, 400);
    const cfg = await getConfig();
    if (!whatsConfigurado(cfg)) return json({ erro: "Falta salvar o DeviceToken e o Bearer Token." }, 400);
    const r = await enviarWhats(cfg, fone, "Teste do Pátio Repasses: o envio de códigos por WhatsApp está funcionando.");
    await registrar(s, "Testou o envio por WhatsApp", fone.slice(-4) + (r.ok ? " (ok)" : " (falhou)"));
    return json({ ok: r.ok, status: r.status, corpo: r.corpo, msg: r.msg });
  }

  /* ----- histórico ----- */
  if (path === "/api/admin/log" && req.method === "GET") {
    if (!pode(s, "acessos")) return json({ erro: "Sem permissão." }, 403);
    const doc = await store("log").get("atividade", { type: "json" }) || { itens: [] };
    return json(doc.itens);
  }

  /* ----- equipe ----- */
  if (path.startsWith("/api/admin/usuarios")) {
    if (!pode(s, "acessos")) return json({ erro: "Você não tem permissão para gerenciar acessos." }, 403);
    const st = store("usuarios");
    const limparPerms = p => (Array.isArray(p) ? p : []).filter(x => PERMS.includes(x));

    if (req.method === "GET" && !id) {
      const us = await todos(st);
      return json(us.map(pub).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    }
    if (req.method === "POST" && !id) {
      const b = await corpo(req) || {};
      const nome = String(b.nome || "").trim().slice(0, 80);
      if (!nome) return json({ erro: "Digite o nome da pessoa." }, 400);
      const perms = limparPerms(b.perms);
      if (!perms.length) return json({ erro: "Marque pelo menos uma área que a pessoa pode acessar." }, 400);
      if (perms.includes("acessos") && !s.master) return json({ erro: "Só o master pode dar a permissão de Acessos." }, 403);
      let usuario = slug(b.usuario || nome.split(" ")[0]);
      if (!usuario) return json({ erro: "Escolha um usuário com letras ou números." }, 400);
      if (b.usuario && await usuarioEmUso(usuario)) return json({ erro: `O usuário "${usuario}" já existe.` }, 409);
      const base = usuario; let n = 2; while (await usuarioEmUso(usuario)) usuario = base + n++;
      const senha = gerarSenha();
      const u = { id: crypto.randomUUID(), nome, usuario, perms, ativo: true, senhaHash: hashSenha(senha), senhaVersao: 0, criadoEm: new Date().toISOString() };
      await st.setJSON(u.id, u);
      await registrar(s, "Criou acesso da equipe", `${nome} (${usuario})`);
      return json({ usuario: pub(u), senha }, 201);
    }
    if (!id) return json({ erro: "Pessoa não informada." }, 400);
    const atual = await st.get(id, { type: "json" });
    if (!atual) return json({ erro: "Pessoa não encontrada." }, 404);
    if (!s.master && (atual.perms || []).includes("acessos")) return json({ erro: "Só o master altera quem tem permissão de Acessos." }, 403);

    if (req.method === "POST" && path.endsWith("/senha")) {
      const senha = gerarSenha();
      await st.setJSON(id, { ...atual, senhaHash: hashSenha(senha), senhaVersao: (atual.senhaVersao || 0) + 1 });
      await registrar(s, "Gerou nova senha da equipe", atual.nome);
      return json({ senha });
    }
    if (req.method === "PUT") {
      const b = await corpo(req) || {};
      const novo = { ...atual, atualizadoEm: new Date().toISOString() };
      if ("nome" in b) { novo.nome = String(b.nome || "").trim().slice(0, 80); if (!novo.nome) return json({ erro: "Digite o nome." }, 400); }
      if ("perms" in b) {
        novo.perms = limparPerms(b.perms);
        if (!novo.perms.length) return json({ erro: "Marque pelo menos uma área." }, 400);
        if (novo.perms.includes("acessos") && !s.master) return json({ erro: "Só o master pode dar a permissão de Acessos." }, 403);
      }
      if ("ativo" in b) novo.ativo = !!b.ativo;
      if ("usuario" in b) {
        novo.usuario = slug(b.usuario);
        if (!novo.usuario) return json({ erro: "Usuário inválido." }, 400);
        if (await usuarioEmUso(novo.usuario, id)) return json({ erro: `O usuário "${novo.usuario}" já existe.` }, 409);
      }
      await st.setJSON(id, novo);
      await registrar(s, "ativo" in b && b.ativo !== atual.ativo ? (b.ativo ? "Reativou acesso" : "Desativou acesso") : "Editou acesso da equipe", novo.nome);
      return json(pub(novo));
    }
  }
  return json({ erro: "Não encontrado." }, 404);
};

export const config = { path: ["/api/admin/config", "/api/admin/log", "/api/admin/placa-teste", "/api/admin/verif-teste", "/api/admin/usuarios", "/api/admin/usuarios/:id", "/api/admin/usuarios/:id/senha"] };

function pub(u) { const { senhaHash, senhaVersao, ...r } = u; return r; }
