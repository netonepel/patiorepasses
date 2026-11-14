// Página de cada carro e de cada estado, prontas para o Google e para o WhatsApp.
//   GET /carro/:slug          ex.: /carro/volkswagen-gol-1-0-2019-2020-tubarao-sc-0c2a02a1
//   GET /repasses/:uf         pr, sc ou rs
import { vitrinePublica } from "./repasses.mjs";
import { getConfig } from "../lib/core.mjs";
import { ESTADOS, ufDe, idDoLink, cacheHtml, paginaCarro, paginaEstado, paginaSumiu, pctAbaixo, redesDe } from "../lib/seo.mjs";

export default async (req, context) => {
  const path = new URL(req.url).pathname;
  const [todos, cfg] = await Promise.all([vitrinePublica({ comVendidos: true }), getConfig()]), redes = redesDe(cfg);
  const ativos = todos.filter(i => i.status !== "vendido");

  if (path.startsWith("/repasses/")) {
    const est = ESTADOS[String(context.params?.uf || "").toLowerCase()];
    if (!est) return new Response(paginaSumiu(req, false, redes), { status: 404, headers: cacheHtml });
    const lista = ativos.filter(i => ufDe(i.cidade) === est.uf);
    return new Response(paginaEstado(req, est, lista, redes), { headers: cacheHtml });
  }

  const id = idDoLink(context.params?.slug);
  const i = id && todos.find(x => String(x.id).toLowerCase().startsWith(id));
  if (!i || i.status === "vendido") return new Response(paginaSumiu(req, !!i, redes), { status: i ? 410 : 404, headers: cacheHtml });
  // endereço antigo ou com texto diferente: manda para o endereço certo (o Google junta tudo num só)
  if (path !== i.link) return new Response(null, { status: 301, headers: { location: i.link, ...cacheHtml } });
  const uf = ufDe(i.cidade);
  const outros = ativos.filter(x => x.id !== i.id)
    .sort((a, b) => (ufDe(b.cidade) === uf) - (ufDe(a.cidade) === uf) || (pctAbaixo(b.preco, b.fipe) ?? -99) - (pctAbaixo(a.preco, a.fipe) ?? -99))
    .slice(0, 4);
  return new Response(paginaCarro(req, i, outros, redes), { headers: cacheHtml });
};

export const config = { path: ["/carro/:slug", "/repasses/:uf"] };
