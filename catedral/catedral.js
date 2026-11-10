/* ============================================================
   Catedral Pão da Vida — camada de design "Colunata"
   A colunata da logo é o objeto que atravessa o app:
   nasce na abertura, vira o fundo do topo das telas iniciais.
   ============================================================ */
(function () {
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  // Templo frontal em linha fina, com os 4 símbolos quadrangulares no friso
  function templo(classe) {
    const xs = [];
    for (let i = 0; i < 7; i++) xs.push(48 + i * 44);
    const colunas = xs.map((x, i) => `
      <g class="col" style="--i:${i}">
        <rect class="col-luz" x="${x - 2}" y="104" width="24" height="124" rx="2"/>
        <path d="M${x} 228 V108 M${x + 20} 228 V108 M${x + 10} 222 V114"/>
        <path d="M${x - 4} 108 H${x + 24} M${x - 4} 228 H${x + 24}"/>
      </g>`).join("");
    return `<svg class="templo ${classe || ""}" viewBox="0 0 360 262" aria-hidden="true">
      <defs>
        <radialGradient id="cpvLuz" cx="50%" cy="58%" r="55%">
          <stop offset="0" stop-color="#F6D58A" stop-opacity=".55"/>
          <stop offset=".55" stop-color="#D9A441" stop-opacity=".16"/>
          <stop offset="1" stop-color="#D9A441" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse class="luz" cx="180" cy="160" rx="200" ry="130" fill="url(#cpvLuz)"/>
      <g class="raios">${xs.slice(0, 6).map(x => `<path d="M${x + 32} 112 L${x + 18} 262 H${x + 40} Z"/>`).join("")}</g>
      <g class="base"><path d="M28 232 H332 M20 242 H340 M12 252 H348"/></g>
      <g class="colunata">${colunas}</g>
      <g class="frontao">
        <path d="M30 104 H330 M30 88 H330 M30 88 V104 M330 88 V104"/>
        <path d="M22 84 L180 22 L338 84 Z"/>
        <path class="tri-in" d="M58 78 L180 32 L302 78 Z"/>
      </g>
      <g class="simbolos">
        <g class="sb cruz" transform="translate(108 96) scale(1.35)"><path d="M0 -6 V6 M-4 -2 H4"/></g>
        <g class="sb pomba" transform="translate(156 96) scale(1.35)"><path d="M-7 2 C-3 -1 0 -1 1 -3 C2 -6 5 -6 6 -4 C5 -3 4 -2 4 0 C6 0 7 1 8 3 C4 4 0 4 -3 3 Z"/></g>
        <g class="sb calice" transform="translate(204 96) scale(1.35)"><path d="M-5 -6 H5 Q5 0 0 1 Q-5 0 -5 -6 Z M0 1 V5 M-3 5.5 H3"/></g>
        <g class="sb coroa" transform="translate(252 96) scale(1.35)"><path d="M-6 5 V-3 L-3 1 L0 -5 L3 1 L6 -3 V5 Z"/></g>
      </g>
    </svg>`;
  }
  window.cpvTemplo = templo;

  /* ---------- 1) Abertura ---------- */
  function abertura() {
    const antigo = document.getElementById("intro-overlay");
    if (antigo) antigo.remove(); // a abertura antiga (Vila Real) não roda aqui
    let jaViu = false;
    try { jaViu = sessionStorage.getItem("cpv_intro") === "1"; } catch (e) {}
    if (jaViu || reduz) return;

    const ov = document.createElement("div");
    ov.id = "cpv-intro";
    ov.innerHTML = `
      <div class="cpv-grao"></div>
      <div class="cpv-palco">${templo("templo-intro")}</div>
      <h1 class="cpv-nome cpv-wordmark"><small>Catedral</small><strong>Pão da Vida</strong><span>Pr. Ismair e Pra. Débora</span></h1>
      <p class="cpv-lema">Uma Igreja em 18 Dias!</p>
      <button class="cpv-abrir" type="button" aria-label="Abrir o app">
        <span class="cpv-seta"></span>
        <b>Deslize para entrar</b>
      </button>
      <a class="cpv-copy" href="https://ddsinovacao.com.br" target="_blank" rel="noopener">© 2026 · DDS Inovação</a>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add("cpv-abrindo");

    const g = window.gsap;
    const q = s => ov.querySelectorAll(s);
    let tl = null;
    if (g) {
      tl = g.timeline({ defaults: { ease: "power3.out" } });
      g.set(q(".col"), { scaleY: 0, transformOrigin: "50% 100%" });
      g.set(q(".frontao"), { y: -36, opacity: 0 });
      g.set(q(".base path"), { strokeDasharray: 340, strokeDashoffset: 340 });
      g.set(q(".sb"), { opacity: 0, scale: .4, transformBox: "fill-box", transformOrigin: "50% 50%" });
      g.set(q(".luz, .raios"), { opacity: 0 });
      g.set(q(".cpv-wordmark, .cpv-lema, .cpv-abrir, .cpv-copy"), { opacity: 0, y: 14 });
      tl.to(q(".base path"), { strokeDashoffset: 0, duration: .7, stagger: .08, ease: "power2.inOut" }, .15)
        .to(q(".col"), { scaleY: 1, duration: .75, stagger: .085, ease: "expo.out" }, .45)
        .to(q(".frontao"), { y: 0, opacity: 1, duration: .6, ease: "back.out(1.6)" }, 1.25)
        .to(q(".sb"), { opacity: 1, scale: 1, duration: .45, stagger: .2, ease: "back.out(2.4)" }, 1.75)
        .to(q(".luz"), { opacity: 1, duration: 1.2, ease: "sine.inOut" }, 1.9)
        .to(q(".raios"), { opacity: 1, duration: 1.4, ease: "sine.inOut" }, 2.1)
        .to(q(".cpv-wordmark"), { opacity: 1, y: 0, duration: .8 }, 2.35)
        .to(q(".cpv-lema"), { opacity: 1, y: 0, duration: .6 }, 2.7)
        .to(q(".cpv-abrir, .cpv-copy"), { opacity: 1, y: 0, duration: .6, stagger: .1 }, 3.0);
    } else {
      ov.classList.add("sem-gsap");
    }

    let saindo = false;
    function entrar() {
      if (saindo) return;
      saindo = true;
      try { sessionStorage.setItem("cpv_intro", "1"); } catch (e) {}
      if (tl) tl.progress(1);
      const alvo = document.querySelector(".screen.active .cpv-topo .templo") || document.querySelector(".cpv-topo .templo");
      const fonte = ov.querySelector(".templo-intro");
      document.documentElement.classList.remove("cpv-abrindo");
      if (g && alvo && fonte) {
        // a colunata viaja até o topo da tela de destino
        const a = alvo.getBoundingClientRect(), f = fonte.getBoundingClientRect();
        const s = a.width / f.width;
        const dx = (a.left + a.width / 2) - (f.left + f.width / 2);
        const dy = (a.top + a.height / 2) - (f.top + f.height / 2);
        g.to(ov.querySelectorAll(".cpv-wordmark, .cpv-lema, .cpv-abrir, .cpv-copy"), { opacity: 0, y: -20, duration: .35, ease: "power2.in" });
        g.to(fonte, { x: dx, y: dy, scale: s, duration: .9, ease: "expo.inOut" });
        g.to(ov, { backgroundColor: "rgba(20,17,14,0)", duration: .7, delay: .35, ease: "power1.out" });
        g.to(fonte, { opacity: 0, duration: .25, delay: .8, onComplete: () => ov.remove() });
        g.fromTo(alvo, { opacity: 0 }, { opacity: 1, duration: .3, delay: .75 });
      } else {
        ov.style.transition = "opacity .5s";
        ov.style.opacity = "0";
        setTimeout(() => ov.remove(), 520);
      }
    }
    // deslizar para cima, tocar no botão ou tecla
    let y0 = null;
    ov.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
    ov.addEventListener("touchmove", e => { if (y0 !== null && y0 - e.touches[0].clientY > 50) entrar(); }, { passive: true });
    ov.addEventListener("wheel", e => { if (e.deltaY > 20) entrar(); }, { passive: true });
    ov.querySelector(".cpv-abrir").addEventListener("click", entrar);
    document.addEventListener("keydown", function k(e) { if (e.key === "Enter" || e.key === " " || e.key === "ArrowUp") { entrar(); document.removeEventListener("keydown", k); } });
  }

  /* ---------- 2) Topo com a colunata nas telas iniciais ---------- */
  function topos() {
    [["tela-visitante", "visitante"], ["tela-membro-home", "membro"]].forEach(([id, tipo]) => {
      const sc = document.querySelector(`#${id} .scroll`);
      if (!sc || sc.querySelector(".cpv-topo")) return;
      const topo = document.createElement("div");
      topo.className = "cpv-topo cpv-topo-" + tipo;
      topo.innerHTML = templo("templo-topo");
      sc.prepend(topo);
      // parallax: a colunata sobe mais devagar que o conteúdo e apaga
      let pedido = false;
      sc.addEventListener("scroll", () => {
        if (pedido || reduz) return;
        pedido = true;
        requestAnimationFrame(() => {
          const y = sc.scrollTop;
          topo.style.setProperty("--py", (y * 0.45).toFixed(1) + "px");
          topo.style.setProperty("--po", Math.max(0, 1 - y / 420).toFixed(3));
          pedido = false;
        });
      }, { passive: true });
    });
  }

  /* ---------- 3) Textos da tela do visitante ---------- */
  function textos() {
    const h = document.querySelector("#tela-visitante .hero-boasvindas");
    if (h && !h.dataset.cpv) {
      h.dataset.cpv = "1";
      h.innerHTML = `
        <h1>Que bom ter você aqui</h1>
        <p>Veja os horários dos cultos e os avisos da semana. Se quiser, deixe seu contato e a igreja fala com você pelo WhatsApp.</p>
        <a href="#form-visitante" class="cta">Deixar meu contato</a>`;
    }
    const dica = document.querySelector(".intro-dica b");
    if (dica) dica.textContent = "Deslize para entrar";
  }

  function iniciar() {
    document.documentElement.classList.add("cpv");
    try { localStorage.setItem("igr_a2hs_fechado", "1"); } catch (e) {} // web app, sem convite de instalação
    topos();
    textos();
  }

  abertura();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
