/* Estude+ — biblioteca de resumos feitos por alunos: busca, curtidas, salvos, seguir autor e publicar (com moderação). */

const bib = { ordem: 'populares', offset: 0, timer: null, atual: null, materiasCarregadas: false, publicar: { cor: 'azul', cartoes: [], materiaId: null, voltar: null } };
const CORES_RESUMO = ['azul', 'verde', 'rosa', 'laranja', 'roxo', 'amarelo'];
const ico = (id, tam = 14) => `<svg class="ico" style="width:${tam}px;height:${tam}px"><use href="#${id}"/></svg>`;

// igual a be_nome_publico / be_iniciais no banco: "Ana Souza" vira "Ana S." e "AS"
function nomePublico(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return { nome: 'você', iniciais: '?' };
  const ult = partes.length > 1 ? partes[partes.length - 1] : '';
  return {
    nome: partes[0] + (ult ? ' ' + ult[0].toUpperCase() + '.' : ''),
    iniciais: (partes[0][0] + (ult ? ult[0] : '')).toUpperCase(),
  };
}

function htmlCapa(r) {
  const status = r.meu && r.status && r.status !== 'publicado'
    ? `<span class="capa-status">${r.status === 'recusado' ? 'não publicado' : 'em revisão'}</span>` : '';
  const autor = r.autor || {};
  return `<button class="capa-resumo cor-${esc(r.cor || 'azul')}" onclick="abrirResumo('${r.id}')">${status}
    <div class="capa-topo"><span class="mat">${esc(r.materia)}${r.serie ? ' · ' + esc(r.serie) : ''}</span><div class="tit">${esc(r.titulo)}</div></div>
    <div class="capa-base">${r.trecho ? `<div class="trecho">${esc(r.trecho.replace(/[#*]/g, ''))}</div>` : ''}
      <div class="autor"><span class="avatar">${esc(autor.iniciais || '?')}</span><span>${esc(autor.nome || '')}</span></div>
      <div class="nums"><span class="${r.eu_curti ? 'curti' : ''}">${ico('i-coracao')} ${r.curtidas || 0}</span><span>${ico('i-olho')} ${r.visualizacoes || 0}</span>${r.n_cartoes ? `<span>${ico('i-cards')} ${r.n_cartoes}</span>` : ''}</div>
    </div></button>`;
}

/* ---------- lista ---------- */
function verBiblioteca(manter = false) {
  go('biblioteca', { manterScroll: manter });
  carregarMateriasBiblioteca();
  if (!manter || !$('bib-lista').querySelector('.capa-resumo')) carregarBiblioteca();
}

function ordemBiblioteca(o) {
  bib.ordem = o;
  document.querySelectorAll('#bib-ordem button').forEach((b) => b.classList.toggle('on', b.dataset.o === o));
  carregarBiblioteca();
}

function buscarBibliotecaDepois() {
  clearTimeout(bib.timer);
  bib.timer = setTimeout(() => carregarBiblioteca(), 350);
}

async function carregarMateriasBiblioteca() {
  if (bib.materiasCarregadas) return;
  try {
    const lista = await rpc('be_materias_biblioteca');
    const sel = $('bib-materia');
    const atual = sel.value;
    sel.innerHTML = '<option value="">todas as matérias</option>' + lista.map((m) => `<option value="${esc(m.materia)}">${esc(m.materia)} (${m.n})</option>`).join('');
    sel.value = atual;
    bib.materiasCarregadas = true;
  } catch (_) { /* o filtro fica só com "todas" */ }
}

const VAZIO_BIB = {
  populares: 'A biblioteca está começando. Publica o primeiro resumo da sua matéria e ajuda a galera!',
  recentes: 'Nenhum resumo novo por aqui ainda.',
  seguindo: 'Você ainda não segue ninguém. Abre um resumo que você curtiu e toca em Seguir.',
  salvos: 'Toca em Salvar num resumo pra guardar ele aqui.',
  meus: 'Você ainda não publicou nada. Que tal começar pelo resumo de uma matéria sua?',
};

async function carregarBiblioteca(mais = false) {
  const lista = $('bib-lista');
  if (!mais) { bib.offset = 0; lista.innerHTML = '<div class="loading">carregando...</div>'; }
  const busca = $('bib-busca').value.trim();
  let itens;
  try {
    itens = await rpc('be_feed_resumos', {
      p_busca: busca || null, p_materia: $('bib-materia').value || null, p_serie: $('bib-serie').value || null,
      p_ordem: bib.ordem, p_limite: 20, p_offset: bib.offset,
    });
  } catch (err) { lista.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(err.message)}</div>`; return; }
  const html = itens.map(htmlCapa).join('');
  if (!mais) {
    lista.innerHTML = html || `<div class="empty" style="grid-column:1/-1">${busca ? 'Nada encontrado pra essa busca. Tenta outra palavra.' : VAZIO_BIB[bib.ordem]}</div>`;
  } else lista.insertAdjacentHTML('beforeend', html);
  bib.offset += itens.length;
  $('bib-mais').hidden = itens.length < 20;
}

async function carregarHomeBiblio() {
  const alvo = $('home-biblio');
  try {
    const itens = await rpc('be_feed_resumos', { p_ordem: 'populares', p_limite: 8 });
    alvo.innerHTML = itens.length
      ? `<div class="section-title"><h2>Em alta na biblioteca</h2><button class="link-btn" onclick="verBiblioteca()">ver tudo</button></div><div class="rolagem">${itens.map(htmlCapa).join('')}</div>`
      : `<div class="section-title"><h2>Biblioteca de resumos</h2></div><div class="upload-cta" onclick="novoResumo()" role="button" tabindex="0"><h3>Seja o primeiro a publicar</h3><p>Compartilha um resumo seu e ganha 25 XP, mais 2 XP a cada curtida.</p><button class="upload-btn">${ico('i-mais', 20)}Publicar resumo</button></div>`;
  } catch (_) { alvo.innerHTML = ''; }
}

/* ---------- texto do resumo: # título, - lista, 1. lista numerada, **negrito** ---------- */
function textoFormatado(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const out = [];
  let lista = null;
  const fecha = () => { if (lista) { out.push(`<${lista.tipo}>${lista.itens.join('')}</${lista.tipo}>`); lista = null; } };
  const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  for (const l of linhas) {
    const t = l.trim();
    if (!t) { fecha(); continue; }
    let m;
    if ((m = t.match(/^#{1,3}\s+(.+)/))) { fecha(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = t.match(/^[-*•]\s+(.+)/))) { if (!lista || lista.tipo !== 'ul') { fecha(); lista = { tipo: 'ul', itens: [] }; } lista.itens.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = t.match(/^\d+[.)]\s+(.+)/))) { if (!lista || lista.tipo !== 'ol') { fecha(); lista = { tipo: 'ol', itens: [] }; } lista.itens.push(`<li>${inline(m[1])}</li>`); continue; }
    fecha();
    out.push(`<p>${inline(t)}</p>`);
  }
  fecha();
  return out.join('');
}

/* ---------- voltar: pilha entre resumo, perfil e sala ---------- */
bib.pilha = [];
bib.cache = {};
function empilhar() {
  const de = telaAtual();
  const id = de === 'resumo' ? (bib.atual && bib.atual.id) : de === 'autor' ? bib.autorAtual : de === 'sala' ? com.salaId : null;
  const item = { tela: de, id };
  if (de === 'resumo' || de === 'autor') { bib.pilha.push(item); if (bib.pilha.length > 20) bib.pilha.shift(); }
  else bib.pilha = [item];
}

function voltarSocial() {
  const v = bib.pilha.pop();
  if (!v) return verBiblioteca(true);
  if (v.tela === 'resumo' && v.id) return abrirResumo(v.id, { voltando: true });
  if (v.tela === 'autor' && v.id) return abrirAutor(v.id, { voltando: true });
  if (v.tela === 'sala' && v.id) return abrirSala(v.id);
  if (v.tela === 'home') return verHoje();
  if (v.tela === 'comunidade') return verComunidade();
  if (v.tela === 'criador') return verCriador();
  if (v.tela === 'materia' && estado.materiaId) return go('materia', { manterScroll: true });
  if (v.tela === 'biblioteca' || v.tela === 'publicar' || !v.tela) return verBiblioteca(true);
  go(v.tela, { manterScroll: true });
}
const voltarDoResumo = voltarSocial;
const voltarDoAutor = voltarSocial;

/* ---------- abrir um resumo ---------- */
async function abrirResumo(id, { voltando = false } = {}) {
  if (!voltando) empilhar();
  go('resumo');
  $('res-titulo').textContent = 'carregando...';
  $('res-conteudo').innerHTML = '<div class="loading">carregando...</div>';
  $('res-cards').innerHTML = '';
  $('res-autor').innerHTML = '';
  $('res-aviso').innerHTML = '';
  let r;
  try {
    // voltando pra um resumo já aberto: usa o que já tinha (sem contar visualização de novo)
    r = voltando && bib.cache[id] ? bib.cache[id] : await rpc('be_resumo_abrir', { p_resumo: id });
  } catch (err) { $('res-conteudo').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  bib.cache[id] = r;
  bib.atual = r;
  const hero = $('res-hero');
  CORES_RESUMO.forEach((c) => hero.classList.remove('cor-' + c));
  hero.classList.add('cor-' + (r.cor || 'azul'));
  $('res-materia').textContent = r.materia + (r.serie ? ' · ' + r.serie : '');
  $('res-titulo').textContent = r.titulo;
  $('res-meta').textContent = `${r.visualizacoes} ${r.visualizacoes === 1 ? 'visualização' : 'visualizações'} · publicado ${new Date(r.created_at).toLocaleDateString('pt-BR')}`;
  const a = r.autor || {};
  $('res-autor').innerHTML = `<span class="avatar" onclick="abrirAutor('${a.id}')">${esc(a.iniciais)}</span>
    <div class="quem" onclick="abrirAutor('${a.id}')"><b>${esc(a.nome)}${a.equipe ? selo(a) : a.professor ? ' · professor(a)' : ''}</b><span>nível ${a.nivel}</span></div>
    ${r.meu ? '' : `<button class="seguir-btn ${r.eu_sigo ? 'seguindo' : ''}" id="res-seguir" onclick="seguirAutor('${a.id}', this)">${r.eu_sigo ? 'Seguindo' : 'Seguir'}</button>`}`;
  if (r.status !== 'publicado') {
    $('res-aviso').innerHTML = `<div class="aviso-moderacao"><b>${r.status === 'recusado' ? 'Esse resumo não foi publicado.' : 'Esse resumo está escondido enquanto a gente revisa.'}</b> ${esc(r.motivo || '')}</div>`;
  }
  pintarAcoesResumo();
  $('res-conteudo').innerHTML = textoFormatado(r.conteudo);
  const cartoes = Array.isArray(r.cartoes) ? r.cartoes : [];
  $('res-cards').innerHTML = cartoes.length ? `<div class="section-title"><h2>Flashcards</h2><span class="hand">toque pra virar</span></div>
    <div class="cards-resumo">${cartoes.map((c) => `<div class="mini-card" onclick="this.classList.toggle('virado')"><div class="lado frente">${esc(c.frente)}</div><div class="lado verso">${esc(c.verso)}</div></div>`).join('')}</div>` : '';
  $('res-denunciar').hidden = r.meu || estado.criador;
  // conta do criador: decide na hora se o resumo fica ou sai
  const mod = $('res-mod');
  mod.hidden = !estado.criador || r.meu;
  if (!mod.hidden) {
    const n = r.denuncias || 0;
    mod.innerHTML = `<div class="rot">${ico('i-estrela', 15)}moderação · só você vê${n ? ` · ${n} denúncia${n === 1 ? '' : 's'} aberta${n === 1 ? '' : 's'}` : ''}</div>`
      + acoesModeracao('resumo', r.id, a, r.status !== 'publicado', n > 0, false);
  }
  $('res-apagar').hidden = !r.meu;
}

function pintarAcoesResumo() {
  const r = bib.atual;
  $('res-curtir').classList.toggle('ativo', r.eu_curti);
  $('res-curtidas').textContent = r.curtidas;
  $('res-salvar').classList.toggle('ativo', r.salvo);
  $('res-salvar').querySelector('span').textContent = r.salvo ? 'Salvo' : 'Salvar';
  $('res-curtir').disabled = r.status !== 'publicado';
}

async function curtirResumoAtual() {
  const r = bib.atual;
  if (!r || r.status !== 'publicado') return;
  const curtir = !r.eu_curti;
  r.eu_curti = curtir; r.curtidas += curtir ? 1 : -1;
  pintarAcoesResumo();
  const btn = $('res-curtir');
  if (curtir) { btn.classList.remove('pulou'); void btn.offsetWidth; btn.classList.add('pulou'); }
  const q = curtir
    ? sb.from('be_resumo_curtidas').insert({ resumo_id: r.id, usuario_id: estado.usuarioId })
    : sb.from('be_resumo_curtidas').delete().eq('resumo_id', r.id).eq('usuario_id', estado.usuarioId);
  const { error } = await q;
  if (error && error.code !== '23505') {
    r.eu_curti = !curtir; r.curtidas += curtir ? -1 : 1; pintarAcoesResumo();
    toast('não consegui registrar a curtida');
  }
}

async function salvarResumoAtual() {
  const r = bib.atual;
  if (!r) return;
  const salvar = !r.salvo;
  r.salvo = salvar;
  pintarAcoesResumo();
  const { error } = salvar
    ? await sb.from('be_resumo_salvos').insert({ resumo_id: r.id, usuario_id: estado.usuarioId })
    : await sb.from('be_resumo_salvos').delete().eq('resumo_id', r.id).eq('usuario_id', estado.usuarioId);
  if (error && error.code !== '23505') { r.salvo = !salvar; pintarAcoesResumo(); return toast('não consegui salvar'); }
  toast(salvar ? 'Salvo na sua biblioteca' : 'Tirado dos salvos');
}

function ouvirResumoAtual() {
  const r = bib.atual;
  if (r) botaoOuvir($('res-ouvir'), r.titulo + '. ' + r.conteudo);
}

async function denunciarResumoAtual() {
  const r = bib.atual;
  if (!r) return;
  const motivo = await perguntarTexto('O que tem de errado nesse resumo?\nA gente esconde quando várias pessoas denunciam e revisa depois.', { ok: 'Denunciar', placeholder: 'ex: ofensa, cópia, sem relação com estudo' });
  if (motivo === null) return;
  try { await rpc('be_denunciar', { p_tipo: 'resumo', p_alvo: r.id, p_motivo: motivo || null }); toast('Obrigado por avisar. A gente vai olhar.'); }
  catch (err) { falhou(err); }
}

async function apagarResumoAtual() {
  const r = bib.atual;
  if (!r || !(await confirmar('Apagar esse resumo da biblioteca?\nNão dá pra desfazer.', { sim: 'Apagar' }))) return;
  const { error } = await sb.from('be_resumos').delete().eq('id', r.id);
  if (error) return falhou(error);
  toast('Resumo apagado');
  delete bib.cache[r.id];
  bib.atual = null;
  bib.pilha = [];
  verBiblioteca();
}

async function seguirAutor(autorId, btn) {
  const seguir = !btn.classList.contains('seguindo');
  btn.classList.toggle('seguindo', seguir);
  btn.textContent = seguir ? 'Seguindo' : 'Seguir';
  const { error } = seguir
    ? await sb.from('be_seguidores').insert({ seguidor_id: estado.usuarioId, seguido_id: autorId })
    : await sb.from('be_seguidores').delete().eq('seguidor_id', estado.usuarioId).eq('seguido_id', autorId);
  if (error && error.code !== '23505') {
    btn.classList.toggle('seguindo', !seguir); btn.textContent = !seguir ? 'Seguindo' : 'Seguir';
    return toast('não consegui agora, tenta de novo');
  }
  if (bib.atual && bib.atual.autor && bib.atual.autor.id === autorId) bib.atual.eu_sigo = seguir;
  if (seguir) toast('Agora você vê os resumos dessa pessoa em Seguindo');
}

/* ---------- perfil público ---------- */
async function abrirAutor(id, { voltando = false } = {}) {
  if (!id) return;
  if (!voltando) empilhar();
  bib.autorAtual = id;
  go('autor');
  const alvo = $('autor-conteudo');
  alvo.innerHTML = '<div class="loading">carregando...</div>';
  let p;
  try { p = await rpc('be_perfil_publico', { p_usuario: id }); } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  const div = (DIVISOES[p.divisao] || DIVISOES.bronze);
  lembrarNome(p.id, p.nome);
  const resumos = (p.resumos || []).map((r) => ({ ...r, autor: { nome: p.nome, iniciais: p.iniciais } }));
  alvo.innerHTML = `<div class="perfil-publico">
      <div class="big-avatar">${esc(p.iniciais)}</div>
      <h1>${esc(p.nome)}</h1>
      <span class="hand">nível ${p.nivel} · ${div[0]} ${div[1]}${p.equipe ? ' · equipe Estude+' : p.professor ? ' · professor(a)' : p.serie ? ' · ' + esc(p.serie) : ''}</span>
      <div class="numeros"><div><b>${resumos.length}</b><span>resumos</span></div><div><b>${p.seguidores}</b><span>seguidores</span></div><div><b>${p.curtidas_recebidas}</b><span>curtidas</span></div></div>
      ${p.eh_eu ? '<p class="small muted">É assim que os outros veem seu perfil.</p>' : `<div class="perfil-acoes">
        <button class="seguir-btn ${p.eu_sigo ? 'seguindo' : ''}" onclick="seguirAutor('${p.id}', this)">${p.eu_sigo ? 'Seguindo' : 'Seguir'}</button>
        <button class="ghost-btn" onclick="${p.bloqueado ? `desbloquear('${p.id}')` : `bloquearPessoa('${p.id}')`}">${ico('i-bloquear', 16)}${p.bloqueado ? 'Desbloquear' : 'Bloquear'}</button></div>
      ${estado.criador && !p.equipe ? `<div class="mod-barra" style="margin-top:12px;text-align:left"><div class="rot">${ico('i-estrela', 15)}moderação · só você vê${p.silenciado_ate ? ` · silenciado até ${dataHoraBR(p.silenciado_ate)}` : ''}</div>
        <div class="fila-acoes">${p.silenciado_ate ? `<button class="liberar" onclick="silenciar('${p.id}', 0)">${ico('i-check', 15)}tirar o silêncio</button>` : `<button class="ocultar" onclick="silenciar('${p.id}', 7)">${ico('i-bloquear', 15)}silenciar 7 dias</button><button onclick="silenciar('${p.id}', 30)">30 dias</button>`}</div></div>` : ''}`}
    </div>
    <div class="section-title"><h2>Resumos</h2></div>
    <div class="grade-resumos">${resumos.map(htmlCapa).join('') || '<div class="empty" style="grid-column:1/-1">nenhum resumo publicado ainda</div>'}</div>`;
}

async function bloquearPessoa(id) {
  const nome = nomeDe(id);
  if (!(await confirmar(`Bloquear ${nome}?\nVocê para de ver os resumos e as mensagens dessa pessoa. Ela não fica sabendo.`, { sim: 'Bloquear' }))) return;
  try { await rpc('be_bloquear', { p_usuario: id }); toast('Pessoa bloqueada'); bib.cache = {}; abrirAutor(id, { voltando: true }); } catch (err) { falhou(err); }
}

async function desbloquear(id) {
  const { error } = await sb.from('be_bloqueios').delete().eq('usuario_id', estado.usuarioId).eq('bloqueado_id', id);
  if (error) return falhou(error);
  toast('Desbloqueado');
  abrirAutor(id, { voltando: true });
}

/* ---------- publicar ---------- */
async function novoResumo(opts = {}) {
  const pub = bib.publicar;
  pub.voltar = telaAtual();
  pub.cartoes = [];
  pub.materiaId = null;
  pub.cor = CORES_RESUMO[Math.floor(Math.random() * CORES_RESUMO.length)];
  ['pub-titulo', 'pub-materia', 'pub-conteudo'].forEach((i) => { $(i).value = ''; });
  $('pub-serie').value = (estado.eu && estado.eu.serie) || '';
  $('pub-cards-wrap').hidden = true;
  $('pub-cores').innerHTML = CORES_RESUMO.map((c) => `<button class="cor-${c}" data-c="${c}" aria-label="capa ${c}" onclick="escolherCorPub('${c}')"></button>`).join('');
  escolherCorPub(pub.cor);
  go('publicar');
  const sel = $('pub-origem');
  sel.innerHTML = '<option value="">escrever do zero</option>';
  const { data: mats } = await sb.from('be_materias').select('id, nome').eq('status', 'ativa').order('created_at', { ascending: false });
  sel.innerHTML += (mats || []).map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  sel.value = opts.materiaId || '';
  if (opts.materiaId) importarDaMateria();
}

function escolherCorPub(c) {
  bib.publicar.cor = c;
  document.querySelectorAll('#pub-cores button').forEach((b) => b.classList.toggle('sel', b.dataset.c === c));
  previaCapa();
}

function previaCapa() {
  const r = {
    id: '', cor: bib.publicar.cor, titulo: $('pub-titulo').value.trim() || 'Título do seu resumo', materia: $('pub-materia').value.trim() || 'Matéria',
    serie: $('pub-serie').value, curtidas: 0, visualizacoes: 0, n_cartoes: bib.publicar.cartoes.length,
    trecho: $('pub-conteudo').value.trim().slice(0, 190),
    autor: nomePublico(estado.eu ? estado.eu.nome : ''),
  };
  $('pub-previa').innerHTML = htmlCapa(r);
}

async function importarDaMateria() {
  const id = $('pub-origem').value;
  bib.publicar.materiaId = id || null;
  bib.publicar.cartoes = [];
  $('pub-cards-wrap').hidden = true;
  if (!id) return previaCapa();
  let d;
  try { d = await rpc('be_materia_detalhe', { p_materia: id }); } catch (err) { return falhou(err); }
  const partes = [];
  if (d.resumo && d.resumo.texto) partes.push(d.resumo.texto.trim());
  if (d.mapa_mental && (d.mapa_mental.ramos || []).length) {
    partes.push('# Mapa mental');
    d.mapa_mental.ramos.forEach((r) => partes.push(`- **${r.titulo}**: ${(r.pontos || []).join('; ')}`));
  }
  const curi = (d.curiosidades && d.curiosidades.lista) || [];
  if (curi.length) { partes.push('# Curiosidades'); curi.forEach((c) => partes.push('- ' + c)); }
  $('pub-titulo').value = (d.resumo && d.resumo.titulo) || d.materia.nome;
  $('pub-materia').value = d.materia.nome;
  $('pub-conteudo').value = partes.join('\n\n').replace(/\n\n- /g, '\n- ');
  const { data: cards } = await sb.from('be_cards').select('frente, verso').eq('materia_id', id).order('created_at').limit(30);
  bib.publicar.cartoes = (cards || []).map((c) => ({ frente: c.frente, verso: c.verso }));
  if (bib.publicar.cartoes.length) {
    $('pub-cards-wrap').hidden = false;
    $('pub-cards-info').textContent = `${bib.publicar.cartoes.length} flashcards da matéria vão junto, pra quem ler poder praticar.`;
  }
  previaCapa();
}

function voltarDoPublicar() {
  const v = bib.publicar.voltar;
  if (v === 'materia' && estado.materiaId) return abrirMateria(estado.materiaId, 'resumo');
  if (v === 'home') return verHoje();
  verBiblioteca(true);
}

async function publicarResumo() {
  const pub = bib.publicar;
  const corpo = {
    titulo: $('pub-titulo').value.trim(), materia: $('pub-materia').value.trim(), serie: $('pub-serie').value || null,
    conteudo: $('pub-conteudo').value.trim(), cor: pub.cor, cartoes: pub.cartoes, materia_id: pub.materiaId,
  };
  if (corpo.titulo.length < 3) return avisar('dá um título pro seu resumo');
  if (corpo.materia.length < 2) return avisar('diz de qual matéria é o resumo');
  if (corpo.conteudo.length < 80) return avisar('o resumo está curto demais (escreve pelo menos umas 2 linhas)');
  const pronto = ocupado($('btn-publicar'), 'Revisando e publicando...');
  try {
    const r = await chamarFuncao('estude-publicar-resumo', corpo);
    bib.materiasCarregadas = false;
    $('bib-lista').innerHTML = '';
    if (r.publicado) {
      Fx.confete({ y: innerHeight * 0.3, n: 110 });
      toastXp(r.xp, 'pelo resumo publicado');
      bib.pilha = [];
      bib.cache = {};
      abrirResumo(r.id, { voltando: true });
    } else {
      avisar('Seu resumo não foi publicado.\n' + (r.motivo || 'Ele não passou na revisão.') + '\n\nAjusta o texto e tenta de novo.');
    }
  } catch (err) { falhou(err, 'Não consegui publicar'); } finally { pronto(); }
}
