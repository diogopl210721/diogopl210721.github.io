/* EstudeUp — escolas no app do aluno:
   1) carrossel "Escolas parceiras" no topo da tela Hoje (patrocinado, sempre marcado como tal)
   2) cartão patrocinado no fim do quiz, da revisão e da lição de inglês
   3) app exclusivo: aluno de escola com modo 'exclusiva' vê a marca da escola e só a escola dele
   Nada disso aparece dentro do tutor. Tocar numa escola abre a página dela; nenhum dado do aluno vai pra escola. */

const PAT = { escolas: null, em: 0, i: 0, timer: null, marca: null, fimI: 0 };

async function escolasPatrocinio() {
  if (!PAT.escolas || Date.now() - PAT.em > 10 * 60 * 1000) {
    try { PAT.escolas = await rpc('be_vitrine_escolas', {}); PAT.em = Date.now(); } catch (_) { PAT.escolas = PAT.escolas || []; }
  }
  return PAT.escolas || [];
}

function frasePatrocinio(e) {
  const d = String(e.descricao || '').replace(/\s+/g, ' ').trim();
  const primeira = (d.match(/^[^.!?]+[.!?]/) || [d])[0];
  return primeira.length > 110 ? primeira.slice(0, 107).trimEnd() + '…' : primeira;
}

/* ---------- carrossel no topo do Hoje ---------- */
async function carregarCarrosselParceiras() {
  const alvo = $('home-parceiras');
  if (!alvo) return;
  const escolas = (await escolasPatrocinio()).slice(0, 8);
  if (!escolas.length) { alvo.innerHTML = ''; return; }
  const minha = !!PAT.marca;
  alvo.innerHTML = `<section class="parceiras" aria-label="${minha ? 'sua escola' : 'escolas parceiras'}">
    <div class="parceiras-topo"><span>${minha ? 'Sua escola' : 'Escolas parceiras'}</span><span class="selo-pat">${minha ? 'avisos e oportunidades' : 'patrocinado'}</span></div>
    <div class="parceiras-trilho" id="parceiras-trilho">
      ${escolas.map((e) => `
        <button class="parceira-slide" style="--cor-esc:${esc(e.cor || '#24306E')}" onclick="abrirEscolaApp('${esc(e.slug)}')" aria-label="conhecer ${esc(e.nome)}">
          ${e.capa_url ? `<img class="parceira-capa" src="${esc(e.capa_url)}" alt="" loading="lazy">` : ''}
          <span class="parceira-veu"></span>
          <span class="parceira-info">
            ${e.logo_url ? `<img class="parceira-logo" src="${esc(e.logo_url)}" alt="">` : ''}
            <span class="parceira-txt"><b>${esc(e.nome)}</b><small>${esc(frasePatrocinio(e))}</small></span>
          </span>
          <span class="parceira-cta">${e.oportunidades_ativas ? `${e.oportunidades_ativas} oportunidade${e.oportunidades_ativas > 1 ? 's' : ''} ›` : 'conhecer ›'}</span>
          ${e.demo ? '<span class="parceira-demo">demonstração</span>' : ''}
        </button>`).join('')}
    </div>
    ${escolas.length > 1 ? `<div class="parceiras-pontos">${escolas.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>` : ''}
  </section>`;
  ligarCarrossel(escolas.length);
}

function ligarCarrossel(n) {
  clearInterval(PAT.timer);
  const trilho = $('parceiras-trilho');
  if (!trilho) return;
  const pontos = () => document.querySelectorAll('.parceiras-pontos i');
  const marcar = () => {
    const i = Math.round(trilho.scrollLeft / Math.max(1, trilho.clientWidth));
    PAT.i = i;
    pontos().forEach((p, k) => p.classList.toggle('on', k === i));
  };
  trilho.addEventListener('scroll', () => requestAnimationFrame(marcar), { passive: true });
  marcar();
  if (n < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let parado = false;
  trilho.addEventListener('pointerdown', () => { parado = true; }, { passive: true });
  PAT.timer = setInterval(() => {
    if (parado || document.hidden || telaAtual() !== 'home' || !document.body.contains(trilho)) return;
    const prox = (PAT.i + 1) % n;
    trilho.scrollTo({ left: prox * trilho.clientWidth, behavior: 'smooth' });
  }, 4500);
}

/* ---------- cartão patrocinado no fim das atividades ---------- */
async function preencherPatrocinioFim(alvoId) {
  const alvo = $(alvoId);
  if (!alvo) return;
  alvo.innerHTML = '';
  const escolas = await escolasPatrocinio();
  if (!escolas.length) return;
  const e = escolas[PAT.fimI++ % escolas.length];
  alvo.innerHTML = `<button class="pat-fim" style="--cor-esc:${esc(e.cor || '#24306E')}" onclick="abrirEscolaApp('${esc(e.slug)}')">
    ${e.logo_url ? `<img src="${esc(e.logo_url)}" alt="">` : '<span class="pat-fim-sem"></span>'}
    <span><small>${PAT.marca ? 'sua escola' : 'patrocinado'}${e.demo ? ' · demonstração' : ''}</small><b>${esc(e.nome)}</b><em>${esc(frasePatrocinio(e))}</em></span>
    <span class="pat-fim-cta">ver ›</span></button>`;
}

function aoMostrarTela(nome) {
  if (nome === 'quiz-fim') preencherPatrocinioFim('quizfim-patrocinio');
  if (nome === 'cards-fim') preencherPatrocinioFim('cardsfim-patrocinio');
  if (nome === 'ingles-fim') preencherPatrocinioFim('inglesfim-patrocinio');
  if (nome !== 'home') clearInterval(PAT.timer);
}

/* ---------- app exclusivo da escola ---------- */
const MARCA_LS = 'estudeup:escola';
function slugDaUrl() {
  const p = new URLSearchParams(location.search);
  const s = (p.get('escola') || '').trim().toLowerCase();
  if (/^[a-z0-9-]{2,80}$/.test(s)) { try { localStorage.setItem(MARCA_LS, s); } catch (_) { /* sem armazenamento */ } return s; }
  try { return localStorage.getItem(MARCA_LS) || ''; } catch (_) { return ''; }
}

function pintarMarca(m) {
  document.body.classList.toggle('marca-escola', !!m);
  document.querySelectorAll('.brand').forEach((b) => {
    if (!b.dataset.original) b.dataset.original = b.innerHTML;
    b.innerHTML = m
      ? `${m.logo_url ? `<img class="marca-esc" src="${esc(m.logo_url)}" alt="">` : ''}<span class="marca-esc-nome">${esc(m.nome_app || m.nome)}</span><small class="marca-com">com EstudeUp</small>`
      : b.dataset.original;
  });
  if (m && m.cor) document.documentElement.style.setProperty('--cor-escola', m.cor);
  else document.documentElement.style.removeProperty('--cor-escola');
  document.title = m ? `${m.nome_app || m.nome} · EstudeUp` : 'EstudeUp · seu próximo nível começa aqui';
}

// antes do login: a marca vem do link (?escola=slug); depois, do vínculo do aluno com a escola
async function aplicarMarcaLogin() {
  const slug = slugDaUrl();
  if (!slug) return;
  try { const m = await rpc('be_marca_por_slug', { p_slug: slug }); if (m) pintarMarca(m); } catch (_) { /* segue como EstudeUp */ }
}

async function aplicarMarca() {
  try { PAT.marca = await rpc('be_minha_marca'); } catch (_) { PAT.marca = null; }
  PAT.escolas = null;
  pintarMarca(PAT.marca);
}

aplicarMarcaLogin();
