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
      <div class="cpv-grao"></div>
      <div class="cpv-logo-palco"><img class="cpv-logo" src="${LOGO}" alt="Catedral Pão da Vida — Pr. Ismair e Pra. Débora"><span class="cpv-varredura"></span></div>
      <div class="cpv-quatro" aria-hidden="true"><i style="--c:var(--s-cruz)"></i><i style="--c:var(--s-pomba)"></i><i style="--c:var(--s-calice)"></i><i style="--c:var(--s-coroa)"></i></div>
      <button class="cpv-abrir" type="button"><span class="cpv-seta"></span><b>Deslize para entrar</b></button>
      <a class="cpv-copy" href="https://ddsinovacao.com.br" target="_blank" rel="noopener">© 2026 · DDS Inovação</a>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add("cpv-abrindo");

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
    ov.addEventListener("touchmove", e => { if (y0 !== null && y0 - e.touches[0].clientY > 50) entrar(); }, { passive: true });
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
    { id: "hoje", rot: "Hoje", ic: "i-home", tela: "tela-membro-home" },
    { id: "agenda", rot: "Agenda", ic: "k-calendar", tela: "tela-calendario" },
    { id: "servir", rot: "Servir", ic: "i-heart", tela: "tela-cpv-servir" },
    { id: "biblia", rot: "Bíblia", ic: "k-bible", tela: "tela-biblia" },
    { id: "eu", rot: "Eu", ic: "i-user", acao: () => $("#btn-meu-perfil")?.click() },
  ];
  const ABAS_VISITANTE = [
    { id: "inicio", rot: "Início", ic: "i-home", tela: "tela-visitante" },
    { id: "agenda", rot: "Agenda", ic: "k-calendar", tela: "tela-calendario" },
    { id: "biblia", rot: "Bíblia", ic: "k-bible", tela: "tela-biblia" },
    { id: "entrar", rot: "Entrar", ic: "k-enter", tela: "tela-login" },
  ];
  const TELA_ABA = { "tela-membro-home": "hoje", "tela-visitante": "inicio", "tela-calendario": "agenda", "tela-cpv-servir": "servir", "tela-membro-louvor": "servir", "tela-biblia": "biblia", "tela-editar-perfil": "eu", "tela-login": "entrar", "tela-cadastro": "entrar" };

  function abas() {
    let bar = $("#cpv-abas");
    if (!bar) { bar = document.createElement("nav"); bar.id = "cpv-abas"; bar.setAttribute("aria-label", "Navegação principal"); document.body.appendChild(bar); }
    const lista = membro() ? ABAS_MEMBRO : ABAS_VISITANTE;
    bar.innerHTML = `<i class="cpv-abas-luz"></i>` + lista.map(a => `<button type="button" data-aba="${a.id}">${ic(a.ic)}<span>${a.rot}</span></button>`).join("");
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
        <p class="cpv-agora-info">${ic("k-clock")} ${dia} às ${esc(String(c.horario || "").slice(0, 5))}${c.local ? ` · ${esc(c.local)}` : ""}</p>
        <div class="cpv-agora-acoes">
          <a class="cpv-btn claro" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((state.igreja?.nome || "") + " " + (state.igreja?.endereco || ""))}" target="_blank" rel="noopener">${ic("k-pin")} Como chegar</a>
          <button class="cpv-btn vidro" type="button" data-cpv-share>${ic("k-share2")} Convidar alguém</button>
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
    if (id === "humor") destacar($("#checkin-diario-box"));
    if (id === "devo") { ($("#palavra-card") || $("#btn-ler-devocional"))?.click(); marcar("devo"); }
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
          ${[["Diário", "k-diary", "tela-diario"], ["Eventos", "k-event", "tela-eventos"], ["Chat", "k-chat", "tela-mensagens"], ["Fotos", "k-photos", "tela-fotos"], ["Grupos", "i-user", "tela-grupos-lista"], ["Tudo", "k-grid", null]]
            .map(([r, i, t]) => `<button type="button" ${t ? `data-nav="${t}"` : "data-abrir-explorar"}>${ic(i)}<span>${r}</span></button>`).join("")}
        </nav>`;
      $$(".cpv-passo", topo).forEach(b => b.addEventListener("click", () => acaoPasso(b.dataset.passo)));
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
        <div class="cpv-marca"><img src="${LOGO}" alt="Catedral Pão da Vida — Pr. Ismair e Pra. Débora"></div>
        <p class="cpv-ola">Igreja do Evangelho Quadrangular em Balneário Ipanema, Pontal do Paraná.</p>
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
          ${[["Avisos", "k-megaphone2", "#secao-avisos"], ["Fotos", "k-photos", "tela-fotos"], ["Eventos", "k-ticket", "tela-eventos"], ["Livros", "k-books", "tela-biblioteca"], ["Ao vivo", "k-live", "tela-camera-jerusalem"], ["Bíblia", "k-bible", "tela-biblia"]]
            .map(([r, i, t]) => t.startsWith("#") ? `<a href="${t}">${ic(i)}<span>${r}</span></a>` : `<button type="button" data-nav="${t}">${ic(i)}<span>${r}</span></button>`).join("")}
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
      { cor: "var(--s-pomba)", tit: "Louvor", sub: "Escalas, repertório, mapa de ensaio e VS", tela: "tela-membro-louvor", ic: "i-music" },
      { cor: "var(--s-calice)", tit: "Diaconato", sub: "Escala dos cultos, Santa Ceia e portaria", ic: "i-heart" },
      { cor: "var(--s-coroa)", tit: "Reuniões", sub: "Líderes, ministérios e pastores", ic: "k-calendar" },
      { cor: "var(--s-cruz)", tit: "Ministério Infantil", sub: "Crianças de 0 a 5 anos", ic: "i-user", tela: "tela-grupos-lista" },
    ];
    t.innerHTML = `<div class="scroll">
      <header class="cpv-saudacao"><p>Onde você serve</p><h1>Servir</h1></header>
      <p class="cpv-intro-tx">Tudo do seu ministério num lugar só: a próxima escala, o que ensaiar e as reuniões.</p>
      <div class="cpv-servir">
        ${areas.map(a => `<button type="button" class="cpv-area" style="--cor:${a.cor}" ${a.tela ? `data-nav="${a.tela}"` : `aria-disabled="true"`}>
          <span class="cpv-area-ic">${ic(a.ic)}</span>
          <span class="cpv-area-tx"><b>${a.tit}</b><small>${a.sub}</small></span>
          ${a.tela ? ic("k-chevron", "cpv-seta-dir") : `<em>Em breve</em>`}
        </button>`).join("")}
      </div>
    </div>`;
    ref.after(t);
  }

  /* ============ 7) Barra superior com a logo original ============ */
  function barra() {
    const img = $("#appbar-logo");
    if (img && !img.src.endsWith(LOGO)) { img.src = LOGO; img.alt = "Catedral Pão da Vida"; }
  }

  function iniciar() {
    document.documentElement.classList.add("cpv");
    try { localStorage.setItem("igr_a2hs_fechado", "1"); } catch (e) {}
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
