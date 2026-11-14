// Páginas para o Google e para o WhatsApp: cada carro, cada estado e o sitemap.
// O HTML sai pronto do servidor (o Google lê sem precisar rodar JavaScript)
// e fica guardado na CDN do Netlify por alguns minutos para não gastar créditos.

export const ESTADOS = {
  pr: { uf: "PR", nome: "Paraná", em: "no Paraná", cidades: "Curitiba, Londrina, Maringá, Ponta Grossa, Cascavel" },
  sc: { uf: "SC", nome: "Santa Catarina", em: "em Santa Catarina", cidades: "Florianópolis, Joinville, Blumenau, Criciúma, Tubarão" },
  rs: { uf: "RS", nome: "Rio Grande do Sul", em: "no Rio Grande do Sul", cidades: "Porto Alegre, Caxias do Sul, Pelotas, Santa Maria, Passo Fundo" },
};

export const ufDe = c => (String(c || "").toUpperCase().match(/\b(PR|SC|RS)\b/) || [])[1] || "";
const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const hifen = s => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Endereço público do carro: /carro/volkswagen-gol-1-0-2019-2020-tubarao-sc-0c2a02a1 */
export function linkCarro(r, cidade) {
  const txt = hifen([r.marca, r.modelo, r.versao, r.ano, cidade ?? r.cidade].filter(Boolean).join(" ")).slice(0, 90).replace(/-+$/, "");
  return `/carro/${txt}-${String(r.id).slice(0, 8)}`;
}
export const idDoLink = s => (String(s || "").match(/([0-9a-f]{8})$/i) || [])[1]?.toLowerCase() || "";

export const base = req => (process.env.URL || new URL(req.url).origin).replace(/\/+$/, "");
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const brl = n => n == null ? "" : "R$ " + Math.round(n).toLocaleString("pt-BR");
export const pctAbaixo = (preco, fipe) => preco && fipe ? (1 - preco / fipe) * 100 : null;
const pct = p => p.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

const CAUT = { aprovada: ["Cautelar aprovada", "ok"], apontamento: ["Cautelar c/ apontamento", "warn"], reprovada: ["Cautelar reprovada", "bad"], nao: ["Sem cautelar", ""] };
export function chips(i) {
  const c = [];
  if (i.chaveCopia === "sim") c.push(["Chave cópia", "ok"]); else if (i.chaveCopia === "nao") c.push(["Sem chave cópia", ""]);
  if (i.manual === "sim") c.push(["Manual", "ok"]); else if (i.manual === "nao") c.push(["Sem manual", ""]);
  if (CAUT[i.cautelar]) c.push(CAUT[i.cautelar]);
  if (i.leilao === "nao") c.push(["Sem leilão", "ok"]); else if (i.leilao === "sim") c.push(["Passagem por leilão", "warn"]);
  if (i.sinistro === "nao") c.push(["Sem sinistro", "ok"]); else if (i.sinistro === "pequena") c.push(["Sinistro pequena monta", "warn"]); else if (i.sinistro === "media") c.push(["Sinistro média monta", "bad"]);
  return c;
}

/** Redes sociais cadastradas em Configurações. */
export const redesDe = c => [["Instagram", c.instagramUrl], ["Facebook", c.facebookUrl], ["TikTok", c.tiktokUrl]].filter(([, u]) => /^https:\/\//.test(u || "")).map(([nome, url]) => ({ nome, url }));

export const tituloCarro = i => [i.marca, i.modelo, i.versao, i.ano].filter(Boolean).join(" ");

/** Cabeçalhos: navegador sempre confere; a CDN do Netlify guarda 5 min e serve a versão antiga enquanto atualiza. */
export const cacheHtml = { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate",
  "netlify-cdn-cache-control": "public, durable, s-maxage=300, stale-while-revalidate=3600" };

const FONTE = "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,600;0,700;0,800;1,800&display=swap";
const CSS = `
:root{--black:#111;--yellow:#ffc600;--bg:#f2f2f0;--white:#fff;--ink:#161616;--muted:#5f5f5a;--line:#e0dfda;--ok:#1b7a44;--ok-bg:#e2f2e8;--warn:#955a00;--warn-bg:#fcefd3;--bad:#b3261e;--bad-bg:#fbe4e2;--font:"Poppins",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:var(--font);background:var(--bg);color:var(--ink);line-height:1.5}
a{color:inherit}img{max-width:100%;display:block}
:focus-visible{outline:3px solid #111;outline-offset:2px;box-shadow:0 0 0 6px var(--yellow)}
.wrap{width:min(1120px,100%);margin:0 auto;padding:0 16px}
nav{background:var(--black);position:sticky;top:0;z-index:5}
nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px}
.logo{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:800;font-style:italic;font-size:19px}
.logo b{color:var(--yellow)}.logo img{width:40px;height:40px}
.nl{display:flex;gap:16px;align-items:center}.nl a{color:#e8e7e2;text-decoration:none;font-size:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 18px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}
.btn-y{background:var(--yellow);color:#111}.btn-d{background:#111;color:#fff}.btn-l{background:#fff;color:#111;border:1.5px solid #cfcec8}
.nl .btn{min-height:40px;padding:8px 14px}.nl .btn-y{color:#111}
@media (max-width:640px){.nl .hide{display:none}}
.crumb{font-size:13px;color:var(--muted);margin:18px 0 10px}.crumb a{color:var(--muted)}
h1{font-size:clamp(24px,4vw,34px);line-height:1.15;margin:0 0 6px;font-weight:800}
h2{font-size:21px;margin:0 0 12px;font-weight:800}
.ficha{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:24px;align-items:start;margin-bottom:28px}
@media (max-width:860px){.ficha{grid-template-columns:minmax(0,1fr)}}
.fotos{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:12px;background:#ddd}
.fotos img{flex:none;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;scroll-snap-align:start}
.semfoto{aspect-ratio:4/3;display:grid;place-items:center;background:#e7e6e2;color:#4f4f4a;border-radius:12px;font-weight:600}
.barra{display:none}
@media (max-width:860px){.semfoto{aspect-ratio:16/7}
  .barra{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:6;background:#111;color:#fff;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));gap:12px;align-items:center;justify-content:space-between;box-shadow:0 -6px 20px rgba(0,0,0,.25)}
  .barra b{font-size:19px;display:block;line-height:1.1}.barra small{color:#bdbcb5;font-size:12px}
  body.tem-barra footer{padding-bottom:96px}}
.dica{font-size:12.5px;color:var(--muted);margin:6px 0 0}
.box{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px}
.preco{font-size:34px;font-weight:800;line-height:1.1;margin:10px 0 2px}
.fipe{color:var(--muted);font-size:14.5px}.fipe b{color:var(--ok)}
.tag{display:inline-block;background:#111;color:var(--yellow);font-weight:800;font-size:13px;padding:4px 10px;border-radius:5px}
.tag.res{background:var(--warn-bg);color:var(--warn)}
.specs{display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--muted);font-size:14.5px;margin:4px 0 12px}
.specs span{white-space:nowrap}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.chip{font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:5px;background:#ecebe7;color:#3d3d39}
.chip.ok{background:var(--ok-bg);color:var(--ok)}.chip.warn{background:var(--warn-bg);color:var(--warn)}.chip.bad{background:var(--bad-bg);color:var(--bad)}
.loja{border-top:1px solid var(--line);padding-top:12px;margin-top:12px;font-size:14.5px}
.acoes{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.sinal{font-size:13.5px;color:var(--muted);margin:8px 0 0}
.obs{white-space:pre-line;font-size:15px}
.passos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 28px;padding:0;list-style:none;counter-reset:p}
@media (max-width:760px){.passos{grid-template-columns:minmax(0,1fr)}}
.passos li{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;font-size:14.5px;counter-increment:p}
.passos li::before{content:counter(p);display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--yellow);font-weight:800;margin-bottom:6px}
.passos b{display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-bottom:28px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column}
.card:hover{border-color:#bdbcb5}
.card .im{aspect-ratio:4/3;background:#e7e6e2;display:grid;place-items:center;color:#4f4f4a;font-size:13px;position:relative}
.card .im img{width:100%;height:100%;object-fit:cover}
.card .im .tag{position:absolute;top:8px;left:8px}
.card .bd{padding:12px 14px 14px}
.card h3{margin:0;font-size:16px;line-height:1.25}.card small{display:block;color:var(--muted);font-weight:400;font-size:13px}
.card .p{font-size:20px;font-weight:800;margin-top:6px}.card .f{font-size:13px;color:var(--muted)}
.card .c{font-size:13px;color:var(--muted);margin-top:4px}
.intro{max-width:70ch;color:#33332f;margin:0 0 20px}
.faq details{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin-bottom:8px}
.faq summary{font-weight:700;cursor:pointer}
.vazio{background:#fff;border:1px dashed #cfcec8;border-radius:12px;padding:28px;text-align:center}
footer{background:#111;color:#bdbcb5;font-size:13.5px;padding:28px 0;margin-top:20px}
footer a{color:#e8e7e2;text-decoration:none;display:inline-block;padding:6px 0;margin-right:16px}
footer .cred b{color:var(--yellow)}
`;

const pagina = ({ titulo, desc, canon, img, jsonld = [], corpo, noindex = false, redes = [] }) => `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canon)}">`}
<meta name="theme-color" content="#111111">
<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="Pátio Repasses">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canon)}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTE}">
<style>${CSS}</style>
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head><body${corpo.includes('class="barra"') ? ' class="tem-barra"' : ""}>
<nav><div class="wrap"><a class="logo" href="/"><img src="/logo-sm.png" alt="" width="40" height="40"><span>Pátio <b>Repasses</b></span></a>
<div class="nl"><a class="hide" href="/#vitrine">Todos os repasses</a><a class="hide" href="/#lojistas">Para lojistas</a><a class="btn btn-y" href="/#anunciar">Anunciar</a></div></div></nav>
<main class="wrap">${corpo}</main>
<footer><div class="wrap">
<div><a href="/">Início</a><a href="/repasses/pr">Repasses no Paraná</a><a href="/repasses/sc">Repasses em Santa Catarina</a><a href="/repasses/rs">Repasses no Rio Grande do Sul</a><a href="/privacidade.html">Privacidade</a></div>
${redes.length ? `<div>${redes.map(r => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nome)}</a>`).join("")}</div>` : ""}
<p>Os preços e informações dos veículos são de responsabilidade de cada loja anunciante. O sinal pago ao Pátio Repasses é a comissão pela intermediação.</p>
<p class="cred">Site desenvolvido por <b>Neto Marketing Automotivo</b></p>
</div></footer>
</body></html>`;

export function cardHtml(i) {
  const p = pctAbaixo(i.preco, i.fipe);
  const tag = i.status === "reservado" ? '<span class="tag res">Reservado</span>' : p > 0 ? `<span class="tag">${pct(p)} abaixo da FIPE</span>` : "";
  return `<a class="card" href="${esc(i.link)}">
  <div class="im">${i.fotos?.length ? `<img src="/api/fotos/${esc(i.fotos[0])}?t=1" alt="${esc(tituloCarro(i))}" loading="lazy" width="560" height="420">` : "Sem foto"}${tag}</div>
  <div class="bd"><h3>${esc(i.marca)} ${esc(i.modelo)}${i.versao ? `<small>${esc(i.versao)}</small>` : ""}</h3>
  <div class="p">${brl(i.preco)}</div>${i.fipe ? `<div class="f">FIPE ${brl(i.fipe)}</div>` : ""}
  <div class="c">${esc([i.ano, i.km != null ? i.km.toLocaleString("pt-BR") + " km" : "", i.cidade].filter(Boolean).join(" · "))}</div></div></a>`;
}

const ORG = (b, redes = []) => ({ "@type": "Organization", name: "Pátio Repasses", url: b + "/", logo: b + "/logo.png", ...(redes.length ? { sameAs: redes.map(r => r.url) } : {}) });

export function paginaCarro(req, i, outros, redes = []) {
  const b = base(req), canon = b + i.link, nome = tituloCarro(i), p = pctAbaixo(i.preco, i.fipe);
  const est = ESTADOS[ufDe(i.cidade).toLowerCase()];
  const titulo = `${nome} repasse${i.cidade ? " em " + i.cidade : ""} | ${brl(i.preco)}${p > 0 ? ` (${pct(p)} abaixo da FIPE)` : ""}`;
  const desc = `${nome}${i.km != null ? ", " + i.km.toLocaleString("pt-BR") + " km" : ""}, ${brl(i.preco)}${i.fipe ? `, FIPE ${brl(i.fipe)}` : ""}. Carro de repasse${i.cidade ? " em " + i.cidade : ""}, anunciado por loja parceira. Reserve com sinal pelo Pátio Repasses.`;
  const img = i.fotos?.length ? `${b}/api/fotos/${i.fotos[0]}` : b + "/og.jpg";
  const share = `https://wa.me/?text=${encodeURIComponent(`${nome} por ${brl(i.preco)}${p > 0 ? ` (${pct(p)} abaixo da FIPE)` : ""} no Pátio Repasses: ${canon}`)}`;
  const reservado = i.status === "reservado";
  const jsonld = [
    { "@context": "https://schema.org", "@type": "Car", name: nome, brand: { "@type": "Brand", name: i.marca }, model: i.modelo,
      ...(i.versao ? { vehicleConfiguration: i.versao } : {}), ...(i.ano ? { vehicleModelDate: String(i.ano).split("/").pop() } : {}),
      ...(i.km != null ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: i.km, unitCode: "KMT" } } : {}),
      ...(i.cor ? { color: i.cor } : {}), ...(i.cambio ? { vehicleTransmission: i.cambio } : {}), ...(i.combustivel ? { fuelType: i.combustivel } : {}),
      itemCondition: "https://schema.org/UsedCondition", image: (i.fotos || []).map(f => `${b}/api/fotos/${f}`), url: canon, description: desc,
      offers: { "@type": "Offer", price: i.preco, priceCurrency: "BRL", url: canon, itemCondition: "https://schema.org/UsedCondition",
        availability: reservado ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
        ...(i.cidade ? { availableAtOrFrom: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: i.cidade.split("/")[0], addressRegion: ufDe(i.cidade), addressCountry: "BR" } } } : {}),
        seller: ORG(b, redes) } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: b + "/" },
      ...(est ? [{ "@type": "ListItem", position: 2, name: "Repasses " + est.em, item: `${b}/repasses/${est.uf.toLowerCase()}` }] : []),
      { "@type": "ListItem", position: est ? 3 : 2, name: nome, item: canon }] },
  ];
  const ch = chips(i);
  const corpo = `
<div class="crumb"><a href="/">Início</a> › ${est ? `<a href="/repasses/${est.uf.toLowerCase()}">Repasses ${est.em}</a> › ` : ""}${esc(i.marca)} ${esc(i.modelo)}</div>
<div class="ficha">
  <div>${i.fotos?.length ? `<div class="fotos" tabindex="0" aria-label="Fotos do carro">${i.fotos.map((f, k) => `<img src="/api/fotos/${esc(f)}" alt="${esc(nome)}, foto ${k + 1}" ${k ? 'loading="lazy"' : 'fetchpriority="high"'} width="1600" height="1200">`).join("")}</div>${i.fotos.length > 1 ? `<p class="dica">${i.fotos.length} fotos. Arraste para o lado para ver todas.</p>` : ""}` : '<div class="semfoto">Sem foto</div>'}</div>
  <div class="box">
    ${reservado ? '<span class="tag res">Reservado</span>' : p > 0 ? `<span class="tag">${pct(p)} abaixo da FIPE</span>` : ""}
    <h1>${esc(i.marca)} ${esc(i.modelo)}${i.versao ? " " + esc(i.versao) : ""}${i.ano ? ` <span style="font-weight:600;color:#5f5f5a">${esc(i.ano)}</span>` : ""}</h1>
    <div class="specs">${[i.km != null ? i.km.toLocaleString("pt-BR") + " km" : "", i.cambio, i.combustivel, i.cor, i.placaMasc ? "Placa " + i.placaMasc : ""].filter(Boolean).map(s => `<span>${esc(s)}</span>`).join("")}</div>
    <div class="preco">${brl(i.preco)}</div>
    ${i.fipe ? `<div class="fipe">Tabela FIPE ${brl(i.fipe)}${p > 0 ? ` · <b>${pct(p)} abaixo</b>` : ""}</div>` : ""}
    ${ch.length ? `<div class="chips">${ch.map(([t, k]) => `<span class="chip ${k}">${esc(t)}</span>`).join("")}</div>` : ""}
    <div class="loja"><b>Loja parceira</b>${i.cidade ? " · " + esc(i.cidade) : ""}</div>
    <div class="acoes">
      ${reservado ? '<span class="btn btn-l" aria-disabled="true">Já reservado</span>' : `<a class="btn btn-y" href="/#reservar=${esc(i.id)}">Reservar com sinal</a>`}
      <a class="btn btn-d" href="${esc(share)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a>
    </div>
    ${reservado ? "" : `<p class="sinal">O sinal de ${brl(i.comissao)} é pago ao Pátio e já está incluído no preço. O restante você acerta direto com a loja.</p>`}
  </div>
</div>
${i.obs ? `<section class="box" style="margin-bottom:28px"><h2>Observações da loja</h2><div class="obs">${esc(i.obs)}</div></section>` : ""}
<h2>Como comprar este repasse</h2>
<ol class="passos"><li><b>Reserve com sinal</b>Clique em Reservar e pague o sinal por Pix. O carro fica reservado para você.</li>
<li><b>Receba o contato da loja</b>Confirmado o pagamento, passamos seu contato para a loja anunciante.</li>
<li><b>Feche o negócio</b>Você vê o carro, confere a documentação e acerta o restante direto com a loja.</li></ol>
${reservado ? "" : `<div class="barra"><div><b>${brl(i.preco)}</b><small>${p > 0 ? pct(p) + " abaixo da FIPE" : esc(i.cidade || "")}</small></div><a class="btn btn-y" href="/#reservar=${esc(i.id)}">Reservar com sinal</a></div>`}
${outros.length ? `<h2>Outros repasses${est ? " " + est.em : ""}</h2><div class="grid">${outros.map(cardHtml).join("")}</div>` : ""}`;
  return pagina({ titulo, desc, canon, img, jsonld, corpo, redes });
}

export function paginaEstado(req, est, lista, redes = []) {
  const b = base(req), canon = `${b}/repasses/${est.uf.toLowerCase()}`;
  const cidades = [...new Set(lista.map(i => i.cidade).filter(Boolean))].slice(0, 12);
  const media = (() => { const ps = lista.map(i => pctAbaixo(i.preco, i.fipe)).filter(p => p > 0); return ps.length ? ps.reduce((a, c) => a + c, 0) / ps.length : null; })();
  const titulo = `Carros de repasse ${est.em} abaixo da FIPE | Pátio Repasses`;
  const desc = `${lista.length ? lista.length + " carros de repasse" : "Carros de repasse"} ${est.em}${media ? `, em média ${pct(media)} abaixo da FIPE` : ""}. Anúncios de lojas parceiras${cidades.length ? " em " + cidades.slice(0, 4).join(", ") : ""}. Reserve com sinal.`;
  const faq = [
    ["O que é um carro de repasse?", "É um carro que a loja vende abaixo do preço de mercado para girar o estoque, normalmente para outros lojistas ou para quem compra à vista. Por isso o preço fica abaixo da tabela FIPE."],
    ["Carro de repasse tem garantia?", "Não. O repasse é vendido no estado em que está, e é por isso que o preço fica bem abaixo da FIPE. Antes de fechar, veja o carro pessoalmente e confira o laudo cautelar e a documentação."],
    ["Como funciona a reserva com sinal?", "Você paga o sinal por Pix ao Pátio Repasses e o carro fica reservado para você. Depois passamos seu contato para a loja e o restante é acertado direto com ela. O sinal já está incluído no preço anunciado."],
  ];
  const jsonld = [
    { "@context": "https://schema.org", "@type": "CollectionPage", name: titulo, url: canon, description: desc,
      mainEntity: { "@type": "ItemList", numberOfItems: lista.length, itemListElement: lista.slice(0, 30).map((i, k) => ({ "@type": "ListItem", position: k + 1, url: b + i.link, name: tituloCarro(i) })) } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: b + "/" }, { "@type": "ListItem", position: 2, name: "Repasses " + est.em, item: canon }] },
  ];
  const corpo = `
<div class="crumb"><a href="/">Início</a> › Repasses ${est.em}</div>
<h1>Carros de repasse ${est.em}</h1>
<p class="intro">${lista.length ? `<b>${lista.length} ${lista.length === 1 ? "carro" : "carros"}</b> de repasse anunciados por lojas parceiras ${est.em}${media ? `, em média <b>${pct(media)} abaixo da tabela FIPE</b>` : ""}.` : `Ainda não há repasses anunciados ${est.em} agora.`}
Cada anúncio mostra o valor da FIPE ao lado do preço, os itens do carro (chave cópia, manual, laudo cautelar, leilão e sinistro) e você reserva com sinal direto pelo site.
${cidades.length ? ` Lojas em ${esc(cidades.join(", "))}.` : ` Atendemos lojas de cidades como ${est.cidades}.`}</p>
${lista.length ? `<div class="grid">${lista.map(cardHtml).join("")}</div>`
    : `<div class="vazio"><p>Novos repasses entram todos os dias. Veja os carros dos outros estados ou entre no nosso grupo.</p><a class="btn btn-y" href="/#vitrine">Ver todos os repasses</a></div>`}
<section class="faq" style="margin:28px 0"><h2>Perguntas frequentes</h2>
${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>
<section class="box" style="margin-bottom:28px"><h2>Tem loja ${est.em}?</h2><p>Anuncie seus repasses de graça para compradores e lojas do Paraná, Santa Catarina e Rio Grande do Sul. Quem paga a comissão é o comprador.</p><a class="btn btn-y" href="/#lojistas">Quero anunciar</a></section>`;
  return pagina({ titulo, desc, canon, img: b + "/og.jpg", jsonld, corpo, redes });
}

export function paginaSumiu(req, vendido, redes = []) {
  const b = base(req);
  return pagina({ titulo: vendido ? "Este carro já foi vendido | Pátio Repasses" : "Carro não encontrado | Pátio Repasses",
    desc: "Veja outros carros de repasse no Pátio Repasses.", canon: b + "/", img: b + "/og.jpg", noindex: true, redes,
    corpo: `<div class="vazio" style="margin:40px 0"><h1>${vendido ? "Este carro já foi vendido" : "Carro não encontrado"}</h1>
<p>${vendido ? "Esse repasse saiu rápido." : "O anúncio pode ter sido removido pela loja."} Veja os outros carros disponíveis.</p>
<a class="btn btn-y" href="/#vitrine">Ver repasses disponíveis</a></div>` });
}
