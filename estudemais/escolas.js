/* EstudeUp — escolas parceiras dentro do app.
   Mural de oportunidades, página da escola, painel da escola (gestor e professores) e a área comercial da conta do criador.
   Quem pode o quê é decidido pelas funções do banco (be_escola_*, be_admin_*), que conferem a conta de novo a cada chamada:
   esconder um botão aqui é só conforto, não é a regra. Nenhuma tela da escola mostra o desempenho individual de aluno. */

Vitrine.cliente = sb;
Vitrine.sprite = '';
Vitrine.abrirEscola = (slug) => abrirEscolaApp(slug);

const ESC = {
  minhas: null, instId: null, painel: null, aba: null, dias: 30, voltarPara: 'oportunidades', slug: null,
  mural: { categoria: null, cidade: null, busca: '' }, filtros: null, home: null, homeEm: 0, editOp: null,
  com: { aba: 'resumo', dias: 30, escolas: 'pendente', ops: 'pendente', leads: 'novo', planos: [], escolasLista: [], opsLista: [], leadsLista: [] },
};

const STATUS_ESCOLA = { pendente: 'esperando aprovação', aprovada: 'no ar', recusada: 'recusada', suspensa: 'suspensa', desativada: 'desativada' };
const STATUS_OP = {
  rascunho: ['rascunho', 'leve'], pendente: ['esperando aprovação', 'leve'], publicada: ['no ar', 'ok'], pausada: ['pausada', 'leve'],
  encerrada: ['encerrada', 'neutra'], recusada: ['recusada', ''], suspensa: ['suspensa', ''],
};
const STATUS_CONTRATO = { interessado: 'interessado', negociacao: 'em negociação', ativo: 'ativo', pendente: 'pendente', cancelado: 'cancelado' };
const STATUS_PAGAMENTO = { nao_se_aplica: 'não se aplica', em_dia: 'em dia', pendente: 'pendente', atrasado: 'atrasado', isento: 'isento' };
const STATUS_LEAD = { novo: 'novo', em_contato: 'em contato', convertido: 'virou escola', descartado: 'descartado' };
const qtd = (n, um, varios) => `${Number(n || 0).toLocaleString('pt-BR')} ${Number(n) === 1 ? um : varios}`;
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const inicial = (nome) => esc(String(nome || '?').trim().slice(0, 1).toUpperCase());
const logoEscola = (e, cls = 'escola-mini-logo') => `<span class="${cls}">${Vitrine.linkOk(e.logo_url) ? `<img src="${esc(e.logo_url)}" alt="">` : inicial(e.nome)}</span>`;

/* ===================== HOJE: cartão das oportunidades ===================== */
async function carregarHomeOportunidades() {
  const alvo = $('home-oportunidades');
  if (!alvo) return;
  try {
    if (!ESC.home || Date.now() - ESC.homeEm > 10 * 60 * 1000) {
      ESC.home = await rpc('be_vitrine_oportunidades', { p_limite: 4 });
      ESC.homeEm = Date.now();
    }
  } catch (_) { alvo.innerHTML = ''; return; }
  const itens = (ESC.home || []).slice(0, 3);
  if (!itens.length) { alvo.innerHTML = ''; return; }
  itens.forEach((o) => { Vitrine.cache.oportunidades[o.id] = o; });
  alvo.innerHTML = `<div class="card cartao-oportunidades">
    <div class="card-head"><h3>Escolas e oportunidades</h3><button class="link-btn" onclick="verOportunidades()">ver tudo</button></div>
    ${itens.map((o) => {
      const [rot, adesivo] = Vitrine.CATEGORIAS[o.categoria] || Vitrine.CATEGORIAS.outro;
      return `<div class="op-mini" role="button" tabindex="0" onclick="Vitrine.detalhes('${o.id}')" onkeydown="if(event.key==='Enter')Vitrine.detalhes('${o.id}')">
        <img class="adesivo" src="adesivos/${adesivo}.webp" alt="">
        <div><b>${esc(o.titulo)}</b><small>${esc(rot)} · ${esc(o.escola.nome)}${o.escola.demo ? ' (demonstração)' : ''}</small></div></div>`;
    }).join('')}
    <p class="op-rodape">ofertas das escolas parceiras · o EstudeUp não passa seus dados pra elas</p>
  </div>`;
}

/* ===================== MURAL ===================== */
async function verOportunidades() {
  go('oportunidades');
  if (!ESC.filtros) {
    try {
      ESC.filtros = await rpc('be_vitrine_filtros');
      $('op-cidade').innerHTML = '<option value="">todas as cidades</option>' + (ESC.filtros.cidades || []).map((c) => `<option>${esc(c)}</option>`).join('');
    } catch (_) { ESC.filtros = null; }
  }
  pintarCategoriasMural();
  carregarMuralApp();
  carregarEscolasApp();
}

function pintarCategoriasMural() {
  const f = ESC.filtros || {};
  const cats = Object.entries(Vitrine.CATEGORIAS).filter(([k]) => (f.categorias || {})[k]);
  $('op-cats').innerHTML = `<button class="chip small ${!ESC.mural.categoria ? 'sel' : ''}" onclick="filtrarMural(null)">tudo</button>` +
    cats.map(([k, [rot]]) => `<button class="chip small ${ESC.mural.categoria === k ? 'sel' : ''}" onclick="filtrarMural('${k}')">${esc(rot)} <b>${f.categorias[k]}</b></button>`).join('');
}

function filtrarMural(cat) { ESC.mural.categoria = cat; pintarCategoriasMural(); carregarMuralApp(); }
function cidadeMural() { ESC.mural.cidade = $('op-cidade').value || null; carregarMuralApp(); }
let muralTimer = null;
function buscarMuralDepois() {
  clearTimeout(muralTimer);
  muralTimer = setTimeout(() => { ESC.mural.busca = $('op-busca').value.trim(); carregarMuralApp(); }, 350);
}

async function carregarMuralApp() {
  const alvo = $('op-lista');
  alvo.innerHTML = '<div class="loading">carregando...</div>';
  try {
    const itens = await rpc('be_vitrine_oportunidades', { p_categoria: ESC.mural.categoria, p_cidade: ESC.mural.cidade, p_busca: ESC.mural.busca || null, p_limite: 60 });
    alvo.innerHTML = itens.length ? `<div class="op-grade">${itens.map((o) => Vitrine.htmlOportunidade(o)).join('')}</div>`
      : `<div class="empty">${ESC.mural.categoria || ESC.mural.cidade || ESC.mural.busca ? 'Nenhuma oportunidade aberta com esses filtros agora.' : 'As oportunidades das escolas parceiras aparecem aqui.'}</div>`;
  } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

async function carregarEscolasApp() {
  try {
    const l = await rpc('be_vitrine_escolas');
    $('op-escolas').innerHTML = l.length ? l.map(Vitrine.htmlEscolaCard).join('') : '<div class="empty">As escolas parceiras aparecem aqui.</div>';
  } catch (_) { $('op-escolas').innerHTML = ''; }
}

/* ===================== PÁGINA DA ESCOLA ===================== */
async function abrirEscolaApp(slug) {
  const de = telaAtual();
  if (de && de !== 'escola') ESC.voltarPara = de;
  ESC.slug = slug;
  go('escola');
  $('escola-titulo').textContent = 'Escola';
  $('escola-conteudo').innerHTML = '<div class="loading">carregando...</div>';
  try {
    const escola = await rpc('be_vitrine_escola', { p_slug: slug });
    $('escola-titulo').textContent = escola.nome;
    $('escola-conteudo').innerHTML = Vitrine.htmlEscola(escola);
    if (!escola.previa) Vitrine.evento('ver_escola', escola.id);
  } catch (err) {
    $('escola-conteudo').innerHTML = `<div class="empty">${/não encontrada/.test(err.message) ? 'Essa escola não está no EstudeUp (ou ainda não foi aprovada).' : esc(err.message)}</div>`;
  }
}

function voltarDaEscola() {
  const v = { home: verHoje, 'minha-escola': () => verMinhaEscola(ESC.instId), comercial: () => verComercial(), perfil: verPerfil, oportunidades: verOportunidades };
  (v[ESC.voltarPara] || verOportunidades)();
}

function linkPublicoEscola(slug) { return new URL('escola.html?e=' + encodeURIComponent(slug), location.href).href; }

async function compartilharEscola(slug = ESC.slug) {
  if (!slug) return;
  const url = linkPublicoEscola(slug);
  if (navigator.share) {
    try { await navigator.share({ title: 'EstudeUp', url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link da página copiado'); } catch (_) { avisar(url); }
}

/* ===================== PERFIL: minha escola, cadastro e código ===================== */
async function carregarMinhasEscolas() {
  try { ESC.minhas = await rpc('be_minhas_escolas'); } catch (_) { ESC.minhas = []; }
  const side = $('side-escola');
  if (side) side.hidden = !ESC.minhas.length;
  return ESC.minhas;
}

async function carregarEscolasPerfil() {
  const alvo = $('perfil-escola');
  if (!alvo) return;
  await carregarMinhasEscolas();
  const papel = (e) => (e.papel === 'gestor' ? 'gestor(a)' : 'professor(a)');
  const convidar = estado.criador || estado.papel === 'professor';
  alvo.innerHTML = ESC.minhas.length
    ? ESC.minhas.map((e) => `<button class="escola-atalho" onclick="verMinhaEscola('${e.id}')">
        ${logoEscola(e, 'escola-atalho-logo')}
        <span><b>${esc(e.nome)}</b><small>${papel(e)} · ${esc(STATUS_ESCOLA[e.status] || e.status)}${e.demo ? ' · demonstração' : ''}</small></span>
        <svg class="ico"><use href="#i-seta"/></svg></button>`).join('') +
      `<div class="new-group-row"><button class="ghost-btn" onclick="toggleForm('codigo-escola')"><svg class="ico"><use href="#i-chave"/></svg>entrar em outra escola</button></div>`
    : !convidar ? '' : `<div class="convite-escola no-perfil">
        <img class="adesivo" src="adesivos/escola.webp" alt="">
        <div><b>Trabalha numa escola?</b><span>Coloque a página da escola no EstudeUp ou entre como professor com o código da escola.</span></div>
        <div class="convite-botoes">
          <button class="btn" onclick="toggleForm('cadastrar-escola')">Cadastrar minha escola</button>
          <button class="ghost-btn" onclick="toggleForm('codigo-escola')"><svg class="ico"><use href="#i-chave"/></svg>tenho código</button>
        </div>
      </div>`;
}

function abrirCadastroEscola() {
  verPerfil();
  setTimeout(() => {
    $('form-codigo-escola').classList.remove('on');
    $('form-cadastrar-escola').classList.add('on');
    $('form-cadastrar-escola').scrollIntoView({ behavior: Fx.reduz() ? 'auto' : 'smooth', block: 'center' });
    $('ce-nome').focus({ preventScroll: true });
  }, 250);
}

async function solicitarEscola() {
  const dados = {
    nome: $('ce-nome').value.trim(), tipo: $('ce-tipo').value, cidade: $('ce-cidade').value.trim(),
    uf: $('ce-uf').value.trim().toUpperCase(), whatsapp: $('ce-whatsapp').value.trim(), email: $('ce-email').value.trim(),
  };
  if (dados.nome.length < 3) return avisar('escreve o nome da escola');
  if (dados.cidade.length < 2) return avisar('escreve a cidade da escola');
  const dig = dados.whatsapp.replace(/\D/g, '');
  if (dig && (dig.length < 10 || dig.length > 13)) return avisar('confere o WhatsApp com DDD');
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email)) return avisar('confere o e-mail da escola');
  const pronto = ocupado($('btn-ce'), 'Enviando...');
  try {
    const r = await rpc('be_escola_solicitar', { p_dados: dados });
    ['ce-nome', 'ce-cidade', 'ce-uf', 'ce-whatsapp', 'ce-email'].forEach((id) => { $(id).value = ''; });
    $('form-cadastrar-escola').classList.remove('on');
    await carregarMinhasEscolas();
    await avisar('Pedido enviado!\n\nA equipe do EstudeUp confere os dados e coloca a página no ar. Enquanto isso você já pode preencher a página da escola e preparar as oportunidades: nada aparece pro público antes da aprovação.');
    ESC.aba = 'pagina';
    verMinhaEscola(r.id);
  } catch (err) { falhou(err, 'Não consegui enviar'); } finally { pronto(); }
}

async function entrarEscolaCodigo() {
  const codigo = $('ce-codigo').value.trim().toUpperCase();
  if (!codigo) return avisar('digita o código de professor da escola');
  const pronto = ocupado($('btn-ce-codigo'), 'Entrando...');
  try {
    const r = await rpc('be_escola_entrar_professor', { p_codigo: codigo });
    $('ce-codigo').value = '';
    $('form-codigo-escola').classList.remove('on');
    toast('Você entrou na ' + r.nome);
    await carregarMinhasEscolas();
    verMinhaEscola(r.id);
  } catch (err) { falhou(err, 'Não consegui entrar'); } finally { pronto(); }
}

/* ===================== TURMAS: turma da escola ===================== */
function prepararEscolaDoGrupo(selecionar = null) {
  const lista = (ESC.minhas || []).filter((e) => e.status !== 'suspensa');
  $('criar-escola').hidden = !lista.length;
  if (!lista.length) return;
  $('input-escola-grupo').innerHTML = '<option value="">nenhuma (turma só minha)</option>' +
    lista.map((e) => `<option value="${e.id}" ${selecionar === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');
}

function criarTurmaDaEscola() {
  const inst = ESC.instId;
  verGrupos();
  setTimeout(() => {
    prepararEscolaDoGrupo(inst);
    $('form-entrar').classList.remove('on');
    $('form-criar').classList.add('on');
    $('input-nome-grupo').focus();
  }, 200);
}

/* ===================== MINHA ESCOLA (painel) ===================== */
function voltarDaMinhaEscola() { return ESC.voltarDoPainel === 'comercial' ? verComercial() : verPerfil(); }

async function verMinhaEscola(instId) {
  if (!ESC.minhas) await carregarMinhasEscolas();
  const de = telaAtual();
  if (de === 'comercial' || de === 'perfil') ESC.voltarDoPainel = de;
  instId = instId || ESC.instId || (ESC.minhas[0] && ESC.minhas[0].id);
  if (!instId) return verPerfil();
  if (instId !== ESC.instId) { ESC.editOp = null; }
  ESC.instId = instId;
  go('minha-escola', { manterScroll: de === 'minha-escola' });
  if (de !== 'minha-escola') $('me-conteudo').innerHTML = '<div class="loading">carregando...</div>';
  let p;
  try { p = await rpc('be_escola_painel', { p_inst: instId, p_dias: ESC.dias }); } catch (err) { $('me-conteudo').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  ESC.painel = p;
  $('me-nome').textContent = p.nome;
  const minha = (ESC.minhas || []).find((e) => e.id === instId);
  $('me-meta').textContent = `${minha ? (minha.papel === 'gestor' ? 'gestor(a)' : 'professor(a)') : 'equipe EstudeUp'} · ${STATUS_ESCOLA[p.status] || p.status}${p.demo ? ' · demonstração' : ''}`;
  $('me-escolhe').innerHTML = (ESC.minhas || []).length > 1 ? `<div class="chips-rolam" style="margin-bottom:10px">${ESC.minhas.map((e) =>
    `<button class="chip small ${e.id === instId ? 'sel' : ''}" onclick="verMinhaEscola('${e.id}')">${esc(e.nome)}</button>`).join('')}</div>` : '';
  const abas = p.gestor
    ? [['resumo', 'Visão geral'], ['pagina', 'Página'], ['oportunidades', 'Oportunidades'], ['turmas', 'Turmas'], ['professores', 'Professores'], ['plano', 'Plano']]
    : [['turmas', 'Minhas turmas'], ['sobre', 'A escola']];
  if (!abas.some(([k]) => k === ESC.aba)) ESC.aba = abas[0][0];
  $('me-abas').innerHTML = abas.map(([k, rot]) => `<button class="chip small ${k === ESC.aba ? 'sel' : ''}" role="tab" aria-selected="${k === ESC.aba}" data-a="${k}" onclick="abaEscola('${k}')">${rot}</button>`).join('');
  pintarAbaEscola();
}

function abaEscola(k) {
  ESC.aba = k;
  ESC.editOp = null;
  document.querySelectorAll('#me-abas .chip').forEach((c) => { c.classList.toggle('sel', c.dataset.a === k); c.setAttribute('aria-selected', c.dataset.a === k); });
  pintarAbaEscola();
}

function pintarAbaEscola() {
  const p = ESC.painel;
  const f = { resumo: abaResumo, pagina: abaPagina, oportunidades: abaOportunidades, turmas: abaTurmas, professores: abaProfessores, plano: abaPlano, sobre: abaSobre }[ESC.aba] || abaTurmas;
  $('me-conteudo').innerHTML = bannerEscola(p) + f(p);
  if (ESC.aba === 'pagina') prepararFormPagina(p);
  if (ESC.aba === 'oportunidades' && ESC.editOp !== null) abrirFormOportunidade(ESC.editOp === 'nova' ? null : ESC.editOp, { manter: true });
}

function verPaginaDaMinhaEscola() { if (ESC.painel) abrirEscolaApp(ESC.painel.slug); }

function bannerEscola(p) {
  let h = '';
  if (p.demo) h += '<div class="aviso-demo">Escola de demonstração: nome, pessoas, números e ofertas são fictícios, criados pra mostrar como o EstudeUp funciona.</div>';
  if (p.status === 'pendente') h += '<div class="aviso-moderacao espera"><b>Esperando aprovação.</b> A equipe do EstudeUp confere os dados e coloca a página no ar. Você já pode montar a página e preparar as oportunidades: nada aparece pro público antes disso.</div>';
  if (p.status === 'suspensa') h += '<div class="aviso-moderacao erro"><b>Página suspensa.</b> A página e as oportunidades da escola estão fora do ar. Fala com a equipe do EstudeUp pra resolver.</div>';
  return h;
}

// gráfico de barras simples (um por medida, cada um com a sua escala: nunca dois eixos no mesmo gráfico)
function graficoBarras(serie, campo, rotulo, classe) {
  if (!serie || !serie.length) return '';
  const max = Math.max(1, ...serie.map((s) => s[campo]));
  const total = serie.reduce((t, s) => t + s[campo], 0);
  if (!total) return `<figure class="grafico vazio"><figcaption><span>${esc(rotulo)}</span><b>0</b></figcaption><p class="small muted" style="margin:0">nada no período ainda</p></figure>`;
  return `<figure class="grafico ${classe}">
    <figcaption><span>${esc(rotulo)}</span><b>${total.toLocaleString('pt-BR')}</b></figcaption>
    <div class="gb" role="img" aria-label="${esc(rotulo)}: ${total} no período, no máximo ${max} num dia">
      ${serie.map((s) => `<span class="gb-col" title="${dataBR(s.dia)}: ${s[campo]}"><i style="height:${s[campo] ? Math.max(4, Math.round(s[campo] / max * 100)) : 0}%"></i></span>`).join('')}
    </div>
    <div class="gb-eixo"><span>${dataBR(serie[0].dia).slice(0, 5)}</span><span>máx. ${max}/dia</span><span>${dataBR(serie[serie.length - 1].dia).slice(0, 5)}</span></div>
  </figure>`;
}

function caixaNumero(v, um, varios, destaque) {
  return `<div class="num-box${destaque ? ' destaque' : ''}"><b>${Number(v || 0).toLocaleString('pt-BR')}</b><span>${Number(v) === 1 ? um : varios}</span></div>`;
}

function abaResumo(p) {
  const m = p.metricas || {};
  const ativas = (p.oportunidades || []).filter((o) => o.status === 'publicada' && !o.vencida).length;
  const porOp = (m.por_oportunidade || []).filter((o) => o.ver || o.cliques);
  return `
    <div class="me-atalhos">
      <button class="ghost-btn" onclick="verPaginaDaMinhaEscola()"><svg class="ico"><use href="#i-olho"/></svg>ver a página</button>
      <button class="ghost-btn" onclick="compartilharEscola('${esc(p.slug)}')"><svg class="ico"><use href="#i-compartilhar"/></svg>compartilhar link</button>
      <button class="ghost-btn" onclick="novaOportunidadeAtalho()"><svg class="ico"><use href="#i-mais"/></svg>nova oportunidade</button>
    </div>
    <div class="nums-grupo"><div class="rot">Vitrine nos últimos ${m.dias || ESC.dias} dias</div><div class="nums-grade">
      ${caixaNumero(m.ver_escola, 'visita na página', 'visitas na página', true)}
      ${caixaNumero(m.ver_oportunidade, 'oportunidade aberta', 'oportunidades abertas')}
      ${caixaNumero(m.cliques, 'clique em contato', 'cliques em contato')}
    </div></div>
    <div class="chip-toggle periodo">${[7, 30, 90].map((d) => `<button class="chip small ${ESC.dias === d ? 'sel' : ''}" onclick="mudarPeriodoEscola(${d})">${d} dias</button>`).join('')}</div>
    <div class="card graficos">
      ${graficoBarras(m.serie, 'ver', 'Visitas por dia (página e oportunidades)', 'ver')}
      ${graficoBarras(m.serie, 'cliques', 'Cliques em contato por dia', 'cliques')}
      <p class="small muted" style="margin:8px 0 0">Cada pessoa conta uma vez por dia em cada item. Visitas de quem é da escola não contam. O EstudeUp não mostra quem viu nem quem clicou.</p>
    </div>
    ${porOp.length ? `<div class="card"><div class="card-head"><h3>Por oportunidade</h3><span class="hand">no período</span></div>
      <table class="tabela-escola"><thead><tr><th>Oportunidade</th><th>Abertas</th><th>Cliques</th></tr></thead><tbody>
      ${porOp.map((o) => `<tr><td>${esc(o.titulo)}</td><td>${o.ver}</td><td>${o.cliques}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="nums-grupo"><div class="rot">Escola no EstudeUp</div><div class="nums-grade">
      ${caixaNumero(p.alunos_total, 'aluno nas turmas', 'alunos nas turmas', true)}
      ${caixaNumero((p.turmas || []).length, 'turma', 'turmas')}
      ${caixaNumero(ativas, 'oportunidade no ar', 'oportunidades no ar')}
    </div></div>`;
}

function novaOportunidadeAtalho() { abaEscola('oportunidades'); abrirFormOportunidade(null); }

function mudarPeriodoEscola(d) { ESC.dias = d; verMinhaEscola(ESC.instId); }

function abaSobre(p) {
  return `<div class="card">
    <div class="escola-resumo">${logoEscola(p, 'escola-atalho-logo')}<div><b>${esc(p.nome)}</b><span class="small muted">${esc(Vitrine.TIPOS[p.tipo] || 'Instituição de ensino')}${p.cidade ? ' · ' + esc(p.cidade) : ''}</span></div></div>
    <p class="small muted">Quem cuida da página e das oportunidades é o gestor da escola. Como professor(a), você cria turmas da escola e acompanha os seus alunos no painel de cada turma.</p>
    <div class="new-group-row"><button class="ghost-btn" onclick="verPaginaDaMinhaEscola()"><svg class="ico"><use href="#i-olho"/></svg>ver a página</button>
    <button class="ghost-btn" onclick="criarTurmaDaEscola()"><svg class="ico"><use href="#i-mais"/></svg>criar turma da escola</button></div>
  </div>`;
}

/* ---------- página da escola (formulário) ---------- */
function campo(id, rotulo, valor, { tipo = 'text', max = 120, dica = '', ph = '' } = {}) {
  return `<label for="${id}">${rotulo}${dica ? ` <span class="opt">${dica}</span>` : ''}</label><input type="${tipo}" id="${id}" maxlength="${max}" value="${esc(valor || '')}" placeholder="${esc(ph)}">`;
}

function abaPagina(p) {
  return `<div class="card form-escola">
    <div class="card-head"><h3>Logo e capa</h3><span class="hand">aparecem na página e no mural</span></div>
    <div class="imagens-escola">
      <div class="img-escolha logo"><div class="img-prev logo" id="pg-logo-prev">${Vitrine.linkOk(p.logo_url) ? `<img src="${esc(p.logo_url)}" alt="logo atual">` : inicial(p.nome)}</div>
        <button class="ghost-btn" onclick="$('pg-logo-arq').click()"><svg class="ico"><use href="#i-imagem"/></svg>trocar logo</button>
        <input type="file" id="pg-logo-arq" accept="image/png,image/jpeg,image/webp" hidden onchange="trocarImagemEscola(event, 'logo')"></div>
      <div class="img-escolha img-capa"><div class="img-prev img-capa" id="pg-capa-prev" ${Vitrine.linkOk(p.capa_url) ? `style="background-image:url('${esc(p.capa_url)}')"` : ''}></div>
        <button class="ghost-btn" onclick="$('pg-capa-arq').click()"><svg class="ico"><use href="#i-imagem"/></svg>trocar capa</button>
        <input type="file" id="pg-capa-arq" accept="image/png,image/jpeg,image/webp" hidden onchange="trocarImagemEscola(event, 'capa')"></div>
    </div>
    <p class="small muted" style="margin:6px 0 0">JPG, PNG ou WebP. A gente ajusta o tamanho antes de enviar. Use só imagens da escola ou que vocês podem usar; nada de foto de aluno sem autorização.</p>
  </div>
  <div class="card form-escola">
    <div class="card-head"><h3>Dados da escola</h3></div>
    <div class="inline-form on">
      ${campo('pg-nome', 'nome', p.nome)}
      <label for="pg-tipo">tipo</label><select id="pg-tipo">${Object.entries(Vitrine.TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <label for="pg-descricao">sobre a escola <span class="opt">(o que vocês têm de especial, sem promessas que não dá pra cumprir)</span></label>
      <textarea id="pg-descricao" rows="6" maxlength="3000">${esc(p.descricao || '')}</textarea>
      ${campo('pg-publico', 'pra quem', p.publico, { max: 300, ph: 'ex: Ensino Fundamental II e Ensino Médio' })}
      <label>modalidades</label>
      <div class="chip-toggle" id="pg-modalidades">${Object.entries(Vitrine.MODALIDADES).map(([k, v]) => `<button class="chip small ${(p.modalidades || []).includes(k) ? 'sel' : ''}" data-m="${k}" onclick="this.classList.toggle('sel')">${v}</button>`).join('')}</div>
      <div class="linha-2"><div>${campo('pg-cidade', 'cidade', p.cidade, { max: 80 })}</div><div class="uf">${campo('pg-uf', 'UF', p.uf, { max: 2 })}</div></div>
      ${campo('pg-regiao', 'região que atende', p.regiao, { max: 200, ph: 'ex: Curitiba e região metropolitana' })}
      ${campo('pg-endereco', 'endereço', p.endereco, { max: 200 })}
    </div>
  </div>
  <div class="card form-escola">
    <div class="card-head"><h3>Cursos e segmentos</h3><button class="link-btn" onclick="adicionarCursoForm()">+ curso</button></div>
    <div id="pg-cursos">${(p.cursos || []).map((c) => linhaCurso(c)).join('')}</div>
  </div>
  <div class="card form-escola">
    <div class="card-head"><h3>Contato</h3><span class="hand">pra onde vão os interessados</span></div>
    <div class="inline-form on">
      ${campo('pg-whatsapp', 'WhatsApp', p.whatsapp, { tipo: 'tel', max: 20, ph: '(41) 99999-0000' })}
      ${campo('pg-telefone', 'telefone', p.telefone, { tipo: 'tel', max: 30 })}
      ${campo('pg-email', 'e-mail', p.email, { tipo: 'email', max: 160 })}
      ${campo('pg-site', 'site', p.site, { tipo: 'url', max: 300, ph: 'https://' })}
      ${campo('pg-instagram', 'Instagram', p.instagram, { tipo: 'url', max: 300, ph: 'https://instagram.com/...' })}
      ${campo('pg-facebook', 'Facebook', p.facebook, { tipo: 'url', max: 300, ph: 'https://facebook.com/...' })}
      <p class="small muted" style="margin:4px 0 10px">O botão "Tenho interesse" abre o WhatsApp da escola (ou o site, ou o e-mail) com uma mensagem pronta. O EstudeUp não manda nenhum dado do aluno.</p>
      <button class="go-btn" id="btn-salvar-pagina" onclick="salvarPaginaEscola()">Salvar página</button>
    </div>
  </div>`;
}

function linhaCurso(c = {}) {
  return `<div class="linha-curso"><input type="text" class="curso-nome" maxlength="80" placeholder="curso ou segmento" value="${esc(c.nome || '')}" aria-label="nome do curso">
    <input type="text" class="curso-desc" maxlength="300" placeholder="uma frase sobre ele" value="${esc(c.descricao || '')}" aria-label="descrição do curso">
    <button class="cb-x" onclick="this.closest('.linha-curso').remove()" aria-label="tirar curso"><svg class="ico"><use href="#i-x"/></svg></button></div>`;
}

function adicionarCursoForm() {
  const alvo = $('pg-cursos');
  if (alvo.children.length >= 40) return avisar('até 40 cursos');
  alvo.insertAdjacentHTML('beforeend', linhaCurso());
  alvo.lastElementChild.querySelector('input').focus();
}

function prepararFormPagina(p) { $('pg-tipo').value = p.tipo || 'escola'; }

async function salvarPaginaEscola() {
  const v = (id) => $(id).value.trim();
  const dados = {
    nome: v('pg-nome'), tipo: $('pg-tipo').value, descricao: v('pg-descricao'), publico: v('pg-publico'),
    cidade: v('pg-cidade'), uf: v('pg-uf').toUpperCase(), regiao: v('pg-regiao'), endereco: v('pg-endereco'),
    modalidades: [...document.querySelectorAll('#pg-modalidades .chip.sel')].map((c) => c.dataset.m),
    cursos: [...document.querySelectorAll('#pg-cursos .linha-curso')].map((l) => ({ nome: l.querySelector('.curso-nome').value.trim(), descricao: l.querySelector('.curso-desc').value.trim() })).filter((c) => c.nome.length >= 2),
    whatsapp: v('pg-whatsapp'), telefone: v('pg-telefone'), email: v('pg-email'), site: v('pg-site'), instagram: v('pg-instagram'), facebook: v('pg-facebook'),
  };
  if (dados.nome.length < 3) return avisar('o nome da escola ficou curto');
  for (const [k, rot] of [['site', 'site'], ['instagram', 'Instagram'], ['facebook', 'Facebook']]) {
    if (dados[k] && !/^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(dados[k])) return avisar(`o link do ${rot} precisa começar com https://`);
  }
  const pronto = ocupado($('btn-salvar-pagina'), 'Salvando...');
  try {
    await rpc('be_escola_salvar', { p_inst: ESC.instId, p_dados: dados });
    toast('Página salva');
    ESC.home = null;
    verMinhaEscola(ESC.instId);
  } catch (err) { falhou(err, 'Não consegui salvar'); } finally { pronto(); }
}

/* ---------- imagens: reduz no aparelho e manda pra pasta da escola ---------- */
const TAMANHO_IMAGEM = { logo: [512, 512], capa: [1600, 600], op: [1200, 525] };

function imagemRecortada(file, largura, altura) {
  return new Promise((ok, falha) => {
    if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(file.type || '')) { falha(new Error('escolhe uma imagem JPG, PNG ou WebP')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // recorta no centro na proporção pedida (como "cobrir") e nunca aumenta a imagem
      const escala = Math.min(1, Math.max(largura / img.width, altura / img.height));
      const w = Math.round(Math.min(largura, img.width * escala)), h = Math.round(Math.min(altura, img.height * escala));
      const alvoW = Math.min(largura, Math.round(Math.min(img.width, img.height * largura / altura) * escala));
      const alvoH = Math.round(alvoW * altura / largura);
      const c = document.createElement('canvas');
      c.width = Math.max(1, alvoW || w); c.height = Math.max(1, alvoH || h);
      const cobre = Math.max(c.width / img.width, c.height / img.height);
      const dw = img.width * cobre, dh = img.height * cobre;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      c.toBlob((b) => {
        if (b && b.type === 'image/webp') return ok({ blob: b, ext: 'webp', tipo: 'image/webp' });
        c.toBlob((j) => (j ? ok({ blob: j, ext: 'jpg', tipo: 'image/jpeg' }) : falha(new Error('não consegui preparar a imagem'))), 'image/jpeg', 0.86);
      }, 'image/webp', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('não consegui abrir essa imagem')); };
    img.src = url;
  });
}

async function enviarImagemEscola(file, tipo) {
  const [w, h] = TAMANHO_IMAGEM[tipo];
  const { blob, ext, tipo: mime } = await imagemRecortada(file, w, h);
  if (blob.size > 3 * 1024 * 1024) throw new Error('a imagem ficou grande demais (até 3 MB)');
  const caminho = `${ESC.instId}/${tipo}-${Date.now().toString(36)}.${ext}`;
  const { error } = await sb.storage.from('estude-escolas').upload(caminho, blob, { contentType: mime, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(/row-level|policy|unauthorized|403/i.test(error.message || '') ? 'só o gestor da escola envia imagens' : error.message);
  return sb.storage.from('estude-escolas').getPublicUrl(caminho).data.publicUrl;
}

async function trocarImagemEscola(ev, tipo) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const prev = $(tipo === 'logo' ? 'pg-logo-prev' : 'pg-capa-prev');
  prev.classList.add('enviando');
  try {
    const url = await enviarImagemEscola(file, tipo);
    await rpc('be_escola_salvar', { p_inst: ESC.instId, p_dados: { [tipo === 'logo' ? 'logo_url' : 'capa_url']: url } });
    ESC.painel[tipo === 'logo' ? 'logo_url' : 'capa_url'] = url;
    if (tipo === 'logo') prev.innerHTML = `<img src="${esc(url)}" alt="logo nova">`;
    else prev.style.backgroundImage = `url('${url}')`;
    toast(tipo === 'logo' ? 'Logo trocada' : 'Capa trocada');
    ESC.home = null;
  } catch (err) { falhou(err, 'Não consegui enviar a imagem'); } finally { prev.classList.remove('enviando'); }
}

/* ---------- oportunidades da escola ---------- */
function acoesOportunidade(o) {
  const b = (acao, rot, icone, cls = '') => `<button class="${cls}" onclick="acaoOportunidade('${o.id}', '${acao}', this)"><svg class="ico"><use href="#${icone}"/></svg>${rot}</button>`;
  const editar = `<button onclick="abrirFormOportunidade('${o.id}')"><svg class="ico"><use href="#i-editar"/></svg>editar</button>`;
  const lista = [];
  if (o.vencida) return ['rascunho', 'pendente', 'publicada', 'pausada', 'recusada'].includes(o.status) ? `<div class="fila-acoes">${b('encerrar', 'encerrar', 'i-x', 'ocultar')}</div>` : '';
  if (['rascunho', 'pendente', 'publicada', 'pausada', 'recusada'].includes(o.status)) lista.push(editar);
  if (['rascunho', 'recusada'].includes(o.status) && !o.vencida) lista.push(b('enviar', 'mandar pra aprovação', 'i-enviar', 'liberar'));
  if (o.status === 'publicada') lista.push(b('pausar', 'pausar', 'i-pausa'));
  if (o.status === 'pausada' && o.ja_aprovada && !o.vencida) lista.push(b('retomar', 'voltar pro ar', 'i-play', 'liberar'));
  if (o.status === 'publicada') lista.push(`<button onclick="Vitrine.detalhes('${o.id}')"><svg class="ico"><use href="#i-olho"/></svg>ver como aparece</button>`);
  if (['rascunho', 'pendente', 'publicada', 'pausada', 'recusada'].includes(o.status)) lista.push(b('encerrar', 'encerrar', 'i-x', 'ocultar'));
  return lista.length ? `<div class="fila-acoes">${lista.join('')}</div>` : '';
}

function abaOportunidades(p) {
  const ops = p.oportunidades || [];
  ops.forEach((o) => { Vitrine.cache.oportunidades[o.id] = o; });
  return `<div class="limite-ops"><div><b>${p.oportunidades_em_uso} de ${p.limite_oportunidades}</b> oportunidades em uso
      <span class="small muted">(esperando aprovação, no ar ou pausadas)</span></div>
      <button class="btn" onclick="abrirFormOportunidade(null)"><svg class="ico"><use href="#i-mais"/></svg>Nova</button></div>
    <div id="op-form-wrap"></div>
    <div class="card">${ops.length ? ops.map((o) => {
      const [rot, cls] = o.vencida && o.status !== 'encerrada' ? ['venceu', 'neutra'] : (STATUS_OP[o.status] || [o.status, '']);
      const [cat] = Vitrine.CATEGORIAS[o.categoria] || Vitrine.CATEGORIAS.outro;
      return `<div class="fila-item">
        <div class="topo"><h4>${esc(o.titulo)}</h4><span class="tag ${cls}">${esc(rot)}</span></div>
        <span class="quem">${esc(cat)} · de ${dataBR(o.inicio)} a ${dataBR(o.fim)}${o.online ? ' · on-line' : o.local ? ' · ' + esc(o.local) : ''}</span>
        ${o.motivo_status && ['recusada', 'suspensa'].includes(o.status) ? `<p class="motivos"><b>Motivo da equipe do EstudeUp:</b> ${esc(o.motivo_status)}</p>` : ''}
        ${o.status === 'pendente' ? '<p class="motivos">A equipe do EstudeUp confere e publica. Se mudar alguma coisa, ela volta pra fila.</p>' : ''}
        ${acoesOportunidade(o)}
      </div>`;
    }).join('') : '<div class="empty">Nenhuma oportunidade ainda. Bolsa, matrícula, aula experimental, evento: toque em "Nova".</div>'}</div>`;
}

function abrirFormOportunidade(id, { manter = false } = {}) {
  const o = id ? (ESC.painel.oportunidades || []).find((x) => x.id === id) : null;
  ESC.editOp = id || 'nova';
  const hoje = hojeISO();
  const d = o || { categoria: 'matricula', inicio: hoje, fim: somaDias(hoje, 30), online: false };
  $('op-form-wrap').innerHTML = `<div class="card form-escola" id="op-form">
    <div class="card-head"><h3>${o ? 'Editar oportunidade' : 'Nova oportunidade'}</h3><button class="link-btn" onclick="fecharFormOportunidade()">fechar</button></div>
    ${o && o.status === 'publicada' ? '<div class="aviso-moderacao espera">Ela está no ar. Se salvar mudanças, sai do ar e volta pra aprovação.</div>' : ''}
    <div class="inline-form on">
      <label for="of-categoria">tipo</label>
      <select id="of-categoria" onchange="avisoRegras()">${Object.entries(Vitrine.CATEGORIAS).map(([k, [rot]]) => `<option value="${k}" ${d.categoria === k ? 'selected' : ''}>${esc(rot)}</option>`).join('')}</select>
      ${campo('of-titulo', 'título', d.titulo, { ph: 'ex: Matrículas 2027 abertas' })}
      <label for="of-descricao">descrição</label><textarea id="of-descricao" rows="4" maxlength="2000" placeholder="o que é, pra quem é e como participar">${esc(d.descricao || '')}</textarea>
      <label for="of-regras">regras e condições <span class="opt" id="of-regras-dica">(quem pode, quanto, até quando)</span></label>
      <textarea id="of-regras" rows="4" maxlength="2000" placeholder="ex: bolsa de 20% a 50% conforme a nota da prova; válida para 2027; inscrição até 19/11">${esc(d.regras || '')}</textarea>
      <div class="linha-2"><div><label for="of-inicio">começa</label><input type="date" id="of-inicio" value="${esc(String(d.inicio).slice(0, 10))}"></div>
        <div><label for="of-fim">termina</label><input type="date" id="of-fim" value="${esc(String(d.fim).slice(0, 10))}"></div></div>
      ${campo('of-local', 'onde', d.local, { ph: 'ex: sede da escola' })}
      <label class="check-linha"><input type="checkbox" id="of-online" ${d.online ? 'checked' : ''}> também é on-line</label>
      ${campo('of-link', 'link pra saber mais', d.link, { tipo: 'url', max: 300, dica: '(opcional)', ph: 'https://' })}
      ${campo('of-contato', 'WhatsApp desta oportunidade', d.contato && d.contato !== ESC.painel.whatsapp ? d.contato : '', { tipo: 'tel', max: 20, dica: '(opcional: se ficar vazio, usa o da escola)' })}
      <label>imagem <span class="opt">(opcional, aparece no topo do cartão)</span></label>
      <div class="img-escolha op"><div class="img-prev op" id="of-img-prev" ${Vitrine.linkOk(d.imagem_url) ? `style="background-image:url('${esc(d.imagem_url)}')"` : ''}></div>
        <div class="new-group-row" style="margin:0"><button class="ghost-btn" onclick="$('of-img-arq').click()"><svg class="ico"><use href="#i-imagem"/></svg>escolher imagem</button>
        <button class="ghost-btn" onclick="tirarImagemOportunidade()"><svg class="ico"><use href="#i-x"/></svg>sem imagem</button></div>
        <input type="file" id="of-img-arq" accept="image/png,image/jpeg,image/webp" hidden onchange="imagemOportunidade(event)">
        <input type="hidden" id="of-imagem-url" value="${esc(d.imagem_url || '')}"></div>
      <p class="small muted" style="margin:8px 0 10px">Escreva só o que a escola garante. Bolsa e desconto precisam das regras completas. A equipe do EstudeUp confere antes de publicar.</p>
      <div class="dois-botoes">
        <button class="ghost-btn" id="btn-of-rascunho" onclick="salvarOportunidade(false)">Salvar rascunho</button>
        <button class="btn coral" id="btn-of-enviar" onclick="salvarOportunidade(true)">Mandar pra aprovação</button>
      </div>
    </div>
  </div>`;
  avisoRegras();
  if (!manter) $('op-form').scrollIntoView({ behavior: Fx.reduz() ? 'auto' : 'smooth', block: 'start' });
}

function fecharFormOportunidade() { ESC.editOp = null; $('op-form-wrap').innerHTML = ''; }

function avisoRegras() {
  const c = $('of-categoria').value;
  $('of-regras-dica').textContent = ['bolsa', 'desconto'].includes(c) ? '(obrigatório pra bolsa e desconto: quem pode, quanto, até quando)' : '(quem pode, quanto, até quando)';
}

async function imagemOportunidade(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const prev = $('of-img-prev');
  prev.classList.add('enviando');
  try {
    const url = await enviarImagemEscola(file, 'op');
    $('of-imagem-url').value = url;
    prev.style.backgroundImage = `url('${url}')`;
  } catch (err) { falhou(err, 'Não consegui enviar a imagem'); } finally { prev.classList.remove('enviando'); }
}

function tirarImagemOportunidade() { $('of-imagem-url').value = ''; $('of-img-prev').style.backgroundImage = ''; }

async function salvarOportunidade(enviar) {
  const v = (id) => $(id).value.trim();
  const dados = {
    titulo: v('of-titulo'), categoria: $('of-categoria').value, descricao: v('of-descricao'), regras: v('of-regras'),
    inicio: $('of-inicio').value, fim: $('of-fim').value, local: v('of-local'), online: $('of-online').checked,
    link: v('of-link'), contato: v('of-contato'), imagem_url: v('of-imagem-url'),
  };
  if (dados.titulo.length < 4) return avisar('dá um título pra oportunidade');
  if (dados.descricao.length < 10) return avisar('descreve a oportunidade (pelo menos uma frase)');
  if (!dados.inicio || !dados.fim) return avisar('escolhe o começo e o fim');
  if (dados.fim < dados.inicio) return avisar('o fim precisa ser depois do começo');
  if (['bolsa', 'desconto'].includes(dados.categoria) && dados.regras.length < 10) return avisar('bolsa e desconto precisam das regras e condições: quem pode, quanto e até quando');
  if (dados.link && !/^https?:\/\//i.test(dados.link)) return avisar('o link precisa começar com https://');
  const id = ESC.editOp && ESC.editOp !== 'nova' ? ESC.editOp : null;
  const btn = $(enviar ? 'btn-of-enviar' : 'btn-of-rascunho');
  const pronto = ocupado(btn, enviar ? 'Mandando...' : 'Salvando...');
  try {
    const r = await rpc('be_oportunidade_salvar', { p_id: id, p_inst: ESC.instId, p_dados: dados, p_enviar: enviar });
    ESC.editOp = null;
    toast(r.status === 'pendente' ? 'Mandada pra aprovação' : 'Rascunho salvo');
    verMinhaEscola(ESC.instId);
  } catch (err) { falhou(err, 'Não consegui salvar'); } finally { pronto(); }
}

async function acaoOportunidade(id, acao, btn) {
  const o = (ESC.painel.oportunidades || []).find((x) => x.id === id);
  if (acao === 'encerrar' && !(await confirmar(`Encerrar "${o ? o.titulo : 'essa oportunidade'}"?\nEla sai do mural e não dá pra voltar (dá pra criar outra).`, { sim: 'Encerrar' }))) return;
  if (btn) btn.disabled = true;
  try {
    await rpc('be_oportunidade_acao', { p_id: id, p_acao: acao });
    toast({ pausar: 'Pausada', retomar: 'De volta no ar', encerrar: 'Encerrada', enviar: 'Mandada pra aprovação' }[acao] || 'Pronto');
    ESC.home = null;
    verMinhaEscola(ESC.instId);
  } catch (err) { if (btn) btn.disabled = false; falhou(err); }
}

/* ---------- turmas, professores e plano ---------- */
function abaTurmas(p) {
  const turmas = p.turmas || [];
  return `<div class="limite-ops"><div><b>${qtd(turmas.length, 'turma', 'turmas')}</b> · ${qtd(p.alunos_total, 'aluno', 'alunos')}</div>
      <button class="btn" onclick="criarTurmaDaEscola()"><svg class="ico"><use href="#i-mais"/></svg>Turma</button></div>
    <div class="card">${turmas.length ? turmas.map((t) => {
      const dom = t.dominio === null || t.dominio === undefined ? null : Math.round(t.dominio * 100);
      return `<div class="turma-linha">
        <div class="turma-info"><b>${esc(t.nome)}</b><span>${esc(t.materia || 'sem matéria')} · prof. ${esc(t.professor)}</span>
          <span>${qtd(t.alunos, 'aluno', 'alunos')} · ${qtd(t.ativos_7d, 'estudou', 'estudaram')} na semana${dom !== null ? ` · domínio médio ${dom}%` : ''}</span>
          ${dom !== null ? `<div class="mastery-track"><div class="mastery-fill ${dom < 40 ? 'lo' : dom < 70 ? 'mid' : 'hi'}" style="width:${Math.max(dom, 3)}%"></div></div>` : ''}</div>
        ${t.minha ? `<button class="link-btn" onclick="abrirPainel('${t.id}')">painel</button>` : ''}
      </div>`;
    }).join('') : '<div class="empty">Nenhuma turma da escola ainda. Professores da escola criam turmas em "Turmas e grupos" escolhendo a escola.</div>'}</div>
    <p class="small muted">Aqui só aparecem números da turma inteira. O desempenho de cada aluno fica no painel da turma, só pro professor dela.</p>`;
}

function abaProfessores(p) {
  const profs = p.professores || [];
  return `<div class="card">
    <div class="card-head"><h3>Código de professor</h3><span class="hand">só pra quem dá aula na escola</span></div>
    <div class="code-chip grande">${esc(p.codigo_professor || '—')} <span class="copy" onclick="copiarCodigo('${esc(p.codigo_professor || '')}')">copiar</span></div>
    <p class="small muted" style="margin:10px 0">O professor cria a conta no EstudeUp, vai em Perfil → "tenho código" e digita esse código. Depois disso, as turmas que ele criar podem ser da escola.</p>
    <button class="ghost-btn" onclick="novoCodigoProfessor()"><svg class="ico"><use href="#i-refazer"/></svg>gerar código novo</button>
  </div>
  <div class="card"><div class="card-head"><h3>Equipe</h3><span class="hand">${qtd(profs.length, 'pessoa', 'pessoas')}</span></div>
    ${profs.map((u) => `<div class="hist-row" style="cursor:default"><span><b>${esc(u.nome)}</b><br><span class="small muted">${u.papel === 'gestor' ? 'gestor(a) da página' : 'professor(a)'}</span></span>
      ${u.papel === 'professor' ? `<button class="link-btn" onclick="tirarProfessor('${u.id}')">tirar da escola</button>` : ''}</div>`).join('') || '<div class="empty">ninguém ainda</div>'}
  </div>`;
}

async function novoCodigoProfessor() {
  if (!(await confirmar('Gerar um código novo?\nO código de agora para de funcionar; quem já entrou continua na escola.', { sim: 'Gerar' }))) return;
  try {
    const c = await rpc('be_escola_codigo_novo', { p_inst: ESC.instId });
    toast('Código novo: ' + c);
    verMinhaEscola(ESC.instId);
  } catch (err) { falhou(err); }
}

async function tirarProfessor(id) {
  const u = (ESC.painel.professores || []).find((x) => x.id === id);
  if (!(await confirmar(`Tirar ${u ? u.nome : 'essa pessoa'} da escola?\nAs turmas que ela criou continuam com ela.`, { sim: 'Tirar' }))) return;
  try { await rpc('be_escola_tirar_professor', { p_inst: ESC.instId, p_usuario: id }); toast('Pronto'); verMinhaEscola(ESC.instId); } catch (err) { falhou(err); }
}

function abaPlano(p) {
  const pl = p.plano;
  const c = p.contrato;
  return `<div class="card plano-escola">
    ${pl ? `<div class="card-head"><h3>Plano ${esc(pl.nome)}</h3><span class="tag-plano">ativo</span></div>
      <ul class="lista-recursos">${(pl.recursos || []).map((r) => `<li><svg class="ico"><use href="#i-check"/></svg>${esc(r)}</li>`).join('')}</ul>
      <p class="small muted">Até ${qtd(pl.limite_oportunidades, 'oportunidade', 'oportunidades')} no ar ao mesmo tempo${pl.limite_alunos ? ` · até ${qtd(pl.limite_alunos, 'aluno', 'alunos')} nas turmas` : ' · alunos sem limite'}.</p>`
    : `<div class="card-head"><h3>Sem plano ativo</h3></div>
      <p>A página da escola funciona e dá pra ter ${qtd(p.limite_oportunidades, 'oportunidade', 'oportunidades')} no ar por vez. Com um plano, a escola ganha mais oportunidades, destaque no mural e relatórios.</p>`}
    ${c ? `<dl class="escola-dados">
      <dt>Contrato</dt><dd>${esc(STATUS_CONTRATO[c.status] || c.status)}</dd>
      <dt>Pagamento</dt><dd>${esc(STATUS_PAGAMENTO[c.pagamento] || c.pagamento)}</dd>
      ${c.vigencia_inicio || c.vigencia_fim ? `<dt>Vigência</dt><dd>${dataBR(c.vigencia_inicio) || '—'} a ${dataBR(c.vigencia_fim) || 'sem data'}</dd>` : ''}
    </dl>` : ''}
    <p class="small muted" style="margin-top:12px">Planos e pagamento são combinados direto com a equipe do EstudeUp. Nenhum pagamento é feito pelo app.</p>
    <button class="btn coral full" onclick="falarComEquipe()"><svg class="ico"><use href="#i-whatsapp"/></svg>Falar com a equipe do EstudeUp</button>
  </div>`;
}

async function falarComEquipe() {
  let c = {};
  try { c = await rpc('be_vitrine_config'); } catch (_) { /* sem config */ }
  const nome = ESC.painel ? ESC.painel.nome : '';
  if (c.whatsapp_comercial) { window.open(Vitrine.whatsappLink(c.whatsapp_comercial, `Olá! Sou da ${nome} e quero falar sobre o plano no EstudeUp.`), '_blank', 'noopener'); return; }
  if (c.email_comercial) { location.href = `mailto:${c.email_comercial}?subject=${encodeURIComponent('Plano da ' + nome + ' no EstudeUp')}`; return; }
  avisar('O contato comercial ainda não foi configurado. Usa o formulário da página "Para escolas".');
}

/* ===================== ÁREA COMERCIAL (conta do criador) ===================== */
function pintarAtalhoComercial(c) {
  const alvo = $('criador-comercial');
  if (!alvo) return;
  const partes = c ? [
    c.escolas_pendentes && qtd(c.escolas_pendentes, 'escola esperando', 'escolas esperando'),
    c.oportunidades_pendentes && qtd(c.oportunidades_pendentes, 'oportunidade pra aprovar', 'oportunidades pra aprovar'),
    c.leads_novos && qtd(c.leads_novos, 'contato novo', 'contatos novos'),
  ].filter(Boolean) : [];
  alvo.innerHTML = `<button class="criador-atalho comercial" onclick="verComercial()">
    <img class="adesivo" src="adesivos/escola.webp" alt="">
    <span><b>Área comercial</b><small>${partes.length ? esc(partes.join(' · ')) : 'escolas, mural, contatos e planos: tudo em dia'}</small></span>
    <svg class="ico"><use href="#i-seta"/></svg></button>`;
}

const ABAS_COM = [['resumo', 'Resumo'], ['escolas', 'Escolas'], ['oportunidades', 'Mural'], ['contatos', 'Contatos'], ['planos', 'Planos'], ['historico', 'Histórico'], ['config', 'Configurar']];

async function verComercial(aba) {
  if (!estado.criador) return verPerfil();
  if (aba) ESC.com.aba = aba;
  go('comercial', { manterScroll: telaAtual() === 'comercial' });
  $('com-abas').innerHTML = ABAS_COM.map(([k, rot]) => `<button class="chip small ${k === ESC.com.aba ? 'sel' : ''}" role="tab" aria-selected="${k === ESC.com.aba}" onclick="verComercial('${k}')">${rot}</button>`).join('');
  const alvo = $('com-conteudo');
  if (!alvo.dataset.aba || alvo.dataset.aba !== ESC.com.aba) alvo.innerHTML = '<div class="loading">carregando...</div>';
  alvo.dataset.aba = ESC.com.aba;
  try {
    const f = { resumo: comResumo, escolas: comEscolas, oportunidades: comOportunidades, contatos: comContatos, planos: comPlanos, historico: comHistorico, config: comConfig }[ESC.com.aba];
    alvo.innerHTML = await f();
  } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

async function comResumo() {
  const d = await rpc('be_admin_comercial', { p_dias: ESC.com.dias });
  const e = d.escolas, o = d.oportunidades, l = d.leads, v = d.eventos;
  const serie = (d.serie || []).map((s) => ({ dia: s.dia, ver: s.ver, cliques: s.cliques, leads: s.leads }));
  return `
    <div class="nums-grupo"><div class="rot">Escolas</div><div class="nums-grade">
      ${caixaNumero(e.aprovadas, 'escola no ar', 'escolas no ar', true)}${caixaNumero(e.pendentes, 'esperando aprovação', 'esperando aprovação')}${caixaNumero(e.ativas, 'contrato ativo', 'contratos ativos')}
    </div></div>
    <div class="nums-grupo"><div class="rot">Mural e contatos</div><div class="nums-grade">
      ${caixaNumero(o.ativas, 'oportunidade no ar', 'oportunidades no ar', true)}${caixaNumero(o.pendentes, 'pra aprovar', 'pra aprovar')}${caixaNumero(l.novos, 'contato novo', 'contatos novos')}
    </div></div>
    <div class="nums-grupo"><div class="rot">Vitrine nos últimos ${d.dias} dias</div><div class="nums-grade">
      ${caixaNumero(v.ver_escola, 'visita em página', 'visitas em páginas', true)}${caixaNumero(v.ver_oportunidade, 'oportunidade aberta', 'oportunidades abertas')}${caixaNumero(v.cliques, 'clique em contato', 'cliques em contato')}
    </div></div>
    <div class="chip-toggle periodo">${[7, 30, 90].map((n) => `<button class="chip small ${ESC.com.dias === n ? 'sel' : ''}" onclick="ESC.com.dias=${n};verComercial('resumo')">${n} dias</button>`).join('')}</div>
    <div class="card graficos">
      ${graficoBarras(serie, 'ver', 'Visitas por dia', 'ver')}
      ${graficoBarras(serie, 'cliques', 'Cliques em contato por dia', 'cliques')}
      ${graficoBarras(serie, 'leads', 'Contatos de escolas por dia', 'leads')}
      <p class="small muted" style="margin:8px 0 0">Escolas, visitas e cliques não contam a escola de demonstração. As oportunidades contam todas, porque as da demonstração também passam pela sua aprovação.</p>
    </div>`;
}

const FILTROS_ESCOLA = [['pendente', 'esperando'], ['aprovada', 'no ar'], ['suspensa', 'suspensas'], ['recusada', 'recusadas'], ['desativada', 'desativadas'], ['', 'todas']];

async function comEscolas() {
  const lista = await rpc('be_admin_escolas', { p_status: ESC.com.escolas || null });
  ESC.com.escolasLista = lista;
  if (!ESC.com.planos.length) { try { ESC.com.planos = await rpc('be_admin_planos'); } catch (_) { /* sem planos */ } }
  return `<div class="chips-rolam" style="margin-bottom:12px">${FILTROS_ESCOLA.map(([k, rot]) => `<button class="chip small ${ESC.com.escolas === k ? 'sel' : ''}" onclick="ESC.com.escolas='${k}';verComercial('escolas')">${rot}</button>`).join('')}</div>
    <button class="ghost-btn" style="margin-bottom:12px" onclick="toggleForm('nova-escola-adm')"><svg class="ico"><use href="#i-mais"/></svg>cadastrar escola</button>
    <div class="inline-form" id="form-nova-escola-adm">
      ${campo('na-nome', 'nome da escola', '')}
      <label for="na-tipo">tipo</label><select id="na-tipo">${Object.entries(Vitrine.TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <div class="linha-2"><div>${campo('na-cidade', 'cidade', '', { max: 80 })}</div><div class="uf">${campo('na-uf', 'UF', '', { max: 2 })}</div></div>
      ${campo('na-gestor', 'e-mail da conta do gestor no EstudeUp', '', { tipo: 'email', max: 160, dica: '(opcional: a pessoa precisa ter conta)' })}
      <label class="check-linha"><input type="checkbox" id="na-demo"> escola de demonstração (não entra nos números)</label>
      <button class="go-btn" id="btn-na" onclick="criarEscolaAdm()">Cadastrar já aprovada</button>
    </div>
    ${lista.length ? lista.map(htmlEscolaAdm).join('') : `<div class="empty">${ESC.com.escolas === 'pendente' ? 'nenhuma escola esperando aprovação' : 'nenhuma escola aqui'}</div>`}`;
}

function htmlEscolaAdm(e) {
  const c = e.contrato || {};
  const st = e.status;
  const b = (acao, rot, cls = '') => `<button class="${cls}" onclick="statusEscolaAdm('${e.id}', '${acao}', this)">${rot}</button>`;
  return `<div class="card escola-adm">
    <div class="escola-resumo">${logoEscola(e, 'escola-atalho-logo')}<div><b>${esc(e.nome)}</b>
      <span class="small muted">${esc(Vitrine.TIPOS[e.tipo] || '')}${e.cidade ? ' · ' + esc(e.cidade) + (e.uf ? '-' + esc(e.uf) : '') : ''} · /${esc(e.slug)}</span></div>
      <span class="tag ${st === 'aprovada' ? 'ok' : st === 'pendente' ? 'leve' : ''}">${esc(STATUS_ESCOLA[st] || st)}</span></div>
    ${e.demo ? '<span class="selo-vitrine demo">demonstração</span>' : ''}
    <dl class="escola-dados compacto">
      <dt>Gestor</dt><dd>${(e.gestores || []).map((g) => `${esc(g.nome)}${g.email ? ` · <a href="mailto:${esc(g.email)}">${esc(g.email)}</a>` : ''}`).join('<br>') || 'nenhum'}</dd>
      <dt>Contato</dt><dd>${[e.whatsapp && `WhatsApp ${esc(e.whatsapp)}`, e.email && esc(e.email)].filter(Boolean).join(' · ') || '—'}</dd>
      <dt>Contrato</dt><dd>${c.status ? `${esc(STATUS_CONTRATO[c.status] || c.status)}${c.plano ? ' · ' + esc(c.plano) : ''} · pagamento ${esc(STATUS_PAGAMENTO[c.pagamento] || c.pagamento)}${c.valor_mensal ? ` · R$ ${Number(c.valor_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}${c.vigencia_fim ? ' · até ' + dataBR(c.vigencia_fim) : ''}` : 'nenhum'}</dd>
      <dt>Mural</dt><dd>${qtd(e.oportunidades_ativas, 'no ar', 'no ar')} · ${qtd(e.oportunidades_pendentes, 'esperando', 'esperando')}</dd>
      <dt>Desde</dt><dd>${dataBR(e.created_at)}${e.aprovada_em ? ' · aprovada em ' + dataBR(e.aprovada_em) : ''}</dd>
    </dl>
    <div class="fila-acoes">
      ${st !== 'aprovada' ? b('aprovada', 'aprovar', 'liberar') : ''}
      ${st === 'pendente' ? b('recusada', 'recusar', 'ocultar') : ''}
      ${st === 'aprovada' ? b('suspensa', 'suspender', 'ocultar') : ''}
      ${st !== 'desativada' ? b('desativada', 'desativar') : ''}
      <button onclick="abrirEscolaApp('${esc(e.slug)}')">ver página</button>
      <button onclick="verMinhaEscola('${e.id}')">abrir painel</button>
      <button onclick="contratoEscolaAdm('${e.id}')">contrato</button>
      <button onclick="gestorEscolaAdm('${e.id}')">ligar gestor</button>
      <button onclick="slugEscolaAdm('${e.id}')">endereço</button>
      <button onclick="demoEscolaAdm('${e.id}', ${!e.demo})">${e.demo ? 'tirar marca de demonstração' : 'marcar como demonstração'}</button>
      <button onclick="notaEscolaAdm('${e.id}')">observação</button>
      <button onclick="historicoEscolaAdm('${e.id}')">histórico</button>
    </div>
    <div id="adm-extra-${e.id}"></div>
  </div>`;
}

async function statusEscolaAdm(id, status, btn) {
  const e = ESC.com.escolasLista.find((x) => x.id === id) || {};
  let motivo = null;
  if (['recusada', 'suspensa', 'desativada'].includes(status)) {
    motivo = await perguntarTexto(`${{ recusada: 'Recusar', suspensa: 'Suspender', desativada: 'Desativar' }[status]} ${e.nome}?\nEscreve o motivo (fica no histórico).`, { ok: 'Confirmar', placeholder: 'motivo' });
    if (motivo === null) return;
    if (motivo.length < 3) return avisar('escreve o motivo');
  } else if (!(await confirmar(`Aprovar ${e.nome}?\nA página vai pro ar e o gestor já pode mandar oportunidades (que você aprova uma a uma).`, { sim: 'Aprovar' }))) return;
  if (btn) btn.disabled = true;
  try { await rpc('be_admin_escola_status', { p_inst: id, p_status: status, p_motivo: motivo }); toast('Pronto'); ESC.filtros = null; ESC.home = null; verComercial('escolas'); }
  catch (err) { if (btn) btn.disabled = false; falhou(err); }
}

async function criarEscolaAdm() {
  const dados = { nome: $('na-nome').value.trim(), tipo: $('na-tipo').value, cidade: $('na-cidade').value.trim(), uf: $('na-uf').value.trim().toUpperCase(), demo: $('na-demo').checked };
  if (dados.nome.length < 3) return avisar('escreve o nome da escola');
  const pronto = ocupado($('btn-na'), 'Cadastrando...');
  try {
    await rpc('be_admin_escola_criar', { p_dados: dados, p_email_gestor: $('na-gestor').value.trim() || null });
    toast('Escola cadastrada');
    ESC.com.escolas = 'aprovada';
    verComercial('escolas');
  } catch (err) { falhou(err, 'Não consegui cadastrar'); } finally { pronto(); }
}

function contratoEscolaAdm(id) {
  const e = ESC.com.escolasLista.find((x) => x.id === id) || {};
  const c = e.contrato || {};
  const sel = (nomeId, mapa, atual) => `<select id="${nomeId}">${Object.entries(mapa).map(([k, v]) => `<option value="${k}" ${atual === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  $('adm-extra-' + id).innerHTML = `<div class="inline-form on contrato-form">
    <label for="ct-plano-${id}">plano</label><select id="ct-plano-${id}"><option value="">sem plano</option>${ESC.com.planos.map((p) => `<option value="${p.id}" ${c.plano_id === p.id ? 'selected' : ''}>${esc(p.nome)}${p.preco_mensal ? ` (R$ ${Number(p.preco_mensal).toLocaleString('pt-BR')})` : ''}</option>`).join('')}</select>
    <div class="linha-2"><div><label for="ct-status-${id}">situação</label>${sel('ct-status-' + id, STATUS_CONTRATO, c.status || 'interessado')}</div>
      <div><label for="ct-pag-${id}">pagamento</label>${sel('ct-pag-' + id, STATUS_PAGAMENTO, c.pagamento || 'nao_se_aplica')}</div></div>
    ${campo('ct-valor-' + id, 'valor combinado por mês (R$)', c.valor_mensal || '', { tipo: 'number', max: 12 })}
    <div class="linha-2"><div><label for="ct-ini-${id}">começa</label><input type="date" id="ct-ini-${id}" value="${esc(c.vigencia_inicio || '')}"></div>
      <div><label for="ct-fim-${id}">termina</label><input type="date" id="ct-fim-${id}" value="${esc(c.vigencia_fim || '')}"></div></div>
    <label for="ct-obs-${id}">observação</label><input type="text" id="ct-obs-${id}" maxlength="1000" value="${esc(c.observacao || '')}">
    <p class="small muted">Registro manual: o app não cobra nem confirma pagamento. Plano só vale com situação "ativo" e dentro da vigência.</p>
    <button class="go-btn" onclick="salvarContratoAdm('${id}', this)">Salvar contrato</button>
  </div>`;
}

async function salvarContratoAdm(id, btn) {
  const v = (k) => $(`ct-${k}-${id}`).value.trim();
  const dados = { plano_id: v('plano'), status: v('status'), pagamento: v('pag'), valor_mensal: v('valor'), vigencia_inicio: v('ini'), vigencia_fim: v('fim'), observacao: v('obs') };
  if (dados.status === 'ativo' && !dados.plano_id) return avisar('contrato ativo precisa de um plano');
  if (dados.vigencia_inicio && dados.vigencia_fim && dados.vigencia_fim < dados.vigencia_inicio) return avisar('o fim da vigência precisa ser depois do começo');
  const pronto = ocupado(btn, 'Salvando...');
  try { await rpc('be_admin_contrato_salvar', { p_inst: id, p_dados: dados }); toast('Contrato salvo'); verComercial('escolas'); } catch (err) { falhou(err); } finally { pronto(); }
}

async function gestorEscolaAdm(id) {
  const email = await perguntarTexto('E-mail da conta do gestor no EstudeUp\n(a pessoa precisa ter criado a conta antes)', { ok: 'Ligar', placeholder: 'email@escola.com.br' });
  if (!email) return;
  try { await rpc('be_admin_escola_gestor', { p_inst: id, p_email: email }); toast('Gestor ligado'); verComercial('escolas'); } catch (err) { falhou(err); }
}

async function slugEscolaAdm(id) {
  const e = ESC.com.escolasLista.find((x) => x.id === id) || {};
  const slug = await perguntarTexto(`Endereço da página (escola.html?e=...)\nAgora: ${e.slug}\nSó letras minúsculas, números e hífen.`, { ok: 'Salvar', placeholder: e.slug });
  if (!slug) return;
  try { await rpc('be_admin_escola_editar', { p_inst: id, p_dados: { slug } }); toast('Endereço salvo'); verComercial('escolas'); } catch (err) { falhou(err); }
}

async function demoEscolaAdm(id, demo) {
  const e = ESC.com.escolasLista.find((x) => x.id === id) || {};
  if (!(await confirmar(demo ? `Marcar ${e.nome} como escola de demonstração?\nEla ganha o aviso de fictícia e sai dos números.` : `Tirar a marca de demonstração de ${e.nome}?\nEla passa a contar nos números como escola de verdade.`, { sim: 'Confirmar' }))) return;
  try { await rpc('be_admin_escola_editar', { p_inst: id, p_dados: { demo } }); toast('Pronto'); verComercial('escolas'); } catch (err) { falhou(err); }
}

async function notaEscolaAdm(id) {
  const t = await perguntarTexto('Observação sobre a escola (fica no histórico, só a equipe vê)', { ok: 'Salvar', placeholder: 'ex: ligar de novo na segunda' });
  if (!t) return;
  try { await rpc('be_admin_nota', { p_inst: id, p_texto: t }); toast('Observação salva'); } catch (err) { falhou(err); }
}

async function historicoEscolaAdm(id) {
  const alvo = $('adm-extra-' + id);
  alvo.innerHTML = '<div class="loading">carregando...</div>';
  try { const l = await rpc('be_admin_registro', { p_inst: id, p_limite: 40 }); alvo.innerHTML = htmlRegistro(l); } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

const ROTULO_ACAO = {
  escola_solicitada: 'pediu o cadastro da escola', escola_criada: 'cadastrou a escola', escola_aprovada: 'aprovou a escola', escola_recusada: 'recusou a escola',
  escola_suspensa: 'suspendeu a escola', escola_desativada: 'desativou a escola', escola_pendente: 'voltou a escola pra análise', escola_editada: 'editou a página',
  gestor_ligado: 'ligou um gestor', professor_entrou: 'entrou como professor', professor_removido: 'tirou um professor', codigo_professor_novo: 'gerou código de professor novo',
  oportunidade_criada: 'criou uma oportunidade', oportunidade_editada: 'editou uma oportunidade', oportunidade_publicada: 'publicou uma oportunidade',
  oportunidade_recusada: 'recusou uma oportunidade', oportunidade_suspensa: 'suspendeu uma oportunidade', oportunidade_encerrada: 'encerrou uma oportunidade',
  oportunidade_pendente: 'voltou uma oportunidade pra fila', oportunidade_pausar: 'pausou uma oportunidade', oportunidade_retomar: 'voltou uma oportunidade pro ar',
  oportunidade_encerrar: 'encerrou uma oportunidade', oportunidade_enviar: 'mandou uma oportunidade pra aprovação', contrato_salvo: 'salvou o contrato',
  observacao: 'anotou', plano_salvo: 'salvou um plano', config_salva: 'mudou as configurações', lead_em_contato: 'marcou contato como em contato',
  lead_convertido: 'marcou contato como convertido', lead_descartado: 'descartou um contato', lead_novo: 'voltou um contato pra novo',
};

function htmlRegistro(lista) {
  if (!lista.length) return '<div class="empty">nada registrado ainda</div>';
  return `<div class="registro">${lista.map((r) => {
    const d = r.detalhe || {};
    const extra = d.texto || d.motivo || d.titulo || '';
    return `<div class="registro-linha"><span class="quando">${dataHoraBR(r.created_at)}</span>
      <span><b>${esc(r.quem || 'sistema')}</b> <span class="muted">(${esc(r.papel)})</span> ${esc(ROTULO_ACAO[r.acao] || r.acao.replace(/_/g, ' '))}${r.escola ? ` · ${esc(r.escola)}` : ''}${extra ? `<br><span class="small muted">${esc(String(extra))}</span>` : ''}</span></div>`;
  }).join('')}</div>`;
}

const FILTROS_OP = [['pendente', 'pra aprovar'], ['publicada', 'no ar'], ['pausada', 'pausadas'], ['recusada', 'recusadas'], ['suspensa', 'suspensas'], ['encerrada', 'encerradas'], ['', 'todas']];

async function comOportunidades() {
  const lista = await rpc('be_admin_oportunidades', { p_status: ESC.com.ops || null });
  ESC.com.opsLista = lista;
  lista.forEach((o) => { Vitrine.cache.oportunidades[o.id] = o; });
  return `<div class="chips-rolam" style="margin-bottom:12px">${FILTROS_OP.map(([k, rot]) => `<button class="chip small ${ESC.com.ops === k ? 'sel' : ''}" onclick="ESC.com.ops='${k}';verComercial('oportunidades')">${rot}</button>`).join('')}</div>
    ${lista.length ? lista.map((o) => {
      const [rot, cls] = STATUS_OP[o.status] || [o.status, ''];
      const [cat] = Vitrine.CATEGORIAS[o.categoria] || Vitrine.CATEGORIAS.outro;
      const b = (st, r, c = '') => `<button class="${c}" onclick="statusOportunidadeAdm('${o.id}', '${st}', this)">${r}</button>`;
      return `<div class="card op-adm">
        ${Vitrine.linkOk(o.imagem_url) ? `<img class="op-adm-img" src="${esc(o.imagem_url)}" alt="">` : ''}
        <div class="topo"><h4>${esc(o.titulo)}</h4><span class="tag ${o.vencida ? 'neutra' : cls}">${o.vencida ? 'venceu' : esc(rot)}</span></div>
        <span class="quem">${esc(o.escola.nome)}${o.escola.demo ? ' (demonstração)' : ''} · ${esc(cat)} · ${dataBR(o.inicio)} a ${dataBR(o.fim)}${o.escola_status !== 'aprovada' ? ` · escola ${esc(STATUS_ESCOLA[o.escola_status] || o.escola_status)}` : ''}</span>
        <p class="texto">${esc(o.descricao)}</p>
        ${o.regras ? `<p class="texto"><b>Regras:</b> ${esc(o.regras)}</p>` : ['bolsa', 'desconto'].includes(o.categoria) ? '<p class="motivos">Sem regras escritas: não publique bolsa ou desconto sem condições.</p>' : ''}
        <span class="quem">${o.online ? 'on-line' : esc(o.local || '')}${o.link ? ` · <a href="${esc(o.link)}" target="_blank" rel="noopener">link</a>` : ''}${o.contato ? ` · WhatsApp ${esc(o.contato)}` : ''}</span>
        ${o.motivo_status ? `<p class="motivos">Motivo: ${esc(o.motivo_status)}</p>` : ''}
        <div class="fila-acoes">
          ${['pendente', 'recusada', 'suspensa', 'pausada'].includes(o.status) && !o.vencida ? b('publicada', 'publicar', 'liberar') : ''}
          ${o.status === 'pendente' ? b('recusada', 'recusar', 'ocultar') : ''}
          ${o.status === 'publicada' ? b('suspensa', 'suspender', 'ocultar') : ''}
          ${!['encerrada'].includes(o.status) ? b('encerrada', 'encerrar') : ''}
          <button onclick="Vitrine.detalhes('${o.id}')">ver como aparece</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty">nenhuma oportunidade aqui</div>'}`;
}

async function statusOportunidadeAdm(id, status, btn) {
  const o = ESC.com.opsLista.find((x) => x.id === id) || {};
  let motivo = null;
  if (['recusada', 'suspensa'].includes(status)) {
    motivo = await perguntarTexto(`${status === 'recusada' ? 'Recusar' : 'Suspender'} "${o.titulo}"?\nEscreve o motivo: a escola vê.`, { ok: 'Confirmar', placeholder: 'ex: faltam as regras da bolsa' });
    if (motivo === null) return;
    if (motivo.length < 3) return avisar('escreve o motivo');
  } else if (status === 'publicada' && !(await confirmar(`Publicar "${o.titulo}"?\nConferiu as condições? Vai pro mural na hora.`, { sim: 'Publicar' }))) return;
  else if (status === 'encerrada' && !(await confirmar(`Encerrar "${o.titulo}"?`, { sim: 'Encerrar' }))) return;
  if (btn) btn.disabled = true;
  try { await rpc('be_admin_oportunidade_status', { p_id: id, p_status: status, p_motivo: motivo }); toast('Pronto'); ESC.home = null; ESC.filtros = null; verComercial('oportunidades'); }
  catch (err) { if (btn) btn.disabled = false; falhou(err); }
}

const FILTROS_LEAD = [['novo', 'novos'], ['em_contato', 'em contato'], ['convertido', 'viraram escola'], ['descartado', 'descartados'], ['', 'todos']];

async function comContatos() {
  const lista = await rpc('be_admin_leads', { p_status: ESC.com.leads || null });
  ESC.com.leadsLista = lista;
  return `<div class="chips-rolam" style="margin-bottom:12px">${FILTROS_LEAD.map(([k, rot]) => `<button class="chip small ${ESC.com.leads === k ? 'sel' : ''}" onclick="ESC.com.leads='${k}';verComercial('contatos')">${rot}</button>`).join('')}</div>
    <p class="small muted">Contatos do formulário "Para escolas". Use só pra responder à escola: foi isso que a pessoa autorizou.</p>
    ${lista.length ? lista.map((l) => `<div class="card lead">
      <div class="topo"><h4>${esc(l.instituicao)}</h4><span class="tag ${l.status === 'novo' ? 'leve' : l.status === 'convertido' ? 'ok' : 'neutra'}">${esc(STATUS_LEAD[l.status] || l.status)}</span></div>
      <span class="quem">${esc(l.responsavel)} · ${esc(Vitrine.TIPOS[l.tipo] || l.tipo)} · ${esc(l.cidade)} · ${dataHoraBR(l.created_at)}</span>
      <div class="redes" style="margin:8px 0">
        <a class="rede" href="${esc(Vitrine.whatsappLink(l.telefone, `Olá, ${l.responsavel}! Aqui é do EstudeUp, recebemos seu contato sobre a ${l.instituicao}.`))}" target="_blank" rel="noopener"><svg class="ico"><use href="#i-whatsapp"/></svg>${esc(l.telefone)}</a>
        <a class="rede" href="mailto:${esc(l.email)}?subject=${encodeURIComponent('EstudeUp para a ' + l.instituicao)}"><svg class="ico"><use href="#i-email"/></svg>${esc(l.email)}</a>
      </div>
      ${l.mensagem ? `<p class="texto">“${esc(l.mensagem)}”</p>` : ''}
      ${l.nota ? `<p class="motivos"><b>Nota:</b> ${esc(l.nota)}</p>` : ''}
      <p class="small muted">Autorização: “${esc(l.consentimento_texto)}”</p>
      <div class="fila-acoes">${Object.entries(STATUS_LEAD).filter(([k]) => k !== l.status).map(([k, rot]) => `<button onclick="statusLeadAdm('${l.id}', '${k}')">${rot}</button>`).join('')}
        <button onclick="notaLeadAdm('${l.id}')">anotar</button></div>
    </div>`).join('') : '<div class="empty">nenhum contato aqui</div>'}`;
}

async function statusLeadAdm(id, status) {
  try { await rpc('be_admin_lead_status', { p_id: id, p_status: status, p_nota: null }); toast('Pronto'); verComercial('contatos'); } catch (err) { falhou(err); }
}

async function notaLeadAdm(id) {
  const l = ESC.com.leadsLista.find((x) => x.id === id) || {};
  const t = await perguntarTexto('Nota sobre esse contato (só a equipe vê)', { ok: 'Salvar', placeholder: 'ex: apresentação marcada na quinta' });
  if (!t) return;
  try { await rpc('be_admin_lead_status', { p_id: id, p_status: l.status || 'em_contato', p_nota: t }); toast('Nota salva'); verComercial('contatos'); } catch (err) { falhou(err); }
}

async function comPlanos() {
  const lista = await rpc('be_admin_planos');
  ESC.com.planos = lista;
  return `<p class="small muted">Os valores são de referência: ajuste quando quiser. Na página "Para escolas" o preço só aparece se você ligar "mostrar preços" em Configurar.</p>
    ${lista.map((p) => formPlano(p)).join('')}
    <button class="ghost-btn" onclick="this.insertAdjacentHTML('beforebegin', formPlano({ id: '', recursos: [], limite_oportunidades: 1, destaque: 0, relatorios: 'basico', ativo: true }));this.remove()"><svg class="ico"><use href="#i-mais"/></svg>novo plano</button>`;
}

function formPlano(p) {
  const id = p.id || 'novo';
  return `<div class="card form-escola"><div class="card-head"><h3>${esc(p.nome || 'Plano novo')}</h3><span class="hand">${p.id ? qtd(p.escolas, 'escola ativa', 'escolas ativas') : ''}</span></div>
    <div class="inline-form on">
      ${campo('pl-nome-' + id, 'nome', p.nome, { max: 60 })}
      ${campo('pl-desc-' + id, 'descrição curta', p.descricao, { max: 500 })}
      <div class="linha-2"><div>${campo('pl-preco-' + id, 'preço por mês (R$)', p.preco_mensal ?? '', { tipo: 'number', max: 10 })}</div>
        <div>${campo('pl-ops-' + id, 'oportunidades no ar', p.limite_oportunidades, { tipo: 'number', max: 3 })}</div></div>
      <div class="linha-2"><div>${campo('pl-alunos-' + id, 'limite de alunos', p.limite_alunos ?? '', { tipo: 'number', max: 6, dica: '(vazio = sem limite)' })}</div>
        <div><label for="pl-dest-${id}">destaque no mural</label><select id="pl-dest-${id}">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${Number(p.destaque) === n ? 'selected' : ''}>${['nenhum', 'destaque', 'destaque maior', 'máximo'][n]}</option>`).join('')}</select></div></div>
      <label for="pl-rel-${id}">relatórios</label><select id="pl-rel-${id}">${[['basico', 'básico'], ['ampliado', 'ampliado'], ['completo', 'completo']].map(([k, v]) => `<option value="${k}" ${p.relatorios === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label for="pl-rec-${id}">o que inclui <span class="opt">(um por linha)</span></label>
      <textarea id="pl-rec-${id}" rows="4">${esc((p.recursos || []).join('\n'))}</textarea>
      <label class="check-linha"><input type="checkbox" id="pl-ativo-${id}" ${p.ativo !== false ? 'checked' : ''}> oferecer esse plano</label>
      <button class="go-btn" onclick="salvarPlanoAdm('${p.id || ''}', this)">Salvar plano</button>
    </div></div>`;
}

async function salvarPlanoAdm(id, btn) {
  const k = id || 'novo';
  const v = (c) => $(`pl-${c}-${k}`).value.trim();
  const dados = {
    nome: v('nome'), descricao: v('desc'), preco_mensal: v('preco'), limite_oportunidades: v('ops'), limite_alunos: v('alunos'),
    destaque: v('dest'), relatorios: v('rel'), recursos: v('rec').split('\n').map((x) => x.trim()).filter(Boolean), ativo: $(`pl-ativo-${k}`).checked,
  };
  if (dados.nome.length < 2) return avisar('dá um nome pro plano');
  const pronto = ocupado(btn, 'Salvando...');
  try { await rpc('be_admin_plano_salvar', { p_id: id || null, p_dados: dados }); toast('Plano salvo'); verComercial('planos'); } catch (err) { falhou(err); } finally { pronto(); }
}

async function comHistorico() {
  const l = await rpc('be_admin_registro', { p_inst: null, p_limite: 120 });
  return `<div class="card">${htmlRegistro(l)}</div>`;
}

async function comConfig() {
  const d = await rpc('be_admin_comercial', { p_dias: 7 });
  const c = d.config || {};
  return `<div class="card form-escola"><div class="card-head"><h3>Contato comercial do EstudeUp</h3><span class="hand">aparece em "Para escolas"</span></div>
    <div class="inline-form on">
      ${campo('cf-zap', 'WhatsApp comercial', c.whatsapp_comercial, { tipo: 'tel', max: 20, ph: '(41) 99999-0000' })}
      ${campo('cf-email', 'e-mail comercial', c.email_comercial, { tipo: 'email', max: 160 })}
      ${campo('cf-msg', 'mensagem pronta do WhatsApp', c.mensagem_whatsapp, { max: 300 })}
      <label for="cf-precos">mostrar preços dos planos na página pública</label>
      <select id="cf-precos"><option value="nao" ${c.mostrar_precos !== 'sim' ? 'selected' : ''}>não (valor na apresentação)</option><option value="sim" ${c.mostrar_precos === 'sim' ? 'selected' : ''}>sim</option></select>
      ${campo('cf-limite', 'oportunidades no ar pra escola sem plano', c.limite_sem_plano ?? '1', { tipo: 'number', max: 2 })}
      <button class="go-btn" id="btn-cf" onclick="salvarConfigAdm()">Salvar</button>
    </div></div>`;
}

async function salvarConfigAdm() {
  const dados = {
    whatsapp_comercial: $('cf-zap').value.trim(), email_comercial: $('cf-email').value.trim(), mensagem_whatsapp: $('cf-msg').value.trim(),
    mostrar_precos: $('cf-precos').value, limite_sem_plano: $('cf-limite').value.trim() || '1',
  };
  const dig = dados.whatsapp_comercial.replace(/\D/g, '');
  if (dig && (dig.length < 10 || dig.length > 13)) return avisar('confere o WhatsApp com DDD');
  const pronto = ocupado($('btn-cf'), 'Salvando...');
  try { await rpc('be_admin_config_salvar', { p_dados: dados }); toast('Configurações salvas'); } catch (err) { falhou(err); } finally { pronto(); }
}
