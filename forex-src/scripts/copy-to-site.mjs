// Copia o build (dist/) para a pasta /forex do site (GitHub Pages).
// Uso: npm run build && npm run deploy:copy
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "..", "dist");
const target = path.resolve(here, "..", "..", "forex");

await stat(path.join(dist, "index.html")).catch(() => {
  console.error("dist/index.html não existe. Rode npm run build antes.");
  process.exit(1);
});
await mkdir(target, { recursive: true });
// remove só o que o build anterior gerou (index.html, favicon e assets/)
for (const name of await readdir(target)) {
  if (name === "index.html" || name === "favicon.svg" || name === "assets") {
    await rm(path.join(target, name), { recursive: true, force: true });
  }
}
await cp(dist, target, { recursive: true });
console.log(`Build copiado para ${target}`);
