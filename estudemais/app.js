/* Estude+
   Front estático (GitHub Pages) + Supabase. Regras de XP, plano, revisão e simulado ficam no banco (rpc). */

const SUPABASE_URL = 'https://arffptuclrrzuzdrcmuc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZmZwdHVjbHJyenV6ZHJjbXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MTcxMDAsImV4cCI6MjEwMTI5MzEwMH0.n3AqYrMwv2ayVa4la6vesVJOfd_LkdmY-ikp8P8uFAg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LIMITE_ENERGIA = 7;
const DIVISOES = { bronze: ['🥉', 'Bronze'], prata: ['🥈', 'Prata'], ouro: ['🥇', 'Ouro'], diamante: ['💎', 'Diamante'] };
const AREAS = { 'linguagens': 'Linguagens', 'ciencias-humanas': 'Humanas', 'ciencias-natureza': 'Natureza', 'matematica': 'Matemática' };
const TEMAS_REDACAO = [
  'Os desafios para combater a desinformação nas redes sociais no Brasil',
  'Caminhos para reduzir a evasão escolar no ensino médio brasileiro',
  'O impacto do uso excessivo de celulares na saúde mental dos jovens',
  'Desafios para garantir o acesso à água potável nas periferias brasileiras',
  'A valorização dos professores como caminho para melhorar a educação no Brasil',
  'Caminhos para combater o desperdício de alimentos no Brasil',
  'Os desafios da inclusão de pessoas com deficiência no mercado de trabalho',
  'A persistência da violência contra a mulher na sociedade brasileira',
  'Desafios para a mobilidade urbana sustentável nas grandes cidades',
  'O papel da inteligência artificial na educação brasileira',
];

const estado = {
  usuarioId: null,
  resumo: null,
  tarefas: {},
  tarefaAtual: null,
  materiaId: null,
  detalhe: null,
  upload: { fonte: 'foto', foto: null, pdf: null, grupoId: null, grupoNome: null, materiaAlvo: null },
  quiz: null,
  cards: null,
  enem: { area: '', qtd: 10, idioma: 'ingles' },
  sim: null,
  grupoId: null,
  grupoNome: null,
  papel: 'aluno',
};

/* ===================== utilidades ===================== */
const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hojeISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function somaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(deIso, ateIso) {
  return Math.round((new Date(ateIso + 'T12:00:00') - new Date(deIso + 'T12:00:00')) / 86400000);
}

function fmtData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

function rotuloDia(iso) {
  const hoje = hojeISO();
  if (iso === hoje) return 'Hoje';
  if (iso === somaDias(hoje, 1)) return 'Amanhã';
  if (iso === somaDias(hoje, -1)) return 'Ontem';
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(iso + 'T12:00:00').getDay()];
  return `${sem}, ${fmtData(iso)}`;
}

function faltam(dias) {
  if (dias === null || dias === undefined) return 'sem data de prova';
  if (dias < 0) return 'a prova já passou';
  if (dias === 0) return 'a prova é hoje!';
  if (dias === 1) return 'a prova é amanhã';
  return `faltam ${dias} dias`;
}

let toastTimer = null;
function toast(msg, tipo = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast on ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + tipo; }, 2200);
}

function toastXp(xp, extra = '') {
  if (xp > 0) toast(`+${xp} XP ${extra}`.trim(), 'xp');
}

async function rpc(nome, args = {}) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}

async function chamarFuncao(slug, corpo) {
  const { data: s } = await sb.auth.getSession();
  const token = s && s.session ? s.session.access_token : null;
  if (!token) { go('login'); throw new Error('sua sessão expirou, entra de novo'); }
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY },
    body: JSON.stringify(corpo),
  });
  let json = {};
  try { json = await resp.json(); } catch (_) { /* resposta sem corpo */ }
  if (!resp.ok) throw new Error(json.error || `erro ${resp.status}`);
  return json;
}

function falhou(err, onde = '') {
  console.error(onde, err);
  avisar((onde ? onde + ': ' : '') + (err && err.message ? err.message : err));
}

function ocupado(btn, texto) {
  const original = btn.dataset.original || btn.textContent;
  btn.dataset.original = original;
  btn.disabled = true;
  btn.textContent = texto;
  return () => { btn.disabled = false; btn.textContent = original; };
}

/* ===================== navegação ===================== */
// aba de baixo (celular) e item da barra lateral (computador) de cada tela
const NAV_DE = {
  home: 'home', cards: 'home', 'cards-fim': 'home', liga: 'home', perfil: 'home',
  enem: 'home', simulado: 'home', 'simulado-fim': 'home', redacao: 'home',
  materias: 'materias', materia: 'materias', upload: 'materias', pronto: 'materias', quiz: 'materias', 'quiz-fim': 'materias',
  tutor: 'tutor', 'tutor-chat': 'tutor',
  biblioteca: 'biblioteca', resumo: 'biblioteca', publicar: 'biblioteca', autor: 'biblioteca',
  comunidade: 'comunidade', sala: 'comunidade', grupos: 'comunidade', painel: 'comunidade',
};
const LADO_DE = {
  ...NAV_DE, enem: 'enem', simulado: 'enem', 'simulado-fim': 'enem', redacao: 'enem',
  liga: 'liga', grupos: 'grupos', painel: 'grupos', perfil: 'perfil',
};
const SEM_NAV = ['login', 'cadastro', 'recuperar', 'codigo'];
const TELAS_CHAT = ['tutor-chat', 'sala'];

function telaAtual() {
  const a = document.querySelector('.screen.active');
  return a ? a.id.replace('screen-', '') : null;
}

// profundidade de cada tela: entrar mais fundo desliza da direita, voltar desliza da esquerda, trocar de aba só funde
const NIVEL_TELA = {
  login: 0, cadastro: 1, recuperar: 1, codigo: 2,
  home: 0, materias: 0, tutor: 0, biblioteca: 0, comunidade: 0,
  enem: 1, liga: 1, grupos: 1, perfil: 1, materia: 1, 'tutor-chat': 1, resumo: 1, sala: 1,
  upload: 2, quiz: 2, cards: 2, publicar: 2, autor: 2, simulado: 2, redacao: 2, painel: 2,
  pronto: 3, 'quiz-fim': 3, 'cards-fim': 3, 'simulado-fim': 3,
};

function go(nome, opts = {}) {
  const de = telaAtual();
  estado.telaAnterior = de;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active', 'vai', 'volta', 'aba'));
  const tela = $('screen-' + nome);
  const a = NIVEL_TELA[de] ?? 0, b = NIVEL_TELA[nome] ?? 1;
  const jeito = !de || de === nome ? 'aba' : b > a ? 'vai' : b < a ? 'volta' : 'aba';
  void tela.offsetWidth;
  tela.classList.add('active', jeito);
  if (!opts.manterScroll) tela.scrollTop = 0;
  document.querySelectorAll('.navbar .nav-item').forEach((n) => n.classList.toggle('active', n.dataset.s === NAV_DE[nome]));
  document.querySelectorAll('.sidebar .nav-item').forEach((n) => n.classList.toggle('active', n.dataset.s === LADO_DE[nome]));
  const semNav = SEM_NAV.includes(nome);
  $('navbar').style.display = semNav || TELAS_CHAT.includes(nome) ? 'none' : 'flex';
  $('persistentCredit').classList.toggle('no-nav', semNav);
  $('persistentCredit').style.display = semNav ? 'block' : 'none';
  $('sidebar').classList.toggle('sidebar-hidden', semNav);
  $('fab-publicar').hidden = nome !== 'biblioteca';
  $('composer-tutor').hidden = nome !== 'tutor-chat';
  $('composer-sala').hidden = nome !== 'sala';
  if (nome !== 'sala' && window.pararSala) window.pararSala();
  if (typeof Voz !== 'undefined') Voz.pararFala();
  moverGota();
}

// a "gota" atrás da aba ativa desliza até a aba tocada
function moverGota() {
  const gota = $('nav-gota');
  if (!gota) return;
  const ativo = document.querySelector('.navbar .nav-item.active');
  if (!ativo || ativo.classList.contains('central') || $('navbar').style.display === 'none') { gota.style.opacity = '0'; return; }
  gota.style.opacity = '1';
  gota.style.setProperty('--x', ativo.offsetLeft + 'px');
  gota.style.setProperty('--w', ativo.offsetWidth + 'px');
}
window.addEventListener('resize', () => moverGota());

// textarea que cresce com o texto e Enter que envia (Shift+Enter pula linha)
function autoAltura(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 130) + 'px'; }
function enterEnvia(ev, fn) { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); fn(); } }

// lê uma foto, reduz e devolve em JPEG (para IA e para a tela)
function lerImagemComprimida(file, lado = 1600, qualidade = 0.8) {
  return new Promise((ok, falha) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => falha(new Error('não consegui ler a foto'));
    reader.onload = (e) => { img.src = e.target.result; };
    img.onerror = () => falha(new Error('esse arquivo não parece uma foto'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
      ok({ dataUrl, base64: dataUrl.split(',')[1] });
    };
    reader.readAsDataURL(file);
  });
}

function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `${dias} d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function toggleForm(tipo) {
  if (tipo === 'criar' || tipo === 'entrar') {
    $('form-' + (tipo === 'criar' ? 'entrar' : 'criar')).classList.remove('on');
  }
  if (tipo === 'editar-perfil') $('form-trocar-senha').classList.remove('on');
  if (tipo === 'trocar-senha') $('form-editar-perfil').classList.remove('on');
  $('form-' + tipo).classList.toggle('on');
}

function atualizarEnergia(restante) {
  if (restante === undefined || restante === null) return;
  const v = Math.max(0, restante);
  $('home-energia').textContent = v;
  $('sidebar-energia').textContent = v;
}

/* ===================== conta ===================== */
let papelSelecionado = 'aluno';

function setRole(role) {
  papelSelecionado = role;
  $('role-aluno').classList.toggle('on', role === 'aluno');
  $('role-professor').classList.toggle('on', role === 'professor');
  $('label-escola').textContent = role === 'professor' ? 'nome da escola em que você trabalha' : 'nome da escola em que você estuda';
  $('campo-serie').hidden = role === 'professor';
}

async function sha256Cliente(texto) {
  const dados = new TextEncoder().encode(texto.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function criarPerfilSeNaoExistir(usuarioAuth) {
  const authId = usuarioAuth.id;
  estado.eu = null;
  const { data: existente } = await sb.from('be_usuarios').select('id, papel').eq('auth_user_id', authId).maybeSingle();
  if (existente) {
    estado.usuarioId = existente.id;
    estado.papel = existente.papel;
    return { id: existente.id, novo: false };
  }
  const meta = usuarioAuth.user_metadata || {};
  const nome = $('input-nome').value.trim() || meta.full_name || meta.name || 'Estudante';
  const dados = {
    auth_user_id: authId, nome, papel: papelSelecionado,
    escola: $('input-escola').value.trim(), cidade: $('input-cidade').value.trim(),
  };
  if (papelSelecionado === 'aluno' && $('input-serie').value) dados.serie = $('input-serie').value;
  const pergunta = $('input-pergunta-seguranca').value.trim();
  const resposta = $('input-resposta-seguranca').value.trim();
  if (pergunta && resposta) {
    dados.pergunta_seguranca = pergunta;
    dados.resposta_seguranca_hash = await sha256Cliente(resposta);
  }
  const { data: novo, error } = await sb.from('be_usuarios').insert(dados).select('id, papel').single();
  if (error) throw error;
  estado.usuarioId = novo.id;
  estado.papel = novo.papel;
  return { id: novo.id, novo: true };
}

async function criarConta() {
  const nome = $('input-nome').value.trim();
  const email = $('input-email-cadastro').value.trim();
  const senha = $('input-senha-cadastro').value;
  const conf = $('input-senha-cadastro-confirma').value;
  if (!nome) return avisar('digite seu nome pra continuar');
  if (!email) return avisar('digite seu e-mail');
  if (!senha || senha.length < 6) return avisar('a senha precisa ter pelo menos 6 caracteres');
  if (senha !== conf) return avisar('as duas senhas não são iguais');
  if (!$('input-pergunta-seguranca').value.trim() || !$('input-resposta-seguranca').value.trim()) {
    return avisar('preenche a pergunta e a resposta de segurança — é como você recupera a senha sem e-mail');
  }
  const pronto = ocupado($('btn-cadastro'), 'Criando...');
  try {
    // a conta nasce confirmada (sem e-mail de confirmação) e já entra com a senha
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/estude-cadastro`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, senha, nome }),
    });
    let r = {};
    try { r = await resp.json(); } catch (_) { /* sem corpo */ }
    if (!resp.ok) {
      if (resp.status === 409) { $('input-email-login').value = email; go('login'); }
      return avisar(r.error || 'não consegui criar sua conta agora, tenta de novo');
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    await criarPerfilSeNaoExistir(data.user);
    go('codigo');
  } catch (err) {
    falhou(err, 'Não consegui criar sua conta');
  } finally { pronto(); }
}

async function entrarComEmailSenha() {
  const email = $('input-email-login').value.trim();
  const senha = $('input-senha-login').value;
  if (!email || !senha) return avisar('preenche e-mail e senha');
  const pronto = ocupado($('btn-login'), 'Entrando...');
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    await criarPerfilSeNaoExistir(data.user);
    verHoje();
  } catch (err) {
    const msg = err.message === 'Invalid login credentials' ? 'e-mail ou senha errados'
      : /not confirmed/i.test(err.message) ? 'essa conta ainda não foi liberada, fala com o suporte' : err.message;
    avisar('Não consegui entrar: ' + msg);
  } finally { pronto(); }
}

async function buscarPerguntaSeguranca() {
  const email = $('input-email-recuperar').value.trim();
  if (!email) return avisar('digita seu e-mail');
  const pronto = ocupado($('btn-buscar-pergunta'), 'Buscando...');
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/resetar-senha-segura`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, apenas_buscar_pergunta: true }),
    });
    const r = await resp.json();
    if (!resp.ok) throw new Error(r.error || 'não achei essa conta');
    $('label-pergunta-mostrada').textContent = r.pergunta;
    $('bloco-pergunta-seguranca').style.display = 'block';
    $('btn-buscar-pergunta').style.display = 'none';
  } catch (err) { avisar(err.message); } finally { pronto(); }
}

async function resetarSenhaComPergunta() {
  const email = $('input-email-recuperar').value.trim();
  const resposta = $('input-resposta-recuperar').value.trim();
  const nova = $('input-nova-senha-pergunta').value;
  if (!resposta) return avisar('responde a pergunta de segurança');
  if (!nova || nova.length < 6) return avisar('a senha nova precisa ter pelo menos 6 caracteres');
  if (nova !== $('input-nova-senha-pergunta-confirma').value) return avisar('as duas senhas não são iguais');
  const pronto = ocupado($('btn-resetar-com-pergunta'), 'Trocando...');
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/resetar-senha-segura`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, resposta, nova_senha: nova }),
    });
    const r = await resp.json();
    if (!resp.ok) throw new Error(r.error || 'erro desconhecido');
    avisar('Senha trocada! Agora é só entrar com ela.');
    $('input-email-login').value = email;
    go('login');
  } catch (err) { avisar(err.message); } finally { pronto(); }
}

async function entrarComCodigo() {
  const codigo = $('input-codigo').value.trim().toUpperCase();
  if (!codigo) return verHoje();
  const pronto = ocupado($('btn-codigo'), 'Entrando...');
  try {
    const nome = await entrarNoGrupoPorCodigo(codigo);
    if (!nome) return;
    avisar('Você entrou em: ' + nome + ' 🎉');
    verHoje();
  } catch (err) { falhou(err, 'Não consegui entrar no grupo'); } finally { pronto(); }
}

async function sair() {
  if (!(await confirmar('Sair da conta?', { sim: 'Sair' }))) return;
  await sb.auth.signOut();
  location.reload();
}

/* ===================== HOJE ===================== */
function verHoje() { go('home'); carregarHoje(); }

async function carregarHoje() {
  try {
    const r = await rpc('be_resumo_hoje');
    estado.resumo = r;
    estado.papel = r.papel;
    $('home-saudacao').textContent = 'Oi, ' + ((r.nome || '').split(' ')[0] || 'estudante') + '!';
    $('home-sub').textContent = r.estudou_hoje ? 'hoje já tem visto, continua assim' : 'bora pro plano de hoje?';
    atualizarEnergia(r.energia);

    Fx.contar($('home-streak'), r.streak, { fmt: (v) => `${v} dia${v === 1 ? '' : 's'}`, dur: 600 });
    $('home-chama').classList.toggle('acesa', r.streak > 0 && r.estudou_hoje);
    const stamps = $('home-stamps');
    stamps.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('div');
      const feitos = Math.min(r.streak, r.estudou_hoje ? 7 : 6);
      if (i < feitos) { s.className = 'stamp done'; s.textContent = '✓'; }
      else if (i === feitos && !r.estudou_hoje) { s.className = 'stamp today'; s.textContent = '?'; }
      else s.className = 'stamp';
      stamps.appendChild(s);
    }
    $('home-nivel').textContent = 'nível ' + r.nivel;
    $('home-xp').textContent = r.xp + ' XP';
    requestAnimationFrame(() => { $('home-xp-fill').style.width = Math.max(3, (r.xp % 200) / 2) + '%'; });
    verificarNivel(r.nivel);

    renderTarefasHoje(r);
    pintarAvatarHome();
    if (typeof carregarHomeBiblio === 'function') { carregarHomeBiblio(); contarNaoLidas(); }

    const pend = r.cards_pendentes || 0;
    const novos = Math.min(r.cards_novos || 0, 20);
    Fx.contar($('home-cards-n'), pend + novos, { dur: 500 });
    $('home-cards-s').textContent = pend + novos === 0
      ? 'nada pra revisar agora — os cards voltam no dia certo'
      : `${pend} pra revisar${novos ? ` + ${novos} novo${novos === 1 ? '' : 's'}` : ''} · antes de esquecer`;

    const div = DIVISOES[r.divisao] || DIVISOES.bronze;
    $('home-liga-medal').src = 'adesivos/' + ({ bronze: 'medalha3', prata: 'medalha2', ouro: 'medalha1', diamante: 'diamante' }[r.divisao] || 'medalha3') + '.webp';
    if (r.liga) {
      $('home-liga-t').textContent = `Liga ${div[1]} · ${r.liga.posicao}º de ${r.liga.total}`;
      $('home-liga-s').textContent = `${r.liga.xp_semana} XP essa semana · os 5 primeiros sobem`;
    } else {
      $('home-liga-t').textContent = `Liga ${div[1]}`;
      $('home-liga-s').textContent = 'ganhe seu primeiro XP da semana pra entrar na disputa';
    }

    const provas = r.provas || [];
    $('home-provas').innerHTML = provas.length ? `
      <div class="section-title"><h2>Próximas provas</h2></div>
      <div class="exam-row" style="margin-bottom:22px;">${provas.map((p) => `
        <div class="exam-chip" onclick="abrirMateria('${p.id}')">
          <div class="d">${p.dias === 0 ? 'hoje' : p.dias}</div><div class="w">${p.dias === 0 ? 'é a prova' : p.dias === 1 ? 'dia' : 'dias'}</div>
          <div class="n">${esc(p.nome)}</div><div class="w">prova ${fmtData(p.data_prova)}</div>
        </div>`).join('')}</div>` : '';
  } catch (err) {
    $('home-tarefas').innerHTML = `<div class="empty">não consegui carregar seu dia (${esc(err.message)})</div>`;
  }
}

async function pintarAvatarHome() {
  if (!estado.eu) {
    const { data } = await sb.from('be_usuarios').select('nome, avatar_base64, serie').eq('id', estado.usuarioId).maybeSingle();
    estado.eu = data || {};
  }
  pintarAvatar($('home-avatar'), estado.eu);
}

function verificarNivel(nivel) {
  if (!estado.usuarioId || !nivel) return;
  const chave = 'estude-nivel-' + estado.usuarioId;
  let antes = null;
  try { antes = Number(localStorage.getItem(chave)) || null; localStorage.setItem(chave, String(nivel)); } catch (_) { return; }
  if (antes && nivel > antes) setTimeout(() => Fx.nivel(nivel), 500);
}

function htmlTarefa(t, opts = {}) {
  estado.tarefas[t.id] = t;
  const meta = [];
  if (opts.comMateria && t.materia) meta.push(esc(t.materia));
  meta.push(`${t.minutos} min`);
  if (t.atrasada && !t.feita) meta.push(`<span class="late">atrasada · ${fmtData(t.dia)}</span>`);
  const acao = t.feita ? 'refazer' : 'fazer';
  const hoje = hojeISO();
  const botao = (!opts.editavel || t.dia <= hoje) ? `<button class="go-small" onclick="fazerTarefa('${t.id}')">${acao}</button>` : '';
  let ferramentas = '';
  let editar = '';
  if (opts.editavel && !t.feita) {
    editar = `<button class="icon-btn edit" title="mudar o dia ou tirar do plano" aria-label="mudar o dia ou tirar do plano" onclick="this.closest('.task').classList.toggle('editando')"><svg class="ico"><use href="#i-editar"/></svg></button>`;
    ferramentas = `<div class="task-tools">
      <input type="date" value="${t.dia}" min="${hoje}" onchange="moverTarefa('${t.id}', this.value)" title="mudar o dia">
      <button class="icon-btn" title="tirar do plano" aria-label="tirar do plano" onclick="excluirTarefa('${t.id}')"><svg class="ico"><use href="#i-lixo"/></svg></button></div>`;
  }
  return `<div class="task ${t.feita ? 'done' : ''}" data-id="${t.id}">
    <button class="check" title="${t.feita ? 'desmarcar' : 'marcar como feita'}" onclick="alternarTarefa('${t.id}')">${t.feita ? '✓' : ''}</button>
    <div class="task-body"><div class="task-title">${esc(t.titulo)}</div><div class="task-meta">${meta.join(' · ')}</div>${ferramentas}</div>
    ${editar}${botao}
  </div>`;
}

function renderTarefasHoje(r) {
  const lista = r.tarefas || [];
  const feitas = lista.filter((t) => t.feita && t.dia === r.hoje).length;
  const deHoje = lista.filter((t) => t.dia === r.hoje).length;
  $('home-plano-sub').textContent = deHoje ? `${feitas} de ${deHoje} feitas` : '';
  const anel = $('home-anel');
  $('home-anel-n').textContent = `${feitas}/${deHoje}`;
  anel.classList.toggle('completo', deHoje > 0 && feitas === deHoje);
  anel.classList.toggle('zero', feitas === 0);
  requestAnimationFrame(() => anel.style.setProperty('--p', deHoje ? Math.round((feitas / deHoje) * 100) : 0));
  if (!lista.length) {
    $('home-tarefas').innerHTML = (r.provas || []).length
      ? '<div class="empty">nada marcado pra hoje — aproveita pra revisar os flashcards 😉</div>'
      : `<div class="empty">crie uma matéria com a data da prova<br>e eu monto seu plano dia a dia</div>
         <button class="btn coral full" style="margin-top:10px;" onclick="novaMateria()">+ criar matéria</button>`;
    return;
  }
  const todasFeitas = deHoje > 0 && feitas === deHoje;
  $('home-tarefas').innerHTML = (todasFeitas ? '<div class="empty" style="margin-bottom:6px;">dia completo! 🎉 volta amanhã pra manter a sequência</div>' : '')
    + lista.map((t) => htmlTarefa(t, { comMateria: true })).join('');
}

async function alternarTarefa(id) {
  const t = estado.tarefas[id];
  if (!t || alternarTarefa.ocupado) return;
  alternarTarefa.ocupado = true;
  const el = document.querySelector(`.screen.active .task[data-id="${id}"]`);
  const marcando = !t.feita;
  if (el && marcando) { el.classList.add('done', 'recem'); Fx.vistoMini(el); }
  try {
    const r = await rpc('be_marcar_tarefa', { p_tarefa: id, p_feita: marcando });
    if (marcando && el) Fx.xp(el.querySelector('.check'), r.xp);
    if (r.dia_completo) { Fx.visto('dia completo'); toast(`Dia completo! +${r.xp} XP`, 'xp'); }
    setTimeout(recarregarTelaAtual, marcando ? (r.dia_completo ? 1500 : 750) : 0);
  } catch (err) {
    if (el && marcando) el.classList.remove('done', 'recem');
    falhou(err);
  } finally { setTimeout(() => { alternarTarefa.ocupado = false; }, 400); }
}

function recarregarTelaAtual() {
  const ativa = document.querySelector('.screen.active');
  if (!ativa) return;
  if (ativa.id === 'screen-home') carregarHoje();
  if (ativa.id === 'screen-materia') abrirMateria(estado.materiaId, abaAtual);
}

async function concluirTarefaAtual() {
  const t = estado.tarefaAtual;
  estado.tarefaAtual = null;
  if (!t || t.feita) return;
  try {
    const r = await rpc('be_marcar_tarefa', { p_tarefa: t.id, p_feita: true });
    if (r.dia_completo) { Fx.visto('dia completo'); toast(`Tarefa feita, dia completo! +${r.xp} XP`, 'xp'); }
    else toast(`Tarefa do plano feita: +${r.xp} XP`, 'xp');
  } catch (err) { console.warn(err); }
}

function fazerTarefa(id) {
  const t = estado.tarefas[id];
  if (!t) return;
  estado.tarefaAtual = t;
  if (t.tipo === 'estudar') return abrirMateria(t.materia_id, 'resumo');
  if (t.tipo === 'revisao_geral') return abrirMateria(t.materia_id, 'mapa');
  if (t.tipo === 'quiz') return iniciarQuizMateria(t.materia_id, 'quiz', t.topico_id);
  if (t.tipo === 'prova') return iniciarQuizMateria(t.materia_id, 'prova');
  if (t.tipo === 'cards') return abrirRevisaoCards(t.materia_id);
}

/* ===================== MATÉRIAS ===================== */
function verMaterias() { go('materias'); carregarMaterias(); }

async function carregarMaterias() {
  const lista = $('lista-materias');
  const { data: materias, error } = await sb.from('be_materias')
    .select('id, nome, data_prova, created_at, status, grupo_id, usuario_id')
    .order('created_at', { ascending: false });
  if (error) { lista.innerHTML = `<div class="empty">erro ao carregar</div>`; return; }
  const hoje = hojeISO();
  for (const m of materias || []) {
    if (m.status === 'ativa' && m.data_prova && m.data_prova < hoje && m.usuario_id) {
      await sb.from('be_materias').update({ status: 'arquivada' }).eq('id', m.id);
      m.status = 'arquivada';
    }
  }
  if (!materias || !materias.length) {
    lista.innerHTML = '<div class="empty">você ainda não tem matérias — toca em "+ nova matéria" pra começar</div>';
    return;
  }
  const card = (m) => `
    <div class="group-card" style="cursor:pointer;" onclick="abrirMateria('${m.id}')">
      <div class="group-card-top"><div>
        <h3>${m.status === 'arquivada' ? '📦 ' : ''}${esc(m.nome)}</h3>
        <span class="hand">${m.data_prova ? faltam(diasEntre(hoje, m.data_prova)) + ' · ' + fmtData(m.data_prova) : 'sem data de prova'}${m.grupo_id ? ' · 👥 da turma' : ''}</span>
      </div></div>
    </div>`;
  const ativas = materias.filter((m) => m.status === 'ativa');
  const arquivadas = materias.filter((m) => m.status === 'arquivada');
  lista.innerHTML = (ativas.length ? '<div class="step-label">ativas</div>' + ativas.map(card).join('') : '')
    + (arquivadas.length ? '<div class="step-label" style="margin-top:18px;">arquivadas</div>' + arquivadas.map(card).join('') : '');
}

/* ===================== MATÉRIA ===================== */
let abaAtual = 'plano';

function voltarDaMateria() {
  if (estado.tarefaAtual) { estado.tarefaAtual = null; return verHoje(); }
  verMaterias();
}

async function abrirMateria(id, aba = 'plano') {
  if (!id) return;
  estado.materiaId = id;
  go('materia');
  $('mat-titulo').textContent = 'carregando...';
  let d;
  try {
    d = await rpc('be_materia_detalhe', { p_materia: id });
    // matéria da turma (ou antiga) com prova marcada e sem plano pra essa pessoa: monta agora
    if (d.materia.data_prova && d.materia.dias >= 0 && !d.tarefas.length && d.topicos.length && d.materia.status === 'ativa') {
      await rpc('be_gerar_plano', { p_materia: id });
      d = await rpc('be_materia_detalhe', { p_materia: id });
    }
  } catch (err) { return falhou(err, 'Não consegui abrir a matéria'); }
  estado.detalhe = d;
  const m = d.materia;
  $('mat-titulo').textContent = m.nome;

  const pills = [];
  const rotuloProva = m.data_prova ? `prova ${fmtData(m.data_prova)}, ${faltam(m.dias)}` : (m.pode_editar ? 'definir data da prova' : 'sem data de prova');
  pills.push(m.pode_editar ? `<button class="pill btn" onclick="toggleForm('data-prova')">${rotuloProva}</button>` : `<span class="pill">${rotuloProva}</span>`);
  if (m.grupo_nome) pills.push(`<span class="pill lilac">${m.grupo_tipo === 'grupo_amigos' ? 'grupo' : 'turma'} ${esc(m.grupo_nome)}</span>`);
  if (d.topicos.length) pills.push(`<span class="pill">${d.topicos.length} tópicos</span>`);
  $('mat-meta').innerHTML = pills.join('');
  $('input-mat-data').value = m.data_prova || '';
  $('input-mat-data').min = hojeISO();
  $('form-data-prova').classList.remove('on');

  renderArquivada(d);
  renderPlanoMateria(d);
  renderResumo(d);
  renderMapa(d);
  renderCardsMateria(d);
  renderQuizMateria(d, 'quiz');
  renderQuizMateria(d, 'prova');

  const icones = { foto: '📷', pdf: '📄', youtube: '▶️', link: '🔗', texto: '✍️' };
  const nomes = { foto: 'Foto', pdf: 'PDF', youtube: 'Vídeo do YouTube', link: 'Site', texto: 'Texto colado' };
  $('mat-materiais').innerHTML = d.materiais.length ? d.materiais.map((mt) => `
    <div class="material-item"><span class="m-ic">${mt.tipo === 'link' && !mt.tem_url ? icones.texto : (icones[mt.tipo] || '📄')}</span>
      <div style="flex:1;"><div class="m-name">${mt.tipo === 'link' && !mt.tem_url ? nomes.texto : (nomes[mt.tipo] || esc(mt.tipo))}</div><div class="m-meta">adicionado ${new Date(mt.created_at).toLocaleDateString('pt-BR')}</div></div>
      ${mt.meu ? `<span class="m-del" title="excluir" onclick="excluirMaterial('${mt.id}')">✕</span>` : ''}
    </div>`).join('') : '<div class="empty" style="margin-bottom:10px;">nenhum material ainda</div>';
  $('btn-excluir-materia').hidden = !m.dono;
  // na turma do professor só ele adiciona material; no grupo de amigos, qualquer membro
  $('mat-add-row').hidden = !m.pode_editar;

  abaMateria(aba);
}

function abaMateria(aba) {
  abaAtual = aba;
  document.querySelectorAll('#mat-menu .content-menu-btn').forEach((b) => b.classList.toggle('on', b.dataset.tipo === aba));
  document.querySelectorAll('.mat-painel').forEach((p) => { p.hidden = p.id !== 'mat-' + aba; });
}

function renderArquivada(d) {
  const wrap = $('mat-arquivada');
  if (d.materia.status !== 'arquivada') { wrap.innerHTML = ''; return; }
  const r = d.resultado || { respondidas: 0, acertos: 0 };
  const pct = r.respondidas ? Math.round((r.acertos / r.respondidas) * 100) : null;
  wrap.innerHTML = `<div class="resultado-final-card">
    <h3>📦 Ciclo encerrado</h3>
    ${pct === null ? '<p class="hand" style="font-size:13px; opacity:.9;">A data da prova passou. Você não chegou a responder perguntas dessa matéria.</p>'
      : `<div class="grande">${pct}%</div><p class="hand" style="font-size:13px; opacity:.9; margin:0;">de acerto em ${r.respondidas} respostas</p>`}
    ${d.materia.nota_real !== null && d.materia.nota_real !== undefined
      ? `<p class="hand" style="margin-top:10px;">Sua nota real: <b>${esc(d.materia.nota_real)}</b></p>`
      : d.materia.pode_editar ? `<div class="nota-real-row"><input type="number" step="0.1" min="0" max="10" id="input-nota-real" placeholder="0-10"><button onclick="salvarNotaReal()">salvar nota da prova</button></div>` : ''}
  </div>`;
}

async function salvarNotaReal() {
  const v = parseFloat($('input-nota-real').value);
  if (isNaN(v) || v < 0 || v > 10) return avisar('digita uma nota entre 0 e 10');
  const { error } = await sb.from('be_materias').update({ nota_real: v }).eq('id', estado.materiaId);
  if (error) return falhou(error);
  abrirMateria(estado.materiaId, abaAtual);
}

function htmlDominio(topicos) {
  if (!topicos.length) return '';
  return `<div class="card"><div class="card-head"><h3>Domínio por tópico</h3><span class="hand">sobe a cada acerto</span></div>
    ${topicos.map((t) => {
      const pct = Math.round((t.score || 0) * 100);
      const cls = pct < 40 ? 'lo' : pct < 70 ? 'mid' : 'hi';
      return `<div class="mastery"><div class="mastery-top"><span class="nm">${esc(t.nome)}</span>
        <span class="pc">${t.respondidas ? pct + '%' : 'ainda não praticado'}</span></div>
        <div class="mastery-track"><div class="mastery-fill ${cls}" style="width:${t.respondidas ? Math.max(pct, 4) : 0}%"></div></div></div>`;
    }).join('')}</div>`;
}

function renderPlanoMateria(d) {
  const m = d.materia;
  const painel = $('mat-plano');
  let html = '';
  if (!m.data_prova) {
    html += `<div class="card center"><p class="hand muted" style="margin:0 0 12px;">Me diz quando é a prova que eu distribuo os tópicos até lá, com revisão e prova simulada na véspera.</p>
      ${m.pode_editar ? `<button class="btn coral" onclick="toggleForm('data-prova')">Definir data da prova</button>` : '<p class="small muted" style="margin:0;">o professor ainda não marcou a data</p>'}</div>`;
  } else {
    const porDia = {};
    d.tarefas.forEach((t) => { (porDia[t.dia] = porDia[t.dia] || []).push(t); });
    const dias = Object.keys(porDia).sort();
    html += `<div class="card"><div class="card-head"><h3>Plano até a prova</h3>
      <button class="link-btn" onclick="refazerPlano()">↻ refazer plano</button></div>`;
    if (!dias.length) {
      html += m.dias >= 0 ? '<div class="empty">nenhuma tarefa — toque em "refazer plano"</div>' : '<div class="empty">a prova já passou</div>';
    }
    const hoje = hojeISO();
    const VISIVEIS = 4;
    dias.forEach((dia, i) => {
      if (i === VISIVEIS) html += `<div id="plano-resto" hidden>`;
      html += `<div class="day-label">${rotuloDia(dia)}</div>`;
      html += porDia[dia].map((t) => htmlTarefa({ ...t, materia_id: m.id, materia: m.nome, atrasada: dia < hoje }, { editavel: dia >= hoje })).join('');
    });
    if (dias.length > VISIVEIS) {
      html += `</div><button class="btn ghost full" style="margin-top:12px;" id="btn-plano-resto"
        onclick="$('plano-resto').hidden = false; this.remove();">ver o plano completo (mais ${dias.length - VISIVEIS} dias até a prova)</button>`;
    }
    html += `<div class="new-group-row" style="margin:14px 0 0;"><div class="ghost-btn" onclick="toggleForm('nova-tarefa')">+ tarefa minha</div></div>
      <div class="inline-form" id="form-nova-tarefa" style="margin:12px 0 0;">
        <label>o que fazer</label><input type="text" id="nt-titulo" placeholder="ex: refazer exercícios do capítulo 3">
        <div class="row"><div><label>dia</label><input type="date" id="nt-dia" min="${hoje}" value="${hoje}"></div>
        <div><label>minutos</label><input type="number" id="nt-min" value="20" min="5" max="240"></div></div>
        <button class="go-btn" onclick="adicionarTarefa()">Adicionar ao plano</button>
      </div></div>`;
  }
  html += htmlDominio(d.topicos);
  painel.innerHTML = html;
}

async function salvarDataProva() {
  const data = $('input-mat-data').value;
  if (!data) return avisar('escolhe a data da prova');
  if (data < hojeISO()) return avisar('a data precisa ser hoje ou depois');
  try {
    const { error } = await sb.from('be_materias').update({ data_prova: data }).eq('id', estado.materiaId);
    if (error) throw error;
    const n = await rpc('be_gerar_plano', { p_materia: estado.materiaId });
    toast(`Plano montado: ${n} tarefas até a prova`);
    abrirMateria(estado.materiaId, 'plano');
  } catch (err) { falhou(err, 'Não consegui salvar a data'); }
}

async function refazerPlano() {
  if (!(await confirmar('Refazer o plano?\nAs tarefas futuras que ainda não foram feitas são redistribuídas, começando pelos tópicos em que você está mais fraco. As que você criou à mão continuam.', { sim: 'Refazer' }))) return;
  try {
    const n = await rpc('be_gerar_plano', { p_materia: estado.materiaId });
    toast(`Plano refeito: ${n} tarefas`);
    abrirMateria(estado.materiaId, 'plano');
  } catch (err) { falhou(err); }
}

async function moverTarefa(id, dia) {
  if (!dia) return;
  const { error } = await sb.from('be_plano_tarefas').update({ dia }).eq('id', id);
  if (error) return falhou(error);
  toast('Tarefa movida pra ' + rotuloDia(dia).toLowerCase());
  abrirMateria(estado.materiaId, 'plano');
}

async function excluirTarefa(id) {
  if (!(await confirmar('Tirar essa tarefa do plano?', { sim: 'Tirar' }))) return;
  const { error } = await sb.from('be_plano_tarefas').delete().eq('id', id);
  if (error) return falhou(error);
  abrirMateria(estado.materiaId, 'plano');
}

async function adicionarTarefa() {
  const titulo = $('nt-titulo').value.trim();
  const dia = $('nt-dia').value;
  const minutos = parseInt($('nt-min').value, 10) || 20;
  if (!titulo) return avisar('escreve o que você vai fazer');
  if (!dia) return avisar('escolhe o dia');
  const { error } = await sb.from('be_plano_tarefas').insert({
    usuario_id: estado.usuarioId, materia_id: estado.materiaId, dia, tipo: 'estudar', titulo, minutos, manual: true, ordem: 9,
  });
  if (error) return falhou(error);
  abrirMateria(estado.materiaId, 'plano');
}

function botaoConcluir(tipos) {
  const t = estado.tarefaAtual;
  if (!t || t.materia_id !== estado.materiaId || !tipos.includes(t.tipo)) return '';
  return `<button class="btn coral full" style="margin-bottom:22px;" onclick="concluirLeitura()">Estudei, marcar tarefa como feita</button>`;
}

async function concluirLeitura() {
  await concluirTarefaAtual();
  abrirMateria(estado.materiaId, 'plano');
}

function paragrafos(texto) {
  return String(texto || '').split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p)}</p>`).join('');
}

function renderResumo(d) {
  const curi = (d.curiosidades && d.curiosidades.lista) || [];
  const barra = d.resumo ? `<div class="barra-ouvir">
      <button class="ghost-btn" id="mat-ouvir" onclick="botaoOuvir(this, estado.detalhe.resumo.texto)"><svg class="ico"><use href="#i-som"/></svg><span>Ouvir resumo</span></button>
      <button class="ghost-btn" onclick="novoResumo({ materiaId: estado.materiaId })"><svg class="ico"><use href="#i-biblioteca"/></svg><span>Publicar na biblioteca</span></button></div>` : '';
  $('mat-resumo').innerHTML = barra + (d.resumo ? `<div class="card texto-resumo">${paragrafos(d.resumo.texto)}</div>` : '<div class="card"><div class="empty">nenhum resumo ainda, adicione um material</div></div>')
    + (curi.length ? `<div class="card"><h3>Curiosidades</h3>${curi.map((c) => `<div class="ranking-row"><span>💡 ${esc(c)}</span></div>`).join('')}</div>` : '')
    + botaoConcluir(['estudar', 'revisao_geral']);
}

function renderMapa(d) {
  const mapa = d.mapa_mental;
  if (!mapa || !mapa.ramos || !mapa.ramos.length) {
    $('mat-mapa').innerHTML = '<div class="card"><div class="empty">sem mapa mental ainda</div></div>' + botaoConcluir(['estudar', 'revisao_geral']);
    return;
  }
  $('mat-mapa').innerHTML = `<div class="card mapa"><div class="mind-center">${esc(mapa.tema_central || d.materia.nome)}</div>
    ${mapa.ramos.map((r) => `<div class="mind-branch"><div class="t">${esc(r.titulo)}</div><ul>${(r.pontos || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
  </div>` + botaoConcluir(['estudar', 'revisao_geral']);
}

function renderCardsMateria(d) {
  const opts = d.topicos.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  $('mat-cards').innerHTML = `<div class="card center">
      <div class="score-big">${d.cards_pendentes}</div>
      <p class="hand muted" style="margin:6px 0 14px;">pra revisar hoje · ${d.cards_total} cards na matéria</p>
      <button class="btn coral full" ${d.cards_total ? '' : 'disabled'} onclick="abrirRevisaoCards('${d.materia.id}')">Revisar agora</button>
    </div>
    ${d.materia.pode_editar ? `<div class="card"><h3>Criar card</h3>
      <div class="field"><label>frente (pergunta)</label><input type="text" id="nc-frente" placeholder="ex: O que é osmose?"></div>
      <div class="field"><label>verso (resposta)</label><textarea id="nc-verso" style="min-height:70px;" placeholder="ex: passagem de água do meio menos concentrado pro mais concentrado"></textarea></div>
      ${opts ? `<div class="field"><label>tópico</label><select id="nc-topico"><option value="">—</option>${opts}</select></div>` : ''}
      <button class="btn full" onclick="criarCard()">Adicionar card</button>
    </div>` : ''}`;
}

async function criarCard() {
  const frente = $('nc-frente').value.trim();
  const verso = $('nc-verso').value.trim();
  if (!frente || !verso) return avisar('preenche a frente e o verso');
  const topico = $('nc-topico') ? $('nc-topico').value || null : null;
  const { error } = await sb.from('be_cards').insert({
    materia_id: estado.materiaId, frente, verso, origem: 'manual', criado_por: estado.usuarioId, topico_id: topico,
  });
  if (error) return falhou(error, error.code === '23505' ? 'Já existe um card com essa frente' : 'Não consegui criar o card');
  toast('Card criado');
  abrirMateria(estado.materiaId, 'cards');
}

function renderQuizMateria(d, tipo) {
  const lista = d[tipo] || [];
  const alvo = $('mat-' + tipo);
  if (!lista.length) { alvo.innerHTML = '<div class="card"><div class="empty">ainda não tem perguntas — adicione um material</div></div>'; return; }
  const topicosComPerguntas = d.topicos.filter((t) => lista.filter((p) => p.topico_id === t.id).length >= 1);
  alvo.innerHTML = `<div class="card center">
    <div class="score-big">${lista.length}</div>
    <p class="hand muted" style="margin:6px 0 14px;">${tipo === 'quiz' ? 'perguntas rápidas de prática' : 'perguntas simulando a prova de verdade'}</p>
    <button class="btn coral full" onclick="iniciarQuizMateria('${d.materia.id}', '${tipo}')">${tipo === 'quiz' ? 'Jogar o quiz' : 'Fazer a prova'}</button>
    ${tipo === 'quiz' && topicosComPerguntas.length > 1 ? `<div class="step-label" style="margin-top:16px;">ou só um tópico</div>
      <div class="chip-toggle" style="justify-content:center;">${topicosComPerguntas.map((t) => `<div class="chip small" onclick="iniciarQuizMateria('${d.materia.id}', 'quiz', '${t.id}')">${esc(t.nome)}</div>`).join('')}</div>` : ''}
  </div>`;
}

async function excluirMaterial(id) {
  if (!(await confirmar('Excluir esse material?\nO resumo e o quiz continuam com o que já foi gerado.', { sim: 'Excluir' }))) return;
  const { error } = await sb.from('be_materiais').delete().eq('id', id);
  if (error) return falhou(error);
  abrirMateria(estado.materiaId, abaAtual);
}

async function excluirMateriaAtual() {
  if (!(await confirmar('Excluir essa matéria inteira?\nApaga materiais, quiz, flashcards, plano e histórico dela. Não dá pra desfazer.', { sim: 'Excluir tudo' }))) return;
  const { error } = await sb.from('be_materias').delete().eq('id', estado.materiaId);
  if (error) return falhou(error);
  verMaterias();
}

/* ===================== NOVA MATÉRIA / UPLOAD ===================== */
function novaMateria(opts = {}) {
  const u = estado.upload;
  u.grupoId = opts.grupoId || null;
  u.grupoNome = opts.grupoNome || null;
  u.materiaAlvo = opts.materiaId || null;
  u.foto = null; u.pdf = null;
  ['input-materia', 'input-data-prova', 'input-youtube', 'input-link', 'input-texto'].forEach((id) => { $(id).value = ''; });
  $('input-data-prova').min = hojeISO();
  $('foto-placeholder').style.display = 'flex';
  $('foto-preview').style.display = 'none';
  $('foto-moldura').classList.remove('com-foto');
  $('foto-status').textContent = 'toque pra tirar a foto';
  $('pdf-caixa').classList.remove('pronto');
  $('pdf-status').textContent = 'toque pra escolher um PDF (até 15 MB)';
  $('upload-passos-materia').hidden = !!u.materiaAlvo;
  $('upload-passo-fonte').innerHTML = u.materiaAlvo ? 'de onde vem o material novo?' : '<b>3</b> de onde vem o material?';
  $('upload-titulo').textContent = u.materiaAlvo ? 'Adicionar material' : (u.grupoId ? 'Matéria da turma' : 'Nova matéria');
  $('upload-grupo').textContent = u.grupoId ? `vai aparecer pra todo mundo de ${u.grupoNome || 'a turma'}` : (u.materiaAlvo ? `em ${estado.detalhe ? estado.detalhe.materia.nome : 'essa matéria'}` : '');
  setSource('foto');
  go('upload');
}

function adicionarMaterialNaMateria() {
  novaMateria({ materiaId: estado.materiaId });
}

function voltarDoUpload() {
  if (estado.upload.materiaAlvo) return abrirMateria(estado.upload.materiaAlvo, abaAtual);
  if (estado.upload.grupoId) {
    const g = (estado.grupos || []).find((x) => x.id === estado.upload.grupoId);
    return g && g.papel !== 'admin' ? verGrupos() : abrirPainel(estado.upload.grupoId);
  }
  verHoje();
}

function setSource(fonte) {
  estado.upload.fonte = fonte;
  document.querySelectorAll('.src-tab').forEach((t) => t.classList.toggle('on', t.dataset.fonte === fonte));
  document.querySelectorAll('.source-panel').forEach((p) => p.classList.toggle('on', p.id === 'src-' + fonte));
}

function fotoSelecionada(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; };
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    canvas.width = img.width * escala;
    canvas.height = img.height * escala;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    estado.upload.foto = dataUrl.split(',')[1];
    $('foto-placeholder').style.display = 'none';
    $('foto-preview').src = dataUrl;
    $('foto-preview').style.display = 'block';
    const moldura = $('foto-moldura');
    moldura.classList.remove('com-foto'); void moldura.offsetWidth; moldura.classList.add('com-foto');
    $('foto-status').textContent = 'foto pronta, toque pra trocar';
  };
  reader.readAsDataURL(file);
}

function pdfSelecionado(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return avisar('Esse PDF está grande demais (máx. 15 MB).');
  const reader = new FileReader();
  reader.onload = (e) => {
    estado.upload.pdf = e.target.result.split(',')[1];
    const caixa = $('pdf-caixa');
    caixa.classList.remove('pronto'); void caixa.offsetWidth; caixa.classList.add('pronto');
    const kb = file.size / 1024;
    $('pdf-status').innerHTML = `<b>${esc(file.name)}</b><br><span class="small muted">${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(kb)) + ' KB'}, pronto pra gerar</span>`;
  };
  reader.readAsDataURL(file);
}

function payloadDaFonte() {
  const u = estado.upload;
  if (u.fonte === 'foto') { if (!u.foto) throw new Error('tira ou escolhe uma foto do material primeiro'); return { tipo_fonte: 'foto', imagem_base64: u.foto }; }
  if (u.fonte === 'pdf') { if (!u.pdf) throw new Error('escolhe um PDF primeiro'); return { tipo_fonte: 'pdf', pdf_base64: u.pdf }; }
  if (u.fonte === 'texto') {
    const t = $('input-texto').value.trim();
    if (t.length < 80) throw new Error('cola um texto um pouco maior (pelo menos umas 2 linhas)');
    return { tipo_fonte: 'texto', texto: t };
  }
  if (u.fonte === 'youtube') { const url = $('input-youtube').value.trim(); if (!url) throw new Error('cola o link do vídeo'); return { tipo_fonte: 'youtube', url }; }
  const url = $('input-link').value.trim();
  if (!url) throw new Error('cola o link do site');
  return { tipo_fonte: 'link', url };
}

async function criarJornada() {
  const u = estado.upload;
  let payload;
  try { payload = payloadDaFonte(); } catch (err) { return avisar(err.message); }

  let materiaId = u.materiaAlvo;
  let criadaAgora = false;
  const nome = $('input-materia').value.trim();
  const dataProva = $('input-data-prova').value || null;
  if (!materiaId) {
    if (!nome) return avisar('escreve o nome da matéria primeiro');
    if (dataProva && dataProva < hojeISO()) return avisar('a data da prova precisa ser hoje ou depois');
    if (!u.grupoId) {
      const { data: repetida } = await sb.from('be_materias').select('id, nome')
        .eq('usuario_id', estado.usuarioId).eq('status', 'ativa').ilike('nome', nome).maybeSingle();
      if (repetida) {
        if (!(await confirmar(`Você já tem a matéria "${repetida.nome}". Quer adicionar esse material nela?`, { sim: 'Usar essa', nao: 'Escolher outro nome' }))) return;
        materiaId = repetida.id;
      }
    }
  }

  const pronto = ocupado($('btn-criar-jornada'), 'Gerando...');
  Fx.gerandoInicio(u.fonte === 'foto' && u.foto ? $('foto-preview').src : null);
  try {
    if (!materiaId) {
      const linha = u.grupoId ? { grupo_id: u.grupoId, nome, data_prova: dataProva } : { usuario_id: estado.usuarioId, nome, data_prova: dataProva };
      const { data: m, error } = await sb.from('be_materias').insert(linha).select('id').single();
      if (error) throw error;
      materiaId = m.id;
      criadaAgora = true;
    }
    const r = await chamarFuncao('estude-gerar-conteudo', { materia_id: materiaId, ...payload });
    estado.materiaId = materiaId;
    estado.detalhe = null;
    atualizarEnergia(r.energia_restante);
    $('pronto-titulo').textContent = r.titulo || 'Pronto!';
    $('pronto-sub').textContent = `${r.topicos || 0} tópicos organizados, +20 XP`;
    await Fx.gerandoFim(true);
    go('pronto');
    Fx.contar($('pronto-cards'), r.cards_novos ?? 0, { atraso: 250 });
    Fx.contar($('pronto-quiz'), (r.quiz || []).length + (r.prova || []).length, { atraso: 350 });
    if (r.plano_tarefas) Fx.contar($('pronto-plano'), r.plano_tarefas, { atraso: 450 }); else $('pronto-plano').textContent = '—';
    setTimeout(() => Fx.confete({ y: innerHeight * 0.28, n: 110 }), 300);
    toastXp(20, 'pelo material novo');
  } catch (err) {
    await Fx.gerandoFim(false);
    if (criadaAgora && materiaId) await sb.from('be_materias').delete().eq('id', materiaId);
    falhou(err, 'Não consegui gerar o conteúdo');
  } finally { pronto(); }
}

function comecarQuizPronto() { iniciarQuizMateria(estado.materiaId, 'quiz'); }

/* ===================== QUIZ ===================== */
async function iniciarQuizMateria(materiaId, tipo = 'quiz', topicoId = null) {
  let d = estado.detalhe;
  if (!d || d.materia.id !== materiaId) {
    try { d = await rpc('be_materia_detalhe', { p_materia: materiaId }); estado.detalhe = d; } catch (err) { return falhou(err); }
  }
  estado.materiaId = materiaId;
  let perguntas = (d[tipo] || []).slice();
  let topicoNome = null;
  if (topicoId) {
    const doTopico = perguntas.filter((p) => p.topico_id === topicoId);
    if (doTopico.length >= 2) { perguntas = doTopico; topicoNome = (d.topicos.find((t) => t.id === topicoId) || {}).nome; }
  }
  if (!perguntas.length) {
    avisar('Essa matéria ainda não tem perguntas. Adicione um material primeiro.');
    return abrirMateria(materiaId, 'plano');
  }
  estado.quiz = { tipo, perguntas, i: 0, xp: 0, acertos: 0, erros: [], titulo: d.materia.nome + (tipo === 'prova' ? ' · prova' : topicoNome ? ' · ' + topicoNome : ''), topicoId, inicio: 0 };
  $('quiz-titulo').textContent = estado.quiz.titulo;
  go('quiz');
  renderPergunta();
}

function renderPergunta() {
  const q = estado.quiz;
  const p = q.perguntas[q.i];
  $('quiz-progress-label').textContent = `pergunta ${q.i + 1} de ${q.perguntas.length}`;
  $('quiz-points').textContent = `+${q.xp} XP`;
  $('quiz-bar-fill').style.width = Math.round((q.i / q.perguntas.length) * 100) + '%';
  $('quiz-topico').textContent = p.topico ? p.topico : 'gerado a partir do seu material';
  $('quiz-pergunta-texto').textContent = p.pergunta;
  $('quiz-opcoes').innerHTML = Object.entries(p.opcoes).map(([l, t]) =>
    `<div class="option" data-l="${esc(l)}" onclick="responder('${esc(l)}')"><div class="letter">${esc(l)}</div> <span>${esc(t)}</span></div>`).join('');
  $('quiz-feedback').hidden = true;
  const b = $('quiz-next-btn');
  b.disabled = true; b.textContent = 'Responda pra continuar';
  const card = document.querySelector('#screen-quiz .question-card');
  if (q.i > 0 && card && !Fx.reduz()) { card.classList.remove('entra-q'); void card.offsetWidth; card.classList.add('entra-q'); }
  q.inicio = Date.now();
  q.respondida = false;
}

async function responder(letra) {
  const q = estado.quiz;
  if (q.respondida) return;
  q.respondida = true;
  const p = q.perguntas[q.i];
  document.querySelectorAll('#quiz-opcoes .option').forEach((o) => { o.style.pointerEvents = 'none'; });
  try {
    const r = await rpc('be_responder_pergunta', { p_pergunta: p.id, p_resposta: letra, p_tempo_ms: Date.now() - q.inicio });
    let certaEl = null, minhaEl = null;
    document.querySelectorAll('#quiz-opcoes .option').forEach((o) => {
      if (o.dataset.l === r.correta) { o.classList.add('correct'); certaEl = o; }
      else if (o.dataset.l === letra) { o.classList.add('wrong'); minhaEl = o; }
    });
    if (minhaEl) { Fx.riscar(minhaEl); setTimeout(() => Fx.circular(certaEl), 380); } else Fx.circular(certaEl);
    if (r.xp) Fx.xp(r.acertou ? certaEl : minhaEl, r.xp);
    q.xp += r.xp;
    if (r.acertou) q.acertos++; else q.erros.push({ pergunta: p.pergunta, correta: `${r.correta}) ${p.opcoes[r.correta]}`, explicacao: r.explicacao });
    $('quiz-feedback-icon').textContent = r.acertou ? '✔' : '✎';
    $('quiz-feedback-texto').textContent = (r.acertou ? 'Isso! ' : `Quase. A certa é a ${r.correta}. `) + (r.explicacao || '');
    $('quiz-feedback').classList.toggle('ok', !!r.acertou);
    $('quiz-feedback').hidden = false;
    $('quiz-points').textContent = `+${q.xp} XP`;
  } catch (err) {
    q.respondida = false;
    document.querySelectorAll('#quiz-opcoes .option').forEach((o) => { o.style.pointerEvents = ''; });
    return falhou(err, 'Não consegui registrar a resposta');
  }
  const b = $('quiz-next-btn');
  b.disabled = false;
  b.textContent = q.i === q.perguntas.length - 1 ? 'Ver resultado' : 'Próxima pergunta';
}

function proximaPergunta() {
  const q = estado.quiz;
  q.i++;
  if (q.i >= q.perguntas.length) return fimQuiz();
  renderPergunta();
}

async function fimQuiz() {
  const q = estado.quiz;
  const total = q.perguntas.length;
  const pct = Math.round((q.acertos / total) * 100);
  $('quizfim-emoji').textContent = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
  $('quizfim-titulo').textContent = pct >= 80 ? 'Mandou muito!' : pct >= 50 ? 'Bom trabalho!' : 'Bora revisar e tentar de novo';
  $('quizfim-sub').textContent = q.titulo;
  Fx.contar($('quizfim-acertos'), q.acertos, { fmt: (v) => `${v}/${total}`, atraso: 200 });
  Fx.contar($('quizfim-pct'), pct, { fmt: (v) => v + '%', atraso: 300 });
  Fx.contar($('quizfim-xp'), q.xp, { atraso: 400 });
  if (pct >= 80) setTimeout(() => Fx.confete({ y: innerHeight * 0.25, n: 120 }), 350);
  $('quizfim-erros-wrap').hidden = !q.erros.length;
  $('quizfim-erros').innerHTML = q.erros.map((e) => `<div class="ranking-row" style="display:block;">
    <div style="font-weight:600; font-size:13px;">${esc(e.pergunta)}</div>
    <div class="small" style="color:var(--verde-forte); margin-top:3px; font-weight:650;">✓ ${esc(e.correta)}</div>
    ${e.explicacao ? `<div class="small muted" style="margin-top:2px;">${esc(e.explicacao)}</div>` : ''}</div>`).join('');
  go('quiz-fim');
  const t = estado.tarefaAtual;
  if (t && t.materia_id === estado.materiaId && (t.tipo === q.tipo)) await concluirTarefaAtual();
}

function refazerQuiz() {
  const q = estado.quiz;
  iniciarQuizMateria(estado.materiaId, q.tipo, q.topicoId);
}

async function sairDoQuiz() {
  if (estado.quiz && estado.quiz.i > 0 && !(await confirmar('Sair do quiz?\nAs respostas que você já deu ficam salvas.', { sim: 'Sair' }))) return;
  abrirMateria(estado.materiaId, abaAtual);
}

/* ===================== FLASHCARDS ===================== */
async function abrirRevisaoCards(materiaId = null) {
  let fila;
  try { fila = await rpc('be_cards_para_revisar', { p_materia: materiaId, p_limite: 40 }); } catch (err) { return falhou(err); }
  if (!fila || !fila.length) {
    const t = estado.tarefaAtual;
    if (t && t.tipo === 'cards') { await concluirTarefaAtual(); toast('Nenhum card vencido hoje — tarefa concluída ✓'); recarregarTelaAtual(); return; }
    return toast('Nada pra revisar agora, os cards voltam no dia certo');
  }
  estado.cards = { materiaId, fila, i: 0, feitos: 0, lembrou: 0, xp: 0, repetidos: new Set() };
  $('cards-titulo').textContent = materiaId && estado.detalhe && estado.detalhe.materia.id === materiaId ? 'Flashcards · ' + estado.detalhe.materia.nome : 'Revisão de flashcards';
  go('cards');
  mostrarCard();
}

function mostrarCard() {
  const c = estado.cards;
  const card = c.fila[c.i];
  const f = $('flash');
  f.style.transition = 'none';
  f.classList.remove('flipped');
  void f.offsetWidth;
  f.style.transition = '';
  Fx.fichaEntra(f);
  $('cards-notas').hidden = true;
  $('cards-virar').hidden = false;
  if (window.prepararVozCard) prepararVozCard();
  $('flash-topico').textContent = [card.materia_nome, card.topico].filter(Boolean).join(' · ') + (card.novo ? ' · novo' : '');
  $('flash-frente').textContent = card.frente;
  $('flash-verso').textContent = card.verso;
  $('cards-progresso').textContent = `card ${c.i + 1} de ${c.fila.length}`;
  $('cards-bar').style.width = Math.round((c.i / c.fila.length) * 100) + '%';
  $('cards-xp').textContent = `+${c.xp} XP`;
  c.ocupado = false;
}

function virarCard() {
  const f = $('flash');
  f.classList.toggle('flipped');
  if (f.classList.contains('flipped')) { $('cards-notas').hidden = false; $('cards-virar').hidden = true; $('cards-voz').hidden = true; }
}

async function avaliarCard(nota) {
  const c = estado.cards;
  if (c.ocupado) return;
  c.ocupado = true;
  const card = c.fila[c.i];
  try {
    const r = await rpc('be_revisar_card', { p_card: card.card_id, p_nota: nota });
    c.xp += r.xp;
    Fx.xp(document.querySelector('.grade.g' + nota), r.xp);
  } catch (err) { c.ocupado = false; return falhou(err, 'Não consegui salvar a revisão'); }
  $('cards-notas').hidden = true;
  await Fx.fichaSai($('flash'), nota);
  c.feitos++;
  if (nota >= 2) c.lembrou++;
  if (nota === 1 && !c.repetidos.has(card.card_id)) { c.repetidos.add(card.card_id); c.fila.push(card); }
  c.i++;
  if (c.i >= c.fila.length) return fimCards();
  mostrarCard();
}

async function fimCards() {
  const c = estado.cards;
  $('cardsfim-sub').textContent = 'os cards que você lembrou fácil só voltam daqui a alguns dias';
  go('cards-fim');
  Fx.contar($('cardsfim-n'), c.feitos, { atraso: 200 });
  Fx.contar($('cardsfim-lembrou'), Math.round((c.lembrou / Math.max(1, c.feitos)) * 100), { fmt: (v) => v + '%', atraso: 300 });
  Fx.contar($('cardsfim-xp'), c.xp, { atraso: 400 });
  if (c.feitos >= 5) setTimeout(() => Fx.confete({ y: innerHeight * 0.25, n: 90 }), 350);
  const t = estado.tarefaAtual;
  if (t && t.tipo === 'cards') await concluirTarefaAtual();
}

async function sairDosCards() {
  if (estado.cards && estado.cards.feitos && !(await confirmar('Parar a revisão?\nO que você já revisou fica salvo.', { sim: 'Parar' }))) return;
  verHoje();
}

/* ===================== ENEM ===================== */
function verEnem() {
  pararTimer();
  go('enem');
  carregarHistoricoEnem();
}

function escolherArea(area) {
  estado.enem.area = area;
  document.querySelectorAll('#enem-areas .area-btn').forEach((b) => b.classList.toggle('on', b.dataset.area === area));
}
function escolherQtd(n) {
  estado.enem.qtd = n;
  document.querySelectorAll('#enem-qtd .chip').forEach((c) => c.classList.toggle('sel', Number(c.dataset.v) === n));
}
function escolherIdioma(i) {
  estado.enem.idioma = i;
  document.querySelectorAll('#enem-idioma .chip').forEach((c) => c.classList.toggle('sel', c.dataset.v === i));
}

async function carregarHistoricoEnem() {
  const [{ data: sims }, { data: reds }] = await Promise.all([
    sb.from('be_simulados').select('id, area, acertos, total, finalizado_em').not('finalizado_em', 'is', null).order('finalizado_em', { ascending: false }).limit(6),
    sb.from('be_redacoes').select('id, tema, total, created_at').order('created_at', { ascending: false }).limit(6),
  ]);
  $('enem-historico').innerHTML = (sims && sims.length) ? sims.map((s) => `
    <div class="hist-row" style="cursor:default;"><span>${s.area ? AREAS[s.area] : 'Misto'} · ${new Date(s.finalizado_em).toLocaleDateString('pt-BR')}</span>
    <span class="n">${s.acertos}/${s.total}</span></div>`).join('') : '<div class="empty">nenhum simulado ainda</div>';
  $('redacao-historico').innerHTML = (reds && reds.length) ? reds.map((r) => `
    <div class="hist-row" onclick="abrirRedacao('${r.id}')"><span>${esc(r.tema.length > 60 ? r.tema.slice(0, 58) + '…' : r.tema)}</span>
    <span class="n">${r.total ?? '—'}</span></div>`).join('') : '<div class="empty">nenhuma redação corrigida ainda</div>';
}

let timerSim = null;
function pararTimer() { if (timerSim) { clearInterval(timerSim); timerSim = null; } }

async function iniciarSimulado() {
  const e = estado.enem;
  const pronto = ocupado($('btn-iniciar-simulado'), 'Separando as questões...');
  try {
    const r = await rpc('be_iniciar_simulado', { p_area: e.area || null, p_qtd: e.qtd, p_idioma: e.idioma });
    estado.sim = { id: r.simulado_id, questoes: r.questoes, respostas: {}, i: 0, inicio: Date.now(), revisao: false, gabarito: null };
    $('sim-titulo').textContent = 'Simulado · ' + (e.area ? AREAS[e.area] : 'Misto');
    $('btn-entregar').hidden = false;
    go('simulado');
    renderQuestao();
    pararTimer();
    timerSim = setInterval(atualizarTimer, 1000);
    atualizarTimer();
  } catch (err) { falhou(err, 'Não consegui começar o simulado'); } finally { pronto(); }
}

function atualizarTimer() {
  if (!estado.sim) return;
  const s = Math.floor((Date.now() - estado.sim.inicio) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  $('sim-timer').textContent = `${mm}:${ss}`;
}

const RAW_ENEM = 'https://raw.githubusercontent.com/yunger7/enem-api/main/public/';
function imgEnem(url) {
  const safe = esc(url);
  const reserva = esc(String(url).replace('https://enem.dev/', RAW_ENEM));
  return `<img loading="lazy" src="${safe}" alt="" onerror="if(this.dataset.r!=='1'){this.dataset.r='1';this.src='${reserva}';}">`;
}

function md(texto) {
  if (!texto) return '';
  const linhas = String(texto).replace(/\r/g, '').split('\n');
  const blocos = [];
  let buf = [];
  let tabela = [];
  const fechaPar = () => { if (buf.length) { blocos.push('<p>' + buf.join('<br>') + '</p>'); buf = []; } };
  const fechaTab = () => {
    if (!tabela.length) return;
    const linhasT = tabela.filter((l) => l.replace(/[|:\-\s]/g, '') !== '');
    blocos.push('<table>' + linhasT.map((l) => '<tr>' + l.replace(/^\||\|$/g, '').split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('') + '</tr>').join('') + '</table>');
    tabela = [];
  };
  const inline = (s) => {
    let out = esc(s);
    out = out.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, (_, u) => imgEnem(u.replace(/&amp;/g, '&')));
    out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    return out;
  };
  for (const l of linhas) {
    if (/^\s*\|.*\|\s*$/.test(l)) { fechaPar(); tabela.push(l.trim()); continue; }
    fechaTab();
    if (!l.trim()) { fechaPar(); continue; }
    buf.push(inline(l));
  }
  fechaPar(); fechaTab();
  return blocos.join('');
}

function renderQuestao() {
  const s = estado.sim;
  const q = s.questoes[s.i];
  $('sim-progresso').textContent = `questão ${s.i + 1} de ${s.questoes.length}`;
  $('sim-meta').textContent = `ENEM ${q.ano} · questão ${q.numero} · ${AREAS[q.area]}`;
  $('sim-contexto').innerHTML = md(q.contexto);
  $('sim-intro').innerHTML = md(q.introducao);
  const minha = s.respostas[q.id];
  const certa = s.revisao && s.gabarito ? s.gabarito[q.id] : null;
  $('sim-opcoes').innerHTML = (q.alternativas || []).map((a) => {
    let cls = 'option';
    if (s.revisao) {
      if (a.letter === certa) cls += ' correct';
      else if (a.letter === minha) cls += ' wrong';
    } else if (a.letter === minha) cls += ' sel' + (s.recem === a.letter ? ' recem' : '');
    const conteudo = (a.text ? `<span>${md(a.text).replace(/^<p>|<\/p>$/g, '')}</span>` : '') + (a.file ? imgEnem(a.file).replace('<img ', '<img class="alt-img" ') : '');
    return `<div class="${cls}" ${s.revisao ? '' : `onclick="marcarAlternativa('${a.letter}')"`}><div class="letter">${a.letter}</div><div style="flex:1;">${conteudo}</div></div>`;
  }).join('');
  $('sim-proxima').textContent = s.i === s.questoes.length - 1 ? (s.revisao ? 'ver resultado' : 'revisar') : 'próxima';
  s.recem = null;
  renderGridSim($('sim-grid'));
  $('screen-simulado').scrollTop = 0;
}

function renderGridSim(alvo, ehResultado = false) {
  const s = estado.sim;
  alvo.innerHTML = s.questoes.map((q, idx) => {
    let cls = 'qdot';
    if (s.revisao && s.gabarito) cls += s.respostas[q.id] === s.gabarito[q.id] ? ' ok' : ' err';
    else if (s.respostas[q.id]) cls += ' ans';
    if (!ehResultado && idx === s.i) cls += ' cur';
    return `<button class="${cls}" onclick="irParaQuestao(${idx})">${idx + 1}</button>`;
  }).join('');
}

function marcarAlternativa(letra) {
  const s = estado.sim;
  s.respostas[s.questoes[s.i].id] = letra;
  s.recem = letra;
  const y = $('screen-simulado').scrollTop;
  renderQuestao();
  $('screen-simulado').scrollTop = y;
}

function navSimulado(delta) {
  const s = estado.sim;
  const n = s.i + delta;
  if (n < 0) return;
  if (n >= s.questoes.length) { if (s.revisao) go('simulado-fim'); return; }
  s.i = n;
  renderQuestao();
}

function irParaQuestao(i) {
  estado.sim.i = i;
  if (!$('screen-simulado').classList.contains('active')) go('simulado');
  renderQuestao();
}

async function entregarSimulado() {
  const s = estado.sim;
  const vazias = s.questoes.filter((q) => !s.respostas[q.id]).length;
  if (vazias && !(await confirmar(`Faltam ${vazias} ${vazias === 1 ? 'questão' : 'questões'} sem resposta. Entregar assim mesmo?`, { sim: 'Entregar', nao: 'Voltar' }))) return;
  const pronto = ocupado($('btn-entregar'), 'Corrigindo...');
  try {
    const dur = Math.floor((Date.now() - s.inicio) / 1000);
    $('simfim-score').textContent = '';
    const r = await rpc('be_finalizar_simulado', { p_simulado: s.id, p_respostas: s.respostas, p_duracao_seg: dur });
    pararTimer();
    s.revisao = true;
    s.gabarito = r.gabarito;
    $('btn-entregar').hidden = true;
    const placar = $('simfim-score');
    const min = Math.round(dur / 60);
    const tempo = min < 1 ? 'menos de 1 min' : `${min} min`;
    $('simfim-sub').textContent = `${Math.round((r.acertos / r.total) * 100)}% de acerto em ${tempo}, +${r.xp} XP`;
    $('simfim-areas').innerHTML = Object.entries(r.por_area || {}).map(([a, v]) => {
      const pct = Math.round((v.acertos / v.total) * 100);
      const cls = pct < 40 ? 'lo' : pct < 70 ? 'mid' : 'hi';
      return `<div class="mastery"><div class="mastery-top"><span class="nm">${AREAS[a] || esc(a)}</span><span class="pc">${v.acertos}/${v.total}</span></div>
        <div class="mastery-track"><div class="mastery-fill ${cls}" style="width:${Math.max(pct, 3)}%"></div></div></div>`;
    }).join('');
    renderGridSim($('simfim-grid'), true);
    toastXp(r.xp);
    go('simulado-fim');
    Fx.contar(placar, r.acertos, { fmt: (v) => `${v}/${r.total}`, dur: 900, atraso: 200 });
    setTimeout(() => Fx.circular(placar), 1150);
    if (r.total && r.acertos / r.total >= 0.6) setTimeout(() => Fx.confete({ y: innerHeight * 0.25, n: 120 }), 1200);
  } catch (err) { falhou(err, 'Não consegui entregar'); } finally { pronto(); }
}

async function sairDoSimulado() {
  const s = estado.sim;
  if (s && s.revisao) return go('simulado-fim');
  if (s && !(await confirmar('Sair do simulado?\nEle fica incompleto e não conta pontos.', { sim: 'Sair' }))) return;
  verEnem();
}

/* ===================== REDAÇÃO ===================== */
function novaRedacao() {
  const sel = $('redacao-tema');
  if (!sel.options.length) {
    sel.innerHTML = TEMAS_REDACAO.map((t) => `<option>${esc(t)}</option>`).join('') + '<option value="__outro">Outro tema…</option>';
  }
  $('redacao-form').hidden = false;
  $('redacao-resultado').hidden = true;
  temaMudou();
  contarLinhas();
  go('redacao');
}

function temaMudou() { $('redacao-tema-outro-wrap').hidden = $('redacao-tema').value !== '__outro'; }

function contarLinhas() {
  const t = $('redacao-texto').value;
  const linhas = t.split('\n').filter((l) => l.trim()).reduce((s, l) => s + Math.max(1, Math.ceil(l.length / 75)), 0);
  $('redacao-linhas').textContent = `· ≈ ${linhas} linha${linhas === 1 ? '' : 's'} de folha do ENEM`;
}

async function corrigirRedacao() {
  const tema = $('redacao-tema').value === '__outro' ? $('redacao-tema-outro').value.trim() : $('redacao-tema').value;
  const texto = $('redacao-texto').value.trim();
  if (!tema) return avisar('escreve o tema');
  if (texto.length < 400) return avisar('a redação está curta demais pra corrigir (escreve pelo menos umas 8 linhas)');
  const pronto = ocupado($('btn-corrigir'), 'Corrigindo como a banca... uns 20 segundos');
  try {
    const r = await chamarFuncao('estude-corrigir-redacao', { tema, texto });
    atualizarEnergia(r.energia_restante);
    mostrarCorrecao({ tema, total: r.total, notas: r.notas, feedback: r });
    toastXp(r.xp || 30, 'pela redação');
  } catch (err) { falhou(err, 'Não consegui corrigir'); } finally { pronto(); }
}

async function abrirRedacao(id) {
  const { data, error } = await sb.from('be_redacoes').select('tema, total, notas, feedback').eq('id', id).single();
  if (error) return falhou(error);
  go('redacao');
  mostrarCorrecao(data, 'historico');
}

function mostrarCorrecao(r, origem = 'nova') {
  const nomes = {
    c1: 'C1 · norma culta', c2: 'C2 · tema e repertório', c3: 'C3 · argumentação', c4: 'C4 · coesão', c5: 'C5 · proposta de intervenção',
  };
  const f = r.feedback || {};
  const coment = f.comentarios || {};
  $('redacao-form').hidden = true;
  const res = $('redacao-resultado');
  res.hidden = false;
  res.innerHTML = `
    <div class="card center"><div class="hand muted small" style="margin-bottom:6px;">${esc(r.tema)}</div>
      <div class="nota-hero"><div class="score-big" id="redacao-nota">${r.total}</div></div>
      <div class="hand muted">de 1000</div></div>
    <div class="card">${Object.keys(nomes).map((c) => {
      const n = (r.notas || {})[c] ?? 0;
      const pct = Math.round((n / 200) * 100);
      const cls = pct < 50 ? 'lo' : pct < 80 ? 'mid' : 'hi';
      return `<div class="comp"><div class="mastery-top"><span class="nm">${nomes[c]}</span><span class="pc">${n}/200</span></div>
        <div class="mastery-track"><div class="mastery-fill ${cls}" style="width:${Math.max(pct, 3)}%"></div></div>
        ${coment[c] ? `<p>${esc(coment[c])}</p>` : ''}</div>`;
    }).join('')}</div>
    ${(f.pontos_fortes || []).length ? `<div class="card"><h3>Pontos fortes</h3><ul class="bullets">${f.pontos_fortes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${(f.melhorias || []).length ? `<div class="card"><h3>Pra subir a nota</h3><ul class="bullets">${f.melhorias.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${f.paragrafo_reescrito ? `<div class="card"><h3>Um parágrafo reescrito</h3><div class="rewrite">${esc(f.paragrafo_reescrito)}</div></div>` : ''}
    <div class="stack-gap"><button class="btn coral full" onclick="novaRedacao()">Escrever outra</button><button class="btn ghost full" onclick="verEnem()">Voltar pro ENEM</button></div>`;
  $('screen-redacao').scrollTop = 0;
  const nota = $('redacao-nota');
  Fx.contar(nota, Number(r.total) || 0, { dur: 1000, atraso: 150 });
  setTimeout(() => Fx.circular(nota), 1200);
  if (r.total >= 800 && origem !== 'historico') setTimeout(() => Fx.confete({ y: innerHeight * 0.22, n: 130 }), 1250);
}

/* ===================== LIGA ===================== */
async function verLiga() {
  go('liga');
  const alvo = $('liga-conteudo');
  alvo.innerHTML = '<div class="loading">carregando...</div>';
  let r;
  try { r = await rpc('be_minha_liga'); } catch (err) { alvo.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  const div = DIVISOES[r.divisao] || DIVISOES.bronze;
  const membros = r.membros || [];
  const n = membros.length;
  const dias = diasEntre(hojeISO(), r.termina_em);
  const zonaQueda = r.caem > 0 && n >= 10 ? n - r.caem : Infinity;
  let html = `<div class="league-head"><span class="medal-big">${div[0]}</span><h1>Liga ${div[1]}</h1>
    <span class="hand muted">fecha ${dias <= 1 ? 'hoje à meia-noite' : `em ${dias} dias`}, ${n} participante${n === 1 ? '' : 's'}</span></div>`;
  const top = membros.slice(0, 3);
  if (top.length) {
    const ordem = [top[1], top[0], top[2]].filter(Boolean);
    html += `<div class="podio" aria-label="quadro de honra">${ordem.map((m) => `
      <div class="degrau p${m.posicao} ${m.eu ? 'eu' : ''}">
        <div class="av">${esc(m.iniciais)}</div><div class="nm">${esc(m.nome)}${m.eu ? ' (você)' : ''}</div><div class="xp">${m.xp} XP</div>
        <div class="bloco">${m.posicao}</div></div>`).join('')}</div>`;
  }
  let zonaMostrada = { up: false, mid: false, down: false };
  membros.forEach((m) => {
    const sobe = r.sobem > 0 && m.posicao <= r.sobem && m.xp > 0;
    const cai = m.posicao > zonaQueda;
    if (sobe && !zonaMostrada.up) { html += '<div class="zone up">⬆ zona de promoção</div>'; zonaMostrada.up = true; }
    if (!sobe && !cai && !zonaMostrada.mid && zonaMostrada.up) { html += '<div class="zone" style="color:var(--ink-soft);">permanece</div>'; zonaMostrada.mid = true; }
    if (cai && !zonaMostrada.down) { html += '<div class="zone down">⬇ zona de rebaixamento</div>'; zonaMostrada.down = true; }
    html += `<div class="league-row ${m.eu ? 'me' : ''} ${sobe ? 'up' : ''} ${cai ? 'down' : ''}">
      <span class="pos">${m.posicao}</span><span class="avatar">${esc(m.iniciais)}</span>
      <span class="nm">${esc(m.nome)}${m.eu ? ' (você)' : ''}</span><span class="xp">${m.xp} XP</span></div>`;
  });
  if (n < 5) html += '<p class="hand muted center small" style="margin-top:12px;">a liga enche conforme mais gente estuda essa semana — chama seus amigos pelo código de grupo!</p>';
  alvo.innerHTML = html;
}

/* ===================== GRUPOS ===================== */
function gerarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const rnd = crypto.getRandomValues(new Uint32Array(6));
  for (let i = 0; i < 6; i++) out += chars[rnd[i] % chars.length];
  return out;
}

async function verGrupos() {
  go('grupos');
  const lista = $('lista-grupos');
  let grupos;
  try { grupos = await rpc('be_meus_grupos'); } catch (err) { lista.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  estado.grupos = grupos;
  if (!grupos.length) { lista.innerHTML = '<div class="empty">você ainda não participa de nenhum grupo</div>'; return; }
  lista.innerHTML = grupos.map((g) => `
    <div class="group-card">
      <div class="group-card-top"><div>
        <h3>${esc(g.nome)}</h3>
        <span class="hand">${esc(g.materia || 'sem matéria definida')}, ${g.tipo === 'turma_professor' ? 'turma' : 'grupo de amigos'}, ${g.membros} membro${g.membros === 1 ? '' : 's'}</span><br>
        ${g.papel === 'admin' ? '<span class="teacher-tag">você é o admin</span>' : ''}
      </div></div>
      <div class="code-chip">${esc(g.codigo)} <span class="copy" onclick="copiarCodigo('${esc(g.codigo)}')">copiar código</span></div>
      ${g.pode_editar ? `<button class="ghost-btn" style="margin-top:10px;" onclick="novaMateriaDoGrupo('${g.id}')"><svg class="ico"><use href="#i-mais"/></svg>${g.tipo === 'turma_professor' ? 'matéria nova pra turma' : 'matéria nova pro grupo'}</button>` : ''}
      ${g.papel === 'admin' ? `<span class="panel-link" role="button" tabindex="0" onclick="abrirPainel('${g.id}')">${g.tipo === 'turma_professor' ? 'abrir painel da turma' : 'abrir painel do grupo'}</span>` : ''}
      ${!g.pode_editar ? '<p class="small muted" style="margin-top:8px;">o professor coloca o material e você ganha seu plano</p>' : ''}
    </div>`).join('');
}

function novaMateriaDoGrupo(id) {
  const g = (estado.grupos || []).find((x) => x.id === id);
  if (g) novaMateria({ grupoId: g.id, grupoNome: g.nome });
}

function copiarCodigo(c) {
  (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => toast('Código copiado: ' + c), () => avisar('Código: ' + c));
}

async function criarGrupoReal() {
  const nome = $('input-nome-grupo').value.trim();
  const materia = $('input-materia-grupo').value.trim();
  if (!nome) return avisar('dá um nome pro grupo');
  const pronto = ocupado($('btn-criar-grupo'), 'Criando...');
  try {
    const tipo = estado.papel === 'professor' ? 'turma_professor' : 'grupo_amigos';
    const codigo = gerarCodigo();
    const { data: g, error } = await sb.from('be_grupos').insert({ nome, materia, tipo, dono_id: estado.usuarioId, codigo }).select('id').single();
    if (error) throw error;
    const { error: e2 } = await sb.from('be_grupo_membros').insert({ grupo_id: g.id, usuario_id: estado.usuarioId, papel_no_grupo: 'admin' });
    if (e2) throw e2;
    $('input-nome-grupo').value = ''; $('input-materia-grupo').value = '';
    $('form-criar').classList.remove('on');
    avisar(`Grupo criado! Código: ${codigo}`);
    verGrupos();
  } catch (err) { falhou(err, 'Não consegui criar o grupo'); } finally { pronto(); }
}

async function entrarNoGrupoPorCodigo(codigo) {
  const { data: g, error } = await sb.from('be_grupos').select('id, nome').eq('codigo', codigo).maybeSingle();
  if (error) throw error;
  if (!g) { avisar('Código não encontrado. Confere com quem te passou.'); return null; }
  const { error: e2 } = await sb.from('be_grupo_membros').insert({ grupo_id: g.id, usuario_id: estado.usuarioId });
  if (e2 && e2.code !== '23505') throw e2;
  return g.nome;
}

async function entrarComCodigoNoGrupo() {
  const codigo = $('input-codigo-grupo').value.trim().toUpperCase();
  if (!codigo) return avisar('digita o código');
  const pronto = ocupado($('btn-entrar-grupo'), 'Entrando...');
  try {
    const nome = await entrarNoGrupoPorCodigo(codigo);
    if (!nome) return;
    $('input-codigo-grupo').value = '';
    $('form-entrar').classList.remove('on');
    toast('Você entrou em ' + nome);
    verGrupos();
  } catch (err) { falhou(err, 'Não consegui entrar'); } finally { pronto(); }
}

async function abrirPainel(grupoId) {
  go('painel');
  estado.grupoId = grupoId;
  $('painel-nome').textContent = 'carregando...';
  let r;
  try { r = await rpc('be_painel_turma', { p_grupo: grupoId }); } catch (err) { return falhou(err); }
  estado.grupoNome = r.grupo.nome;
  $('painel-nome').textContent = r.grupo.nome;
  const alunos = r.membros.filter((m) => m.papel === 'membro');
  $('painel-meta').textContent = `${alunos.length} aluno${alunos.length === 1 ? '' : 's'} · código ${r.grupo.codigo}`;

  const sumidos = alunos.filter((m) => m.dias_sem_estudar === null || m.dias_sem_estudar >= 3).length;
  $('painel-alerta').innerHTML = sumidos ? `<div class="alert-banner"><span style="font-size:20px;">⚠</span><span class="hand">${sumidos} aluno${sumidos === 1 ? '' : 's'} sem estudar há 3 dias ou mais.</span></div>` : '';

  $('painel-materias').innerHTML = r.materias.length ? r.materias.map((m) => `
    <div class="hist-row" onclick="abrirMateria('${m.id}')"><span>${m.status === 'arquivada' ? '📦 ' : ''}${esc(m.nome)}</span>
    <span class="muted small">${m.data_prova ? 'prova ' + fmtData(m.data_prova) : 'sem data'} · ${m.materiais} material${m.materiais === 1 ? '' : 'is'}</span></div>`).join('')
    : '<div class="empty">nenhuma matéria da turma ainda — toque em "+ nova"</div>';

  const tops = r.topicos.slice().sort((a, b) => (a.media ?? 2) - (b.media ?? 2));
  $('painel-topicos').innerHTML = tops.length ? tops.map((t) => {
    const pct = t.media === null ? null : Math.round(t.media * 100);
    const cls = pct === null ? '' : pct < 40 ? 'lo' : pct < 70 ? 'mid' : 'hi';
    return `<div class="mastery"><div class="mastery-top"><span class="nm">${esc(t.nome)} <span class="muted" style="font-weight:400;">· ${esc(t.materia)}</span></span>
      <span class="pc">${pct === null ? 'sem respostas' : `${pct}% · ${t.alunos} aluno${t.alunos === 1 ? '' : 's'}`}</span></div>
      <div class="mastery-track"><div class="mastery-fill ${cls}" style="width:${pct === null ? 0 : Math.max(pct, 3)}%"></div></div></div>`;
  }).join('') : '<div class="empty">os tópicos aparecem quando a turma tiver material</div>';

  $('painel-membros').innerHTML = alunos.length ? alunos.map((m) => {
    const d = m.dias_sem_estudar;
    const dot = d === null ? 'red' : d === 0 ? 'green' : d <= 2 ? 'yellow' : 'red';
    const st = d === null ? 'nunca estudou' : d === 0 ? 'estudou hoje' : `há ${d} dia${d === 1 ? '' : 's'}`;
    return `<div class="engage-row"><div class="status-dot ${dot}"></div>
      <div class="avatar">${esc(m.nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase())}</div>
      <div class="engage-info"><div class="engage-name">${esc(m.nome)}</div>
      <div class="engage-status">${st} · ${m.tarefas_7d} tarefas · ${m.xp_7d} XP${m.dominio !== null ? ` · domínio ${Math.round(m.dominio * 100)}%` : ''}</div></div>
      <div class="engage-streak">${m.streak}🔥</div></div>`;
  }).join('') : '<div class="empty">ninguém entrou ainda — passa o código pra turma</div>';
}

/* ===================== PERFIL ===================== */
let avatarNovo = null;
const DIAS_SEMANA = [[1, 'seg'], [2, 'ter'], [3, 'qua'], [4, 'qui'], [5, 'sex'], [6, 'sáb'], [7, 'dom']];

function pintarAvatar(el, u) {
  if (u.avatar_base64) {
    el.style.backgroundImage = `url(${u.avatar_base64})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = 'none';
    el.textContent = (u.nome || '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
}

async function verPerfil() {
  go('perfil');
  const { data: u, error } = await sb.from('be_usuarios').select('*').eq('id', estado.usuarioId).single();
  if (error || !u) return;
  $('perfil-nome').textContent = u.nome;
  $('perfil-meta').textContent = `nível ${u.nivel} · ${u.papel === 'professor' ? 'professor(a)' : (u.serie || 'aluno(a)')}${u.escola ? ' · ' + u.escola : ''}`;
  pintarAvatar($('perfil-avatar'), u);
  pintarAvatar($('perfil-avatar-preview'), u);
  $('perfil-xp').textContent = u.xp + ' XP, nível ' + u.nivel;
  verificarNivel(u.nivel);
  $('perfil-proximo-nivel').textContent = `faltam ${200 - (u.xp % 200)} pro nível ${u.nivel + 1}`;
  requestAnimationFrame(() => { $('perfil-xp-fill').style.width = Math.max(3, (u.xp % 200) / 2) + '%'; });
  const hoje = hojeISO();
  const streak = u.ultima_atividade && u.ultima_atividade >= somaDias(hoje, -1) ? u.streak_atual : 0;
  Fx.contar($('perfil-streak'), streak, { dur: 500 });
  $('perfil-maior').textContent = u.streak_maior;
  $('perfil-divisao').textContent = (DIVISOES[u.divisao] || DIVISOES.bronze)[0];
  $('input-editar-nome').value = u.nome || '';
  $('input-editar-escola').value = u.escola || '';
  $('input-editar-cidade').value = u.cidade || '';
  $('input-editar-serie').value = u.serie || '';
  estado.eu = u;
  avatarNovo = null;

  const dias = new Set(u.dias_estudo || [1, 2, 3, 4, 5, 6]);
  $('perfil-dias').innerHTML = DIAS_SEMANA.map(([n, l]) => `<div class="chip small ${dias.has(n) ? 'sel' : ''}" data-d="${n}" onclick="this.classList.toggle('sel')">${l}</div>`).join('');
  $('perfil-minutos').value = String(u.minutos_por_dia || 40);

  const [{ data: cat }, { data: minhas }] = await Promise.all([
    sb.from('be_conquistas').select('*').order('nome'),
    sb.from('be_usuario_conquistas').select('conquista_id').eq('usuario_id', estado.usuarioId),
  ]);
  const ganhas = new Set((minhas || []).map((m) => m.conquista_id));
  const chave = 'estude-figurinhas-' + estado.usuarioId;
  let vistas = null;
  try { const v = localStorage.getItem(chave); vistas = v ? new Set(JSON.parse(v)) : null; localStorage.setItem(chave, JSON.stringify([...ganhas])); } catch (_) { vistas = null; }
  const novas = vistas ? [...ganhas].filter((id) => !vistas.has(id)) : [];
  const cores = ['gold', 'mint', 'coral', 'lilac'];
  $('perfil-album-n').textContent = `${ganhas.size} de ${(cat || []).length} coladas`;
  $('perfil-badges').innerHTML = (cat || []).map((c, i) => `<div class="badge ${novas.includes(c.id) ? 'nova' : ''}" title="${esc(c.descricao)}">
    <div class="badge-icon ${ganhas.has(c.id) ? cores[i % 4] : 'locked'}">${esc(c.icone)}</div><span class="lbl">${esc(c.nome)}</span></div>`).join('');
  if (novas.length) { setTimeout(() => Fx.confete({ y: innerHeight * 0.5, n: 80 }), 400); toast(novas.length === 1 ? 'Figurinha nova no álbum!' : `${novas.length} figurinhas novas no álbum!`); }
  marcarTema();
}

async function salvarRotina() {
  const dias = Array.from(document.querySelectorAll('#perfil-dias .chip.sel')).map((c) => Number(c.dataset.d));
  if (!dias.length) return avisar('escolhe pelo menos um dia de estudo');
  const pronto = ocupado($('btn-salvar-rotina'), 'Salvando...');
  const { error } = await sb.from('be_usuarios').update({ dias_estudo: dias, minutos_por_dia: Number($('perfil-minutos').value) }).eq('id', estado.usuarioId);
  pronto();
  if (error) return falhou(error);
  toast('Rotina salva');
}

function marcarTema() {
  const atual = document.documentElement.dataset.tema || '';
  document.querySelectorAll('#perfil-tema .chip').forEach((c) => c.classList.toggle('sel', c.dataset.t === atual));
}

function escolherTema(t) {
  if (t === 'caderno') t = 'claro';
  if (t === 'lousa') t = 'escuro';
  try { if (t) localStorage.setItem('estude-tema', t); else localStorage.removeItem('estude-tema'); } catch (_) { /* só nesta sessão */ }
  if (t) document.documentElement.dataset.tema = t; else delete document.documentElement.dataset.tema;
  marcarTema();
}

function avatarSelecionado(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; };
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 240;
    const esc2 = Math.max(240 / img.width, 240 / img.height);
    const w = img.width * esc2, h = img.height * esc2;
    c.getContext('2d').drawImage(img, (240 - w) / 2, (240 - h) / 2, w, h);
    avatarNovo = c.toDataURL('image/jpeg', 0.8);
    const p = $('perfil-avatar-preview');
    p.style.backgroundImage = `url(${avatarNovo})`; p.style.backgroundSize = 'cover'; p.textContent = '';
  };
  reader.readAsDataURL(file);
}

async function salvarPerfil() {
  const nome = $('input-editar-nome').value.trim();
  if (!nome) return avisar('o nome não pode ficar vazio');
  const pronto = ocupado($('btn-salvar-perfil'), 'Salvando...');
  try {
    const dados = { nome, escola: $('input-editar-escola').value.trim(), cidade: $('input-editar-cidade').value.trim(), serie: $('input-editar-serie').value || null };
    if (avatarNovo) dados.avatar_base64 = avatarNovo;
    const { error } = await sb.from('be_usuarios').update(dados).eq('id', estado.usuarioId);
    if (error) throw error;
    $('form-editar-perfil').classList.remove('on');
    verPerfil();
  } catch (err) { falhou(err, 'Não consegui salvar'); } finally { pronto(); }
}

async function trocarSenha() {
  const atual = $('input-senha-atual').value;
  const nova = $('input-senha-nova').value;
  if (!atual) return avisar('digita sua senha atual');
  if (!nova || nova.length < 6) return avisar('a senha nova precisa ter pelo menos 6 caracteres');
  if (nova !== $('input-senha-nova-confirma').value) return avisar('a senha nova e a confirmação não são iguais');
  const pronto = ocupado($('btn-trocar-senha'), 'Trocando...');
  try {
    const { data: s } = await sb.auth.getSession();
    const email = s && s.session ? s.session.user.email : null;
    if (!email) { avisar('sua sessão expirou, entra de novo.'); return go('login'); }
    const { error: e1 } = await sb.auth.signInWithPassword({ email, password: atual });
    if (e1) return avisar('senha atual incorreta');
    const { error: e2 } = await sb.auth.updateUser({ password: nova });
    if (e2) throw e2;
    ['input-senha-atual', 'input-senha-nova', 'input-senha-nova-confirma'].forEach((id) => { $(id).value = ''; });
    $('form-trocar-senha').classList.remove('on');
    toast('Senha trocada');
  } catch (err) { falhou(err, 'Não consegui trocar a senha'); } finally { pronto(); }
}

/* ===================== PWA ===================== */
let pedidoInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pedidoInstalacao = e;
  $('install-wrap').innerHTML = `<div class="install-banner"><span style="font-size:22px;">📲</span>
    <span class="t">Instala o Estude+ na tela inicial pra abrir direto e não perder a sequência.</span>
    <button onclick="instalarApp()">instalar</button></div>`;
});
async function instalarApp() {
  if (!pedidoInstalacao) return;
  pedidoInstalacao.prompt();
  await pedidoInstalacao.userChoice;
  pedidoInstalacao = null;
  $('install-wrap').innerHTML = '';
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ===================== início ===================== */
(async function boot() {
  const { data } = await sb.auth.getSession();
  if (data && data.session && data.session.user) {
    try {
      await criarPerfilSeNaoExistir(data.session.user);
      verHoje();
    } catch (err) {
      falhou(err, 'Não consegui carregar sua conta');
      go('login');
    }
  } else {
    go('login');
  }
})();
