/* =====================================================================
   Tarefa Diária — aplicação (HTML/CSS/JS puro, sem build)
   Dados no Supabase via funções RPC td_* protegidas por sessão.
   Todo texto vindo do banco passa por esc() antes de ir para o HTML.
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.TD_CONFIG || {};
  const TZ = 'America/Sao_Paulo';
  const STATUS = ['Abrir', 'Pendente', 'Aguardando', 'Em andamento', 'Concluído'];
  const ABERTOS = STATUS.slice(0, 4);
  const TIPO = { Salesforce: 'OC', TOTVS: 'CI' };
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const ST_COR = { 'Abrir': '#64748b', 'Pendente': '#f5c518', 'Aguardando': '#f0552e', 'Em andamento': '#2563eb', 'Concluído': '#16a34a' };

  // ------------------------------------------------------------------
  // Utilitários
  // ------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const digits = s => String(s ?? '').replace(/\D/g, '');
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
    set(k, v, persist = true) {
      try {
        (persist ? localStorage : sessionStorage).setItem(k, v);
        (persist ? sessionStorage : localStorage).removeItem(k);
      } catch { /* armazenamento indisponível */ }
    },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* */ } },
    persistente(k) { try { return localStorage.getItem(k) !== null; } catch { return false; } }
  };

  const fmtDT = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDTs = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtD = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' });
  const fmtLong = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  const fmtSem = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' });
  const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fDT = v => v ? fmtDT.format(new Date(v)).replace(',', '') : '—';
  const fDTs = v => v ? fmtDTs.format(new Date(v)).replace(',', '') : '—';
  const fD = v => v ? fmtD.format(new Date(v)) : '—';
  const fData = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const hojeISO = () => fmtISO.format(new Date());
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function relTempo(v) {
    const s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    return `há ${plural(Math.floor(s / 86400), 'dia')}`;
  }
  function telNac(s) { let n = digits(s); if (n.length >= 12 && n.startsWith('55')) n = n.slice(2); return n; }
  function fTel(s) {
    const n = telNac(s);
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return s ? String(s) : '';
  }
  function waUrl(s) { const n = telNac(s); return (n.length === 10 || n.length === 11) ? `https://wa.me/55${n}` : ''; }
  function telValido(s) { const n = telNac(s); return n.length === 10 || n.length === 11; }
  function mascaraTel(v) {
    let n = digits(v);
    if (n.length > 11 && n.startsWith('55')) n = n.slice(2);
    n = n.slice(0, 11);
    if (!n) return '';
    if (n.length <= 2) return `(${n}`;
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }
  const iniciais = nome => String(nome || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  // ------------------------------------------------------------------
  // Ícones (traço, 24x24)
  // ------------------------------------------------------------------
  const P = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    lista: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    rel: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    config: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    wa: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    lapis: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    olhoX: '<path d="M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="m2 2 20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    ampulheta: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 5 5 5 5 0 0 0 5-5V2M7 22v-4a5 5 0 0 1 5-5 5 5 0 0 1 5 5v4"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    esq: '<path d="m15 18-6-6 6-6"/>',
    dir: '<path d="m9 18 6-6-6-6"/>',
    baixo: '<path d="m6 9 6 6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    impr: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    filtro: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    enviar: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    caixa: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    lixo: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    restaurar: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
  };
  const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[n] || ''}</svg>`;

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  const filtrosPadrao = () => ({ q: '', status: '', origem: '', consultor: '', atraso: '', ordem: 'prioridade' });
  const S = {
    token: store.get('td_token'),
    user: (() => { try { return JSON.parse(store.get('td_user') || 'null'); } catch { return null; } })(),
    consultores: [],
    listas: {
      abertas: { f: filtrosPadrao(), page: 1, size: 25, data: null },
      concluidas: { f: filtrosPadrao(), page: 1, size: 25, data: null },
      lixeira: { f: filtrosPadrao(), page: 1, size: 25, data: null }
    },
    escopo: null,
    sel: new Set(),
    drafts: new Map(),
    resumo: null,
    det: null,
    cli: { q: '', page: 1, size: 50 },
    cliDet: null,
    relRows: null,
    seq: 0,
    lastLoad: 0
  };

  // ------------------------------------------------------------------
  // API (PostgREST RPC)
  // ------------------------------------------------------------------
  class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

  async function api(fn, args = {}) {
    let res;
    try {
      res = await fetch(`${CFG.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'apikey': CFG.key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(args),
        cache: 'no-store'
      });
    } catch {
      throw new ApiError('Sem conexão com o servidor. Verifique a internet e tente de novo.', 'REDE');
    }
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.message || data.hint)) || `Erro ${res.status}`;
      if (msg === 'SESSAO_INVALIDA') { sair(true); throw new ApiError('Sua sessão expirou. Entre novamente.', 'SESSAO'); }
      if (msg === 'TROCAR_PIN') { abrirTrocarPin(true); throw new ApiError('Crie seu PIN pessoal para continuar.', 'TROCAR_PIN'); }
      throw new ApiError(msg, data && data.code);
    }
    S.lastLoad = Date.now();
    return data;
  }
  const rpc = (fn, args = {}) => api(fn, { p_token: S.token, ...args });

  // ------------------------------------------------------------------
  // Aviso (toast) e modal
  // ------------------------------------------------------------------
  let toastT = null;
  function toast(msg, opts = {}) {
    const t = $('#toast');
    t.className = '';
    t.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button type="button">${esc(opts.action)}</button>` : ''}`;
    if (opts.err) t.classList.add('err');
    if (opts.action) t.querySelector('button').addEventListener('click', () => { t.classList.remove('show'); opts.onAction(); }, { once: true });
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), opts.ms || (opts.action ? 7000 : 3200));
  }
  function erro(e) {
    if (e && (e.code === 'SESSAO' || e.code === 'TROCAR_PIN')) return;
    toast((e && e.message) || String(e), { err: true, ms: 5200 });
  }
  const dlg = () => $('#dlg');
  function modal(html, { wide = false, locked = false, foco = true } = {}) {
    const d = dlg();
    d.classList.toggle('wide', wide);
    d.dataset.locked = locked ? '1' : '';
    $('#dlg-body').innerHTML = html;
    if (!d.open) d.showModal();
    const first = foco && d.querySelector('input:not([type=hidden]):not([readonly]), textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    else setTimeout(() => d.querySelector('.dlg-x')?.focus(), 30);
    return d;
  }
  function fecharModal() { const d = dlg(); d.dataset.locked = ''; if (d.open) d.close(); }
  const xBtn = () => `<button type="button" class="dlg-x" data-act="dlg-fechar" aria-label="Fechar">${ic('x')}</button>`;
  function confirmar({ titulo, texto = '', ok = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
    return new Promise(resolve => {
      modal(`<div class="dlg-h"><div><h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}</div></div>
        <div class="form-actions"><button type="button" class="btn ghost" data-r="0">${esc(cancelar)}</button>
        <button type="button" class="btn ${perigo ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`);
      const d = dlg();
      const onClick = e => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        d.removeEventListener('click', onClick);
        d.close();
        resolve(b.dataset.r === '1');
      };
      d.addEventListener('click', onClick);
      d.addEventListener('close', () => { d.removeEventListener('click', onClick); resolve(false); }, { once: true });
    });
  }

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------
  function viewLogin(msg = '') {
    document.body.classList.remove('nav-open');
    const tel = store.get('td_tel') || '';
    const ghost = [['#f0552e', '#f0552e'], ['#2563eb', '#2563eb'], ['#f5c518', '#f5c518'], ['#16a34a', '#16a34a']]
      .map(([a, b]) => `<div class="ghost-row"><i style="background:${a}"></i><div><b></b><b></b></div><span style="background:rgba(255,255,255,.12)"></span><span style="background:${b};opacity:.85"></span></div>`).join('');
    $('#app').innerHTML = `
    <div class="login">
      <div class="login-wrap">
        <div class="login-card">
          <span class="brand">Tarefa <em>Diária</em></span>
          <p class="sub">Entre com seu celular e PIN para ver suas demandas.</p>
          <form id="login-form" novalidate>
            <div class="login-err" id="login-err" ${msg ? '' : 'hidden'}>${esc(msg)}</div>
            <label class="f"><span>Celular</span>
              <input name="tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="(41) 99999-9999" maxlength="16" data-mask="tel" value="${esc(fTel(tel))}" required></label>
            <label class="f"><span>PIN (4 números)</span>
              <div class="pinbox"><input name="pin" type="password" inputmode="numeric" autocomplete="off" data-lpignore="true" maxlength="4" placeholder="••••" data-mask="pin" required>
              <button type="button" class="eye" data-act="ver-pin" aria-label="Mostrar PIN">${ic('olho')}</button></div></label>
            <label class="check"><input type="checkbox" name="lembrar" checked> Manter conectado neste aparelho</label>
            <button class="btn primary lg" type="submit">Entrar</button>
            <div class="login-help"><button type="button" data-act="esqueci">Esqueceu o PIN?</button></div>
            <div class="login-note" id="esqueci" hidden>Peça ao administrador para redefinir seu PIN. Você entra com um PIN provisório e o sistema pede para criar um novo.</div>
          </form>
        </div>
        <div class="login-side" aria-hidden="true">
          <h2>Suas demandas do dia,<br>numa tela só.</h2>
          <p>Veja o que está aberto e o que atrasou, e escreva a atualização direto na lista. O histórico fica guardado com data e hora.</p>
          <div class="ghost-rows">${ghost}</div>
        </div>
      </div>
    </div>`;
    const f = $('#login-form');
    setTimeout(() => (tel ? f.pin : f.tel).focus(), 50);
  }

  async function entrar(form) {
    const tel = form.tel.value, pin = form.pin.value, lembrar = form.lembrar.checked;
    const err = $('#login-err');
    const show = m => { err.textContent = m; err.hidden = false; };
    if (!telValido(tel)) return show('Informe o celular com DDD, ex.: (41) 99999-9999.');
    if (!/^\d{4}$/.test(pin)) return show('O PIN tem 4 números.');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Entrando…';
    try {
      const r = await api('td_login', { p_telefone: tel, p_pin: pin, p_lembrar: lembrar });
      if (!r || !r.ok) { show((r && r.erro) || 'Não foi possível entrar.'); form.pin.value = ''; form.pin.focus(); return; }
      S.token = r.token; S.user = r.usuario;
      store.set('td_token', r.token, lembrar);
      store.set('td_user', JSON.stringify(r.usuario), lembrar);
      store.set('td_tel', telNac(tel), true);
      if (!location.hash || location.hash === '#/' || location.hash === '#') history.replaceState(null, '', '#/demandas');
      await iniciar();
    } catch (e) {
      show(e.message);
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
  }

  async function sair(expirada = false) {
    const t = S.token;
    S.token = null; S.user = null; S.resumo = null;
    S.drafts.clear(); S.sel.clear();
    store.del('td_token'); store.del('td_user');
    if (t && !expirada) { try { await api('td_logout', { p_token: t }); } catch { /* ignora */ } }
    fecharModal();
    history.replaceState(null, '', location.pathname + location.search);
    viewLogin(expirada ? 'Sua sessão expirou. Entre novamente.' : '');
  }

  function abrirTrocarPin(forcado = false) {
    if ($('#pin-form') && dlg().open) return;
    modal(`<div class="dlg-h"><div><h2>${forcado ? 'Crie seu PIN pessoal' : 'Trocar meu PIN'}</h2>
        <p>${forcado ? 'Você entrou com um PIN provisório. Escolha um PIN de 4 números só seu.' : 'Informe o PIN atual e escolha o novo.'}</p></div>${forcado ? '' : xBtn()}</div>
      <form id="pin-form" class="dlg-grid" novalidate>
        <label class="f"><span>PIN atual${forcado ? ' (provisório)' : ''}</span><input name="atual" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" data-mask="pin" required></label>
        <label class="f"><span>Novo PIN</span><input name="novo" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" data-mask="pin" required></label>
        <label class="f"><span>Repita o novo PIN</span><input name="novo2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" data-mask="pin" required></label>
        <div class="login-err" id="pin-err" hidden></div>
        <div class="form-actions">${forcado ? '<button type="button" class="btn ghost" data-act="sair">Sair</button>' : '<button type="button" class="btn ghost" data-act="dlg-fechar">Cancelar</button>'}
        <button class="btn primary" type="submit">Salvar PIN</button></div>
      </form>`, { locked: forcado });
  }

  async function salvarPin(form) {
    const err = $('#pin-err');
    const show = m => { err.textContent = m; err.hidden = false; };
    const { atual, novo, novo2 } = form;
    if (!/^\d{4}$/.test(atual.value)) return show('Informe o PIN atual (4 números).');
    if (!/^\d{4}$/.test(novo.value)) return show('O novo PIN precisa ter 4 números.');
    if (novo.value !== novo2.value) return show('Os dois campos do novo PIN não conferem.');
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const u = await api('td_trocar_pin', { p_token: S.token, p_pin_atual: atual.value, p_pin_novo: novo.value });
      const forcado = S.user && S.user.trocar_pin;
      S.user = u;
      store.set('td_user', JSON.stringify(u), store.persistente('td_token'));
      fecharModal();
      toast('PIN atualizado.');
      if (forcado) await iniciar();
    } catch (e) {
      show(e.message);
    } finally { btn.disabled = false; }
  }

  // ------------------------------------------------------------------
  // Estrutura (topo + menu lateral)
  // ------------------------------------------------------------------
  function shell() {
    const u = S.user || {};
    $('#app').innerHTML = `
    <header class="top">
      <button class="menu-btn" data-act="menu" aria-label="Abrir menu">${ic('menu')}</button>
      <div class="top-brand"><a href="#/demandas" class="brand">Tarefa <em>Diária</em></a></div>
      <div class="top-mid"><span id="top-data"></span></div>
      <div class="top-right">
        <button class="who" data-act="perfil" aria-haspopup="menu">
          <span class="avatar">${esc(iniciais(u.nome))}</span>
          <span class="who-txt"><b>${esc(u.nome || '')}</b><small>${u.admin ? 'Administrador' : 'Usuário'}</small></span>
          <span class="who-txt">${ic('baixo')}</span>
        </button>
      </div>
    </header>
    <aside class="side" id="side">
      <nav aria-label="Menu principal">
        <a href="#/painel" data-nav="painel">${ic('painel')} Painel</a>
        <a href="#/demandas" data-nav="demandas">${ic('lista')} Demandas <span class="cnt" id="cnt-abertas" hidden></span><span class="cnt red" id="cnt-atr" hidden></span></a>
        <a href="#/demandas?novo=1" data-nav="nova">${ic('mais')} Nova demanda</a>
        <a href="#/clientes" data-nav="clientes">${ic('clientes')} Clientes</a>
        <a href="#/concluidas" data-nav="concluidas">${ic('check')} Concluídas</a>
        <a href="#/relatorios" data-nav="relatorios">${ic('rel')} Relatórios</a>
        <a href="#/config" data-nav="config">${ic('config')} Configurações</a>
        <a href="#/lixeira" data-nav="lixeira" class="nav-lixeira">${ic('lixo')} Lixeira <span class="cnt" id="cnt-lixeira" hidden></span></a>
      </nav>
      <div class="side-foot">Atrasada = aberta há mais de 5 dias corridos (120 h).<br>Horários de Brasília.</div>
    </aside>
    <div class="scrim" hidden data-act="menu-fechar"></div>
    <main class="main"><div class="work" id="view"></div></main>`;
    atualizarDataTopo();
  }
  function atualizarDataTopo() {
    const el = $('#top-data');
    if (el) { const n = new Date(); el.textContent = `${cap(fmtSem.format(n))}, ${fmtLong.format(n)}`; }
  }
  function setNav(k) {
    $$('.side nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === k));
    document.body.classList.remove('nav-open');
    const sc = $('.scrim'); if (sc) sc.hidden = true;
  }
  function atualizarContadores(k) {
    const c = $('#cnt-abertas');
    if (!c || !k) return;
    c.hidden = false; c.textContent = String(k.abertas); c.title = `${k.abertas} abertas`;
    const a = $('#cnt-atr');
    if (a) { a.hidden = !k.atrasadas; a.textContent = String(k.atrasadas); a.title = `${k.atrasadas} atrasadas (mais de 5 dias)`; }
    const l = $('#cnt-lixeira');
    if (l) { l.hidden = !k.lixeira; l.textContent = String(k.lixeira || 0); }
  }
  function menuPerfil(btn) {
    const ex = $('.menu-pop');
    if (ex) { ex.remove(); return; }
    const m = document.createElement('div');
    m.className = 'menu-pop'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div style="padding:8px 12px 6px"><b>${esc(S.user.nome)}</b><div class="muted" style="font-size:12px">${esc(fTel(S.user.telefone))}</div></div>
      <button type="button" data-act="trocar-pin">${ic('chave')} Trocar meu PIN</button>
      <a href="#/config">${ic('config')} Configurações</a>
      <button type="button" data-act="sair">${ic('sair')} Sair</button>`;
    document.body.appendChild(m);
  }
  const fecharMenuPerfil = () => { const m = $('.menu-pop'); if (m) m.remove(); };
  const view = () => $('#view');
  const head = (t, sub = '', right = '') => `<div class="head"><div><h1>${esc(t)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${right ? `<div class="head-actions">${right}</div>` : ''}</div>`;
  const carregando = (txt = 'Carregando…') => `<div class="loading"><span class="spin"></span> ${esc(txt)}</div>`;

  // ------------------------------------------------------------------
  // Rotas
  // ------------------------------------------------------------------
  function parseHash() {
    const h = location.hash || '#/demandas';
    const i = h.indexOf('?');
    return { path: i >= 0 ? h.slice(0, i) : h, q: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
  }
  async function route() {
    if (!S.token) return viewLogin();
    if (!$('.top')) shell();
    fecharMenuPerfil();
    fecharSheet();
    const { path, q } = parseHash();
    let m;
    try {
      if (path === '#/painel') { setNav('painel'); window.scrollTo(0, 0); return await viewPainel(); }
      if (path === '#/demandas') { setNav(q.get('novo') ? 'nova' : 'demandas'); return await viewLista('abertas', q); }
      if (path === '#/concluidas') { setNav('concluidas'); return await viewLista('concluidas', q); }
      if (path === '#/lixeira') { setNav('lixeira'); return await viewLista('lixeira', q); }
      if ((m = path.match(/^#\/demanda\/([0-9a-f-]{36})$/i))) { setNav(''); window.scrollTo(0, 0); return await viewDemanda(m[1], q); }
      if (path === '#/clientes') { setNav('clientes'); window.scrollTo(0, 0); return await viewClientes(); }
      if ((m = path.match(/^#\/cliente\/([0-9a-f-]{36})$/i))) { setNav('clientes'); window.scrollTo(0, 0); return await viewCliente(m[1], q); }
      if (path === '#/relatorios') { setNav('relatorios'); window.scrollTo(0, 0); return await viewRelatorios(); }
      if (path === '#/config') { setNav('config'); window.scrollTo(0, 0); return await viewConfig(); }
      location.replace('#/demandas');
    } catch (e) {
      if (e.code === 'SESSAO' || e.code === 'TROCAR_PIN') return;
      const v = view();
      if (v) v.innerHTML = `<div class="card empty">${ic('alerta')}<b>Não foi possível carregar esta tela</b>${esc(e.message)}<div style="margin-top:14px"><button class="btn ghost" data-act="recarregar">Tentar de novo</button></div></div>`;
    }
  }

  async function carregarConsultores() {
    try { S.consultores = await rpc('td_consultores_listar'); } catch (e) { if (e.code !== 'TROCAR_PIN') S.consultores = []; }
  }
  function opcoesConsultor(sel = '', todos = false) {
    const nomes = S.consultores.filter(c => c.ativo || c.nome === sel).map(c => c.nome);
    if (sel && !nomes.includes(sel)) nomes.unshift(sel);
    if (S.user && !nomes.includes(S.user.nome)) nomes.push(S.user.nome);
    return (todos ? '<option value="">Todos</option>' : '') + nomes.map(n => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  // ------------------------------------------------------------------
  // Painel
  // ------------------------------------------------------------------
  function kpi(href, cor, icone, n, rotulo) {
    return `<a class="card kpi ${cor}" href="${href}"><span class="ico">${ic(icone)}</span><span><strong>${n}</strong><small>${esc(rotulo)}</small></span></a>`;
  }
  async function viewPainel() {
    const v = view();
    const agora = new Date();
    const dataHtml = `<div class="head-date">${esc(fmtLong.format(agora))}<small>${esc(cap(fmtSem.format(agora)))} • ${esc(fmtHora.format(agora))}</small></div>`;
    v.innerHTML = head('Painel de Controle', 'Visão geral das suas demandas', dataHtml) + carregando();
    const r = await rpc('td_resumo');
    S.resumo = r; atualizarContadores(r.kpis);
    const k = r.kpis;
    v.innerHTML = head('Painel de Controle', 'Visão geral das suas demandas', dataHtml) + `
      <section class="kpis">
        ${kpi('#/demandas?f=todas', 'c-blue', 'doc', k.abertas, 'Abertas')}
        ${kpi('#/concluidas', 'c-green', 'check', k.concluidas, 'Concluídas')}
        ${kpi('#/demandas?atraso=atrasadas', 'c-red', 'alerta', k.atrasadas, 'Atrasadas (> 5 dias)')}
        ${kpi('#/demandas?origem=Salesforce', 'c-purple', 'doc', k.oc_abertas, 'OC abertas')}
        ${kpi('#/demandas?origem=TOTVS', 'c-blue', 'rel', k.ci_abertas, 'CI abertas')}
        ${kpi('#/demandas?status=Aguardando', 'c-amber', 'ampulheta', k.aguardando, 'Aguardando')}
      </section>
      <section class="grid2">
        <div class="card"><div class="card-h"><h3>Abertas x Concluídas (últimos 6 meses)</h3></div>
          <div class="card-b chart"><div class="legend"><span><i style="background:#2f6fe4"></i>Abertas</span><span><i style="background:#3fb27f"></i>Concluídas</span></div>${graficoBarras(r.serie || [])}</div></div>
        <div class="card"><div class="card-h"><h3>Status das abertas</h3></div><div class="card-b">${graficoRosca(r.por_status || {}, k.abertas)}</div></div>
      </section>
      <section class="card">
        <div class="card-h"><h3>Prioridades de hoje</h3><a class="btn ghost sm" href="#/demandas">Ver todas</a></div>
        <div class="card-b" style="padding:12px 0 0">${tabelaPrioridades(r.prioridades || [])}</div>
      </section>`;
  }
  function graficoBarras(serie) {
    const W = 600, H = 240, ml = 34, mr = 10, mt = 16, mb = 28;
    const vals = serie.flatMap(s => [s.abertas, s.concluidas]);
    let max = Math.max(4, ...vals);
    const passo = Math.ceil(max / 4);
    max = passo * 4;
    const ih = H - mt - mb, iw = W - ml - mr, gw = iw / Math.max(1, serie.length);
    const bw = Math.min(22, gw * 0.28);
    const y = v => mt + ih - (v / max) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de demandas abertas e concluídas por mês">`;
    for (let i = 0; i <= 4; i++) {
      const v = passo * i, yy = y(v);
      s += `<line x1="${ml}" x2="${W - mr}" y1="${yy}" y2="${yy}" stroke="#e8edf4" stroke-width="1"/><text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${v}</text>`;
    }
    serie.forEach((m, i) => {
      const cx = ml + gw * i + gw / 2;
      const mes = MESES[Number(String(m.mes).slice(5, 7)) - 1] || m.mes;
      [[m.abertas, '#2f6fe4', -1, 'Abertas'], [m.concluidas, '#3fb27f', 1, 'Concluídas']].forEach(([v, cor, lado, nome]) => {
        const x = lado < 0 ? cx - bw - 2 : cx + 2;
        const yy = y(v), h = Math.max(v > 0 ? 2 : 0, mt + ih - yy);
        s += `<rect x="${x}" y="${mt + ih - h}" width="${bw}" height="${h}" rx="3" fill="${cor}"><title>${nome} em ${mes}: ${v}</title></rect>`;
        if (v > 0) s += `<text x="${x + bw / 2}" y="${mt + ih - h - 5}" text-anchor="middle" style="font-weight:600;fill:#4a5b72">${v}</text>`;
      });
      s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${mes}</text>`;
    });
    return s + '</svg>';
  }
  function graficoRosca(por, total) {
    const ordem = ['Aguardando', 'Em andamento', 'Pendente', 'Abrir'];
    const R = 62, C = 2 * Math.PI * R;
    let off = 0, arcs = '';
    if (total > 0) {
      ordem.forEach(st => {
        const n = por[st] || 0; if (!n) return;
        const len = (n / total) * C;
        arcs += `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${ST_COR[st]}" stroke-width="24" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 85 85)"><title>${st}: ${n}</title></circle>`;
        off += len;
      });
    }
    const svg = `<svg viewBox="0 0 170 170" role="img" aria-label="Distribuição das demandas abertas por status">
      <circle cx="85" cy="85" r="${R}" fill="none" stroke="#edf1f6" stroke-width="24"/>${arcs}
      <text x="85" y="84" text-anchor="middle" style="font-size:30px;font-weight:800;fill:#0f1f33">${total}</text>
      <text x="85" y="104" text-anchor="middle" style="font-size:12px;fill:#6b7b90">Abertas</text></svg>`;
    const leg = ordem.map(st => `<div><i style="background:${ST_COR[st]}"></i><b>${por[st] || 0}</b> ${st}</div>`).join('');
    return `<div class="donut-wrap">${svg}<div class="donut-leg">${leg}</div></div>`;
  }
  function tabelaPrioridades(rows) {
    if (!rows.length) return `<div class="empty">${ic('check')}<b>Nenhuma demanda em aberto</b>Cadastre a primeira em Demandas → Nova demanda.</div>`;
    return `<div class="tblwrap"><table class="tbl responsive"><thead><tr><th>Cliente (Código)</th><th>Tipo / Registro</th><th>Situação atual</th><th>Atualização</th><th class="num">Dias</th><th>Status</th></tr></thead><tbody>
      ${rows.map(d => `<tr class="click${d.atrasada ? ' late' : ''}" data-go="#/demanda/${esc(d.id)}">
        <td class="full"><b>${esc(d.cliente)}</b> <span class="muted">(${esc(d.codigo)})</span></td>
        <td>${regsHTML(d)}</td>
        <td class="full">${esc(trunc(d.descricao_atual, 110))}</td>
        <td class="nowrap" data-l="Atualização">${esc(fDTs(d.atualizada_em))}</td>
        <td class="num" data-l="Dias"><b${d.atrasada ? ' style="color:var(--red)"' : ''}>${d.dias}</b></td>
        <td><span class="badge" data-st="${esc(d.status)}">${esc(d.status)}</span></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  // Registros da demanda: OC (Salesforce) e/ou CI (TOTVS)
  function regsHTML(d) {
    const par = (t, num) => `<span class="regpar"><span class="tipo tipo-${t}">${t}</span>${num ? `<span class="reg">${esc(num)}</span>` : '<span class="reg vazio">s/ nº</span>'}</span>`;
    return (d.tem_oc ? par('OC', d.numero_oc) : '') + (d.tem_ci ? par('CI', d.numero_ci) : '');
  }
  const regsTexto = d => [d.tem_oc ? `OC ${d.numero_oc || 's/ nº'}` : '', d.tem_ci ? `CI ${d.numero_ci || 's/ nº'}` : ''].filter(Boolean).join(' · ');
  const ESCOPOS = {
    abertas: { hash: '#/demandas', titulo: 'Demandas', sub: 'Todas as demandas em aberto. Escreva a atualização direto na linha.' },
    concluidas: { hash: '#/concluidas', titulo: 'Concluídas', sub: 'Demandas encerradas. Para reabrir, troque o status.' },
    lixeira: { hash: '#/lixeira', titulo: 'Lixeira', sub: 'Demandas excluídas. Restaure se precisar: o histórico volta junto.' }
  };
  // Converte data/hora local de Brasília (input datetime-local) em ISO e vice-versa
  const paraInputLocal = iso => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  const deInputLocal = v => v ? `${v}:00-03:00` : '';

  // ------------------------------------------------------------------
  // Lista de demandas (planilha viva)
  // ------------------------------------------------------------------
  async function viewLista(escopo, q) {
    const L = S.listas[escopo];
    if (S.escopo !== escopo) { S.sel.clear(); }
    S.escopo = escopo;
    let abrirNovo = null;
    if (q && [...q.keys()].length) {
      const chaves = ['status', 'origem', 'atraso', 'consultor', 'q'];
      if (chaves.some(k => q.has(k)) || q.get('f') === 'todas') { L.f = filtrosPadrao(); L.page = 1; }
      chaves.forEach(k => { if (q.has(k)) L.f[k] = q.get(k); });
      if (q.get('novo')) abrirNovo = q.get('novo');
      history.replaceState(null, '', ESCOPOS[escopo].hash);
    }
    const ab = escopo === 'abertas';
    const v = view();
    v.innerHTML = `
      ${head(ESCOPOS[escopo].titulo, ESCOPOS[escopo].sub,
        ab ? `<button class="btn primary" type="button" data-act="qa-abrir">${ic('mais')} Nova demanda</button>`
           : escopo === 'concluidas' ? `<a class="btn ghost" href="#/relatorios">${ic('impr')} Relatórios</a>` : `<a class="btn ghost" href="#/demandas">${ic('lista')} Voltar às demandas</a>`)}
      ${ab ? '<div class="chips" id="chips"></div>' : ''}
      ${ab ? qaHTML() : ''}
      ${ferramentasHTML(escopo)}
      <div id="bulk" class="bulk" hidden></div>
      <div class="resinfo" id="resinfo"></div>
      <section class="card dl" id="dl">${carregando()}</section>`;
    if (ab) { renderChips(); if (abrirNovo) abrirQA(abrirNovo === '1' ? '' : abrirNovo); }
    await carregarLista(escopo);
  }

  async function carregarLista(escopo, { manterScroll = true } = {}) {
    const L = S.listas[escopo];
    const seq = ++S.seq;
    const y = window.scrollY;
    try {
      const [res, resumo] = await Promise.all([
        rpc('td_listar', { p_filtros: { ...L.f, escopo }, p_limite: L.size, p_offset: (L.page - 1) * L.size }),
        escopo === 'abertas' ? rpc('td_resumo') : Promise.resolve(null)
      ]);
      if (seq !== S.seq || S.escopo !== escopo || !$('#dl')) return;
      if (res.total > 0 && !res.linhas.length && L.page > 1) { L.page = Math.max(1, Math.ceil(res.total / L.size)); return carregarLista(escopo); }
      L.data = res;
      if (resumo) { S.resumo = resumo; atualizarContadores(resumo.kpis); renderChips(); }
      renderLista(escopo);
      if (manterScroll) window.scrollTo(0, y);
    } catch (e) {
      if (seq !== S.seq) return;
      const dl = $('#dl');
      if (dl && e.code !== 'SESSAO') dl.innerHTML = `<div class="empty">${ic('alerta')}<b>Não foi possível carregar</b>${esc(e.message)}</div>`;
      erro(e);
    }
  }

  function renderChips() {
    const c = $('#chips');
    if (!c || !S.resumo) return;
    const k = S.resumo.kpis, f = S.listas.abertas.f;
    const chip = (cls, filtro, n, rot, on) => `<button type="button" class="chip ${cls}${on ? ' on' : ''}" data-act="chip" data-filtro="${filtro}"><b>${n}</b>${esc(rot)}</button>`;
    c.innerHTML = [
      chip('', '', k.abertas, 'abertas', !f.atraso && !f.status && !f.origem),
      chip('red', 'atraso:atrasadas', k.atrasadas, 'atrasadas (+5 dias)', f.atraso === 'atrasadas'),
      chip('amber', 'status:Aguardando', k.aguardando, 'aguardando', f.status === 'Aguardando'),
      chip('', 'origem:Salesforce', k.oc_abertas, 'OC · Salesforce', f.origem === 'Salesforce'),
      chip('purple', 'origem:TOTVS', k.ci_abertas, 'CI · TOTVS', f.origem === 'TOTVS'),
      k.oc_ci_abertas ? chip('purple', 'origem:ambos', k.oc_ci_abertas, 'OC + CI', f.origem === 'ambos') : '',
      k.sem_atualizacao ? chip('amber', 'atraso:sem_atualizacao', k.sem_atualizacao, 'sem atualização 5+ dias', f.atraso === 'sem_atualizacao') : ''
    ].join('');
  }

  function ferramentasHTML(escopo) {
    const f = S.listas[escopo].f;
    const ab = escopo === 'abertas';
    const nAtivos = ['status', 'origem', 'consultor', 'atraso'].filter(k => f[k]).length;
    const opt = (val, txt, cur) => `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(txt)}</option>`;
    return `<section class="card tools">
      <form class="search" id="busca-form" role="search" autocomplete="off">
        <div class="box">${ic('busca')}<input type="search" id="busca" placeholder="Buscar cliente, código, contato, registro ou descrição…" value="${esc(f.q)}" aria-label="Buscar demandas" enterkeyhint="search">
          <button type="button" class="clear" data-act="busca-limpar" aria-label="Limpar busca" ${f.q ? '' : 'hidden'}>${ic('x')}</button></div>
        <button class="btn primary only-desk" type="submit">Buscar</button>
        <button class="btn ghost only-mobile" type="button" data-act="filtros-mob" id="btn-filtros">${ic('filtro')} Filtros${nAtivos ? ` (${nAtivos})` : ''}</button>
      </form>
      <div class="filters">
        ${ab ? `<label class="f"><span>Status</span><select data-filtro="status">${opt('', 'Todos', f.status)}${ABERTOS.map(s => opt(s, s, f.status)).join('')}</select></label>` : ''}
        <label class="f"><span>Origem / Tipo</span><select data-filtro="origem">${opcoesOrigem(f.origem)}</select></label>
        <label class="f f-consultor"><span>Consultor</span><select data-filtro="consultor">${opcoesConsultor(f.consultor, true)}</select></label>
        ${ab ? `<label class="f"><span>Mais de 5 dias</span><select data-filtro="atraso">${opt('', 'Todas', f.atraso)}${opt('atrasadas', 'Só atrasadas (+5 dias)', f.atraso)}${opt('no_prazo', 'Só no prazo', f.atraso)}${opt('sem_atualizacao', 'Sem atualização há 5+ dias', f.atraso)}</select></label>` : ''}
        ${escopo !== 'lixeira' ? `<label class="f f-ordem"><span>Ordenar</span><select data-filtro="ordem">${opt('prioridade', ab ? 'Prioridade' : 'Concluídas recentes', f.ordem)}${opt('recentes', 'Mais recentes', f.ordem)}${opt('atualizacao', 'Última atualização', f.ordem)}</select></label>` : ''}
        <button class="btn ghost" type="button" data-act="limpar-filtros">Limpar</button>
      </div>
    </section>`;
  }
  function opcoesOrigem(cur) {
    const opt = (val, txt) => `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(txt)}</option>`;
    return opt('', 'Todos') + opt('Salesforce', 'Com OC (Salesforce)') + opt('TOTVS', 'Com CI (TOTVS)') + opt('ambos', 'OC e CI juntos');
  }
  function sincronizarFiltros(escopo) {
    const f = S.listas[escopo].f;
    $$('[data-filtro]').forEach(s => { if (s.tagName === 'SELECT') s.value = f[s.dataset.filtro] || (s.dataset.filtro === 'ordem' ? 'prioridade' : ''); });
    const b = $('#busca'); if (b && b.value !== f.q) b.value = f.q;
    const cl = $('[data-act=busca-limpar]'); if (cl) cl.hidden = !f.q;
    const n = ['status', 'origem', 'consultor', 'atraso'].filter(k => f[k]).length;
    const bf = $('#btn-filtros'); if (bf) bf.innerHTML = `${ic('filtro')} Filtros${n ? ` (${n})` : ''}`;
    renderChips();
  }
  function recarregarComFiltros(escopo) {
    S.listas[escopo].page = 1;
    sincronizarFiltros(escopo);
    const dl = $('#dl'); if (dl) dl.innerHTML = carregando();
    carregarLista(escopo, { manterScroll: false });
  }
  function aplicarFiltro(escopo, chave, valor) {
    S.listas[escopo].f[chave] = valor;
    recarregarComFiltros(escopo);
  }

  function cabecalhoLista(escopo) {
    const L = S.listas[escopo];
    const ids = (L.data?.linhas || []).map(d => d.id);
    const todos = ids.length && ids.every(id => S.sel.has(id));
    return `<div class="dm-head" role="row">
      <div><input type="checkbox" data-act="sel-todos" ${todos ? 'checked' : ''} aria-label="Selecionar todas desta página"></div>
      <div>Cliente</div><div>Tipo / Registro</div><div>Demanda · antes → agora</div>
      <div>${escopo === 'abertas' ? 'Tempo' : escopo === 'lixeira' ? 'Excluída' : 'Duração'}</div><div>Status</div><div style="text-align:right">Ações</div></div>`;
  }

  function linhaHTML(d) {
    const conc = d.status === 'Concluído';
    const lixo = !!d.excluida_em;
    const tel = d.telefone ? fTel(d.telefone) : '';
    const wa = waUrl(d.telefone);
    const draft = S.drafts.get(d.id) || '';
    const venc = d.prazo_proxima_acao && d.prazo_proxima_acao < hojeISO() && !conc;
    const id = esc(d.id);
    if (lixo) {
      return `<article class="dm lixo" data-id="${id}">
        <div class="dm-sel"><input type="checkbox" data-act="sel" data-id="${id}" ${S.sel.has(d.id) ? 'checked' : ''} aria-label="Selecionar ${esc(d.cliente)}"></div>
        <div class="dm-cli"><div class="dm-cli-top"><span class="dot" data-st="${esc(d.status)}"></span><span class="dm-nome">${esc(d.cliente)}</span></div><div class="dm-sub">COD <b>${esc(d.codigo)}</b></div></div>
        <div class="dm-reg">${regsHTML(d)}<div class="dm-sub">${esc(d.origem)} · ${esc(d.consultor)}</div></div>
        <div class="dm-desc">${d.descricao_anterior ? `<p class="ant"><span class="lbl">Antes</span>${esc(d.descricao_anterior)}</p>` : ''}<p class="atu"><span class="lbl">Agora</span>${esc(d.descricao_atual)}</p></div>
        <div class="dm-tempo"><span class="dias">${esc(fD(d.excluida_em))}</span><span class="dm-sub">por ${esc(d.excluida_por || '—')}</span></div>
        <div class="dm-st"><span class="badge" data-st="${esc(d.status)}">${esc(d.status)}</span></div>
        <div class="dm-acts"><button type="button" class="btn ghost sm" data-act="restaurar" data-id="${id}">${ic('restaurar')} Restaurar</button></div>
        <div class="dm-hist" hidden></div>
      </article>`;
    }
    return `<article class="dm${d.atrasada ? ' late' : ''}" data-id="${id}">
      <div class="dm-sel"><input type="checkbox" data-act="sel" data-id="${id}" ${S.sel.has(d.id) ? 'checked' : ''} aria-label="Selecionar ${esc(d.cliente)}"></div>
      <div class="dm-cli">
        <div class="dm-cli-top"><span class="dot" data-st="${esc(d.status)}" title="${esc(d.status)}"></span><a class="dm-nome" href="#/cliente/${esc(d.cliente_id)}">${esc(d.cliente)}</a></div>
        <div class="dm-sub">COD <b>${esc(d.codigo)}</b></div>
        ${d.contato || tel ? `<div class="dm-sub">${esc(d.contato || '')}${d.contato && tel ? ' · ' : ''}${tel ? `<a href="tel:+55${esc(telNac(d.telefone))}">${esc(tel)}</a>` : ''}</div>` : ''}
      </div>
      <div class="dm-reg">${regsHTML(d)}
        <div class="dm-sub">${esc(d.origem)} · ${esc(d.consultor)}</div></div>
      <div class="dm-desc">
        ${d.descricao_anterior ? `<p class="ant" title="${esc(d.descricao_anterior)}"><span class="lbl">Antes</span>${esc(d.descricao_anterior)}</p>` : ''}
        <p class="atu"><span class="lbl">Agora</span>${esc(d.descricao_atual)}</p>
        ${d.proxima_acao ? `<p class="prox${venc ? ' vencida' : ''}">Próxima: ${esc(d.proxima_acao)}${d.prazo_proxima_acao ? ` · até ${esc(fData(d.prazo_proxima_acao))}` : ''}</p>` : ''}
        <form class="dm-write" data-id="${id}" autocomplete="off">
          <textarea name="t" rows="1" maxlength="12000" enterkeyhint="send" placeholder="${conc ? 'Adicionar observação… (Enter salva)' : 'Escrever atualização… (Enter salva)'}" aria-label="Nova atualização para ${esc(d.cliente)}">${esc(draft)}</textarea>
          <button class="send" type="submit" title="Salvar atualização" aria-label="Salvar atualização" ${draft.trim() ? '' : 'disabled'}>${ic('enviar')}</button>
        </form>
        <div class="dm-links"><button type="button" data-act="hist" data-id="${id}" aria-expanded="false">${ic('hist')} Histórico (${d.n_historico})</button><a href="#/demanda/${id}">${ic('olho')} Abrir página</a></div>
      </div>
      <div class="dm-tempo">
        ${conc
          ? `<span class="dias">${plural(d.dias, 'dia')}</span><span class="dm-sub">Concluída ${esc(fDTs(d.concluida_em))}</span>`
          : `<span class="dias">${plural(d.dias, 'dia')}</span><span class="dm-sub dm-aberta">Aberta ${esc(fD(d.aberta_em))}</span><span class="dm-sub" title="Última atualização: ${esc(fDT(d.atualizada_em))}">Atualiz. ${esc(fDTs(d.atualizada_em))}</span>${d.sem_atualizacao ? `<span class="idle">${ic('relogio')} parada 5+ dias</span>` : ''}`}
      </div>
      <div class="dm-st"><select class="st" data-st="${esc(d.status)}" data-act="status" data-id="${id}" aria-label="Status de ${esc(d.cliente)}">${STATUS.map(s => `<option${s === d.status ? ' selected' : ''}>${s}</option>`).join('')}</select>${d.atrasada ? '<span class="badge late">Atrasada</span>' : ''}</div>
      <div class="dm-acts">
        ${wa ? `<a class="ib wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" title="WhatsApp ${esc(d.contato || d.cliente)}" aria-label="Abrir WhatsApp">${ic('wa')}</a>` : `<span class="ib wa disabled" title="Sem telefone cadastrado">${ic('wa')}</span>`}
        <button class="ib" type="button" data-act="editar" data-id="${id}" title="Editar a demanda inteira" aria-label="Editar demanda">${ic('lapis')}</button>
        <button class="ib del" type="button" data-act="excluir" data-id="${id}" title="Excluir demanda (vai para a lixeira)" aria-label="Excluir demanda">${ic('lixo')}</button>
      </div>
      <div class="dm-hist" hidden></div>
    </article>`;
  }

  function renderLista(escopo) {
    const L = S.listas[escopo];
    const dl = $('#dl'); if (!dl || !L.data) return;
    const { total, linhas } = L.data;
    const f = L.f;
    const comFiltro = ['q', 'status', 'origem', 'consultor', 'atraso'].some(k => f[k]);
    const ab = escopo === 'abertas';
    const rotulo = { abertas: ['demanda em aberto', 'demandas em aberto'], concluidas: ['demanda concluída', 'demandas concluídas'], lixeira: ['demanda na lixeira', 'demandas na lixeira'] }[escopo];
    $('#resinfo').innerHTML = `<span><b>${total}</b> ${total === 1 ? rotulo[0] : rotulo[1]}${comFiltro ? ' com os filtros atuais' : ''}</span>${ab ? '<span class="legend-late"><i></i> Vermelho = aberta há mais de 5 dias (120 h)</span>' : ''}`;
    if (!linhas.length) {
      dl.innerHTML = comFiltro
        ? `<div class="empty">${ic('busca')}<b>Nada encontrado</b>Nenhuma demanda bate com a busca ou os filtros. <div style="margin-top:12px"><button class="btn ghost sm" data-act="limpar-filtros">Limpar filtros</button></div></div>`
        : ab ? `<div class="empty">${ic('inbox')}<b>Nenhuma demanda em aberto</b>Clique em “Nova demanda” para cadastrar a primeira.<div style="margin-top:12px"><button class="btn primary sm" data-act="qa-abrir">${ic('mais')} Nova demanda</button></div></div>`
        : escopo === 'lixeira' ? `<div class="empty">${ic('lixo')}<b>A lixeira está vazia</b>Demandas excluídas aparecem aqui e podem ser restauradas.</div>`
             : `<div class="empty">${ic('check')}<b>Nenhuma demanda concluída ainda</b>Quando você marcar uma demanda como Concluído ela aparece aqui.</div>`;
      atualizarBulk();
      return;
    }
    dl.innerHTML = cabecalhoLista(escopo) + linhas.map(linhaHTML).join('') + paginacaoHTML(total, L);
    $$('.dm-write textarea', dl).forEach(ajustarAltura);
    atualizarBulk();
  }

  function paginacaoHTML(total, L) {
    const pages = Math.max(1, Math.ceil(total / L.size));
    if (pages === 1 && total <= 25) return '';
    const p = L.page;
    const nums = [];
    for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - p) <= 1) nums.push(i);
    let html = '', last = 0;
    nums.forEach(i => { if (i - last > 1) html += '<span class="muted">…</span>'; html += `<button type="button" data-act="pag" data-p="${i}" class="${i === p ? 'on' : ''}">${i}</button>`; last = i; });
    const ini = (p - 1) * L.size + 1, fim = Math.min(total, p * L.size);
    return `<div class="pager"><span class="muted">${ini}–${fim} de ${total}</span>
      <div class="pg"><button type="button" data-act="pag" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Página anterior">${ic('esq')}</button>${html}<button type="button" data-act="pag" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''} aria-label="Próxima página">${ic('dir')}</button></div>
      <label class="pg-size muted">Por página <select data-act="pag-size">${[25, 50, 100].map(n => `<option${n === L.size ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
  }

  function ajustarAltura(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(220, Math.max(38, ta.scrollHeight + 2)) + 'px';
  }
  const linhaEl = id => $(`.dm[data-id="${CSS.escape(id)}"]`);

  function substituirLinha(d, flash = false) {
    const L = S.listas[S.escopo];
    if (L && L.data) { const i = L.data.linhas.findIndex(x => x.id === d.id); if (i >= 0) L.data.linhas[i] = d; }
    const el = linhaEl(d.id); if (!el) return;
    const histAberto = !el.querySelector('.dm-hist').hidden;
    el.outerHTML = linhaHTML(d);
    const n = linhaEl(d.id);
    $$('textarea', n).forEach(ajustarAltura);
    if (flash) n.classList.add('flash');
    if (histAberto) alternarHistorico(d.id, true);
  }

  async function salvarLinha(form) {
    const id = form.dataset.id, ta = form.t, btn = form.querySelector('.send');
    const txt = ta.value.trim();
    if (!txt) { ta.focus(); return; }
    form.classList.add('busy'); ta.readOnly = true; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await rpc('td_registrar', { p_id: id, p_texto: txt, p_status: null });
      if (!r.ok) throw new Error(r.erro);
      S.drafts.delete(id);
      substituirLinha(r.demanda, true);
      toast('Atualização salva. A anterior foi para “Antes”.');
    } catch (e) {
      erro(e);
      if (form.isConnected) { form.classList.remove('busy'); ta.readOnly = false; btn.disabled = false; btn.innerHTML = ic('enviar'); }
    }
  }

  async function mudarStatus(sel) {
    const id = sel.dataset.id, novo = sel.value, escopo = S.escopo;
    const L = S.listas[escopo];
    const atual = L && L.data && L.data.linhas.find(x => x.id === id);
    const ant = atual ? atual.status : sel.querySelector('option[selected]')?.value;
    const ta = linhaEl(id)?.querySelector('textarea');
    const txt = ta ? ta.value.trim() : '';
    sel.disabled = true; sel.dataset.st = novo;
    try {
      const r = await rpc('td_registrar', { p_id: id, p_texto: txt || null, p_status: novo });
      if (!r.ok) throw new Error(r.erro);
      S.drafts.delete(id);
      const sai = (escopo === 'abertas' && novo === 'Concluído') || (escopo === 'concluidas' && novo !== 'Concluído');
      if (sai) {
        const el = linhaEl(id);
        if (el) { el.classList.add('saindo'); await sleep(430); el.remove(); }
        S.sel.delete(id);
        L.data.linhas = L.data.linhas.filter(x => x.id !== id); L.data.total -= 1;
        if (!L.data.linhas.length) carregarLista(escopo); else { atualizarResumoSilencioso(); atualizarBulk(); const ri = $('#resinfo b'); if (ri) ri.textContent = L.data.total; }
        toast(novo === 'Concluído' ? 'Concluída e movida para “Concluídas”.' : `Reaberta como “${novo}”.`, { action: 'Desfazer', onAction: () => desfazerStatus(id, ant) });
      } else {
        substituirLinha(r.demanda, true);
        if (escopo === 'abertas') atualizarResumoSilencioso();
        toast(txt ? `Atualização salva e status “${novo}”.` : `Status alterado para “${novo}”.`);
      }
    } catch (e) {
      if (sel.isConnected) { sel.value = ant; sel.dataset.st = ant; }
      erro(e);
    } finally { if (sel.isConnected) sel.disabled = false; }
  }
  async function desfazerStatus(id, ant) {
    try {
      await rpc('td_registrar', { p_id: id, p_texto: null, p_status: ant });
      toast('Desfeito. O histórico registra a ida e a volta.');
      if (S.escopo) carregarLista(S.escopo);
    } catch (e) { erro(e); }
  }
  async function atualizarResumoSilencioso() {
    try { const r = await rpc('td_resumo'); S.resumo = r; atualizarContadores(r.kpis); renderChips(); } catch { /* silencioso */ }
  }

  async function alternarHistorico(id, forcarAberto = false, dados = null) {
    const el = linhaEl(id); if (!el) return;
    const box = el.querySelector('.dm-hist'), btn = el.querySelector('[data-act=hist]');
    if (!box.hidden && !forcarAberto) { box.hidden = true; if (btn) btn.setAttribute('aria-expanded', 'false'); return; }
    box.hidden = false; if (btn) btn.setAttribute('aria-expanded', 'true');
    if (!dados) box.innerHTML = carregando('Carregando histórico…');
    try {
      const r = dados || await rpc('td_demanda', { p_id: id });
      box.innerHTML = linhaDoTempo(r.historico, r.n_excluidos, !r.demanda.excluida_em) + `<p style="margin:0 0 10px"><a href="#/demanda/${esc(id)}">Abrir a página completa desta demanda →</a></p>`;
    } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }

  function linhaDoTempo(h, nExcluidos = 0, editavel = true) {
    if (!h || !h.length) return '<p class="muted">Sem registros.</p>';
    const k = { 'abertura': 'abertura', 'atualização': 'atualizacao', 'mudança de status': 'status', 'conclusão': 'conclusao', 'reabertura': 'reabertura', 'edição': 'edicao' };
    return `<ol class="tl">${h.map(e => `<li class="k-${k[e.acao] || ''}" data-hid="${esc(e.id)}"><span class="pt"></span>
      <div class="meta"><b>${esc(fDT(e.registrado_em))}</b><span>${esc(e.autor)}</span><span class="kind">${esc(e.acao)}</span>
        ${e.editado_em ? `<span class="editado" title="${esc(`Corrigido em ${fDT(e.editado_em)} por ${e.editado_por || '—'}. Texto original: ${e.descricao_original || ''}`)}">editado</span>` : ''}
        ${editavel && (e.editavel || e.excluivel) ? `<span class="tl-acts">${e.editavel ? `<button type="button" data-act="hist-editar" data-hid="${esc(e.id)}" title="Corrigir o texto">${ic('lapis')} Corrigir</button>` : ''}${e.excluivel ? `<button type="button" data-act="hist-excluir" data-hid="${esc(e.id)}" title="Excluir esta atualização">${ic('lixo')} Excluir</button>` : ''}</span>` : ''}</div>
      <div class="txt">${esc(e.descricao)}</div></li>`).join('')}</ol>
      ${nExcluidos ? `<p class="muted" style="font-size:12px;margin:-6px 0 10px">${plural(nExcluidos, 'atualização excluída', 'atualizações excluídas')} (não aparece${nExcluidos === 1 ? '' : 'm'} aqui, mas continua${nExcluidos === 1 ? '' : 'm'} guardada${nExcluidos === 1 ? '' : 's'} no backup).</p>` : ''}`;
  }

  // Corrigir / excluir um registro do histórico (na lista ou na página da demanda)
  function abrirEdicaoHistorico(btn) {
    const li = btn.closest('li[data-hid]'); if (!li) return;
    const txt = li.querySelector('.txt');
    if (li.querySelector('.hist-form')) return;
    const atual = txt.textContent;
    txt.hidden = true;
    txt.insertAdjacentHTML('afterend', `<form class="hist-form" data-hid="${esc(li.dataset.hid)}"><textarea name="t" rows="3" maxlength="12000">${esc(atual)}</textarea>
      <div class="hist-form-a"><button type="button" class="btn ghost sm" data-act="hist-cancelar">Cancelar</button><button type="submit" class="btn primary sm">Salvar correção</button></div></form>`);
    const ta = li.querySelector('.hist-form textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  async function aposMudarHistorico(r) {
    const d = r.demanda;
    if (S.det && S.det.demanda.id === d.id && $('#pane')) {
      S.det = r; renderDemanda($('.tabs button.on')?.dataset.aba || 'historico');
    } else if (linhaEl(d.id)) {
      substituirLinha(d, true);
      alternarHistorico(d.id, true, r);
    }
  }
  async function salvarHistorico(form) {
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await rpc('td_editar_historico', { p_id: form.dataset.hid, p_texto: form.t.value });
      await aposMudarHistorico(r);
      toast('Texto corrigido. O original fica guardado.');
    } catch (e) { erro(e); btn.disabled = false; }
  }
  async function excluirHistorico(hid) {
    if (!(await confirmar({ titulo: 'Excluir esta atualização?', texto: 'Ela some do histórico e da lista. Se era a mais recente, a anterior volta a ser a descrição “Agora”.', ok: 'Excluir', perigo: true }))) return;
    try {
      const r = await rpc('td_excluir_historico', { p_id: hid });
      await aposMudarHistorico(r);
      toast('Atualização excluída.');
    } catch (e) { erro(e); }
  }

  // Excluir demandas (lixeira) e restaurar
  async function excluirDemandas(ids, { perguntar = true } = {}) {
    if (!ids.length) return;
    if (perguntar && !(await confirmar({
      titulo: ids.length === 1 ? 'Excluir esta demanda?' : `Excluir ${ids.length} demandas?`,
      texto: 'Ela vai para a Lixeira junto com o histórico. Dá para restaurar depois.', ok: 'Excluir', perigo: true }))) return false;
    const r = await rpc('td_excluir_demandas', { p_ids: ids });
    ids.forEach(id => S.sel.delete(id));
    toast(r.n === 1 ? 'Demanda enviada para a lixeira.' : `${r.n} demandas enviadas para a lixeira.`, { action: 'Desfazer', onAction: () => restaurarDemandas(ids) });
    return true;
  }
  async function restaurarDemandas(ids) {
    try {
      for (const id of ids) { await rpc('td_restaurar_demanda', { p_id: id }); S.sel.delete(id); }
      toast(ids.length === 1 ? 'Demanda restaurada.' : `${ids.length} demandas restauradas.`);
      if (S.escopo && $('#dl')) carregarLista(S.escopo); else route();
    } catch (e) { erro(e); }
  }

  // Seleção em lote
  function atualizarBulk() {
    const b = $('#bulk'); if (!b) return;
    const n = S.sel.size;
    b.hidden = !n;
    if (n) b.innerHTML = `<b>${plural(n, 'demanda selecionada', 'demandas selecionadas')}</b>
      ${S.escopo === 'lixeira' ? `<button type="button" class="btn ghost sm" data-act="bulk-restaurar">${ic('restaurar')} Restaurar</button>` : `
      <button type="button" class="btn ghost sm" data-act="bulk-print">${ic('impr')} Imprimir</button>
      <button type="button" class="btn ghost sm" data-act="bulk-csv">${ic('baixar')} Exportar CSV</button>
      <button type="button" class="btn ghost sm" data-act="bulk-excluir">${ic('lixo')} Excluir</button>`}
      <button type="button" class="btn ghost sm" data-act="bulk-limpar">${ic('x')} Limpar seleção</button>`;
    const all = $('[data-act=sel-todos]');
    const ids = (S.listas[S.escopo]?.data?.linhas || []).map(d => d.id);
    if (all) all.checked = ids.length > 0 && ids.every(id => S.sel.has(id));
  }
  async function linhasSelecionadas() {
    const r = await rpc('td_listar', { p_filtros: { escopo: 'todas', ids: [...S.sel] }, p_limite: 5000, p_offset: 0 });
    return r.linhas;
  }

  // Filtros no celular (gaveta inferior)
  function abrirSheetFiltros() {
    const escopo = S.escopo, f = S.listas[escopo].f, ab = escopo === 'abertas';
    const opt = (val, txt, cur) => `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(txt)}</option>`;
    fecharSheet();
    const sc = document.createElement('div'); sc.className = 'scrim'; sc.dataset.act = 'sheet-fechar'; sc.id = 'sheet-scrim';
    const sh = document.createElement('div'); sh.className = 'sheet-mob'; sh.id = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Filtros');
    sh.innerHTML = `<div class="dlg-h" style="margin:0"><h3>Filtros</h3><button type="button" class="dlg-x" data-act="sheet-fechar" aria-label="Fechar">${ic('x')}</button></div>
      ${ab ? `<label class="f"><span>Status</span><select name="status">${opt('', 'Todos', f.status)}${ABERTOS.map(s => opt(s, s, f.status)).join('')}</select></label>` : ''}
      <div class="row2"><label class="f"><span>Origem / Tipo</span><select name="origem">${opcoesOrigem(f.origem)}</select></label>
      <label class="f"><span>Consultor</span><select name="consultor">${opcoesConsultor(f.consultor, true)}</select></label></div>
      <label class="f"><span>Ordenar</span><select name="ordem">${opt('prioridade', ab ? 'Prioridade (atrasadas primeiro)' : 'Concluídas mais recentes', f.ordem)}${opt('recentes', 'Abertas mais recentes', f.ordem)}${opt('atualizacao', 'Última atualização', f.ordem)}</select></label>
      ${ab ? `<label class="switch">Mais de 5 dias apenas <input type="checkbox" name="atrasadas" ${f.atraso === 'atrasadas' ? 'checked' : ''}></label>
      <label class="switch">Sem atualização há 5+ dias <input type="checkbox" name="parada" ${f.atraso === 'sem_atualizacao' ? 'checked' : ''}></label>` : ''}
      <div class="row2"><button type="button" class="btn ghost lg" data-act="sheet-limpar">Limpar</button><button type="button" class="btn primary lg" data-act="sheet-aplicar">Aplicar filtros</button></div>`;
    document.body.append(sc, sh);
  }
  function fecharSheet() { $('#sheet')?.remove(); $('#sheet-scrim')?.remove(); }
  function aplicarSheet(limpar = false) {
    const escopo = S.escopo, L = S.listas[escopo], sh = $('#sheet');
    if (limpar) { const q = L.f.q; L.f = filtrosPadrao(); L.f.q = q; }
    else {
      const g = n => sh.querySelector(`[name=${n}]`);
      if (g('status')) L.f.status = g('status').value;
      L.f.origem = g('origem').value; L.f.consultor = g('consultor').value; L.f.ordem = g('ordem').value;
      if (g('atrasadas')) L.f.atraso = g('atrasadas').checked ? 'atrasadas' : (g('parada').checked ? 'sem_atualizacao' : '');
    }
    L.page = 1; fecharSheet(); sincronizarFiltros(escopo);
    $('#dl').innerHTML = carregando();
    carregarLista(escopo, { manterScroll: false });
  }

  // ------------------------------------------------------------------
  // Nova demanda (cadastro rápido no topo da lista)
  // ------------------------------------------------------------------
  let qaSeq = 0, qaT = null, qaCliente = null, qaAuto = { contato: '', telefone: '' };
  function qaHTML() {
    return `<section class="card qa" id="qa" hidden>
      <div class="qa-h"><div><h2>Nova demanda</h2><p>Digite o código do cliente. Se ele já estiver cadastrado, nome e contato aparecem sozinhos.</p></div>
        <button type="button" class="dlg-x" data-act="qa-fechar" aria-label="Fechar">${ic('x')}</button></div>
      <form id="qa-form" autocomplete="off" novalidate>
        <div class="qa-grid">
          <label class="f f-cod s2"><span>Código do cliente <span class="req">*</span></span><input name="codigo" maxlength="40" autocapitalize="characters" required><small class="hint" id="qa-hint"></small></label>
          <label class="f f-nome s4"><span>Cliente <span class="req">*</span></span><input name="nome" maxlength="180"></label>
          <label class="f s3"><span>Contato / Nome</span><input name="contato" maxlength="120"></label>
          <label class="f s3"><span>Telefone / WhatsApp</span><input name="telefone" type="tel" inputmode="tel" maxlength="16" placeholder="(41) 99999-9999" data-mask="tel"></label>
          <div class="qa-info s12" id="qa-info" hidden></div>
          <div class="f f-origem s4"><span>Origem <span class="req">*</span> <em class="muted">· marque uma ou as duas</em></span>${origensSeg(true, false)}</div>
          <label class="f f-num s2"><span>Nº da OC</span><div class="pre"><b>OC</b><input name="numero_oc" maxlength="60" placeholder="ex.: 5938372"></div></label>
          <label class="f f-num s2 off"><span>Nº da CI</span><div class="pre"><b>CI</b><input name="numero_ci" maxlength="60" placeholder="ex.: 0389439048" disabled></div></label>
          <label class="f s2"><span>Status inicial</span><select name="status">${ABERTOS.map(s => `<option>${s}</option>`).join('')}</select></label>
          <label class="f s2"><span>Consultor</span><select name="consultor">${opcoesConsultor(S.user ? S.user.nome : '')}</select></label>
          <label class="f s12"><span>Descrição da demanda <span class="req">*</span></span><textarea name="descricao" rows="2" maxlength="12000" placeholder="O que o cliente pediu e qual é a situação agora"></textarea></label>
        </div>
        <div class="qa-f"><span class="muted" id="qa-quando"></span>
          <button type="button" class="btn ghost" data-act="qa-fechar">Cancelar</button>
          <button type="submit" class="btn primary">${ic('mais')} Salvar demanda</button></div>
      </form></section>`;
  }
  // Origem: Salesforce (OC) e/ou TOTVS (CI) — caixas de marcar
  function origensSeg(oc, ci) {
    return `<div class="seg multi" role="group" aria-label="Origem">
      <label><input type="checkbox" name="tem_oc" ${oc ? 'checked' : ''}><span>Salesforce <b>OC</b></span></label>
      <label><input type="checkbox" name="tem_ci" ${ci ? 'checked' : ''}><span>TOTVS <b>CI</b></span></label></div>`;
  }
  function sincronizarOrigens(form, foco = '') {
    ['oc', 'ci'].forEach(t => {
      const cb = form.querySelector(`[name=tem_${t}]`), inp = form.querySelector(`[name=numero_${t}]`);
      if (!cb || !inp) return;
      inp.disabled = !cb.checked;
      inp.closest('.f, .pre')?.classList.toggle('off', !cb.checked);
      if (cb.checked && foco === t) inp.focus();
    });
  }
  function abrirQA(codigo = '') {
    const qa = $('#qa'); if (!qa) return;
    qa.hidden = false;
    $('#qa-quando').textContent = `Data de abertura automática: agora (${fDT(new Date())}).`;
    const f = $('#qa-form');
    if (codigo) { f.codigo.value = codigo; qaBuscarCodigo(); }
    qa.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => (codigo ? f.descricao : f.codigo).focus({ preventScroll: true }), 250);
  }
  function fecharQA() {
    const qa = $('#qa'); if (!qa) return;
    qa.hidden = true;
    const f = $('#qa-form'); f.reset(); f.nome.readOnly = false;
    $('#qa-hint').textContent = ''; $('#qa-hint').className = 'hint';
    $('#qa-info').hidden = true; sincronizarOrigens(f);
    qaCliente = null; qaAuto = { contato: '', telefone: '' };
  }
  function qaInfoCliente(c) {
    const box = $('#qa-info'); if (!box) return;
    const ds = (c && c.demandas_abertas) || [];
    if (!ds.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<b>${esc(c.nome)}</b> já tem ${plural(ds.length, 'demanda aberta', 'demandas abertas')}:
      ${ds.map(d => `<button type="button" class="qa-dem" data-act="editar" data-id="${esc(d.id)}" title="${esc(d.descricao_atual)}">${esc(regsTexto(d))} · ${esc(d.status)} ${ic('lapis')}</button>`).join('')}
      <span class="muted">Se o novo OC/CI é do mesmo assunto, clique na demanda e marque a outra origem nela. Se é outro assunto, continue aqui para abrir uma demanda nova.</span>`;
  }
  async function qaBuscarCodigo() {
    const f = $('#qa-form'); if (!f) return;
    const cod = f.codigo.value.trim(), hint = $('#qa-hint'), seq = ++qaSeq;
    if (!cod) {
      if (qaCliente) { f.nome.value = ''; }
      qaCliente = null; f.nome.readOnly = false; hint.textContent = ''; hint.className = 'hint'; return;
    }
    hint.className = 'hint'; hint.textContent = 'Procurando cliente…';
    try {
      const c = await rpc('td_cliente_por_codigo', { p_codigo: cod });
      if (seq !== qaSeq || !f.isConnected) return;
      const trocaAuto = (campo, valor) => { if (!f[campo].value || f[campo].value === qaAuto[campo]) { f[campo].value = valor; qaAuto[campo] = valor; } };
      if (c) {
        qaCliente = c;
        f.nome.value = c.nome; f.nome.readOnly = true;
        trocaAuto('contato', c.contato || '');
        trocaAuto('telefone', c.telefone ? fTel(c.telefone) : '');
        hint.className = 'hint ok';
        hint.textContent = `✓ Já cadastrado · ${plural(c.abertas, 'aberta', 'abertas')}`;
        qaInfoCliente(c);
      } else {
        if (qaCliente) { f.nome.value = ''; trocaAuto('contato', ''); trocaAuto('telefone', ''); }
        qaCliente = null; f.nome.readOnly = false;
        hint.className = 'hint new'; hint.textContent = 'Cliente novo: preencha o nome.';
        qaInfoCliente(null);
      }
    } catch (e) { if (seq === qaSeq) { hint.className = 'hint'; hint.textContent = ''; } erro(e); }
  }
  async function qaSalvar(form, confirmarCliente = false) {
    const p = Object.fromEntries(new FormData(form));
    p.codigo = (p.codigo || '').trim(); p.nome = (p.nome || '').trim(); p.descricao = (p.descricao || '').trim();
    const falha = (msg, campo) => { toast(msg, { err: true }); if (campo) form[campo].focus(); };
    p.tem_oc = form.tem_oc.checked; p.tem_ci = form.tem_ci.checked;
    if (!p.codigo) return falha('Informe o código do cliente.', 'codigo');
    if (!p.nome) return falha('Informe o nome do cliente.', 'nome');
    if (!p.tem_oc && !p.tem_ci) return falha('Marque a origem: Salesforce (OC), TOTVS (CI) ou as duas.');
    if (p.telefone && !telValido(p.telefone)) return falha('Telefone inválido. Use DDD + número.', 'telefone');
    if (p.descricao.length < 3) return falha('Descreva a demanda.', 'descricao');
    p.confirmar_cliente = confirmarCliente;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = await rpc('td_criar_demanda', { p });
      if (!r.ok && r.conflito) {
        const ok = await confirmar({ titulo: 'Este código já existe', texto: `${r.erro} Quer abrir a demanda para esse cliente? O nome cadastrado será mantido.`, ok: `Usar “${trunc(r.cliente.nome, 40)}”`, cancelar: 'Corrigir o código' });
        if (ok) return qaSalvar(form, true);
        form.codigo.focus(); return;
      }
      if (!r.ok) throw new Error(r.erro || 'Não foi possível salvar.');
      fecharQA();
      const L = S.listas.abertas;
      L.f = filtrosPadrao(); L.page = 1; // garante que a nova demanda apareça
      sincronizarFiltros('abertas');
      toast(`Demanda de ${r.demanda.cliente} cadastrada.`);
      await carregarLista('abertas', { manterScroll: false });
      const el = linhaEl(r.demanda.id);
      if (el) { el.classList.add('flash'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } catch (e) { erro(e); } finally { btn.disabled = false; }
  }

  // ------------------------------------------------------------------
  // Detalhe da demanda
  // ------------------------------------------------------------------
  async function viewDemanda(id, q) {
    view().innerHTML = carregando();
    S.det = await rpc('td_demanda', { p_id: id });
    renderDemanda(q.get('aba') || 'historico');
  }
  function renderDemanda(aba) {
    const { demanda: d, cliente: c, historico: h } = S.det;
    const wa = waUrl(d.telefone);
    const conc = d.status === 'Concluído';
    const lixo = !!d.excluida_em;
    const tab = (k, t) => `<button type="button" role="tab" data-act="det-aba" data-aba="${k}" class="${aba === k ? 'on' : ''}" aria-selected="${aba === k}">${esc(t)}</button>`;
    const volta = lixo ? ['#/lixeira', 'Lixeira'] : conc ? ['#/concluidas', 'Concluídas'] : ['#/demandas', 'Demandas'];
    view().innerHTML = `
      <a class="back" href="${volta[0]}">${ic('esq')} Voltar para ${volta[1]}</a>
      ${lixo ? `<div class="aviso-lixo">${ic('lixo')}<span>Esta demanda está na <b>lixeira</b> (excluída em ${esc(fDT(d.excluida_em))} por ${esc(d.excluida_por || '—')}).</span><button type="button" class="btn primary sm" data-act="restaurar" data-id="${esc(d.id)}">${ic('restaurar')} Restaurar</button></div>` : ''}
      <section class="card">
        <div class="det-head">
          <div><h2>${esc(d.cliente)} <small>(${esc(d.codigo)})</small></h2>
            <div class="det-tags">${regsHTML(d)}
              <span class="badge" data-st="${esc(d.status)}">${esc(d.status)}</span>
              ${d.atrasada ? `<span class="badge late">Atrasada · ${plural(d.dias, 'dia')}</span>` : ''}
              ${d.sem_atualizacao ? '<span class="badge soft">Sem atualização há 5+ dias</span>' : ''}</div></div>
          <div class="det-actions">
            ${wa ? `<a class="btn green" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${ic('wa')} WhatsApp</a>` : ''}
            <a class="btn ghost" href="#/cliente/${esc(c.id)}">${ic('clientes')} Ver cliente</a>
            ${lixo ? '' : `<button type="button" class="btn danger" data-act="excluir" data-id="${esc(d.id)}">${ic('lixo')} Excluir</button>`}</div>
        </div>
        ${lixo ? '' : `<div class="mobile-cta">${wa ? `<a class="btn green lg" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${ic('wa')} Abrir WhatsApp</a>` : `<a class="btn ghost lg" href="#/cliente/${esc(c.id)}">${ic('clientes')} Cliente</a>`}
          <button type="button" class="btn primary lg" data-act="ir-atualizar">${ic('lapis')} Atualizar</button></div>`}
        <div class="tabs" role="tablist">${tab('geral', 'Visão Geral')}${tab('historico', `Histórico (${h.length})`)}${lixo ? '' : tab('editar', 'Editar tudo')}</div>
        <div class="tabpane" id="pane">${aba === 'geral' ? paneGeral(d) : (aba === 'editar' && !lixo) ? formEdicaoHTML(d, 'pagina') : paneHistorico(d, h, S.det.n_excluidos)}</div>
      </section>`;
  }
  function formAtualizar(d) {
    return `<form id="det-upd" class="upd" data-id="${esc(d.id)}">
      <label class="f"><span>Nova atualização</span><textarea name="t" rows="3" maxlength="12000" placeholder="Registre o que foi feito, próximos passos, etc."></textarea></label>
      <div class="upd-row"><label class="f"><span>Status</span><select name="status" class="st-plain">${STATUS.map(s => `<option${s === d.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
        <button class="btn primary" type="submit">${ic('enviar')} Salvar atualização</button></div>
    </form>`;
  }
  function paneHistorico(d, h, nExc = 0) { return linhaDoTempo(h, nExc, !d.excluida_em) + (d.excluida_em ? '' : formAtualizar(d)); }
  function paneGeral(d) {
    const item = (rot, val) => `<div><small>${esc(rot)}</small><b>${val}</b></div>`;
    const tel = d.telefone ? esc(fTel(d.telefone)) : '—';
    return `<div class="kv">
        ${item('Consultor', esc(d.consultor))}${item('Origem', esc(d.origem))}${item('Registros', esc(regsTexto(d)))}
        ${item('Contato', esc(d.contato || '—'))}${item('Telefone', tel)}${item('Dias em aberto', `${d.dias}${d.atrasada ? ' <span class="badge late">Atrasada</span>' : ''}`)}
        ${item('Abertura', esc(fDT(d.aberta_em)))}${item('Última atualização', `${esc(fDT(d.atualizada_em))} <span class="muted">(${esc(relTempo(d.atualizada_em))})</span>`)}${item(d.concluida_em ? 'Concluída em' : 'Próxima ação', d.concluida_em ? esc(fDT(d.concluida_em)) : esc(d.proxima_acao ? d.proxima_acao + (d.prazo_proxima_acao ? ` · até ${fData(d.prazo_proxima_acao)}` : '') : '—'))}
      </div>
      ${d.descricao_anterior ? `<div class="descbox ant"><small>Descrição anterior</small>${esc(d.descricao_anterior)}</div>` : ''}
      <div class="descbox atu"><small>Descrição atual</small>${esc(d.descricao_atual)}</div>
      ${d.excluida_em ? '' : formAtualizar(d)}`;
  }
  // Formulário de edição completa (usado no modal da lista e na aba "Editar tudo")
  function formEdicaoHTML(d, ctx) {
    return `<form class="edit-form" data-id="${esc(d.id)}" data-ctx="${ctx}" novalidate>
      <div class="formgrid">
        <label class="f"><span>Código do cliente</span><input name="codigo" maxlength="40" value="${esc(d.codigo)}" autocapitalize="characters"></label>
        <label class="f g2"><span>Cliente</span><input name="nome" maxlength="180" value="${esc(d.cliente)}"></label>
        <p class="nota wide">Trocar o <b>código</b> passa a demanda para outro cliente (ou cria um novo). Mudar só o <b>nome</b> corrige o cadastro do cliente.</p>
        <label class="f"><span>Contato</span><input name="contato" maxlength="120" value="${esc(d.contato || '')}"></label>
        <label class="f"><span>Telefone / WhatsApp</span><input name="telefone" type="tel" inputmode="tel" maxlength="16" data-mask="tel" value="${esc(d.telefone ? fTel(d.telefone) : '')}"></label>
        <label class="f"><span>Consultor</span><select name="consultor">${opcoesConsultor(d.consultor)}</select></label>
        <div class="f wide"><span>Origem · marque uma ou as duas</span>
          <div class="origens">${origensSeg(d.tem_oc, d.tem_ci)}
            <label class="f f-num${d.tem_oc ? '' : ' off'}"><span class="sr">Nº da OC</span><div class="pre"><b>OC</b><input name="numero_oc" maxlength="60" placeholder="Nº da OC" value="${esc(d.numero_oc || '')}" ${d.tem_oc ? '' : 'disabled'}></div></label>
            <label class="f f-num${d.tem_ci ? '' : ' off'}"><span class="sr">Nº da CI</span><div class="pre"><b>CI</b><input name="numero_ci" maxlength="60" placeholder="Nº da CI" value="${esc(d.numero_ci || '')}" ${d.tem_ci ? '' : 'disabled'}></div></label>
          </div></div>
        <label class="f"><span>Status</span><select name="status">${STATUS.map(s => `<option${s === d.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="f"><span>Data e hora de abertura</span><input name="aberta_em" type="datetime-local" value="${esc(paraInputLocal(d.aberta_em))}" max="${esc(paraInputLocal(new Date()))}"></label>
        <label class="f"><span>Prazo da próxima ação</span><input name="prazo_proxima_acao" type="date" value="${esc(d.prazo_proxima_acao || '')}"></label>
        <label class="f wide"><span>Próxima ação</span><input name="proxima_acao" maxlength="600" value="${esc(d.proxima_acao || '')}" placeholder="Ex.: ligar para o cliente e confirmar documentação"></label>
        <label class="f wide"><span>Descrição atual (“Agora”)</span><textarea name="descricao_atual" rows="3" maxlength="12000">${esc(d.descricao_atual)}</textarea>
          <small class="hint">Corrige o texto da última atualização (o original fica guardado). Para registrar algo novo, escreva na caixa de atualização da lista.</small></label>
      </div>
      <div class="form-actions spread">
        <button type="button" class="btn danger" data-act="excluir" data-id="${esc(d.id)}">${ic('lixo')} Excluir demanda</button>
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="${ctx === 'modal' ? 'dlg-fechar' : 'det-aba'}" data-aba="historico">Cancelar</button>
        <button type="submit" class="btn primary">Salvar alterações</button></div>
    </form>`;
  }
  async function abrirEdicao(id) {
    let r;
    try { r = await rpc('td_demanda', { p_id: id }); } catch (e) { erro(e); return; }
    const d = r.demanda;
    if (d.excluida_em) { toast('Esta demanda está na lixeira. Restaure para editar.', { err: true }); return; }
    modal(`<div class="dlg-h"><div><h2>Editar demanda</h2><p>${esc(d.cliente)} (${esc(d.codigo)}) · ${esc(regsTexto(d))} · aberta em ${esc(fDT(d.aberta_em))}</p></div>${xBtn()}</div>${formEdicaoHTML(d, 'modal')}`, { wide: true, foco: false });
  }
  async function salvarEdicao(form, confirmarCliente = false) {
    const id = form.dataset.id, ctx = form.dataset.ctx;
    const g = n => form.elements[n];
    const p = {
      codigo: g('codigo').value.trim(), nome: g('nome').value.trim(), contato: g('contato').value, telefone: g('telefone').value,
      consultor: g('consultor').value, tem_oc: g('tem_oc').checked, tem_ci: g('tem_ci').checked,
      numero_oc: g('numero_oc').value, numero_ci: g('numero_ci').value, status: g('status').value,
      aberta_em: deInputLocal(g('aberta_em').value), prazo_proxima_acao: g('prazo_proxima_acao').value,
      proxima_acao: g('proxima_acao').value, descricao_atual: g('descricao_atual').value, confirmar_cliente: confirmarCliente
    };
    const falha = (m, n) => { toast(m, { err: true }); if (n) g(n).focus(); };
    if (!p.codigo) return falha('Informe o código do cliente.', 'codigo');
    if (!p.nome) return falha('Informe o nome do cliente.', 'nome');
    if (!p.tem_oc && !p.tem_ci) return falha('Marque pelo menos uma origem: Salesforce (OC) ou TOTVS (CI).');
    if (p.telefone && !telValido(p.telefone)) return falha('Telefone inválido. Use DDD + número.', 'telefone');
    if (p.descricao_atual.trim().length < 3) return falha('A descrição precisa de pelo menos 3 caracteres.', 'descricao_atual');
    if (!g('aberta_em').value) delete p.aberta_em;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await rpc('td_editar_demanda', { p_id: id, p });
      if (!r.ok && r.conflito) {
        const ok = await confirmar({ titulo: 'Este código já existe', texto: `${r.erro} Quer passar a demanda para esse cliente? O nome cadastrado dele será mantido.`, ok: `Passar para “${trunc(r.cliente.nome, 36)}”`, cancelar: 'Voltar' });
        if (ok) {
          // o modal foi trocado pela confirmação: reabre a edição já com o novo código aplicado
          const r2 = await rpc('td_editar_demanda', { p_id: id, p: { ...p, confirmar_cliente: true } });
          return aposEditar(r2, ctx);
        }
        if (ctx === 'modal') abrirEdicao(id);
        return;
      }
      if (!r.ok) throw new Error(r.erro || 'Não foi possível salvar.');
      await aposEditar(r, ctx);
    } catch (e) { erro(e); } finally { if (btn.isConnected) btn.disabled = false; }
  }
  async function aposEditar(r, ctx) {
    const d = r.demanda;
    toast(r.sem_mudancas ? 'Nada mudou.' : 'Demanda atualizada. As mudanças ficaram registradas no histórico.');
    if (ctx === 'modal') fecharModal();
    if (S.det && S.det.demanda.id === d.id && $('#pane')) {
      S.det = await rpc('td_demanda', { p_id: d.id });
      renderDemanda(r.sem_mudancas ? 'editar' : 'historico');
      return;
    }
    if ($('#dl') && S.escopo) {
      const fora = (S.escopo === 'abertas' && d.status === 'Concluído') || (S.escopo === 'concluidas' && d.status !== 'Concluído');
      if (fora || !linhaEl(d.id)) carregarLista(S.escopo); else { substituirLinha(d, true); if (S.escopo === 'abertas') atualizarResumoSilencioso(); }
      return;
    }
    if ($('#qa-form') || $('.cli-head')) route();
  }
  async function detSalvarAtualizacao(form) {
    const id = form.dataset.id, txt = form.t.value.trim(), st = form.status.value;
    if (!txt && st === S.det.demanda.status) { toast('Escreva a atualização ou mude o status.', { err: true }); form.t.focus(); return; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await rpc('td_registrar', { p_id: id, p_texto: txt || null, p_status: st });
      if (!r.ok) throw new Error(r.erro);
      S.det = await rpc('td_demanda', { p_id: id });
      const aba = $('.tabs button.on')?.dataset.aba || 'historico';
      renderDemanda(aba);
      toast(st === 'Concluído' && txt === '' ? 'Demanda concluída.' : 'Atualização salva no histórico.');
    } catch (e) { erro(e); } finally { if (btn.isConnected) btn.disabled = false; }
  }

  // ------------------------------------------------------------------
  // Clientes
  // ------------------------------------------------------------------
  async function viewClientes() {
    const C = S.cli;
    view().innerHTML = head('Clientes', 'Cada cliente pode ter várias demandas, ligadas pelo código.', `<button type="button" class="btn primary" data-act="cli-novo">${ic('mais')} Novo cliente</button>`) + `
      <section class="card tools"><form class="search" id="cli-busca-form" role="search" autocomplete="off"><div class="box">${ic('busca')}
        <input type="search" id="cli-busca" placeholder="Buscar por código, nome, contato ou telefone…" value="${esc(C.q)}" aria-label="Buscar clientes"></div></form></section>
      <section class="card" id="cli-res">${carregando()}</section>`;
    await carregarClientes();
  }
  async function carregarClientes() {
    const C = S.cli, seq = ++S.seq;
    try {
      const r = await rpc('td_clientes_listar', { p_q: C.q, p_limite: C.size, p_offset: (C.page - 1) * C.size });
      if (seq !== S.seq || !$('#cli-res')) return;
      if (!r.linhas.length) {
        $('#cli-res').innerHTML = C.q ? `<div class="empty">${ic('busca')}<b>Nenhum cliente encontrado</b>Tente outro termo.</div>`
          : `<div class="empty">${ic('clientes')}<b>Nenhum cliente ainda</b>Os clientes são criados automaticamente quando você cadastra uma demanda, ou pelo botão “Novo cliente”.</div>`;
        return;
      }
      const pages = Math.ceil(r.total / C.size);
      $('#cli-res').innerHTML = `<div class="tblwrap"><table class="tbl responsive"><thead><tr><th>Código</th><th>Cliente</th><th>Contato</th><th>Telefone</th><th class="num">Abertas</th><th class="num">Atrasadas</th><th class="num">Total</th><th>Última atualização</th><th></th></tr></thead><tbody>
        ${r.linhas.map(c => { const wa = waUrl(c.telefone); return `<tr class="click" data-go="#/cliente/${esc(c.id)}">
          <td data-l="Código"><b>${esc(c.codigo)}</b></td>
          <td class="full"><b>${esc(c.nome)}</b>${c.ativo ? '' : ' <span class="status-inativo">Inativo</span>'}</td>
          <td data-l="Contato">${esc(c.contato || '—')}</td>
          <td data-l="Telefone" class="nowrap">${esc(c.telefone ? fTel(c.telefone) : '—')}</td>
          <td class="num" data-l="Abertas"><b>${c.abertas}</b></td>
          <td class="num" data-l="Atrasadas">${c.atrasadas ? `<b style="color:var(--red)">${c.atrasadas}</b>` : '0'}</td>
          <td class="num" data-l="Total">${c.total}</td>
          <td data-l="Última atualização" class="nowrap">${esc(c.ultima ? fDTs(c.ultima) : '—')}</td>
          <td class="nowrap" style="text-align:right">${wa ? `<a class="ib wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp">${ic('wa')}</a>` : ''} <a class="ib" href="#/cliente/${esc(c.id)}" title="Ver cliente" aria-label="Ver cliente">${ic('dir')}</a></td>
        </tr>`; }).join('')}</tbody></table></div>
        ${pages > 1 ? `<div class="pager"><span class="muted">${r.total} clientes</span><div class="pg"><button type="button" data-act="cli-pag" data-p="${C.page - 1}" ${C.page <= 1 ? 'disabled' : ''}>${ic('esq')}</button><button class="on" type="button">${C.page}</button><button type="button" data-act="cli-pag" data-p="${C.page + 1}" ${C.page >= pages ? 'disabled' : ''}>${ic('dir')}</button></div></div>` : `<div class="pager"><span class="muted">${plural(r.total, 'cliente')}</span></div>`}`;
    } catch (e) { erro(e); }
  }
  function formClienteHTML(c = {}, id = 'cli-form') {
    return `<form id="${id}" data-id="${esc(c.id || '')}" novalidate>
      <div class="formgrid">
        <label class="f"><span>Código <span class="req">*</span></span><input name="codigo" maxlength="40" value="${esc(c.codigo || '')}" required></label>
        <label class="f" style="grid-column:span 2"><span>Nome / Razão social <span class="req">*</span></span><input name="nome" maxlength="180" value="${esc(c.nome || '')}" required></label>
        <label class="f"><span>Contato principal</span><input name="contato" maxlength="120" value="${esc(c.contato || '')}"></label>
        <label class="f"><span>Telefone / WhatsApp</span><input name="telefone" type="tel" inputmode="tel" maxlength="16" data-mask="tel" value="${esc(c.telefone ? fTel(c.telefone) : '')}"></label>
        ${c.id ? `<label class="f"><span>Situação</span><select name="ativo"><option value="true"${c.ativo !== false ? ' selected' : ''}>Ativo</option><option value="false"${c.ativo === false ? ' selected' : ''}>Inativo</option></select></label>` : '<span></span>'}
        <label class="f wide"><span>Endereço</span><input name="endereco" maxlength="300" value="${esc(c.endereco || '')}"></label>
      </div>
      ${c.id ? '<p class="muted" style="margin:12px 0 0;font-size:12.5px">Alterações ficam registradas em “Alterações”. As demandas continuam ligadas a este cliente mesmo se o código mudar.</p>' : ''}
      <div class="form-actions">${c.id ? '' : '<button type="button" class="btn ghost" data-act="dlg-fechar">Cancelar</button>'}<button type="submit" class="btn primary">Salvar cliente</button></div>
    </form>`;
  }
  async function salvarCliente(form, extra = {}) {
    const p = Object.fromEntries(new FormData(form));
    if (form.dataset.id) p.id = form.dataset.id;
    if ('ativo' in p) p.ativo = p.ativo === 'true';
    Object.assign(p, extra);
    if (!String(p.codigo || '').trim()) { toast('Informe o código.', { err: true }); return; }
    if (!String(p.nome || '').trim()) { toast('Informe o nome do cliente.', { err: true }); return; }
    if (p.telefone && !telValido(p.telefone)) { toast('Telefone inválido. Use DDD + número.', { err: true }); return; }
    const btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try {
      const r = await rpc('td_salvar_cliente', { p });
      toast('Cliente salvo.');
      if (!p.id) { fecharModal(); location.hash = `#/cliente/${r.cliente.id}`; return; }
      S.cliDet = await rpc('td_cliente', { p_id: p.id });
      renderCliente($('.tabs button.on')?.dataset.aba || 'dados');
    } catch (e) { erro(e); } finally { if (btn && btn.isConnected) btn.disabled = false; }
  }

  async function viewCliente(id, q) {
    view().innerHTML = carregando();
    S.cliDet = await rpc('td_cliente', { p_id: id });
    renderCliente(q.get('aba') || 'demandas');
  }
  function renderCliente(aba) {
    const { cliente: c, demandas: ds, auditoria: au } = S.cliDet;
    const wa = waUrl(c.telefone);
    const abertas = ds.filter(d => d.status !== 'Concluído').length;
    const tab = (k, t) => `<button type="button" role="tab" data-act="cli-aba" data-aba="${k}" class="${aba === k ? 'on' : ''}" aria-selected="${aba === k}">${esc(t)}</button>`;
    let pane = '';
    if (aba === 'demandas') {
      pane = ds.length ? `<div class="tblwrap"><table class="tbl responsive"><thead><tr><th>OC / CI</th><th>Situação</th><th>Abertura</th><th class="num">Dias</th><th>Status</th><th></th></tr></thead><tbody>
        ${ds.map(d => `<tr class="click${d.atrasada ? ' late' : ''}" data-go="#/demanda/${esc(d.id)}">
          <td class="nowrap">${regsHTML(d)}</td>
          <td class="full">${esc(trunc(d.descricao_atual, 120))}</td><td data-l="Abertura" class="nowrap">${esc(fD(d.aberta_em))}</td>
          <td class="num" data-l="Dias">${d.atrasada ? `<b style="color:var(--red)">${d.dias}</b>` : d.dias}</td>
          <td><span class="badge" data-st="${esc(d.status)}">${esc(d.status)}</span></td>
          <td class="nowrap" style="text-align:right"><button type="button" class="ib" data-act="editar" data-id="${esc(d.id)}" title="Editar" aria-label="Editar">${ic('lapis')}</button> <button type="button" class="ib del" data-act="excluir" data-id="${esc(d.id)}" title="Excluir" aria-label="Excluir">${ic('lixo')}</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${ic('inbox')}<b>Nenhuma demanda para este cliente</b></div>`;
      pane += `<div class="form-actions" style="justify-content:center"><a class="btn primary" href="#/demandas?novo=${encodeURIComponent(c.codigo)}">${ic('mais')} Nova demanda para este cliente</a></div>`;
    } else if (aba === 'dados') {
      pane = formClienteHTML(c, 'cli-edit');
    } else if (aba === 'obs') {
      pane = `<form id="cli-obs" data-id="${esc(c.id)}"><label class="f"><span>Observações sobre o cliente</span><textarea name="observacoes" rows="6" maxlength="5000" placeholder="Informações úteis: horários, preferências, particularidades…">${esc(c.observacoes || '')}</textarea></label>
        <div class="form-actions"><button type="submit" class="btn primary">Salvar observações</button></div></form>`;
    } else {
      pane = au.length ? `<div class="tblwrap"><table class="tbl responsive"><thead><tr><th>Quando</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Por</th></tr></thead><tbody>
        ${au.map(a => `<tr><td class="nowrap" data-l="Quando">${esc(fDT(a.registrado_em))}</td><td data-l="Campo"><b>${esc(a.campo)}</b></td><td data-l="Antes">${esc(a.campo === 'Telefone' ? fTel(a.valor_anterior) : (a.valor_anterior || '—'))}</td><td data-l="Depois">${esc(a.campo === 'Telefone' ? fTel(a.valor_novo) : (a.valor_novo || '—'))}</td><td data-l="Por">${esc(a.autor)}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">${ic('hist')}<b>Nenhuma alteração registrada</b>Mudanças de nome, código, contato ou telefone aparecem aqui.</div>`;
    }
    view().innerHTML = `<a class="back" href="#/clientes">${ic('esq')} Voltar para Clientes</a>
      ${head('Cliente', '', `<button type="button" class="btn ghost" data-act="cli-aba" data-aba="dados">${ic('lapis')} Editar</button>`)}
      <section class="card">
        <div class="cli-head">
          <div><h2>${esc(c.nome)} <span class="${c.ativo ? 'status-ativo' : 'status-inativo'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></h2>
            <div class="muted">Código <b style="color:var(--ink)">${esc(c.codigo)}</b> · ${plural(abertas, 'demanda aberta', 'demandas abertas')} · ${ds.length} no total</div></div>
          <div class="kv" style="grid-template-columns:1fr"><div><small>Telefone</small><b>${esc(c.telefone ? fTel(c.telefone) : '—')}</b> ${wa ? `<a class="ib wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp" style="width:30px;height:30px;margin-left:6px">${ic('wa')}</a>` : ''}</div>
            <div><small>Contato</small><b>${esc(c.contato || '—')}</b></div></div>
          <div class="kv" style="grid-template-columns:1fr"><div><small>Endereço</small><b>${esc(c.endereco || '—')}</b></div><div><small>Cliente desde</small><b>${esc(fD(c.criado_em))}</b></div></div>
        </div>
        <div class="tabs" role="tablist">${tab('demandas', `Demandas (${ds.length})`)}${tab('dados', 'Dados do Cliente')}${tab('obs', 'Observações')}${tab('alteracoes', `Alterações (${au.length})`)}</div>
        <div class="tabpane">${pane}</div>
      </section>`;
  }

  // ------------------------------------------------------------------
  // Relatórios, impressão e CSV
  // ------------------------------------------------------------------
  async function viewRelatorios() {
    view().innerHTML = head('Relatórios', 'Impressão em A4 paisagem (ou PDF) e exportação para Excel') + `
      <section class="card"><div class="card-b">
        <div class="rel-controls">
          <button type="button" class="btn primary" data-act="rel-print" data-modo="resumido">${ic('impr')} Imprimir / PDF · resumido</button>
          <button type="button" class="btn ghost" data-act="rel-print" data-modo="detalhado">${ic('impr')} Imprimir / PDF · detalhado</button>
          <button type="button" class="btn ghost" data-act="rel-csv">${ic('baixar')} Exportar CSV (Excel)</button>
        </div>
        <p class="muted" style="margin:12px 0 0">O relatório traz sempre <b>todas as demandas em aberto</b>, sem os filtros da lista. Para gerar PDF, escolha “Salvar como PDF” na janela de impressão. Se a lista for longa, ela continua nas páginas seguintes e o cabeçalho da tabela se repete em cada página. O <b>detalhado</b> inclui contato, descrição anterior e próxima ação.</p>
      </div></section>
      <div class="rel-preview" id="rel-prev">${carregando('Montando relatório…')}</div>`;
    const r = await rpc('td_listar', { p_filtros: { escopo: 'abertas' }, p_limite: 5000, p_offset: 0 });
    S.relRows = r.linhas;
    const prev = $('#rel-prev'); if (prev) prev.innerHTML = relatorioHTML(r.linhas, 'resumido');
  }
  function relatorioHTML(rows, modo = 'resumido', titulo = 'Relatório de demandas em aberto') {
    const k = { ab: rows.length, oc: rows.filter(d => d.tem_oc).length, ci: rows.filter(d => d.tem_ci).length, at: rows.filter(d => d.atrasada).length };
    const det = modo === 'detalhado';
    const cols = det
      ? [['Cliente (Código)', 15], ['Tipo / Reg.', 8], ['Consultor', 8], ['Abertura', 7], ['Descrição anterior', 19], ['Situação atual', 21], ['Próxima ação', 10], ['Dias', 4], ['Status', 8]]
      : [['Cliente (Código)', 21], ['Tipo / Reg.', 11], ['Consultor', 10], ['Situação atual', 32], ['Atualização', 11], ['Dias', 5], ['Status', 10]];
    const cel = d => det ? [
      `<b>${esc(d.cliente)}</b> (${esc(d.codigo)})${d.contato || d.telefone ? `<br><span style="color:#5b6b80">${esc(d.contato || '')} ${esc(d.telefone ? fTel(d.telefone) : '')}</span>` : ''}`,
      `${esc(regsTexto(d))}<br><span style="color:#5b6b80">${esc(d.origem)}</span>`,
      esc(d.consultor), esc(fD(d.aberta_em)), esc(d.descricao_anterior || '—'), esc(d.descricao_atual),
      esc(d.proxima_acao ? d.proxima_acao + (d.prazo_proxima_acao ? ` (até ${fData(d.prazo_proxima_acao)})` : '') : '—'),
      `<b>${d.dias}</b>`, `<span class="badge" data-st="${esc(d.status)}">${esc(d.status)}</span>`
    ] : [
      `<b>${esc(d.cliente)}</b><br>(${esc(d.codigo)})`, esc(regsTexto(d)).replace(' · ', '<br>'), esc(d.consultor),
      esc(d.descricao_atual), esc(fDTs(d.atualizada_em)), `<b>${d.dias}</b>`, `<span class="badge" data-st="${esc(d.status)}">${esc(d.status)}</span>`
    ];
    return `<div class="sheet">
      <div class="rel-top"><div><span class="brand">Tarefa <em>Diária</em></span><h1>${esc(titulo.toUpperCase())}</h1></div>
        <div class="em">Emitido em: ${esc(fDT(new Date()))}<br>Por: ${esc(S.user ? S.user.nome : '')}${det ? '<br>Versão detalhada' : ''}</div></div>
      <div class="rel-kpis"><div><b>${k.ab}</b><small>${titulo.includes('selecionadas') ? 'Selecionadas' : 'Abertas'}</small></div><div><b>${k.oc}</b><small>OC</small></div><div><b>${k.ci}</b><small>CI</small></div><div class="r"><b>${k.at}</b><small>Atrasadas (&gt; 5 dias)</small></div></div>
      ${rows.length ? `<table class="rel-table"><colgroup>${cols.map(c => `<col style="width:${c[1]}%">`).join('')}</colgroup>
        <thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(d => `<tr class="${d.atrasada ? 'late' : ''}">${cel(d).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        : '<p style="text-align:center;color:#6b7b90;padding:30px">Nenhuma demanda em aberto.</p>'}
      <div class="rel-foot"><span>Total de registros: ${rows.length}</span><span>Atrasada = aberta há mais de 120 horas (5 dias corridos). Linhas em vermelho estão atrasadas.</span></div>
    </div>`;
  }
  function imprimir(rows, modo, titulo) {
    $('#print-root').innerHTML = relatorioHTML(rows, modo, titulo);
    setTimeout(() => window.print(), 60);
  }
  // #print-root fica invisível na tela; não é limpo no "afterprint" porque no Safari/iOS esse
  // evento pode chegar antes da impressão terminar de montar as páginas.

  function exportarCSV(rows, nome) {
    const cab = ['Data abertura', 'Consultor', 'COD', 'Cliente', 'Contato / Nome', 'Telefone', 'Origem', 'Tipo', 'Nº OC (Salesforce)', 'Nº CI (TOTVS)',
      'Demanda/Descrição (Anterior)', 'Demanda/Descrição (Atualizada)', 'Última atualização', 'Status', 'Dias em aberto', 'Atrasada (>5 dias)',
      'Próxima ação', 'Prazo próxima ação', 'Concluída em'];
    const texto = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const numTexto = v => { const s = String(v ?? ''); return /^\d+$/.test(s) ? `="${s}"` : texto(s); };
    const linhas = rows.map(d => [
      texto(fDT(d.aberta_em)), texto(d.consultor), numTexto(d.codigo), texto(d.cliente), texto(d.contato), texto(d.telefone ? fTel(d.telefone) : ''),
      texto(d.origem), texto(d.tipo), d.tem_oc ? numTexto(d.numero_oc) : texto(''), d.tem_ci ? numTexto(d.numero_ci) : texto(''), texto(d.descricao_anterior), texto(d.descricao_atual), texto(fDT(d.atualizada_em)),
      texto(d.status), texto(d.dias), texto(d.atrasada ? 'Sim' : 'Não'), texto(d.proxima_acao), texto(d.prazo_proxima_acao ? fData(d.prazo_proxima_acao) : ''),
      texto(d.concluida_em ? fDT(d.concluida_em) : '')
    ].join(';'));
    const csv = '﻿' + [cab.map(texto).join(';'), ...linhas].join('\r\n');
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nome);
  }
  function baixar(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const carimbo = () => hojeISO();

  // ------------------------------------------------------------------
  // Configurações
  // ------------------------------------------------------------------
  async function viewConfig() {
    const u = S.user;
    view().innerHTML = head('Configurações', 'Acesso, consultores, usuários e backup') + carregando();
    await carregarConsultores();
    let usuarios = [];
    if (u.admin) { try { usuarios = await rpc('td_usuarios_listar'); } catch (e) { erro(e); } }
    view().innerHTML = head('Configurações', 'Acesso, consultores, usuários e backup') + `
      <div class="cfg">
        <section class="card"><div class="card-h"><h3>Meu acesso</h3></div><div class="card-b">
          <div class="kv" style="grid-template-columns:1fr 1fr;margin-bottom:16px"><div><small>Nome</small><b>${esc(u.nome)}</b></div><div><small>Celular</small><b>${esc(fTel(u.telefone))}</b></div></div>
          <div class="head-actions"><button type="button" class="btn ghost" data-act="trocar-pin">${ic('chave')} Trocar meu PIN</button><button type="button" class="btn ghost" data-act="sair">${ic('sair')} Sair deste aparelho</button></div>
        </div></section>
        <section class="card"><div class="card-h"><h3>Regras do sistema</h3></div><div class="card-b" style="display:grid;gap:10px">
          <div class="rule"><b>Atrasada:</b> aberta há mais de 120 horas (5 dias corridos, contando fim de semana), mesmo que tenha sido atualizada.</div>
          <div class="rule"><b>Parada:</b> aviso separado quando passa mais de 120 horas sem nenhuma atualização.</div>
          <div class="rule"><b>Origem define o tipo:</b> Salesforce → OC · TOTVS → CI.</div>
          <div class="rule"><b>Histórico:</b> nada é apagado. Cada atualização, mudança de status, conclusão, reabertura e edição fica registrada com data, hora e autor.</div>
        </div></section>
        <section class="card"><div class="card-h"><h3>Consultores</h3></div><div class="card-b">
          <p class="muted" style="margin:0 0 12px;font-size:13px">Nomes que aparecem no campo “Consultor” das demandas.</p>
          <div class="list-simple" style="margin-bottom:14px">${S.consultores.map(c => `<div class="it"><span class="grow"><b>${esc(c.nome)}</b>${c.ativo ? '' : ' <span class="status-inativo">Inativo</span>'}</span>
            <button type="button" class="btn ghost sm" data-act="cons-ativo" data-id="${esc(c.id)}" data-nome="${esc(c.nome)}" data-ativo="${c.ativo ? '0' : '1'}">${c.ativo ? 'Desativar' : 'Ativar'}</button></div>`).join('') || '<p class="muted">Nenhum consultor.</p>'}</div>
          <form id="cons-form" class="inline-form" autocomplete="off"><label class="f"><span>Novo consultor</span><input name="nome" maxlength="80" placeholder="Nome do consultor"></label><button type="submit" class="btn primary">Adicionar</button></form>
        </div></section>
        ${u.admin ? `<section class="card"><div class="card-h"><h3>Backup</h3></div><div class="card-b">
          <p class="muted" style="margin:0 0 12px;font-size:13px">Baixa uma cópia completa (clientes, demandas, histórico e alterações) em arquivo JSON. Guarde em local seguro.</p>
          <div class="head-actions"><button type="button" class="btn ghost" data-act="backup">${ic('baixar')} Baixar backup completo</button><button type="button" class="btn ghost" data-act="csv-todas">${ic('baixar')} CSV de todas as demandas</button></div>
        </div></section>
        <section class="card full"><div class="card-h"><h3>Usuários com acesso</h3></div><div class="card-b">
          <div class="list-simple" style="margin-bottom:16px">${usuarios.map(x => `<div class="it">
            <span class="avatar" style="width:30px;height:30px;font-size:12px">${esc(iniciais(x.nome))}</span>
            <span class="grow"><b>${esc(x.nome)}</b> ${x.admin ? '<span class="badge soft">Administrador</span>' : ''} ${!x.ativo ? '<span class="status-inativo">Inativo</span>' : ''} ${x.bloqueado ? '<span class="badge late">Bloqueado</span>' : ''} ${x.trocar_pin && x.ativo ? '<span class="badge soft">Aguardando criar PIN</span>' : ''}
              <small>${esc(fTel(x.telefone))} · último acesso: ${esc(x.ultimo_acesso ? fDT(x.ultimo_acesso) : 'nunca')}</small></span>
            ${x.id === u.id ? '<span class="muted" style="font-size:12px">você</span>' : `
              <button type="button" class="btn ghost sm" data-act="usr-pin" data-id="${esc(x.id)}" data-nome="${esc(x.nome)}">Redefinir PIN</button>
              ${x.bloqueado ? `<button type="button" class="btn ghost sm" data-act="usr-set" data-id="${esc(x.id)}" data-campo="desbloquear" data-valor="true">Desbloquear</button>` : ''}
              <button type="button" class="btn ghost sm" data-act="usr-set" data-id="${esc(x.id)}" data-campo="admin" data-valor="${x.admin ? 'false' : 'true'}">${x.admin ? 'Tirar admin' : 'Tornar admin'}</button>
              <button type="button" class="btn ${x.ativo ? 'danger' : 'ghost'} sm" data-act="usr-set" data-id="${esc(x.id)}" data-campo="ativo" data-valor="${x.ativo ? 'false' : 'true'}">${x.ativo ? 'Desativar' : 'Reativar'}</button>`}
          </div>`).join('')}</div>
          <form id="usr-form" class="inline-form" autocomplete="off" novalidate>
            <label class="f"><span>Nome</span><input name="nome" maxlength="80" placeholder="Nome da pessoa"></label>
            <label class="f"><span>Celular</span><input name="telefone" type="tel" inputmode="tel" maxlength="16" data-mask="tel" placeholder="(41) 99999-9999"></label>
            <label class="f" style="max-width:150px"><span>PIN provisório</span><input name="pin" inputmode="numeric" maxlength="4" data-mask="pin" placeholder="4 números"></label>
            <label class="check" style="margin-bottom:10px"><input type="checkbox" name="admin"> Administrador</label>
            <button type="submit" class="btn primary">Adicionar usuário</button>
          </form>
          <p class="muted" style="margin:10px 0 0;font-size:12.5px">A pessoa entra com o celular e o PIN provisório e o sistema pede para ela criar um PIN próprio. Depois de 5 PINs errados o acesso bloqueia por 15 minutos (o tempo aumenta se repetir).</p>
        </div></section>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------------
  // Eventos (delegação)
  // ------------------------------------------------------------------
  let buscaT = null, cliBuscaT = null;

  document.addEventListener('click', async e => {
    const goRow = e.target.closest('tr[data-go]');
    if (goRow && !e.target.closest('a, button, input, select, textarea')) { location.hash = goRow.dataset.go; return; }
    const el = e.target.closest('[data-act]');
    if (!el) { if (!e.target.closest('.menu-pop')) fecharMenuPerfil(); return; }
    const act = el.dataset.act;
    if (act !== 'perfil') fecharMenuPerfil();
    try {
      switch (act) {
        case 'ver-pin': { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.innerHTML = ic(i.type === 'password' ? 'olho' : 'olhoX'); break; }
        case 'esqueci': $('#esqueci').hidden = !$('#esqueci').hidden; break;
        case 'menu': document.body.classList.add('nav-open'); $('.scrim').hidden = false; break;
        case 'menu-fechar': document.body.classList.remove('nav-open'); el.hidden = true; break;
        case 'perfil': menuPerfil(el); break;
        case 'trocar-pin': abrirTrocarPin(false); break;
        case 'sair': if (await (S.user && S.user.trocar_pin ? Promise.resolve(true) : confirmar({ titulo: 'Sair deste aparelho?', texto: 'Você vai precisar do celular e do PIN para entrar de novo.', ok: 'Sair' }))) sair(); break;
        case 'dlg-fechar': fecharModal(); break;
        case 'recarregar': route(); break;
        // lista
        case 'qa-abrir': { const qa = $('#qa'); if (qa && !qa.hidden) { $('#qa-form').codigo.focus(); } else abrirQA(); break; }
        case 'qa-fechar': fecharQA(); break;
        case 'chip': {
          const L = S.listas.abertas; const [k, v] = (el.dataset.filtro || ':').split(':');
          const ativo = k && L.f[k] === v;
          L.f.status = ''; L.f.origem = ''; L.f.atraso = '';
          if (k && !ativo) L.f[k] = v;
          recarregarComFiltros('abertas');
          break;
        }
        case 'busca-limpar': { const L = S.listas[S.escopo]; $('#busca').value = ''; el.hidden = true; aplicarFiltro(S.escopo, 'q', ''); $('#busca').focus(); break; }
        case 'limpar-filtros': { const L = S.listas[S.escopo]; L.f = filtrosPadrao(); L.page = 1; sincronizarFiltros(S.escopo); $('#dl').innerHTML = carregando(); carregarLista(S.escopo, { manterScroll: false }); break; }
        case 'filtros-mob': abrirSheetFiltros(); break;
        case 'sheet-fechar': fecharSheet(); break;
        case 'sheet-aplicar': aplicarSheet(false); break;
        case 'sheet-limpar': aplicarSheet(true); break;
        case 'pag': { const L = S.listas[S.escopo]; L.page = Number(el.dataset.p); await carregarLista(S.escopo, { manterScroll: false }); $('#dl').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); break; }
        case 'hist': alternarHistorico(el.dataset.id); break;
        case 'sel': if (el.checked) S.sel.add(el.dataset.id); else S.sel.delete(el.dataset.id); atualizarBulk(); break;
        case 'sel-todos': { (S.listas[S.escopo].data?.linhas || []).forEach(d => el.checked ? S.sel.add(d.id) : S.sel.delete(d.id)); $$('.dm [data-act=sel]').forEach(c => { c.checked = el.checked; }); atualizarBulk(); break; }
        case 'bulk-limpar': S.sel.clear(); $$('.dm [data-act=sel]').forEach(c => { c.checked = false; }); atualizarBulk(); break;
        case 'bulk-print': { const rows = await linhasSelecionadas(); imprimir(rows, 'resumido', 'Relatório de demandas selecionadas'); break; }
        case 'bulk-csv': { const rows = await linhasSelecionadas(); exportarCSV(rows, `tarefa-diaria-selecionadas-${carimbo()}.csv`); break; }
        case 'bulk-excluir': { if (await excluirDemandas([...S.sel])) carregarLista(S.escopo); break; }
        case 'bulk-restaurar': restaurarDemandas([...S.sel]); break;
        // editar / excluir / restaurar
        case 'editar': fecharMenuPerfil(); abrirEdicao(el.dataset.id); break;
        case 'excluir': {
          const id = el.dataset.id;
          const naPagina = S.det && S.det.demanda.id === id && $('#pane');
          if (!(await excluirDemandas([id]))) break;
          if (naPagina) { location.hash = '#/demandas'; break; }
          if ($('#dl') && S.escopo) {
            const row = linhaEl(id);
            if (row) { row.classList.add('saindo'); await sleep(400); }
            carregarLista(S.escopo);
          } else if ($('.cli-head')) route();
          break;
        }
        case 'restaurar': restaurarDemandas([el.dataset.id]); break;
        case 'hist-editar': abrirEdicaoHistorico(el); break;
        case 'hist-cancelar': { const li = el.closest('li[data-hid]'); li.querySelector('.hist-form').remove(); li.querySelector('.txt').hidden = false; break; }
        case 'hist-excluir': excluirHistorico(el.dataset.hid); break;
        // detalhe
        case 'det-aba': renderDemanda(el.dataset.aba); break;
        case 'ir-atualizar': { renderDemanda('historico'); const f = $('#det-upd'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => f.t.focus({ preventScroll: true }), 300); } break; }
        // clientes
        case 'cli-novo': modal(`<div class="dlg-h"><div><h2>Novo cliente</h2><p>O código precisa ser único.</p></div>${xBtn()}</div>${formClienteHTML({}, 'cli-novo-form')}`, { wide: true }); break;
        case 'cli-aba': renderCliente(el.dataset.aba); break;
        case 'cli-pag': S.cli.page = Number(el.dataset.p); carregarClientes(); break;
        // relatórios
        case 'rel-print': { const rows = S.relRows || (await rpc('td_listar', { p_filtros: { escopo: 'abertas' }, p_limite: 5000, p_offset: 0 })).linhas; imprimir(rows, el.dataset.modo, 'Relatório de demandas em aberto'); break; }
        case 'rel-csv': { const rows = (await rpc('td_listar', { p_filtros: { escopo: 'abertas' }, p_limite: 5000, p_offset: 0 })).linhas; exportarCSV(rows, `tarefa-diaria-abertas-${carimbo()}.csv`); toast(`${plural(rows.length, 'demanda exportada', 'demandas exportadas')}.`); break; }
        case 'csv-todas': { const rows = (await rpc('td_listar', { p_filtros: { escopo: 'todas', ordem: 'recentes' }, p_limite: 5000, p_offset: 0 })).linhas; exportarCSV(rows, `tarefa-diaria-todas-${carimbo()}.csv`); break; }
        // configurações
        case 'backup': { const b = await rpc('td_backup'); baixar(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `tarefa-diaria-backup-${carimbo()}.json`); toast('Backup baixado.'); break; }
        case 'cons-ativo': { S.consultores = await rpc('td_salvar_consultor', { p_id: el.dataset.id, p_nome: el.dataset.nome, p_ativo: el.dataset.ativo === '1' }); viewConfig(); break; }
        case 'usr-set': {
          const p = { id: el.dataset.id }; p[el.dataset.campo] = el.dataset.valor === 'true';
          if (el.dataset.campo === 'ativo' && !p.ativo && !(await confirmar({ titulo: 'Desativar este usuário?', texto: 'Ele sai de todos os aparelhos e não consegue mais entrar até ser reativado.', ok: 'Desativar', perigo: true }))) break;
          await rpc('td_salvar_usuario', { p }); toast('Usuário atualizado.'); viewConfig(); break;
        }
        case 'usr-pin': {
          modal(`<div class="dlg-h"><div><h2>Redefinir PIN</h2><p>${esc(el.dataset.nome)} vai entrar com este PIN provisório e criar um novo.</p></div>${xBtn()}</div>
            <form id="usr-pin-form" class="dlg-grid" data-id="${esc(el.dataset.id)}" novalidate><label class="f"><span>PIN provisório (4 números)</span><input name="pin" inputmode="numeric" maxlength="4" data-mask="pin"></label>
            <div class="form-actions"><button type="button" class="btn ghost" data-act="dlg-fechar">Cancelar</button><button type="submit" class="btn primary">Redefinir</button></div></form>`);
          break;
        }
        default: break;
      }
    } catch (err) { erro(err); }
  });

  document.addEventListener('submit', async e => {
    const f = e.target;
    const id = f.id;
    if (f.classList.contains('dm-write')) { e.preventDefault(); return salvarLinha(f); }
    if (f.classList.contains('edit-form')) { e.preventDefault(); return salvarEdicao(f); }
    if (f.classList.contains('hist-form')) { e.preventDefault(); return salvarHistorico(f); }
    const map = {
      'login-form': () => entrar(f),
      'pin-form': () => salvarPin(f),
      'qa-form': () => qaSalvar(f),
      'busca-form': () => { const L = S.listas[S.escopo]; clearTimeout(buscaT); L.f.q = $('#busca').value.trim(); L.page = 1; $('#busca').blur(); carregarLista(S.escopo, { manterScroll: false }); },
      'cli-busca-form': () => { clearTimeout(cliBuscaT); S.cli.q = $('#cli-busca').value.trim(); S.cli.page = 1; carregarClientes(); },
      'det-upd': () => detSalvarAtualizacao(f),
      'cli-novo-form': () => salvarCliente(f),
      'cli-edit': () => salvarCliente(f),
      'cli-obs': () => { const c = S.cliDet.cliente; return salvarCliente(f, { id: c.id, codigo: c.codigo, nome: c.nome }); },
      'cons-form': async () => { const nome = f.nome.value.trim(); if (!nome) return; try { S.consultores = await rpc('td_salvar_consultor', { p_id: null, p_nome: nome, p_ativo: true }); toast('Consultor adicionado.'); viewConfig(); } catch (er) { erro(er); } },
      'usr-form': async () => {
        const p = { nome: f.nome.value.trim(), telefone: f.telefone.value, pin: f.pin.value, admin: f.admin.checked };
        if (p.nome.length < 2) return toast('Informe o nome.', { err: true });
        if (!telValido(p.telefone)) return toast('Celular inválido. Use DDD + número.', { err: true });
        if (!/^\d{4}$/.test(p.pin)) return toast('O PIN provisório precisa ter 4 números.', { err: true });
        try { await rpc('td_salvar_usuario', { p }); toast(`${p.nome} pode entrar com o celular e o PIN ${p.pin}.`, { ms: 8000 }); await carregarConsultores(); viewConfig(); } catch (er) { erro(er); }
      },
      'usr-pin-form': async () => {
        const pin = f.pin.value;
        if (!/^\d{4}$/.test(pin)) return toast('O PIN precisa ter 4 números.', { err: true });
        try { await rpc('td_salvar_usuario', { p: { id: f.dataset.id, pin } }); fecharModal(); toast(`PIN redefinido para ${pin}. A pessoa vai criar um novo no próximo acesso.`, { ms: 8000 }); viewConfig(); } catch (er) { erro(er); }
      }
    };
    if (map[id]) { e.preventDefault(); try { await map[id](); } catch (er) { erro(er); } }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.mask === 'tel' && !(e.inputType || '').startsWith('delete')) { t.value = mascaraTel(t.value); }
    if (t.dataset.mask === 'pin') { const v = digits(t.value).slice(0, 4); if (v !== t.value) t.value = v; }
    if (t.matches('.dm-write textarea')) {
      const id = t.closest('.dm-write').dataset.id;
      if (t.value.trim()) S.drafts.set(id, t.value); else S.drafts.delete(id);
      t.closest('.dm-write').querySelector('.send').disabled = !t.value.trim();
      ajustarAltura(t);
      return;
    }
    if (t.id === 'busca') {
      const cl = $('[data-act=busca-limpar]'); if (cl) cl.hidden = !t.value;
      clearTimeout(buscaT);
      buscaT = setTimeout(() => { const L = S.listas[S.escopo]; L.f.q = t.value.trim(); L.page = 1; carregarLista(S.escopo, { manterScroll: false }); }, 350);
      return;
    }
    if (t.id === 'cli-busca') { clearTimeout(cliBuscaT); cliBuscaT = setTimeout(() => { S.cli.q = t.value.trim(); S.cli.page = 1; carregarClientes(); }, 350); return; }
    if (t.form && t.form.id === 'qa-form' && t.name === 'codigo') { clearTimeout(qaT); qaT = setTimeout(qaBuscarCodigo, 450); }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('select.st[data-act=status]')) return mudarStatus(t);
    if (t.matches('[data-filtro]') && t.tagName === 'SELECT') return aplicarFiltro(S.escopo, t.dataset.filtro, t.value);
    if (t.matches('[data-act=pag-size]')) { const L = S.listas[S.escopo]; L.size = Number(t.value); L.page = 1; carregarLista(S.escopo, { manterScroll: false }); return; }
    if (t.form && (t.name === 'tem_oc' || t.name === 'tem_ci')) { sincronizarOrigens(t.form, t.checked ? t.name.slice(4) : ''); return; }
    if (t.form && t.form.id === 'qa-form' && t.name === 'codigo') { clearTimeout(qaT); qaBuscarCodigo(); }
  });

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && t.matches('.dm-write textarea')) { e.preventDefault(); salvarLinha(t.closest('.dm-write')); return; }
    if (e.key === 'Escape') { fecharMenuPerfil(); fecharSheet(); if (document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); const sc = $('.scrim'); if (sc) sc.hidden = true; } }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && $('#busca')) { e.preventDefault(); $('#busca').focus(); }
  });

  dlg().addEventListener('cancel', e => { if (dlg().dataset.locked) e.preventDefault(); });

  // Atualiza ao voltar para a aba (para ver mudanças feitas em outro aparelho)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.token || !$('.top')) return;
    atualizarDataTopo();
    if (Date.now() - S.lastLoad < 60000) return;
    const { path } = parseHash();
    const digitando = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (digitando || dlg().open) return;
    if (path === '#/demandas' || path === '#/concluidas') carregarLista(S.escopo);
    else if (path === '#/painel') viewPainel().catch(erro);
  });
  window.addEventListener('hashchange', route);
  setInterval(atualizarDataTopo, 60000);

  // ------------------------------------------------------------------
  // Início
  // ------------------------------------------------------------------
  async function iniciar() {
    if (!S.token) return viewLogin();
    try {
      const me = await api('td_me', { p_token: S.token });
      S.user = me;
      store.set('td_user', JSON.stringify(me), store.persistente('td_token'));
    } catch (e) {
      if (e.code === 'SESSAO') return;
      if (!S.user) { viewLogin(e.message); return; }
    }
    shell();
    if (S.user.trocar_pin) { view().innerHTML = carregando('Aguardando novo PIN…'); abrirTrocarPin(true); return; }
    await carregarConsultores();
    route();
  }

  if (!CFG.url || !CFG.key) {
    $('#app').innerHTML = '<div class="empty"><b>Configuração ausente</b>Arquivo assets/config.js não encontrado.</div>';
  } else {
    iniciar();
  }
})();
