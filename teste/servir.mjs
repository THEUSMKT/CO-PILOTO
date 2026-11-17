// Abre a página no computador com o "Claude de mentira" (teste/claude-falso.js).
//   npm run testar-local   →  http://localhost:8899   (como a Schay vê: http://localhost:8899/?dono=0)
// Imita o que o Claude faz ao publicar: envolve a página num esqueleto HTML e aplica regras parecidas de segurança.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const porta = Number(process.env.PORTA) || 8899;

const ESQUELETO_INICIO = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'";

async function semente() {
  const imoveis = JSON.parse(await readFile(path.join(raiz, "imoveis-exemplo.json"), "utf8"));
  const dados = { "config/geral": { nomeCorretora: "Schay", suporteWhatsapp: "5551999999999", link: `http://localhost:${porta}/` } };
  for (const { id, ...resto } of imoveis) dados[`imoveis/${id}`] = resto;
  return dados;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${porta}`);
  try {
    if (url.pathname === "/teste/claude-falso.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      return res.end(await readFile(path.join(raiz, "teste", "claude-falso.js")));
    }
    if (url.pathname === "/") {
      const pagina = await readFile(path.join(raiz, "dist", "copiloto.html"), "utf8");
      const html = `${ESQUELETO_INICIO}<script>window.__semente=${JSON.stringify(await semente())}</script><script src="/teste/claude-falso.js"></script>${pagina}</body></html>`;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "cache-control": "no-store" });
      return res.end(html);
    }
    res.writeHead(404);
    res.end("não encontrado");
  } catch (erro) {
    res.writeHead(500);
    res.end(String(erro));
  }
}).listen(porta, () => {
  console.log(`Teste local: http://localhost:${porta}  (como a Schay vê: http://localhost:${porta}/?dono=0)`);
});
