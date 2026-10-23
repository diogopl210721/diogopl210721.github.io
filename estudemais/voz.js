/* Estude+ — voz: responder flashcard falando, ditar pro tutor e ouvir resumos (tudo do próprio navegador). */

const Voz = (() => {
  const Reconhecedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  function podeOuvir() { return !!Reconhecedor; }

  function ouvir({ onParcial, onFim, onErro } = {}) {
    if (!Reconhecedor) { if (onErro) onErro(new Error('esse navegador não reconhece voz, responde digitando')); return null; }
    parar();
    rec = new Reconhecedor();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let final = '';
    let falhou = false;
    rec.onresult = (e) => {
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript + ' '; else parcial += r[0].transcript;
      }
      if (onParcial) onParcial((final + parcial).trim());
    };
    rec.onerror = (e) => {
      falhou = true;
      const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'libera o microfone pro Estude+ nas configurações do navegador'
        : e.error === 'no-speech' ? 'não ouvi nada, tenta de novo' : 'não deu pra ouvir agora, tenta de novo';
      if (onErro) onErro(new Error(msg));
    };
    rec.onend = () => { rec = null; if (!falhou && onFim) onFim(final.trim()); };
    try { rec.start(); } catch (err) { rec = null; if (onErro) onErro(err); }
    return rec;
  }

  function parar() { if (rec) { try { rec.stop(); } catch (_) { /* já parou */ } } }
  function ouvindo() { return !!rec; }

  // ---------- leitura em voz alta ----------
  let falando = null;
  function podeFalar() { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }
  function vozPt() {
    const vozes = speechSynthesis.getVoices();
    return vozes.find((v) => /pt[-_]BR/i.test(v.lang)) || vozes.find((v) => /^pt/i.test(v.lang)) || null;
  }
  function falar(texto, { onFim } = {}) {
    if (!podeFalar()) return false;
    pararFala();
    const limpo = String(texto || '').replace(/[#*_>`|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!limpo) return false;
    // em pedaços: alguns navegadores cortam a leitura de textos longos
    const pedacos = limpo.match(/[^.!?;:]+[.!?;:]*/g) || [limpo];
    let i = 0;
    const sessao = { onFim };
    falando = sessao;
    const proximo = () => {
      if (falando !== sessao) return;
      if (i >= pedacos.length) { falando = null; if (onFim) onFim(); return; }
      const u = new SpeechSynthesisUtterance(pedacos[i++].trim());
      u.lang = 'pt-BR';
      const v = vozPt();
      if (v) u.voice = v;
      u.rate = 1.03;
      u.onend = proximo;
      u.onerror = proximo;
      speechSynthesis.speak(u);
    };
    proximo();
    return true;
  }
  function pararFala() {
    const s = falando;
    falando = null;
    if (podeFalar()) speechSynthesis.cancel();
    if (s && s.onFim) s.onFim();
  }
  function estaFalando() { return !!falando; }

  return { podeOuvir, ouvir, parar, ouvindo, podeFalar, falar, pararFala, estaFalando };
})();

// botão "Ouvir" que vira "Parar" enquanto lê
function botaoOuvir(btn, texto) {
  if (!Voz.podeFalar()) return toast('esse navegador não lê em voz alta');
  const rotulo = btn.querySelector('span');
  const original = btn.dataset.rotulo || (rotulo ? rotulo.textContent : '');
  btn.dataset.rotulo = original;
  if (btn.classList.contains('lendo')) { Voz.pararFala(); return; }
  const usar = (id) => { const u = btn.querySelector('use'); if (u) u.setAttribute('href', id); };
  btn.classList.add('lendo');
  if (rotulo) rotulo.textContent = 'Parar';
  usar('#i-pare');
  Voz.falar(texto, {
    onFim: () => { btn.classList.remove('lendo'); if (rotulo) rotulo.textContent = original; usar('#i-som'); },
  });
}

/* ---------- flashcard respondido em voz alta ---------- */
function prepararVozCard() {
  $('cards-voz').hidden = false;
  $('cards-voz-res').hidden = true;
  $('cards-falar').hidden = !Voz.podeOuvir();
  $('cards-falar').classList.remove('gravando');
  $('cards-falar').querySelector('span').textContent = 'Responder falando';
  document.querySelectorAll('.grade.sugerida').forEach((g) => g.classList.remove('sugerida'));
}

function responderFalando() {
  const btn = $('cards-falar');
  const rotulo = btn.querySelector('span');
  if (Voz.ouvindo()) { Voz.parar(); return; }
  btn.classList.add('gravando');
  rotulo.textContent = 'ouvindo... fala a resposta';
  Voz.ouvir({
    onParcial: (t) => { rotulo.textContent = t || 'ouvindo...'; },
    onFim: (t) => { btn.classList.remove('gravando'); rotulo.textContent = 'Responder falando'; if (t) conferirResposta(t); else toast('não ouvi nada, tenta de novo'); },
    onErro: (e) => { btn.classList.remove('gravando'); rotulo.textContent = 'Responder falando'; toast(e.message); },
  });
}

async function responderDigitando() {
  const t = await perguntarTexto('Escreve o que você lembra da resposta', { ok: 'Conferir', placeholder: 'sua resposta' });
  if (t) conferirResposta(t);
}

async function conferirResposta(resposta) {
  const c = estado.cards;
  if (!c) return;
  const card = c.fila[c.i];
  const caixa = $('cards-voz-res');
  caixa.className = 'voz-resultado';
  caixa.innerHTML = `<b>conferindo...</b>você disse: "${esc(resposta)}"`;
  caixa.hidden = false;
  $('cards-voz').hidden = true;
  try {
    const r = await chamarFuncao('estude-conferir-resposta', { pergunta: card.frente, esperado: card.verso, resposta });
    if (estado.cards !== c || c.fila[c.i] !== card) return;
    const titulo = { certo: 'Certo!', quase: 'Quase lá', errado: 'Não foi dessa vez' }[r.resultado] || 'Conferido';
    caixa.className = 'voz-resultado ' + r.resultado;
    caixa.innerHTML = `<b>${titulo}</b>${esc(r.comentario || '')}<div class="small muted" style="margin-top:4px;">você disse: "${esc(resposta)}"</div>`;
    if (!$('flash').classList.contains('flipped')) virarCard();
    const g = document.querySelector('.grade.g' + r.nota);
    if (g) g.classList.add('sugerida');
    if (r.resultado === 'certo') Fx.confete({ y: innerHeight * 0.35, n: 40, forca: 0.7 });
  } catch (err) {
    caixa.className = 'voz-resultado';
    caixa.innerHTML = `<b>Não consegui conferir</b>${esc(err.message)}. Vira o card e avalia nos botões.`;
    if (!$('flash').classList.contains('flipped')) virarCard();
  }
}
