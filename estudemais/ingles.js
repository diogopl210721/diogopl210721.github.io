/* EstudeUp — Aprenda Inglês: trilha de lições, exercícios, vidas, revisão do que errou e teste de nível.
   Conteúdo em ingles-conteudo.js; progresso e XP no banco (be_ingles_progresso / be_ingles_concluir).
   Voz: o celular lê em inglês (speechSynthesis); falar no microfone é opcional (some quando não há suporte). */

const ING = { prog: null, sessao: null };
const VIDAS = 5;

const ingTodas = () => INGLES.flatMap((u) => u.licoes.map((l) => ({ ...l, unidade: u })));
const alts = (t) => String(t).split('|').map((x) => x.trim()).filter(Boolean);
const princ = (t) => alts(t)[0];
const embaralhar = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’`]/g, "'").replace(/[.,!?;:¿¡"()]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (t) => String(t).replace(/[.,!?;:]/g, '').split(/\s+/).filter(Boolean);

function distancia(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function confere(resposta, aceitas, tolerante = false) {
  const r = normal(resposta);
  return alts(aceitas).some((a) => { const n = normal(a); return r === n || (tolerante && n.length > 4 && distancia(r, n) <= 1); });
}
function falarIngles(texto, rate = 0.92) { if (typeof Voz !== 'undefined') Voz.falar(princ(texto), { lang: 'en-US', rate }); }

/* ===================== TRILHA ===================== */
async function verIngles() {
  go('ingles');
  const box = $('ing-trilha');
  if (!ING.prog) box.innerHTML = '<div class="loading">carregando...</div>';
  try { ING.prog = await rpc('be_ingles_progresso'); } catch (err) { if (!ING.prog) { box.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; } }
  pintarTrilha();
}

function pintarTrilha() {
  const p = ING.prog || { licoes: {}, revisar: [], xp_hoje: 0 };
  const todas = ingTodas();
  const atual = todas.find((l) => !p.licoes[l.id]);
  const feitas = todas.filter((l) => p.licoes[l.id]).length;
  $('ing-resumo').innerHTML = `
    <div class="ing-stat"><b>${feitas}/${todas.length}</b><small>lições</small></div>
    <div class="ing-stat"><b>${p.xp_hoje || 0}</b><small>XP de inglês hoje</small></div>
    <div class="ing-stat"><b>${(p.revisar || []).length}</b><small>pra revisar</small></div>`;
  $('ing-acoes').innerHTML = `
    ${(p.revisar || []).length ? `<button class="btn coral full" onclick="iniciarRevisaoIngles()">Revisar o que eu errei (${p.revisar.length})</button>` : ''}
    ${!feitas ? `<button class="btn ghost full" onclick="iniciarNivelIngles()">Já sei o básico: fazer teste de nível</button>` : ''}`;
  let n = 0;
  $('ing-trilha').innerHTML = INGLES.map((u) => `
    <section class="ing-unidade" style="--cor-un:${u.cor}">
      <div class="ing-un-topo"><small>Unidade ${u.id.slice(1)}</small><b>${esc(u.titulo)}</b></div>
      <div class="ing-caminho">
        ${u.licoes.map((l) => {
          const r = p.licoes[l.id];
          const estado = r ? 'feita' : (atual && atual.id === l.id ? 'atual' : 'travada');
          const lado = ['c', 'd', 'c', 'e'][n++ % 4];
          return `<div class="ing-no ${estado} lado-${lado}">
            <button onclick="${estado === 'travada' ? 'avisoTravada()' : `iniciarLicaoIngles('${l.id}')`}" aria-label="${esc(l.titulo)}">
              <span class="ing-bola">${estado === 'travada' ? '🔒' : l.emoji}</span></button>
            <span class="ing-nome">${esc(l.titulo)}${r ? `<small>${r.pulada ? 'liberada no teste' : `${r.melhor}% de acerto`}</small>` : estado === 'atual' ? '<small>começar</small>' : ''}</span>
          </div>`;
        }).join('')}
      </div>
    </section>`).join('') + `<p class="ing-rodape">Mais unidades em breve: viagem, tecnologia e inglês para o ENEM.</p>`;
}
function avisoTravada() { toast('Termine a lição anterior pra liberar essa.'); }

/* ===================== MONTAR EXERCÍCIOS ===================== */
function exercicioDePalavra(w, pool, tipo) {
  const [en, pt, emoji] = w;
  if (tipo === 'escrever') return { tipo: 'escrever', item: en, pergunta: `Escreva em inglês: <b>${esc(princ(pt))}</b>`, emoji, aceitas: en };
  const outras = embaralhar(pool.filter((x) => x[0] !== en)).slice(0, 3);
  return { tipo: 'escolha', item: en, ouvir: en, pergunta: `O que significa <b>${esc(en)}</b>?`,
    opcoes: embaralhar([w, ...outras]).map((x) => ({ texto: princ(x[1]), emoji: x[2], certa: x[0] === en })) };
}
function exercicioDeFrase(f, outrasFrases, tipo) {
  const [en, pt] = f;
  const extra = (lista) => embaralhar(lista).slice(0, 3);
  if (tipo === 'para_ingles' || tipo === 'ouvir') {
    const certos = tokens(princ(en));
    const dist = extra(outrasFrases.flatMap((x) => tokens(princ(x[0]))).filter((t) => !certos.map(normal).includes(normal(t))));
    return { tipo: 'montar', item: en, idioma: 'en', ouvir: tipo === 'ouvir' ? en : null, aceitas: en,
      pergunta: tipo === 'ouvir' ? 'Ouça e monte a frase' : `Traduza: <b>${esc(princ(pt))}</b>`, banco: embaralhar([...certos, ...dist]) };
  }
  if (tipo === 'para_portugues') {
    const certos = tokens(princ(pt));
    const dist = extra(outrasFrases.flatMap((x) => tokens(princ(x[1]))).filter((t) => !certos.map(normal).includes(normal(t))));
    return { tipo: 'montar', item: en, idioma: 'pt', ouvir: en, aceitas: pt, pergunta: `Traduza: <b>${esc(princ(en))}</b>`, banco: embaralhar([...certos, ...dist]) };
  }
  return { tipo: 'falar', item: en, ouvir: en, aceitas: en, pergunta: 'Fale em inglês', frase: princ(en), traducao: princ(pt) };
}
function exercicioCompletar(f, palavras) {
  const en = princ(f[0]);
  const alvo = palavras.find((w) => new RegExp(`\\b${w[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(en));
  if (!alvo) return null;
  const outras = embaralhar(palavras.filter((w) => w[0] !== alvo[0])).slice(0, 3);
  return { tipo: 'completar', item: f[0], ouvir: f[0], pergunta: `Complete: <i>${esc(princ(f[1]))}</i>`,
    lacuna: esc(en).replace(new RegExp(`\\b${alvo[0]}\\b`, 'i'), '<span class="ing-lacuna">____</span>'),
    opcoes: embaralhar([alvo, ...outras]).map((w) => ({ texto: w[0], certa: w[0] === alvo[0] })) };
}

function montarLicao(l) {
  const pw = embaralhar(l.palavras), fr = embaralhar(l.frases);
  const ex = [
    exercicioDePalavra(pw[0], l.palavras), exercicioDePalavra(pw[1], l.palavras), exercicioDePalavra(pw[2], l.palavras),
    { tipo: 'pares', item: null, pergunta: 'Ligue os pares', pares: pw.slice(3, 7).map((w) => [w[0], princ(w[1])]) },
    exercicioDeFrase(fr[0], l.frases, 'para_ingles'),
    exercicioCompletar(fr[1], l.palavras) || exercicioDePalavra(pw[4], l.palavras),
    exercicioDeFrase(fr[1], l.frases, 'para_portugues'),
    exercicioDeFrase(fr[2] || fr[0], l.frases, 'ouvir'),
    exercicioDePalavra(pw[5] || pw[0], l.palavras, 'escrever'),
    exercicioDeFrase(fr[3] || fr[1], l.frases, 'para_ingles'),
  ];
  if (typeof Voz !== 'undefined' && Voz.podeOuvir()) ex.push(exercicioDeFrase(fr[0], l.frases, 'falar'));
  return ex.filter(Boolean);
}

/* ===================== SESSÃO ===================== */
function abrirSessao(s) {
  ING.sessao = { i: 0, vidas: VIDAS, acertos: 0, total: 0, errados: new Set(), acertados: new Set(), refazer: [], ...s };
  $('ing-titulo-licao').textContent = s.titulo;
  go('ingles-licao');
  pintarExercicio();
}
function iniciarLicaoIngles(id) {
  const l = ingTodas().find((x) => x.id === id);
  if (l) abrirSessao({ tipo: 'licao', licao: l, titulo: l.titulo, exercicios: montarLicao(l) });
}
function iniciarRevisaoIngles() {
  const itens = (ING.prog && ING.prog.revisar) || [];
  const todas = ingTodas();
  const ex = [];
  for (const it of itens.slice(0, 10)) {
    const l = todas.find((x) => x.palavras.some((w) => w[0] === it) || x.frases.some((f) => f[0] === it));
    if (!l) continue;
    const w = l.palavras.find((x) => x[0] === it);
    ex.push(w ? exercicioDePalavra(w, l.palavras, ex.length % 2 ? 'escrever' : 'escolha')
      : exercicioDeFrase(l.frases.find((f) => f[0] === it), l.frases, ex.length % 2 ? 'ouvir' : 'para_ingles'));
  }
  if (!ex.length) return toast('Nada pra revisar agora.');
  abrirSessao({ tipo: 'revisao', titulo: 'Revisão', exercicios: ex });
}
function iniciarNivelIngles() {
  const base = INGLES.slice(0, 2).flatMap((u) => u.licoes);
  const ex = embaralhar(base).slice(0, 10).map((l, k) => (k % 2
    ? exercicioDeFrase(embaralhar(l.frases)[0], l.frases, 'para_ingles')
    : exercicioDePalavra(embaralhar(l.palavras)[0], l.palavras)));
  abrirSessao({ tipo: 'nivel', titulo: 'Teste de nível', exercicios: ex, semVidas: true });
}

function pintarExercicio() {
  const s = ING.sessao;
  const e = s.exercicios[s.i];
  s.resposta = null; s.montada = [];
  $('ing-progresso').style.width = `${Math.round(100 * s.i / s.exercicios.length)}%`;
  $('ing-vidas').textContent = s.semVidas ? '' : `❤ ${s.vidas}`;
  const corpo = $('ing-corpo');
  const ouvir = e.ouvir ? `<button class="ing-ouvir" onclick="falarIngles(${JSON.stringify(e.ouvir).replace(/"/g, '&quot;')})" aria-label="ouvir">🔊</button>` : '';
  let html = `<h2 class="ing-perg">${ouvir}<span>${e.pergunta}</span></h2>`;
  if (e.tipo === 'escolha' || e.tipo === 'completar') {
    if (e.lacuna) html += `<p class="ing-frase">${e.lacuna}</p>`;
    html += `<div class="ing-opcoes">${e.opcoes.map((o, k) => `<button class="ing-op" data-k="${k}" onclick="escolherIngles(${k})">${o.emoji ? `<span class="ing-emoji">${o.emoji}</span>` : ''}${esc(o.texto)}</button>`).join('')}</div>`;
  } else if (e.tipo === 'montar') {
    html += `<div class="ing-montada" id="ing-montada"></div><div class="ing-banco" id="ing-banco">${e.banco.map((t, k) => `<button class="ing-ficha" data-k="${k}" onclick="pegarFicha(${k})">${esc(t)}</button>`).join('')}</div>`;
  } else if (e.tipo === 'escrever') {
    html += `<div class="ing-escrever">${e.emoji ? `<span class="ing-emoji grande">${e.emoji}</span>` : ''}<input id="ing-texto" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="digite em inglês" oninput="ING.sessao.resposta = this.value; atualizarConferir()" onkeydown="if(event.key==='Enter')conferirIngles()"></div>`;
  } else if (e.tipo === 'pares') {
    s.paresFeitos = 0; s.parSel = null;
    const esq = embaralhar(e.pares.map((p, k) => ({ t: p[0], k }))), dir = embaralhar(e.pares.map((p, k) => ({ t: p[1], k })));
    html += `<div class="ing-pares"><div>${esq.map((x) => `<button class="ing-par" data-lado="e" data-k="${x.k}" onclick="tocarPar(this)">${esc(x.t)}</button>`).join('')}</div>
      <div>${dir.map((x) => `<button class="ing-par" data-lado="d" data-k="${x.k}" onclick="tocarPar(this)">${esc(x.t)}</button>`).join('')}</div></div>`;
  } else if (e.tipo === 'falar') {
    html += `<p class="ing-frase grande">${esc(e.frase)}</p><p class="muted small">${esc(e.traducao)}</p>
      <button class="ing-mic" id="ing-mic" onclick="falarFraseIngles()">🎤 toque e fale</button>
      <p class="muted small" id="ing-ouvido"></p>
      <button class="link-btn" onclick="pularFalaIngles()">não posso falar agora</button>`;
  }
  corpo.innerHTML = html;
  $('ing-rodape').className = 'ing-rodape';
  $('ing-rodape').innerHTML = e.tipo === 'pares' ? '' : `<button class="btn full" id="ing-conferir" disabled onclick="conferirIngles()">Conferir</button>`;
  if (e.ouvir && (e.tipo === 'escolha' || e.tipo === 'montar' && e.idioma === 'en' && e.pergunta.startsWith('Ouça'))) setTimeout(() => falarIngles(e.ouvir), 250);
  if (e.tipo === 'escrever') setTimeout(() => { const i = $('ing-texto'); if (i) i.focus(); }, 200);
}
function atualizarConferir() {
  const b = $('ing-conferir'); const s = ING.sessao;
  if (b) b.disabled = !(s.resposta != null && String(s.resposta).trim() || (s.montada && s.montada.length));
}
function escolherIngles(k) {
  ING.sessao.resposta = k;
  document.querySelectorAll('.ing-op').forEach((b) => b.classList.toggle('sel', +b.dataset.k === k));
  const o = ING.sessao.exercicios[ING.sessao.i].opcoes[k];
  if (o && /^[a-z]/i.test(o.texto) && ING.sessao.exercicios[ING.sessao.i].tipo === 'completar') falarIngles(o.texto);
  atualizarConferir();
}
function pegarFicha(k) {
  const s = ING.sessao, e = s.exercicios[s.i];
  const b = document.querySelector(`#ing-banco .ing-ficha[data-k="${k}"]`);
  if (!b || b.classList.contains('usada')) return;
  b.classList.add('usada');
  s.montada.push(k);
  if (e.idioma === 'en') falarIngles(e.banco[k], 1);
  pintarMontada();
}
function soltarFicha(pos) {
  const s = ING.sessao;
  const k = s.montada.splice(pos, 1)[0];
  const b = document.querySelector(`#ing-banco .ing-ficha[data-k="${k}"]`);
  if (b) b.classList.remove('usada');
  pintarMontada();
}
function pintarMontada() {
  const s = ING.sessao, e = s.exercicios[s.i];
  $('ing-montada').innerHTML = s.montada.map((k, pos) => `<button class="ing-ficha" onclick="soltarFicha(${pos})">${esc(e.banco[k])}</button>`).join('');
  s.resposta = s.montada.map((k) => e.banco[k]).join(' ');
  atualizarConferir();
}
function tocarPar(btn) {
  const s = ING.sessao;
  if (btn.classList.contains('ok')) return;
  if (btn.dataset.lado === 'e') falarIngles(btn.textContent, 1);
  if (!s.parSel || s.parSel.dataset.lado === btn.dataset.lado) {
    document.querySelectorAll('.ing-par.sel').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel'); s.parSel = btn; return;
  }
  const a = s.parSel; s.parSel = null;
  a.classList.remove('sel');
  if (a.dataset.k === btn.dataset.k) {
    a.classList.add('ok'); btn.classList.add('ok');
    s.paresFeitos++;
    if (s.paresFeitos === s.exercicios[s.i].pares.length) mostrarFeedback(true);
  } else {
    [a, btn].forEach((b) => { b.classList.add('erro'); setTimeout(() => b.classList.remove('erro'), 450); });
    s.erroNosPares = true;
  }
}
function falarFraseIngles() {
  const s = ING.sessao, e = s.exercicios[s.i];
  const mic = $('ing-mic');
  mic.classList.add('ouvindo'); mic.textContent = '🎤 ouvindo...';
  Voz.ouvir({
    lang: 'en-US',
    onParcial: (t) => { $('ing-ouvido').textContent = t; },
    onFim: (t) => {
      mic.classList.remove('ouvindo'); mic.textContent = '🎤 toque e fale';
      const alvo = tokens(normal(e.frase)), dito = new Set(tokens(normal(t)));
      const certo = alvo.length && alvo.filter((w) => dito.has(w)).length / alvo.length >= 0.7;
      s.resposta = t;
      mostrarFeedback(certo, certo ? null : `A gente ouviu: "${t || '...'}"`);
    },
    onErro: (err) => { mic.classList.remove('ouvindo'); mic.textContent = '🎤 toque e fale'; toast(err.message); },
  });
}
function pularFalaIngles() { const s = ING.sessao; s.exercicios.splice(s.i, 1); s.i--; proximoIngles(); }

function conferirIngles() {
  const s = ING.sessao, e = s.exercicios[s.i];
  let certo = false;
  if (e.tipo === 'escolha' || e.tipo === 'completar') certo = !!(e.opcoes[s.resposta] || {}).certa;
  else if (e.tipo === 'montar') certo = confere(s.resposta, e.aceitas);
  else if (e.tipo === 'escrever') certo = confere(s.resposta, e.aceitas, true);
  mostrarFeedback(certo);
}
function respostaCerta(e) {
  if (e.tipo === 'escolha' || e.tipo === 'completar') return e.opcoes.find((o) => o.certa).texto;
  return princ(e.aceitas);
}
function mostrarFeedback(certo, extra) {
  const s = ING.sessao, e = s.exercicios[s.i];
  const primeiraVez = !e.repetida;
  if (e.tipo === 'pares' && s.erroNosPares) certo = certo && true; // pares conta como certo ao terminar
  if (primeiraVez) { s.total++; if (certo) s.acertos++; }
  if (e.item) { if (certo) { if (!s.errados.has(e.item)) s.acertados.add(e.item); } else { s.errados.add(e.item); s.acertados.delete(e.item); } }
  if (!certo) {
    if (!s.semVidas) s.vidas--;
    if (!e.repetida && s.tipo !== 'nivel') s.exercicios.push({ ...e, repetida: true }); // volta no fim, como no caderno de erros
  }
  if (certo && e.ouvir && e.tipo !== 'escolha') falarIngles(e.ouvir);
  if (typeof Fx !== 'undefined' && Fx.acertou && certo) Fx.acertou();
  $('ing-vidas').textContent = s.semVidas ? '' : `❤ ${s.vidas}`;
  const r = $('ing-rodape');
  r.className = 'ing-rodape ' + (certo ? 'certo' : 'errado');
  r.innerHTML = `<div class="ing-fb"><b>${certo ? ['Isso aí!', 'Mandou bem!', 'Perfeito!', 'Boa!'][s.i % 4] : 'Quase!'}</b>
      ${!certo && e.tipo !== 'falar' ? `<span>Resposta certa: <b>${esc(respostaCerta(e))}</b></span>` : ''}${extra ? `<span>${esc(extra)}</span>` : ''}</div>
    <button class="btn full" onclick="proximoIngles()">Continuar</button>`;
  document.querySelectorAll('.ing-op, .ing-ficha, #ing-texto').forEach((b) => { b.disabled = true; });
}
function proximoIngles() {
  const s = ING.sessao;
  if (!s.semVidas && s.vidas <= 0) return terminarIngles(false);
  s.i++;
  if (s.i >= s.exercicios.length) return terminarIngles(true);
  pintarExercicio();
}
async function sairIngles() {
  const s = ING.sessao;
  if (s && s.i > 0 && !(await confirmar('Sair da lição?\nO que você fez agora não vai contar.', { sim: 'Sair' }))) return;
  voltar(verIngles);
}

async function terminarIngles(completou) {
  const s = ING.sessao;
  go('ingles-fim');
  const pct = s.total ? Math.round(100 * s.acertos / s.total) : 0;
  $('ingfim-titulo').textContent = !completou ? 'Acabaram as vidas' : s.tipo === 'nivel' ? 'Teste feito!' : 'Lição completa!';
  $('ingfim-pct').textContent = `${pct}%`;
  $('ingfim-acertos').textContent = `${s.acertos}/${s.total}`;
  $('ingfim-xp').textContent = '…';
  $('ingfim-sub').textContent = !completou ? 'Sem problema: refaça a lição e as palavras que você errou ficam na revisão.' : '';
  $('ingfim-botoes').innerHTML = `
    ${!completou && s.licao ? `<button class="btn coral full" onclick="iniciarLicaoIngles('${s.licao.id}')">Tentar de novo</button>` : ''}
    <button class="btn ${completou ? 'coral' : 'ghost'} full" onclick="verIngles()">Voltar pra trilha</button>`;
  try {
    const liberar = s.tipo === 'nivel' ? INGLES.slice(0, 2).flatMap((u) => u.licoes.map((l) => l.id)) : [];
    const r = await rpc('be_ingles_concluir', {
      p_tipo: s.tipo, p_licao: s.licao && completou ? s.licao.id : null, p_acertos: s.acertos, p_total: Math.max(1, s.total),
      p_errados: [...s.errados], p_acertados: [...s.acertados], p_liberar: liberar,
    });
    if (s.tipo === 'licao' && !completou) { /* já gravou os erros; a lição não conta */ }
    $('ingfim-xp').textContent = `+${r.xp}`;
    if (s.tipo === 'nivel') $('ingfim-sub').textContent = r.passou ? 'Você foi liberado para a Unidade 3. Pode refazer as anteriores quando quiser.' : 'Melhor começar do início. Bora!';
    if (r.xp) toastXp(r.xp);
  } catch (err) { $('ingfim-xp').textContent = '0'; falhou(err); }
  ING.prog = null;
}
