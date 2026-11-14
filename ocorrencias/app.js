/* Minhas Ocorrências · Pós-Vendas — DDS Inovação */
"use strict";

const SB_URL = "https://arffptuclrrzuzdrcmuc.supabase.co";
const SB_KEY = "sb_publishable_XCY3BoeUR_jzDSRrtlibyg_Os7lIrVi";
const META_TOTAL = 100;
const META_REL = 50;
const JANELA_DIAS = 5;
const LIMITE_REAB = 5; // acima disso a comissão cai
const FN_FOTOS = SB_URL + "/functions/v1/ocv-fotos";
const FN_MED = SB_URL + "/functions/v1/ocv-medidor";
// Padrão de fotos por tipo de cliente. multi = pode ter várias.
const FOTOS_BASE = [
  { k: "fachada", l: "Fachada" },
  { k: "estacionamento_bobtail", l: "Onde o bobtail estaciona" },
  { k: "caminho_mangueira", l: "Caminho da mangueira do bobtail" },
  { k: "frente_central", l: "Frente da central" },
  { k: "lateral_esquerda", l: "Lateral esquerda" },
  { k: "lateral_direita", l: "Lateral direita" },
  { k: "regulador_central", l: "Regulador da central" },
  { k: "magnetron", l: "Magnetron (nível de gás no dia)" },
];
const FOTOS_TIPO = {
  comercio: [{ k: "equipamentos", l: "Equipamentos", multi: true }],
  industria: [{ k: "equipamentos", l: "Equipamentos", multi: true }],
  condominio: [{ k: "abrigo_medidor", l: "Abrigo do medidor" }, { k: "corredor", l: "Corredor" }, { k: "medidor", l: "Medidor" }, { k: "regulador", l: "Regulador" }],
  residencia: [],
};
const TIPOS = [["comercio", "Comércio"], ["industria", "Indústria"], ["condominio", "Condomínio"], ["residencia", "Residência"]];
const FOTO_OUTRAS = { k: "outras", l: "Outras fotos", multi: true, opcional: true };

const S = {
  token: lsGet("ocv_token"),
  user: null,
  ocs: [],
  clientes: {},       // chave -> edição
  importacoes: [],
  reabs: [],
  notas: [],
  guias: {},
  visitas: {},
  config: {},
  medidores: [],
  medUrls: {},
  fotos: [],
  fotoUrls: {},
  view: "inicio",
  mesMeta: mesKey(new Date()),
  mesFin: new Date().getFullYear() + "-T" + Math.ceil((new Date().getMonth() + 1) / 3),
  filtroFin: { tipo: null, valor: null },
  prazoFiltro: { q: "", cidade: "", sub: "", janela: "todas" },
  rota: new Set(),
  depth: 0, modalOpen: false,
  relPeriodo: new Date().getFullYear() + "-T" + Math.ceil((new Date().getMonth() + 1) / 3),
  cliQ: "",
};

/* ---------------- utils ---------------- */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function jsArg(v) { return esc(JSON.stringify(v)); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function norm(s) { return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim(); }
function digits(s) { return String(s ?? "").replace(/\D/g, ""); }
function mesKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function mesNome(k) { const [y, m] = k.split("-"); return MESES[+m - 1] + " " + y; }
function fmtData(d) { if (!d) return "—"; d = new Date(d); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
function fmtDH(d) { if (!d) return "—"; d = new Date(d); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function toast(msg, ms = 2600) {
  document.querySelectorAll(".toast").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function title(s) {
  return String(s || "").toLowerCase().replace(/(^|\s|\/|-)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E|A|O|Para|Com|Ao)\b/g, w => w.toLowerCase());
}
function subCurta(s) { return title(String(s || "").replace(/^\[[^\]]+\]\s*/, "")).replace(/^Visit /, "Visita "); }
function subGrupo(s) { const m = String(s || "").match(/^\[([^\]]+)\]/); return m ? m[1] : ""; }
function isRel(o) { return norm(o.subclassificacao).includes("VISIT RELACIONAMENTO"); }
function isFin(o) { return norm(o.status) === "FINALIZADA" || (!!o.fechamento && norm(o.status) !== "ABERTA"); }

/* ---------------- API ---------------- */
async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
    body: JSON.stringify(args || {}),
  });
  const txt = await r.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok) {
    const msg = (data && data.message) || txt || "Erro de comunicação";
    if (/SESSAO_INVALIDA/.test(msg)) { sair(true); throw new Error("Sessão expirada. Entre novamente."); }
    throw new Error(msg);
  }
  return data;
}

/* ---------------- login ---------------- */
function setupLogin() {
  const boxes = [...document.querySelectorAll("#pinRow .pin-box")];
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      b.value = b.value.replace(/\D/g, "").slice(-1);
      if (b.value && i < 3) boxes[i + 1].focus();
      if (boxes.every(x => x.value)) document.getElementById("lgBtn").focus();
    });
    b.addEventListener("keydown", e => { if (e.key === "Backspace" && !b.value && i > 0) boxes[i - 1].focus(); });
    b.addEventListener("paste", e => {
      const d = digits(e.clipboardData.getData("text")).slice(0, 4);
      if (d.length) { e.preventDefault(); d.split("").forEach((c, k) => boxes[k] && (boxes[k].value = c)); boxes[Math.min(d.length, 3)].focus(); }
    });
  });
  const tel = document.getElementById("lgTel");
  tel.value = lsGet("ocv_tel") || "";
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const err = document.getElementById("lgErr"); err.textContent = "";
    const pin = boxes.map(b => b.value).join("");
    const btn = document.getElementById("lgBtn"); btn.disabled = true; btn.textContent = "Entrando…";
    try {
      const r = await rpc("ocv_login", { p_telefone: tel.value, p_pin: pin, p_lembrar: true });
      if (!r.ok) { err.textContent = r.erro; boxes.forEach(b => b.value = ""); boxes[0].focus(); return; }
      S.token = r.token; lsSet("ocv_token", r.token); lsSet("ocv_tel", tel.value);
      boxes.forEach(b => b.value = "");
      await iniciar();
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; btn.textContent = "Entrar"; }
  });
}
function mostrarLogin() {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login").classList.remove("hidden");
  setTimeout(() => { const t = document.getElementById("lgTel"); (t.value ? document.querySelector(".pin-box") : t).focus(); }, 50);
}
async function sair(silencioso) {
  if (!silencioso && S.token) { try { await rpc("ocv_logout", { p_token: S.token }); } catch (e) {} }
  S.token = null; lsSet("ocv_token", null); mostrarLogin();
}

/* ---------------- dados ---------------- */
async function carregar() {
  const d = await rpc("ocv_dados", { p_token: S.token });
  S.user = d.usuario;
  S.ocs = (d.ocorrencias || []).map(o => ({ ...o, _ab: o.abertura ? new Date(o.abertura) : null, _pz: o.prazo ? new Date(o.prazo) : null, _fe: o.fechamento ? new Date(o.fechamento) : null }));
  S.clientes = {}; (d.clientes || []).forEach(c => S.clientes[c.chave] = c);
  S.importacoes = d.importacoes || [];
  S.reabs = (d.reaberturas || []).map(r => ({ ...r, _em: new Date(r.em) }));
  S.notas = d.notas || [];
  S.fotos = d.fotos || [];
  S.guias = {}; (d.guias || []).forEach(g => S.guias[g.sub] = g);
  S.visitas = {}; (d.visitas || []).forEach(v => S.visitas[v.numero] = v);
  S.config = d.config || {};
  S.medidores = d.medidores || [];
}
async function iniciar() {
  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  try { await carregar(); } catch (e) { if (S.token) toast(e.message); return; }
  if (!S.ocs.length) S.view = "importar";
  S.depth = 0; try { history.replaceState(snap(), "", "#" + S.view); } catch (e) {}
  render();
}

/* ---------------- cliente / endereço ---------------- */
function cliente(o) {
  const ed = S.clientes[o.chave_cliente] || {};
  return {
    chave: o.chave_cliente,
    codigo: ed.codigo || o.cliente_codigo || "",
    nome: ed.nome || o.cliente_nome,
    logradouro: ed.logradouro || "", numero: ed.numero || "", complemento: ed.complemento || "",
    bairro: ed.bairro || title(o.bairro), cidade: ed.cidade || title(o.cidade), uf: ed.uf || ufSigla(o.uf), cep: ed.cep || "",
    telefone1: ed.telefone1 || "", telefone2: ed.telefone2 || "", contato: ed.contato || "", obs: ed.obs || "", email: ed.email || "",
    editado: !!S.clientes[o.chave_cliente],
  };
}
function ufSigla(u) { const n = norm(u); return ({ PARANA: "PR", "SAO PAULO": "SP", "SANTA CATARINA": "SC", "RIO GRANDE DO SUL": "RS" })[n] || u || ""; }
function enderecoCompleto(c) { return !!(c.logradouro && c.numero); }
function enderecoTexto(c) {
  const p = [];
  if (c.logradouro) p.push(c.logradouro + (c.numero ? ", " + c.numero : ""));
  if (c.bairro) p.push(c.bairro);
  if (c.cidade) p.push(c.cidade + (c.uf ? " - " + c.uf : ""));
  return p.join(", ") + (c.cep ? ", " + c.cep : "");
}
function linkMaps(c) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(enderecoTexto(c)); }
function linkWaze(c) { return "https://waze.com/ul?navigate=yes&q=" + encodeURIComponent(enderecoTexto(c)); }
function foneIntl(t) { let d = digits(t); if (d.startsWith("55") && d.length >= 12) d = d.slice(2); return d.length >= 10 ? "55" + d : ""; }
function linkZap(t) { const f = foneIntl(t); return f ? "https://wa.me/" + f : ""; }
function linkTel(t) { const d = digits(t); return d ? "tel:+" + (d.startsWith("55") ? d : "55" + d) : ""; }

/* ---------------- prazos ---------------- */
function situacao(o, agora = new Date()) {
  if (isFin(o)) return { cls: "s-done", pill: "p-gray", txt: "Finalizada", dias: null };
  if (!o._pz) return { cls: "", pill: "p-gray", txt: "Sem prazo", dias: null, grupo: 4 };
  const ms = o._pz - agora;
  const dias = ms / 864e5;
  if (ms < 0) return { cls: "s-red", pill: "p-red", txt: "Vencida", dias, grupo: 0 };
  const hoje = o._pz.toDateString() === agora.toDateString();
  if (hoje) return { cls: "s-red", pill: "p-red", txt: "Vence hoje", dias, grupo: 1 };
  if (dias <= 2) return { cls: "s-orange", pill: "p-orange", txt: "Até 2 dias", dias, grupo: 2 };
  if (dias <= JANELA_DIAS) return { cls: "s-yellow", pill: "p-yellow", txt: "Até 5 dias", dias, grupo: 3 };
  return { cls: "s-green", pill: "p-green", txt: "No prazo", dias, grupo: 4 };
}
function contagem(o) {
  const s = situacao(o);
  if (s.dias == null) return { d: "—", u: "" };
  const abs = Math.abs(s.dias);
  if (abs < 1) { const h = Math.max(0, Math.round(abs * 24)); return { d: h + "h", u: s.dias < 0 ? "atrasada" : "restantes" }; }
  const n = Math.floor(abs);
  return { d: n + "d", u: s.dias < 0 ? "atrasada" : (n === 1 ? "restante" : "restantes") };
}

/* ---------------- feriados / dias úteis ---------------- */
function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
function feriados(y) {
  const f = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(s => y + "-" + s);
  const p = pascoa(y); const add = n => { const d = new Date(p); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  f.push(add(-2), add(60)); // Sexta-feira Santa, Corpus Christi
  return new Set(f);
}
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function diasUteisRestantes(mk) {
  const [y, m] = mk.split("-").map(Number);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ini = new Date(y, m - 1, 1), fim = new Date(y, m, 0);
  let d = hoje > ini ? new Date(hoje) : ini; if (hoje > fim) return 0;
  const fer = feriados(y); let n = 0;
  for (; d <= fim; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w > 0 && w < 6 && !fer.has(ymd(d))) n++; }
  return n;
}

/* ---------------- reaberturas ---------------- */
// Regra: conta no dia em que foi reaberta (registrado pelas importações).
// Histórico anterior ao registro: estimado pelo mês do fechamento.
function reabsDoPeriodo(p) {
  const comEvento = new Set(S.reabs.map(r => r.numero));
  const porNum = new Map(S.ocs.map(o => [o.numero, o]));
  const out = [];
  S.reabs.forEach(r => { if (periodoDe(r._em, p)) out.push({ o: porNum.get(r.numero), em: r._em, fonte: "registrada", motivo: r.motivo }); });
  S.ocs.forEach(o => { if (o.reabertura > 0 && !comEvento.has(o.numero) && o._fe && periodoDe(o._fe, p)) out.push({ o, em: o._fe, fonte: "estimada" }); });
  return out.filter(x => x.o).sort((a, b) => b.em - a.em);
}
function reabertasAbertas() { return S.ocs.filter(o => o.reabertura > 0 && !isFin(o)); }
function nivelReab(n) {
  if (n === 0) return { cls: "green", pill: "p-green", txt: "Perfeito — nenhuma reabertura" };
  if (n <= LIMITE_REAB - 2) return { cls: "yellow", pill: "p-yellow", txt: `Atenção — restam ${LIMITE_REAB - n} até o limite` };
  if (n <= LIMITE_REAB) return { cls: "orange", pill: "p-orange", txt: n === LIMITE_REAB ? "No limite! A próxima reduz a comissão" : `Quase no limite — resta ${LIMITE_REAB - n}` };
  return { cls: "red", pill: "p-red", txt: `Limite estourado (${n}/${LIMITE_REAB}) — comissão reduzida` };
}
function vReaberturas() {
  const mk = S.mesReab || mesKey(new Date());
  const lista = reabsDoPeriodo(mk), n = lista.length, nv = nivelReab(n);
  const abertasR = reabertasAbertas();
  const meses = mesesDisponiveis().slice(0, 12).reverse();
  const serie = meses.map(m => ({ m, n: reabsDoPeriodo(m).length }));
  const max = Math.max(LIMITE_REAB + 2, ...serie.map(x => x.n));
  const abrev = m => MESES[+m.split("-")[1] - 1].slice(0, 3) + "/" + m.slice(2, 4);
  const inicio = S.reabs.length ? null : true;
  return `${btnVoltar()}
  <h2 class="page">Reaberturas</h2>
  <p class="sub">Limite: <b>${LIMITE_REAB} por mês</b>. Acima disso a comissão cai. O ideal é zero.</p>
  <div class="month-sel"><select onchange="S.mesReab=this.value;render()">${mesesDisponiveis().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${mesNome(m)}</option>`).join("")}</select></div>
  <div class="card reab-card r-${nv.cls}">
    <div class="reab-n">${n}<small>/${LIMITE_REAB}</small></div>
    <div><div style="font-weight:800;font-size:16px">Reaberturas em ${mesNome(mk)}</div>
      <span class="pill ${nv.pill}" style="margin-top:6px">${nv.txt}</span>
      <div class="reab-track"><div style="width:${Math.min(100, n / LIMITE_REAB * 100)}%"></div></div></div>
  </div>
  ${abertasR.length ? `<div class="section-title">Reabertas ainda em aberto — resolva primeiro <span class="count">${abertasR.length}</span></div>
    ${abertasR.sort((a, b) => (a._pz || 0) - (b._pz || 0)).map(o => ocCard(o)).join("")}` : ""}
  <div class="section-title">Histórico mês a mês</div>
  <div class="card"><div class="reab-chart">
    ${serie.map(x => { const c = nivelReab(x.n).cls; return `<div class="col" onclick="S.mesReab='${x.m}';render()"><div class="bx"><div class="b b-${c}" style="height:${x.n / max * 100}%"><span>${x.n}</span></div></div><div class="cl ${x.m === mk ? "on" : ""}">${abrev(x.m)}</div></div>`; }).join("")}
    <div class="lim" style="bottom:calc(24px + ${LIMITE_REAB / max * 120}px)"><span>limite ${LIMITE_REAB}</span></div>
  </div></div>
  <div class="section-title">Reabertas em ${mesNome(mk)} <span class="count">${n}</span></div>
  ${n ? lista.map(x => `<div class="reab-item"><span class="pill ${x.fonte === "registrada" ? "p-red" : "p-gray"}">${x.fonte === "registrada" ? "Reaberta " + fmtDH(x.em) : "Estimada · fechada " + fmtData(x.em)}</span>${ocCard(x.o, { rota: false })}</div>`).join("") : `<div class="card empty">Nenhuma reabertura neste mês. 👏</div>`}
  <p class="sub" style="margin-top:16px;font-size:12.5px">A data exata é registrada a partir de 11/11/2026: quando a planilha do dia mostra uma ocorrência como reaberta (ou de volta de Finalizada para Aberta), o sistema grava o dia. Antes disso, o mês é estimado pelo fechamento.</p>`;
}

/* ---------------- render shell ---------------- */
const ICONS = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  prazos: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  finalizadas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  clientes: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 100-6M22 21c0-3-2-5-5-5.5"/>',
  importar: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/>',
  rota: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 000-7H7a3.5 3.5 0 010-7h8.5"/>',
  guia: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/>',
  reaberturas: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
};
const NAV = [["inicio", "Início"], ["prazos", "Ocorrências"], ["finalizadas", "Resultados"], ["rota", "Rota"], ["guia", "Guia"], ["reaberturas", "Reaberturas"], ["importar", "Importar"]];
function svgI(k) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`; }
function snap() { return { v: S.view, pf: { ...S.prazoFiltro }, mf: S.mesFin, ff: { ...S.filtroFin }, mm: S.mesMeta, rp: S.relPeriodo, d: S.depth }; }
function aplicar(st) {
  S.view = st.v || "inicio"; if (st.pf) S.prazoFiltro = { ...st.pf }; if (st.mf) S.mesFin = st.mf;
  if (st.ff) S.filtroFin = { ...st.ff }; if (st.mm) S.mesMeta = st.mm; if (st.rp) S.relPeriodo = st.rp; S.depth = st.d || 0;
}
function go(v, muda) {
  if (typeof muda === "function") muda();
  S.view = v; S.depth = (S.depth || 0) + 1;
  try { history.pushState(snap(), "", "#" + v); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
function irAba(v, muda) {
  if (typeof muda === "function") muda();
  S.view = v; S.depth = 0;
  try { history.pushState(snap(), "", "#" + v); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
function voltar() { if (S.depth > 0) history.back(); else go("inicio"); }
function btnVoltar() { return S.depth > 0 ? `<button class="back no-print" onclick="voltar()">‹ Voltar</button>` : ""; }
window.addEventListener("popstate", e => {
  if (S.modalOpen) { fecharModal(true); return; }
  aplicar(e.state || { v: "inicio", d: 0 }); render(); window.scrollTo(0, 0);
});
function abrirPrazos(janela, sub) { go("prazos", () => { S.prazoFiltro = { q: "", cidade: "", sub: sub || "", janela: janela || "todas", st: "ab", per: "todos" }; }); }
function abrirOcsFin(extra) { go("prazos", () => { S.prazoFiltro = { q: "", cidade: "", sub: "", janela: "todas", st: "fin", per: "todos", ...extra }; }); }
function abrirFinalizadas(periodo, filtro) { go("finalizadas", () => { S.mesFin = periodo || S.mesFin; S.filtroFin = filtro || { tipo: null }; }); }
function renderNav() {
  const urg = abertas().filter(o => { const s = situacao(o); return s.grupo != null && s.grupo <= 3; }).length;
  const btn = ([k, l]) => `<button class="tab ${S.view === k ? "on" : ""}" onclick="irAba('${k}'${k === "guia" ? `,()=>{S.guiaSub=null;S.guiaNumero=null}` : k === "prazos" ? `,()=>S.prazoFiltro={q:'',cidade:'',sub:'',janela:'todas',st:'ab',per:'todos'}` : ""})">${svgI(k)}<span>${l}</span>${k === "prazos" && urg ? `<span class="dot">${urg}</span>` : ""}${k === "reaberturas" && reabsDoPeriodo(mesKey(new Date())).length ? `<span class="dot">${reabsDoPeriodo(mesKey(new Date())).length}</span>` : ""}</button>`;
  document.getElementById("tabs").innerHTML = NAV.filter(n => !["importar", "reaberturas", "guia"].includes(n[0])).map(btn).join("");
  const ult = S.importacoes[0];
  document.getElementById("side").innerHTML = `<div class="brand">Minhas Ocorrências<small>Pós-Vendas · ${esc(S.user?.nome || "")}</small></div>
    ${NAV.map(btn).join("")}
    <div class="foot">${ult ? "Última importação:<br>" + fmtDH(ult.em) + "<br><br>" : ""}<button onclick="trocarPin()">Trocar PIN</button> · <button onclick="sair()">Sair</button></div>`;
  document.getElementById("topSub").textContent = ult ? "Atualizado " + fmtDH(ult.em) : "Pós-Vendas";
}
function render() {
  renderNav();
  const v = document.getElementById("view");
  const fn = { inicio: vInicio, prazos: vPrazos, finalizadas: vFinalizadas, clientes: vClientes, importar: vImportar, relatorio: vRelatorio, reaberturas: vReaberturas, rota: vRota, fotos: vFotos, guia: vGuia, medidores: vMedidores }[S.view] || vInicio;
  v.innerHTML = fn();
  if (S.view === "importar") bindImport();
  if (S.view === "rota") autoOtimizar();
  renderRotaBar();
}
// Ao abrir a rota de uma cidade, organiza sozinha: onde estou → paradas na melhor ordem → base
function autoOtimizar() {
  if ((S.rotaModo || "rota") !== "rota" || !S.rotaCidade || S.rotaTrocar || !baseRota() || S.otimRodando) return;
  const sig = rotaSig();
  if ((S.rotaOtim && S.rotaOtim.sig === sig) || S.otimTentado === sig) return;
  if (!(S._paradas || []).some(p => !S.rotaFora.has(p.k))) return;
  S.otimTentado = sig; setTimeout(otimizarRota, 60);
}
function abertas() { return S.ocs.filter(o => !isFin(o)); }
function finalizadas() { return S.ocs.filter(isFin); }

/* ---------------- INÍCIO ---------------- */
function ring(val, meta, cor) {
  const r = 50, c = 2 * Math.PI * r, p = Math.min(1, val / meta);
  return `<div class="ring"><svg width="118" height="118" viewBox="0 0 118 118">
    <circle cx="59" cy="59" r="${r}" stroke="#eef1f5" stroke-width="12" fill="none"/>
    <circle cx="59" cy="59" r="${r}" stroke="${cor}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>
    <div class="center"><div class="big">${val}</div><div class="of">de ${meta}</div></div></div>`;
}
function mesesDisponiveis() {
  const s = new Set([mesKey(new Date())]);
  S.ocs.forEach(o => { if (o._fe) s.add(mesKey(o._fe)); });
  return [...s].sort().reverse();
}
function vInicio() {
  const mk = S.mesMeta, atual = mk === mesKey(new Date());
  const finMes = finalizadas().filter(o => o._fe && mesKey(o._fe) === mk);
  const relMes = finMes.filter(isRel).length, totMes = finMes.length;
  const ab = abertas();
  const relAb = ab.filter(isRel).length;
  const venc = ab.filter(o => situacao(o).grupo === 0);
  const prox = ab.filter(o => { const g = situacao(o).grupo; return g >= 1 && g <= 3; });
  const visF = visitadasAFechar().length;
  const du = diasUteisRestantes(mk);
  const fT = Math.max(0, META_TOTAL - totMes), fR = Math.max(0, META_REL - relMes);
  const porDia = f => atual && du > 0 && f > 0 ? Math.ceil(f / du) : 0;
  const hora = new Date().getHours();
  const saud = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const nome = (S.user?.nome || "").split(" ")[0];
  const nR = reabsDoPeriodo(mk).length, nv = nivelReab(nR), ra = reabertasAbertas().length;
  const mini = (val, meta, cor) => { const r = 34, c = 2 * Math.PI * r, p = Math.min(1, val / meta);
    return `<svg viewBox="0 0 84 84" class="d-ring"><circle cx="42" cy="42" r="${r}" stroke="rgba(255,255,255,.14)" stroke-width="9" fill="none"/><circle cx="42" cy="42" r="${r}" stroke="${cor}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle">${Math.round(p * 100)}%</text></svg>`; };
  const meta = (tit, val, m, f, cor, onc) => `<button class="d-meta" onclick="${onc}">${mini(val, m, cor)}
    <div><small>${tit}</small><b>${val}<i>/${m}</i></b><span>${f ? `faltam ${f}${porDia(f) ? ` · ${porDia(f)}/dia` : ""}` : "meta batida 🎉"}</span></div></button>`;
  const porSub = Object.entries(ab.reduce((m, o) => { m[o.subclassificacao] = (m[o.subclassificacao] || 0) + 1; return m; }, {}))
    .sort((a, b) => (isRel({ subclassificacao: b[0] }) - isRel({ subclassificacao: a[0] })) || b[1] - a[1]);
  const maxS = porSub[0] ? Math.max(...porSub.map(x => x[1])) : 1;
  return `
  <section class="d-hero">
    <div class="d-top"><div><small>${saud}${nome ? ", " + esc(nome) : ""}</small><h2>${atual ? "Seu mês" : mesNome(mk)}</h2></div>
      <label class="d-mes">🗓 ${esc(mesNome(mk))}<select onchange="S.mesMeta=this.value;render()">${mesesDisponiveis().map(m => `<option value="${m}" ${m === mk ? "selected" : ""}>${mesNome(m)}</option>`).join("")}</select></label></div>
    <div class="d-metas">
      ${meta("★ Relac.", relMes, META_REL, fR, "#c4b5fd", "abrirOcsFin({per:'" + mk + "',sub:'__REL__'})")}
      ${meta("Finalizadas", totMes, META_TOTAL, fT, "#93c5fd", "abrirOcsFin({per:'" + mk + "'})")}
    </div>
    ${atual && du ? `<div class="d-du">${du} dias úteis restantes no mês</div>` : ""}
  </section>

  <button class="d-reab r-${nv.cls}" onclick="go('reaberturas',()=>S.mesReab='${mk}')">
    <div class="d-reab-n">${nR}<i>/${LIMITE_REAB}</i></div>
    <div class="d-reab-b"><b>Reaberturas</b><span>${nv.txt}${ra ? ` · ${ra} ainda aberta${ra > 1 ? "s" : ""}` : ""}</span>
      <div class="d-track">${Array.from({ length: LIMITE_REAB }, (_, i) => `<i class="${i < nR ? "on" : ""}"></i>`).join("")}</div></div>
    <em>›</em></button>

  <div class="d-label">Abertas agora</div>
  <div class="d-kpis">
    <button class="d-k red" onclick="abrirPrazos('vencidas')"><b>${venc.length}</b><span>Vencidas</span></button>
    <button class="d-k orange" onclick="abrirPrazos('prox')"><b>${prox.length}</b><span>Até ${JANELA_DIAS} dias</span></button>
    <button class="d-k green" onclick="abrirPrazos('visitadas')"><b>${visF}</b><span>Visitadas a fechar</span></button>
    <button class="d-k" onclick="abrirPrazos('todas')"><b>${ab.length}</b><span>Total aberto</span></button>
  </div>

  <div class="d-label">Por tipo <span>${relAb ? `★ ${relAb} de relacionamento` : ""}</span></div>
  <div class="d-card">${porSub.map(([k, v]) => { const u = ab.filter(o => o.subclassificacao === k && situacao(o).grupo <= 3).length, rel = isRel({ subclassificacao: k });
    return `<button class="d-bar ${rel ? "rel" : ""}" onclick='abrirPrazos("todas",${jsArg(k)})'><span class="t">${esc(subCurta(k))}</span><span class="n">${v}${u ? `<i>${u}!</i>` : ""}</span><span class="tr"><span style="width:${v / maxS * 100}%"></span></span></button>`; }).join("") || '<div class="empty" style="padding:14px">Nenhuma aberta. 👏</div>'}</div>

  <div class="d-links">
    <button onclick="go('guia',()=>{S.guiaSub=null;S.guiaNumero=null})"><span>📘</span>Guia de fechamento</button>
    <button onclick="go('relatorio')"><span>📄</span>Relatório PDF</button>
    <button onclick="go('importar')"><span>⬇️</span>Importar planilha</button>
  </div>`;
}

/* ---------------- card ocorrência ---------------- */
function ocCard(o, opts = {}) {
  const s = situacao(o), c = cliente(o), cd = contagem(o), fin = isFin(o);
  const z = linkZap(c.telefone1), tel = linkTel(c.telefone1);
  const aprox = !enderecoCompleto(c);
  const vis = !fin && visitada(o);
  const nMed = S.medidores.filter(m => m.chave_cliente === o.chave_cliente).length;
  const stF = statusFotos(o.chave_cliente);
  const ns = S.notas.filter(n => n.numero === o.numero);
  const tool = (ic, lb, attrs, extra = "") => `<${attrs.startsWith("href") ? "a" : "button"} class="tool${extra}" ${attrs}><i>${ic}</i><span>${lb}</span></${attrs.startsWith("href") ? "a" : "button"}>`;
  return `<div class="oc ${s.cls} ${vis ? "visitada" : ""}">
    <div class="oc-head">
      ${!fin && opts.rota !== false ? `<input type="checkbox" class="chk" title="Adicionar à rota" ${S.rota.has(o.numero) ? "checked" : ""} onchange="toggleRota(${o.numero},this.checked)">` : ""}
      <div class="top">
        <span class="pill ${s.pill}">${s.txt}</span>
        ${isRel(o) ? '<span class="pill p-purple">★ Relac.</span>' : ""}
        ${o.reabertura ? '<span class="pill p-orange">Reaberta</span>' : ""}
        ${ns.length ? `<span class="pill p-gray">📝 ${ns.length}</span>${ns.some(n => n.irregularidade) ? '<span class="pill p-red">⚠ Irregular</span>' : ""}` : ""}
      </div>
      ${!fin ? `<div class="due"><b style="color:var(--${s.pill.slice(2)})">${cd.d}</b> <span>${cd.u}</span></div>` : ""}
    </div>
    <div class="sub-oc">${esc(subCurta(o.subclassificacao))}</div>
    <div class="name" onclick="abrirFicha(${jsArg(o.chave_cliente)})">${esc(c.nome)}</div>
    <div class="meta">
      <span>Oc. <b>${o.numero}</b></span>
      ${c.codigo ? `<span>Cód. <b>${esc(c.codigo)}</b></span>` : '<span class="pill p-gray">sem código</span>'}
      ${fin ? `<span>Fechada <b>${fmtDH(o.fechamento)}</b></span>` : `<span>Prazo <b>${fmtDH(o.prazo)}</b></span>`}
    </div>
    <div class="meta loc">📍 ${esc([c.bairro, c.cidade].filter(Boolean).join(" · ")) || "sem endereço"}${aprox ? ' <em title="Só bairro e cidade — Maps/Waze aproximado">· aprox.</em>' : ""}</div>
    ${vis ? `<div class="vis-tag">✅ Visitada ${fmtData(vis.visitada_em)} · falta fechar no Salesforce</div>` : ""}
    ${fin && o.solucao && opts.sol ? `<div class="sol">${esc(o.solucao.slice(0, 260))}${o.solucao.length > 260 ? "…" : ""}</div>` : ""}
    ${!fin ? `<div class="main-acts">
      <button class="btn" style="background:#0b1f3a" onclick="abrirGuia(${o.numero})">📘 Fechar ocorrência</button>
      ${vis ? `<button class="btn ghost" onclick="if(confirm('Desmarcar a visita desta ocorrência?'))marcarVisita(${o.numero},false)">↩ Desmarcar</button>`
        : `<button class="btn" style="background:var(--green)" onclick="marcarVisita(${o.numero},true)">✅ Marcar visitada</button>`}
    </div>` : ""}
    <div class="tools">
      ${tool("🗺️", "Maps", `href="${linkMaps(c)}" target="_blank" rel="noopener"`)}
      ${tool("🚗", "Waze", `href="${linkWaze(c)}" target="_blank" rel="noopener"`)}
      ${z ? tool("💬", "WhatsApp", `href="${z}" target="_blank" rel="noopener"`, " zap") : ""}
      ${tel ? tool("📞", "Ligar", `href="${tel}"`) : ""}
      ${!fin ? tool("📟", `Medidor${nMed ? " " + nMed : ""}`, `onclick="abrirMedidores(${jsArg(o.chave_cliente)},${o.numero})"`) : ""}
      ${tool("📷", `Fotos${stF.n ? ` ${stF.ok}/${stF.total}` : ""}`, `onclick="abrirFotos(${jsArg(o.chave_cliente)},${o.numero})"`)}
      ${tool("✏️", "Editar", `onclick="abrirFicha(${jsArg(o.chave_cliente)},true)"`)}
    </div>
  </div>`;
}

/* ---------------- PRAZOS ---------------- */
function vPrazos() {
  const f = S.prazoFiltro; if (!f.st) f.st = "ab"; if (!f.per) f.per = "todos";
  const ab = abertas(), fins = finalizadas().filter(o => f.per === "todos" || periodoDe(o._fe, f.per));
  const univ = f.st === "ab" ? ab : f.st === "fin" ? fins : ab.concat(fins);
  const cidades = [...new Set(univ.map(o => title(o.cidade)).filter(Boolean))].sort();
  const subs = [...new Set(univ.map(o => o.subclassificacao))].sort();
  const passaComum = o => {
    if (f.cidade && title(o.cidade) !== f.cidade) return false;
    if (f.sub === "__REL__" && !isRel(o)) return false;
    if (f.sub === "__REAB__" && !(o.reabertura > 0)) return false;
    if (f.sub && !f.sub.startsWith("__") && o.subclassificacao !== f.sub && subCurta(o.subclassificacao) !== f.sub) return false;
    if (f.q) { const q = norm(f.q), c = cliente(o); if (!norm([o.numero, c.nome, c.codigo, c.bairro, c.cidade, c.telefone1, o.ticket, o.solucao].join(" ")).includes(q)) return false; }
    return true;
  };
  const passaJan = o => {
    const s = situacao(o), j = f.janela;
    if (j === "vencidas" && s.grupo !== 0) return false;
    if (/^g\d$/.test(j) && s.grupo !== +j[1]) return false;
    if (j === "urgentes" && !(s.grupo <= 3)) return false;
    if (j === "prox" && !(s.grupo >= 1 && s.grupo <= 3)) return false;
    if (j === "visitadas" && !visitada(o)) return false;
    if (j === "naovisitadas" && visitada(o)) return false;
    return true;
  };
  const baseAb = f.st === "fin" ? [] : ab.filter(passaComum);
  const listaAb = baseAb.filter(passaJan).sort((a, b) => (a._pz || 9e15) - (b._pz || 9e15));
  const listaFin = f.st === "ab" ? [] : fins.filter(passaComum).sort((a, b) => b._fe - a._fe);
  const total = listaAb.length + listaFin.length;
  const cnt = g => baseAb.filter(o => situacao(o).grupo === g).length;
  const grupos = [["Vencidas", 0, "red", "Vencidas"], ["Vencem hoje", 1, "orange", "Hoje"], ["Até 2 dias", 2, "orange", "2 dias"], ["Até 5 dias", 3, "yellow", "5 dias"], ["Mais de 5 dias", 4, "green", "Depois"]];
  const nVis = baseAb.filter(o => visitada(o)).length;
  const jan = f.janela === "vencidas" ? "g0" : f.janela;
  const tile = (k, n, l, cor) => `<button class="ag-t ${cor} ${jan === k ? "on" : ""}" onclick="S.prazoFiltro.janela=${jan === k ? "'todas'" : `'${k}'`};render()"><b>${n}</b><span>${l}</span></button>`;
  const nFil = (f.cidade ? 1 : 0) + (f.sub ? 1 : 0) + (f.st !== "ab" && f.per !== "todos" ? 1 : 0);
  const subNome = f.sub === "__REL__" ? "★ Relacionamento" : f.sub === "__REAB__" ? "↺ Reabertas" : subCurta(f.sub);
  const jNome = f.st === "fin" ? null : { urgentes: `Vencidas + ${JANELA_DIAS} dias`, prox: `Próximos ${JANELA_DIAS} dias`, naovisitadas: "Não visitadas" }[f.janela];
  const P = periodosDisponiveis(), optP = v => `<option value="${v}" ${v === f.per ? "selected" : ""}>${esc(periodoNome(v))}</option>`;
  const stBtn = (k, l, n) => `<button class="${f.st === k ? "on" : ""}" onclick="S.prazoFiltro.st='${k}';${k === "fin" ? "S.prazoFiltro.janela='todas';" : ""}render()">${l} <small>${n}</small></button>`;
  const porMes = {}; listaFin.forEach(o => { const k = mesKey(o._fe); (porMes[k] = porMes[k] || []).push(o); });
  return `
  ${btnVoltar()}<div class="ag-head"><h2 class="page">Ocorrências</h2><span>${total} na lista</span></div>
  <div class="seg st">${stBtn("ab", "Abertas", ab.length)}${stBtn("fin", "Finalizadas", fins.length)}${stBtn("todas", "Todas", ab.length + fins.length)}</div>
  ${f.st !== "fin" ? `<div class="ag-strip">
    ${grupos.map(([, g, c, l]) => tile("g" + g, cnt(g), l, c)).join("")}
    ${tile("visitadas", nVis, "Visitadas", "blue")}
  </div>` : ""}
  <div class="ag-bar">
    <div class="ag-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input placeholder="Cliente, código, nº, telefone, texto…" value="${esc(f.q)}" oninput="S.prazoFiltro.q=this.value;debRender()"></div>
    <button class="ag-fbtn ${S.agFiltros || nFil ? "on" : ""}" onclick="S.agFiltros=!S.agFiltros;render()">⚙︎${nFil ? `<i>${nFil}</i>` : ""}</button>
  </div>
  ${S.agFiltros ? `<div class="ag-pan">
    <select class="input" onchange="S.prazoFiltro.cidade=this.value;render()">${[["", "Todas as cidades"], ...cidades.map(c => [c, c])].map(([v, l]) => `<option value="${esc(v)}" ${v === f.cidade ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
    <select class="input" onchange="S.prazoFiltro.sub=this.value;render()">${[["", "Todos os tipos"], ["__REL__", "★ Só Relacionamento"], ["__REAB__", "↺ Só reabertas"], ...subs.map(x => [x, subCurta(x)])].map(([v, l]) => `<option value="${esc(v)}" ${v === f.sub || (f.sub && !v.startsWith("__") && subCurta(v) === f.sub) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
    ${f.st !== "ab" ? `<select class="input" style="grid-column:1/-1" onchange="S.prazoFiltro.per=this.value;render()"><option value="todos" ${f.per === "todos" ? "selected" : ""}>Finalizadas: todo o histórico</option><optgroup label="Meses">${P.meses.map(optP).join("")}</optgroup><optgroup label="Trimestres">${P.tri.map(optP).join("")}</optgroup><optgroup label="Anos">${P.anos.map(optP).join("")}</optgroup></select>` : ""}
  </div>` : ""}
  ${f.cidade || f.sub || jNome || (f.st !== "ab" && f.per !== "todos") ? `<div class="ag-chips">
    ${jNome ? `<button onclick="S.prazoFiltro.janela='todas';render()">${jNome} ✕</button>` : ""}
    ${f.st !== "ab" && f.per !== "todos" ? `<button onclick="S.prazoFiltro.per='todos';render()">🗓 ${esc(periodoNome(f.per))} ✕</button>` : ""}
    ${f.cidade ? `<button onclick="S.prazoFiltro.cidade='';render()">📍 ${esc(f.cidade)} ✕</button>` : ""}
    ${f.sub ? `<button onclick="S.prazoFiltro.sub='';render()">${esc(subNome)} ✕</button>` : ""}
    ${f.cidade && f.st !== "fin" ? `<button class="go" onclick='go("rota",()=>{S.rotaCidade=${jsArg(f.cidade)};S.rotaFiltro="todas";S.rotaFora=new Set()})'>🗺️ Rota de ${esc(f.cidade)}</button>` : ""}
  </div>` : ""}
  ${grupos.map(([nome, g, c]) => {
    const it = listaAb.filter(o => situacao(o).grupo === g);
    return it.length ? `<div class="ag-sec ${c}"><i></i>${nome}<span>${it.length}</span></div>${it.map(o => ocCard(o)).join("")}` : "";
  }).join("")}
  ${Object.keys(porMes).sort().reverse().map(k => `<div class="ag-sec fin"><i></i>Finalizadas · ${esc(mesNome(k))}<span>${porMes[k].length}</span></div>${porMes[k].map(o => ocCard(o, { sol: true, rota: false })).join("")}`).join("")}
  ${total ? "" : `<div class="card empty">Nada por aqui com esses filtros.</div>`}`;
}
let _deb; function debRender() { clearTimeout(_deb); _deb = setTimeout(() => { const a = document.activeElement, pos = a && a.selectionStart; render(); const i = document.querySelector("#view .ag-search input, #view .toolbar input"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} } }, 250); }

/* ---------------- ROTA ---------------- */
function toggleRota(n, on) { on ? S.rota.add(n) : S.rota.delete(n); renderRotaBar(); }
function selecionarTodosRota() {
  document.querySelectorAll("#view .oc .chk").forEach(ch => { if (!ch.checked) { ch.checked = true; ch.dispatchEvent(new Event("change")); } });
}
function renderRotaBar() {
  let bar = document.getElementById("rotaBar");
  if (!S.rota.size || S.view === "importar") { bar && bar.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "rotaBar"; bar.className = "route-bar"; document.body.appendChild(bar); }
  bar.innerHTML = `<div style="flex:1;font-size:14px"><b>${S.rota.size}</b> parada${S.rota.size > 1 ? "s" : ""} na rota${S.rota.size > 10 ? "<br><small>O Maps aceita até 10 por vez — vou dividir</small>" : ""}</div>
    <button class="btn sm" onclick="abrirRota()">🗺️ Abrir rota</button>
    <button class="btn sm" style="background:transparent;color:#fff" onclick="S.rota.clear();render()">Limpar</button>`;
}
function abrirRota() {
  const ocs = S.ocs.filter(o => S.rota.has(o.numero));
  // agrupa paradas no mesmo endereço
  const vistos = new Map();
  ocs.forEach(o => { const t = enderecoTexto(cliente(o)); if (!vistos.has(t)) vistos.set(t, o); });
  const ends = [...vistos.keys()];
  const partes = []; for (let i = 0; i < ends.length; i += 10) partes.push(ends.slice(i, i + 10));
  const url = p => "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(p[p.length - 1]) +
    (p.length > 1 ? "&waypoints=" + encodeURIComponent(p.slice(0, -1).join("|")) : "");
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>Rota do dia</h3>
    <p class="sub">${ends.length} endereço${ends.length > 1 ? "s" : ""} · partindo da sua localização atual</p>
    ${ends.some((e, i) => !enderecoCompleto(cliente(vistos.get(e)))) ? `<div class="info-box">Alguns clientes ainda não têm rua e número cadastrados — nesses a parada fica no bairro. Edite a ficha para deixar a rota exata.</div>` : ""}
    <ol style="padding-left:20px;font-size:14px">${ends.map(e => `<li style="margin-bottom:6px"><b>${esc(cliente(vistos.get(e)).nome)}</b><br><span style="color:var(--muted)">${esc(e)}</span></li>`).join("")}</ol>
    ${partes.map((p, i) => `<a class="btn block" style="margin-top:8px" href="${url(p)}" target="_blank" rel="noopener">🗺️ Abrir no Google Maps${partes.length > 1 ? ` (parte ${i + 1} de ${partes.length})` : ""}</a>`).join("")}
    <p class="sub" style="margin-top:12px;font-size:12.5px">Dica: no Google Maps, toque em “⋮ → Otimizar ordem das paradas” se disponível.</p>`);
}

/* ---------------- ROTA POR CIDADE ---------------- */
function urlRota(ends) {
  return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(ends[ends.length - 1]) +
    (ends.length > 1 ? "&waypoints=" + encodeURIComponent(ends.slice(0, -1).join("|")) : "");
}
function cidadesAbertas() {
  const m = {};
  abertas().forEach(o => { const c = title(o.cidade) || "Sem cidade"; m[c] = m[c] || { c, n: 0, urg: 0, rel: 0 }; m[c].n++; if (situacao(o).grupo <= 3) m[c].urg++; if (isRel(o)) m[c].rel++; });
  return Object.values(m).sort((a, b) => b.urg - a.urg || b.n - a.n);
}
function visitadasNaCidade(cidade) { return abertas().filter(o => (title(o.cidade) || "Sem cidade") === cidade && visitada(o)); }
function paradasCidade(cidade, filtro) {
  let ocs = abertas().filter(o => (title(o.cidade) || "Sem cidade") === cidade && !visitada(o));
  if (filtro === "urgentes") ocs = ocs.filter(o => situacao(o).grupo <= 3);
  if (filtro === "rel") ocs = ocs.filter(isRel);
  // agrupa por endereço (mesmo cliente/bairro vira 1 parada) e ordena por bairro, bairros mais urgentes primeiro
  const paradas = new Map();
  ocs.forEach(o => { const c = cliente(o), k = enderecoTexto(c); if (!paradas.has(k)) paradas.set(k, { k, c, chave: o.chave_cliente, ocs: [] }); paradas.get(k).ocs.push(o); });
  (S.rotaExtras || new Set()).forEach(ch => {
    const ref = refCliente(ch); if (!ref || (title(ref.cidade) || "Sem cidade") !== cidade) return;
    const c = cliente(ref), k = enderecoTexto(c);
    if (!paradas.has(k)) paradas.set(k, { k, c, chave: ch, ocs: [], extra: true });
  });
  const arr = [...paradas.values()];
  arr.forEach(p => { p.pz = p.ocs.length ? Math.min(...p.ocs.map(o => o._pz ? +o._pz : 9e15)) : 9e15; p.bairro = norm(p.c.bairro); });
  const pzBairro = {}; arr.forEach(p => pzBairro[p.bairro] = Math.min(pzBairro[p.bairro] ?? 9e15, p.pz));
  arr.sort((a, b) => pzBairro[a.bairro] - pzBairro[b.bairro] || a.bairro.localeCompare(b.bairro) || a.pz - b.pz);
  return arr;
}
/* ---- rota otimizada: onde estou → paradas → base (Consigaz) ---- */
function baseRota() { return (S.config.base_rota && S.config.base_rota.endereco) || ""; }
function geoCache() { try { return JSON.parse(lsGet("ocv_geo") || "{}"); } catch (e) { return {}; } }
async function geocodificar(q) {
  const c = geoCache(); if (c[q]) return c[q];
  const tentar = async t => {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" + encodeURIComponent(t), { headers: { "Accept-Language": "pt-BR" } });
    const d = await r.json(); return d && d[0] ? { lat: +d[0].lat, lng: +d[0].lon } : null;
  };
  let g = await tentar(q);
  if (!g) { const partes = q.split(","); if (partes.length > 2) { await new Promise(r => setTimeout(r, 1100)); g = await tentar(partes.slice(-2).join(",")); } }
  if (g) { const cc = geoCache(); cc[q] = g; lsSet("ocv_geo", JSON.stringify(cc)); }
  return g;
}
function distKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180, dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function ordenarParadas(origem, pts, fim) {
  // vizinho mais próximo + melhoria 2-opt, com início (onde estou) e fim (base) fixos
  const rest = pts.slice(), ordem = []; let cur = origem;
  while (rest.length) { let bi = 0; rest.forEach((p, i) => { if (distKm(cur, p.g) < distKm(cur, rest[bi].g)) bi = i; }); cur = rest[bi].g; ordem.push(rest.splice(bi, 1)[0]); }
  const custo = o => { let d = 0, c = origem; o.forEach(p => { d += distKm(c, p.g); c = p.g; }); return d + (fim ? distKm(c, fim) : 0); };
  let melhorou = true, best = ordem, bc = custo(ordem);
  while (melhorou) { melhorou = false;
    for (let i = 0; i < best.length - 1; i++) for (let j = i + 1; j < best.length; j++) {
      const n = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)], nc = custo(n);
      if (nc + 1e-9 < bc) { best = n; bc = nc; melhorou = true; }
    } }
  return { ordem: best, km: bc };
}
function onde() {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 });
  });
}
function rotaSig() { return [S.rotaCidade, S.rotaFiltro, [...(S.rotaFora || [])].sort().join("|"), visitadasNaCidade(S.rotaCidade || "").map(o => o.numero).sort().join(",")].join("#"); }
async function otimizarRota() {
  if (!baseRota()) return editarBase(true);
  const paradas = (S._paradas || []).filter(p => !S.rotaFora.has(p.k)); if (!paradas.length) return;
  S.otimRodando = true; if (S.view === "rota") { const y = window.scrollY; document.getElementById("view").innerHTML = vRota(); window.scrollTo(0, y); }
  try {
    toast("📍 Pegando sua localização…", 3000);
    const aqui = await onde();
    toast("🗺️ Localizando a base…", 3000);
    const fim = await geocodificar(baseRota());
    if (!fim) return toast("Não encontrei o endereço da base no mapa. Confira em ✏️ Base.", 5000);
    const pts = []; let n = 0;
    for (const p of paradas) {
      const cache = geoCache()[p.k];
      toast(`🗺️ Localizando paradas ${++n}/${paradas.length}…`, 2500);
      const g = cache || await geocodificar(p.k);
      if (!cache) await new Promise(r => setTimeout(r, 1100)); // limite do serviço de mapas
      pts.push({ ...p, g: g || fim });
    }
    const origem = aqui || fim;
    const { ordem, km } = ordenarParadas(origem, pts, fim);
    S.rotaOtim = { sig: rotaSig(), ordem: ordem.map(p => p.k), km, origem: aqui, semGps: !aqui };
    toast(aqui ? "✅ Rota otimizada" : "✅ Rota otimizada (sem GPS: considerei saída da base)", 3500);
    const y = window.scrollY; render(); window.scrollTo(0, y);
  } catch (e) { toast("Não consegui otimizar agora: " + e.message, 5000); }
  finally { S.otimRodando = false; if (S.view === "rota") { const y = window.scrollY; document.getElementById("view").innerHTML = vRota(); window.scrollTo(0, y); } }
}
function urlsRotaOtim(ends, origem, base) {
  // Google Maps aceita até 9 paradas intermediárias por link: divide em partes encadeadas
  const urls = [], tam = 9; let ori = origem ? `${origem.lat},${origem.lng}` : "";
  for (let i = 0; i < ends.length; i += tam) {
    const ch = ends.slice(i, i + tam), ultimo = i + tam >= ends.length;
    const dest = ultimo ? base : ch[ch.length - 1], wps = ultimo ? ch : ch.slice(0, -1);
    urls.push("https://www.google.com/maps/dir/?api=1&travelmode=driving" + (ori ? "&origin=" + encodeURIComponent(ori) : "") +
      "&destination=" + encodeURIComponent(dest) + (wps.length ? "&waypoints=" + encodeURIComponent(wps.join("|")) : ""));
    ori = dest;
  }
  if (!ends.length) urls.push("https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(base));
  return urls;
}
function editarBase(depoisOtimizar) {
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>🏁 Base de chegada</h3>
    <p class="sub">Endereço da Consigaz para onde você volta no fim da rota. Fica salvo para todos os seus aparelhos.</p>
    <div class="field"><label>Nome</label><input class="input" id="b_nome" value="${esc((S.config.base_rota || {}).nome || "Consigaz")}"></div>
    <div class="field"><label>Endereço completo</label><input class="input" id="b_end" value="${esc(baseRota())}" placeholder="Rua, número, bairro, cidade - PR"></div>
    <div class="err" id="b_err"></div>
    <button class="btn block" onclick="salvarBase(${depoisOtimizar ? "true" : "false"})">Salvar base</button>`);
}
async function salvarBase(depoisOtimizar) {
  const end = document.getElementById("b_end").value.trim(), nome = document.getElementById("b_nome").value.trim() || "Consigaz";
  if (end.length < 8) { document.getElementById("b_err").textContent = "Digite o endereço completo (rua, número e cidade)."; return; }
  const valor = { nome, endereco: end };
  const r = await rpc("ocv_salvar_config", { p_token: S.token, p_chave: "base_rota", p_valor: valor }).catch(e => ({ ok: false, erro: e.message }));
  if (!r.ok) { document.getElementById("b_err").textContent = r.erro; return; }
  S.config.base_rota = valor; S.rotaOtim = null; fecharModal(); toast("Base salva ✓");
  setTimeout(() => { render(); if (depoisOtimizar) otimizarRota(); }, 120);
}

function refCliente(chave) {
  let ref = null; S.ocs.forEach(o => { if (o.chave_cliente === chave && (!ref || (o._ab || 0) > (ref._ab || 0))) ref = o; }); return ref;
}
function clientesDaCidade(cidade) {
  return listaClientes().filter(e => (title(e.ref.cidade) || "Sem cidade") === cidade).map(e => {
    const ab = e.ocs.filter(o => !isFin(o)), ultNota = S.notas.find(n => n.chave_cliente === e.chave);
    const ultFin = e.ocs.filter(isFin).sort((a, b) => (b._fe || 0) - (a._fe || 0))[0];
    return { ...e, c: cliente(e.ref), ab, ultNota, ultFin };
  }).sort((a, b) => b.ab.length - a.ab.length || a.c.nome.localeCompare(b.c.nome));
}
function toggleExtra(chave, sim) {
  S.rotaExtras = S.rotaExtras || new Set(); sim ? S.rotaExtras.add(chave) : S.rotaExtras.delete(chave);
  S.rotaOtim = null; const y = window.scrollY; render(); window.scrollTo(0, y);
}
function atender(chave) {
  const ref = refCliente(chave); if (!ref) return;
  const ab = S.ocs.filter(o => o.chave_cliente === chave && !isFin(o)).sort((a, b) => (a._pz || 0) - (b._pz || 0))[0];
  abrirNota((ab || ref).numero);
}
function vClientesCidade(sel) {
  const q = norm(S.cidQ || "");
  let l = clientesDaCidade(sel);
  if (q) l = l.filter(e => norm([e.c.codigo, e.c.nome, e.c.bairro, e.c.telefone1].join(" ")).includes(q));
  const ex = S.rotaExtras || new Set();
  return `<div class="toolbar"><input class="input" placeholder="Buscar cliente em ${esc(sel)}…" value="${esc(S.cidQ || "")}" oninput="S.cidQ=this.value;debRender()"></div>
  <p class="sub">${l.length} cliente${l.length === 1 ? "" : "s"} em ${esc(sel)} · ${l.filter(e => e.ab.length).length} com ocorrência aberta</p>
  ${l.slice(0, 150).map(e => { const z = linkZap(e.c.telefone1), naRota = e.ab.length > 0 || ex.has(e.chave);
    return `<div class="cc">
      <div class="cc-top"><div style="flex:1;min-width:0"><div class="name" onclick="abrirFicha(${jsArg(e.chave)})">${esc(e.c.nome)}</div>
        <div class="meta">${e.c.codigo ? "Cód. <b>" + esc(e.c.codigo) + "</b>" : '<span class="pill p-gray">sem código</span>'} · 📍 ${esc(e.c.bairro || "")}</div>
        <div class="meta">${e.ultNota ? `Última anotação ${fmtData(e.ultNota.criado_em)}` : e.ultFin ? `Último atendimento ${fmtData(e.ultFin.fechamento)} · ${esc(subCurta(e.ultFin.subclassificacao))}` : "Sem atendimento registrado"}</div></div>
        ${e.ab.length ? `<span class="pill p-orange">${e.ab.length} aberta${e.ab.length > 1 ? "s" : ""}</span>` : ""}</div>
      <div class="actions">
        <button class="btn sm" style="background:var(--green)" onclick="atender(${jsArg(e.chave)})">🤝 Atender</button>
        <button class="btn sm ghost" onclick="abrirFotos(${jsArg(e.chave)})">📷 Fotos</button>
        <a class="btn sm soft" href="${linkMaps(e.c)}" target="_blank" rel="noopener">🗺️ Maps</a>
        <a class="btn sm soft" href="${linkWaze(e.c)}" target="_blank" rel="noopener">🚗 Waze</a>
        ${z ? `<a class="btn sm soft" style="background:#e4f6ea;color:#15803d" href="${z}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${e.ab.length ? '<span class="pill p-blue" style="align-self:center">✓ já está na rota</span>' : `<button class="btn sm ${naRota ? "" : "ghost"}" onclick="toggleExtra(${jsArg(e.chave)},${!naRota})">${naRota ? "✓ Na rota (tirar)" : "➕ Pôr na rota"}</button>`}
        <button class="btn sm ghost" onclick="abrirFicha(${jsArg(e.chave)})">Ficha ›</button>
      </div></div>`; }).join("")}
  ${l.length > 150 ? `<p class="sub" style="text-align:center">Mostrando 150 de ${l.length}. Use a busca.</p>` : ""}`;
}

function todasCidades() {
  const ab = {}; cidadesAbertas().forEach(x => ab[x.c] = x);
  const m = {}; S.ocs.forEach(o => { const c = title(o.cidade) || "Sem cidade"; m[c] = m[c] || ab[c] || { c, n: 0, urg: 0, rel: 0 }; });
  return Object.values(m).sort((a, b) => b.urg - a.urg || b.n - a.n || a.c.localeCompare(b.c));
}
function vRota() {
  const cids = (S.rotaModo || "rota") === "clientes" ? todasCidades() : cidadesAbertas();
  const sel = S.rotaCidade && cids.some(x => x.c === S.rotaCidade) ? S.rotaCidade : null;
  const filtro = S.rotaFiltro || "todas";
  let corpo = "";
  const modo = "rota"; S.rotaModo = "rota";
  if (sel && modo === "clientes") {
    corpo = vClientesCidade(sel);
  } else if (sel) {
    const paradas = paradasCidade(sel, filtro);
    S._paradas = paradas;
    if (!S.rotaFora) S.rotaFora = new Set();
    const otim = S.rotaOtim && S.rotaOtim.sig === rotaSig() ? S.rotaOtim : null;
    if (otim) paradas.sort((a, b) => { const ia = otim.ordem.indexOf(a.k), ib = otim.ordem.indexOf(b.k); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
    S._paradas = paradas;
    const ativas = paradas.filter(p => !S.rotaFora.has(p.k));
    const ends = ativas.map(p => p.k);
    const partes = []; for (let i = 0; i < ends.length; i += 10) partes.push(ends.slice(i, i + 10));
    const base = baseRota(), urlsOtim = otim && base ? urlsRotaOtim(ends, otim.origem, base) : [];
    const aprox = ativas.filter(p => !enderecoCompleto(p.c)).length;
    const nomeBase = esc((S.config.base_rota || {}).nome || "Consigaz");
    const nOcs = ativas.reduce((a, p) => a + p.ocs.length, 0);
    corpo = `
    <div class="seg rf">${[["todas", "Todas"], ["urgentes", `Urgentes ≤${JANELA_DIAS}d`], ["rel", "★ Relac."]].map(([v, l]) => `<button class="${filtro === v ? "on" : ""}" onclick="S.rotaFiltro='${v}';S.rotaFora=new Set();render()">${l}</button>`).join("")}</div>
    ${paradas.length ? `
    <div class="card rota-go">
      <div class="rg-top">
        <div><div class="rg-n">${ativas.length} <small>parada${ativas.length === 1 ? "" : "s"}</small></div><div class="rg-sub">${nOcs} ocorrência${nOcs === 1 ? "" : "s"} · ${otim ? "ordem otimizada" : "ordem por bairro"}</div></div>
        ${otim ? `<div class="rg-km">≈ ${Math.round(otim.km * 1.3)}<small> km</small></div>` : ""}
      </div>
      <div class="rg-path"><span>${otim && !otim.semGps ? "📍 Você" : "🏁 Base"}</span><i></i><span>${ativas.length} paradas</span><i></i><button onclick="editarBase()" title="${base ? esc(base) : "Definir base"}">🏁 ${base ? nomeBase : "definir base"} ✏️</button></div>
      ${otim && base ? `<div class="rg-acts">
          <a class="btn" href="${urlsOtim[0]}" target="_blank" rel="noopener">🧭 Iniciar no Maps</a>
          ${ativas[0] ? `<a class="btn ghost ico" href="${linkWaze(ativas[0].c)}" target="_blank" rel="noopener" title="1ª parada no Waze">🚗<small>Waze</small></a>` : ""}
          <button class="btn ghost ico" onclick="S.rotaOtim=null;S.otimTentado=null;otimizarRota()" title="Recalcular a partir de onde estou">↻<small>Refazer</small></button>
        </div>${urlsOtim.length > 1 ? `<div class="rg-note">O Maps abre 9 paradas por vez — depois de visitá-las, toque em ↻ Refazer.</div>` : ""}`
        : S.otimRodando ? `<div class="otim-run"><div class="spinner" style="width:20px;height:20px;margin:0"></div>Otimizando a partir de onde você está…</div>`
        : `<div class="rg-acts"><button class="btn" onclick="otimizarRota()">🧭 Otimizar rota</button>
           ${ativas[0] ? `<a class="btn ghost ico" href="${linkWaze(ativas[0].c)}" target="_blank" rel="noopener">🚗<small>Waze</small></a>` : ""}
           ${partes[0] ? `<a class="btn ghost ico" href="${urlRota(partes[0])}" target="_blank" rel="noopener" title="Abrir no Maps sem otimizar">🗺️<small>Maps</small></a>` : ""}</div>`}
      ${aprox ? `<div class="rg-warn">⚠ ${aprox} com endereço aproximado (sem rua/nº)</div>` : ""}
    </div>
    ${(() => { const vs = visitadasNaCidade(sel); return vs.length ? `<details class="card vis-fora"><summary>✅ <b>${vs.length}</b> visitada${vs.length > 1 ? "s" : ""} — saiu${vs.length > 1 ? "ram" : ""} da rota · falta fechar no Salesforce</summary>${vs.map(o => ocCard(o, { rota: false })).join("")}</details>` : ""; })()}
    <div class="section-title">Paradas <span class="count">${paradas.length}</span> <span style="text-transform:none;font-weight:500;letter-spacing:0;margin-left:auto">☑ = na rota</span></div>
    ${paradas.map((p, i) => { const fora = S.rotaFora.has(p.k);
      return `<div class="parada-grp ${fora ? "fora" : ""}">
        <div class="parada-h">
          <input type="checkbox" class="chk" title="Incluir na rota" ${fora ? "" : "checked"} onchange="toggleParada(${i},this.checked)">
          <div class="pn">${fora ? "–" : ativas.indexOf(p) + 1}</div>
          <div style="flex:1;min-width:0"><b>${fora ? "Fora da rota" : "Parada " + (ativas.indexOf(p) + 1)}</b>${p.ocs.length > 1 ? ` · ${p.ocs.length} ocorrências` : ""}</div>
        </div>
        ${p.ocs.length ? p.ocs.map(o => ocCard(o, { rota: false })).join("") : `<div class="cc">
          <div class="name" onclick="abrirFicha(${jsArg(p.chave)})">${esc(p.c.nome)}</div>
          <div class="meta"><span class="pill p-purple">🤝 Visita sem ocorrência aberta</span></div>
          <div class="actions">
            <button class="btn sm" style="background:var(--green)" onclick="atender(${jsArg(p.chave)})">🤝 Atender</button>
            <button class="btn sm ghost" onclick="abrirFotos(${jsArg(p.chave)})">📷 Fotos</button>
            <a class="btn sm soft" href="${linkMaps(p.c)}" target="_blank" rel="noopener">🗺️ Maps</a>
            <a class="btn sm soft" href="${linkWaze(p.c)}" target="_blank" rel="noopener">🚗 Waze</a>
            <button class="btn sm ghost" onclick="toggleExtra(${jsArg(p.chave)},false)">Tirar da rota</button>
          </div></div>`}
      </div>`; }).join("")}` : `<div class="card empty">Nenhuma ocorrência aberta em ${esc(sel)} com esse filtro.</div>`}`;
  }
  return `${btnVoltar()}
  <h2 class="page">Rota do dia</h2>
  ${sel && !S.rotaTrocar ? `<div class="cid-sel"><span>📍 <b>${esc(sel)}</b> · ${(cids.find(x => x.c === sel) || { n: 0 }).n} abertas</span><button class="lnk" onclick="S.rotaTrocar=true;render()">Trocar ›</button></div>`
    : `<p class="sub">Para onde você vai hoje? Escolha a cidade.</p>`}
  ${sel && !S.rotaTrocar ? "" : `<div class="cid-chips" style="margin-bottom:12px">${cids.map(x => `<button class="cid ${x.c === sel ? "on" : ""}" onclick="S.rotaCidade=${jsArg(x.c)};S.rotaFora=new Set();S.rotaTrocar=false;S.rotaOtim=null;render();window.scrollTo(0,0)">
    <b>${esc(x.c)}</b><span>${x.n ? `${x.n} aberta${x.n > 1 ? "s" : ""}` : "sem abertas"}${x.urg ? ` · <em>${x.urg} urgente${x.urg > 1 ? "s" : ""}</em>` : ""}</span></button>`).join("") || '<div class="card empty">Nenhuma ocorrência aberta.</div>'}</div>`}
  ${sel && !S.rotaTrocar ? corpo : ""}`;
}
function toggleParada(i, on) {
  const p = S._paradas[i]; if (!p) return;
  on ? S.rotaFora.delete(p.k) : S.rotaFora.add(p.k);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

/* ---------------- FINALIZADAS ---------------- */
function periodoDe(d, p) {
  if (!d) return false;
  if (p === "todos") return true;
  const y = String(d.getFullYear()), m = d.getMonth() + 1;
  if (/^\d{4}$/.test(p)) return p === y;
  if (/^\d{4}-T\d$/.test(p)) return p === y + "-T" + Math.ceil(m / 3);
  return p === mesKey(d);
}
function periodoNome(p) {
  if (p === "todos") return "Todo o histórico";
  if (/^\d{4}$/.test(p)) return "Ano " + p;
  if (/^\d{4}-T\d$/.test(p)) { const [y, t] = p.split("-T"); return t + "º trimestre " + y; }
  return mesNome(p);
}
function periodosDisponiveis() {
  const meses = mesesDisponiveis(), tri = new Set(), anos = new Set();
  meses.forEach(m => { const [y, mm] = m.split("-"); tri.add(y + "-T" + Math.ceil(+mm / 3)); anos.add(y); });
  return { meses, tri: [...tri].sort().reverse(), anos: [...anos].sort().reverse() };
}
function vFinalizadas() {
  const pk = S.mesFin;
  const todas = finalizadas();
  const base = todas.filter(o => periodoDe(o._fe, pk));
  const porSub = {}, porCid = {};
  base.forEach(o => { const s = subCurta(o.subclassificacao); porSub[s] = (porSub[s] || 0) + 1; const c = title(o.cidade) || "Sem cidade"; porCid[c] = (porCid[c] || 0) + 1; });
  const ff = S.filtroFin;
  let lista = base;
  if (ff.tipo === "sub") lista = lista.filter(o => subCurta(o.subclassificacao) === ff.valor);
  if (ff.tipo === "cid") lista = lista.filter(o => (title(o.cidade) || "Sem cidade") === ff.valor);
  lista = [...lista].sort((a, b) => b._fe - a._fe);
  const REL = subCurta("VISIT RELACIONAMENTO");
  const bars = (obj, tipo) => {
    const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]); const max = arr[0] ? arr[0][1] : 1;
    return `<div class="bars">${arr.map(([k, v]) => `<div class="row ${ff.tipo === tipo && ff.valor === k ? "on" : ""} ${tipo === "sub" && k === REL ? "rel" : ""}" onclick='filtrarFin("${tipo}",${jsArg(k)})'>
      <div class="lbl">${esc(k)}</div><div class="val">${v}</div><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div></div>`).join("")}</div>`;
  };
  const P = periodosDisponiveis();
  const opt = (v) => `<option value="${v}" ${v === pk ? "selected" : ""}>${esc(periodoNome(v))}</option>`;
  const rel = base.filter(isRel).length;
  // matriz subclassificação × mês
  const mesesP = [...new Set(base.map(o => mesKey(o._fe)))].sort();
  let matriz = "";
  if (mesesP.length > 1) {
    const subs = Object.entries(porSub).sort((a, b) => (b[0] === REL) - (a[0] === REL) || b[1] - a[1]).map(x => x[0]);
    const cnt = {}; base.forEach(o => { const k = subCurta(o.subclassificacao) + "|" + mesKey(o._fe); cnt[k] = (cnt[k] || 0) + 1; });
    const totM = m => base.filter(o => mesKey(o._fe) === m).length;
    const relM = m => base.filter(o => mesKey(o._fe) === m && isRel(o)).length;
    const abrev = m => MESES[+m.split("-")[1] - 1].slice(0, 3) + "/" + m.slice(2, 4);
    matriz = `<div class="section-title">Mês a mês por subclassificação
      <button class="btn sm ghost" onclick="exportarMatriz()">⬇️ Exportar CSV</button></div>
    <div class="card" style="padding:4px 0;overflow-x:auto"><table class="t mtx" style="min-width:${260 + mesesP.length * 64}px">
      <thead><tr><th style="position:sticky;left:0;background:#fff;padding-left:14px">Subclassificação</th>${mesesP.map(m => `<th style="text-align:right">${abrev(m)}</th>`).join("")}<th style="text-align:right;padding-right:14px">Total</th></tr></thead><tbody>
      ${subs.map(sb => `<tr ${sb === REL ? 'style="background:var(--purple-soft)"' : ""}><td style="position:sticky;left:0;background:${sb === REL ? "var(--purple-soft)" : "#fff"};padding-left:14px;font-weight:600">${esc(sb)}</td>
        ${mesesP.map(m => `<td style="text-align:right">${cnt[sb + "|" + m] || '<span style="color:#cbd5e1">·</span>'}</td>`).join("")}<td style="text-align:right;font-weight:800;padding-right:14px">${porSub[sb]}</td></tr>`).join("")}
      <tr style="font-weight:800"><td style="position:sticky;left:0;background:#fff;padding-left:14px">Total do mês</td>${mesesP.map(m => { const t = totM(m); return `<td style="text-align:right;color:${t >= META_TOTAL ? "var(--green)" : "inherit"}">${t}</td>`; }).join("")}<td style="text-align:right;padding-right:14px">${base.length}</td></tr>
      <tr style="font-weight:700"><td style="position:sticky;left:0;background:#fff;padding-left:14px;color:var(--red)">↺ Reaberturas (máx ${LIMITE_REAB})</td>${mesesP.map(m => { const q = reabsDoPeriodo(m).length; return `<td style="text-align:right;color:${q > LIMITE_REAB ? "var(--red)" : q ? "var(--orange)" : "var(--green)"}">${q}</td>`; }).join("")}<td style="text-align:right;padding-right:14px">${mesesP.reduce((a, m) => a + reabsDoPeriodo(m).length, 0)}</td></tr>
      <tr style="font-weight:700;color:var(--muted)"><td style="position:sticky;left:0;background:#fff;padding-left:14px">Meta relac. (${META_REL})</td>${mesesP.map(m => { const r = relM(m); return `<td style="text-align:right;color:${r >= META_REL ? "var(--green)" : "var(--red)"}">${r}</td>`; }).join("")}<td style="text-align:right;padding-right:14px">${rel}</td></tr>
      </tbody></table></div>`;
    S._matriz = { mesesP, subs, cnt, porSub, totM: mesesP.map(totM), relM: mesesP.map(relM), reabM: mesesP.map(m => reabsDoPeriodo(m).length), total: base.length, periodo: periodoNome(pk) };
  }
  return `
  ${btnVoltar()}<div class="page-head"><h2 class="page">Resultados</h2><button class="btn sm soft" onclick="go('relatorio',()=>S.relPeriodo=S.mesFin)">📄 Relatório PDF</button></div>
  <p class="sub">Escolha o período · toque numa barra para abrir as ocorrências</p>
  <div class="month-sel"><select onchange="S.mesFin=this.value;S.filtroFin={tipo:null};render()">
    <option value="todos" ${pk === "todos" ? "selected" : ""}>Todo o histórico</option>
    <optgroup label="Trimestres">${P.tri.map(opt).join("")}</optgroup>
    <optgroup label="Meses">${P.meses.map(opt).join("")}</optgroup>
    <optgroup label="Anos">${P.anos.map(opt).join("")}</optgroup></select></div>
  <div class="grid g4" style="margin-bottom:12px">
    <div class="card kpi green"><div class="n">${base.length}</div><div class="l">Finalizadas</div></div>
    <div class="card kpi purple"><div class="n">${rel}</div><div class="l">Relacionamento</div></div>
    <div class="card kpi"><div class="n">${Object.keys(porCid).length}</div><div class="l">Cidades</div></div>
    <div class="card kpi"><div class="n">${new Set(base.map(o => o.chave_cliente)).size}</div><div class="l">Clientes atendidos</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="section-title" style="margin-top:0">Por subclassificação</div>${bars(porSub, "sub")}</div>
    <div class="card"><div class="section-title" style="margin-top:0">Por cidade</div>${bars(porCid, "cid")}</div>
  </div>
  ${matriz}
  <button class="btn block ghost" style="margin-top:14px" onclick="abrirOcsFin({per:S.mesFin})">📋 Ver as ${base.length} finalizadas deste período em Ocorrências ›</button>`;
}
function exportarMatriz() {
  const M = S._matriz; if (!M) return;
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const linhas = [["Subclassificação", ...M.mesesP.map(mesNome), "Total"].map(q).join(";")];
  M.subs.forEach(sb => linhas.push([q(sb), ...M.mesesP.map(m => M.cnt[sb + "|" + m] || 0), M.porSub[sb]].join(";")));
  linhas.push([q("Total do mês"), ...M.totM, M.total].join(";"));
  linhas.push([q("Visitas de relacionamento"), ...M.relM, M.relM.reduce((a, b) => a + b, 0)].join(";"));
  linhas.push([q("Reaberturas"), ...M.reabM, M.reabM.reduce((a, b) => a + b, 0)].join(";"));
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "ocorrencias-" + M.periodo.replace(/\W+/g, "-").toLowerCase() + ".csv"; a.click();
}
function filtrarFin(tipo, valor) {
  abrirOcsFin({ per: S.mesFin, [tipo === "sub" ? "sub" : "cidade"]: valor });
}

/* ---------------- CLIENTES ---------------- */
function listaClientes() {
  const m = new Map();
  S.ocs.forEach(o => {
    let e = m.get(o.chave_cliente);
    if (!e) { e = { chave: o.chave_cliente, ocs: [], ref: o }; m.set(o.chave_cliente, e); }
    e.ocs.push(o);
    if ((o._ab || 0) > (e.ref._ab || 0)) e.ref = o;
  });
  return [...m.values()];
}
function vClientes() {
  const q = norm(S.cliQ);
  let l = listaClientes().map(e => ({ ...e, c: cliente(e.ref), ab: e.ocs.filter(o => !isFin(o)).length }));
  if (q) l = l.filter(e => norm([e.c.codigo, e.c.nome, e.c.bairro, e.c.cidade, e.c.telefone1].join(" ")).includes(q));
  l.sort((a, b) => b.ab - a.ab || a.c.nome.localeCompare(b.c.nome));
  const semEnd = l.filter(e => !enderecoCompleto(e.c)).length;
  return `
  ${btnVoltar()}<h2 class="page">Clientes</h2>
  <p class="sub">${l.length} clientes · ${semEnd} sem rua/número cadastrados</p>
  <div class="toolbar"><input class="input" placeholder="Buscar por código, nome, bairro, cidade ou telefone" value="${esc(S.cliQ)}" oninput="S.cliQ=this.value;debRender()"></div>
  <div class="card" style="padding:2px 4px">
  ${l.slice(0, 200).map(e => `<div class="cli-row" onclick="abrirFicha(${jsArg(e.chave)})">
    <div class="cli-main"><div class="cli-nome">${esc(e.c.nome)}${e.c.telefone1 ? " 📞" : ""}${enderecoCompleto(e.c) ? " 📍" : ""}</div>
      <div class="cli-sub">${e.c.codigo ? "Cód. <b>" + esc(e.c.codigo) + "</b>" : "sem código"} · ${esc(e.c.cidade || "")} · ${e.ocs.length} ocorrência${e.ocs.length > 1 ? "s" : ""}</div></div>
    ${e.ab ? `<span class="pill p-orange">${e.ab} aberta${e.ab > 1 ? "s" : ""}</span>` : ""}<span class="chev">›</span></div>`).join("")}
  </div>
  ${l.length > 200 ? `<p class="sub" style="text-align:center">Mostrando 200 de ${l.length}. Use a busca.</p>` : ""}`;
}

/* ---------------- FICHA ---------------- */
function abrirFicha(chave, editar) {
  const ocs = S.ocs.filter(o => o.chave_cliente === chave).sort((a, b) => (b._ab || 0) - (a._ab || 0));
  if (!ocs.length) return;
  const c = cliente(ocs[0]);
  const z1 = linkZap(c.telefone1), z2 = linkZap(c.telefone2);
  const subs = {}; ocs.forEach(o => { const s = subCurta(o.subclassificacao); subs[s] = (subs[s] || 0) + 1; });
  const f = (id, lbl, val, full, extra = "") => `<div class="field ${full ? "full" : ""}"><label>${lbl}</label><input class="input" id="f_${id}" value="${esc(val)}" ${extra}></div>`;
  modal(`<button class="x" onclick="fecharModal()">×</button>
    <h3>${esc(c.nome)}</h3>
    <p class="sub">${c.codigo ? "Código <b>" + esc(c.codigo) + "</b> · " : "Sem código · "}${ocs.length} ocorrência${ocs.length > 1 ? "s" : ""}</p>
    <div class="actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      <a class="btn sm soft" href="${linkMaps(c)}" target="_blank" rel="noopener">🗺️ Google Maps</a>
      <a class="btn sm soft" href="${linkWaze(c)}" target="_blank" rel="noopener">🚗 Waze</a>
      ${z1 ? `<a class="btn sm soft" style="background:#e4f6ea;color:#15803d" href="${z1}" target="_blank" rel="noopener">WhatsApp</a><a class="btn sm soft" href="${linkTel(c.telefone1)}">📞 Ligar</a>` : ""}
      ${z2 ? `<a class="btn sm soft" style="background:#e4f6ea;color:#15803d" href="${z2}" target="_blank" rel="noopener">WhatsApp 2</a>` : ""}
    </div>
    <details class="edit-cli" id="editCli" ${editar ? "open" : ""}>
      <summary>✏️ Editar dados do cliente <small>código, nome, tipo, contato, telefones, e-mail e endereço</small></summary>
      <div class="form-grid" style="margin-top:10px">
        ${f("codigo", "Código do cliente", c.codigo, false, 'inputmode="numeric" placeholder="Ex.: 1137418"')}
        <div class="field"><label>Tipo do cliente</label><select class="input" id="f_tipo">${TIPOS.map(([k, l]) => `<option value="${k}" ${k === tipoCliente(chave) ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        ${f("nome", "Nome do cliente", c.nome, true)}
        ${f("contato", "Contato (nome / cargo)", c.contato, true, 'placeholder="Ex.: Thiago — síndico"')}
        ${f("telefone1", "Telefone / WhatsApp", c.telefone1, false, 'inputmode="tel" placeholder="(41) 9 0000-0000"')}
        ${f("telefone2", "Telefone 2", c.telefone2, false, 'inputmode="tel"')}
        ${f("email", "E-mail", c.email, true, 'inputmode="email" placeholder="nome@empresa.com.br"')}
        ${f("logradouro", "Rua / Avenida", c.logradouro, true, 'placeholder="Ex.: Rua das Araucárias"')}
        ${f("numero", "Número", c.numero, false, 'inputmode="numeric"')}
        ${f("complemento", "Complemento", c.complemento)}
        ${f("bairro", "Bairro", c.bairro)}
        ${f("cidade", "Cidade", c.cidade)}
        ${f("uf", "UF", c.uf)}
        ${f("cep", "CEP", c.cep, false, 'inputmode="numeric"')}
        <div class="field full"><label>Observações</label><textarea class="input" id="f_obs" rows="3">${esc(c.obs)}</textarea></div>
      </div>
      <p class="sub" style="font-size:12.5px;margin:8px 0 0">O que você corrigir aqui vale no sistema todo e não é apagado pelas próximas importações. Deixe o código ou o nome em branco para voltar ao que vem da planilha.</p>
      <button class="btn block" style="margin-top:10px" id="btnSalvarCli" onclick="salvarFicha(${jsArg(chave)},${jsArg(c.codigo)})">💾 Salvar dados do cliente</button>
    </details>
    <div style="font-size:14px;margin-bottom:6px">📍 ${esc(enderecoTexto(c))}</div>
    ${c.email ? `<div style="font-size:14px;margin-bottom:6px">✉️ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ""}
    ${(() => { const st = statusFotos(chave); return `<div class="ficha-acts">
      <button class="btn sm" onclick="fecharModal(true);abrirFotos(${jsArg(chave)})">📷 Fotos ${st.ok}/${st.total}${st.n > st.ok ? ` (+${st.n - st.ok})` : ""}</button>
      <button class="btn sm soft" onclick="fecharModal(true);abrirMedidores(${jsArg(chave)},${ocs[0].numero})">📟 Medidores ${S.medidores.filter(m => m.chave_cliente === chave).length || ""}</button></div>`; })()}
    ${(() => { const ns = S.notas.filter(n => n.chave_cliente === chave); return ns.length ? `<div class="section-title">Anotações de visita <span class="count">${ns.length}</span></div>${ns.map(notaHTML).join("")}` : ""; })()}
    ${!enderecoCompleto(c) ? `<div class="info-box">A planilha traz só bairro e cidade. Preencha rua e número para o Maps e o Waze levarem até a porta.</div>` : ""}


    <div class="section-title">Resumo</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${Object.entries(subs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill ${k === subCurta("VISIT RELACIONAMENTO") ? "p-purple" : "p-blue"}">${esc(k)}: ${v}</span>`).join("")}</div>
    <div class="section-title">Histórico</div>
    ${ocs.map(o => { const s = situacao(o); return `<div class="hist"><span class="pill ${s.pill}">${s.txt}</span> <b>${o.numero}</b> · ${esc(subCurta(o.subclassificacao))}<br>
      <span style="color:var(--muted)">Aberta ${fmtDH(o.abertura)} · ${isFin(o) ? "Fechada " + fmtDH(o.fechamento) : "Prazo " + fmtDH(o.prazo)}${o.ticket ? " · Zendesk " + esc(o.ticket) : ""}</span>
      ${o.solucao ? `<div class="sol">${esc(o.solucao)}</div>` : ""}</div>`; }).join("")}
  `);
  if (editar) rolarEdicao();
}
function rolarEdicao() { setTimeout(() => { const d = document.getElementById("editCli"); if (d && d.open) d.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80); }
async function salvarFicha(chave, codigo) {
  const g = id => (document.getElementById("f_" + id)?.value || "").trim();
  const p = { chave, codigo: g("codigo"), tipo: g("tipo"), email: g("email"), nome: g("nome"), logradouro: g("logradouro"), numero: g("numero"), complemento: g("complemento"), bairro: g("bairro"), cidade: g("cidade"), uf: g("uf"), cep: g("cep"), telefone1: g("telefone1"), telefone2: g("telefone2"), contato: g("contato"), obs: g("obs") };
  const btn = document.getElementById("btnSalvarCli"); btn.disabled = true; btn.textContent = "Salvando…";
  try {
    const r = await rpc("ocv_salvar_cliente", { p_token: S.token, p });
    if (!r.ok) throw new Error(r.erro);
    S.clientes[chave] = r.cliente;
    toast("Cliente salvo ✓"); render(); abrirFicha(chave);
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = "Salvar"; }
}


/* ---------------- RELATÓRIO (PDF para diretoria) ---------------- */
function vRelatorio() {
  const pk = S.relPeriodo;
  const base = finalizadas().filter(o => periodoDe(o._fe, pk));
  const P = periodosDisponiveis();
  const opt = v => `<option value="${v}" ${v === pk ? "selected" : ""}>${esc(periodoNome(v))}</option>`;
  const REL = subCurta("VISIT RELACIONAMENTO");
  const rel = base.filter(isRel).length;
  const comPrazo = base.filter(o => o._pz);
  const noPrazo = comPrazo.filter(o => o._fe <= o._pz).length;
  const pctPrazo = comPrazo.length ? Math.round(100 * noPrazo / comPrazo.length) : 0;
  const durs = base.filter(o => o._ab).map(o => (o._fe - o._ab) / 864e5).sort((a, b) => a - b);
  const media = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  const clientes = new Set(base.map(o => o.chave_cliente)).size;
  const cidadesObj = {}, subObj = {};
  base.forEach(o => { const c = title(o.cidade) || "Sem cidade"; cidadesObj[c] = (cidadesObj[c] || 0) + 1; const sb = subCurta(o.subclassificacao); subObj[sb] = (subObj[sb] || 0) + 1; });
  const meses = [...new Set(base.map(o => mesKey(o._fe)))].sort();
  const porMes = meses.map(m => { const it = base.filter(o => mesKey(o._fe) === m); return { m, t: it.length, r: it.filter(isRel).length }; });
  const maxM = Math.max(META_TOTAL, ...porMes.map(x => x.t)) * 1.15;
  const abrev = m => MESES[+m.split("-")[1] - 1].slice(0, 3) + "/" + m.slice(2, 4);
  const pct = (v, t) => t ? (100 * v / t).toFixed(1).replace(".", ",") + "%" : "—";
  const subs = Object.entries(subObj).sort((a, b) => (b[0] === REL) - (a[0] === REL) || b[1] - a[1]);
  const cids = Object.entries(cidadesObj).sort((a, b) => b[1] - a[1]);
  const cidTop = cids.slice(0, 12), cidOutros = cids.slice(12).reduce((a, b) => a + b[1], 0);
  const cnt = {}; base.forEach(o => { const k = subCurta(o.subclassificacao) + "|" + mesKey(o._fe); cnt[k] = (cnt[k] || 0) + 1; });
  const ab = abertas(), venc = ab.filter(o => situacao(o).grupo === 0).length, prox = ab.filter(o => { const g = situacao(o).grupo; return g >= 1 && g <= 3; }).length;
  const mesesBatidosT = porMes.filter(x => x.t >= META_TOTAL).length, mesesBatidosR = porMes.filter(x => x.r >= META_REL).length;
  const hoje = new Date();
  return `
  <div class="no-print">${btnVoltar()}
    <div class="page-head"><h2 class="page">Relatório para apresentação</h2></div>
    <p class="sub">Escolha o período e toque em <b>Gerar PDF</b>. No celular, use “Salvar em PDF” ou “Compartilhar” na tela de impressão.</p>
    <div class="toolbar"><select class="input" style="flex:1 1 220px" onchange="S.relPeriodo=this.value;render()">
      <optgroup label="Trimestres">${P.tri.map(opt).join("")}</optgroup>
      <optgroup label="Meses">${P.meses.map(opt).join("")}</optgroup>
      <optgroup label="Anos">${P.anos.map(opt).join("")}</optgroup>
      <option value="todos" ${pk === "todos" ? "selected" : ""}>Todo o histórico</option></select>
      <button class="btn" onclick="gerarPDF()">📄 Gerar PDF</button></div>
  </div>

  <div class="rel" id="rel">
    <div class="rel-head">
      <div><div class="rel-kicker">Consigaz · Pós-Vendas</div>
        <h1>Relatório de Ocorrências</h1>
        <div class="rel-meta">${esc(S.user?.nome || "")} · Consultor de Pós-Vendas · <b>${esc(periodoNome(pk))}</b></div></div>
      <div class="rel-date">Gerado em<br><b>${hoje.toLocaleDateString("pt-BR")}</b></div>
    </div>

    <div class="rel-kpis">
      <div><b>${base.length}</b><span>Ocorrências finalizadas</span></div>
      <div class="pu"><b>${rel}</b><span>Visitas de relacionamento (${pct(rel, base.length)})</span></div>
      <div><b>${pctPrazo}%</b><span>Fechadas dentro do prazo</span></div>
      <div><b>${media.toFixed(1).replace(".", ",")}</b><span>Dias em média para fechar</span></div>
      <div><b>${clientes}</b><span>Clientes atendidos</span></div>
      <div><b>${cids.length}</b><span>Cidades atendidas</span></div>
      <div class="rd"><b>${reabsDoPeriodo(pk).length}</b><span>Reaberturas (limite ${LIMITE_REAB}/mês)</span></div>
      <div class="rd"><b>${pct(base.filter(o => o.reabertura > 0).length, base.length)}</b><span>Taxa de reabertura</span></div>
      <div class="or"><b>${reabertasAbertas().length}</b><span>Reabertas ainda em aberto</span></div>
    </div>

    ${porMes.length ? `<h3>Evolução mensal e metas</h3>
    <div class="rel-chart">
      ${porMes.map(x => `<div class="col"><div class="bars2"><div class="bt" style="height:${(x.t / maxM) * 100}%"><span>${x.t}</span></div><div class="br" style="height:${(x.r / maxM) * 100}%"><span>${x.r}</span></div></div><div class="cl">${abrev(x.m)}</div></div>`).join("")}
      <div class="meta-line" style="bottom:calc(26px + ${(META_TOTAL / maxM) * 150}px)"><span>meta ${META_TOTAL}</span></div>
      <div class="meta-line pu" style="bottom:calc(26px + ${(META_REL / maxM) * 150}px)"><span>meta relac. ${META_REL}</span></div>
    </div>
    <div class="legend"><span><i class="lb"></i>Total finalizadas</span><span><i class="lp"></i>Visitas de relacionamento</span></div>
    <div class="mtx-wrap"><table class="rt"><thead><tr><th>Mês</th><th class="r">Finalizadas</th><th class="r">Meta ${META_TOTAL}</th><th class="r">Relacionamento</th><th class="r">Meta ${META_REL}</th><th class="r">Reaberturas</th></tr></thead><tbody>
      ${porMes.map(x => `<tr><td>${mesNome(x.m)}</td><td class="r"><b>${x.t}</b></td><td class="r">${x.t >= META_TOTAL ? '<span class="ok">✔ batida</span>' : `<span class="no">${Math.round(100 * x.t / META_TOTAL)}%</span>`}</td><td class="r"><b>${x.r}</b></td><td class="r">${x.r >= META_REL ? '<span class="ok">✔ batida</span>' : `<span class="no">${Math.round(100 * x.r / META_REL)}%</span>`}</td><td class="r">${(() => { const q = reabsDoPeriodo(x.m).length; return `<span class="${q > LIMITE_REAB ? "no" : q === 0 ? "ok" : ""}">${q}${q > LIMITE_REAB ? " ✖" : ""}</span>`; })()}</td></tr>`).join("")}
      <tr class="tot"><td>Total</td><td class="r">${base.length}</td><td class="r">${mesesBatidosT}/${porMes.length} meses</td><td class="r">${rel}</td><td class="r">${mesesBatidosR}/${porMes.length} meses</td><td class="r">${reabsDoPeriodo(pk).length}</td></tr>
    </tbody></table></div>` : `<p class="sub">Nenhuma ocorrência finalizada neste período.</p>`}

    <div class="rel-2col">
      <div><h3>Por subclassificação</h3>
        <table class="rt"><tbody>${subs.map(([k, v]) => `<tr${k === REL ? ' class="hl"' : ""}><td>${esc(k)}</td><td class="r"><b>${v}</b></td><td class="r mu">${pct(v, base.length)}</td></tr>`).join("")}</tbody></table></div>
      <div><h3>Por cidade</h3>
        <table class="rt"><tbody>${cidTop.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r"><b>${v}</b></td><td class="r mu">${pct(v, base.length)}</td></tr>`).join("")}
        ${cidOutros ? `<tr><td>Outras ${cids.length - 12} cidades</td><td class="r"><b>${cidOutros}</b></td><td class="r mu">${pct(cidOutros, base.length)}</td></tr>` : ""}</tbody></table></div>
    </div>

    ${meses.length > 1 ? `<h3>Mês a mês por subclassificação</h3>
    <div class="mtx-wrap"><table class="rt mtx"><thead><tr><th>Subclassificação</th>${meses.map(m => `<th class="r">${abrev(m)}</th>`).join("")}<th class="r">Total</th></tr></thead><tbody>
      ${subs.map(([sb, v]) => `<tr${sb === REL ? ' class="hl"' : ""}><td>${esc(sb)}</td>${meses.map(m => `<td class="r">${cnt[sb + "|" + m] || '<span class="mu">·</span>'}</td>`).join("")}<td class="r"><b>${v}</b></td></tr>`).join("")}
      <tr class="tot"><td>Total</td>${porMes.map(x => `<td class="r">${x.t}</td>`).join("")}<td class="r">${base.length}</td></tr>
    </tbody></table></div>` : ""}

    <h3>Situação atual da carteira <span class="mu" style="font-weight:500;font-size:12px">(em ${hoje.toLocaleDateString("pt-BR")})</span></h3>
    <div class="rel-kpis k3">
      <div><b>${ab.length}</b><span>Ocorrências abertas</span></div>
      <div class="rd"><b>${venc}</b><span>Vencidas</span></div>
      <div class="or"><b>${prox}</b><span>Vencem em até ${JANELA_DIAS} dias</span></div>
    </div>
    <div class="rel-foot">Reaberturas: data registrada pelas importações diárias a partir de 11/11/2026; antes disso, estimada pelo mês do fechamento. Fonte: exportação “Minhas Ocorrências Pós-Vendas” · ${S.importacoes[0] ? "última atualização " + fmtDH(S.importacoes[0].em) : ""} · Minhas Ocorrências — DDS Inovação</div>
  </div>`;
}
function gerarPDF() {
  const t = document.title;
  document.title = "Relatorio-Ocorrencias-" + periodoNome(S.relPeriodo).replace(/\W+/g, "-");
  window.print();
  setTimeout(() => document.title = t, 1500);
}

/* ---------------- ANOTAÇÕES DE VISITA ---------------- */
function notaHTML(n) {
  return `<div class="nota ${n.irregularidade ? "irr" : ""}">
    <div class="nota-top"><b>${fmtDH(n.criado_em)}</b>${n.numero ? ` · Oc. ${n.numero}` : ""}${n.irregularidade ? ' <span class="pill p-red">⚠ Irregularidade</span>' : ""}
      <button class="lnk" onclick="abrirNota(${n.numero || "null"},${jsArg(n.id)})">editar</button></div>
    ${n.recebido_por || n.cargo || n.telefone ? `<div>👤 ${esc([n.recebido_por, n.cargo].filter(Boolean).join(" — "))}${n.telefone ? ` · 📞 <a href="${linkTel(n.telefone)}">${esc(n.telefone)}</a>` : ""}</div>` : ""}
    ${n.irregularidade && n.irregularidade_desc ? `<div class="irr-d">⚠ ${esc(n.irregularidade_desc)}</div>` : ""}
    ${n.obs ? `<div class="sol" style="color:var(--ink)">${esc(n.obs)}</div>` : ""}
  </div>`;
}
function abrirNota(numero, id) {
  const o = S.ocs.find(x => x.numero === numero);
  const n = id ? S.notas.find(x => x.id === id) : null;
  const chave = n ? n.chave_cliente : o.chave_cliente;
  const c = o ? cliente(o) : { nome: "", telefone1: "" };
  const v = k => esc(n ? n[k] || "" : "");
  modal(`<button class="x" onclick="fecharModal()">×</button>
    <h3>📝 ${n ? "Editar anotação" : "Anotação da visita"}</h3>
    <p class="sub">${esc(c.nome)}${numero ? " · Oc. " + numero : ""}${o ? " · " + esc(subCurta(o.subclassificacao)) : ""}</p>
    <div class="form-grid">
      <div class="field full"><label>Quem me recebeu</label><input class="input" id="n_rec" value="${v("recebido_por")}" placeholder="Nome"></div>
      <div class="field"><label>Cargo / função</label><input class="input" id="n_cargo" value="${v("cargo")}" placeholder="Síndico, gerente…"></div>
      <div class="field"><label>Telefone</label><input class="input" id="n_tel" value="${v("telefone")}" inputmode="tel" placeholder="(41) 9 0000-0000"></div>
      <label class="full chk-line"><input type="checkbox" id="n_salvatel" ${c.telefone1 ? "" : "checked"}> Salvar este telefone na ficha do cliente</label>
      <div class="field full"><label>Teve alguma irregularidade?</label>
        <div class="seg"><button type="button" class="${n && n.irregularidade ? "" : "on"}" onclick="segIrr(false)">Não</button><button type="button" class="${n && n.irregularidade ? "on red" : ""}" onclick="segIrr(true)">⚠ Sim</button></div>
        <input type="hidden" id="n_irr" value="${n && n.irregularidade ? "1" : ""}"></div>
      <div class="field full ${n && n.irregularidade ? "" : "hidden"}" id="n_irr_box"><label>Qual irregularidade?</label><textarea class="input" id="n_irr_d" rows="2" placeholder="Ex.: central sem extintor, mangueira passando por área de circulação…">${v("irregularidade_desc")}</textarea></div>
      <div class="field full"><label>Observações da visita</label><textarea class="input" id="n_obs" rows="4" placeholder="O que foi tratado, combinados, pendências…">${v("obs")}</textarea></div>
    </div>
    <div class="err" id="n_err"></div>
    <button class="btn block" id="n_btn" onclick="salvarNota(${numero || "null"},${jsArg(chave)},${jsArg(n ? n.id : "")})">Salvar anotação</button>
    ${n ? `<button class="btn block ghost" style="margin-top:8px;color:var(--red)" onclick="excluirNota(${jsArg(n.id)})">Excluir anotação</button>` : ""}`);
}
function segIrr(sim) {
  document.getElementById("n_irr").value = sim ? "1" : "";
  const b = document.querySelectorAll(".seg button"); b[0].className = sim ? "" : "on"; b[1].className = sim ? "on red" : "";
  document.getElementById("n_irr_box").classList.toggle("hidden", !sim);
}
async function salvarNota(numero, chave, id) {
  const g = i => (document.getElementById(i)?.value || "").trim();
  const o = S.ocs.find(x => x.numero === numero);
  const p = { id, numero, chave_cliente: chave, codigo: o?.cliente_codigo || "", recebido_por: g("n_rec"), cargo: g("n_cargo"), telefone: g("n_tel"),
    irregularidade: !!g("n_irr"), irregularidade_desc: g("n_irr_d"), obs: g("n_obs"), salvar_telefone: document.getElementById("n_salvatel").checked };
  if (!p.recebido_por && !p.telefone && !p.obs && !p.irregularidade) { document.getElementById("n_err").textContent = "Preencha pelo menos um campo."; return; }
  const btn = document.getElementById("n_btn"); btn.disabled = true; btn.textContent = "Salvando…";
  try {
    const r = await rpc("ocv_salvar_nota", { p_token: S.token, p });
    if (!r.ok) throw new Error(r.erro);
    S.notas = [r.nota, ...S.notas.filter(x => x.id !== r.nota.id)];
    if (r.cliente) S.clientes[chave] = r.cliente;
    fecharModal(); toast("Anotação salva ✓"); setTimeout(render, 80);
  } catch (e) { document.getElementById("n_err").textContent = e.message; btn.disabled = false; btn.textContent = "Salvar anotação"; }
}
async function excluirNota(id) {
  if (!confirm("Excluir esta anotação? Não dá para desfazer.")) return;
  await rpc("ocv_excluir_nota", { p_token: S.token, p_id: id });
  S.notas = S.notas.filter(n => n.id !== id); fecharModal(); toast("Anotação excluída"); setTimeout(render, 80);
}

/* ---------------- FOTOS ---------------- */
function tipoCliente(chave) {
  const ed = S.clientes[chave]; if (ed && ed.tipo) return ed.tipo;
  const o = S.ocs.find(x => x.chave_cliente === chave);
  return /CONDOMINIO|EDIFICIO|EDIF\.|RESIDENCIAL|CONDOMINIUM/.test(norm(o?.cliente_nome)) ? "condominio" : "comercio";
}
function slotsDe(chave) { return [...FOTOS_BASE, ...(FOTOS_TIPO[tipoCliente(chave)] || []), FOTO_OUTRAS]; }
function statusFotos(chave) {
  const fs = S.fotos.filter(f => f.chave_cliente === chave);
  const obrig = slotsDe(chave).filter(s => !s.opcional);
  const ok = obrig.filter(s => fs.some(f => f.slot === s.k)).length;
  return { n: fs.length, ok, total: obrig.length };
}
async function fotosApi(body) {
  const r = await fetch(FN_FOTOS, { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY }, body: JSON.stringify({ token: S.token, ...body }) });
  const d = await r.json().catch(() => ({ ok: false, erro: "Falha de rede" }));
  if (d.erro === "SESSAO_INVALIDA") { sair(true); throw new Error("Sessão expirada. Entre novamente."); }
  if (!d.ok) throw new Error(d.erro || "Erro ao processar fotos");
  return d;
}
async function carregarUrls(chave) {
  if (!S.fotos.some(f => f.chave_cliente === chave)) { S.fotoUrls[chave] = { t: Date.now(), m: {} }; return; }
  const d = await fotosApi({ acao: "listar", chave });
  const m = {}; d.fotos.forEach(f => m[f.id] = f.url);
  S.fotoUrls[chave] = { t: Date.now(), m };
}
function abrirFotos(chave, numero) {
  go("fotos", () => { S.fotoChave = chave; S.fotoNumero = numero || null; });
  const c = S.fotoUrls[chave];
  if (!c || Date.now() - c.t > 45 * 60e3) carregarUrls(chave).then(() => S.view === "fotos" && render()).catch(e => toast(e.message));
}
function vFotos() {
  const chave = S.fotoChave;
  const o = S.ocs.find(x => x.chave_cliente === chave); if (!o) return `${btnVoltar()}<div class="card empty">Cliente não encontrado.</div>`;
  const c = cliente(o), tipo = tipoCliente(chave), st = statusFotos(chave);
  const fs = S.fotos.filter(f => f.chave_cliente === chave);
  const urls = (S.fotoUrls[chave] || {}).m || {};
  const naoExp = fs.filter(f => !f.exportada_em).length;
  return `${btnVoltar()}
  <h2 class="page">📷 Fotos</h2>
  <p class="sub"><b>${esc(c.nome)}</b>${c.codigo ? " · Cód. " + esc(c.codigo) : ""} · ${esc(c.cidade)}</p>
  <div class="card" style="margin-bottom:12px">
    <div class="field" style="margin:0"><label>Tipo do cliente (define o padrão de fotos)</label>
      <div class="seg">${TIPOS.map(([k, l]) => `<button class="${k === tipo ? "on" : ""}" onclick="mudarTipo(${jsArg(chave)},'${k}')">${l}</button>`).join("")}</div></div>
    <div class="foto-prog"><b>${st.ok}/${st.total}</b> fotos do padrão${st.ok === st.total ? " ✅ completo" : ""}<div class="reab-track" style="max-width:none"><div style="width:${st.total ? st.ok / st.total * 100 : 0}%;background:var(--green)"></div></div></div>
  </div>
  <div class="slots">
  ${slotsDe(chave).map(sl => { const lista = fs.filter(f => f.slot === sl.k);
    return `<div class="slot ${lista.length ? "tem" : ""}">
      <div class="slot-h"><span>${lista.length ? "✅" : sl.opcional ? "➕" : "⬜"} ${esc(sl.l)}</span>${lista.length ? `<small>${lista.length} foto${lista.length > 1 ? "s" : ""}</small>` : ""}</div>
      <div class="thumbs">${S.pend.filter(p => p.chave === chave && p.slot === sl.k).map(p => `<div class="thumb"><img src="${p.url}" alt="">${p.erro ? `<button class="enviando erro" onclick="reenviar('${p.tmp}')">⚠️ tocar p/ reenviar</button>` : `<span class="enviando"><i class="spinner"></i>enviando</span>`}</div>`).join("")}${lista.map(f => `<div class="thumb">${urls[f.id] ? `<a href="${urls[f.id]}" target="_blank" rel="noopener"><img src="${urls[f.id]}" loading="lazy" alt=""></a>` : `<div class="ph">⏳</div>`}
        <button class="del" title="Apagar" onclick="apagarFotos([${jsArg(f.id)}],true)">×</button>${f.exportada_em ? '<span class="exp">exportada</span>' : ""}</div>`).join("")}
      <label class="add ${lista.length ? "mais" : ""}"><input type="file" accept="image/*" class="hidden" multiple onchange="enviarFotos(this,${jsArg(chave)},'${sl.k}')"><span>${lista.length ? "＋" : "📷"}</span><small>${lista.length ? "Mais uma" : "Tirar foto"}</small></label>
      </div></div>`; }).join("")}
  </div>
  <div class="card" style="margin-top:14px">
    <b>📦 Exportar e liberar espaço</b>
    <p class="sub" style="margin:4px 0 10px">Gera um .zip com as fotos nomeadas no padrão. No iPhone, escolha <b>OneDrive</b> ou <b>Salvar em Arquivos</b>. Depois você pode apagar do sistema.</p>
    <button class="btn block" ${fs.length ? "" : "disabled"} onclick="exportarFotos([${jsArg(chave)}])">📦 Exportar ${fs.length} foto${fs.length === 1 ? "" : "s"} deste cliente</button>
    ${fs.length && naoExp < fs.length ? `<button class="btn block ghost" style="margin-top:8px;color:var(--red)" onclick="apagarFotos(${jsArg(fs.filter(f => f.exportada_em).map(f => f.id))})">🗑️ Apagar do sistema as ${fs.length - naoExp} já exportadas</button>` : ""}
  </div>`;
}
async function mudarTipo(chave, tipo) {
  const o = S.ocs.find(x => x.chave_cliente === chave);
  const r = await rpc("ocv_salvar_tipo", { p_token: S.token, p_chave: chave, p_codigo: o?.cliente_codigo || "", p_tipo: tipo }).catch(e => ({ ok: false, erro: e.message }));
  if (!r.ok) return toast(r.erro);
  S.clientes[chave] = { ...(S.clientes[chave] || {}), ...r.cliente }; render();
}
async function comprimir(file, max = 1600, q = 0.8) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { bmp = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); }); }
  const w = bmp.width, h = bmp.height, k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", q);
}
// Envio rápido: a foto aparece na hora (prévia local) e sobe em segundo plano, 2 por vez.
S.pend = []; S._fila = []; S._subindo = 0;
function renderLeve() { if (S.view === "fotos" && !S.modalOpen) { const y = window.scrollY; document.getElementById("view").innerHTML = vFotos(); window.scrollTo(0, y); renderNav(); } }
function enviarFotos(inp, chave, slot) {
  const files = [...inp.files]; inp.value = ""; if (!files.length) return;
  files.forEach(f => {
    const p = { tmp: "p" + Date.now() + Math.random().toString(36).slice(2, 6), chave, slot, numero: S.fotoNumero, file: f, url: URL.createObjectURL(f), erro: null };
    S.pend.push(p); S._fila.push(p);
  });
  renderLeve(); processarFila();
}
async function processarFila() {
  while (S._subindo < 2 && S._fila.length) {
    const p = S._fila.shift(); S._subindo++;
    (async () => {
      try {
        const data = await comprimir(p.file, 1400, 0.72);
        const d = await fotosApi({ acao: "upload", chave: p.chave, slot: p.slot, numero: p.numero, data });
        S.fotos.push(d.foto);
        const m = (S.fotoUrls[p.chave] = S.fotoUrls[p.chave] || { t: Date.now(), m: {} }).m; m[d.foto.id] = p.url;
        S.pend = S.pend.filter(x => x !== p);
      } catch (e) { p.erro = e.message; toast("Foto não enviada: " + e.message + " — toque nela para tentar de novo", 4500); }
      S._subindo--; renderLeve();
      if (!S._fila.length && !S._subindo && !S.pend.some(x => x.erro)) toast("✅ Fotos salvas");
      processarFila();
    })();
  }
}
function reenviar(tmp) { const p = S.pend.find(x => x.tmp === tmp); if (!p) return; p.erro = null; S._fila.push(p); renderLeve(); processarFila(); }
window.addEventListener("beforeunload", e => { if (S._fila.length || S._subindo) { e.preventDefault(); e.returnValue = ""; } });
async function apagarFotos(ids, perguntar, silencioso) {
  if (!ids.length) return;
  if (perguntar !== false && !confirm(ids.length === 1 ? "Apagar esta foto do sistema? Não dá para desfazer." : `Apagar ${ids.length} fotos do sistema? Não dá para desfazer.`)) return;
  try {
    await fotosApi({ acao: "excluir", ids });
    S.fotos = S.fotos.filter(f => !ids.includes(f.id));
    if (!silencioso) toast(ids.length === 1 ? "Foto apagada" : `${ids.length} fotos apagadas`);
    render();
  } catch (e) { toast(e.message, 4000); }
}
function carregarScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Não consegui carregar o compactador. Verifique a internet.")); document.head.appendChild(s); }); }
function nomeArq(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 70); }
async function exportarFotos(chaves) {
  try {
    if (!window.JSZip) await carregarScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
    const zip = new JSZip(); const ids = []; let i = 0;
    const total = S.fotos.filter(f => chaves.includes(f.chave_cliente)).length;
    for (const chave of chaves) {
      const fs = S.fotos.filter(f => f.chave_cliente === chave); if (!fs.length) continue;
      const o = S.ocs.find(x => x.chave_cliente === chave), c = o ? cliente(o) : { nome: chave, codigo: "" };
      const pasta = zip.folder(nomeArq(`${c.codigo ? c.codigo + " - " : ""}${c.nome}`));
      const d = await fotosApi({ acao: "listar", chave });
      const ordem = slotsDe(chave).map(s => s.k), cont = {}, qtd = {};
      d.fotos.forEach(f => qtd[f.slot] = (qtd[f.slot] || 0) + 1);
      for (const f of d.fotos.sort((a, b) => ordem.indexOf(a.slot) - ordem.indexOf(b.slot) || a.criado_em.localeCompare(b.criado_em))) {
        toast(`Preparando ${++i} de ${total}…`, 1500);
        const blob = await fetch(f.url).then(r => { if (!r.ok) throw new Error("Falha ao baixar foto"); return r.blob(); });
        const sl = slotsDe(chave).find(s => s.k === f.slot) || { l: f.slot };
        cont[f.slot] = (cont[f.slot] || 0) + 1;
        const idx = String(Math.max(0, ordem.indexOf(f.slot)) + 1).padStart(2, "0");
        pasta.file(nomeArq(`${idx} ${sl.l}${qtd[f.slot] > 1 ? " " + cont[f.slot] : ""} - ${ymd(new Date(f.criado_em))}`) + ".jpg", blob);
        ids.push(f.id);
      }
    }
    if (!ids.length) return toast("Nenhuma foto para exportar.");
    const conteudo = await zip.generateAsync({ type: "blob" });
    const nome = (chaves.length === 1 ? "Fotos " + nomeArq((cliente(S.ocs.find(x => x.chave_cliente === chaves[0])) || {}).nome) : "Fotos clientes") + " " + ymd(new Date()) + ".zip";
    const file = new File([conteudo], nome, { type: "application/zip" });
    let ok = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); ok = true; } catch (e) { if (e.name === "AbortError") return; }
    }
    if (!ok) { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = nome; a.click(); ok = true; }
    await fotosApi({ acao: "marcar_exportadas", ids });
    const agora = new Date().toISOString(); S.fotos.forEach(f => { if (ids.includes(f.id)) f.exportada_em = agora; });
    render();
    modal(`<button class="x" onclick="fecharModal()">×</button><h3>✅ ${ids.length} foto${ids.length > 1 ? "s" : ""} exportada${ids.length > 1 ? "s" : ""}</h3>
      <p class="sub">Confira se o arquivo <b>${esc(nome)}</b> chegou no OneDrive (ou na pasta escolhida). Depois disso, você pode apagar do sistema para liberar espaço.</p>
      <button class="btn block" style="background:var(--red)" onclick='fecharModal();setTimeout(()=>apagarFotos(${jsArg(ids)},false),80)'>🗑️ Já conferi — apagar ${ids.length} foto${ids.length > 1 ? "s" : ""} do sistema</button>
      <button class="btn block ghost" style="margin-top:8px" onclick="fecharModal()">Manter por enquanto</button>`);
  } catch (e) { toast(e.message, 4500); }
}

/* ---------------- VISITADAS ---------------- */
function visitada(o) { const v = S.visitas[o.numero]; return v && v.visitada_em ? v : null; }
function visitadasAFechar() { return abertas().filter(o => visitada(o)); }
async function marcarVisita(numero, sim, texto) {
  try {
    const r = await rpc("ocv_salvar_visita", { p_token: S.token, p_numero: numero, p_visitada: !!sim, p_texto: texto ?? null });
    if (!r.ok) throw new Error(r.erro);
    S.visitas[numero] = r.visita;
    toast(sim ? (S.view === "rota" ? "✅ Visitada — saiu da rota. Reorganizando as próximas paradas…" : "✅ Marcada como visitada — falta fechar no Salesforce") : "Marcação de visita removida — voltou para a rota", 3500);
    const y = window.scrollY; render(); window.scrollTo(0, y);
  } catch (e) { toast(e.message, 4000); }
}

/* ---------------- GUIA DE FECHAMENTO ---------------- */
// Modelos de texto no padrão usado nos fechamentos. s = Sim/Não, t = texto curto, l = texto longo, art = (x) Sim ( ) Não
const MOD_VISITA = [
  ["s", "Equipamentos de acordo com o contrato vigente?"], ["t", "Frequência cadastrada?"],
  ["s", "Consumo mensal atual de acordo com o contrato vigente?"], ["art", "Laudo ART emitido?"],
  ["s", "Central atende as normas?"], ["t", "Quais equipamentos disponíveis no cliente?"],
];
// Roteiro oficial de visita (sai completo, com todas as linhas, mesmo em branco)
const ROTEIRO_VISITA = [...MOD_VISITA, ["t", "Qual a vazão exigida pelo cliente?"], ["br"],
  ["t", "Indicação de novos negócios do cliente:"], ["s", "Cliente está satisfeito com o atendimento da Consigaz?"],
  ["l", "Ao indicar o Facilita, qual foi a devolutiva do cliente?"], ["l", "Resumo da visita (opcional)", "opc"]];
const ROTEIRO_SIMPLES = [["l", "Motivo/descrição:"]];
const ROTEIROS_COMPLETOS = [ROTEIRO_VISITA, ROTEIRO_SIMPLES];
const MODELOS = {
  "VISIT RELACIONAMENTO": ROTEIRO_VISITA,
  "VISITA DE TRANSFERÊNCIA": ROTEIRO_VISITA,
  "VISITA PARA CANCELAMENTO DE CONTRATO": [["s", "Contrato e multa entregues em mãos?"], ["l", "Motivo do cancelamento"], ["l", "Tentativa de reversão e resultado"], ["s", "Cliente já trocou os tanques?"], ["t", "Solicitação de retirada nº"], ["l", "Próximos passos"]],
  "RENEG DE PREÇO": [["t", "Preço atual (R$/kg)"], ["t", "Proposta da concorrência"], ["t", "Preço negociado (R$/kg)"], ["t", "Solicitação de alteração de preço nº"], ["s", "Necessário novo contrato?"], ["l", "Motivo / fatores de insatisfação"], ["l", "Resultado da negociação"]],
  "RENEGOCIAÇÃO DE PREÇO MEDIANTE A REG DE CONTRATO": [["t", "Contrato nº"], ["t", "Status da assinatura"], ["t", "Enviado ao Pós-Vendas interno em"], ["l", "Observações"]],
  "REGULARIZAÇÃO CONTRATO": [["t", "Contrato nº"], ["t", "Status da assinatura"], ["t", "Enviado ao Pós-Vendas interno em"], ["l", "Observações"]],
  "VISITA PÓS VENDAS ATIVO": ROTEIRO_SIMPLES,
  "COMODATO INATIVO": [["t", "Equipamentos no cliente"], ["t", "Consumo atual"], ["s", "Previsão de voltar a consumir?"], ["t", "Decisão (manter / retirada parcial / retirada total)"], ["t", "Solicitação / CI nº"], ["l", "Resumo"]],
  "REDIMENS COMODATO": [["t", "Equipamentos no cliente"], ["t", "Consumo atual"], ["t", "Decisão (manter / retirada parcial / retirada total)"], ["t", "Solicitação / CI nº"], ["l", "Resumo"]],
  "REDIMENSIONAMENTO - GIRO": [["t", "Equipamentos no cliente"], ["t", "Consumo atual"], ["t", "Decisão (manter / retirada parcial / retirada total)"], ["t", "Solicitação / CI nº"], ["l", "Resumo"]],
  "ENTREGA / RET DE DOCS": [["t", "Documento entregue"], ["s", "Entregue impresso e em mãos?"], ["l", "Motivo da solicitação"], ["s", "Risco de cancelamento?"], ["l", "Encaminhamento"]],
  "VISITA - RECUSA DE ABASTECIMENTO": [["l", "Motivo da recusa"], ["t", "Estoque no dia da recusa (%)"], ["s", "Frequência cadastrada está correta?"], ["t", "Ação tomada (ajuste / OC nº)"], ["s", "Risco de cancelamento?"], ["l", "Resumo"]],
  "VISITA - ANIVERSÁRIO DE CONTRATO": [["s", "Contrato possui cláusula de reajuste por aniversário?"], ["s", "Reajustes anteriores foram repassados?"], ["t", "Índice aplicado"], ["t", "Preço anterior (R$/kg)"], ["t", "Preço alterado (R$/kg)"], ["t", "Solicitação de alteração de preço nº"], ["l", "Conclusão"]],
  "PEND FINANCEIRA": [["l", "Motivo do atraso"], ["t", "Valor / títulos em aberto"], ["l", "Acordo / condição proposta"], ["s", "Cliente ciente do bloqueio de abastecimento?"], ["l", "Encaminhamento"]],
  "PESQUISA DE SATISF": [["t", "Nota dada pelo cliente"], ["l", "Motivo da nota"], ["l", "Ação tomada"], ["l", "Percepção do cliente após o contato"]],
  "FOLLOW UP DE VENDA DE PEÇAS": [["t", "Orçamento / pedido nº"], ["t", "Status da instalação"], ["s", "Testes de vazamento ok?"], ["l", "Observações"]],
  "IMPLANT - CONTA SIM": [["t", "Nº de unidades / apartamentos"], ["s", "Viável tecnicamente?"], ["l", "Avaliação"], ["l", "Próximo passo"]],
  "VISITA - LIMITAÇÃO DE ABASTECIMENTO": [["l", "Motivo da limitação"], ["s", "Cliente orientado sobre multa e abastecimento de emergência?"], ["t", "Ajuste realizado (frequência / OC nº)"], ["l", "Resumo"]],
  "VISITA CONSULTOR MATRIX": [["s", "Cliente tem interesse?"], ["t", "Consumo médio de energia"], ["l", "Próximo passo"]],
};
const MOD_GENERICO = [["l", "Motivo / descrição"], ["l", "O que foi feito"], ["t", "Ocorrência(s) / solicitação(ões) nº"], ["l", "Encaminhamento"]];
function nomeSub(sub) { return String(sub || "").replace(/^\[[^\]]+\]\s*/, "").trim(); }
function ehTransferencia(sub) { return norm(nomeSub(sub)) === "VISITA DE TRANSFERENCIA"; }
function modeloDe(sub) { return ehTransferencia(sub) ? ROTEIRO_VISITA : ROTEIRO_SIMPLES; }
function rotuloDepto(sub) { return ehTransferencia(sub) ? "Sobrenome ou departamento" : "Departamento/Cargo"; }
function guiaDe(sub) { return S.guias[sub] || null; }
function rascKey(numero, sub) { return "ocv_rasc_" + (numero || "lib_" + nomeSub(sub)); }
function rascLer(numero, sub) { try { return JSON.parse(lsGet(rascKey(numero, sub)) || "{}"); } catch (e) { return {}; } }
function abrirGuia(numero, sub) { go("guia", () => { S.guiaNumero = numero || null; S.guiaSub = sub || (S.ocs.find(o => o.numero === numero) || {}).subclassificacao; }); }
function exemplosDe(sub, max = 3) {
  return S.ocs.filter(o => o.subclassificacao === sub && isFin(o) && o.solucao && o.solucao.length > 120 && o.solucao.length < 1400)
    .sort((a, b) => (b._fe || 0) - (a._fe || 0)).slice(0, max);
}
function vGuiaLista() {
  const subsDados = {}; S.ocs.forEach(o => { subsDados[o.subclassificacao] = (subsDados[o.subclassificacao] || 0) + 1; });
  const todos = [...new Set([...Object.keys(S.guias), ...abertas().map(o => o.subclassificacao)])];
  todos.sort((a, b) => (isRel({ subclassificacao: b }) - isRel({ subclassificacao: a })) || (abertas().filter(o => o.subclassificacao === b).length - abertas().filter(o => o.subclassificacao === a).length) || a.localeCompare(b));
  return `${btnVoltar()}<h2 class="page">📘 Guia de fechamento</h2>
  <p class="sub">O que fazer em cada tipo de ocorrência, com modelo de texto e exemplos reais.</p>
  <div class="guia-lista">${todos.map(sb => { const g = guiaDe(sb), ab = abertas().filter(o => o.subclassificacao === sb).length;
    return `<button class="guia-item" onclick='go("guia",()=>{S.guiaNumero=null;S.guiaSub=${jsArg(sb)}})'>
      <b>${isRel({ subclassificacao: sb }) ? "★ " : ""}${esc(subCurta(sb))}</b>
      <span>${g && g.prazo_du ? `Prazo ${g.prazo_du} dias úteis` : "Sem orientação cadastrada"}${ab ? ` · <em>${ab} aberta${ab > 1 ? "s" : ""}</em>` : ""}</span></button>`; }).join("")}</div>`;
}
function vGuia() {
  const sub = S.guiaSub;
  if (!sub) return vGuiaLista();
  const o = S.guiaNumero ? S.ocs.find(x => x.numero === S.guiaNumero) : null;
  const g = guiaDe(sub) || { sub, nome: nomeSub(sub) };
  const mod = modeloDe(sub);
  const r = rascLer(S.guiaNumero, sub);
  // pré-preenche contato a partir da última anotação / ficha
  let pre = {};
  if (o) {
    const n = S.notas.find(x => x.numero === o.numero) || S.notas.find(x => x.chave_cliente === o.chave_cliente);
    const c = cliente(o);
    pre = { Contato: n?.recebido_por || (c.contato || "").split(" — ")[0] || "", "Sobrenome ou departamento": n?.cargo || (c.contato || "").split(" — ")[1] || "", Telefone: n?.telefone || c.telefone1 || "", "E-mail": c.email || "" };
  }
  const val = k => r[k] ?? pre[k] ?? "";
  const ex = exemplosDe(sub);
  const temFotos = o && S.fotos.some(f => f.chave_cliente === o.chave_cliente);
  const campo = ([t, l], i) => {
    if (t === "br") return "";
    if (t === "s" || t === "art") return `<div class="gq"><label>${esc(l)}</label><div class="seg sm">${["Sim", "Não"].map(v => `<button type="button" class="${val(l) === v ? "on" : ""}" onclick="guiaSet(${jsArg(l)},'${v}')">${v}</button>`).join("")}</div></div>`;
    if (t === "l") return `<div class="gq full"><label>${esc(l)}</label><textarea class="input" rows="3" oninput="guiaSet(${jsArg(l)},this.value,true)">${esc(val(l))}</textarea></div>`;
    return `<div class="gq"><label>${esc(l)}</label><input class="input" value="${esc(val(l))}" oninput="guiaSet(${jsArg(l)},this.value,true)"></div>`;
  };
  return `${btnVoltar()}
  <div class="page-head"><h2 class="page">📘 ${esc(subCurta(sub))}</h2><button class="btn sm ghost" onclick="go('guia',()=>{S.guiaSub=null;S.guiaNumero=null})">Todos os guias</button></div>
  <p class="sub">${o ? `Oc. <b>${o.numero}</b> · ${esc(cliente(o).nome)} · ` : ""}${g.prazo_du ? `Prazo padrão <b>${g.prazo_du} dias úteis</b>` : "Prazo padrão não cadastrado"}${g.origem ? ` · Quem abre: ${esc(g.origem)}` : ""}</p>

  <div class="card guia-acao">
    <div class="section-title" style="margin-top:0">O que fazer <button class="lnk" style="margin-left:auto" onclick="editarGuia(${jsArg(sub)})">✏️ editar</button></div>
    <div>${g.acao ? esc(g.acao) : '<span class="mu">Ainda não há orientação para esta subclassificação. Toque em editar para escrever.</span>'}</div>
    ${g.dicas ? `<div class="dicas">💡 ${esc(g.dicas)}</div>` : ""}
  </div>

  <div class="section-title">✍️ Montar texto de fechamento</div>
  <div class="card">
    <div class="gform">
      ${["Contato", "Sobrenome ou departamento", "Telefone", "E-mail"].map((l, i) => campo(["t", l], "c" + i).replace(">Sobrenome ou departamento</label>", ">" + esc(rotuloDepto(sub)) + "</label>")).join("")}
      ${mod.map(campo).join("")}
      ${temFotos || r.__fotos ? `<label class="chk-line full"><input type="checkbox" ${r.__fotos === false ? "" : "checked"} onchange="guiaSet('__fotos',this.checked)"> Incluir “Fotos da visita em anexo.”</label>` : ""}
    </div>
    <div class="section-title">Texto pronto (pode ajustar antes de copiar)</div>
    ${(() => { const v = o && S.visitas[o.numero]; return v && v.texto ? `<div class="salvo">💾 Texto salvo no sistema em ${fmtDH(v.atualizado_em)}${v.visitada_em ? " · ✅ visitada" : ""} — aparece em qualquer aparelho</div>` : ""; })()}
    <textarea class="input" id="guiaTxt" rows="10">${esc((() => { const v = o && S.visitas[o.numero]; const rascMaisNovo = r.__t && (!v || r.__t > Date.parse(v.atualizado_em)); return v && v.texto && !rascMaisNovo ? v.texto : montarTexto(sub, { ...pre, ...r }, temFotos); })())}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn" style="flex:1" onclick="copiar(document.getElementById('guiaTxt').value)">📋 Copiar texto</button>
      ${o && !isFin(o) ? `<button class="btn" style="flex:1 1 100%;background:var(--green)" onclick="marcarVisita(${o.numero},true,document.getElementById('guiaTxt').value)">✅ Salvar texto e marcar como visitada</button>` : ""}
      <button class="btn ghost" onclick="if(confirm('Limpar o que foi preenchido?')){lsSet(rascKey(S.guiaNumero,S.guiaSub),null);render()}">Limpar</button>
    </div>
    <p class="sub" style="margin:8px 0 0;font-size:12.5px">O que você preenche fica salvo neste aparelho até limpar.</p>
  </div>

  ${ex.length ? `<div class="section-title">📄 Exemplos reais seus <span class="count">${ex.length}</span></div>
    ${ex.map(e => `<details class="card ex"><summary><b>${esc(cliente(e).nome)}</b> · fechada ${fmtData(e.fechamento)}</summary>
      <div class="sol" style="color:var(--ink);margin-top:8px">${esc(e.solucao)}</div>
      <button class="btn sm soft" style="margin-top:8px" onclick='copiar(${jsArg(e.solucao)})'>📋 Copiar exemplo</button></details>`).join("")}` : ""}`;
}
function montarTexto(sub, v, temFotos) {
  const linhas = [], completo = ROTEIROS_COMPLETOS.includes(modeloDe(sub));
  const val = x => (x == null ? "" : String(x).trim());
  const linha = (l, x) => /[?:]$/.test(l) ? `${l} ${val(x)}`.trimEnd() : `${l}: ${val(x)}`.trimEnd();
  const add = (l, x) => { if (completo || val(x) !== "") linhas.push(linha(l, x)); };
  [["Contato", "Contato"], [rotuloDepto(sub), "Sobrenome ou departamento"], ["Telefone", "Telefone"], ["E-mail", "E-mail"]].forEach(([l, k]) => add(l, v[k]));
  modeloDe(sub).forEach(([t, l, opc]) => {
    if (t === "br") { if (completo) linhas.push(""); return; }
    const x = v[l];
    if (t === "art") { if (completo || val(x)) linhas.push(`${l} ${x === "Sim" ? "(x) Sim ( ) Não" : x === "Não" ? "( ) Sim (x) Não" : "( ) Sim ( ) Não"}`); return; }
    const lab = l.replace(/\s*\(.*\)$/, "");
    if (opc) { if (val(x)) linhas.push(linha(lab, x)); return; }
    add(lab, x);
  });
  if ((temFotos && v.__fotos !== false) || v.__fotos === true) linhas.push("Fotos da visita em anexo.");
  return linhas.join("\n");
}
function guiaSet(k, v, digitando) {
  const r = rascLer(S.guiaNumero, S.guiaSub); r[k] = v; r.__t = Date.now(); lsSet(rascKey(S.guiaNumero, S.guiaSub), JSON.stringify(r));
  const o = S.guiaNumero ? S.ocs.find(x => x.numero === S.guiaNumero) : null;
  const temFotos = o && S.fotos.some(f => f.chave_cliente === o.chave_cliente);
  if (digitando) {
    const n = o ? (S.notas.find(x => x.numero === o.numero) || S.notas.find(x => x.chave_cliente === o.chave_cliente)) : null; const c = o ? cliente(o) : {};
    const pre = o ? { Contato: n?.recebido_por || (c.contato || "").split(" — ")[0] || "", "Sobrenome ou departamento": n?.cargo || (c.contato || "").split(" — ")[1] || "", Telefone: n?.telefone || c.telefone1 || "" } : {};
    document.getElementById("guiaTxt").value = montarTexto(S.guiaSub, { ...pre, ...r }, temFotos);
  } else { const y = window.scrollY; render(); window.scrollTo(0, y); }
}
async function copiar(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); }
  toast("Copiado ✓ — cole no Salesforce");
}
function editarGuia(sub) {
  const g = guiaDe(sub) || { sub, nome: nomeSub(sub) };
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>✏️ Editar guia</h3><p class="sub">${esc(subCurta(sub))}</p>
    <div class="form-grid">
      <div class="field"><label>Prazo padrão (dias úteis)</label><input class="input" id="gp" inputmode="numeric" value="${esc(g.prazo_du ?? "")}"></div>
      <div class="field"><label>Quem abre</label><input class="input" id="go" value="${esc(g.origem || "")}"></div>
      <div class="field full"><label>O que fazer</label><textarea class="input" id="ga" rows="6">${esc(g.acao || "")}</textarea></div>
      <div class="field full"><label>Dicas (opcional)</label><textarea class="input" id="gd" rows="3" placeholder="Ex.: sempre levar o contrato impresso; conferir CRM antes">${esc(g.dicas || "")}</textarea></div>
    </div>
    <button class="btn block" style="margin-top:12px" onclick="salvarGuia(${jsArg(sub)})">Salvar</button>`);
}
async function salvarGuia(sub) {
  const g = id => document.getElementById(id).value.trim();
  const r = await rpc("ocv_salvar_guia", { p_token: S.token, p: { sub, nome: nomeSub(sub), prazo_du: g("gp"), origem: g("go"), acao: g("ga"), dicas: g("gd") } }).catch(e => ({ ok: false, erro: e.message }));
  if (!r.ok) return toast(r.erro);
  S.guias[sub] = r.guia; fecharModal(); toast("Guia salvo ✓"); setTimeout(render, 80);
}

/* ---------------- MEDIDORES (Conta Sim) ---------------- */
async function medApi(body) {
  const r = await fetch(FN_MED, { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY }, body: JSON.stringify({ token: S.token, ...body }) });
  const d = await r.json().catch(() => ({ ok: false, erro: "Falha de rede" }));
  if (d.erro === "SESSAO_INVALIDA") { sair(true); throw new Error("Sessão expirada. Entre novamente."); }
  if (!d.ok) throw new Error(d.erro || "Erro ao processar medidor");
  return d;
}
function medsDe(chave) { return S.medidores.filter(m => m.chave_cliente === chave); }
async function carregarMedUrls(chave) {
  if (!medsDe(chave).length) return;
  const d = await medApi({ acao: "listar", chave });
  const m = {}; d.medidores.forEach(x => m[x.id] = x.url); S.medUrls[chave] = { t: Date.now(), m };
}
function abrirMedidores(chave, numero) {
  go("medidores", () => { S.medChave = chave; S.medNumero = numero || null; S.medQ = ""; });
  const c = S.medUrls[chave];
  if (!c || Date.now() - c.t > 45 * 60e3) carregarMedUrls(chave).then(() => S.view === "medidores" && render()).catch(e => toast(e.message));
}
function ordUnidade(a, b) { return String(a.unidade).localeCompare(String(b.unidade), "pt-BR", { numeric: true, sensitivity: "base" }); }
function vMedidores() {
  const chave = S.medChave, ref = refCliente(chave);
  if (!ref) return `${btnVoltar()}<div class="card empty">Cliente não encontrado.</div>`;
  const c = cliente(ref), urls = (S.medUrls[chave] || {}).m || {};
  let l = medsDe(chave).slice().sort(ordUnidade);
  const dupU = {}, dupS = {}; l.forEach(m => { dupU[norm(m.unidade)] = (dupU[norm(m.unidade)] || 0) + 1; if (m.serie) dupS[norm(m.serie)] = (dupS[norm(m.serie)] || 0) + 1; });
  const total = l.length, semLeit = l.filter(m => !m.serie || !m.leitura).length, naoExp = l.filter(m => !m.exportado_em).length;
  const q = norm(S.medQ || ""); if (q) l = l.filter(m => norm([m.unidade, m.serie, m.leitura].join(" ")).includes(q));
  return `${btnVoltar()}
  <h2 class="page">📟 Coletar medidores</h2>
  <p class="sub"><b>${esc(c.nome)}</b>${c.codigo ? " · Cód. " + esc(c.codigo) : ""} · ${esc(c.cidade)}</p>
  <div class="grid g4" style="margin-bottom:12px">
    <div class="card kpi green"><div class="n">${total}</div><div class="l">Unidades coletadas</div></div>
    <div class="card kpi ${semLeit ? "orange" : ""}"><div class="n">${semLeit}</div><div class="l">Sem série ou leitura</div></div>
    <div class="card kpi"><div class="n">${naoExp}</div><div class="l">Ainda não exportadas</div></div>
    <div class="card kpi ${Object.values(dupU).some(n => n > 1) || Object.values(dupS).some(n => n > 1) ? "red" : ""}"><div class="n">${Object.values(dupU).filter(n => n > 1).length + Object.values(dupS).filter(n => n > 1).length}</div><div class="l">Repetidos (conferir)</div></div>
  </div>
  <div class="med-acts">
    <button class="btn" onclick="coletarMedidor()">📷 Coletar medidor</button>
    <button class="btn ghost" ${total ? "" : "disabled"} onclick="exportarMedidores(${jsArg(chave)})" title="Planilha no padrão Conta Sim + fotos">📦 Exportar${total ? ` (${total})` : ""}</button>
  </div>
  <div class="med-hint">${total ? `Exporta a planilha no padrão Conta Sim Digital + as fotos (.zip).${naoExp ? ` <b>${naoExp}</b> ainda não exportada${naoExp > 1 ? "s" : ""}.` : " Tudo já exportado."}` : "O botão Exportar libera depois do 1º medidor coletado."}</div>
  ${total > 6 ? `<div class="toolbar" style="margin-top:12px"><input class="input" placeholder="Buscar unidade, série ou leitura" value="${esc(S.medQ || "")}" oninput="S.medQ=this.value;debRender()"></div>` : ""}
  <div class="section-title">Unidades <span class="count">${total}</span></div>
  ${l.length ? l.map(m => { const du = dupU[norm(m.unidade)] > 1, ds = m.serie && dupS[norm(m.serie)] > 1;
    return `<div class="med ${du || ds ? "dup" : ""}" onclick="coletarMedidor(${jsArg(m.id)})">
      <div class="med-img">${urls[m.id] ? `<img src="${urls[m.id]}" alt="" loading="lazy">` : "📟"}</div>
      <div class="med-b"><div class="med-u">${esc(m.unidade)}${du ? ' <span class="pill p-red">unidade repetida</span>' : ""}</div>
        <div class="med-l">Série <b>${esc(m.serie || "—")}</b>${ds ? ' <span class="pill p-red">série repetida</span>' : ""}</div>
        <div class="med-l">Leitura <b>${esc(m.leitura || "—")}</b> m³</div>
        <div class="med-d">${fmtDH(m.criado_em)}${m.exportado_em ? ' · <span class="pill p-green">exportado</span>' : ""}</div></div>
      <span class="chev">›</span></div>`; }).join("") : `<div class="card empty">Nenhum medidor coletado ainda.<br>Toque em <b>+ Coletar medidor</b>, digite a unidade e tire a foto: a leitura e o nº de série são preenchidos sozinhos.</div>`}
  ${total - naoExp ? `<button class="btn block ghost" style="margin-top:14px;color:var(--red)" onclick='apagarMedidores(${jsArg(medsDe(chave).filter(m => m.exportado_em).map(m => m.id))})'>🗑️ Apagar do sistema os ${total - naoExp} já exportados</button>` : ""}`;
}
function coletarMedidor(id) {
  const m = id ? S.medidores.find(x => x.id === id) : null;
  const url = m ? ((S.medUrls[S.medChave] || {}).m || {})[m.id] : null;
  S._medFoto = null; S._medIA = null;
  modal(`<button class="x" onclick="fecharModal()">×</button>
    <h3>📟 ${m ? "Editar medidor" : "Coletar medidor"}</h3>
    <p class="sub">${esc(cliente(refCliente(S.medChave)).nome)}</p>
    <div class="field"><label>Apartamento / casa / unidade</label>
      <input class="input" id="m_un" value="${esc(m ? m.unidade : "")}" placeholder="Ex.: Apto 101, Bloco B 202, Casa 3" autocomplete="off"></div>
    <label class="med-foto" id="m_fotoBox">
      <input type="file" accept="image/*" capture="environment" class="hidden" onchange="lerFotoMedidor(this)">
      ${url ? `<img src="${url}" alt="">` : `<span>📷</span><b>Tirar foto do medidor</b><small>Enquadre o mostrador e a plaqueta do nº de série</small>`}
    </label>
    <div id="m_ia"></div>
    <div class="form-grid">
      <div class="field"><label>Nº de série</label><input class="input" id="m_se" value="${esc(m ? m.serie || "" : "")}" autocomplete="off"></div>
      <div class="field"><label>Leitura (m³)</label><input class="input" id="m_le" value="${esc(m ? m.leitura || "" : "")}" inputmode="decimal" autocomplete="off"></div>
    </div>
    <div class="err" id="m_err"></div>
    <button class="btn block" id="m_btn" onclick="salvarMedidor(${jsArg(m ? m.id : "")},false)">💾 Salvar</button>
    ${m ? `<button class="btn block ghost" style="margin-top:8px;color:var(--red)" onclick='apagarMedidores([${jsArg(m.id)}],true)'>Excluir este medidor</button>`
        : `<button class="btn block soft" style="margin-top:8px" onclick="salvarMedidor('',true)">💾 Salvar e coletar o próximo</button>`}`);
  if (!m) setTimeout(() => document.getElementById("m_un")?.focus(), 150);
}
async function lerFotoMedidor(inp) {
  const f = inp.files[0]; if (!f) return;
  const box = document.getElementById("m_fotoBox"), ia = document.getElementById("m_ia");
  try {
    box.innerHTML = `<input type="file" accept="image/*" capture="environment" class="hidden" onchange="lerFotoMedidor(this)"><img src="${URL.createObjectURL(f)}" alt="">`;
    ia.innerHTML = `<div class="otim-run" style="margin:8px 0"><div class="spinner" style="width:20px;height:20px;margin:0"></div>Preparando a foto…</div>`;
    const data = await comprimir(f, 1600, 0.8);
    S._medFoto = data;
    ia.innerHTML = `<div class="otim-run" style="margin:8px 0"><div class="spinner" style="width:20px;height:20px;margin:0"></div>Lendo nº de série e leitura com IA…</div>`;
    const r = await medApi({ acao: "ler", data });
    S._medIA = r;
    if (r.serie) document.getElementById("m_se").value = r.serie;
    if (r.leitura) document.getElementById("m_le").value = r.leitura;
    const cor = r.confianca === "alta" ? "p-green" : r.confianca === "media" ? "p-yellow" : "p-red";
    ia.innerHTML = `<div class="ia-res"><span class="pill ${cor}">IA: confiança ${esc(r.confianca || "?")}</span> Confira os números antes de salvar.${r.observacao ? `<br><small>${esc(r.observacao)}</small>` : ""}</div>`;
  } catch (e) {
    ia.innerHTML = `<div class="ia-res" style="color:var(--red)">⚠️ Não consegui ler automaticamente (${esc(e.message)}). Digite a série e a leitura olhando a foto — ela será salva do mesmo jeito.</div>`;
  }
}
async function salvarMedidor(id, proximo) {
  const g = i => (document.getElementById(i)?.value || "").trim();
  const unidade = g("m_un");
  if (!unidade) { document.getElementById("m_err").textContent = "Informe o apartamento/casa."; return; }
  if (!id && !S._medFoto && !confirm("Salvar sem foto?")) return;
  const btn = document.getElementById("m_btn"); btn.disabled = true; btn.textContent = "Salvando…";
  try {
    const d = await medApi({ acao: "salvar", id: id || null, chave: S.medChave, numero: S.medNumero, unidade, serie: g("m_se"), leitura: g("m_le"), data: S._medFoto, ia: S._medIA });
    S.medidores = [...S.medidores.filter(x => x.id !== d.medidor.id), d.medidor];
    if (S._medFoto) { const c = (S.medUrls[S.medChave] = S.medUrls[S.medChave] || { t: Date.now(), m: {} }); c.m[d.medidor.id] = S._medFoto; }
    toast(`✅ ${unidade} salvo`);
    if (proximo) { render(); coletarMedidor(); } else { fecharModal(); setTimeout(render, 80); }
  } catch (e) { document.getElementById("m_err").textContent = e.message; btn.disabled = false; btn.textContent = "💾 Salvar"; }
}
async function apagarMedidores(ids, dentroModal) {
  if (!ids.length || !confirm(ids.length === 1 ? "Excluir este medidor e a foto? Não dá para desfazer." : `Excluir ${ids.length} medidores e as fotos do sistema? Não dá para desfazer.`)) return;
  try {
    await medApi({ acao: "excluir", ids });
    S.medidores = S.medidores.filter(m => !ids.includes(m.id));
    if (dentroModal) fecharModal(); toast("Excluído"); setTimeout(render, 80);
  } catch (e) { toast(e.message, 4000); }
}
function leituraM3(v) {
  if (v === null || v === undefined || v === "") return "";
  let t = String(v).replace(/\s/g, ""); t = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(t);
  if (!isFinite(n)) return String(v);
  const p = n.toFixed(3).split("."); return `${p[0].padStart(5, "0")},${p[1]}`;
}
function partesUnidade(u) {
  const t = String(u || "").trim();
  const torre = (t.match(/torre\s*([\w-]+)/i) || [])[1] || "";
  const bloco = (t.match(/bl(?:oco|\.)?\s*([\w-]+)/i) || [])[1] || "";
  let apto = t.replace(/torre\s*[\w-]+/i, "").replace(/bl(?:oco|\.)?\s*[\w-]+/i, "").replace(/ap(?:to|artamento|\.)?\s*/i, "").replace(/[-–·,]+/g, " ").trim();
  return { torre, bloco, apto: apto || t };
}
async function exportarMedidores(chave) {
  try {
    toast("Preparando exportação…", 2500);
    if (!window.JSZip) await carregarScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
    if (!window.ExcelJS) await carregarScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
    const ref = refCliente(chave), c = cliente(ref);
    const d = await medApi({ acao: "listar", chave });
    const lista = d.medidores.slice().sort(ordUnidade);
    const usados = {}; lista.forEach(m => { let n = nomeArq(`${m.unidade} - ${m.serie || "sem serie"}`); if (usados[n]) n += ` (${++usados[n]})`; else usados[n] = 1; m._arq = n + ".jpg"; });

    const NAVY = "FF0B2947", FLAME = "FFFF5630", SUCCESS = "FFE7F7EC", SUCCESS_TXT = "FF16A34A", WARNING = "FFFEF3DA", WARNING_TXT = "FF92660A", NEUTRAL_TXT = "FF4B5875";
    const BORDER = { style: "thin", color: { argb: "FFDCE1EA" } };
    const wb = new ExcelJS.Workbook(); wb.creator = "Consigaz - Conta Sim Digital"; wb.created = new Date();
    let logo = null; try { logo = wb.addImage({ buffer: await fetch("logo-consigaz.png").then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }), extension: "png" }); } catch (e) {}
    const sh = wb.addWorksheet("Conta Sim Digital", { views: [{ state: "frozen", ySplit: 7 }] });
    const colunas = ["Torre", "Bloco", "Apto", "Morador", "CPF", "Data de Nascimento", "E-mail", "Telefone", "Nº Série Medidor", "Leitura (m³)", "Status Medidor", "Status Validação", "Aviso"];
    sh.columns = colunas.map(x => ({ width: Math.max(14, x.length + 4) }));
    sh.columns[3].width = 26; sh.columns[6].width = 26; sh.columns[12].width = 30;
    sh.mergeCells("A1:M1"); sh.getRow(1).height = 8; sh.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: FLAME } };
    if (logo !== null) sh.addImage(logo, { tl: { col: 0.15, row: 1.15 }, ext: { width: 118, height: 28 } });
    sh.getRow(2).height = 24;
    const linhaTopo = (r, v, font, h) => { sh.mergeCells(`A${r}:M${r}`); const cl = sh.getCell(`A${r}`); cl.value = v; cl.font = { name: "Calibri", ...font }; cl.alignment = { vertical: "middle", horizontal: "left", indent: 1 }; sh.getRow(r).height = h; };
    linhaTopo(3, "Conta Sim Digital", { size: 11, bold: true, color: { argb: "FF8A93A6" } }, 16);
    linhaTopo(4, c.nome || "", { size: 17, bold: true, color: { argb: NAVY } }, 24);
    linhaTopo(5, [c.codigo ? `Cód. cliente: ${c.codigo}` : "", c.contato ? `Contato: ${c.contato}${c.telefone1 ? "  ·  " + c.telefone1 : ""}` : ""].filter(Boolean).join("   |   "), { size: 10.5, color: { argb: NAVY } }, 16);
    linhaTopo(6, enderecoTexto(c), { size: 10, italic: true, color: { argb: "FF8A93A6" } }, 16);
    const hr = sh.getRow(7); hr.values = colunas; hr.height = 24;
    hr.eachCell(cl => { cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; cl.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 11 }; cl.alignment = { vertical: "middle", horizontal: "center" }; cl.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }; });
    let capt = 0;
    for (const m of lista) {
      const ok = !!(m.serie && m.leitura); if (ok) capt++;
      const u = partesUnidade(m.unidade);
      const row = sh.addRow([u.torre, u.bloco, u.apto, "", "", "", "", "", m.serie || "", leituraM3(m.leitura), ok ? "Capturado" : "Pendente", "Aguardando", ""]);
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cl, n) => {
        cl.font = { name: "Calibri", size: 10.5, color: { argb: "FF14213D" } };
        cl.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }; cl.alignment = { vertical: "middle" };
        if (n === 6) cl.alignment.horizontal = "center";
        if (n === 10) { cl.font.name = "Courier New"; cl.alignment.horizontal = "center"; }
        if (n === 11) { cl.alignment.horizontal = "center"; cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ok ? SUCCESS : WARNING } }; cl.font.color = { argb: ok ? SUCCESS_TXT : WARNING_TXT }; cl.font.bold = true; }
        if (n === 12) { cl.alignment.horizontal = "center"; cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F1F4" } }; cl.font.color = { argb: NEUTRAL_TXT }; cl.font.bold = true; }
      });
    }
    sh.autoFilter = { from: "A7", to: `M${7 + lista.length}` };
    // Resumo
    const tot = lista.length, pct = tot ? Math.round(capt / tot * 100) : 0;
    const rs = wb.addWorksheet("Resumo"); rs.columns = [{ width: 4 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 4 }];
    rs.mergeCells("A1:F1"); rs.getRow(1).height = 8; rs.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: FLAME } };
    if (logo !== null) rs.addImage(logo, { tl: { col: 0.15, row: 1.15 }, ext: { width: 148, height: 35 } });
    rs.mergeCells("B2:F3"); const t = rs.getCell("B2"); t.value = `Resumo - ${c.nome || ""}`; t.font = { name: "Calibri", size: 16, bold: true, color: { argb: NAVY } }; t.alignment = { vertical: "bottom", horizontal: "right" };
    rs.mergeCells("B4:F4"); const sb = rs.getCell("B4"); sb.value = `Gerado em ${new Date().toLocaleString("pt-BR")}`; sb.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF8A93A6" } }; sb.alignment = { horizontal: "right" };
    rs.getRow(2).height = 20; rs.getRow(3).height = 20;
    [{ t: "TOTAL DE UNIDADES", v: tot, c: NAVY, f: "FFEFF3F8" }, { t: "MEDIDORES CAPTURADOS", v: capt, c: SUCCESS_TXT, f: SUCCESS }, { t: "PENDENTES", v: tot - capt, c: tot - capt ? WARNING_TXT : NEUTRAL_TXT, f: tot - capt ? WARNING : "FFF0F1F4" }, { t: "% CONCLUÍDO", v: `${pct}%`, c: pct === 100 ? SUCCESS_TXT : WARNING_TXT, f: pct === 100 ? SUCCESS : WARNING }].forEach((k, i) => {
      const col = "BCDE"[i]; rs.mergeCells(`${col}6:${col}7`); rs.mergeCells(`${col}8:${col}9`);
      const a1 = rs.getCell(`${col}6`); a1.value = k.t; a1.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF8A93A6" } }; a1.alignment = { vertical: "bottom", horizontal: "center", wrapText: true };
      const a2 = rs.getCell(`${col}8`); a2.value = k.v; a2.font = { name: "Calibri", size: 22, bold: true, color: { argb: k.c } }; a2.alignment = { vertical: "top", horizontal: "center" };
      for (let l = 6; l <= 9; l++) rs.getCell(`${col}${l}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.f } };
    });
    rs.getRow(6).height = 16; rs.getRow(7).height = 8; rs.getRow(8).height = 30; rs.getRow(9).height = 10;
    rs.mergeCells("B11:F11"); rs.getCell("B11").value = "Consigaz Distribuidora de Gás LTDA - Sistema Conta Sim Digital"; rs.getCell("B11").font = { size: 9, italic: true, color: { argb: "FF8A93A6" } };
    const xlsx = await wb.xlsx.writeBuffer();
    const base = nomeArq(`conta-sim ${c.codigo ? c.codigo + " - " : ""}${c.nome} ${ymd(new Date())}`);
    const zip = new JSZip(); zip.file(base + ".xlsx", xlsx);
    const pasta = zip.folder("Fotos"); let i = 0;
    for (const m of lista) {
      if (!m.url) continue;
      toast(`Baixando foto ${++i}…`, 1200);
      const blob = await fetch(m.url).then(r => r.blob());
      pasta.file(m._arq, blob);
    }
    const file = new File([await zip.generateAsync({ type: "blob" })], base + ".zip", { type: "application/zip" });
    let ok = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: base }); ok = true; } catch (e) { if (e.name === "AbortError") return; } }
    if (!ok) { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
    const ids = lista.map(m => m.id);
    await medApi({ acao: "marcar_exportados", ids });
    const agora = new Date().toISOString(); S.medidores.forEach(m => { if (ids.includes(m.id)) m.exportado_em = agora; });
    render(); toast(`✅ ${lista.length} medidores exportados`, 3500);
  } catch (e) { toast(e.message || "Erro ao exportar", 4500); }
}

/* ---------------- modal ---------------- */
function modal(html) {
  if (!S.modalOpen) { S.modalOpen = true; try { history.pushState({ ...snap(), modal: true }, ""); } catch (e) {} }
  document.getElementById("modalRoot").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)fecharModal()"><div class="modal">${html}</div></div>`;
  document.body.style.overflow = "hidden";
}
function fecharModal(doHistorico) {
  document.getElementById("modalRoot").innerHTML = ""; document.body.style.overflow = "";
  if (S.modalOpen) { S.modalOpen = false; if (!doHistorico) history.back(); }
}
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharModal(); });

async function trocarPin() {
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>Trocar PIN</h3><p class="sub">4 números</p>
    <div class="field"><label>PIN atual</label><input class="input" id="pAt" inputmode="numeric" maxlength="4" autocomplete="off" style="-webkit-text-security:disc"></div>
    <div class="field"><label>Novo PIN</label><input class="input" id="pNo" inputmode="numeric" maxlength="4" autocomplete="off" style="-webkit-text-security:disc"></div>
    <div class="err" id="pErr"></div><button class="btn block" onclick="confirmarPin()">Salvar novo PIN</button>`);
}
async function confirmarPin() {
  const r = await rpc("ocv_trocar_pin", { p_token: S.token, p_pin_atual: document.getElementById("pAt").value, p_pin_novo: document.getElementById("pNo").value }).catch(e => ({ ok: false, erro: e.message }));
  if (!r.ok) { document.getElementById("pErr").textContent = r.erro; return; }
  fecharModal(); toast("PIN alterado ✓");
}

/* ---------------- IMPORTAR ---------------- */
function vImportar() {
  return `
  ${btnVoltar()}<h2 class="page">Importar planilha</h2>
  <p class="sub">Exporte “Minhas Ocorrências Pós-Vendas” e envie aqui todo dia. Só o que é novo ou mudou é atualizado — suas edições de endereço e telefone nunca são apagadas.</p>
  <label class="drop" id="drop"><input type="file" id="fileIn" accept=".xls,.xlsx,.csv,.html,.htm" class="hidden">
    <b>📄 Toque para escolher o arquivo</b><span style="color:var(--muted);font-size:14px">ou arraste aqui (.xls / .xlsx)</span></label>
  <div id="impRes"></div>
  <div class="section-title">Histórico de importações</div>
  <div class="card" style="padding:4px 14px">${S.importacoes.length ? `<table class="t"><thead><tr><th>Quando</th><th>Novas</th><th>Atualiz.</th><th>Iguais</th><th>Reab.</th></tr></thead><tbody>
    ${S.importacoes.map(i => `<tr><td>${fmtDH(i.em)}</td><td><b>${i.novas}</b></td><td>${i.atualizadas}</td><td style="color:var(--muted)">${i.iguais}</td><td style="color:${i.reabertas ? "var(--red)" : "var(--muted)"};font-weight:700">${i.reabertas || 0}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Nenhuma importação ainda.</div>'}</div>
  <div class="section-title">📷 Fotos guardadas no sistema</div>
  <div class="card">${(() => { const ch = [...new Set(S.fotos.map(f => f.chave_cliente))]; const mb = (S.fotos.reduce((a, f) => a + (f.tamanho || 0), 0) / 1048576).toFixed(1);
    return S.fotos.length ? `<div><b>${S.fotos.length}</b> fotos de <b>${ch.length}</b> cliente${ch.length > 1 ? "s" : ""} · ${mb.replace(".", ",")} MB · ${S.fotos.filter(f => !f.exportada_em).length} ainda não exportadas</div>
      <button class="btn block" style="margin-top:10px" onclick='exportarFotos(${jsArg(ch)})'>📦 Exportar todas (um .zip com uma pasta por cliente)</button>` : '<div class="empty" style="padding:10px">Nenhuma foto ainda. Use o botão 📷 Fotos em qualquer ocorrência.</div>'; })()}</div>
  <p class="sub" style="margin-top:20px;text-align:center"><a href="#" onclick="trocarPin();return false">Trocar PIN</a> · <a href="#" onclick="sair();return false">Sair</a></p>`;
}
function bindImport() {
  const drop = document.getElementById("drop"), inp = document.getElementById("fileIn");
  inp.addEventListener("change", () => inp.files[0] && importarArquivo(inp.files[0]));
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => e.dataTransfer.files[0] && importarArquivo(e.dataTransfer.files[0]));
}

const COLS = {
  estabelecimento: ["ESTABELECIMENTO"], numero: ["NUMERO DA OCORRENCIA"], ticket: ["NUMERO DO TICKET ZENDESK"],
  cliente: ["NOME DO CLIENTE"], endereco: ["ENDERECO DE ENTREGA"], sub: ["SUBCLASSIFICACAO OCORRENCIA"],
  abertura: ["DATA/HORA DE ABERTURA"], prazo: ["PRAZO DE ATENDIMENTO"], fechamento: ["DATA/HORA DE FECHAMENTO"],
  reabertura: ["REABERTURA"], reincidencia: ["REINCIDENCIA"], solucao: ["SOLUCAO"], proprietario: ["PROPRIETARIO DA OCORRENCIA"], status: ["STATUS"],
};
async function lerTabela(file) {
  const buf = await file.arrayBuffer();
  const head = new TextDecoder("latin1").decode(buf.slice(0, 600)).trim().toLowerCase();
  if (head.startsWith("<") || head.includes("<table")) {
    // exportação do sistema: HTML em ISO-8859-1 com extensão .xls
    let txt = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const m = /charset=([\w-]+)/i.exec(head);
    if ((m && /8859|latin|1252/i.test(m[1])) || txt.includes("�")) txt = new TextDecoder(m && /1252/.test(m[1]) ? "windows-1252" : "iso-8859-1").decode(buf);
    const doc = new DOMParser().parseFromString(txt, "text/html");
    const rows = [...doc.querySelectorAll("tr")].map(tr => [...tr.children].map(td => td.textContent.trim()));
    return rows;
  }
  if (!window.XLSX) throw new Error("Leitor de Excel ainda carregando, tente de novo em instantes.");
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }).map(r => r.map(v => String(v ?? "").trim()));
}
function parseDataBR(s) {
  s = String(s || "").trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let [, d, mo, y, h = "0", mi = "0", se = "0"] = m; if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${se.padStart(2, "0")}-03:00`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}:00-03:00`;
  return null;
}
function parseEndereco(raw) {
  raw = String(raw || "").trim();
  let codigo = "", resto = raw;
  const m = raw.match(/^\s*(\d{3,})\s*\|\s*(.*)$/);
  if (m) { codigo = m[1]; resto = m[2]; }
  const p = resto.split(/[;,]/).map(x => x.trim()).filter(Boolean);
  const uf = p.length >= 1 ? p[p.length - 1] : "", cidade = p.length >= 2 ? p[p.length - 2] : "", bairro = p.length >= 3 ? p[p.length - 3] : "";
  const ponto = p.length > 3 ? p.slice(0, p.length - 3).join(", ") : "";
  return { codigo, ponto, bairro, cidade, uf };
}
function chaveExistente(codigo, nome) {
  if (codigo) { const ed = Object.values(S.clientes).find(c => c.codigo === codigo && c.chave !== "C" + codigo); if (ed) return ed.chave; }
  return chaveCliente(codigo, nome);
}
function chaveCliente(codigo, nome) { return codigo ? "C" + codigo : "N:" + norm(nome).replace(/[^A-Z0-9]+/g, " ").trim(); }
// Converte texto exportado (HTML da planilha .xls ou CSV) em linhas/colunas
function linhasDeTexto(txt) {
  const t = String(txt || "").replace(/^﻿/, "");
  if (/<table/i.test(t.slice(0, 5000))) {
    const doc = new DOMParser().parseFromString(t, "text/html");
    return [...doc.querySelectorAll("tr")].map(tr => [...tr.children].map(td => td.textContent.trim()));
  }
  const sep = (t.split("\n")[0].match(/;/g) || []).length > (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur.trim()); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cur.trim()); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c));
}
function rowsParaLinhas(rows) {
  const hi = rows.findIndex(r => r.some(c => norm(c) === "NUMERO DA OCORRENCIA"));
  if (hi < 0) throw new Error("Não encontrei a coluna “Número da ocorrência”. É a planilha certa?");
  const hdr = rows[hi].map(norm);
  const idx = {}; for (const [k, names] of Object.entries(COLS)) idx[k] = hdr.findIndex(h => names.includes(h));
  const g = (r, k) => idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "";
  const linhas = [];
  for (const r of rows.slice(hi + 1)) {
    const num = digits(g(r, "numero")); if (!num) continue;
    const e = parseEndereco(g(r, "endereco"));
    const nome = g(r, "cliente");
    linhas.push({
      numero: +num, estabelecimento: g(r, "estabelecimento"), ticket: g(r, "ticket").replace(/\.0+$/, "") || null,
      cliente_nome: nome, cliente_codigo: e.codigo || null, chave_cliente: chaveExistente(e.codigo, nome),
      endereco_raw: g(r, "endereco"), ponto_entrega: e.ponto, bairro: e.bairro, cidade: e.cidade, uf: e.uf,
      subclassificacao: g(r, "sub"), abertura: parseDataBR(g(r, "abertura")), prazo: parseDataBR(g(r, "prazo")),
      fechamento: parseDataBR(g(r, "fechamento")), reabertura: +digits(g(r, "reabertura")) || 0, reincidencia: +digits(g(r, "reincidencia")) || 0,
      solucao: g(r, "solucao") || null, proprietario: g(r, "proprietario"), status: g(r, "status"),
    });
  }
  if (!linhas.length) throw new Error("Nenhuma ocorrência encontrada no arquivo.");
  return linhas;
}
async function enviarLinhas(linhas, nome, progresso) {
  let tot = { novas: 0, atualizadas: 0, iguais: 0, total: 0, reabertas: 0 };
  for (let i = 0; i < linhas.length; i += 400) {
    progresso && progresso(`Enviando ${Math.min(i + 400, linhas.length)} de ${linhas.length} ocorrências…`);
    const r = await rpc("ocv_importar", { p_token: S.token, p_arquivo: nome + (linhas.length > 400 ? ` [${i / 400 + 1}]` : ""), p_linhas: linhas.slice(i, i + 400) });
    ["novas", "atualizadas", "iguais", "total", "reabertas"].forEach(k => tot[k] += (r[k] || 0));
  }
  const antesAb = new Set(abertas().map(o => o.numero));
  await carregar();
  tot.fechadas = finalizadas().filter(o => antesAb.has(o.numero)).length;
  return tot;
}
function resumoImport(tot) {
  return `<div class="stats"><span class="pill p-green">${tot.novas} novas</span><span class="pill p-blue">${tot.atualizadas} atualizadas</span><span class="pill p-gray">${tot.iguais} sem mudança (ignoradas)</span>${tot.reabertas ? `<span class="pill p-red">↺ ${tot.reabertas} reabertura${tot.reabertas > 1 ? "s" : ""} detectada${tot.reabertas > 1 ? "s" : ""}</span>` : ""}${tot.fechadas ? `<span class="pill p-purple">${tot.fechadas} fecharam desde a última</span>` : ""}</div>`;
}
async function importarArquivo(file) {
  const out = document.getElementById("impRes");
  out.innerHTML = `<div class="card" style="margin-top:12px"><div class="spinner"></div><p style="text-align:center">Lendo ${esc(file.name)}…</p></div>`;
  try {
    const linhas = rowsParaLinhas(await lerTabela(file));
    const tot = await enviarLinhas(linhas, file.name, m => { const p = out.querySelector("p"); if (p) p.textContent = m; });
    render();
    document.getElementById("impRes").innerHTML = `<div class="card" style="margin-top:12px">
      <b style="font-size:16px">✅ Importação concluída</b>${resumoImport(tot)}
      <button class="btn block" onclick="go('inicio')">Ver meu painel</button></div>`;
  } catch (e) {
    out.innerHTML = `<div class="card" style="margin-top:12px;color:var(--red)">⚠️ ${esc(e.message)}</div>`;
  }
}

/* ---------------- importação automática (Salesforce → sistema) ----------------
   A aba do Salesforce abre esta página com #receber e envia o relatório exportado
   por postMessage. Só aceita mensagens vindas de domínios do Salesforce e com login ativo. */
const ORIGENS_SF = /^https:\/\/[a-z0-9.-]+\.(salesforce|force|visualforce|salesforce-setup|lightning\.force)\.com$/i;
S.ultimoAuto = null;
window.addEventListener("message", async ev => {
  const d = ev.data || {};
  if (d.tipo !== "ocv-planilha" || !ORIGENS_SF.test(ev.origin)) return;
  const responder = msg => { try { ev.source && ev.source.postMessage({ tipo: "ocv-resultado", ...msg }, ev.origin); } catch (e) {} };
  if (!S.token) return responder({ ok: false, erro: "Sistema sem login neste navegador. Entre em www.ddsinovacao.com.br/ocorrencias." });
  try {
    const linhas = rowsParaLinhas(linhasDeTexto(d.texto));
    const nome = "Salesforce automático " + new Date().toLocaleString("pt-BR");
    const tot = await enviarLinhas(linhas, nome);
    S.ultimoAuto = { em: new Date(), ...tot };
    render(); toast(`Atualizado pelo Salesforce: ${tot.novas} novas, ${tot.atualizadas} atualizadas`, 5000);
    responder({ ok: true, ...tot, linhas: linhas.length });
  } catch (e) { responder({ ok: false, erro: e.message }); }
});
if (location.hash === "#receber" && window.opener) {
  const avisar = () => { try { window.opener.postMessage({ tipo: "ocv-pronto", logado: !!S.token }, "*"); } catch (e) {} };
  setTimeout(avisar, 1500); setTimeout(avisar, 4000);
}

/* ---------------- boot ---------------- */
setupLogin();
if (S.token) iniciar(); else mostrarLogin();
setInterval(() => { if (S.token && !document.getElementById("modalRoot").innerHTML && ["inicio", "prazos"].includes(S.view) && !document.activeElement?.matches("input,select,textarea")) render(); }, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
