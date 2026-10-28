/* EstudeUp — páginas públicas (Para escolas, mural de oportunidades, página da escola, privacidade).
   Abrem sem login. Só leem o que as funções públicas do banco devolvem e só gravam o formulário e as métricas. */

const sbPub = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
Vitrine.cliente = sbPub;
Vitrine.sprite = 'icones.svg';
const $p = (id) => document.getElementById(id);
const escP = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icP = (id, t = 18) => `<svg class="ico" style="width:${t}px;height:${t}px" aria-hidden="true"><use href="icones.svg#${id}"/></svg>`;

function toastP(msg) {
  const t = $p('toast');
  if (!t) return;
  t.textContent = msg; t.className = 'toast on';
  clearTimeout(toastP.t); toastP.t = setTimeout(() => { t.className = 'toast'; }, 2400);
}

// contato comercial do EstudeUp (configurado no painel do criador)
async function configComercial() {
  if (configComercial.cache) return configComercial.cache;
  try { configComercial.cache = await Vitrine.rpc('be_vitrine_config'); } catch (_) { configComercial.cache = {}; }
  return configComercial.cache;
}

async function botaoWhatsappComercial() {
  const c = await configComercial();
  if (!c.whatsapp_comercial || !$p('pub-zap')) return;
  const a = $p('pub-zap');
  a.href = Vitrine.whatsappLink(c.whatsapp_comercial, c.mensagem_whatsapp || 'Olá! Vi o EstudeUp e quero apresentar minha escola.');
  a.hidden = false;
}

/* ---------------- Para escolas ---------------- */
async function iniciarParaEscolas() {
  botaoWhatsappComercial();
  // planos (sem preço, a não ser que o criador ligue "mostrar preços")
  try {
    const planos = await Vitrine.rpc('be_vitrine_planos');
    $p('planos').innerHTML = planos.map((p, i) => `<div class="pub-plano ${i === 1 ? 'meio' : ''}">
        <h3>${escP(p.nome)}</h3>
        <div class="preco">${p.preco ? `R$ ${Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}<small> /mês</small>` : '<small>valor na apresentação</small>'}</div>
        ${p.descricao ? `<p class="muted small" style="margin:0">${escP(p.descricao)}</p>` : ''}
        <ul>${(p.recursos || []).map((r) => `<li>${escP(r)}</li>`).join('')}</ul>
      </div>`).join('') || '<p class="muted">Os planos são apresentados na conversa com a escola.</p>';
  } catch (_) { $p('planos').innerHTML = '<p class="muted">Os planos são apresentados na conversa com a escola.</p>'; }
  // escola de demonstração, se existir
  try {
    const escolas = await Vitrine.rpc('be_vitrine_escolas', {});
    const demo = escolas.find((x) => x.demo);
    if (demo) document.querySelectorAll('[data-demo-link]').forEach((a) => { a.href = 'escola.html?e=' + encodeURIComponent(demo.slug); a.hidden = false; });
  } catch (_) { /* sem demo, sem botão */ }
  $p('form-interesse').addEventListener('submit', enviarInteresse);
}

async function enviarInteresse(ev) {
  ev.preventDefault();
  const f = ev.target;
  const dados = Object.fromEntries(new FormData(f).entries());
  dados.consentimento = f.consentimento.checked;
  dados.consentimento_texto = $p('texto-consentimento').textContent.trim();
  const erro = (msg, campo) => { $p('form-erro').textContent = msg; $p('form-erro').hidden = false; if (campo) f[campo].focus(); };
  $p('form-erro').hidden = true;
  if ((dados.instituicao || '').trim().length < 2) return erro('Escreve o nome da instituição.', 'instituicao');
  if ((dados.responsavel || '').trim().length < 2) return erro('Escreve o nome do responsável.', 'responsavel');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email || '')) return erro('Confere o e-mail.', 'email');
  const dig = (dados.telefone || '').replace(/\D/g, '');
  if (dig.length < 10 || dig.length > 13) return erro('Confere o telefone ou WhatsApp com DDD.', 'telefone');
  if ((dados.cidade || '').trim().length < 2) return erro('Escreve a cidade.', 'cidade');
  if (!dados.tipo) return erro('Escolhe o tipo de instituição.', 'tipo');
  if (!dados.consentimento) return erro('Pra gente responder, marca a autorização de contato.', 'consentimento');
  const b = $p('btn-interesse');
  const original = b.innerHTML;
  b.disabled = true; b.textContent = 'Enviando...';
  try {
    const { error } = await sbPub.rpc('be_registrar_interesse', { p_dados: dados });
    if (error) throw new Error(error.message);
    $p('form-interesse').hidden = true;
    $p('form-ok').hidden = false;
    $p('form-ok').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof Fx !== 'undefined') Fx.confete({ y: innerHeight * 0.45, n: 90 });
  } catch (err) {
    erro(/fetch|network|Failed/i.test(err.message) ? 'Sem conexão agora. Confere a internet e tenta de novo.' : err.message.replace(/^.*?: /, ''));
  } finally { b.disabled = false; b.innerHTML = original; }
}

/* ---------------- mural ---------------- */
const mural = { categoria: null, cidade: null, busca: '', offset: 0 };

async function iniciarMural() {
  try {
    const f = await Vitrine.rpc('be_vitrine_filtros');
    $p('mural-cidade').innerHTML = '<option value="">todas as cidades</option>' + (f.cidades || []).map((c) => `<option>${escP(c)}</option>`).join('');
    const cats = Object.entries(Vitrine.CATEGORIAS).filter(([k]) => (f.categorias || {})[k]);
    $p('mural-cats').innerHTML = `<button class="chip small sel" data-c="" onclick="filtrarCategoria(this)">tudo</button>` +
      cats.map(([k, [rot]]) => `<button class="chip small" data-c="${k}" onclick="filtrarCategoria(this)">${escP(rot)} <b>${f.categorias[k]}</b></button>`).join('');
  } catch (_) { /* filtros ficam vazios */ }
  $p('mural-cidade').onchange = (e) => { mural.cidade = e.target.value || null; carregarMural(); };
  $p('mural-busca').oninput = () => { clearTimeout(mural.t); mural.t = setTimeout(() => { mural.busca = $p('mural-busca').value.trim(); carregarMural(); }, 350); };
  carregarMural();
  try {
    const escolas = await Vitrine.rpc('be_vitrine_escolas', {});
    $p('mural-escolas').innerHTML = escolas.length ? escolas.map(Vitrine.htmlEscolaCard).join('') : '<p class="muted">As escolas parceiras aparecem aqui.</p>';
  } catch (_) { /* ignora */ }
}

function filtrarCategoria(btn) {
  document.querySelectorAll('#mural-cats .chip').forEach((c) => c.classList.toggle('sel', c === btn));
  mural.categoria = btn.dataset.c || null;
  carregarMural();
}

async function carregarMural() {
  const alvo = $p('mural-lista');
  alvo.innerHTML = '<div class="loading">carregando...</div>';
  try {
    const itens = await Vitrine.rpc('be_vitrine_oportunidades', { p_categoria: mural.categoria, p_cidade: mural.cidade, p_busca: mural.busca || null, p_limite: 60 });
    alvo.innerHTML = itens.length ? `<div class="op-grade">${itens.map((o) => Vitrine.htmlOportunidade(o)).join('')}</div>`
      : '<div class="empty">Nenhuma oportunidade aberta com esses filtros agora.</div>';
  } catch (err) {
    alvo.innerHTML = `<div class="empty">Não consegui carregar agora (${escP(/fetch|network/i.test(err.message) ? 'sem conexão' : err.message)}). <button class="link-btn" onclick="carregarMural()">tentar de novo</button></div>`;
  }
}

/* ---------------- página da escola ---------------- */
async function iniciarEscola() {
  const slug = new URLSearchParams(location.search).get('e') || '';
  const alvo = $p('escola');
  if (!slug) { alvo.innerHTML = '<div class="empty">Escola não informada. <a href="oportunidades.html">Ver escolas parceiras</a></div>'; return; }
  try {
    const escola = await Vitrine.rpc('be_vitrine_escola', { p_slug: slug });
    document.title = `${escola.nome} · EstudeUp`;
    alvo.innerHTML = Vitrine.htmlEscola(escola);
    if (!escola.previa) Vitrine.evento('ver_escola', escola.id);
  } catch (err) {
    alvo.innerHTML = `<div class="empty">${/não encontrada/.test(err.message) ? 'Essa escola não está no EstudeUp (ou ainda não foi aprovada).' : 'Não consegui carregar agora. Confere a internet e tenta de novo.'}<br><a href="oportunidades.html">Ver escolas parceiras</a></div>`;
  }
}

/* ---------------- privacidade ---------------- */
async function iniciarPrivacidade() {
  const c = await configComercial();
  const contato = [c.email_comercial && `pelo e-mail <a href="mailto:${escP(c.email_comercial)}">${escP(c.email_comercial)}</a>`,
    c.whatsapp_comercial && `pelo <a href="${escP(Vitrine.whatsappLink(c.whatsapp_comercial, 'Olá! Tenho uma dúvida sobre meus dados no EstudeUp.'))}" target="_blank" rel="noopener">WhatsApp do EstudeUp</a>`]
    .filter(Boolean).join(' ou ');
  $p('contato-dados').innerHTML = contato || 'pelos canais de atendimento informados na página "Para escolas"';
}

document.addEventListener('DOMContentLoaded', () => {
  const pagina = document.body.dataset.pagina;
  if (pagina === 'escolas') iniciarParaEscolas();
  if (pagina === 'mural') iniciarMural();
  if (pagina === 'escola') iniciarEscola();
  if (pagina === 'privacidade') iniciarPrivacidade();
});
