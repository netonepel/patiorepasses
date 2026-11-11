// Cópias de segurança — só o administrador master.
//   GET  /api/admin/backup               baixa uma cópia de agora
//   GET  /api/admin/backups              lista as cópias automáticas guardadas no Netlify
//   GET  /api/admin/backups/:id          baixa uma cópia guardada
//   POST /api/admin/backup/restaurar     { copia }  restaura (antes guarda uma cópia do estado atual)
import { store, json, corpo, sessao, registrar } from "../lib/core.mjs";
import { gerarCopia, guardarCopia, restaurar } from "../lib/backup.mjs";

export default async (req, context) => {
  const s = await sessao(req);
  if (!s?.master) return json({ erro: "Só o administrador master mexe nas cópias de segurança." }, 403);
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const id = context.params?.id;
  const baixar = (obj, nome) => new Response(JSON.stringify(obj), { headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-disposition": `attachment; filename="${nome}"` } });

  if (path === "/api/admin/backup" && req.method === "GET") {
    const c = await gerarCopia();
    await registrar(s, "Baixou cópia de segurança");
    return baixar(c, `patio-repasses-backup-${c.em.slice(0, 10)}.json`);
  }
  if (path === "/api/admin/backups" && req.method === "GET") {
    const st = store("backups"), { blobs } = await st.list();
    const lista = [];
    for (const b of blobs) { const c = await st.get(b.key, { type: "json" }).catch(() => null); if (c) lista.push({ id: b.key, em: c.em, contagem: c.contagem }); }
    return json(lista.sort((a, b) => String(b.em).localeCompare(String(a.em))));
  }
  if (path.startsWith("/api/admin/backups/") && id && req.method === "GET") {
    if (!/^(dia|antes)-[\w-]+$/.test(id)) return json({ erro: "Cópia inválida." }, 400);
    const c = await store("backups").get(id, { type: "json" });
    if (!c) return json({ erro: "Cópia não encontrada." }, 404);
    return baixar(c, `patio-repasses-${id}.json`);
  }
  if (path === "/api/admin/backup/restaurar" && req.method === "POST") {
    const b = await corpo(req);
    if (!b?.copia) return json({ erro: "Escolha o arquivo da cópia." }, 400);
    const antes = await guardarCopia("antes"); // segurança: dá para voltar atrás
    try {
      const r = await restaurar(b.copia);
      await registrar(s, "Restaurou cópia de segurança", `de ${String(b.copia.em || "").slice(0, 10)} · ${r.repasses} carros, ${r.lojistas} lojistas`);
      return json({ ok: true, restaurados: r, copiaAntes: antes.chave });
    } catch (e) { return json({ erro: e.message }, 400); }
  }
  return json({ erro: "Não encontrado." }, 404);
};

export const config = { path: ["/api/admin/backup", "/api/admin/backups", "/api/admin/backups/:id", "/api/admin/backup/restaurar"] };
