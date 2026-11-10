/* ============================================================
   Catedral Pão da Vida — módulos próprios
   VS · Escalas do Diaconato · Reuniões · Ofertas
   Usa os globais do app.js (sb, state, mostrarTela).
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ci = id => `<svg class="ci" aria-hidden="true"><use href="#${id}"/></svg>`;
  const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const DIAS_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const DIAS_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const VS_URL = "https://www.ddsinovacao.com.br/vs";
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const hoje = () => iso(new Date());
  const dt = s => new Date(s + "T00:00:00");
  const dataCurta = s => { const d = dt(s); return `${DIAS_CURTO[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`; };
  const diasEntre = (a, b) => Math.round((dt(b) - dt(a)) / 86400000);
  const iniciais = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  const primeiroNome = n => String(n || "").trim().split(/\s+/)[0];
  const m = () => state.membro || null;
  const perm = p => (m()?.permissoes || []).includes(p);
  const souAdmin = () => !!state.adminNome;
  const liderDiac = () => souAdmin() || perm("gerenciar_diaconato");
  const liderReunioes = () => souAdmin() || !!m()?.eh_lider || perm("gerenciar_reunioes");
  const podeOfertas = () => souAdmin() || perm("gerenciar_ofertas");
  function aviso(txt, erro) {
    let t = $("#cpv-toast");
    if (!t) { t = document.createElement("div"); t.id = "cpv-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = txt; t.className = erro ? "erro on" : "on";
    clearTimeout(t._t); t._t = setTimeout(() => t.className = "", 2600);
  }

  /* ---------- Telas ---------- */
  function tela(id, voltar) {
    let t = document.getElementById(id);
    if (t) return t;
    t = document.createElement("div");
    t.className = "screen cpv-layout"; t.id = id; t.dataset.voltar = voltar || "tela-cpv-servir";
    t.innerHTML = `<div class="scroll"></div>`;
    ($("#tela-cpv-servir") || $("#tela-membro-home")).after(t);
    return t;
  }
  function topo(titulo, sup, voltar) {
    return `<div class="cpv-topo-tela">
      <button type="button" class="cpv-voltar" data-cpv-voltar="${voltar}" aria-label="Voltar"><svg class="ci" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <header class="cpv-saudacao"><p>${esc(sup)}</p><h1>${esc(titulo)}</h1></header>
    </div>`;
  }
  document.addEventListener("click", e => {
    const v = e.target.closest && e.target.closest("[data-cpv-voltar]");
    if (v) window.mostrarTela(v.dataset.cpvVoltar);
    const ir = e.target.closest && e.target.closest("[data-cpv-ir]");
    if (ir) abrir(ir.dataset.cpvIr);
  });
  const VOLTA = { "tela-cpv-diaconato": "tela-cpv-servir", "tela-cpv-reunioes": "tela-cpv-servir", "tela-cpv-ofertas": null };
  function abrir(id) {
    tela(id, VOLTA[id] || undefined);
    window.mostrarTela(id);
    if (id === "tela-cpv-diaconato") diaconato();
    if (id === "tela-cpv-reunioes") reunioes();
    if (id === "tela-cpv-ofertas") ofertas();
  }
  window.cpvAbrir = abrir;

  /* Bottom sheet genérico */
  function folha(html, aoMontar) {
    const f = document.createElement("div");
    f.className = "cpv-folha";
    f.innerHTML = `<div class="cpv-folha-fundo" data-fechar></div><div class="cpv-folha-caixa" role="dialog" aria-modal="true"><span class="cpv-folha-alca"></span>${html}</div>`;
    document.body.appendChild(f);
    requestAnimationFrame(() => f.classList.add("on"));
    const fechar = () => { f.classList.remove("on"); setTimeout(() => f.remove(), 320); };
    f.addEventListener("click", e => { if (e.target.closest("[data-fechar]")) fechar(); });
    aoMontar && aoMontar(f, fechar);
    return fechar;
  }

  /* ============================================================
     VS (DDS MultiTrack)
     ============================================================ */
  function botaoVS() {
    const sc = $("#tela-membro-louvor .scroll");
    if (!sc || $(".cpv-vs", sc)) return;
    const b = document.createElement("a");
    b.className = "cpv-vs"; b.href = VS_URL; b.target = "_blank"; b.rel = "noopener";
    b.innerHTML = `<span class="cpv-vs-ic">${ci("c-musica")}</span><span class="cpv-vs-tx"><b>Abrir o VS</b><small>DDS MultiTrack: as faixas do culto, sincronizadas</small></span><svg class="ci" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;
    const h = sc.querySelector("h2, .louvor-hero, header");
    (h ? h : sc.firstElementChild)?.after(b);
  }

  /* ============================================================
     DIACONATO
     ============================================================ */
  const D = { funcoes: [], diaconos: [], grupoId: null };
  async function carregarBaseDiac() {
    const g = (state.grupos || []).find(x => /diacon/i.test(x.nome));
    D.grupoId = g?.id || null;
    const [{ data: f }, porPrincipal, vinc] = await Promise.all([
      sb.from("igr_diac_funcoes").select("*").eq("igreja_id", state.igreja.id).order("ordem"),
      D.grupoId ? sb.from("igr_membros").select("id, nome_completo, foto_url, telefone").eq("grupo_id", D.grupoId) : Promise.resolve({ data: [] }),
      D.grupoId ? sb.from("igr_membros_grupos").select("membro_id").eq("grupo_id", D.grupoId) : Promise.resolve({ data: [] }),
    ]);
    D.funcoes = f || [];
    let lista = porPrincipal.data || [];
    const extras = (vinc.data || []).map(v => v.membro_id).filter(id => !lista.some(x => x.id === id));
    if (extras.length) {
      const { data } = await sb.from("igr_membros").select("id, nome_completo, foto_url, telefone").in("id", extras);
      lista = lista.concat(data || []);
    }
    D.diaconos = lista.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
  }
  function proximosCultos(dias = 28) {
    const out = [], base = new Date(); base.setHours(0, 0, 0, 0);
    return cultosLista().then(cultos => {
      for (let i = 0; i < dias; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const s = iso(d);
        cultos.forEach(c => {
          if (c.data) { if (c.data === s) out.push({ data: s, horario: c.horario, titulo: c.titulo }); return; }
          if (c.data_inicio && s < c.data_inicio) return;
          if (c.data_fim && s > c.data_fim) return;
          if (c.dia_semana === DIAS[d.getDay()]) {
            const t = c.dia_semana === "domingo" && typeof temaDoDomingo === "function" ? temaDoDomingo(s) : null;
            out.push({ data: s, horario: c.horario, titulo: c.titulo + (t ? ` · ${t.tema}` : "") });
          }
        });
      }
      return out.sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));
    });
  }
  let _cultos = null;
  async function cultosLista() {
    if (_cultos) return _cultos;
    const { data } = await sb.from("igr_cultos").select("*").eq("igreja_id", state.igreja.id);
    return (_cultos = data || []);
  }

  async function diaconato() {
    const t = tela("tela-cpv-diaconato");
    const sc = $(".scroll", t);
    sc.innerHTML = topo("Diaconato", "Escalas dos cultos", "tela-cpv-servir") + `<p class="hint cpv-carregando">Carregando…</p>`;
    try { await carregarBaseDiac(); } catch (e) { sc.innerHTML = topo("Diaconato", "Escalas dos cultos", "tela-cpv-servir") + `<div class="cpv-vazio">Não foi possível carregar as escalas agora. Verifique a internet e tente de novo.</div>`; return; }

    // minhas escalas
    let minhas = [];
    if (m()) {
      const { data } = await sb.from("igr_diac_itens").select("id, status, justificativa, funcao_id, escala:igr_diac_escalas!inner(id, data, horario, titulo, igreja_id)")
        .eq("membro_id", m().id).gte("escala.data", hoje()).eq("escala.igreja_id", state.igreja.id);
      minhas = (data || []).sort((a, b) => a.escala.data.localeCompare(b.escala.data));
    }
    const nomeFuncao = id => D.funcoes.find(f => f.id === id)?.nome || "Função";

    let html = topo("Diaconato", "Escalas dos cultos", "tela-cpv-servir");
    html += `<h2 class="cpv-sec">Quando você serve</h2>`;
    html += minhas.length ? `<div class="cpv-lista">${minhas.map(i => `
      <article class="cpv-escala-minha st-${i.status}">
        <div class="cpv-data"><b>${dt(i.escala.data).getDate()}</b><small>${MESES[dt(i.escala.data).getMonth()]}</small></div>
        <div class="cpv-escala-tx"><b>${esc(nomeFuncao(i.funcao_id))}</b><small>${esc(i.escala.titulo || "Culto")} · ${DIAS_LONGO[dt(i.escala.data).getDay()]} ${esc(String(i.escala.horario || "").slice(0, 5))}</small>
          ${i.status === "pendente" ? `<div class="cpv-escala-acoes"><button type="button" class="cpv-btn ouro mini" data-diac-ok="${i.id}">Confirmar</button><button type="button" class="cpv-btn linha mini" data-diac-nao="${i.id}">Não posso</button></div>`
            : `<span class="cpv-status">${i.status === "confirmado" ? "Confirmado" : "Você avisou que não pode"}</span>`}
        </div>
      </article>`).join("")}</div>`
      : `<div class="cpv-vazio">Você não está em nenhuma escala nos próximos dias.</div>`;

    if (liderDiac()) {
      const cultos = await proximosCultos(28);
      const { data: escalas } = await sb.from("igr_diac_escalas").select("id, data, horario, igr_diac_itens(id, status)").eq("igreja_id", state.igreja.id).gte("data", hoje());
      const porChave = {}; (escalas || []).forEach(e => porChave[e.data + "|" + (e.horario || "")] = e);
      const total = D.funcoes.length || 1;
      html += `<div class="cpv-sec-linha"><h2 class="cpv-sec">Montar escalas</h2><button type="button" class="cpv-link" data-diac-funcoes>Funções</button></div>`;
      if (!D.grupoId) html += `<div class="cpv-vazio">Crie o grupo "Diaconato" no painel e coloque os diáconos nele para montar as escalas.</div>`;
      html += `<div class="cpv-lista">${cultos.map(c => {
        const e = porChave[c.data + "|" + (c.horario || "")];
        const itens = e?.igr_diac_itens || [];
        const n = itens.length, ok = itens.filter(i => i.status === "confirmado").length, rec = itens.filter(i => i.status === "recusado").length;
        return `<button type="button" class="cpv-culto-escala" data-diac-editar="${c.data}|${esc(c.horario || "")}|${esc(c.titulo)}">
          <div class="cpv-data"><b>${dt(c.data).getDate()}</b><small>${MESES[dt(c.data).getMonth()]}</small></div>
          <div class="cpv-escala-tx"><b>${esc(c.titulo)}</b><small>${DIAS_LONGO[dt(c.data).getDay()]} · ${esc(String(c.horario || "").slice(0, 5))}</small>
            <div class="cpv-barra" style="--p:${Math.min(1, n / total)}"><i></i></div>
            <small class="cpv-escala-res">${n ? `${n} de ${total} funções · ${ok} confirmados${rec ? ` · <em>${rec} não pode</em>` : ""}` : "Escala ainda não montada"}</small>
          </div>
          <svg class="ci cpv-seta" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>`;
      }).join("")}</div>`;
    }
    sc.innerHTML = html;

    $$("[data-diac-ok]", sc).forEach(b => b.addEventListener("click", async () => {
      const { error } = await sb.from("igr_diac_itens").update({ status: "confirmado", respondido_em: new Date().toISOString() }).eq("id", b.dataset.diacOk);
      if (error) return aviso("Não foi possível confirmar. Tente de novo.", true);
      aviso("Presença confirmada. Obrigado por servir!"); diaconato(); cpvServe();
    }));
    $$("[data-diac-nao]", sc).forEach(b => b.addEventListener("click", () => folha(`
      <h3>Não vai poder servir?</h3><p class="hint">Conte o motivo pro líder do Diaconato poder te substituir.</p>
      <textarea class="cpv-campo" rows="3" placeholder="Ex.: vou viajar nesse fim de semana"></textarea>
      <button type="button" class="cpv-btn ouro largo" data-enviar>Avisar o líder</button>`, (f, fechar) => {
      $("[data-enviar]", f).addEventListener("click", async () => {
        const { error } = await sb.from("igr_diac_itens").update({ status: "recusado", justificativa: $("textarea", f).value.trim() || null, respondido_em: new Date().toISOString() }).eq("id", b.dataset.diacNao);
        if (error) return aviso("Não foi possível enviar. Tente de novo.", true);
        fechar(); aviso("Líder avisado."); diaconato(); cpvServe();
      });
    })));
    $$("[data-diac-editar]", sc).forEach(b => b.addEventListener("click", () => { const [data, horario, ...tt] = b.dataset.diacEditar.split("|"); editorDiac(data, horario, tt.join("|")); }));
    $("[data-diac-funcoes]", sc)?.addEventListener("click", funcoesDiac);
  }

  function funcoesDiac() {
    const desenhar = f => {
      $(".cpv-chips", f).innerHTML = D.funcoes.map(x => `<span class="cpv-chip">${esc(x.nome)}<button type="button" aria-label="Remover ${esc(x.nome)}" data-del="${x.id}">×</button></span>`).join("") || `<p class="hint">Nenhuma função ainda.</p>`;
      $$("[data-del]", f).forEach(b => b.addEventListener("click", async () => {
        if (!confirm("Remover essa função? As escalas antigas com ela também saem.")) return;
        await sb.from("igr_diac_funcoes").delete().eq("id", b.dataset.del);
        D.funcoes = D.funcoes.filter(x => x.id !== b.dataset.del); desenhar(f);
      }));
    };
    folha(`<h3>Funções do Diaconato</h3><p class="hint">As funções que aparecem em toda escala.</p>
      <div class="cpv-chips"></div>
      <div class="cpv-add"><input class="cpv-campo" placeholder="Nova função (ex.: Água do púlpito)"><button type="button" class="cpv-btn ouro" data-add>Adicionar</button></div>`, f => {
      desenhar(f);
      $("[data-add]", f).addEventListener("click", async () => {
        const nome = $("input", f).value.trim(); if (!nome) return;
        const { data, error } = await sb.from("igr_diac_funcoes").insert({ igreja_id: state.igreja.id, nome, ordem: D.funcoes.length + 1 }).select().single();
        if (error) return aviso("Não foi possível adicionar.", true);
        D.funcoes.push(data); $("input", f).value = ""; desenhar(f);
      });
    });
  }

  async function editorDiac(data, horario, titulo) {
    const t = tela("tela-cpv-diac-editor", "tela-cpv-diaconato");
    window.mostrarTela("tela-cpv-diac-editor");
    t.querySelector(".scroll").scrollTop = 0;
    const sc = $(".scroll", t);
    sc.innerHTML = topo(titulo || "Culto", dataCurta(data) + (horario ? ` · ${horario.slice(0, 5)}` : ""), "tela-cpv-diaconato") + `<p class="hint">Carregando…</p>`;
    if (!D.funcoes.length) await carregarBaseDiac();

    // escala desse culto + histórico dos últimos 90 dias para as sugestões
    const ini = iso(new Date(dt(data).getTime() - 90 * 86400000));
    const [{ data: esc0 }, { data: hist }] = await Promise.all([
      sb.from("igr_diac_escalas").select("*, igr_diac_itens(*)").eq("igreja_id", state.igreja.id).eq("data", data).eq("horario", horario || "").maybeSingle(),
      sb.from("igr_diac_escalas").select("id, data, horario, igr_diac_itens(membro_id)").eq("igreja_id", state.igreja.id).gte("data", ini).lt("data", data).order("data", { ascending: false }),
    ]);
    const ultimo = (hist || [])[0];
    const noUltimo = new Set((ultimo?.igr_diac_itens || []).map(i => i.membro_id));
    const ultimaVez = {};
    (hist || []).forEach(e => (e.igr_diac_itens || []).forEach(i => { if (!ultimaVez[i.membro_id]) ultimaVez[i.membro_id] = e.data; }));
    const atual = {}; const statusAtual = {};
    (esc0?.igr_diac_itens || []).forEach(i => { atual[i.funcao_id] = i.membro_id; statusAtual[i.funcao_id] = i; });

    const nome = id => D.diaconos.find(x => x.id === id)?.nome_completo || "Diácono";
    function desenhar() {
      sc.innerHTML = topo(titulo || "Culto", dataCurta(data) + (horario ? ` · ${horario.slice(0, 5)}` : ""), "tela-cpv-diaconato") + `
        ${ultimo ? `<p class="cpv-dica">${ci("c-relogio")} As sugestões evitam quem serviu no último culto (${dataCurta(ultimo.data)}).</p>` : ""}
        <div class="cpv-funcoes">${D.funcoes.map(f => {
          const mid = atual[f.id], st = statusAtual[f.id];
          return `<button type="button" class="cpv-funcao ${mid ? "cheia" : ""}" data-escolher="${f.id}">
            <span class="cpv-funcao-n">${esc(f.nome)}</span>
            ${mid ? `<span class="cpv-pessoa"><i>${iniciais(nome(mid))}</i>${esc(nome(mid))}${st && st.membro_id === mid && st.status !== "pendente" ? `<em class="st-${st.status}">${st.status === "confirmado" ? "Confirmou" : "Não pode"}</em>` : ""}</span>` : `<span class="cpv-escolher">Escolher diácono</span>`}
          </button>`; }).join("")}</div>
        <div class="cpv-acoes-fim">
          <button type="button" class="cpv-btn ouro largo" data-salvar>Salvar escala</button>
          <button type="button" class="cpv-btn linha largo" data-zap>${ci("c-chat")} Enviar no grupo do WhatsApp</button>
        </div>`;
      $$("[data-escolher]", sc).forEach(b => b.addEventListener("click", () => escolher(b.dataset.escolher)));
      $("[data-salvar]", sc).addEventListener("click", salvar);
      $("[data-zap]", sc).addEventListener("click", () => {
        const linhas = D.funcoes.filter(f => atual[f.id]).map(f => `• ${f.nome}: ${primeiroNome(nome(atual[f.id]))}`);
        const txt = `*Escala do Diaconato*\n${titulo} · ${dataCurta(data)} às ${String(horario || "").slice(0, 5)}\n\n${linhas.join("\n")}\n\nConfirme no app: ${window.APP_URL || location.href}`;
        window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank", "noopener");
      });
    }
    function escolher(funcaoId) {
      const ocupados = {}; Object.entries(atual).forEach(([fid, mid]) => { if (fid !== funcaoId) ocupados[mid] = fid; });
      const lista = D.diaconos.map(d => {
        const uv = ultimaVez[d.id];
        return { d, uv, ocupado: !!ocupados[d.id], ultimo: noUltimo.has(d.id), dias: uv ? diasEntre(uv, data) : 9999 };
      }).sort((a, b) => (a.ocupado - b.ocupado) || (a.ultimo - b.ultimo) || (b.dias - a.dias) || a.d.nome_completo.localeCompare(b.d.nome_completo));
      const f = D.funcoes.find(x => x.id === funcaoId);
      folha(`<h3>${esc(f?.nome || "Função")}</h3><p class="hint">Ordenado por quem está há mais tempo sem servir.</p>
        <div class="cpv-pessoas">${lista.map((x, i) => `
          <button type="button" class="cpv-pessoa-op ${x.ocupado || x.ultimo ? "atencao" : ""}" data-mid="${x.d.id}">
            <i>${iniciais(x.d.nome_completo)}</i>
            <span><b>${esc(x.d.nome_completo)}</b>
              <small>${x.ocupado ? "Já está em outra função neste culto" : x.ultimo ? "Serviu no último culto, melhor deixar descansar" : x.uv ? `Serviu há ${x.dias} dias` : "Ainda não serviu"}</small></span>
            ${i === 0 && !x.ocupado && !x.ultimo ? `<em class="cpv-sug">Sugestão</em>` : ""}
          </button>`).join("") || `<div class="cpv-vazio">Nenhum diácono no grupo Diaconato ainda.</div>`}</div>
        ${atual[funcaoId] ? `<button type="button" class="cpv-btn linha largo" data-limpar>Deixar sem ninguém</button>` : ""}`, (fl, fechar) => {
        $$("[data-mid]", fl).forEach(b => b.addEventListener("click", () => { atual[funcaoId] = b.dataset.mid; fechar(); desenhar(); }));
        $("[data-limpar]", fl)?.addEventListener("click", () => { delete atual[funcaoId]; fechar(); desenhar(); });
      });
    }
    async function salvar() {
      const btn = $("[data-salvar]", sc); btn.disabled = true; btn.textContent = "Salvando…";
      try {
        let escalaId = esc0?.id;
        if (!escalaId) {
          const { data: nova, error } = await sb.from("igr_diac_escalas").insert({ igreja_id: state.igreja.id, data, horario: horario || "", titulo, criado_por_membro_id: m()?.id || null }).select().single();
          if (error) throw error; escalaId = nova.id;
        }
        const antigos = esc0?.igr_diac_itens || [];
        const remover = antigos.filter(i => atual[i.funcao_id] !== i.membro_id).map(i => i.id);
        const inserir = D.funcoes.filter(f => atual[f.id] && !antigos.some(i => i.funcao_id === f.id && i.membro_id === atual[f.id]))
          .map(f => ({ escala_id: escalaId, funcao_id: f.id, membro_id: atual[f.id] }));
        if (remover.length) { const { error } = await sb.from("igr_diac_itens").delete().in("id", remover); if (error) throw error; }
        if (inserir.length) { const { error } = await sb.from("igr_diac_itens").insert(inserir); if (error) throw error; }
        aviso("Escala salva. Os diáconos já veem no app.");
        editorDiac(data, horario, titulo);
      } catch (e) {
        btn.disabled = false; btn.textContent = "Salvar escala";
        aviso("Não foi possível salvar a escala. Tente de novo.", true);
      }
    }
    desenhar();
  }

  /* ============================================================
     REUNIÕES
     ============================================================ */
  function trilhas() {
    const t = [{ chave: "lideres", tipo: "lideres", nome: "Reunião de líderes", cor: "var(--s-coroa)" }, { chave: "pastores", tipo: "pastores", nome: "Pastores", cor: "var(--s-cruz)" }];
    (state.grupos || []).filter(g => g.tipo === "departamento" || g.tipo === "grupo").forEach(g => t.push({ chave: "g:" + g.id, tipo: "ministerio", grupoId: g.id, nome: g.nome, cor: "var(--s-calice)" }));
    return t;
  }
  async function reunioes() {
    const t = tela("tela-cpv-reunioes");
    const sc = $(".scroll", t);
    sc.innerHTML = topo("Reuniões", "Liderança alinhada", "tela-cpv-servir") + `<p class="hint">Carregando…</p>`;
    if (!liderReunioes()) { sc.innerHTML = topo("Reuniões", "Liderança alinhada", "tela-cpv-servir") + `<div class="cpv-vazio">Essa área é dos líderes, ministérios e pastores.</div>`; return; }
    const { data, error } = await sb.from("igr_reunioes").select("*").eq("igreja_id", state.igreja.id).order("data", { ascending: false }).limit(300);
    if (error) { sc.innerHTML = topo("Reuniões", "Liderança alinhada", "tela-cpv-servir") + `<div class="cpv-vazio">Não foi possível carregar as reuniões agora.</div>`; return; }
    const lista = data || [], h = hoje();
    const tr = trilhas().map(x => {
      const minhas = lista.filter(r => r.tipo === x.tipo && (x.tipo !== "ministerio" || r.grupo_id === x.grupoId));
      const passadas = minhas.filter(r => r.data <= h), futuras = minhas.filter(r => r.data > h).sort((a, b) => a.data.localeCompare(b.data));
      const ult = passadas[0], dias = ult ? diasEntre(ult.data, h) : null;
      return { ...x, ult, prox: futuras[0], dias, atrasada: !ult || dias > 30, minhas };
    }).sort((a, b) => (b.atrasada - a.atrasada) || ((b.dias ?? 9999) - (a.dias ?? 9999)));
    const atrasadas = tr.filter(x => x.atrasada && !x.prox);
    sc.innerHTML = topo("Reuniões", "Liderança alinhada", "tela-cpv-servir") + `
      <div class="cpv-alinhamento ${atrasadas.length ? "alerta" : "ok"}">
        <b>${atrasadas.length ? `${atrasadas.length} ${atrasadas.length === 1 ? "área está" : "áreas estão"} há mais de 30 dias sem reunião` : "Toda a liderança se reuniu nos últimos 30 dias"}</b>
        <small>${atrasadas.length ? "Marque uma data pra manter a igreja alinhada." : "Continue assim. A próxima reunião de cada área aparece aqui."}</small>
      </div>
      <button type="button" class="cpv-btn ouro largo" data-nova-reuniao>Registrar ou agendar reunião</button>
      <div class="cpv-lista cpv-trilhas">${tr.map(x => `
        <details class="cpv-trilha ${x.atrasada && !x.prox ? "atrasada" : ""}" style="--cor:${x.cor}">
          <summary>
            <span class="cpv-trilha-tx"><b>${esc(x.nome)}</b>
              <small>${x.ult ? `Última: ${dataCurta(x.ult.data)}` : "Nenhuma reunião registrada"}${x.prox ? ` · Próxima: ${dataCurta(x.prox.data)}` : ""}</small></span>
            <span class="cpv-pilula ${x.atrasada && !x.prox ? "ruim" : x.prox ? "agendada" : "boa"}">${x.prox && x.atrasada ? "Agendada" : !x.ult ? "Nunca" : x.dias > 30 ? `${x.dias} dias` : "Em dia"}</span>
          </summary>
          <div class="cpv-trilha-hist">${x.minhas.slice(0, 6).map(r => `
            <button type="button" class="cpv-reuniao-item" data-ver-reuniao="${r.id}"><b>${esc(r.titulo)}</b><small>${dataCurta(r.data)}${r.horario ? " · " + esc(r.horario.slice(0, 5)) : ""}${r.local ? " · " + esc(r.local) : ""}</small></button>`).join("") || `<p class="hint">Nada registrado ainda.</p>`}
            <button type="button" class="cpv-link" data-nova-reuniao="${x.chave}">Registrar reunião de ${esc(x.nome)}</button>
          </div>
        </details>`).join("")}</div>`;
    $$("[data-nova-reuniao]", sc).forEach(b => b.addEventListener("click", () => formReuniao(b.dataset.novaReuniao || "")));
    $$("[data-ver-reuniao]", sc).forEach(b => b.addEventListener("click", () => verReuniao(lista.find(r => r.id === b.dataset.verReuniao))));
  }

  async function verReuniao(r) {
    if (!r) return;
    const { data: pres } = await sb.from("igr_reuniao_presencas").select("presente, igr_membros(nome_completo)").eq("reuniao_id", r.id);
    const presentes = (pres || []).filter(p => p.presente).map(p => p.igr_membros?.nome_completo).filter(Boolean);
    folha(`<h3>${esc(r.titulo)}</h3><p class="hint">${dataCurta(r.data)}${r.horario ? " · " + esc(r.horario.slice(0, 5)) : ""}${r.local ? " · " + esc(r.local) : ""}</p>
      ${r.pauta ? `<h4>Pauta</h4><p class="cpv-texto">${esc(r.pauta).replace(/\n/g, "<br>")}</p>` : ""}
      ${r.decisoes ? `<h4>O que foi decidido</h4><p class="cpv-texto">${esc(r.decisoes).replace(/\n/g, "<br>")}</p>` : ""}
      ${presentes.length ? `<h4>Presentes (${presentes.length})</h4><p class="cpv-texto">${presentes.map(esc).join(", ")}</p>` : ""}
      <button type="button" class="cpv-btn linha largo" data-editar>Editar</button>
      <button type="button" class="cpv-btn linha largo perigo" data-excluir>Excluir reunião</button>`, (f, fechar) => {
      $("[data-editar]", f).addEventListener("click", () => { fechar(); formReuniao("", r); });
      $("[data-excluir]", f).addEventListener("click", async () => {
        if (!confirm("Excluir essa reunião?")) return;
        const { error } = await sb.from("igr_reunioes").delete().eq("id", r.id);
        if (error) return aviso("Não foi possível excluir.", true);
        fechar(); aviso("Reunião excluída."); reunioes();
      });
    });
  }

  async function formReuniao(chave, r) {
    const t = tela("tela-cpv-reuniao-form", "tela-cpv-reunioes");
    window.mostrarTela("tela-cpv-reuniao-form");
    const sc = $(".scroll", t);
    const tr = trilhas();
    const sel = r ? (r.tipo === "ministerio" ? "g:" + r.grupo_id : r.tipo) : (chave || "lideres");
    sc.innerHTML = topo(r ? "Editar reunião" : "Nova reunião", "Reuniões", "tela-cpv-reunioes") + `
      <form class="cpv-form" novalidate>
        <label class="cpv-rot">De quem é a reunião?
          <select class="cpv-campo" name="trilha">${tr.map(x => `<option value="${x.chave}" ${x.chave === sel ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
        <label class="cpv-rot">Título<input class="cpv-campo" name="titulo" required value="${esc(r?.titulo || "")}" placeholder="Ex.: Planejamento de dezembro"></label>
        <div class="cpv-dupla">
          <label class="cpv-rot">Data<input class="cpv-campo" type="date" name="data" required value="${r?.data || hoje()}"></label>
          <label class="cpv-rot">Horário<input class="cpv-campo" type="time" name="horario" value="${esc((r?.horario || "").slice(0, 5))}"></label>
        </div>
        <label class="cpv-rot">Local<input class="cpv-campo" name="local" value="${esc(r?.local || "")}" placeholder="Ex.: Sala pastoral"></label>
        <label class="cpv-rot">Pauta<textarea class="cpv-campo" name="pauta" rows="4" placeholder="Um assunto por linha">${esc(r?.pauta || "")}</textarea></label>
        <label class="cpv-rot">O que foi decidido<textarea class="cpv-campo" name="decisoes" rows="4" placeholder="Preencha depois da reunião">${esc(r?.decisoes || "")}</textarea></label>
        <fieldset class="cpv-presenca"><legend>Quem participou</legend><div class="cpv-presentes"><p class="hint">Carregando…</p></div></fieldset>
        <p class="cpv-erro" hidden></p>
        <button type="submit" class="cpv-btn ouro largo">${r ? "Salvar alterações" : "Salvar reunião"}</button>
      </form>`;
    const form = $("form", sc);
    let marcados = new Set();
    if (r) { const { data } = await sb.from("igr_reuniao_presencas").select("membro_id").eq("reuniao_id", r.id).eq("presente", true); marcados = new Set((data || []).map(p => p.membro_id)); }
    async function pessoas() {
      const x = tr.find(y => y.chave === form.trilha.value);
      let lista = [];
      if (x?.tipo === "ministerio") {
        const [{ data: a }, { data: v }] = await Promise.all([
          sb.from("igr_membros").select("id, nome_completo").eq("grupo_id", x.grupoId),
          sb.from("igr_membros_grupos").select("membro_id, igr_membros(id, nome_completo)").eq("grupo_id", x.grupoId),
        ]);
        lista = (a || []).concat((v || []).map(z => z.igr_membros).filter(Boolean));
      } else {
        const { data } = await sb.from("igr_membros").select("id, nome_completo").eq("igreja_id", state.igreja.id).eq("eh_lider", true);
        lista = data || [];
      }
      const vistos = new Set(); lista = lista.filter(p => !vistos.has(p.id) && vistos.add(p.id)).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
      $(".cpv-presentes", form).innerHTML = lista.map(p => `<label class="cpv-check-pessoa"><input type="checkbox" value="${p.id}" ${marcados.has(p.id) ? "checked" : ""}><span>${esc(p.nome_completo)}</span></label>`).join("") || `<p class="hint">Ninguém cadastrado nessa área ainda.</p>`;
      if (!r && !form.titulo.value) form.titulo.placeholder = `Ex.: ${x?.nome || "Reunião"} de ${new Date().toLocaleDateString("pt-BR", { month: "long" })}`;
    }
    form.trilha.addEventListener("change", pessoas); pessoas();
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const erro = $(".cpv-erro", form);
      if (!form.titulo.value.trim() || !form.data.value) { erro.hidden = false; erro.textContent = "Preencha o título e a data."; return; }
      const x = tr.find(y => y.chave === form.trilha.value);
      const payload = { igreja_id: state.igreja.id, tipo: x.tipo, grupo_id: x.grupoId || null, titulo: form.titulo.value.trim(), data: form.data.value, horario: form.horario.value || null, local: form.local.value.trim() || null, pauta: form.pauta.value.trim() || null, decisoes: form.decisoes.value.trim() || null };
      const btn = $("button[type=submit]", form); btn.disabled = true; btn.textContent = "Salvando…";
      let id = r?.id, error;
      if (id) ({ error } = await sb.from("igr_reunioes").update(payload).eq("id", id));
      else { const res = await sb.from("igr_reunioes").insert({ ...payload, criado_por_membro_id: m()?.id || null }).select().single(); error = res.error; id = res.data?.id; }
      if (!error) {
        const ids = $$(".cpv-presentes input:checked", form).map(i => i.value);
        await sb.from("igr_reuniao_presencas").delete().eq("reuniao_id", id);
        if (ids.length) ({ error } = await sb.from("igr_reuniao_presencas").insert(ids.map(mid => ({ reuniao_id: id, membro_id: mid, presente: true }))));
      }
      if (error) { btn.disabled = false; btn.textContent = "Salvar reunião"; erro.hidden = false; erro.textContent = "Não foi possível salvar. Verifique a internet e tente de novo."; return; }
      aviso("Reunião salva."); abrir("tela-cpv-reunioes");
    });
  }

  /* ============================================================
     OFERTAS (Pix + link de cartão do Mercado Pago)
     ============================================================ */
  function tlv(id, v) { return id + String(v.length).padStart(2, "0") + v; }
  function crc16(s) { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1; c &= 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, "0"); }
  const semAcento = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .-]/g, "").trim();
  function pixCopiaCola(chave, nome, cidade) {
    const base = tlv("00", "01") + tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", chave)) + tlv("52", "0000") + tlv("53", "986") + tlv("58", "BR")
      + tlv("59", semAcento(nome || "Igreja").slice(0, 25)) + tlv("60", semAcento(cidade || "Brasil").slice(0, 15)) + tlv("62", tlv("05", "***")) + "6304";
    return base + crc16(base);
  }
  async function copiar(txt, msg) {
    try { await navigator.clipboard.writeText(txt); aviso(msg); }
    catch (e) { const a = document.createElement("textarea"); a.value = txt; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); aviso(msg); } catch (x) { aviso("Copie manualmente: " + txt); } a.remove(); }
  }
  async function ofertas() {
    const t = tela("tela-cpv-ofertas", m() ? "tela-membro-home" : "tela-visitante");
    t.dataset.voltar = m() ? "tela-membro-home" : "tela-visitante";
    const sc = $(".scroll", t);
    const { data: ig } = await sb.from("igr_igrejas").select("*").eq("id", state.igreja.id).single();
    const g = ig || state.igreja;
    const temPix = !!g.pix_chave, link = g.doacao_link_cartao;
    const cc = temPix ? pixCopiaCola(g.pix_chave, g.pix_nome || g.nome, g.pix_cidade) : "";
    sc.innerHTML = topo("Ofertas e dízimos", "Contribua", t.dataset.voltar) + `
      <blockquote class="cpv-verso">Cada um dê conforme determinou em seu coração, não com tristeza nem por obrigação, pois Deus ama quem dá com alegria.<cite>2 Coríntios 9:7</cite></blockquote>
      <section class="cpv-oferta">
        <div class="cpv-oferta-cab"><span class="cpv-tile">${ci("c-pix")}</span><div><h2>Pix</h2><small>Sem taxa, cai na hora</small></div></div>
        ${temPix ? `
          <canvas class="cpv-qr" aria-label="QR Code do Pix da igreja"></canvas>
          <p class="cpv-chave"><small>Chave Pix</small><b>${esc(g.pix_chave)}</b><small>${esc(g.pix_nome || g.nome)}</small></p>
          <div class="cpv-dupla-btn">
            <button type="button" class="cpv-btn ouro" data-copiar-cc>Copiar Pix copia e cola</button>
            <button type="button" class="cpv-btn linha" data-copiar-chave>Copiar chave</button>
          </div>` : `<p class="cpv-vazio">A chave Pix da igreja ainda não foi cadastrada.</p>`}
      </section>
      <section class="cpv-oferta">
        <div class="cpv-oferta-cab"><span class="cpv-tile">${ci("c-cartao")}</span><div><h2>Cartão</h2><small>Crédito ou débito, pelo Mercado Pago</small></div></div>
        ${link ? `<a class="cpv-btn ouro largo" href="${esc(link)}" target="_blank" rel="noopener">Ofertar com cartão</a>` : `<button type="button" class="cpv-btn linha largo" disabled>Em breve</button>`}
      </section>
      ${podeOfertas() ? `
      <details class="cpv-config"><summary>Configurar ofertas</summary>
        <form class="cpv-form" novalidate>
          <label class="cpv-rot">Chave Pix<input class="cpv-campo" name="pix_chave" value="${esc(g.pix_chave || "")}" placeholder="CNPJ, e-mail, telefone ou chave aleatória"></label>
          <label class="cpv-rot">Nome de quem recebe<input class="cpv-campo" name="pix_nome" value="${esc(g.pix_nome || "")}" maxlength="25"></label>
          <label class="cpv-rot">Cidade<input class="cpv-campo" name="pix_cidade" value="${esc(g.pix_cidade || "")}" maxlength="15"></label>
          <label class="cpv-rot">Link do Mercado Pago (cartão)<input class="cpv-campo" name="doacao_link_cartao" value="${esc(link || "")}" placeholder="https://mpago.la/..."></label>
          <button type="submit" class="cpv-btn ouro largo">Salvar</button>
        </form>
      </details>` : ""}`;
    if (temPix && window.QRCode) QRCode.toCanvas($(".cpv-qr", sc), cc, { width: 220, margin: 1, color: { dark: "#14110E", light: "#F3E7D3" } }, () => {});
    $("[data-copiar-cc]", sc)?.addEventListener("click", () => copiar(cc, "Pix copia e cola copiado. Cole no app do seu banco."));
    $("[data-copiar-chave]", sc)?.addEventListener("click", () => copiar(g.pix_chave, "Chave Pix copiada."));
    $(".cpv-config form", sc)?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target, p = {};
      ["pix_chave", "pix_nome", "pix_cidade", "doacao_link_cartao"].forEach(k => p[k] = f[k].value.trim() || null);
      if (p.doacao_link_cartao && !/^https:\/\//.test(p.doacao_link_cartao)) return aviso("O link precisa começar com https://", true);
      const { error } = await sb.from("igr_igrejas").update(p).eq("id", state.igreja.id);
      if (error) return aviso("Não foi possível salvar.", true);
      aviso("Ofertas atualizadas."); ofertas();
    });
  }

  /* ============================================================
     "Você serve" na tela Hoje
     ============================================================ */
  async function cpvServe() {
    const hojeTela = $("#cpv-hoje"); if (!hojeTela || !m()) return;
    let box = $("#cpv-serve");
    if (!box) { box = document.createElement("section"); box.id = "cpv-serve"; $("#cpv-agora-box", hojeTela)?.after(box); }
    const h = hoje();
    const [diac, louv] = await Promise.all([
      sb.from("igr_diac_itens").select("id, status, funcao:igr_diac_funcoes(nome), escala:igr_diac_escalas!inner(data, horario, titulo, igreja_id)").eq("membro_id", m().id).gte("escala.data", h).eq("escala.igreja_id", state.igreja.id),
      sb.from("igr_louvor_escala_participantes").select("id, status, escala:igr_louvor_escalas!inner(data, horario, titulo, publicada)").eq("membro_id", m().id).gte("escala.data", h).eq("escala.publicada", true),
    ]);
    const itens = [
      ...((diac.data || []).map(i => ({ area: "Diaconato", cor: "var(--s-calice)", ic: "c-calice", tela: "tela-cpv-diaconato", funcao: i.funcao?.nome, ...i.escala, status: i.status }))),
      ...((louv.data || []).map(i => ({ area: "Louvor", cor: "var(--s-pomba)", ic: "c-musica", tela: "tela-membro-louvor", funcao: null, ...i.escala, status: i.status }))),
    ].sort((a, b) => a.data.localeCompare(b.data)).slice(0, 3);
    if (!itens.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<h2 class="cpv-sec">Você serve</h2><div class="cpv-serve-lista">${itens.map(i => `
      <button type="button" class="cpv-serve" style="--cor:${i.cor}" ${i.tela === "tela-cpv-diaconato" ? `data-cpv-ir="${i.tela}"` : `data-nav="${i.tela}"`}>
        <span class="cpv-area-ic">${ci(i.ic)}</span>
        <span class="cpv-serve-tx"><b>${esc(i.area)}${i.funcao ? ` · ${esc(i.funcao)}` : ""}</b><small>${dataCurta(i.data)}${i.horario ? " · " + esc(String(i.horario).slice(0, 5)) : ""}</small></span>
        ${i.status === "pendente" ? `<em class="cpv-pilula agendada">Confirmar</em>` : i.status === "confirmado" ? `<em class="cpv-pilula boa">Confirmado</em>` : ""}
      </button>`).join("")}</div>`;
  }
  window.cpvServe = cpvServe;

  /* ---------- Ícones extras ---------- */
  function icones() {
    const sv = $("#cpv-icones"); if (!sv || $("#c-pix", sv)) return;
    sv.insertAdjacentHTML("beforeend", `
      <symbol id="c-pix" viewBox="0 0 24 24"><path class="d" d="M12 2.8 21.2 12 12 21.2 2.8 12z"/><path d="M12 2.8 21.2 12 12 21.2 2.8 12z"/><path d="M8 9.5 10.5 12 8 14.5M16 9.5 13.5 12 16 14.5"/></symbol>
      <symbol id="c-cartao" viewBox="0 0 24 24"><rect class="d" x="2.5" y="5" width="19" height="14" rx="3"/><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6 15h4"/></symbol>
      <symbol id="c-oferta" viewBox="0 0 24 24"><path class="d" d="M4 13.5h3l4.5 1.5a2 2 0 0 0 0-4H9.5"/><path d="M2.5 12.5H7v8H2.5zM7 13.5h3l4.5 1.5a2 2 0 0 0 .6-3.9l-5.1-1.6H7M7 19l6 1.5 7.5-3.5a1.8 1.8 0 0 0-1.6-3.2L15 15.5"/><circle class="p" cx="17" cy="6" r="2.6"/></symbol>`);
  }

  /* ---------- Ligações com o resto do app ---------- */
  function ligar() {
    if (typeof window.mostrarTela !== "function" || window.mostrarTela.cpvMod) return;
    const anterior = window.mostrarTela;
    const nova = function (id) {
      const r = anterior.apply(this, arguments);
      if (id === "tela-membro-louvor") botaoVS();
      if (id === "tela-membro-home") setTimeout(cpvServe, 400);
      if (id === "tela-cpv-servir") ajustarServir();
      return r;
    };
    nova.cpvMod = true; nova.cpv = true;
    window.mostrarTela = nova;
  }
  function ajustarServir() {
    const r = $('#tela-cpv-servir [data-area="reunioes"]');
    if (r) r.hidden = !liderReunioes();
  }

  function iniciar() {
    icones(); ligar();
    let n = 0;
    (function esperar() {
      if (typeof state !== "undefined" && state.igreja) {
        if ($(".screen.active")?.id === "tela-membro-home") setTimeout(cpvServe, 600);
        ajustarServir();
        return;
      }
      if (n++ < 80) setTimeout(esperar, 150);
    })();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else setTimeout(iniciar, 0);
})();
