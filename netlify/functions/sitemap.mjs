// /sitemap.xml gerado na hora: início, estados e todos os carros disponíveis.
import { vitrinePublica } from "./repasses.mjs";
import { base, esc } from "../lib/seo.mjs";

export default async (req) => {
  const b = base(req), hoje = new Date().toISOString().slice(0, 10);
  const carros = (await vitrinePublica()).map(i => [b + i.link, String(i.atualizadoEm || i.criadoEm || hoje).slice(0, 10), "0.8"]);
  const urls = [[b + "/", hoje, "1.0"], ...["pr", "sc", "rs"].map(u => [`${b}/repasses/${u}`, hoje, "0.9"]), ...carros, [b + "/privacidade.html", "2026-11-07", "0.2"]];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d, p]) => `  <url><loc>${esc(u)}</loc><lastmod>${d}</lastmod><priority>${p}</priority></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, durable, s-maxage=3600, stale-while-revalidate=86400" } });
};

export const config = { path: "/sitemap.xml" };
