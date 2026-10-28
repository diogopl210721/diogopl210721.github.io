/* EstudeUp — conta do criador (master): números do app e moderação.
   Quem é criador fica marcado no banco (be_criadores, sem acesso pelo app); cada ação aqui passa por uma função
   que confere isso de novo. Moderar nunca apaga: esconde ou libera. */

const cri = { dados: null, aba: 'resumos' };

// nomes públicos por id, pra não passar nome dentro de onclick
const NOMES = {};
function lembrarNome(id, nome) { if (id && nome) NOMES[id] = nome; }
function nomeDe(id) { return NOMES[id] || 'essa pessoa'; }

const fmtN = (n) => Number(n || 0).toLocaleString('pt-BR');
const dataHoraBR = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const selo = (a) => (a && a.equipe ? '<em class="selo-equipe">equipe EstudeUp</em>' : '');

async function carregarCriador() {
  try { estado.criador = (await rpc('be_sou_criador')) === true; } catch (_) { estado.criador = false; }
  $('side-criador').hidden = !estado.criador;
  atualizarEnergia();
}

async function verCriador() {
  if (!estado.criador) return verPerfil();
  go('criador');
  if (!cri.dados) $('criador-numeros').innerHTML = '<div class="loading">carregando...</div>';
  let d;
  try { d = await rpc('be_painel_criador'); } catch (err) { $('criador-numeros').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  cri.dados = d;
  if (typeof pintarAtalhoComercial === 'function') pintarAtalhoComercial(d.comercial);
  pintarNumeros(d.numeros, d.fila_resumos.length + d.fila_mensagens.length);
  pintarFila();
  pintarSilenciados();
}

function pintarNumeros(n, abertas) {
  const pl = (v, um, varios) => (Number(v) === 1 ? um : varios);
  const box = (v, um, varios, destaque) => `<div class="num-box${destaque ? ' destaque' : ''}"><b>${fmtN(v)}</b><span>${pl(v, um, varios)}</span></div>`;
  const grupo = (rot, itens) => `<div class="nums-grupo"><div class="rot">${rot}</div><div class="nums-grade">${itens.join('')}</div></div>`;
  const tg = `${fmtN(n.turmas)} ${pl(n.turmas, 'turma', 'turmas')} e ${fmtN(n.grupos_amigos)} ${pl(n.grupos_amigos, 'grupo', 'grupos')}`;
  $('criador-numeros').innerHTML =
    grupo('Pessoas', [
      box(n.contas, 'conta', 'contas', true), box(n.ativos_hoje, 'estudou hoje', 'estudaram hoje'), box(n.ativos_7d, 'estudou em 7 dias', 'estudaram em 7 dias'),
      box(n.novos_7d, 'conta nova em 7 dias', 'contas novas em 7 dias'), box(n.professores, 'professor(a)', 'professores'), box(n.turmas + n.grupos_amigos, tg, tg),
    ]) +
    grupo('Hoje', [
      box(n.ia_hoje, 'uso de IA (gerar e corrigir)', 'usos de IA (gerar e corrigir)', true), box(n.tutor_hoje, 'pergunta ao tutor', 'perguntas ao tutor'),
      box(n.mensagens_hoje, 'mensagem nas salas', 'mensagens nas salas'),
    ]) +
    grupo('Conteúdo', [
      box(n.materias, 'matéria', 'matérias', true), box(n.materias_7d, 'matéria nova em 7 dias', 'matérias novas em 7 dias'),
      box(n.resumos, 'resumo na biblioteca', 'resumos na biblioteca'), box(n.simulados_7d, 'simulado em 7 dias', 'simulados em 7 dias'),
      box(n.redacoes_7d, 'redação em 7 dias', 'redações em 7 dias'), box(abertas, 'item denunciado', 'itens denunciados'),
    ]);
}

function abaFila(aba) {
  cri.aba = aba;
  document.querySelectorAll('#criador-abas .chip').forEach((c) => c.classList.toggle('sel', c.dataset.a === aba));
  pintarFila();
}

function pintarFila() {
  const d = cri.dados;
  if (!d) return;
  const nr = d.fila_resumos.length, nm = d.fila_mensagens.length;
  $('criador-fila-n').textContent = nr + nm ? `${nr + nm} pra revisar` : 'tudo em dia';
  document.querySelector('#criador-abas [data-a="resumos"]').textContent = `resumos (${nr})`;
  document.querySelector('#criador-abas [data-a="mensagens"]').textContent = `mensagens (${nm})`;
  const itens = cri.aba === 'resumos' ? d.fila_resumos : d.fila_mensagens;
  $('criador-fila').innerHTML = itens.length
    ? itens.map((it) => (cri.aba === 'resumos' ? htmlFilaResumo(it) : htmlFilaMensagem(it))).join('')
    : `<div class="empty">${cri.aba === 'resumos' ? 'nenhum resumo denunciado' : 'nenhuma mensagem denunciada'} esperando revisão</div>`;
}

const qtdDenuncias = (n) => `${n} denúncia${n === 1 ? '' : 's'}`;

// botões de moderação: quem está escondido pode voltar; quem está no ar pode sumir; com denúncia, dá pra manter como está
function acoesModeracao(tipo, id, autor, oculto, temDenuncia, comAbrir) {
  const a = autor || {};
  lembrarNome(a.id, a.nome);
  return `<div class="fila-acoes">
    ${comAbrir ? `<button onclick="abrirResumo('${id}')">${ico('i-olho', 15)}abrir</button>` : ''}
    ${oculto || temDenuncia ? `<button class="liberar" onclick="moderar('${tipo}', '${id}', 'liberar', this)">${ico('i-check', 15)}${oculto ? 'liberar' : 'manter no ar'}</button>` : ''}
    ${!oculto || temDenuncia ? `<button class="ocultar" onclick="moderar('${tipo}', '${id}', 'ocultar', this)">${ico('i-x', 15)}${oculto ? 'manter escondido' : 'esconder'}</button>` : ''}
    ${a.id && !a.equipe ? `<button onclick="silenciar('${a.id}', 7)">${ico('i-bloquear', 15)}silenciar 7 dias</button>` : ''}
  </div>`;
}

function htmlFilaResumo(r) {
  const a = r.autor || {};
  const oculto = r.status !== 'publicado';
  return `<div class="fila-item">
    <div class="topo"><h4 onclick="abrirResumo('${r.id}')">${esc(r.titulo)}</h4><span class="tag ${oculto ? '' : 'leve'}">${qtdDenuncias(r.denuncias)} · ${oculto ? 'escondido' : 'no ar'}</span></div>
    <p class="texto">${esc(r.trecho)}…</p>
    ${r.motivos && r.motivos.length ? `<p class="motivos">motivos: ${r.motivos.map(esc).join(' · ')}</p>` : ''}
    <span class="quem">${esc(r.materia)} · por ${esc(a.nome)}${r.silenciado_ate ? ' · silenciado' : ''} · última denúncia ${dataHoraBR(r.ultima)}</span>
    ${acoesModeracao('resumo', r.id, a, oculto, true, true)}
  </div>`;
}

function htmlFilaMensagem(m) {
  const a = m.autor || {};
  return `<div class="fila-item">
    <div class="topo"><h4>${esc(a.nome)} <span class="muted small">em ${esc(m.sala)}</span></h4><span class="tag ${m.oculta ? '' : 'leve'}">${qtdDenuncias(m.denuncias)} · ${m.oculta ? 'escondida' : 'no ar'}</span></div>
    <p class="texto">“${esc(m.texto)}”</p>
    <span class="quem">enviada ${dataHoraBR(m.created_at)}${m.silenciado_ate ? ' · autor silenciado' : ''}</span>
    ${acoesModeracao('mensagem', m.id, a, m.oculta, true, false)}
  </div>`;
}

function pintarSilenciados() {
  const l = (cri.dados && cri.dados.silenciados) || [];
  $('criador-silenciados').innerHTML = l.length ? l.map((s) => {
    lembrarNome(s.autor.id, s.autor.nome);
    return `<div class="hist-row" style="cursor:default"><span><b>${esc(s.autor.nome)}</b><br><span class="small muted">até ${dataHoraBR(s.ate)}${s.motivo ? ' · ' + esc(s.motivo) : ''}</span></span>
      <button class="link-btn" onclick="silenciar('${s.autor.id}', 0)">tirar o silêncio</button></div>`;
  }).join('') : '<div class="empty">ninguém silenciado</div>';
}

async function moderar(tipo, id, acao, btn) {
  const linha = btn && btn.closest('.fila-acoes');
  const travar = (v) => { if (linha) linha.querySelectorAll('button').forEach((b) => { b.disabled = v; }); };
  travar(true);
  try {
    await rpc('be_moderar', { p_tipo: tipo, p_alvo: id, p_acao: acao });
  } catch (err) { travar(false); return falhou(err); }
  const nomeTipo = tipo === 'resumo' ? 'Resumo' : 'Mensagem';
  toast(acao === 'liberar' ? `${nomeTipo} no ar` : `${nomeTipo} ${tipo === 'resumo' ? 'escondido' : 'escondida'}`);
  if (cri.dados) {
    const k = tipo === 'resumo' ? 'fila_resumos' : 'fila_mensagens';
    cri.dados[k] = cri.dados[k].filter((x) => x.id !== id);
  }
  if (typeof bib !== 'undefined') delete bib.cache[id];
  const tela = telaAtual();
  if (tela === 'criador') pintarFila();
  else if (tela === 'resumo') abrirResumo(id, { voltando: true });
  else if (tela === 'sala' && acao === 'ocultar') {
    const el = document.querySelector(`.bolha-linha[data-id="${id}"]`);
    if (el) el.remove();
  }
}

async function silenciar(id, dias) {
  const nome = nomeDe(id);
  const msg = dias
    ? `Silenciar ${nome} por ${dias} dias?\nA pessoa continua estudando normal, só não manda mensagem nas salas nem publica resumo até lá.`
    : `Tirar o silêncio de ${nome}?\nA pessoa volta a mandar mensagem e publicar na hora.`;
  if (!(await confirmar(msg, { sim: dias ? 'Silenciar' : 'Tirar' }))) return;
  try {
    await rpc('be_silenciar', { p_usuario: id, p_dias: dias, p_motivo: dias ? 'moderação' : null });
  } catch (err) { return falhou(err); }
  toast(dias ? `${nome} sem mandar mensagem por ${dias} dias` : `${nome} pode mandar mensagem de novo`);
  const tela = telaAtual();
  if (tela === 'criador') verCriador();
  else if (tela === 'autor') abrirAutor(id, { voltando: true });
}

// ---------- contas: achar pelo nome ou e-mail e criar senha provisória ----------
let buscaContasTimer = null;
function buscarContasDepois() {
  clearTimeout(buscaContasTimer);
  buscaContasTimer = setTimeout(buscarContas, 350);
}

async function buscarContas() {
  const termo = $('criador-busca').value.trim();
  const alvo = $('criador-contas');
  if (termo.length < 2) { alvo.innerHTML = '<p class="small muted" style="margin:6px 2px 0">digita pelo menos 2 letras do nome ou do e-mail</p>'; return; }
  alvo.innerHTML = '<div class="loading">buscando...</div>';
  let lista;
  try { lista = await rpc('be_buscar_contas', { p_busca: termo }); } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  if ($('criador-busca').value.trim() !== termo) return; // chegou resposta de uma busca antiga
  cri.contas = lista;
  pintarContas();
}

function pintarContas() {
  const lista = cri.contas || [];
  $('criador-contas').innerHTML = lista.length ? lista.map((c) => {
    lembrarNome(c.id, c.nome);
    const quem = c.equipe ? 'equipe EstudeUp' : c.papel === 'professor' ? 'professor(a)' : (c.serie || 'aluno(a)');
    const visto = c.ultima_atividade ? `estudou ${rotuloDia(String(c.ultima_atividade).slice(0, 10)).toLowerCase()}` : 'ainda não estudou';
    return `<div class="fila-item">
      <div class="topo"><h4 onclick="abrirAutor('${c.id}')">${esc(c.nome)}</h4>${c.silenciado_ate ? '<span class="tag">silenciado</span>' : ''}</div>
      <span class="quem">${esc(c.email || 'sem e-mail')} · ${esc(quem)}${c.escola ? ' · ' + esc(c.escola) : ''} · ${visto}</span>
      ${c.equipe ? '' : `<div class="fila-acoes">
        <button onclick="novaSenhaProvisoria('${c.id}', this)">${ico('i-chave', 15)}senha provisória</button>
        ${c.silenciado_ate ? `<button class="liberar" onclick="silenciar('${c.id}', 0)">${ico('i-check', 15)}tirar o silêncio</button>` : `<button onclick="silenciar('${c.id}', 7)">${ico('i-bloquear', 15)}silenciar 7 dias</button>`}
      </div>`}
    </div>`;
  }).join('') : '<div class="empty">nenhuma conta com esse nome ou e-mail</div>';
}

// senha fácil de ditar: 8 letras e números sem os que confundem (0/O, 1/I/L)
function gerarSenhaProvisoria() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint32Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[rnd[i] % chars.length] + (i === 3 ? '-' : '');
  return s;
}

async function novaSenhaProvisoria(id, btn) {
  const nome = nomeDe(id);
  if (!(await confirmar(`Criar uma senha provisória pra ${nome}?\nA senha de agora para de funcionar na hora.`, { sim: 'Criar senha' }))) return;
  const senha = gerarSenhaProvisoria();
  if (btn) btn.disabled = true;
  try {
    await chamarFuncao('estude-criador-senha', { usuario_id: id, senha });
  } catch (err) { return falhou(err, 'Não consegui trocar a senha'); } finally { if (btn) btn.disabled = false; }
  try { if (navigator.clipboard) await navigator.clipboard.writeText(senha); } catch (_) { /* sem área de transferência */ }
  avisar(`Senha provisória de ${nome}:\n\n${senha}\n\nPassa pra pessoa entrar com o e-mail dela e essa senha, e pedir pra ela trocar em Perfil → trocar senha.`);
}

// grupo novo: a conta do criador escolhe se é turma (só ele coloca material) ou grupo de amigos
function escolherTipoGrupo(btn) {
  document.querySelectorAll('#criar-tipo .chip').forEach((c) => c.classList.toggle('sel', c === btn));
}
function tipoGrupoNovo() {
  if (!estado.criador) return estado.papel === 'professor' ? 'turma_professor' : 'grupo_amigos';
  const sel = document.querySelector('#criar-tipo .chip.sel');
  return sel ? sel.dataset.t : 'turma_professor';
}
