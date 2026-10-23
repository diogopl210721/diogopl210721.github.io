/* Estude+ — movimentos e efeitos.
   Confete de furador, carimbo VISTO, caneta vermelha de correção, XP que voa, estrelinha de nível,
   tela de geração com marca-texto passando e ficha que voa. Tudo respeita "reduzir movimento". */

const Fx = (() => {
  const reduz = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $id = (id) => document.getElementById(id);

  /* ---------- confete de furador (bolinhas de papel) e tirinhas ---------- */
  const CORES = ['#FFD21F', '#FF7DC8', '#5BC0F8', '#3FD07E', '#FFA640', '#B9A4FF', '#DA2128', '#2033A6'];
  let canvas = null, ctx = null, parts = [], raf = null;
  function ajustar() {
    canvas = canvas || $id('fx-canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function confete({ x, y, n = 90, forca = 1 } = {}) {
    if (reduz()) return;
    ajustar();
    const cx = x ?? innerWidth / 2;
    const cy = y ?? innerHeight * 0.35;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      const vel = (5.5 + Math.random() * 9.5) * forca;
      parts.push({
        x: cx, y: cy, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
        g: 0.26 + Math.random() * 0.12, r: 3 + Math.random() * 3.8, cor: CORES[i % CORES.length],
        tipo: Math.random() < 0.72 ? 'bola' : 'tira', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.45,
        vida: 0, max: 95 + Math.random() * 55,
      });
    }
    if (!raf) raf = requestAnimationFrame(passo);
  }
  function passo() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.vida < p.max && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vida++;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.g;
      p.x += p.vx + Math.sin((p.vida + p.rot * 10) / 9) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.globalAlpha = Math.min(1, (p.max - p.vida) / 25);
      ctx.fillStyle = p.cor;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.tipo === 'bola') {
        ctx.scale(1, Math.abs(Math.cos(p.rot)) * 0.8 + 0.2);
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.rotate(p.rot);
        ctx.fillRect(-p.r * 1.7, -p.r * 0.42, p.r * 3.4, p.r * 0.84);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(passo);
    else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  function centro(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------- +XP que sobe do lugar do toque ---------- */
  function xp(el, n) {
    if (!n || n <= 0) return;
    const s = document.createElement('div');
    s.className = 'xp-voa';
    s.textContent = `+${n} XP`;
    const p = el ? centro(el) : { x: innerWidth / 2, y: innerHeight / 3 };
    s.style.left = p.x + 'px';
    s.style.top = (p.y - 18) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), reduz() ? 600 : 1100);
  }

  /* ---------- caneta vermelha do professor ---------- */
  // desenha em pixels do próprio elemento e mede o traço: assim o risco sai inteiro em qualquer tamanho
  function limparCaneta(el) { el.querySelectorAll(':scope > .caneta').forEach((c) => c.remove()); }
  function caneta(el, desenhar) {
    limparCaneta(el);
    const r = el.getBoundingClientRect();
    const w = r.width + 20, h = r.height + 18;
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'caneta');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('aria-hidden', 'true');
    s.style.width = w + 'px';
    s.style.height = h + 'px';
    for (const d of desenhar(w, h)) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    }
    el.appendChild(s);
    s.querySelectorAll('path').forEach((p) => {
      const L = Math.ceil(p.getTotalLength()) + 2;
      p.style.strokeDasharray = L;
      p.style.strokeDashoffset = reduz() ? 0 : L;
    });
  }
  const f = (n) => n.toFixed(1);
  // círculo meio torto em volta da resposta certa, que passa do ponto de partida (como à mão)
  function circular(el) {
    if (!el) return;
    caneta(el, (w, h) => [`M ${f(w * .15)} ${f(h * .12)} C ${f(w * .44)} ${f(-h * .02)}, ${f(w * .91)} 0, ${f(w * .97)} ${f(h * .42)} `
      + `C ${f(w * 1.02)} ${f(h * .82)}, ${f(w * .63)} ${f(h)}, ${f(w * .3)} ${f(h * .95)} `
      + `C ${f(w * .05)} ${f(h * .9)}, ${f(-w * .02)} ${f(h * .62)}, ${f(w * .05)} ${f(h * .32)} `
      + `C ${f(w * .09)} ${f(h * .15)}, ${f(w * .21)} ${f(h * .06)}, ${f(w * .37)} ${f(h * .07)}`]);
  }
  // risco em cima da resposta errada
  function riscar(el) {
    if (!el) return;
    caneta(el, (w, h) => [`M ${f(w * .05)} ${f(h * .6)} C ${f(w * .26)} ${f(h * .48)}, ${f(w * .56)} ${f(h * .66)}, ${f(w * .95)} ${f(h * .42)}`]);
    tremer(el);
  }
  function tremer(el) {
    if (!el || reduz()) return;
    el.classList.remove('tremer');
    void el.offsetWidth;
    el.classList.add('tremer');
    setTimeout(() => el.classList.remove('tremer'), 450);
  }

  /* ---------- números que contam até o valor ---------- */
  function contar(el, ate, { dur = 750, fmt = (v) => String(v), atraso = 0 } = {}) {
    if (!el) return;
    if (reduz() || !Number.isFinite(ate) || ate <= 0) { el.textContent = fmt(Number.isFinite(ate) ? ate : 0); return; }
    el.textContent = fmt(0);
    setTimeout(() => {
      const t0 = performance.now();
      const f = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = fmt(Math.round(ate * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, atraso);
  }

  /* ---------- carimbo VISTO ---------- */
  let vistoTimer = null;
  function visto(sub = 'dia completo') {
    const w = $id('fx-visto');
    $id('visto-sub').textContent = sub;
    w.hidden = true;
    void w.offsetWidth;
    w.hidden = false;
    const fone = document.querySelector('.phone');
    if (fone && !reduz()) {
      setTimeout(() => { fone.classList.add('tranco'); setTimeout(() => fone.classList.remove('tranco'), 320); }, 260);
    }
    setTimeout(() => confete({ y: innerHeight * 0.45, n: 120 }), 280);
    clearTimeout(vistoTimer);
    vistoTimer = setTimeout(() => { w.hidden = true; }, reduz() ? 1400 : 1850);
  }
  function vistoMini(tarefaEl) {
    if (!tarefaEl) return;
    const s = document.createElement('span');
    s.className = 'carimbo mini';
    s.textContent = 'VISTO';
    tarefaEl.appendChild(s);
  }

  /* ---------- subiu de nível: estrelinha dourada ---------- */
  function nivel(n) {
    $id('nivel-n').textContent = n;
    $id('nivel-titulo').textContent = `Nível ${n}!`;
    const w = $id('fx-nivel');
    w.hidden = false;
    setTimeout(() => confete({ y: innerHeight * 0.32, n: 150, forca: 1.1 }), 350);
    setTimeout(() => { const b = w.querySelector('button'); if (b) b.focus(); }, 50);
  }
  function fecharNivel() { $id('fx-nivel').hidden = true; }

  /* ---------- tela de geração (IA trabalhando) ---------- */
  const MSGS = ['lendo seu material', 'separando os tópicos', 'escrevendo o resumo', 'desenhando o mapa mental',
    'criando os flashcards', 'inventando as perguntas', 'montando a prova simulada', 'organizando o plano até a prova'];
  let gerMsgT = null, gerBarT = null;
  function gerandoInicio(fotoSrc) {
    const w = $id('fx-gerando');
    const foto = $id('ger-foto');
    const img = $id('ger-img');
    if (fotoSrc) { img.src = fotoSrc; foto.classList.add('com-foto'); } else { img.removeAttribute('src'); foto.classList.remove('com-foto'); }
    const msg = $id('ger-msg');
    const bar = $id('ger-bar');
    let i = 0;
    msg.textContent = MSGS[0];
    bar.style.width = '3%';
    w.hidden = false;
    const t0 = Date.now();
    clearInterval(gerMsgT); clearInterval(gerBarT);
    gerMsgT = setInterval(() => {
      i = Math.min(i + 1, MSGS.length - 1);
      msg.textContent = MSGS[i];
      msg.classList.remove('troca'); void msg.offsetWidth; msg.classList.add('troca');
    }, 3800);
    gerBarT = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      bar.style.width = Math.min(94, 100 * (1 - Math.exp(-s / 15))) + '%';
    }, 600);
  }
  function gerandoFim(ok = true) {
    clearInterval(gerMsgT); clearInterval(gerBarT);
    const w = $id('fx-gerando');
    if (ok) { $id('ger-bar').style.width = '100%'; $id('ger-msg').textContent = 'pronto!'; }
    return new Promise((res) => setTimeout(() => { w.hidden = true; res(); }, ok && !reduz() ? 380 : 0));
  }

  /* ---------- ficha de flashcard que voa ---------- */
  function fichaSai(el, nota) {
    return new Promise((res) => {
      if (!el || reduz()) return res();
      const dir = nota <= 1 ? -1 : 1;
      el.style.setProperty('--dx', (dir * 130) + '%');
      el.style.setProperty('--rot', (dir * 18) + 'deg');
      el.classList.remove('entra');
      el.classList.add('sai');
      setTimeout(() => { el.classList.remove('sai'); res(); }, 330);
    });
  }
  // a classe sai assim que a animação termina: animação parada em cima do cartão achata o 3D e o verso aparece espelhado
  function fichaEntra(el) {
    if (!el || reduz()) return;
    el.classList.remove('entra');
    void el.offsetWidth;
    el.classList.add('entra');
    clearTimeout(el._entraT);
    el._entraT = setTimeout(() => el.classList.remove('entra'), 420);
  }

  return { reduz, confete, centro, xp, circular, riscar, tremer, contar, visto, vistoMini, nivel, fecharNivel, gerandoInicio, gerandoFim, fichaSai, fichaEntra };
})();

/* ---------- bilhetes no lugar de alert/confirm ---------- */
let filaBilhete = Promise.resolve();
function abrirBilhete(texto, { ok = 'OK', nao = null } = {}) {
  const mostrar = () => new Promise((resolve) => {
    const d = document.getElementById('dlg');
    const bOk = document.getElementById('dlg-ok');
    const bNao = document.getElementById('dlg-nao');
    const anterior = document.activeElement;
    document.getElementById('dlg-texto').textContent = texto;
    bOk.textContent = ok;
    bNao.textContent = nao || '';
    bNao.hidden = !nao;
    d.hidden = false;
    const fim = (v) => {
      d.hidden = true;
      bOk.onclick = bNao.onclick = d.onclick = null;
      document.removeEventListener('keydown', tecla, true);
      if (anterior && anterior.focus) { try { anterior.focus({ preventScroll: true }); } catch (_) { /* ignora */ } }
      resolve(v);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fim(!nao); }
      if (e.key === 'Enter') { e.preventDefault(); fim(true); }
    };
    bOk.onclick = () => fim(true);
    bNao.onclick = () => fim(false);
    d.onclick = (e) => { if (e.target === d && nao) fim(false); };
    document.addEventListener('keydown', tecla, true);
    setTimeout(() => bOk.focus(), 30);
  });
  const p = filaBilhete.then(mostrar);
  filaBilhete = p.catch(() => {});
  return p;
}
function avisar(msg) { return abrirBilhete(String(msg ?? '')); }
function confirmar(msg, { sim = 'Sim', nao = 'Cancelar' } = {}) { return abrirBilhete(String(msg ?? ''), { ok: sim, nao }); }

window.addEventListener('resize', () => { const c = document.getElementById('fx-canvas'); if (c) { c.width = 0; c.height = 0; } });
