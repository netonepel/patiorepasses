// Cadastro de lojistas — só o administrador.
//   GET  /api/lojistas                 lista (com quantos carros cada um tem)
//   POST /api/lojistas                 cria  { nome, responsavel, whatsapp, cidade, usuario? } -> { lojista, senha }
//   PUT  /api/lojistas/:id             edita { nome, responsavel, whatsapp, cidade, usuario, ativo }
//   POST /api/lojistas/:id/senha       gera senha nova -> { senha }   (derruba o login antigo)
import { store, todos, json, corpo, sessao, hashSenha, gerarSenha, lojistaPublico, slug, pode, usuarioEmUso, registrar } from "../lib/core.mjs";

export default async (req, context) => {
  const s = await sessao(req);
  const st = store("lojistas");
  const id = context.params?.id;
  const path = new URL(req.url).pathname;
  // quem cuida de repasses precisa da lista de lojas para escolher a dona do carro
  const soLista = req.method === "GET" && !id && pode(s, "repasses");
  if (!pode(s, "lojistas") && !soLista) return json({ erro: "Você não tem permissão para gerenciar lojistas." }, 403);

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
    let usuario = slug(b.usuario || b.nome);
    if (!usuario) return json({ erro: "Escolha um usuário com letras ou números." }, 400);
    if (usuario === "admin") usuario = "loja" + usuario;
    if (b.usuario && await usuarioEmUso(usuario)) return json({ erro: `O usuário "${usuario}" já existe.` }, 409);
    let base = usuario, n = 2; while (await usuarioEmUso(usuario)) usuario = base + n++;
    const senha = gerarSenha();
    const l = { id: crypto.randomUUID(), ...b, usuario, ativo: true, senhaHash: hashSenha(senha), senhaVersao: 0, criadoEm: new Date().toISOString() };
    await st.setJSON(l.id, l);
    await registrar(s, "Cadastrou lojista", `${l.nome} (${l.usuario})`);
    return json({ lojista: lojistaPublico(l), senha }, 201);
  }

  if (!id) return json({ erro: "Lojista não informado." }, 400);
  const atual = await st.get(id, { type: "json" });
  if (!atual) return json({ erro: "Lojista não encontrado." }, 404);

  if (req.method === "POST" && path.endsWith("/senha")) {
    const senha = gerarSenha();
    await st.setJSON(id, { ...atual, senhaHash: hashSenha(senha), senhaVersao: (atual.senhaVersao || 0) + 1 });
    await registrar(s, "Gerou nova senha de lojista", atual.nome);
    return json({ senha });
  }

  if (req.method === "PUT") {
    const b = await corpo(req) || {};
    const novo = { ...atual, ...limpar(b, true), atualizadoEm: new Date().toISOString() };
    if ("ativo" in b) novo.ativo = !!b.ativo;
    if ("whatsapp" in b && String(b.whatsapp).replace(/\D/g, "") !== String(atual.whatsapp || "").replace(/\D/g, "")) { delete novo.telefoneVerificado; delete novo.telefoneVerificadoEm; }
    if (b.removerFacebook === true) delete novo.facebook;
    if ("usuario" in b) {
      novo.usuario = slug(b.usuario);
      if (!novo.usuario || novo.usuario === "admin") return json({ erro: "Usuário inválido." }, 400);
      if (await usuarioEmUso(novo.usuario, id)) return json({ erro: `O usuário "${novo.usuario}" já existe.` }, 409);
    }
    const erro = validar(novo); if (erro) return json({ erro }, 400);
    await st.setJSON(id, novo);
    await registrar(s, "ativo" in b && !!b.ativo !== atual.ativo ? (b.ativo ? "Reativou lojista" : "Desativou lojista") : "Editou lojista", novo.nome);
    return json(lojistaPublico(novo));
  }
  return json({ erro: "Método não suportado." }, 405);
};

export const config = { path: ["/api/lojistas", "/api/lojistas/:id", "/api/lojistas/:id/senha"] };

const CAMPOS = ["nome", "responsavel", "whatsapp", "cidade", "cnpj", "obs", "modalidade"];
const MODALIDADES = ["lojista", "repassador_pj", "repassador_pf"];
function limpar(b, parcial = false) {
  const o = {};
  for (const c of CAMPOS) {
    if (!(c in b)) { if (!parcial) o[c] = ""; continue; }
    o[c] = String(b[c] ?? "").trim().slice(0, c === "obs" ? 500 : 120);
  }
  if (!parcial) o.usuario = String(b.usuario || "");
  if ("modalidade" in o && !MODALIDADES.includes(o.modalidade)) o.modalidade = parcial ? undefined : "lojista";
  if (o.modalidade === undefined) delete o.modalidade;
  return o;
}
function validar(l) {
  const falta = [];
  if (!l.nome) falta.push("nome da loja"); if (!l.whatsapp) falta.push("WhatsApp"); if (!l.cidade) falta.push("cidade");
  if (falta.length) return "Preencha: " + falta.join(", ") + ".";
}
