// POST /api/login        { usuario, senha }  -> { token, role, loja }
// GET  /api/me           -> { role, loja }
// PUT  /api/me/senha     { atual, nova }     (lojista troca a própria senha)
// GET  /api/config       -> { contatoWhatsapp }  (público)
import { store, todos, json, corpo, confereSenha, iguais, hashSenha, criarToken, sessao, lojistaPublico } from "../lib/core.mjs";

export default async (req) => {
  const path = new URL(req.url).pathname;

  if (path === "/api/config") {
    return json({ contatoWhatsapp: process.env.CONTATO_WHATSAPP || "" });
  }

  if (path === "/api/login" && req.method === "POST") {
    const b = await corpo(req);
    const usuario = String(b?.usuario || "").trim().toLowerCase(), senha = String(b?.senha || "");
    if (!usuario || !senha) return json({ erro: "Digite usuário e senha." }, 400);

    if (usuario === "admin") {
      if (process.env.ADMIN_PASSWORD && iguais(senha, process.env.ADMIN_PASSWORD))
        return json({ token: criarToken({ role: "admin" }), role: "admin", loja: null });
      await espera(); return json({ erro: "Usuário ou senha incorretos." }, 401);
    }
    const l = (await todos(store("lojistas"))).find(x => x.usuario === usuario);
    if (!l || !confereSenha(senha, l.senhaHash)) { await espera(); return json({ erro: "Usuário ou senha incorretos." }, 401); }
    if (!l.ativo) return json({ erro: "Seu acesso está desativado. Fale com o Pátio Repasses." }, 403);
    return json({ token: criarToken({ role: "lojista", sub: l.id, v: l.senhaVersao || 0 }), role: "lojista", loja: lojistaPublico(l) });
  }

  const s = await sessao(req);
  if (!s) return json({ erro: "Sessão expirada. Entre de novo." }, 401);

  if (path === "/api/me" && req.method === "GET") {
    return json({ role: s.role, loja: lojistaPublico(s.lojista) });
  }

  if (path === "/api/me/senha" && req.method === "PUT") {
    if (s.role !== "lojista") return json({ erro: "A senha do administrador é trocada na variável ADMIN_PASSWORD do Netlify." }, 400);
    const b = await corpo(req);
    if (!confereSenha(b?.atual || "", s.lojista.senhaHash)) return json({ erro: "A senha atual está errada." }, 400);
    const nova = String(b?.nova || "");
    if (nova.length < 6) return json({ erro: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
    const l = { ...s.lojista, senhaHash: hashSenha(nova), senhaVersao: (s.lojista.senhaVersao || 0) + 1 };
    await store("lojistas").setJSON(l.id, l);
    return json({ ok: true, token: criarToken({ role: "lojista", sub: l.id, v: l.senhaVersao }) });
  }
  return json({ erro: "Não encontrado." }, 404);
};

const espera = () => new Promise(r => setTimeout(r, 600)); // atrasa tentativas erradas

export const config = { path: ["/api/login", "/api/me", "/api/me/senha", "/api/config"] };
