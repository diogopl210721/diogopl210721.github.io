/* Catedral Pão da Vida — landing (modelo Melhor Opção, adaptado) */

/* cultos: próximo culto e domingo do mês, a partir da data de hoje */
function cultosVivos() {
  const DIAS = ["domingo","segunda","terca","quarta","quinta","sexta","sabado"];
  const CULTOS = [{ id: "terca", h: 20 }, { id: "quarta", h: 15 }, { id: "domingo", h: 20 }];
  const NOMES = { terca: "Terça da Vitória", quarta: "Tarde da Bênção", domingo: "Culto de Celebração" };
  const agora = new Date();
  const prox = c => { for (let i = 0; i < 8; i++) { const d = new Date(agora); d.setDate(agora.getDate() + i); d.setHours(c.h, 0, 0, 0); if (DIAS[d.getDay()] === c.id && d > agora - 7.2e6) return d; } };
  const falta = d => { const ms = d - agora; if (ms <= 0) return "acontecendo agora"; const mi = Math.round(ms / 6e4), h = Math.floor(mi / 60), dd = Math.floor(h / 24);
    if (dd >= 2) return "em " + dd + " dias"; if (h >= 18) return "amanhã"; if (h >= 1) return "em " + h + "h" + String(mi % 60).padStart(2, "0"); return "em " + mi + " min"; };
  CULTOS.forEach(c => { const el = document.querySelector('[data-prox="' + c.id + '"]'), d = prox(c); if (el && d) el.textContent = (DIAS[agora.getDay()] === c.id && d - agora < 864e5 ? "Hoje, " : "Próximo: ") + falta(d); });
  const dom = prox(CULTOS[2]); if (dom) { const n = Math.min(4, Math.ceil(dom.getDate() / 7)); document.querySelectorAll(".temas div").forEach((t, i) => t.classList.toggle("agora", i + 1 === n)); }
  const px = CULTOS.map(c => ({ c, d: prox(c) })).sort((a, b) => a.d - b.d)[0];
  const tag = document.querySelector("#proxTag"); if (tag && px) tag.textContent = NOMES[px.c.id] + " " + falta(px.d);
}
/* imagem que não carrega some e deixa o fundo da marca */
document.querySelectorAll("img[data-opc]").forEach(i => { const f = () => i.classList.add("falhou"); i.addEventListener("error", f); if (i.complete && !i.naturalWidth) f(); });
(() => {
  const html = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  $('#yr').textContent = new Date().getFullYear();
  cultosVivos();

  /* ---------- menu mobile ---------- */
  const burger = $('#burger'), sheet = $('#sheet');
  let lenis = null;
  const setMenu = open => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    sheet.setAttribute('aria-hidden', !open);
    if (lenis) open ? lenis.stop() : lenis.start();
    else html.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- quebra de texto em palavras / letras ---------- */
  function split(el, mode = 'chars') {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const parts = [...el.childNodes].map(n => ({ text: n.textContent, em: n.nodeType === 1 && n.tagName === 'EM' }));
    el.innerHTML = '';
    parts.forEach(({ text, em }) => {
      const target = em ? el.appendChild(document.createElement('em')) : el;
      text.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { target.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
        if (mode === 'chars') [...tok].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); });
        else { const c = document.createElement('span'); c.className = 'c'; c.textContent = tok; w.appendChild(c); }
        target.appendChild(w);
      });
    });
    return $$('.c', el);
  }

  // frase da história: palavras que acendem
  const story = $('#story');
  const hl = ['mar,', 'mesa', 'pão,', 'lugar', 'família'];
  story.setAttribute('aria-label', story.textContent.trim());
  story.innerHTML = story.textContent.trim().split(/\s+/)
    .map(w => `<span class="wd${hl.some(h => w.toLowerCase().startsWith(h)) ? ' hl' : ''}" aria-hidden="true">${w}</span>`).join(' ');
  const words = $$('.wd', story);

  /* ---------- modo estático (sem GSAP ou com movimento reduzido) ---------- */
  const hasFx = window.gsap && window.ScrollTrigger && !reduce;
  if (!hasFx) {
    html.classList.add('no-fx');
    const loader = $('#loader'); if (loader) loader.remove();
    const nav = $('#nav'), dock = $('#dock'), prog = $('#progress');
    const onS = () => {
      const y = scrollY, max = html.scrollHeight - innerHeight;
      nav.classList.toggle('solid', y > 40);
      dock.classList.toggle('show', y > innerHeight * .7);
      prog.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    };
    addEventListener('scroll', onS, { passive: true }); onS();
    $$('a[href^="#"]', sheet).forEach(a => a.addEventListener('click', () => setMenu(false)));
    return;
  }

  /* ================================================================
     MODO COMPLETO
     ================================================================ */
  gsap.registerPlugin(ScrollTrigger);
  html.classList.add('fx');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  /* ---------- rolagem suave ---------- */
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
    // saltos de scroll feitos pelo navegador (ex.: voltar a página) também atualizam as animações
    addEventListener('scroll', () => ScrollTrigger.update(), { passive: true });
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const target = id === '#inicio' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    setMenu(false);
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
    else (target === 0 ? scrollTo({ top: 0, behavior: 'smooth' }) : target.scrollIntoView({ behavior: 'smooth' }));
  }));

  /* ---------- elementos ---------- */
  const heroChars = split($('#heroTitle'), 'chars');
  const portalChars = split($('#portalTitle'), 'chars');
  const logo3d = $('#logo3d'), logoIn = $('#logo3dIn'), sheen = $('#sheen');
  gsap.set(logo3d, { opacity: 0 });
  gsap.set(heroChars, { yPercent: 115 });
  gsap.set('.hero-in', { y: 28, opacity: 0 });
  gsap.set('#cue', { opacity: 0 });

  /* ---------- vaga-lumes no hero ---------- */
  const flies = (() => {
    const cv = $('#flies'), ctx = cv.getContext('2d');
    let w, h, dpr, pts = [], on = false, raf;
    const N = innerWidth < 760 ? 26 : 54;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2); w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const make = () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + .6, vx: (Math.random() - .5) * .25, vy: -Math.random() * .35 - .05, p: Math.random() * 6.28, s: Math.random() * .02 + .008 });
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const q of pts) {
        q.x += q.vx + Math.sin(q.p) * .2; q.y += q.vy; q.p += q.s;
        if (q.y < -10) { q.y = h + 10; q.x = Math.random() * w; }
        if (q.x < -10) q.x = w + 10; if (q.x > w + 10) q.x = -10;
        const a = (Math.sin(q.p * 2) + 1) / 2 * .8 + .1;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 7);
        g.addColorStop(0, `rgba(255,214,120,${a})`); g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 7, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    size(); pts = Array.from({ length: N }, make);
    addEventListener('resize', size);
    return { start() { if (!on) { on = true; draw(); } }, stop() { on = false; cancelAnimationFrame(raf); } };
  })();

  /* ---------- céu estrelado ---------- */
  const stars = (() => {
    const cv = $('#stars'), ctx = cv.getContext('2d');
    let w, h, dpr, pts = [], on = false, raf, t = 0, shoot = null;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2); w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: Math.round(w * h / 5200) }, () => ({ x: Math.random() * w, y: Math.random() * h * .8, r: Math.random() * 1.2 + .2, p: Math.random() * 6.28, s: Math.random() * .03 + .005 }));
    };
    const draw = () => {
      t++; ctx.clearRect(0, 0, w, h);
      for (const s of pts) {
        s.p += s.s; const a = .35 + (Math.sin(s.p) + 1) / 2 * .65;
        ctx.fillStyle = `rgba(255,248,230,${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
      if (!shoot && Math.random() < .004) shoot = { x: Math.random() * w * .7 + w * .2, y: Math.random() * h * .3, l: 0 };
      if (shoot) {
        shoot.l += 1;
        const x = shoot.x - shoot.l * 9, y = shoot.y + shoot.l * 4, a = 1 - shoot.l / 40;
        const g = ctx.createLinearGradient(x, y, x + 90, y - 40);
        g.addColorStop(0, `rgba(255,250,235,${a})`); g.addColorStop(1, 'rgba(255,250,235,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y - 40); ctx.stroke();
        if (shoot.l > 40) shoot = null;
      }
      raf = requestAnimationFrame(draw);
    };
    size(); addEventListener('resize', size);
    return { start() { if (!on) { on = true; draw(); } }, stop() { on = false; cancelAnimationFrame(raf); } };
  })();

  /* ---------- preloader: a logo se monta e pousa no lugar ---------- */
  const loader = $('#loader');
  const lBadge = $('#lBadge'), lRays = $('#lRays'), lCount = $('#lCount');
  gsap.set(lBadge, { scale: .55, opacity: 0, rotate: -25 });
  gsap.to(lRays, { rotate: 360, duration: 50, repeat: -1, ease: 'none' });
  const counter = { v: 0 };
  const intro = gsap.timeline();
  intro.to(lRays, { opacity: 1, duration: 1.4, ease: 'power2.out' }, 0)
    .to(lBadge, { scale: 1, opacity: 1, rotate: 0, duration: 1.4, ease: 'expo.out' }, .1)
    .to(counter, { v: 100, duration: 1.9, ease: 'power2.inOut', onUpdate: () => (lCount.textContent = Math.round(counter.v)) }, 0);

  const ready = Promise.all([
    new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true }))),
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise(r => setTimeout(r, 2000))
  ]);
  Promise.race([ready, new Promise(r => setTimeout(r, 4500))]).then(leave);

  function leave() {
    const a = $('.loader-logo').getBoundingClientRect(), b = logo3d.getBoundingClientRect();
    const s = b.width / a.width;
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    const tl = gsap.timeline({
      onComplete() { loader.remove(); if (lenis) lenis.start(); ScrollTrigger.refresh(); }
    });
    tl.to([lCount, '.loader-tag'], { opacity: 0, y: -16, duration: .5, ease: 'power2.in' }, 0)
      .to('.loader-logo', { x: dx, y: dy, scale: s, duration: 1.35, ease: 'expo.inOut' }, .1)
      .to(lRays, { opacity: 0, scale: 1.4, duration: 1.1, ease: 'power2.inOut' }, .2)
      .to(loader, { backgroundColor: 'rgba(20,17,14,0)', duration: 1, ease: 'power2.inOut' }, .45)
      .set(logo3d, { opacity: 1 }, 1.45)
      .set(loader, { autoAlpha: 0 }, 1.47)
      .to(heroChars, { yPercent: 0, duration: 1.2, stagger: .022, ease: 'expo.out' }, 1.05)
      .to('.hero-in', { y: 0, opacity: 1, duration: 1.1, stagger: .12, ease: 'expo.out' }, 1.35)
      .to('#cue', { opacity: 1, duration: .8 }, 1.9);
    flies.start();
  }

  /* ---------- logo 3D: segue o mouse com reflexo de luz ---------- */
  if (fine) {
    const rx = gsap.quickTo(logoIn, 'rotationX', { duration: .9, ease: 'power3' });
    const ry = gsap.quickTo(logoIn, 'rotationY', { duration: .9, ease: 'power3' });
    addEventListener('pointermove', e => {
      const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
      ry(nx * 26); rx(-ny * 20);
      sheen.style.setProperty('--sx', (50 + nx * 90) + '%');
      sheen.style.setProperty('--sy', (50 + ny * 90) + '%');
    });
  } else {
    gsap.to(logoIn, { rotationY: 12, rotationX: -7, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const sh = { x: 20, y: 20 };
    gsap.to(sh, { x: 80, y: 70, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut', onUpdate: () => { sheen.style.setProperty('--sx', sh.x + '%'); sheen.style.setProperty('--sy', sh.y + '%'); } });
  }

  /* ---------- HERO → PORTAL (a logo se abre e revela o lugar) ---------- */
  const center = () => {
    const h = $('#inicio').getBoundingClientRect(), l = logo3d.getBoundingClientRect();
    return `50% ${((l.top - h.top + l.height / 2) / h.height * 100).toFixed(1)}%`;
  };
  const heroTL = gsap.timeline({
    scrollTrigger: {
      trigger: '#inicio', start: 'top top', end: '+=150%', scrub: 1, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
      onToggle: s => (s.isActive ? flies.start() : flies.stop())
    }
  });
  heroTL
    .to('#heroText', { y: -90, opacity: 0, ease: 'power1.in', duration: .3 }, 0)
    .to('#cue', { opacity: 0, duration: .1 }, 0)
    .to(logo3d, { scale: .42, ease: 'power2.inOut', duration: .55 }, .04)
    .to('#sunrays', { scale: 1.6, opacity: 0, duration: .6, ease: 'none' }, 0)
    .fromTo('#portalImg', { clipPath: () => `circle(0% at ${center()})` }, { clipPath: () => `circle(90% at ${center()})`, ease: 'power3.inOut', duration: .62 }, .3)
    .fromTo('#portalPic', { scale: 1.45 }, { scale: 1, ease: 'none', duration: .7 }, .3)
    .to(logo3d, { opacity: 0, duration: .12 }, .5)
    .fromTo(portalChars, { yPercent: 115 }, { yPercent: 0, stagger: .008, duration: .22, ease: 'power3.out' }, .72)
    .from('.portal-txt .eyebrow', { opacity: 0, y: 20, duration: .15 }, .7);

  /* ---------- letreiro reage à velocidade do scroll ---------- */
  const mq = gsap.to('#marquee', { xPercent: -50, repeat: -1, duration: 34, ease: 'none' });
  let dir = 1;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate(self) {
      const v = self.getVelocity();
      if (self.direction !== 0) dir = self.direction;
      gsap.to(mq, { timeScale: dir * (1 + Math.min(Math.abs(v) / 250, 7)), duration: .25, overwrite: true });
      gsap.to(mq, { timeScale: dir, duration: 1.2, delay: .25, overwrite: false });
    }
  });

  /* ---------- nav, progresso, dock ---------- */
  const nav = $('#nav'), dock = $('#dock'), prog = $('#progress');
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      prog.style.transform = `scaleX(${self.progress})`;
      nav.classList.toggle('solid', y > 40);
      nav.classList.toggle('away', self.direction === 1 && y > innerHeight * 1.2 && !document.body.classList.contains('menu-open'));
      dock.classList.toggle('show', y > innerHeight * .8);
    }
  });
  const navLinks = $$('.links a');
  ['cultos', 'ministerios', 'app', 'visite'].forEach(id => {
    ScrollTrigger.create({
      trigger: '#' + id, start: 'top 50%', end: 'bottom 50%',
      onToggle: s => s.isActive && navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + id))
    });
  });

  /* ---------- revelações ---------- */
  ScrollTrigger.batch('.rv', {
    start: 'top 90%',
    onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: 1.2, stagger: .09, ease: 'expo.out', overwrite: true })
  });

  /* ---------- caminhos: luz que segue o mouse + parallax ---------- */
  $$('.path').forEach(p => {
    p.addEventListener('pointermove', e => {
      const r = p.getBoundingClientRect();
      p.style.setProperty('--mx', e.clientX - r.left + 'px');
      p.style.setProperty('--my', e.clientY - r.top + 'px');
    });
    gsap.fromTo($('.path-media', p), { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: p, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* ---------- cards empilhados do restaurante ---------- */
  const cards = $$('.card');
  cards.forEach((card, i) => {
    const img = $('.card-media img', card);
    gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
    const next = cards[i + 1];
    if (!next) return;
    gsap.to(card, {
      scale: .9 + i * .015, '--dim': .45, ease: 'none',
      scrollTrigger: { trigger: next, start: 'top bottom', end: () => `top ${parseFloat(getComputedStyle(next).top) || 100}px`, scrub: true, invalidateOnRefresh: true }
    });
  });

  /* ---------- história: palavras acendem com o scroll ---------- */
  ScrollTrigger.create({
    trigger: story, start: 'top 82%', end: 'bottom 40%', scrub: true,
    onUpdate(self) {
      const lit = Math.round(self.progress * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < lit));
    }
  });
  $$('.count').forEach(el => {
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 85%', once: true,
      onEnter: () => gsap.to(o, { v: +el.dataset.to, duration: 1.8, ease: 'power3.out', onUpdate: () => (el.textContent = Math.round(o.v)) })
    });
    el.textContent = '0';
  });

  /* ---------- natureza: galeria horizontal (desktop) ---------- */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    html.classList.add('fx-desk');
    const track = $('#hzIn'), bar = $('#hzBar');
    const dist = () => track.scrollWidth - innerWidth;
    const proxy = { skew: 0 }, skewSet = gsap.quickSetter('.ph', 'skewX', 'deg');
    const tw = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: '#hz', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate(self) {
          bar.style.transform = `scaleX(${self.progress})`;
          const sk = clamp(self.getVelocity() / -350, -9, 9);
          if (Math.abs(sk) > Math.abs(proxy.skew)) {
            proxy.skew = sk;
            gsap.to(proxy, { skew: 0, duration: .9, ease: 'power3', overwrite: true, onUpdate: () => skewSet(proxy.skew) });
          }
        }
      }
    });
    $$('.ph img').forEach(img => gsap.fromTo(img, { xPercent: -7 }, {
      xPercent: 7, ease: 'none',
      scrollTrigger: { trigger: img.parentElement, containerAnimation: tw, start: 'left right', end: 'right left', scrub: true }
    }));
    // profundidade na colagem do chalé
    $$('#collage [data-depth]').forEach(el => {
      const d = parseFloat(el.dataset.depth);
      gsap.fromTo(el, { y: -d * 260 }, { y: d * 260, ease: 'none', scrollTrigger: { trigger: '#collage', start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    return () => { html.classList.remove('fx-desk'); gsap.set('.ph', { skewX: 0 }); };
  });

  /* ---------- do dia para a noite: chegando ao chalé ---------- */
  const collage = $('#collage');
  const skyTL = gsap.timeline({
    scrollTrigger: {
      trigger: '#app', start: 'top bottom', end: 'top 10%', scrub: 1,
      onEnter: () => stars.start(), onLeave: () => stars.stop(), onEnterBack: () => stars.start(), onLeaveBack: () => stars.stop()
    }
  });
  skyTL
    .to('#skyDusk', { opacity: 1, ease: 'none', duration: .45 }, 0)
    .to('#sun', { yPercent: 420, scale: 1.3, ease: 'power1.in', duration: .55 }, 0)
    .to('#sun', { opacity: 0, duration: .15 }, .42)
    .to('#skyNight', { opacity: 1, ease: 'none', duration: .5 }, .42)
    .to('#skyDusk', { opacity: 0, ease: 'none', duration: .3 }, .7)
    .fromTo('#moon', { yPercent: 160, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'power2.out', duration: .5 }, .5)
    .to('#stars', { opacity: 1, ease: 'none', duration: .45 }, .55)
    .fromTo(collage, { '--lights': 0, '--dark': 0 }, { '--lights': 1, '--dark': 1, ease: 'none', duration: .4 }, .6);

  /* ---------- cursor personalizado ---------- */
  if (fine) {
    html.classList.add('has-cursor');
    const cur = $('#cursor'), dot = $('#cursorDot'), txt = $('#cursorTxt');
    const cx = gsap.quickTo(cur, 'x', { duration: .45, ease: 'power3' }), cy = gsap.quickTo(cur, 'y', { duration: .45, ease: 'power3' });
    const dx = gsap.quickTo(dot, 'x', { duration: .08 }), dy = gsap.quickTo(dot, 'y', { duration: .08 });
    addEventListener('pointermove', e => { cx(e.clientX); cy(e.clientY); dx(e.clientX); dy(e.clientY); });
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor]');
      if (t) { txt.textContent = t.dataset.cursor; cur.classList.add('big'); cur.classList.toggle('bnb', t.hasAttribute('data-cursor-bnb')); dot.style.opacity = 0; }
    });
    document.addEventListener('pointerout', e => {
      const t = e.target.closest('[data-cursor]');
      if (t && !t.contains(e.relatedTarget)) { cur.classList.remove('big', 'bnb'); dot.style.opacity = 1; }
    });
    document.addEventListener('pointerleave', () => cur.classList.add('hide'));
    document.addEventListener('pointerenter', () => cur.classList.remove('hide'));

    /* botões magnéticos */
    $$('.magnetic').forEach(el => {
      const mx = gsap.quickTo(el, 'x', { duration: .6, ease: 'power3' }), my = gsap.quickTo(el, 'y', { duration: .6, ease: 'power3' });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * .3); my((e.clientY - r.top - r.height / 2) * .4);
      });
      el.addEventListener('pointerleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1,.35)', overwrite: true });
      });
    });
  }

  /* ---------- atualizações ---------- */
  // recalcula na ordem da página (os pins de cima empurram os gatilhos de baixo)
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
  addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
