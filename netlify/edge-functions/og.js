// WhatsApp e Facebook só mostram a imagem do link se o endereço for completo (https://...).
// Aqui o endereço do site é colocado na hora, então funciona no domínio do Netlify e num domínio próprio.
export default async (req, context) => {
  const res = await context.next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const origin = new URL(req.url).origin;
  const html = (await res.text())
    .replaceAll('content="/og.jpg"', `content="${origin}/og.jpg"`)
    .replace("<!--og-url-->", `<meta property="og:url" content="${origin}/">`);
  const h = new Headers(res.headers); h.delete("content-length");
  return new Response(html, { status: res.status, headers: h });
};
export const config = { path: ["/", "/index.html"] };
