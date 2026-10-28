/* EstudeUp — vitrine das escolas parceiras: cartões de oportunidade, página da escola e contato.
   Usado dentro do app (telas Oportunidades e Escola) e nas páginas públicas (escola.html, oportunidades.html).
   Não manda nenhum dado do aluno pra escola: o contato só abre o WhatsApp, o site ou o e-mail da escola. */

const Vitrine = (() => {
  const CATEGORIAS = {
    bolsa: ['Bolsa de estudo', 'trofeu', 'amarelo'],
    desconto: ['Desconto', 'alvo', 'rosa'],
    matricula: ['Matrículas abertas', 'escola', 'azul'],
    curso_novo: ['Curso novo', 'livros', 'verde'],
    preparatorio: ['Preparatório', 'capelo', 'roxo'],
    profissionalizante: ['Profissionalizante', 'lampada', 'laranja'],
    aula_experimental: ['Aula experimental', 'foguete', 'verde'],
    evento: ['Evento e palestra', 'megafone', 'laranja'],
    campanha: ['Campanha', 'sino', 'rosa'],
    outro: ['Oportunidade', 'brilho', 'azul'],
  };
  const TIPOS = {
    escola: 'Escola', cursinho: 'Cursinho e pré-vestibular', idiomas: 'Escola de idiomas', profissionalizante: 'Curso profissionalizante',
    faculdade: 'Faculdade', reforco: 'Reforço escolar', outro: 'Instituição de ensino',
  };
  const MODALIDADES = { presencial: 'Presencial', online: 'On-line', hibrido: 'Híbrido' };
  const cache = { oportunidades: {}, escolas: {} };

  const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (id, t = 16) => `<svg class="ico" style="width:${t}px;height:${t}px" aria-hidden="true"><use href="${Vitrine.sprite}#${id}"/></svg>`;
  const linkOk = (u) => /^https?:\/\//i.test(String(u || ''));
  const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dataCurta = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
  const diasAte = (iso) => Math.round((new Date(String(iso).slice(0, 10) + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 86400000);

  // visitante sem login: um número aleatório guardado só neste navegador (não identifica ninguém)
  function visitante() {
    try {
      let v = localStorage.getItem('estude-visitante');
      if (!v || !/^[0-9a-f-]{36}$/.test(v)) { v = crypto.randomUUID(); localStorage.setItem('estude-visitante', v); }
      return v;
    } catch (_) {
      if (!Vitrine._sessao) Vitrine._sessao = crypto.randomUUID();
      return Vitrine._sessao;
    }
  }

  async function rpcV(nome, args = {}) {
    const { data, error } = await Vitrine.cliente.rpc(nome, args);
    if (error) throw new Error(error.message);
    return data;
  }

  function evento(tipo, instituicao, oportunidade = null) {
    if (!instituicao) return;
    rpcV('be_registrar_evento', { p_tipo: tipo, p_instituicao: instituicao, p_oportunidade: oportunidade, p_visitante: visitante() }).catch(() => {});
  }

  function whatsappLink(numero, texto) {
    let n = String(numero || '').replace(/\D/g, '');
    if (!n) return null;
    if (n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
  }

  function destinoContato(escola, op) {
    const zap = (op && op.contato) || escola.whatsapp;
    const texto = op ? `Olá! Vi "${op.titulo}" da ${escola.nome} no EstudeUp e quero saber mais.` : `Olá! Vi a ${escola.nome} no EstudeUp e quero saber mais.`;
    if (zap) return { url: whatsappLink(zap, texto), rotulo: 'Falar no WhatsApp', icone: 'i-whatsapp' };
    if (op && linkOk(op.link)) return { url: op.link, rotulo: 'Saber mais no site', icone: 'i-abrir' };
    if (linkOk(escola.site)) return { url: escola.site, rotulo: 'Ir pro site da escola', icone: 'i-site' };
    if (escola.email) return { url: `mailto:${escola.email}?subject=${encodeURIComponent('Vi no EstudeUp')}`, rotulo: 'Mandar e-mail', icone: 'i-email' };
    return null;
  }

  // ---------------- cartões ----------------
  function selo(escola) {
    if (escola.demo) return '<span class="selo-vitrine demo">Escola de demonstração</span>';
    return '<span class="selo-vitrine">Instituição parceira</span>';
  }

  function validade(op) {
    const d = diasAte(op.fim);
    if (d < 0) return 'encerrada';
    if (d === 0) return 'termina hoje';
    if (d <= 7) return `termina em ${d} dia${d === 1 ? '' : 's'}`;
    return `até ${dataCurta(op.fim)}`;
  }

  function htmlOportunidade(op, { mostrarEscola = true } = {}) {
    cache.oportunidades[op.id] = op;
    const esc = op.escola || {};
    const [rotulo, adesivo, cor] = CATEGORIAS[op.categoria] || CATEGORIAS.outro;
    const capa = linkOk(op.imagem_url)
      ? `<div class="op-capa foto"><img src="${e(op.imagem_url)}" alt="" loading="lazy"></div>`
      : `<div class="op-capa cor-${cor}"><img class="adesivo" src="${Vitrine.adesivos}${adesivo}.webp" alt=""><span>${e(rotulo)}</span></div>`;
    return `<article class="op-card ${esc.destaque > 0 ? 'destaque' : ''}" data-id="${e(op.id)}">
      ${capa}
      <div class="op-corpo">
        <div class="op-selos"><span class="op-cat">${e(rotulo)}</span>${selo(esc)}${esc.destaque > 0 ? `<span class="selo-vitrine forte">${ic('i-estrela', 12)}destaque</span>` : ''}</div>
        <h3>${e(op.titulo)}</h3>
        <p class="op-desc">${e(op.descricao)}</p>
        ${mostrarEscola ? `<button class="op-escola" onclick="Vitrine.abrirEscola('${e(esc.slug)}')">
          ${linkOk(esc.logo_url) ? `<img src="${e(esc.logo_url)}" alt="">` : `<span class="op-escola-ini">${e((esc.nome || '?').slice(0, 1))}</span>`}
          <span><b>${e(esc.nome)}</b><small>${e([esc.cidade, esc.uf].filter(Boolean).join(' - '))}</small></span></button>` : ''}
        <div class="op-meta"><span>${ic('i-calendario', 14)}${validade(op)}</span><span>${ic('i-pin', 14)}${op.online ? 'on-line' : e(op.local || esc.cidade || '')}</span></div>
        <div class="op-acoes">
          <button class="ghost-btn" onclick="Vitrine.detalhes('${e(op.id)}')">Ver condições</button>
          <button class="btn coral" onclick="Vitrine.contatar('${e(esc.id)}', '${e(op.id)}')">${ic('i-whatsapp', 16)}Tenho interesse</button>
        </div>
      </div>
    </article>`;
  }

  function htmlEscolaCard(escola) {
    cache.escolas[escola.slug] = escola;
    return `<button class="escola-card" onclick="Vitrine.abrirEscola('${e(escola.slug)}')">
      <span class="escola-card-logo">${linkOk(escola.logo_url) ? `<img src="${e(escola.logo_url)}" alt="">` : e((escola.nome || '?').slice(0, 1))}</span>
      <span class="escola-card-txt"><b>${e(escola.nome)}</b><small>${e(TIPOS[escola.tipo] || 'Instituição de ensino')} · ${e(escola.cidade || '')}</small>
        ${escola.oportunidades_ativas ? `<em>${escola.oportunidades_ativas} oportunidade${escola.oportunidades_ativas === 1 ? '' : 's'}</em>` : ''}</span>
      ${escola.demo ? '<span class="selo-vitrine demo">demo</span>' : ''}
    </button>`;
  }

  // ---------------- página da escola ----------------
  function htmlEscola(escola) {
    cache.escolas[escola.slug] = escola;
    const cont = destinoContato(escola, null);
    const redes = [
      escola.whatsapp && `<a class="rede" href="${e(whatsappLink(escola.whatsapp, `Olá! Vi a ${escola.nome} no EstudeUp.`))}" target="_blank" rel="noopener" onclick="Vitrine.clique(event, '${e(escola.id)}')" ${escola.demo ? 'data-demo="1"' : ''}>${ic('i-whatsapp')}WhatsApp</a>`,
      linkOk(escola.site) && `<a class="rede" href="${e(escola.site)}" target="_blank" rel="noopener" onclick="Vitrine.clique(event, '${e(escola.id)}')" ${escola.demo ? 'data-demo="1"' : ''}>${ic('i-site')}Site</a>`,
      linkOk(escola.instagram) && `<a class="rede" href="${e(escola.instagram)}" target="_blank" rel="noopener" onclick="Vitrine.clique(event, '${e(escola.id)}')" ${escola.demo ? 'data-demo="1"' : ''}>${ic('i-instagram')}Instagram</a>`,
      linkOk(escola.facebook) && `<a class="rede" href="${e(escola.facebook)}" target="_blank" rel="noopener" onclick="Vitrine.clique(event, '${e(escola.id)}')" ${escola.demo ? 'data-demo="1"' : ''}>${ic('i-facebook')}Facebook</a>`,
      escola.email && `<a class="rede" href="mailto:${e(escola.email)}" onclick="Vitrine.clique(event, '${e(escola.id)}')" ${escola.demo ? 'data-demo="1"' : ''}>${ic('i-email')}${e(escola.email)}</a>`,
      escola.telefone && `<span class="rede">${ic('i-telefone')}${e(escola.telefone)}</span>`,
    ].filter(Boolean).join('');
    const ops = (escola.oportunidades || []);
    return `<div class="escola-pagina">
      ${escola.previa ? `<div class="aviso-moderacao espera"><b>Prévia:</b> essa página ainda não está no ar (situação: ${e(escola.status)}). Só a escola e a equipe do EstudeUp veem.</div>` : ''}
      ${escola.demo ? '<div class="aviso-demo">Escola de demonstração: nome, pessoas, números e ofertas são fictícios, criados pra mostrar como o EstudeUp funciona.</div>' : ''}
      <div class="escola-capa" ${linkOk(escola.capa_url) ? `style="background-image:url('${e(escola.capa_url)}')"` : ''}>
        <div class="escola-logo">${linkOk(escola.logo_url) ? `<img src="${e(escola.logo_url)}" alt="logo da ${e(escola.nome)}">` : `<span>${e((escola.nome || '?').slice(0, 1))}</span>`}</div>
      </div>
      <div class="escola-topo">
        <div>${selo(escola)}</div>
        <h1>${e(escola.nome)}</h1>
        <p class="escola-sub">${e(TIPOS[escola.tipo] || 'Instituição de ensino')}${escola.cidade ? ` · ${e(escola.cidade)}${escola.uf ? ' - ' + e(escola.uf) : ''}` : ''}</p>
        ${(escola.modalidades || []).length ? `<div class="chips-escola">${escola.modalidades.map((m) => `<span>${e(MODALIDADES[m] || m)}</span>`).join('')}</div>` : ''}
        ${cont ? `<button class="btn coral escola-cta" onclick="Vitrine.contatar('${e(escola.id)}', null)">${ic(cont.icone, 18)}${e(cont.rotulo)}</button>` : ''}
        <p class="aviso-menor">${ic('i-info', 14)}Menor de 18 anos? Combina com seus pais ou responsáveis antes de falar com a escola.</p>
      </div>
      ${ops.length ? `<section class="escola-secao"><h2>Oportunidades abertas</h2><div class="op-grade">${ops.map((o) => htmlOportunidade(o, { mostrarEscola: false })).join('')}</div></section>` : ''}
      ${escola.descricao ? `<section class="escola-secao"><h2>Sobre a escola</h2><div class="escola-texto">${e(escola.descricao).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>')}</div></section>` : ''}
      ${(escola.cursos || []).length ? `<section class="escola-secao"><h2>Cursos e segmentos</h2><ul class="lista-cursos">${escola.cursos.map((c) => `<li><b>${e(c.nome)}</b>${c.descricao ? `<span>${e(c.descricao)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
      ${escola.publico || escola.regiao || escola.endereco ? `<section class="escola-secao"><h2>Pra quem e onde</h2><dl class="escola-dados">
        ${escola.publico ? `<dt>Público</dt><dd>${e(escola.publico)}</dd>` : ''}
        ${escola.regiao ? `<dt>Atende</dt><dd>${e(escola.regiao)}</dd>` : ''}
        ${escola.endereco ? `<dt>Endereço</dt><dd>${e(escola.endereco)}</dd>` : ''}</dl></section>` : ''}
      ${redes ? `<section class="escola-secao"><h2>Contato</h2><div class="redes">${redes}</div></section>` : ''}
    </div>`;
  }

  // ---------------- ações ----------------
  function detalhes(id) {
    const op = cache.oportunidades[id];
    if (!op) return;
    evento('ver_oportunidade', op.escola && op.escola.id, op.id);
    const partes = [op.titulo, '', op.descricao];
    if (op.regras) partes.push('', 'Regras e condições:', op.regras);
    partes.push('', `Vale de ${dataCurta(op.inicio)} a ${dataCurta(op.fim)}${op.online ? ' · on-line' : op.local ? ' · ' + op.local : ''}.`);
    if (op.escola && op.escola.demo) partes.push('', '(Oportunidade fictícia de uma escola de demonstração.)');
    Vitrine.mostrar(partes.join('\n'), { ok: 'Tenho interesse', nao: 'Fechar' }).then((sim) => { if (sim) contatar(op.escola.id, op.id); });
  }

  function escolaDe(instId, opId) {
    if (opId && cache.oportunidades[opId]) return cache.oportunidades[opId].escola;
    return Object.values(cache.escolas).find((x) => x.id === instId) || null;
  }

  function contatar(instId, opId) {
    const op = opId ? cache.oportunidades[opId] : null;
    const escola = escolaDe(instId, opId);
    if (!escola) return;
    evento('clique_contato', escola.id, op ? op.id : null);
    if (escola.demo) {
      Vitrine.mostrar('Essa é uma escola de demonstração. Numa escola parceira de verdade, este botão abre o WhatsApp (ou o site) da escola, com uma mensagem pronta. O EstudeUp não passa nenhum dado seu pra escola.', { ok: 'Entendi' });
      return;
    }
    const dest = destinoContato(escola, op);
    if (!dest) { Vitrine.mostrar('Essa escola ainda não cadastrou um contato.', { ok: 'OK' }); return; }
    window.open(dest.url, '_blank', 'noopener');
  }

  // link de contato da página da escola (WhatsApp, site, Instagram...)
  function clique(ev, instId) {
    evento('clique_contato', instId, null);
    const escola = escolaDe(instId, null);
    if (escola && escola.demo) {
      if (ev) ev.preventDefault();
      Vitrine.mostrar('Escola de demonstração: numa escola de verdade, esse link abre o contato dela.', { ok: 'Entendi' });
    }
  }

  return {
    CATEGORIAS, TIPOS, MODALIDADES, cache, rpc: rpcV, evento, visitante, whatsappLink,
    htmlOportunidade, htmlEscolaCard, htmlEscola, detalhes, contatar, clique, linkOk, dataCurta,
    // o app e as páginas públicas trocam estes três
    cliente: null, sprite: '', adesivos: 'adesivos/',
    abrirEscola(slug) { location.href = 'escola.html?e=' + encodeURIComponent(slug); },
    mostrar(texto, opts) { return typeof abrirBilhete === 'function' ? abrirBilhete(texto, opts) : Promise.resolve(window.confirm(texto)); },
  };
})();
