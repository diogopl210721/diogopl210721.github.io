/* ============================================================
   Catedral Pão da Vida — layout próprio
   A lógica é a mesma do app (app.js); aqui a estrutura das
   telas principais é reorganizada por intenção:
   Hoje · Agenda · Servir · Bíblia · Eu
   A logo da igreja é sempre usada como arquivo original.
   ============================================================ */
(function () {
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LOGO = "assets/logo-branca.png";
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ic = (id, cls = "") => `<svg class="icon ${cls}"><use href="#${id}"/></svg>`;
  const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const DIAS_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const DIAS_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const membro = () => (typeof state !== "undefined" && state.membro) || null;


  /* Ícones próprios em dois tons: uma forma preenchida suave (.d) + traço */
  const ICONES = {
    "c-hoje": '<path class="d" d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M3 11 12 3.5 21 11"/><path d="M5.5 9.6V19a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 18.5 19V9.6"/><path d="M10 20.5v-5a2 2 0 0 1 4 0v5"/>',
    "c-agenda": '<rect class="d" x="3.5" y="5" width="17" height="15.5" rx="3.5"/><rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle class="p" cx="8.5" cy="14.5" r="1.3"/><circle class="p" cx="12" cy="14.5" r="1.3"/><circle class="p" cx="15.5" cy="14.5" r="1.3"/>',
    "c-servir": '<path class="d" d="M12 20.5s-7.5-4.6-9-9.4C1.9 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.4 3.1 4.3 6.6-1.5 4.8-9 9.4-9 9.4z"/><path d="M12 20.5s-7.5-4.6-9-9.4C1.9 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.4 3.1 4.3 6.6-1.5 4.8-9 9.4-9 9.4z"/><path d="M7.5 11.5h2.2l1.3-2.5 2 5 1.3-2.5h2.2"/>',
    "c-biblia": '<path class="d" d="M5.5 4.5A1.5 1.5 0 0 1 7 3h11.5v15H7a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M5.5 19.5V4.5A1.5 1.5 0 0 1 7 3h11.5v15H7a1.5 1.5 0 0 0 0 3h11.5"/><path d="M12 6.5v7M9.5 9h5"/>',
    "c-eu": '<circle class="d" cx="12" cy="8.5" r="4.5"/><circle cx="12" cy="8.5" r="4.5"/><path class="d" d="M4 20.5c.8-4 4-6 8-6s7.2 2 8 6z"/><path d="M4 20.5c.8-4 4-6 8-6s7.2 2 8 6"/>',
    "c-entrar": '<path class="d" d="M13 3.5h4.5A2.5 2.5 0 0 1 20 6v12a2.5 2.5 0 0 1-2.5 2.5H13z"/><path d="M13 3.5h4.5A2.5 2.5 0 0 1 20 6v12a2.5 2.5 0 0 1-2.5 2.5H13"/><path d="M3.5 12H14M10.5 8.5 14 12l-3.5 3.5"/>',
    "c-diario": '<rect class="d" x="5" y="3" width="14" height="18" rx="3"/><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 3v18"/><path class="p" d="M14 9.2c-.9-1.1-2.6-.6-2.6.8 0 1.4 2.6 3 2.6 3s2.6-1.6 2.6-3c0-1.4-1.7-1.9-2.6-.8z"/>',
    "c-eventos": '<path class="d" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v1.8a2.7 2.7 0 0 0 0 5.4v1.8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-1.8a2.7 2.7 0 0 0 0-5.4z"/><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v1.8a2.7 2.7 0 0 0 0 5.4v1.8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-1.8a2.7 2.7 0 0 0 0-5.4z"/><path d="M14 5v2M14 11v2M14 17v2"/>',
    "c-chat": '<path class="d" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
    "c-fotos": '<rect class="d" x="3" y="5" width="18" height="15" rx="3"/><rect x="3" y="5" width="18" height="15" rx="3"/><circle class="p" cx="8.5" cy="10" r="1.6"/><path d="M3.5 17.5 9 12.5l3.5 3 2.5-2 5.5 4.5"/>',
    "c-grupos": '<circle class="d" cx="9" cy="8.5" r="3.5"/><circle cx="9" cy="8.5" r="3.5"/><path class="d" d="M2.5 19.5c.6-3.3 3.2-5 6.5-5s5.9 1.7 6.5 5z"/><path d="M2.5 19.5c.6-3.3 3.2-5 6.5-5s5.9 1.7 6.5 5"/><path d="M15.5 5.3a3.2 3.2 0 0 1 0 6.4M17.5 14.8c2.2.5 3.6 2 4 4.7"/>',
    "c-tudo": '<rect class="d" x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect class="d" x="13.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/>',
    "c-avisos": '<path class="d" d="M4 9.5v5h3l8 4.5V5L7 9.5z"/><path d="M4 9.5v5h3l8 4.5V5L7 9.5z"/><path d="M7 14.5 8.5 20h2.5"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10"/>',
    "c-livros": '<rect class="d" x="3.5" y="4" width="5" height="16" rx="1.4"/><rect x="3.5" y="4" width="5" height="16" rx="1.4"/><rect x="10" y="6.5" width="5" height="13.5" rx="1.4"/><path class="d" d="m16.6 8.4 3.6-1 2.8 11.6-3.6 1z"/><path d="m16.6 8.4 3.6-1 2.8 11.6-3.6 1zM3.5 8h5M10 10h5"/>',
    "c-aovivo": '<rect class="d" x="3" y="6" width="13" height="12" rx="3"/><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10.5 5-3v9l-5-3"/><circle class="p" cx="7.5" cy="10" r="1.3"/>',
    "c-musica": '<path class="d" d="M9 17.5a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 15.5a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"/><path d="M9 17.5V6l11-2.5v12"/><circle cx="6" cy="17.5" r="3"/><circle cx="17" cy="15.5" r="3"/><path d="M9 9.5l11-2.5"/>',
    "c-calice": '<path class="d" d="M6 3.5h12c0 5-2.5 8-6 8s-6-3-6-8z"/><path d="M6 3.5h12c0 5-2.5 8-6 8s-6-3-6-8zM12 11.5v6M8 20.5h8M9.5 17.5h5"/>',
    "c-coroa": '<path class="d" d="M3.5 8 7.5 12l4.5-7 4.5 7 4-4-1.5 10.5h-14z"/><path d="M3.5 8 7.5 12l4.5-7 4.5 7 4-4-1.5 10.5h-14zM5 21h14"/>',
    "c-crianca": '<circle class="d" cx="12" cy="7" r="3.5"/><circle cx="12" cy="7" r="3.5"/><path class="d" d="M7 21v-4.5a5 5 0 0 1 10 0V21z"/><path d="M7 21v-4.5a5 5 0 0 1 10 0V21M4 12.5l3 2M20 12.5l-3 2"/>',
    "c-pin": '<path class="d" d="M12 21s-7-6-7-11.5a7 7 0 0 1 14 0C19 15 12 21 12 21z"/><path d="M12 21s-7-6-7-11.5a7 7 0 0 1 14 0C19 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    "c-convidar": '<circle class="d" cx="9.5" cy="8" r="3.5"/><circle cx="9.5" cy="8" r="3.5"/><path d="M3 20c.6-3.4 3.2-5.5 6.5-5.5 1.6 0 3 .4 4.1 1.2M18.5 13v7M15 16.5h7"/>',
    "c-waze": '<path class="d" d="M5 13.5a7 7 0 1 1 13.5 2.6c-.6 1.6-2.4 2.9-4.5 2.9H11c-1.4 1.3-3 1.6-4.2 1.1.8-.7 1.1-1.5 1-2.4A7 7 0 0 1 5 13.5z"/><path d="M5 13.5a7 7 0 1 1 13.5 2.6c-.6 1.6-2.4 2.9-4.5 2.9H11c-1.4 1.3-3 1.6-4.2 1.1.8-.7 1.1-1.5 1-2.4A7 7 0 0 1 5 13.5z"/><circle class="p" cx="10" cy="11.5" r="1"/><circle class="p" cx="14.5" cy="11.5" r="1"/><path d="M10 14.5c1.2 1 3.3 1 4.5 0"/>',
    "c-relogio": '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  };
  function injetarIcones() {
    if (document.getElementById("cpv-icones")) return;
    const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sv.id = "cpv-icones"; sv.setAttribute("width", "0"); sv.setAttribute("height", "0"); sv.style.position = "absolute";
    sv.innerHTML = Object.entries(ICONES).map(([id, p]) => `<symbol id="${id}" viewBox="0 0 24 24">${p}</symbol>`).join("");
    document.body.prepend(sv);
  }
  const ci = (id, cls = "") => `<svg class="ci ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;


  /* Fundo líquido (WebGL) nos tons da Catedral: noite, trigo e brasa */
  function auroraQuente(cv) {
    const gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) { cv.style.background = "radial-gradient(80% 70% at 50% 35%,#3b2a17,#14110E)"; return { play() {}, stop() {} }; }
    const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const fs = `precision mediump float;uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 p=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);float tt=t*.12;
vec2 q=vec2(fbm(p*1.5+tt),fbm(p*1.5+vec2(5.2,1.3)-tt));
vec2 w=vec2(fbm(p*1.5+2.*q+vec2(1.7,9.2)+tt*1.3),fbm(p*1.5+2.*q+vec2(8.3,2.8)-tt));
float v=fbm(p*1.3+2.4*w);
vec3 B=vec3(.06,.045,.035),c1=vec3(.36,.2,.07),c2=vec3(.98,.78,.4),c3=vec3(.55,.22,.1);
vec3 col=mix(B,c1,smoothstep(.3,.85,v));
col=mix(col,c3,smoothstep(.5,.95,length(w))*.45);
col+=c2*pow(smoothstep(.55,.95,v+.15*sin(tt*3.+p.x*3.)),3.)*.5;
col*=1.-.6*length(p*.7);
gl_FragColor=vec4(col,1.);}`;
    const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(pr, "r"), ut = gl.getUniformLocation(pr, "t");
    let on = false, raf = 0; const t0 = performance.now();
    const size = () => { cv.width = Math.max(2, cv.clientWidth * .5 | 0); cv.height = Math.max(2, cv.clientHeight * .5 | 0); gl.viewport(0, 0, cv.width, cv.height); };
    const draw = () => { if (!on) return; gl.uniform2f(ur, cv.width, cv.height); gl.uniform1f(ut, (performance.now() - t0) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); raf = requestAnimationFrame(draw); };
    addEventListener("resize", () => { if (on) size(); });
    return { play() { if (!on) { on = true; size(); draw(); } }, stop() { on = false; cancelAnimationFrame(raf); } };
  }
  /* Partículas douradas subindo (aceleram ao deslizar) */
  function particulas(cv) {
    const cx = cv.getContext("2d"); let W = 0, H = 0, vivo = true, impulso = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dim = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    dim(); addEventListener("resize", dim);
    const pts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 2.2, v: .02 + Math.random() * .06, d: Math.random() * 6.28, z: .3 + Math.random() }));
    (function quadro() {
      if (!vivo) return;
      cx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        p.y -= p.v * .004 * (1 + impulso * 10) * p.z; p.d += .012;
        if (p.y < -.05) { p.y = 1.05; p.x = Math.random(); }
        const x = (p.x + Math.sin(p.d) * .015) * W, y = p.y * H, a = .25 + .55 * p.z;
        const g = cx.createRadialGradient(x, y, 0, x, y, p.r * 4);
        g.addColorStop(0, `rgba(241,207,134,${a})`); g.addColorStop(1, "rgba(217,164,65,0)");
        cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, p.r * 4, 0, 6.29); cx.fill();
      });
      requestAnimationFrame(quadro);
    })();
    return { impulso(v) { impulso = v; }, parar() { vivo = false; } };
  }

  /* ============ 1) Abertura: a logo original, revelada pela luz ============ */
  function abertura() {
    const antigo = document.getElementById("intro-overlay");
    if (antigo) antigo.remove();
    let jaViu = false;
    try { jaViu = sessionStorage.getItem("cpv_intro") === "1"; } catch (e) {}
    if (jaViu || reduz) return;

    const ov = document.createElement("div");
    ov.id = "cpv-intro";
    ov.innerHTML = `
      <canvas class="cpv-aurora"></canvas>
      <canvas class="cpv-particulas"></canvas>
      <div class="cpv-aneis"><i></i><i></i><i></i></div>
      <div class="cpv-grao"></div>
      <div class="cpv-logo-palco"><img class="cpv-logo" src="${LOGO}" alt="Catedral Pão da Vida — Pr. Ismair e Pra. Débora"><span class="cpv-varredura"></span></div>
      <div class="cpv-quatro" aria-hidden="true"><i style="--c:var(--s-cruz)"></i><i style="--c:var(--s-pomba)"></i><i style="--c:var(--s-calice)"></i><i style="--c:var(--s-coroa)"></i></div>
      <button class="cpv-abrir" type="button"><span class="cpv-seta"></span><b>Deslize para entrar</b></button>
      <a class="cpv-copy" href="https://ddsinovacao.com.br" target="_blank" rel="noopener">© 2026 · DDS Inovação</a>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add("cpv-abrindo");

    const fundo = auroraQuente($(".cpv-aurora", ov)); fundo.play();
    const pts = particulas($(".cpv-particulas", ov));
    // a logo inclina levemente com o dedo/mouse
    const palco = $(".cpv-logo-palco", ov);
    const inclina = (x, y) => { palco.style.setProperty("--ry", ((x / innerWidth - .5) * 14).toFixed(2) + "deg"); palco.style.setProperty("--rx", (-(y / innerHeight - .5) * 14).toFixed(2) + "deg"); };
    ov.addEventListener("pointermove", e => inclina(e.clientX, e.clientY));
    const g = window.gsap;
    let tl = null;
    if (g) {
      tl = g.timeline({ defaults: { ease: "power3.out" } });
      g.set(".cpv-logo", { "--rev": "0%", scale: 1.06 });
      g.set(".cpv-quatro i", { scaleX: 0 });
      g.set(".cpv-abrir, .cpv-copy", { opacity: 0, y: 14 });
      tl.to(".cpv-logo", { "--rev": "100%", duration: 1.6, ease: "power2.inOut" }, .2)
        .to(".cpv-logo", { scale: 1, duration: 2.2, ease: "power2.out" }, .2)
        .fromTo(".cpv-varredura", { xPercent: -120, opacity: 1 }, { xPercent: 120, duration: 1.4, ease: "power2.inOut" }, 1.5)
        .to(".cpv-quatro i", { scaleX: 1, duration: .5, stagger: .14, ease: "expo.out" }, 1.7)
        .to(".cpv-abrir, .cpv-copy", { opacity: 1, y: 0, duration: .6, stagger: .1 }, 2.4);
    } else {
      ov.classList.add("sem-gsap");
    }

    let saindo = false;
    function entrar() {
      if (saindo) return;
      saindo = true;
      pts.impulso(1);
      setTimeout(() => { fundo.stop(); pts.parar(); }, 1200);
      try { sessionStorage.setItem("cpv_intro", "1"); } catch (e) {}
      if (tl) tl.progress(1);
      document.documentElement.classList.remove("cpv-abrindo");
      const alvo = $("#appbar-logo"), fonte = $(".cpv-logo", ov);
      if (g && alvo && fonte && alvo.getBoundingClientRect().width) {
        // a logo viaja até a barra superior
        const a = alvo.getBoundingClientRect(), f = fonte.getBoundingClientRect();
        g.to(".cpv-abrir, .cpv-copy, .cpv-quatro", { opacity: 0, duration: .25 });
        g.to(fonte, { x: (a.left + a.width / 2) - (f.left + f.width / 2), y: (a.top + a.height / 2) - (f.top + f.height / 2), scale: a.width / f.width, duration: .85, ease: "expo.inOut" });
        g.to(ov, { backgroundColor: "rgba(20,17,14,0)", duration: .6, delay: .3 });
        g.fromTo(alvo, { opacity: 0 }, { opacity: 1, duration: .2, delay: .8, onComplete: () => ov.remove() });
      } else {
        ov.style.transition = "opacity .5s"; ov.style.opacity = "0"; setTimeout(() => ov.remove(), 520);
      }
    }
    let y0 = null;
    ov.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
    ov.addEventListener("touchmove", e => { if (y0 === null) return; const dy = y0 - e.touches[0].clientY; pts.impulso(Math.max(0, Math.min(1, dy / 120))); inclina(e.touches[0].clientX, e.touches[0].clientY); if (dy > 50) entrar(); }, { passive: true });
    ov.addEventListener("wheel", e => { if (e.deltaY > 20) entrar(); }, { passive: true });
    $(".cpv-abrir", ov).addEventListener("click", entrar);
  }

  /* Navegar reaproveitando os atalhos originais (eles carregam os dados de cada tela) */
  function irPara(tela) {
    const orig = $$(`[data-nav="${tela}"]`).find(el => !el.closest("#cpv-abas, #cpv-hoje, #cpv-bemvindo, #tela-cpv-servir"));
    if (orig && tela !== "tela-membro-home" && tela !== "tela-visitante") orig.click();
    else if (document.getElementById(tela)) window.mostrarTela(tela);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("#cpv-hoje [data-nav], #cpv-bemvindo [data-nav], #tela-cpv-servir [data-nav]");
    if (b) { e.preventDefault(); irPara(b.dataset.nav); }
  });

  /* ============ 2) Barra de abas única ============ */
  const ABAS_MEMBRO = [
    { id: "hoje", rot: "Hoje", ic: "c-hoje", tela: "tela-membro-home" },
    { id: "agenda", rot: "Agenda", ic: "c-agenda", tela: "tela-calendario" },
    { id: "servir", rot: "Servir", ic: "c-servir", tela: "tela-cpv-servir" },
    { id: "biblia", rot: "Bíblia", ic: "c-biblia", tela: "tela-biblia" },
    { id: "eu", rot: "Eu", ic: "c-eu", acao: () => $("#btn-meu-perfil")?.click() },
  ];
  const ABAS_VISITANTE = [
    { id: "inicio", rot: "Início", ic: "c-hoje", tela: "tela-visitante" },
    { id: "agenda", rot: "Agenda", ic: "c-agenda", tela: "tela-calendario" },
    { id: "biblia", rot: "Bíblia", ic: "c-biblia", tela: "tela-biblia" },
    { id: "entrar", rot: "Entrar", ic: "c-entrar", tela: "tela-login" },
  ];
  const TELA_ABA = { "tela-membro-home": "hoje", "tela-visitante": "inicio", "tela-calendario": "agenda", "tela-cpv-servir": "servir", "tela-membro-louvor": "servir", "tela-cpv-diaconato": "servir", "tela-cpv-diac-editor": "servir", "tela-cpv-reunioes": "servir", "tela-cpv-reuniao-form": "servir", "tela-biblia": "biblia", "tela-editar-perfil": "eu", "tela-login": "entrar", "tela-cadastro": "entrar" };

  function abas() {
    let bar = $("#cpv-abas");
    if (!bar) { bar = document.createElement("nav"); bar.id = "cpv-abas"; bar.setAttribute("aria-label", "Navegação principal"); document.body.appendChild(bar); }
    const lista = membro() ? ABAS_MEMBRO : ABAS_VISITANTE;
    bar.innerHTML = `<i class="cpv-abas-luz"></i>` + lista.map(a => `<button type="button" data-aba="${a.id}">${ci(a.ic)}<span>${a.rot}</span></button>`).join("");
    $$("button", bar).forEach((b, i) => b.addEventListener("click", () => {
      const a = lista[i];
      if (a.acao) a.acao(); else irPara(a.tela);
      marcarAba(a.id);
    }));
    marcarAba(TELA_ABA[$(".screen.active")?.id]);
  }
  function marcarAba(id) {
    const bar = $("#cpv-abas"); if (!bar) return;
    let alvo = null;
    $$("button", bar).forEach(b => { const on = b.dataset.aba === id; b.classList.toggle("on", on); if (on) alvo = b; });
    const luz = $(".cpv-abas-luz", bar);
    if (luz) { if (alvo) { luz.style.opacity = 1; luz.style.transform = `translateX(${alvo.offsetLeft}px)`; luz.style.width = alvo.offsetWidth + "px"; } else luz.style.opacity = 0; }
  }
  function ligarNavegacao() {
    if (typeof window.mostrarTela !== "function" || window.mostrarTela.cpv) return;
    const original = window.mostrarTela;
    const nova = function (id) {
      const r = original.apply(this, arguments);
      document.documentElement.dataset.tela = id;
      marcarAba(TELA_ABA[id]);
      if (id === "tela-membro-home") { abas(); montarHoje(); }
      if (id === "tela-visitante") { abas(); montarVisitante(); }
      return r;
    };
    nova.cpv = true;
    window.mostrarTela = nova;
  }

  /* ============ 3) Próximo culto com contagem regressiva ============ */
  let cultosCache = null;
  async function cultos() {
    if (cultosCache) return cultosCache;
    if (typeof sb === "undefined" || !state.igreja) return [];
    const { data } = await sb.from("igr_cultos").select("*").eq("igreja_id", state.igreja.id).order("ordem");
    cultosCache = data || [];
    return cultosCache;
  }
  function quando(c, dataISO) {
    const [h, m] = String(c.horario || "00:00").split(":").map(Number);
    const d = new Date(dataISO + "T00:00:00"); d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }
  function falta(alvo) {
    const ms = alvo - new Date();
    if (ms <= 0 && ms > -2 * 3600e3) return "Acontecendo agora";
    if (ms <= 0) return "";
    const min = Math.round(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
    if (d >= 2) return `Em ${d} dias`;
    if (h >= 18) return "Amanhã";
    if (h >= 1) return `Começa em ${h}h${String(min % 60).padStart(2, "0")}`;
    return `Começa em ${min} min`;
  }
  async function proximo() {
    const lista = await cultos();
    const p = typeof calcularProximoCulto === "function" ? calcularProximoCulto(lista) : null;
    if (!p) return null;
    const tema = typeof temaDoDomingo === "function" && p.culto.dia_semana === "domingo" && !p.culto.data ? temaDoDomingo(p.data) : null;
    return { ...p, alvo: quando(p.culto, p.data), tema };
  }
  function cardAgora(p) {
    if (!p) return `<div class="cpv-agora vazio"><p>Nenhum culto cadastrado ainda.</p></div>`;
    const c = p.culto, d = new Date(p.data + "T00:00:00");
    const dia = p.data === hojeISO() ? "Hoje" : `${DIAS_LONGO[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
    return `
      <article class="cpv-agora" ${c.imagem_url ? `style="--foto:url('${esc(c.imagem_url)}')"` : ""}>
        <div class="cpv-agora-topo"><span class="cpv-pulso"></span><b data-falta>${esc(falta(p.alvo))}</b></div>
        <h2>${esc(c.titulo)}</h2>
        ${p.tema ? `<p class="cpv-agora-tema">${p.tema.n}º domingo do mês: ${esc(p.tema.tema)}</p>` : ""}
        <p class="cpv-agora-info">${ci("c-relogio")} ${dia} às ${esc(String(c.horario || "").slice(0, 5))}${c.local ? ` · ${esc(c.local)}` : ""}</p>
        <div class="cpv-agora-acoes">
          <a class="cpv-btn claro" href="${window.MAPS_URL}" target="_blank" rel="noopener">${ci("c-pin")} Maps</a>
          <a class="cpv-btn vidro" href="${window.WAZE_URL}" target="_blank" rel="noopener">${ci("c-waze")} Waze</a>
          <button class="cpv-btn vidro" type="button" data-cpv-share>${ci("c-convidar")} Convidar</button>
        </div>
      </article>`;
  }
  function ligarAgora(raiz, p) {
    $("[data-cpv-share]", raiz)?.addEventListener("click", () => p && typeof compartilharCulto === "function" && compartilharCulto(p.culto));
    const alvo = $("[data-falta]", raiz);
    if (alvo && p) { clearInterval(alvo._t); alvo._t = setInterval(() => { alvo.textContent = falta(p.alvo); }, 30000); }
  }

  /* ============ 4) Hoje (membro) ============ */
  const PASSOS = [
    { id: "palavra", tit: "Ler a palavra do dia", sub: "Um versículo, menos de 1 minuto" },
    { id: "humor", tit: "Contar como você está", sub: "Seus líderes oram por você" },
    { id: "devo", tit: "Abrir sua palavra pessoal", sub: "Uma mensagem preparada pra hoje" },
  ];
  function feitos() { try { return JSON.parse(localStorage.getItem("cpv_dia_" + hojeISO()) || "{}"); } catch (e) { return {}; } }
  function marcar(id) { const f = feitos(); f[id] = 1; try { localStorage.setItem("cpv_dia_" + hojeISO(), JSON.stringify(f)); } catch (e) {} pintarDia(); }
  function pintarDia() {
    const box = $("#cpv-dia"); if (!box) return;
    const f = feitos();
    if ($(".pal-card.feito")) f.devo = 1;
    const n = PASSOS.filter(p => f[p.id]).length;
    $$(".cpv-passo", box).forEach(el => el.classList.toggle("feito", !!f[el.dataset.passo]));
    box.style.setProperty("--prog", n / PASSOS.length);
    $(".cpv-dia-n", box).textContent = n === PASSOS.length ? "Tudo feito hoje. Deus abençoe seu dia!" : `${n} de ${PASSOS.length} passos`;
  }
  function destacar(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "center" });
    el.classList.add("cpv-destaque"); setTimeout(() => el.classList.remove("cpv-destaque"), 1600);
  }
  function acaoPasso(id) {
    if (id === "palavra") { const el = $("#palavra-dia"); if (el && !el.hidden) destacar(el); else window.mostrarTela("tela-biblia"); marcar("palavra"); }
    if (id === "humor") abrirHumor();
    if (id === "devo") { ($("#palavra-card") || $("#btn-ler-devocional"))?.click(); marcar("devo"); }
  }
  const HICON = {
    grato: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    esperancoso: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 6V4M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4"/>',
    em_paz: '<path d="M5 19c0-8 6-13 14-14-1 8-6 14-14 14Z"/><path d="M5 19 13 11"/>',
    fortalecido: '<path d="M12 21c-3.9 0-6-2.7-6-6 0-4 3-5.5 3-9 2 1 3.5 3 3.5 5 1-.6 1.6-1.6 1.8-2.8C16.4 9.6 18 12 18 15c0 3.3-2.1 6-6 6Z"/>',
    cansado: '<rect x="3" y="8" width="16" height="9" rx="2.5"/><path d="M21 11v3M6.5 11v3"/>',
    ansioso: '<path d="M7 15a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.5 9 3 3 0 0 1 18 15H7Z"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/>'
  };
  const HUMORES = [["grato", "Grato"], ["esperancoso", "Esperançoso"], ["em_paz", "Em paz"], ["fortalecido", "Fortalecido"], ["cansado", "Cansado"], ["ansioso", "Ansioso"]];
  function abrirHumor() {
    const li = $('#cpv-dia .cpv-passo[data-passo="humor"]')?.closest("li");
    if (!li) return;
    const aberto = $("#cpv-humor");
    if (aberto) { aberto.remove(); return; }
    const box = document.createElement("div");
    box.id = "cpv-humor"; box.className = "cpv-humor";
    box.innerHTML = `<p>Como você está hoje?</p><div class="cpv-humor-op">${HUMORES.map(([v, t]) => `<button type="button" data-h="${v}"><svg viewBox="0 0 24 24" aria-hidden="true">${HICON[v]}</svg>${t}</button>`).join("")}</div>`;
    li.after(box);
    $$("button", box).forEach(b => b.addEventListener("click", async () => {
      $$("button", box).forEach(x => { x.disabled = true; x.classList.toggle("on", x === b); });
      try {
        const m = membro();
        if (m && typeof sb !== "undefined") {
          const { error } = await sb.from("igr_checkins_diarios").upsert({ membro_id: m.id, humor: b.dataset.h, data: hojeISO() }, { onConflict: "membro_id,data" });
          if (error) throw error;
          if (typeof darPontos === "function") darPontos("checkin_humor");
        }
        marcar("humor");
        const cx = $("#checkin-diario-box"); if (cx) cx.style.display = "none";
        box.innerHTML = `<p class="cpv-humor-ok">Obrigado por contar. Seus líderes estão orando por você.</p>`;
        setTimeout(() => box.remove(), 2200);
      } catch (e) {
        $$("button", box).forEach(x => { x.disabled = false; x.classList.remove("on"); });
        box.querySelector("p").textContent = "Não deu para salvar agora. Confira a internet e toque de novo.";
      }
    }));
  }
  async function humorJaFeito() {
    const m = membro();
    if (!m || typeof sb === "undefined" || feitos().humor) return;
    try {
      const { data } = await sb.from("igr_checkins_diarios").select("humor").eq("membro_id", m.id).eq("data", hojeISO()).maybeSingle();
      if (data) marcar("humor");
    } catch (e) {}
  }
  async function montarHoje() {
    const tela = $("#tela-membro-home"), sc = tela && $(".scroll", tela);
    if (!sc) return;
    tela.classList.add("cpv-layout");
    let topo = $("#cpv-hoje", sc);
    if (!topo) {
      topo = document.createElement("section");
      topo.id = "cpv-hoje";
      sc.prepend(topo);
      const d = new Date();
      const nome = (membro()?.nome_completo || "").trim().split(/\s+/)[0] || "";
      const hh = d.getHours(), sd = hh < 5 ? "Boa madrugada" : hh < 12 ? "Bom dia" : hh < 18 ? "Boa tarde" : "Boa noite";
      topo.innerHTML = `
        <header class="cpv-saudacao">
          <p>${DIAS_LONGO[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}</p>
          <h1>${sd}${nome ? `, ${esc(nome)}` : ""}</h1>
        </header>
        <div id="cpv-agora-box"></div>
        <section class="cpv-dia" id="cpv-dia">
          <div class="cpv-dia-cab">
            <div class="cpv-anel" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/><circle class="v" cx="18" cy="18" r="15.5"/></svg></div>
            <div><h2>Seu dia com Deus</h2><p class="cpv-dia-n">0 de 3 passos</p></div>
          </div>
          <ol class="cpv-passos">
            ${PASSOS.map(p => `<li><button type="button" class="cpv-passo" data-passo="${p.id}"><span class="cpv-check">${ic("k-check")}</span><span class="cpv-passo-tx"><b>${p.tit}</b><small>${p.sub}</small></span>${ic("k-chevron", "cpv-seta-dir")}</button></li>`).join("")}
          </ol>
        </section>
        <nav class="cpv-atalhos" aria-label="Atalhos">
          ${[["Diário", "c-diario", "tela-diario"], ["Eventos", "c-eventos", "tela-eventos"], ["Chat", "c-chat", "tela-mensagens"], ["Ofertar", "c-oferta", "@tela-cpv-ofertas"], ["Grupos", "c-grupos", "tela-grupos-lista"], ["Tudo", "c-tudo", null]]
            .map(([r, i, t]) => `<button type="button" ${!t ? "data-abrir-explorar" : t.startsWith("@") ? `data-cpv-ir="${t.slice(1)}"` : `data-nav="${t}"`}><span class="cpv-tile">${ci(i)}</span><span>${r}</span></button>`).join("")}
        </nav>`;
      $$(".cpv-passo", topo).forEach(b => b.addEventListener("click", () => acaoPasso(b.dataset.passo)));
      humorJaFeito();
      $$("#checkin-diario-box .reacao-btn").forEach(b => b.addEventListener("click", () => marcar("humor")));
      // blocos que já existem, na ordem de prioridade
      let ref = topo;
      [$("#palavra-dia"), $("#checkin-diario-box"), $("#aniv-hoje"), $("#home-avisos-label"), $("#home-avisos")].filter(Boolean).forEach(el => { ref.after(el); ref = el; });
    }
    const pal = $("#palavra-card"); if (pal && pal.previousElementSibling?.id !== "cpv-dia") $("#cpv-dia", topo).after(pal);
    const p = await proximo();
    const box = $("#cpv-agora-box", topo);
    box.innerHTML = cardAgora(p);
    ligarAgora(box, p);
    pintarDia();
    if (window.gsap && !reduz && !topo.dataset.animou) {
      topo.dataset.animou = "1";
      window.gsap.from($$(".cpv-saudacao > *, .cpv-agora, .cpv-dia, .cpv-atalhos", topo), { y: 18, opacity: 0, duration: .7, stagger: .08, ease: "power3.out", clearProps: "transform,opacity" });
    }
  }

  /* ============ 5) Visitante: guia em 3 passos ============ */
  async function montarVisitante() {
    const tela = $("#tela-visitante"), sc = tela && $(".scroll", tela);
    if (!sc) return;
    tela.classList.add("cpv-layout");
    let topo = $("#cpv-bemvindo", sc);
    if (!topo) {
      topo = document.createElement("section");
      topo.id = "cpv-bemvindo";
      sc.prepend(topo);
      topo.innerHTML = `
        <header class="cpv-marca">
          <img src="${LOGO}" alt="Catedral Pão da Vida — Pr. Ismair e Pra. Débora">
          <div><h1>Seja bem-vindo</h1><p>Igreja do Evangelho Quadrangular em Balneário Ipanema, Pontal do Paraná.</p></div>
        </header>
        <ol class="cpv-guia">
          <li class="cpv-g">
            <span class="cpv-g-n">1</span>
            <div class="cpv-g-c"><h2>Venha a um culto</h2><p>Toque no dia que fica melhor pra você.</p>
              <div class="cpv-semana" id="cpv-semana" role="group" aria-label="Dias da semana"></div>
              <div id="cpv-agora-vis"></div>
            </div>
          </li>
          <li class="cpv-g">
            <span class="cpv-g-n">2</span>
            <div class="cpv-g-c"><h2>Conheça a igreja</h2><p>Quem somos, os pastores, os ministérios e onde ficamos.</p>
              <button type="button" class="cpv-btn linha" data-nav="tela-sobre-igreja">Ver a página da igreja</button></div>
          </li>
          <li class="cpv-g">
            <span class="cpv-g-n">3</span>
            <div class="cpv-g-c"><h2>Deixe seu contato</h2><p>A igreja fala com você pelo WhatsApp. Leva 10 segundos.</p>
              <a class="cpv-btn ouro" href="#form-visitante">Deixar meu contato</a></div>
          </li>
        </ol>
        <h2 class="cpv-sec">Explore</h2>
        <nav class="cpv-atalhos" aria-label="Explorar">
          ${[["Avisos", "c-avisos", "#secao-avisos"], ["Fotos", "c-fotos", "tela-fotos"], ["Eventos", "c-eventos", "tela-eventos"], ["Ofertar", "c-oferta", "@tela-cpv-ofertas"], ["Ao vivo", "c-aovivo", "tela-camera-jerusalem"], ["Bíblia", "c-biblia", "tela-biblia"]]
            .map(([r, i, t]) => t.startsWith("#") ? `<a href="${t}"><span class="cpv-tile">${ci(i)}</span><span>${r}</span></a>` : `<button type="button" ${t.startsWith("@") ? `data-cpv-ir="${t.slice(1)}"` : `data-nav="${t}"`}><span class="cpv-tile">${ci(i)}</span><span>${r}</span></button>`).join("")}
        </nav>`;
    }
    const lista = await cultos();
    const hoje = new Date().getDay();
    const porDia = DIAS.map((d, i) => ({ i, d, c: lista.filter(c => !c.data && c.dia_semana === d) }));
    const ordem = [...porDia.slice(hoje), ...porDia.slice(0, hoje)];
    const sem = $("#cpv-semana", topo);
    const p = await proximo();
    let sel = p ? DIAS.indexOf(p.culto.dia_semana) : -1;
    function pintar() {
      sem.innerHTML = ordem.map(o => `<button type="button" class="${o.c.length ? "tem" : ""} ${o.i === sel ? "on" : ""}" data-i="${o.i}" ${o.c.length ? `aria-pressed="${o.i === sel}"` : "disabled"}><small>${o.i === hoje ? "Hoje" : DIAS_CURTO[o.i]}</small><b>${o.c.length ? String(o.c[0].horario).slice(0, 5).replace(":00", "h") : "–"}</b></button>`).join("");
      $$("button.tem", sem).forEach(b => b.addEventListener("click", () => { sel = +b.dataset.i; pintar(); mostrarDia(); }));
    }
    function mostrarDia() {
      const c = lista.find(x => !x.data && x.dia_semana === DIAS[sel]);
      const box = $("#cpv-agora-vis", topo);
      if (!c) { box.innerHTML = ""; return; }
      const dataISO = typeof proximaOcorrenciaCulto === "function" ? proximaOcorrenciaCulto(c) : hojeISO();
      const pp = { culto: c, data: dataISO, alvo: quando(c, dataISO), tema: c.dia_semana === "domingo" && typeof temaDoDomingo === "function" ? temaDoDomingo(dataISO) : null };
      box.innerHTML = cardAgora(pp);
      ligarAgora(box, pp);
    }
    pintar(); mostrarDia();
  }

  /* ============ 6) Servir: hub dos ministérios ============ */
  function telaServir() {
    if ($("#tela-cpv-servir")) return;
    const ref = $("#tela-membro-home"); if (!ref) return;
    const t = document.createElement("div");
    t.className = "screen cpv-layout"; t.id = "tela-cpv-servir";
    const areas = [
      { chave: "louvor", cor: "var(--s-pomba)", tit: "Louvor", sub: "Escalas, repertório e ensaios", nav: "tela-membro-louvor", ic: "c-musica" },
      { chave: "vs", cor: "var(--s-pomba)", tit: "VS · DDS MultiTrack", sub: "Abrir as faixas pro culto", link: "https://www.ddsinovacao.com.br/vs", ic: "c-aovivo" },
      { chave: "diaconato", cor: "var(--s-calice)", tit: "Diaconato", sub: "Escala dos cultos, Santa Ceia e portaria", ir: "tela-cpv-diaconato", ic: "c-calice" },
      { chave: "reunioes", cor: "var(--s-coroa)", tit: "Reuniões", sub: "Líderes, ministérios e pastores", ir: "tela-cpv-reunioes", ic: "c-coroa" },
      { chave: "infantil", cor: "var(--s-cruz)", tit: "Ministério Infantil", sub: "Crianças de 0 a 5 anos", nav: "tela-grupos-lista", ic: "c-crianca" },
    ];
    const seta = '<svg class="ci cpv-seta-dir" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    t.innerHTML = `<div class="scroll">
      <header class="cpv-saudacao"><p>Onde você serve</p><h1>Servir</h1></header>
      <p class="cpv-intro-tx">Tudo do seu ministério num lugar só: a próxima escala, o que ensaiar e as reuniões.</p>
      <div class="cpv-servir">
        ${areas.map(a => {
          const attr = a.link ? `href="${a.link}" target="_blank" rel="noopener"` : a.ir ? `data-cpv-ir="${a.ir}"` : `data-nav="${a.nav}"`;
          const tag = a.link ? "a" : "button";
          return `<${tag} ${tag === "button" ? 'type="button"' : ""} class="cpv-area" data-area="${a.chave}" style="--cor:${a.cor}" ${attr}>
          <span class="cpv-area-ic">${ci(a.ic)}</span>
          <span class="cpv-area-tx"><b>${a.tit}</b><small>${a.sub}</small></span>${seta}</${tag}>`; }).join("")}
      </div>
    </div>`;
    ref.after(t);
  }

  /* ============ 7) Barra superior com a logo original ============ */
  // na barra vai o nome em Brush Script, como na logo (arquivo enviado pela igreja)
  const NOME = "assets/nome-script-branco.png";
  function barra() {
    const img = $("#appbar-logo");
    if (img && !img.src.endsWith(NOME)) { img.src = NOME; img.alt = "Catedral Pão da Vida"; img.classList.add("cpv-nome-barra"); }
  }

  /* ---------- Aparência: claro ou escuro (escolha da pessoa) ---------- */
  // no tema claro entram os arquivos pretos originais da logo e do nome
  const LOGOS = { "assets/logo-branca.png": "assets/logo-preta.png", "assets/nome-script-branco.png": "assets/nome-script-preto.png" };
  function temaClaro() { return document.documentElement.classList.contains("cpv-claro"); }
  function trocarLogos() {
    const claro = temaClaro();
    $$("img").forEach(img => {
      const src = img.getAttribute("src") || "";
      for (const [esc0, cla] of Object.entries(LOGOS)) {
        if (claro && src.endsWith(esc0)) img.setAttribute("src", src.replace(esc0, cla));
        if (!claro && src.endsWith(cla)) img.setAttribute("src", src.replace(cla, esc0));
      }
    });
  }
  function rotuloTema() {
    const claro = temaClaro();
    const r = $("#tema-rotulo"); if (r) r.textContent = claro ? "Claro" : "Escuro";
    const u = $(".dt-ic use"); if (u) u.setAttribute("href", claro ? "#k-sun" : "#k-moon");
    const sw = $("#btn-tema"); if (sw) sw.setAttribute("aria-pressed", String(claro));
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = claro ? "#F6EEE1" : "#16161C";
  }
  function aplicarTema(claro) {
    document.documentElement.classList.toggle("cpv-claro", claro);
    try { localStorage.setItem("cpv_tema", claro ? "claro" : "escuro"); } catch (e) {}
    trocarLogos(); rotuloTema();
  }
  // o botão "Aparência" do menu passa a controlar o tema da Catedral
  document.addEventListener("click", e => {
    if (!(e.target.closest && e.target.closest("#btn-tema"))) return;
    e.stopImmediatePropagation(); e.preventDefault();
    aplicarTema(!temaClaro());
  }, true);
  new MutationObserver(() => { if (temaClaro()) trocarLogos(); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  window.cpvTema = aplicarTema;

  function iniciar() {
    document.documentElement.classList.add("cpv");
    document.documentElement.classList.remove("claro");
    trocarLogos(); rotuloTema();
    try { localStorage.setItem("igr_a2hs_fechado", "1"); } catch (e) {}
    injetarIcones();
    ligarNavegacao();
    barra();
    telaServir();
    abas();
    // espera a igreja carregar (app.js) para montar as telas
    let tent = 0;
    (function esperar() {
      if (typeof state !== "undefined" && state.igreja) {
        barra(); abas();
        const ativa = $(".screen.active")?.id;
        document.documentElement.dataset.tela = ativa || "";
        if (ativa === "tela-membro-home") montarHoje();
        if (ativa === "tela-visitante") montarVisitante();
        return;
      }
      if (tent++ < 80) setTimeout(esperar, 150);
    })();
  }

  abertura();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
