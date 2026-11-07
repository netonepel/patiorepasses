// POST /api/login        { usuario, senha }  -> { token, role, master, perms, loja }
// GET  /api/me           -> { role, master, perms, nome, loja }
// PUT  /api/me/senha     { atual, nova }     (cada um troca a própria senha, inclusive o master)
// GET  /api/config       configuração pública (contato, Pix, comissão, aviso)
import { store, todos, json, corpo, confereSenha, iguais, hashSenha, criarToken, sessao, lojistaPublico,
  taxaAgora, getConfig, salvarConfig, registrar, PERMS } from "../lib/core.mjs";

export default async (req) => {
  const path = new URL(req.url).pathname;

  if (path === "/api/config") {
    const c = await getConfig();
    return json({
      contatoWhatsapp: c.contatoWhatsapp, grupoWhatsapp: c.grupoWhatsapp, pixChave: c.pixChave, pixNome: c.pixNome,
      taxa: await taxaAgora(c),
      aviso: { ativo: c.avisoAtivo !== false, titulo: c.avisoTitulo, texto: c.avisoTexto, versao: c.avisoVersao || 1 },
    });
  }

  if (path === "/api/login" && req.method === "POST") {
    const b = await corpo(req);
    const usuario = String(b?.usuario || "").trim().toLowerCase(), senha = String(b?.senha || "");
    if (!usuario || !senha) return json({ erro: "Digite usuário e senha." }, 400);

    if (usuario === "admin") {
      let cfg = await getConfig();
      // Recuperação: com ADMIN_RESET=1 no Netlify, a senha do Netlify (ADMIN_PASSWORD) volta a valer.
      const reset = process.env.ADMIN_RESET === "1" && !!process.env.ADMIN_PASSWORD;
      const certo = reset ? iguais(senha, process.env.ADMIN_PASSWORD)
        : cfg.masterHash ? confereSenha(senha, cfg.masterHash)
        : !!process.env.ADMIN_PASSWORD && iguais(senha, process.env.ADMIN_PASSWORD);
      if (!certo) { await espera(); return json({ erro: "Usuário ou senha incorretos." }, 401); }
      if (reset && cfg.masterHash) { // apaga a senha esquecida e derruba logins antigos
        cfg = await salvarConfig({ masterHash: "", masterVersao: (cfg.masterVersao || 0) + 1 });
        await registrar("Administrador", "Recuperou o acesso master pelo Netlify");
      }
      await registrar("Administrador", "Entrou no painel");
      return json({ token: criarToken({ role: "admin", v: cfg.masterVersao || 0 }), role: "admin", master: true, perms: PERMS, nome: "Administrador" });
    }

    const [ls, us] = await Promise.all([todos(store("lojistas")), todos(store("usuarios"))]);
    const l = ls.find(x => x.usuario === usuario);
    if (l && confereSenha(senha, l.senhaHash)) {
      if (!l.ativo) return json({ erro: "Seu acesso está desativado. Fale com o Pátio Repasses." }, 403);
      await registrar(l.nome, "Lojista entrou");
      return json({ token: criarToken({ role: "lojista", sub: l.id, v: l.senhaVersao || 0 }), role: "lojista", loja: lojistaPublico(l), nome: l.nome });
    }
    const u = us.find(x => x.usuario === usuario);
    if (u && confereSenha(senha, u.senhaHash)) {
      if (!u.ativo) return json({ erro: "Seu acesso está desativado. Fale com o administrador." }, 403);
      await registrar(u.nome, "Entrou no painel (equipe)");
      return json({ token: criarToken({ role: "equipe", sub: u.id, v: u.senhaVersao || 0 }), role: "admin", master: false, perms: u.perms || [], nome: u.nome });
    }
    await espera(); return json({ erro: "Usuário ou senha incorretos." }, 401);
  }

  const s = await sessao(req);
  if (!s) return json({ erro: "Sessão expirada. Entre de novo." }, 401);

  if (path === "/api/me" && req.method === "GET") {
    return json({ role: s.role, master: !!s.master, perms: s.perms || [], nome: s.nome, loja: lojistaPublico(s.lojista) });
  }

  if (path === "/api/me/senha" && req.method === "PUT") {
    const b = await corpo(req) || {};
    const nova = String(b.nova || "");
    if (nova.length < 6) return json({ erro: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);

    if (s.master) {
      const cfg = await getConfig();
      const certo = cfg.masterHash ? confereSenha(b.atual || "", cfg.masterHash)
        : iguais(String(b.atual || ""), process.env.ADMIN_PASSWORD || "");
      if (!certo) return json({ erro: "A senha atual está errada." }, 400);
      const v = (cfg.masterVersao || 0) + 1;
      await salvarConfig({ masterHash: hashSenha(nova), masterVersao: v });
      await registrar(s, "Trocou a senha master");
      return json({ ok: true, token: criarToken({ role: "admin", v }) });
    }
    const conta = s.usuario || s.lojista, nomeStore = s.usuario ? "usuarios" : "lojistas";
    if (!confereSenha(b.atual || "", conta.senhaHash)) return json({ erro: "A senha atual está errada." }, 400);
    const novo = { ...conta, senhaHash: hashSenha(nova), senhaVersao: (conta.senhaVersao || 0) + 1 };
    await store(nomeStore).setJSON(novo.id, novo);
    await registrar(s, "Trocou a própria senha");
    return json({ ok: true, token: criarToken({ role: s.usuario ? "equipe" : "lojista", sub: novo.id, v: novo.senhaVersao }) });
  }
  return json({ erro: "Não encontrado." }, 404);
};

const espera = () => new Promise(r => setTimeout(r, 600)); // atrasa tentativas erradas

export const config = { path: ["/api/login", "/api/me", "/api/me/senha", "/api/config"] };
