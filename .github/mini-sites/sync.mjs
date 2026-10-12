// Gera www.ddsinovacao.com.br/<nome>/index.html para cada mini site publicado no DDS Avaliações.
// Roda no GitHub Actions (.github/workflows/mini-sites.yml). Só mexe nas pastas que ele mesmo criou,
// listadas em .github/mini-sites/manifest.json; pastas existentes do site nunca são tocadas.
import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://www.ddsinovacao.com.br';
const RUNTIME = '/dds-avaliacoes/mini';
const MANIFEST = '.github/mini-sites/manifest.json';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const forScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16));
const httpUrl = (v) => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const phoneDigits = (phone) => { let d = String(phone || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 10 && d.length <= 15 ? d : ''; };

export function render(page, meta = {}) {
  const c = page.content || {};
  const name = String(c.name || 'Mini site').trim();
  const lead = c.headline || c.tagline || '';
  const title = lead ? `${name} · ${lead}` : name;
  const description = String(c.tagline || c.headline || c.description || `Conheça ${name}.`).replace(/\s+/g, ' ').slice(0, 200);
  const url = `${SITE}/${page.slug}/`;
  const image = httpUrl(c.cover) || httpUrl(c.logo);
  const theme = c.theme || 'elegance';
  const bg = meta.bg?.[theme]?.[c.palette] || meta.bg?.[theme]?.p1 || '#ffffff';
  const fonts = meta.fonts?.[theme];
  const digits = phoneDigits(c.phone);
  const wa = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(c.ctaMessage || `Olá, ${name}! Vi sua página e gostaria de mais informações.`)}` : '';
  const instagram = String(c.instagram || '').startsWith('@') ? `https://www.instagram.com/${c.instagram.slice(1)}/` : httpUrl(c.instagram);
  const ld = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name, url, description,
    ...(image && { image }), ...(digits && { telephone: '+' + digits }), ...(c.email && { email: c.email }),
    ...(c.address && { address: { '@type': 'PostalAddress', streetAddress: c.address } }),
    sameAs: [instagram, httpUrl(c.facebook), httpUrl(c.youtube), httpUrl(c.website)].filter(Boolean),
  };
  const data = { id: page.id, slug: page.slug, updated_at: page.updated_at, content: c };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="dds-mini-page" content="${esc(page.id)}">
<meta name="theme-color" content="${esc(bg)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(image)}">` : '<meta name="twitter:card" content="summary">'}
<link rel="icon" href="${esc(httpUrl(c.logo) || '/favicon.svg')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">\n` : ''}<link rel="stylesheet" href="${RUNTIME}/runtime.css">
${image ? `<link rel="preload" as="image" href="${esc(image)}">\n` : ''}<script type="application/ld+json">${forScript(ld)}</script>
</head>
<body style="margin:0;background:${esc(bg)}">
<div id="mini-root"></div>
<noscript><main style="max-width:540px;margin:0 auto;padding:48px 20px;font:16px/1.6 system-ui,sans-serif;background:#fff;color:#222"><h1>${esc(name)}</h1>${lead ? `<p>${esc(lead)}</p>` : ''}${c.description ? `<p>${esc(c.description)}</p>` : ''}${wa ? `<p><a href="${esc(wa)}">Conversar no WhatsApp</a></p>` : ''}${c.address ? `<p>${esc(c.address)}</p>` : ''}</main></noscript>
<script id="mini-data" type="application/json">${forScript(data)}</script>
<script type="module" src="${RUNTIME}/runtime.js"></script>
</body>
</html>
`;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/mini_pages?published=eq.true&select=id,slug,updated_at,content&order=slug`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error(`Supabase respondeu ${res.status}: ${await res.text()}`);
  const pages = await res.json();
  let meta = {};
  try { const m = await fetch(`${SITE}${RUNTIME}/meta.json`); if (m.ok) meta = await m.json(); } catch { /* usa os padrões */ }
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8').catch(() => '{}'));
  const next = {};
  for (const page of pages) {
    const dir = page.slug;
    if (!SLUG_RE.test(dir)) continue;
    const exists = await fs.stat(dir).then(() => true).catch(() => false);
    if (exists && !manifest[dir]) { console.warn(`A pasta "${dir}" já existe no site e não foi criada pelo gerador. Mini site ignorado.`); continue; }
    const html = render(page, meta);
    const file = path.join(dir, 'index.html');
    if ((await fs.readFile(file, 'utf8').catch(() => null)) !== html) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, html);
      console.log(`Atualizada: /${dir}/`);
    }
    next[dir] = { id: page.id, updated_at: page.updated_at };
  }
  for (const dir of Object.keys(manifest)) {
    if (next[dir] || !SLUG_RE.test(dir)) continue;
    await fs.rm(path.join(dir, 'index.html'), { force: true });
    await fs.rmdir(dir).catch(() => {});
    console.log(`Removida: /${dir}/`);
  }
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(next, null, 2) + '\n');
  console.log(`${Object.keys(next).length} mini site(s) publicados.`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main().catch((e) => { console.error(e); process.exit(1); });
