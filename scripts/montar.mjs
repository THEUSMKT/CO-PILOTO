// Junta tudo num arquivo só: dist/copiloto.html (é esse arquivo que vai publicado no Claude).
//   node scripts/montar.mjs
// - src/pagina.html  : estrutura da página
// - src/estilo.css   : visual
// - src/cerebro.js, src/app.js, src/gestor.js : código (nesta ordem, no mesmo escopo)
// - playbook.md      : as regras de venda que a IA segue (vão embutidas na página)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFile(path.join(raiz, f), "utf8");

const [pagina, css, cerebro, app, gestor, playbook] = await Promise.all([
  ler("src/pagina.html"), ler("src/estilo.css"), ler("src/cerebro.js"), ler("src/app.js"), ler("src/gestor.js"), ler("playbook.md"),
]);

// Nada pode fechar a tag <script> antes da hora.
const seguro = (texto) => texto.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const js = seguro([cerebro, app, gestor].join("\n\n"));
const playbookJson = seguro(JSON.stringify(playbook.trim()));

let html = pagina;
for (const [marca, valor] of [["/*CSS*/", css], ["/*PLAYBOOK*/", playbookJson], ["/*JS*/", js]]) {
  if (!html.includes(marca)) throw new Error(`Marcador ${marca} não encontrado em src/pagina.html`);
  html = html.replace(marca, () => valor);
}

await mkdir(path.join(raiz, "dist"), { recursive: true });
await writeFile(path.join(raiz, "dist", "copiloto.html"), html);
console.log(`dist/copiloto.html pronto (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB).`);
