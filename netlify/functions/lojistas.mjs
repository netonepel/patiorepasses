// Cadastro de lojistas — só o administrador.
//   GET  /api/lojistas                 lista (com quantos carros cada um tem)
//   POST /api/lojistas                 cria  { nome, responsavel, whatsapp, cidade, usuario? } -> { lojista, senha }
//   PUT  /api/lojistas/:id             edita { nome, responsavel, whatsapp, cidade, usuario, ativo }
//   POST /api/lojistas/:id/senha       gera senha nova -> { senha }   (derruba o login antigo)
import { store, todos, json, corpo, sessao, hashSenha, gerarSenha, lojistaPublico, slug } from "../lib/core.mjs";

export default async (req, context) => {
  const s = await sessao(req);
  if (!s || s.role !== "admin") return json({ erro: "Só o administrador pode gerenciar lojistas." }, 403);
  const st = store("lojistas");
  const id = context.params?.id;
  const path = new URL(req.url).pathname;

  if (req.method === "GET" && !id) {
    const [ls, rs] = await Promise.all([todos(st), todos(store("repasses"))]);
    const conta = {};
    for (const r of rs) if (r.status !== "vendido") conta[r.lojistaId] = (conta[r.lojistaId] || 0) + 1;
    return json(ls.map(l => ({ ...lojistaPublico(l), carros: conta[l.id] || 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
  }

  if (req.method === "POST" && !id) {
    const b = limpar(await corpo(req) || {});
    const erro = validar(b); if (erro) return json({ erro }, 400);
    const lista = await todos(st);
    let usuario = slug(b.usuario || b.nome);
    if (!usuario) return json({ erro: "Escolha um usuário com letras ou números." }, 400);
    if (usuario === "admin") usuario = "loja" + usuario;
    if (b.usuario && lista.some(l => l.usuario === usuario)) return json({ erro: `O usuário "${usuario}" já existe.` }, 409);
    let base = usuario, n = 2; while (lista.some(l => l.usuario === usuario)) usuario = base + n++;
    const senha = gerarSenha();
    const l = { id: crypto.randomUUID(), ...b, usuario, ativo: true, senhaHash: hashSenha(senha), senhaVersao: 0, criadoEm: new Date().toISOString() };
    await st.setJSON(l.id, l);
    return json({ lojista: lojistaPublico(l), senha }, 201);
  }

  if (!id) return json({ erro: "Lojista não informado." }, 400);
  const atual = await st.get(id, { type: "json" });
  if (!atual) return json({ erro: "Lojista não encontrado." }, 404);

  if (req.method === "POST" && path.endsWith("/senha")) {
    const senha = gerarSenha();
    await st.setJSON(id, { ...atual, senhaHash: hashSenha(senha), senhaVersao: (atual.senhaVersao || 0) + 1 });
    return json({ senha });
  }

  if (req.method === "PUT") {
    const b = await corpo(req) || {};
    const novo = { ...atual, ...limpar(b, true), atualizadoEm: new Date().toISOString() };
    if ("ativo" in b) novo.ativo = !!b.ativo;
    if ("usuario" in b) {
      novo.usuario = slug(b.usuario);
      if (!novo.usuario || novo.usuario === "admin") return json({ erro: "Usuário inválido." }, 400);
      if ((await todos(st)).some(l => l.id !== id && l.usuario === novo.usuario)) return json({ erro: `O usuário "${novo.usuario}" já existe.` }, 409);
    }
    const erro = validar(novo); if (erro) return json({ erro }, 400);
    await st.setJSON(id, novo);
    return json(lojistaPublico(novo));
  }
  return json({ erro: "Método não suportado." }, 405);
};

export const config = { path: ["/api/lojistas", "/api/lojistas/:id", "/api/lojistas/:id/senha"] };

const CAMPOS = ["nome", "responsavel", "whatsapp", "cidade", "cnpj", "obs"];
function limpar(b, parcial = false) {
  const o = {};
  for (const c of CAMPOS) {
    if (!(c in b)) { if (!parcial) o[c] = ""; continue; }
    o[c] = String(b[c] ?? "").trim().slice(0, c === "obs" ? 500 : 120);
  }
  if (!parcial) o.usuario = String(b.usuario || "");
  return o;
}
function validar(l) {
  const falta = [];
  if (!l.nome) falta.push("nome da loja"); if (!l.whatsapp) falta.push("WhatsApp"); if (!l.cidade) falta.push("cidade");
  if (falta.length) return "Preencha: " + falta.join(", ") + ".";
}
