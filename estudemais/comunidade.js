/* Estude+ — comunidade: salas por matéria e a sala de cada turma. Sem mensagem privada entre alunos (proteção dos menores). */

const com = { salaId: null, ultima: null, timer: null, canal: null, ids: new Set(), enviando: false, sala: null };

function verComunidade() {
  pararSala();
  go('comunidade');
  carregarSalas();
}

async function carregarSalas() {
  const alvo = $('salas-lista');
  let salas;
  try { salas = await rpc('be_salas_lista'); } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  const item = (s) => `<div class="sala-item ${s.turma ? 'turma' : ''}" onclick="abrirSala('${s.id}')">
      <div class="ic">${esc(s.icone)}</div>
      <div class="info"><b>${esc(s.nome)}</b><span>${s.ultima ? `${esc(s.ultima.autor)}: ${esc(s.ultima.texto)}` : esc(s.descricao || '')}</span></div>
      <div class="lado">${s.ultima ? quando(s.ultima.created_at) : s.membros ? `${s.membros} ${s.membros === 1 ? 'pessoa' : 'pessoas'}` : 'nova'}${s.nao_lidas ? `<span class="nao-lidas">${s.nao_lidas > 99 ? '99+' : s.nao_lidas}</span>` : ''}</div>
    </div>`;
  const turmas = salas.filter((s) => s.turma);
  const minhas = salas.filter((s) => !s.turma && s.entrei);
  const outras = salas.filter((s) => !s.turma && !s.entrei);
  alvo.innerHTML = (turmas.length ? '<div class="step-label">suas turmas</div>' + turmas.map(item).join('') : '')
    + (minhas.length ? '<div class="step-label">salas que você participa</div>' + minhas.map(item).join('') : '')
    + (outras.length ? '<div class="step-label">explorar salas</div>' + outras.map(item).join('') : '');
  pintarNaoLidas(salas);
}

function pintarNaoLidas(salas) {
  const total = salas.reduce((n, s) => n + (s.nao_lidas || 0), 0);
  $('nav-nao-lidas').hidden = !total;
  $('nav-nao-lidas').textContent = total > 9 ? '9+' : total;
}

// bolinha da aba Comunidade, atualizada quando a pessoa abre o Hoje
async function contarNaoLidas() {
  try { pintarNaoLidas(await rpc('be_salas_lista')); } catch (_) { /* fica como estava */ }
}

function diaDaMensagem(iso) {
  const d = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hoje = hojeISO();
  if (d === hoje) return 'hoje';
  if (d === somaDias(hoje, -1)) return 'ontem';
  return fmtData(d);
}

function htmlMensagem(m, anterior) {
  const dia = diaDaMensagem(m.created_at);
  const sep = !anterior || diaDaMensagem(anterior.created_at) !== dia ? `<div class="dia-chat">${dia}</div>` : '';
  const hora = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const a = m.autor || {};
  if (m.eu) return `${sep}<div class="bolha-linha minha" data-id="${m.id}"><div class="bolha">${esc(m.texto)}<span class="hora">${hora}</span></div></div>`;
  const mesmoAutor = anterior && !sep && anterior.autor && anterior.autor.id === a.id;
  return `${sep}<div class="bolha-linha" data-id="${m.id}">
      <span class="avatar" style="${mesmoAutor ? 'visibility:hidden' : ''}" onclick="abrirAutor('${a.id}')">${esc(a.iniciais)}</span>
      <div class="bolha" onclick="menuMensagem(event, '${m.id}', '${a.id}', '${esc(a.nome)}')">${mesmoAutor ? '' : `<span class="quem">${esc(a.nome)}${a.professor ? '<em>professor(a)</em>' : ''}</span>`}${esc(m.texto)}<span class="hora">${hora}</span></div>
    </div>`;
}

async function abrirSala(id) {
  pararSala();
  com.salaId = id;
  com.ids = new Set();
  com.ultima = null;
  com.lista = [];
  go('sala');
  $('sala-mensagens').innerHTML = '<div class="loading">carregando...</div>';
  let r;
  try { r = await rpc('be_mensagens_sala', { p_sala: id }); } catch (err) { $('sala-mensagens').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  if (com.salaId !== id) return;
  com.sala = r.sala;
  $('sala-titulo').textContent = `${r.sala.icone} ${r.sala.nome}`;
  $('sala-sub').textContent = `${r.sala.membros} ${r.sala.membros === 1 ? 'pessoa' : 'pessoas'}${r.sala.turma ? ' · só a turma vê' : ''}`;
  $('sala-mensagens').innerHTML = r.mensagens.length ? '' : `<div class="empty">Ninguém falou nada ainda. Puxa o assunto!${r.sala.descricao ? '<br>' + esc(r.sala.descricao) : ''}</div>`;
  acrescentarMensagens(r.mensagens);
  // tempo real quando disponível; a busca a cada poucos segundos cobre o resto
  try {
    com.canal = sb.channel('sala-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'be_sala_mensagens', filter: 'sala_id=eq.' + id }, () => buscarNovasMensagens())
      .subscribe();
  } catch (_) { com.canal = null; }
  com.timer = setInterval(buscarNovasMensagens, 6000);
}

function acrescentarMensagens(lista) {
  const caixa = $('sala-mensagens');
  const vazio = caixa.querySelector('.empty');
  const novas = lista.filter((m) => !com.ids.has(m.id));
  if (!novas.length) return;
  if (vazio) vazio.remove();
  let html = '';
  for (const m of novas) {
    html += htmlMensagem(m, com.lista[com.lista.length - 1]);
    com.lista.push(m);
    com.ids.add(m.id);
    com.ultima = m.created_at;
  }
  const t = $('screen-sala');
  const noFim = t.scrollHeight - t.scrollTop - t.clientHeight < 140;
  caixa.insertAdjacentHTML('beforeend', html);
  if (noFim || novas.some((m) => m.eu)) requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; });
}

async function buscarNovasMensagens() {
  const id = com.salaId;
  if (!id || document.hidden) return;
  try {
    const r = await rpc('be_mensagens_sala', { p_sala: id, p_depois: com.ultima });
    if (com.salaId === id) acrescentarMensagens(r.mensagens);
  } catch (_) { /* tenta de novo na próxima */ }
}

function pararSala() {
  clearInterval(com.timer);
  com.timer = null;
  if (com.canal) { try { sb.removeChannel(com.canal); } catch (_) { /* já fechado */ } com.canal = null; }
  com.salaId = null;
  fecharMenuMensagem();
}

async function enviarSala() {
  if (com.enviando || !com.salaId) return;
  const campo = $('sala-texto');
  const texto = campo.value.trim();
  if (!texto) return campo.focus();
  com.enviando = true;
  $('sala-enviar').disabled = true;
  try {
    const m = await rpc('be_enviar_mensagem', { p_sala: com.salaId, p_texto: texto });
    campo.value = ''; autoAltura(campo);
    acrescentarMensagens([m]);
  } catch (err) {
    toast(err.message.replace(/^.*?: /, ''));
  } finally {
    com.enviando = false;
    $('sala-enviar').disabled = false;
  }
}

function menuMensagem(ev, msgId, autorId, nome) {
  ev.stopPropagation();
  fecharMenuMensagem();
  const menu = document.createElement('div');
  menu.className = 'menu-msg';
  menu.id = 'menu-msg';
  menu.innerHTML = `<button onclick="fecharMenuMensagem(); abrirAutor('${autorId}')"><svg class="ico"><use href="#i-perfil"/></svg>Ver perfil de ${nome}</button>
    <button onclick="denunciarMensagem('${msgId}')"><svg class="ico"><use href="#i-bandeira"/></svg>Denunciar mensagem</button>
    <button class="perigo" onclick="bloquearDaSala('${autorId}', '${nome}')"><svg class="ico"><use href="#i-bloquear"/></svg>Bloquear ${nome}</button>`;
  document.body.appendChild(menu);
  const r = ev.currentTarget.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(10, Math.min(innerWidth - w - 10, r.left)) + 'px';
  menu.style.top = (r.bottom + h + 10 < innerHeight ? r.bottom + 6 : r.top - h - 6) + 'px';
  setTimeout(() => document.addEventListener('click', fecharMenuMensagem, { once: true }), 0);
}

function fecharMenuMensagem() { const m = $('menu-msg'); if (m) m.remove(); }

async function denunciarMensagem(id) {
  fecharMenuMensagem();
  if (!(await confirmar('Denunciar essa mensagem?\nQuando várias pessoas denunciam, ela some da sala.', { sim: 'Denunciar' }))) return;
  try { await rpc('be_denunciar', { p_tipo: 'mensagem', p_alvo: id }); toast('Obrigado por avisar'); } catch (err) { falhou(err); }
}

async function bloquearDaSala(id, nome) {
  fecharMenuMensagem();
  if (!(await confirmar(`Bloquear ${nome}?\nVocê para de ver as mensagens e os resumos dessa pessoa. Ela não fica sabendo.`, { sim: 'Bloquear' }))) return;
  try {
    await rpc('be_bloquear', { p_usuario: id });
    toast('Pessoa bloqueada');
    const sala = com.salaId;
    if (sala) abrirSala(sala);
  } catch (err) { falhou(err); }
}
