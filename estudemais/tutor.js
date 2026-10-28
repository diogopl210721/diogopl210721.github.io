/* EstudeUp — tutor de IA: foto do exercício vira resolução passo a passo; uma conversa por dúvida, separada por matéria. */

const tut = { conversaId: null, materia: null, foto: null, enviando: false, titulo: null };
const MATERIAS_TUTOR = ['Matemática', 'Física', 'Química', 'Biologia', 'Português', 'Redação', 'História', 'Geografia', 'Inglês', 'Outra'];

function verTutor() {
  go('tutor');
  $('tutor-materias').innerHTML = MATERIAS_TUTOR.map((m) => `<button class="chip small ${tut.materia === m ? 'sel' : ''}" onclick="escolherMateriaTutor('${m}')">${m}</button>`).join('');
  carregarConversasTutor();
}

function escolherMateriaTutor(m) {
  tut.materia = tut.materia === m ? null : m;
  document.querySelectorAll('#tutor-materias .chip').forEach((c) => c.classList.toggle('sel', c.textContent === tut.materia));
}

async function carregarConversasTutor() {
  const alvo = $('tutor-lista');
  try {
    const lista = await rpc('be_tutor_conversas_lista');
    alvo.innerHTML = lista.length ? lista.map((c) => `
      <div class="conversa-item" onclick="abrirConversa('${c.id}')">
        <div class="bolinha"><svg class="ico"><use href="#i-tutor"/></svg></div>
        <div class="info"><b>${esc(c.titulo)}</b><span>${c.materia ? esc(c.materia) + ' · ' : ''}${esc((c.ultima || '').replace(/[#*]/g, ''))}</span></div>
        <span class="quando">${quando(c.updated_at)}</span>
      </div>`).join('') : '<div class="empty">Suas conversas com o tutor aparecem aqui.</div>';
  } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: uso } = await sb.from('be_uso_tutor').select('quantidade').eq('usuario_id', estado.usuarioId).eq('data', hoje).maybeSingle();
  const restam = 60 - (uso ? uso.quantidade : 0);
  $('tutor-restantes').textContent = estado.criador ? 'perguntas sem limite' : restam > 0 ? `${restam} perguntas livres hoje` : 'volta amanhã';
}

// atalho da home: abre a câmera direto
function abrirTutorFoto() {
  verTutor();
  $('tutor-foto-input').click();
}

async function tutorFotoEscolhida(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const f = await lerImagemComprimida(file, 1600, 0.82);
    novaConversaTutor({ texto: '', foto: f });
  } catch (err) { avisar(err.message); }
}

function perguntarRapido() {
  const t = $('tutor-pergunta-rapida').value.trim();
  if (!t) return $('tutor-pergunta-rapida').focus();
  $('tutor-pergunta-rapida').value = '';
  novaConversaTutor({ texto: t, foto: null });
}

function novaConversaTutor({ texto, foto }) {
  tut.conversaId = null;
  tut.foto = foto;
  $('tchat-titulo').textContent = 'Nova conversa';
  $('tchat-sub').textContent = tut.materia ? tut.materia : 'explica passo a passo';
  $('tchat-mensagens').innerHTML = '';
  $('tchat-apagar').hidden = true;
  go('tutor-chat');
  $('tchat-texto').value = texto;
  mostrarFotoComposer();
  enviarTutor();
}

async function abrirConversa(id) {
  tut.conversaId = id;
  tut.foto = null;
  mostrarFotoComposer();
  go('tutor-chat');
  $('tchat-apagar').hidden = false;
  const lista = $('tchat-mensagens');
  lista.innerHTML = '<div class="loading">carregando...</div>';
  const [{ data: conversa }, { data: msgs }] = await Promise.all([
    sb.from('be_tutor_conversas').select('titulo, materia').eq('id', id).maybeSingle(),
    sb.from('be_tutor_mensagens').select('papel, texto, tinha_foto, created_at').eq('conversa_id', id).order('created_at', { ascending: true }),
  ]);
  $('tchat-titulo').textContent = conversa ? conversa.titulo : 'Conversa';
  $('tchat-sub').textContent = conversa && conversa.materia ? conversa.materia : 'explica passo a passo';
  lista.innerHTML = (msgs || []).map((m) => htmlBolhaTutor(m)).join('');
  rolarChatTutor();
}

function textoDoTutor(texto) {
  // parágrafos, listas numeradas, **negrito**
  return textoFormatado(texto).replace(/<h3>/g, '<p><b>').replace(/<\/h3>/g, '</b></p>');
}

function htmlBolhaTutor(m, fotoUrl = null) {
  if (m.papel === 'aluno') {
    const foto = fotoUrl ? `<img class="foto-mini" src="${fotoUrl}" alt="foto do exercício">` : m.tinha_foto ? `<span class="foto-tag"><svg class="ico"><use href="#i-foto"/></svg>foto do exercício</span>` : '';
    return `<div class="bolha-linha minha"><div class="bolha">${foto}${esc(m.texto)}</div></div>`;
  }
  const idx = (htmlBolhaTutor.n = (htmlBolhaTutor.n || 0) + 1);
  return `<div class="bolha-linha tutor"><span class="avatar"><svg class="ico"><use href="#i-tutor"/></svg></span>
    <div class="bolha" id="tb-${idx}">${textoDoTutor(m.texto)}
      <div class="ferramentas"><button onclick="botaoOuvir(this, document.getElementById('tb-${idx}').innerText)"><svg class="ico"><use href="#i-som"/></svg><span>Ouvir</span></button></div></div></div>`;
}

function rolarChatTutor() {
  const t = $('screen-tutor-chat');
  requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; });
}

function mostrarFotoComposer() {
  $('tchat-foto').hidden = !tut.foto;
  if (tut.foto) $('tchat-foto-img').src = tut.foto.dataUrl;
}

async function tutorFotoComposer(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try { tut.foto = await lerImagemComprimida(file, 1600, 0.82); mostrarFotoComposer(); } catch (err) { avisar(err.message); }
}

function tirarFotoTutor() { tut.foto = null; mostrarFotoComposer(); }

function ditarTutor() {
  const btn = $('tchat-mic');
  if (Voz.ouvindo()) { Voz.parar(); return; }
  if (!Voz.podeOuvir()) return toast('esse navegador não reconhece voz');
  const campo = $('tchat-texto');
  const antes = campo.value ? campo.value.trim() + ' ' : '';
  btn.classList.add('gravando');
  Voz.ouvir({
    onParcial: (t) => { campo.value = antes + t; autoAltura(campo); },
    onFim: () => { btn.classList.remove('gravando'); campo.focus(); },
    onErro: (e) => { btn.classList.remove('gravando'); toast(e.message); },
  });
}

async function enviarTutor() {
  if (tut.enviando) return;
  const campo = $('tchat-texto');
  const texto = campo.value.trim();
  const foto = tut.foto;
  if (!texto && !foto) return campo.focus();
  tut.enviando = true;
  $('tchat-enviar').disabled = true;
  const lista = $('tchat-mensagens');
  lista.insertAdjacentHTML('beforeend', htmlBolhaTutor({ papel: 'aluno', texto: texto || 'Resolve esse exercício da foto, passo a passo.' }, foto ? foto.dataUrl : null));
  lista.insertAdjacentHTML('beforeend', '<div class="bolha-linha tutor" id="tchat-digitando"><span class="avatar"><svg class="ico"><use href="#i-tutor"/></svg></span><div class="bolha digitando"><i></i><i></i><i></i></div></div>');
  campo.value = ''; autoAltura(campo);
  tut.foto = null; mostrarFotoComposer();
  rolarChatTutor();
  try {
    const r = await chamarFuncao('estude-tutor', {
      conversa_id: tut.conversaId, materia: tut.materia, texto,
      imagem_base64: foto ? foto.base64 : null, tipo_imagem: 'image/jpeg',
    });
    const novo = !tut.conversaId;
    tut.conversaId = r.conversa_id;
    $('tchat-apagar').hidden = false;
    const dig = $('tchat-digitando');
    if (dig) dig.outerHTML = htmlBolhaTutor({ papel: 'tutor', texto: r.resposta });
    if (novo) $('tchat-titulo').textContent = texto ? (texto.length > 40 ? texto.slice(0, 38) + '…' : texto) : 'Foto de exercício';
    if (r.xp) { const ult = lista.lastElementChild; Fx.xp(ult ? ult.querySelector('.bolha') : null, r.xp); }
    rolarChatTutor();
  } catch (err) {
    const dig = $('tchat-digitando');
    if (dig) dig.outerHTML = `<div class="bolha-linha tutor"><span class="avatar"><svg class="ico"><use href="#i-tutor"/></svg></span><div class="bolha">${esc(err.message)}</div></div>`;
  } finally {
    tut.enviando = false;
    $('tchat-enviar').disabled = false;
  }
}

async function apagarConversaAtual() {
  if (!tut.conversaId || !(await confirmar('Apagar essa conversa com o tutor?', { sim: 'Apagar' }))) return;
  const { error } = await sb.from('be_tutor_conversas').delete().eq('id', tut.conversaId);
  if (error) return falhou(error);
  tut.conversaId = null;
  verTutor();
}
