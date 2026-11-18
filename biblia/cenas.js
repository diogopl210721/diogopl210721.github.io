/* Bíblia RPG — motor de cenas em pixel art (compartilhado entre o site e o mundo).
   Coordenadas em "pixels do mundo": altura 192, largura de cada cena em LARG. */
(function (G) {
  const SB_URL = 'https://arffptuclrrzuzdrcmuc.supabase.co', SB_KEY = 'sb_publishable_XCY3BoeUR_jzDSRrtlibyg_Os7lIrVi';
  const WA = 'https://wa.me/5541991542931?text=' + encodeURIComponent('Olá! Quero anunciar no mundo do Bíblia RPG.');
  const ALT = 192;

  // ---------- utilidades ----------
  function hash(n) { let x = (n * 2654435761) >>> 0; x ^= x >>> 16; x = Math.imul(x, 2246822507) >>> 0; x ^= x >>> 13; return x >>> 0; }
  function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  function R(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(Math.round(x), Math.round(y), w, h); }
  const PELE = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const CABELO = ['#2b1a0e', '#4a2c16', '#121212', '#a0522d', '#d8b26e'];
  const ROUPA = ['#a3402e', '#2e6aa3', '#4f7a2a', '#7a4fa3', '#c08a2b', '#2e8c86', '#8c2e5a', '#d6d0c0'];

  // pessoa pixel (8x13), pés em (x, y)
  const PELES = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
  const CABELOS = ['#2b1a0e', '#4a2c16', '#121212', '#a0522d', '#d8b26e', '#cdcdcd'];
  const ROUPAS = ['#a17848', '#7a5c3c', '#5a6e96', '#963c32', '#cdc0a0', '#466e46', '#734673', '#b48c3c', '#2e8c86', '#f2f2f8'];
  function escurece(hex, k) { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
  // aparência: {p:pele, c:cabelo, r:roupa, f:faixa, b:barba, v:véu, l:cabelo longo}
  function aparenciaPadrao(id) { const h = hash(id) >>> 0; return { p: h % 5, c: (h >> 3) % 5, r: (h >> 6) % 9, f: (h >> 9) % 9, b: (h >> 12) % 3 === 0 ? 1 : 0, v: (h >> 14) % 5 === 0 ? 1 : 0, l: (h >> 16) % 3 === 0 ? 1 : 0 }; }
  function pessoa(c, x, y, id, t, anda, ap) {
    const a = Object.assign(aparenciaPadrao(id), ap || {});
    const m = (v, n) => ((Math.abs(Math.round(+v || 0)) % n) + n) % n;
    const pele = PELES[m(a.p, 5)], cab = CABELOS[m(a.c, 6)], roupa = ROUPAS[m(a.r, 10)], faixa = ROUPAS[m(a.f, 10)];
    const p = anda ? Math.abs(Math.floor(t * 4 + (hash(id) % 7))) % 2 : 0;
    x = Math.round(x); y = Math.round(y);
    c.globalAlpha *= .35; R(c, x - 4, y, 8, 1, '#000'); c.globalAlpha /= .35;
    R(c, x - 2, y - 2, 2, 2 - p, escurece(pele, .8)); R(c, x + 1, y - 2, 2, 1 + p, escurece(pele, .8));
    R(c, x - 4, y - 8, 8, 6, roupa); R(c, x + 2, y - 8, 2, 6, escurece(roupa, .72)); R(c, x - 4, y - 8, 1, 5, escurece(roupa, 1.15));
    R(c, x - 4, y - 5, 8, 1, faixa);
    R(c, x - 5, y - 7, 1, 3, roupa); R(c, x + 4, y - 7, 1, 3, escurece(roupa, .72)); R(c, x - 5, y - 4, 1, 1, pele); R(c, x + 4, y - 4, 1, 1, pele);
    R(c, x - 3, y - 13, 6, 5, pele); R(c, x + 2, y - 12, 1, 4, escurece(pele, .85));
    R(c, x - 2, y - 11, 1, 1, '#2a1a10'); R(c, x + 1, y - 11, 1, 1, '#2a1a10');
    if (a.v) { R(c, x - 4, y - 15, 8, 2, faixa); R(c, x - 4, y - 13, 1, 6, faixa); R(c, x + 3, y - 13, 1, 6, escurece(faixa, .8)); }
    else { R(c, x - 3, y - 15, 6, 2, cab); R(c, x - 4, y - 14, 1, 3, cab); R(c, x + 3, y - 14, 1, 3, cab); if (a.l) { R(c, x - 4, y - 11, 1, 4, cab); R(c, x + 3, y - 11, 1, 4, cab); } }
    if (a.b) { R(c, x - 3, y - 9, 6, 2, cab); R(c, x - 1, y - 7, 2, 1, cab); }
  }
  function luz(c, x, y, t, fase, forte) {
    const b = .55 + .45 * Math.sin(t * 2.4 + fase);
    if (forte) { c.globalAlpha = .25 + .15 * b; R(c, x - 3, y - 3, 8, 8, '#ffd27a'); c.globalAlpha = 1; }
    c.globalAlpha = forte ? 1 : .4 + .6 * b; R(c, x, y, 2, 2, forte ? '#ffd27a' : '#ffe9a8'); c.globalAlpha = 1;
  }
  function ondas(c, LARG, y0, cores, t, k) {
    cores.forEach((cor, i) => { for (let x = 0; x < LARG; x += 6) { const o = Math.round(Math.sin(t * .8 + x * .05 + i * .8) * (k || 1.5)); R(c, x, y0 + i * 6 + o, 4, 2, cor); } });
  }
  function estrelas(c, LARG, ymax, seed, t) {
    const r = rnd(seed); for (let i = 0; i < LARG / 4; i++) { const x = r() * LARG, y = r() * ymax, b = r(); c.globalAlpha = .3 + .5 * Math.abs(Math.sin(t + b * 9)); R(c, x, y, 1, 1, b > .85 ? '#ffe9a8' : '#6a6f9a'); }
    c.globalAlpha = 1;
  }
  function chao(c, LARG, y, cor1, cor2, seed) {
    R(c, 0, y, LARG, ALT - y, cor1); const r = rnd(seed); for (let i = 0; i < LARG / 3; i++) R(c, r() * LARG, y + 2 + r() * (ALT - y - 3), 2, 1, cor2);
  }
  function arvore(c, x, y, s, cor) {
    s = s || 1; R(c, x - 1, y - 10 * s, 3, 10 * s, '#6e4a24');
    R(c, x - 6 * s, y - 18 * s, 13 * s, 7 * s, cor || '#4f7a2a'); R(c, x - 4 * s, y - 21 * s, 9 * s, 3 * s, cor || '#4f7a2a'); R(c, x - 5 * s, y - 12 * s, 11 * s, 2 * s, '#3b5e1f');
  }
  // mapas de pixels para as formas (episódio 2+)
  const M = {
    camelo: ['11..............', '111.............', '.11......111....', '.11.....11111...', '.11....1111111..', '.1111111111111..', '..111111111111..', '...1.1....1.1...', '...1.1....1.1...'],
    raposa: ['1.1.........', '111.........', '1311.....22.', '.11111112222', '..11111112..', '..1.1..1.1..'],
    tigre: ['11.........', '1311111111.', '.1212121211', '.1111111112', '.1.1...1.1.', '.1.1...1.1.'],
    onca: ['11.........', '1311111111.', '.1212121211', '.1121212112', '.1.1...1.1.', '.1.1...1.1.'],
    cao: ['11.........', '131........', '.1111111..1', '..11111111.', '..1.1..1.1.', '..1.1..1.1.'],
    serpente: ['....11..', '...1311.', '...11...', '..11....', '.11.....', '11..1111', '1111..11'],
    aguia: ['1............1', '11..........11', '.111......111.', '..111.22.111..', '...11122111...', '.....1221.....', '......11......'],
    leao: ['.2222......', '222211111..', '2232111111.', '.22111111.1', '..1.1..1.1.', '..1.1..1.1.'],
    ovelha: ['.22222222..', '2222222222.', '122222222..', '.2.2..2.2..'],
    pomba: ['..11....', '.1311111', '1111111.', '...11...']
  };
  const CORES = {
    camelo: { 1: '#c4965a' }, raposa: { 1: '#dc6e28', 2: '#f5f0e6', 3: '#141414' }, tigre: { 1: '#eb8c28', 2: '#1e140a', 3: '#141414' },
    onca: { 1: '#e1b446', 2: '#3c2814', 3: '#141414' }, cao: { 1: '#cd8c46', 3: '#141414' }, serpente: { 1: '#3caa3c', 3: '#f0dc28' },
    aguia: { 1: '#96643a', 2: '#ece6d7' }, leao: { 1: '#d9a650', 2: '#8a5a24', 3: '#141414' }, ovelha: { 1: '#3a3a3a', 2: '#f2efe6' }, pomba: { 1: '#f4f4f4', 3: '#141414' }
  };
  function mapa(c, m, x, y, cores) { for (let r = 0; r < m.length; r++) for (let k = 0; k < m[r].length; k++) { const cor = cores[m[r][k]]; if (cor) R(c, x + k, y + r, 1, 1, cor); } }
  function chave(forma) {
    const f = (forma || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/camel/.test(f)) return 'camelo'; if (/raposa/.test(f)) return 'raposa'; if (/tigre/.test(f)) return 'tigre';
    if (/onca|jaguar|leopardo/.test(f)) return 'onca'; if (/vira|cao|cachorro|dog/.test(f)) return 'cao'; if (/serpente|cobra/.test(f)) return 'serpente';
    if (/aguia|falcao|gaviao/.test(f)) return 'aguia'; if (/leao|leoa/.test(f)) return 'leao'; if (/ovelha|cordeiro/.test(f)) return 'ovelha'; if (/pomba|passaro|ave/.test(f)) return 'pomba';
    if (/^sol$/.test(f)) return 'sol'; if (/cosmo|galaxia|universo/.test(f)) return 'cosmos'; if (/estrela|luz/.test(f)) return 'estrela';
    return 'gente';
  }
  // desenha a forma do personagem; pés/base em (x, y). Formas do céu usam a própria posição no céu.
  function ser(c, q, t) {
    const k = chave(q.p.forma), x = Math.round(q.x), y = Math.round(q.y);
    if (k === 'sol') { c.globalAlpha = .3; R(c, x - 9, y - 9, 18, 18, '#ffb238'); c.globalAlpha = 1; R(c, x - 6, y - 6, 12, 12, '#ffd25a'); R(c, x - 4, y - 8, 8, 16, '#ffd25a'); R(c, x - 8, y - 4, 16, 8, '#ffd25a'); return; }
    if (k === 'cosmos') { for (let i = 0; i < 60; i++) { const a = i * .3 + t * .5, r = i * .22; c.globalAlpha = 1 - i / 70; R(c, x + Math.cos(a) * r, y + Math.sin(a) * r * .55, 1, 1, ['#9678ff', '#ff8cc8', '#78c8ff', '#ffecb4'][i % 4]); } c.globalAlpha = 1; R(c, x - 1, y - 1, 2, 2, '#fffae6'); return; }
    if (k === 'estrela') { luz(c, x, y, t, q.f, true); return; }
    if (k === 'gente') { pessoa(c, x, y, q.p.id, t, true, q.p.aparencia); return; }
    const m = M[k], dx = Math.round(Math.sin(t * .8 + q.f) * 2);
    mapa(c, m, x - (m[0].length >> 1) + dx, y - m.length, CORES[k]);
  }
  function noCeu(k) { return k === 'sol' || k === 'cosmos' || k === 'estrela'; }

  function tenda(c, x, y, cor) {
    for (let i = 0; i < 9; i++) R(c, x - i, y - 9 + i, i * 2 + 1, 1, cor || '#c9a46a'); R(c, x - 1, y - 4, 3, 4, '#3a2414');
  }

  // ---------- as cenas ----------
  // banda = onde as pessoas ficam [x0, x1, y0, y1]; placas = anúncios {x,y,w,h,txt}
  const CENAS = [
    { id: 'criacao', nome: 'No Princípio', ref: 'Gênesis 1', status: 'feito', larg: 384, banda: [12, 372, 22, 122], tipo: 'luzes',
      voce: 'Você é uma luz com seu nome. No dia certo, vira o que escolheu.',
      texto: 'O vazio, as águas e a primeira luz. Cada seguidor acende uma luz no céu da criação.',
      placas: [],
      fundo(c, t, L) { R(c, 0, 0, L, ALT, '#04050b'); estrelas(c, L, 120, 7, t); ondas(c, L, 138, ['#101a33', '#0e1830', '#0c152b', '#0b1327', '#091023', '#080e1f', '#070c1b', '#060a17', '#050914'], t); } },
    { id: 'eden', cam0: 130, nome: 'O Jardim do Éden', ref: 'Gênesis 1–3', status: 'agora', tipo: 'formas', larg: 512, banda: [20, 492, 150, 184],
      voce: 'As luzes viraram o que escolheram: o sol, o cosmos, os animais, Adão e a serpente. Os 12 pioneiros têm a estrela dourada.',
      texto: 'Episódio 2: a criação, o jardim, a serpente e a expulsão. Próxima meta: 200 seguidores para Caim e Abel.',
      placas: [{ x: 60, y: 118, w: 46, h: 16 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, 110, '#7ec8e3'); R(c, 0, 90, L, 20, '#a8dcef');
        chao(c, L, 110, '#5c9e3a', '#4d8a2f', 3);
        for (let x = 0; x < L; x += 3) R(c, x, 128 + Math.round(Math.sin(x * .04 + t) * 2), 3, 5, '#3f86c4');
        [30, 120, 190, 330, 400, 470].forEach((x, i) => arvore(c, x, 112, 1, i % 2 ? '#4f7a2a' : '#5e8f30'));
        arvore(c, 256, 116, 1.6, '#7aa83c'); R(c, 252, 82, 3, 3, '#ffd27a'); R(c, 262, 86, 3, 3, '#e04a3a');
      } },
    { id: 'enoque', cam0: 130, nome: 'A Cidade de Enoque', ref: 'Gênesis 4', status: 'breve', larg: 576, banda: [20, 556, 150, 186],
      voce: 'Cada pessoa que entra ganha uma casa na primeira cidade.',
      texto: 'Fora do Éden, Caim constrói a primeira cidade e lhe dá o nome do filho: Enoque. Vamos construir juntos.',
      placas: [],
      fundo(c, t, L) {
        for (let y = 0; y < 120; y += 4) { const k = y / 120; R(c, 0, y, L, 4, 'rgb(' + Math.round(220 + 20 * k) + ',' + Math.round(130 + 60 * k) + ',' + Math.round(90 + 40 * k) + ')'); }
        R(c, 470, 40, 22, 22, '#ffe08a');
        chao(c, L, 120, '#c39a64', '#ad8452', 17);
        for (let x = 0; x < L; x += 3) R(c, x, 140 + Math.round(Math.sin(x * .03 + t) * 1.5), 3, 4, '#4f8fc4');
        const casas = [[40, 1], [90, 1], [150, 1], [210, .6], [270, 1], [330, .3], [390, 0], [450, .6], [510, 0]];
        casas.forEach(([x, k], i) => {
          if (k <= 0) { [[-9, -6], [9, -6], [-9, 0], [9, 0]].forEach(([dx, dy]) => R(c, x + dx, 120 + dy - 3, 1, 3, '#7a5a34')); return; }
          const h = Math.round(12 * Math.min(1, k * 1.6));
          R(c, x - 10, 124 - h, 20, h, '#d2b07e'); R(c, x + 4, 124 - h, 6, h, '#b8966a');
          if (k > .6) { c.fillStyle = ['#963c32', '#8c5a32', '#783c46'][i % 3]; c.beginPath(); c.moveTo(x - 12, 124 - h); c.lineTo(x, 116 - h); c.lineTo(x + 12, 124 - h); c.fill(); R(c, x - 2, 117, 4, 7, '#46301a'); R(c, x - 8, 115, 3, 3, '#ffcf70'); }
          else { R(c, x - 11, 104, 1, 20, '#8c6438'); R(c, x + 10, 104, 1, 20, '#8c6438'); R(c, x - 11, 105, 22, 1, '#8c6438'); }
        });
        R(c, 286, 96, 32, 10, '#6e4a26'); R(c, 301, 106, 2, 18, '#6e4a26');
      } },
    { id: 'misterio', cam0: 60, nome: 'Próximas cenas', ref: 'serão reveladas', status: 'breve', larg: 384, banda: [20, 364, 150, 186],
      voce: 'O caminho continua conforme a comunidade cresce.',
      texto: 'As próximas cenas serão reveladas episódio por episódio. Quanto mais gente, mais longe a história vai.',
      placas: [],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#05060d'); estrelas(c, L, 140, 31, t); chao(c, L, 150, '#1a1a2a', '#141424', 9);
        const q = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];
        q.forEach((ln, r) => [...ln].forEach((ch, k) => { if (ch === '#') { c.globalAlpha = .5 + .3 * Math.sin(t * 2); R(c, 180 + k * 5, 50 + r * 5, 5, 5, '#ffd27a'); c.globalAlpha = 1; } }));
      } },
  ];

  // ---------- dados ----------
  async function carregar(demo) {
    if (demo) return demoPessoas();
    const H = { apikey: SB_KEY };
    const [l, f, e] = await Promise.all([
      fetch(SB_URL + '/rest/v1/biblia_luzes?select=id,nome,escolha,plataforma,episodio,status,codigo,aparencia&order=id.asc&limit=20000', { headers: H }).then(r => r.json()),
      fetch(SB_URL + '/rest/v1/biblia_formas?select=luz_id,episodio,forma&order=episodio.asc&limit=50000', { headers: H }).then(r => r.json()),
      fetch(SB_URL + '/rest/v1/biblia_estado?select=*&id=eq.1', { headers: H }).then(r => r.json())
    ]);
    const formas = {}; (f || []).forEach(x => (formas[x.luz_id] = formas[x.luz_id] || []).push(x.forma));
    const pessoas = (l || []).map(p => ({ ...p, pioneiro: p.episodio === 1, forma: (formas[p.id] || []).slice(-1)[0] || p.escolha || 'Luz', trilha: formas[p.id] || ['Luz'], escolha: p.escolha && p.escolha !== 'Luz' ? p.escolha : (formas[p.id] || []).slice(-1)[0] || 'Luz' }));
    return { pessoas, estado: (e && e[0]) || { dia: 1, seguidores: 0, meta: 50 }, demo: false };
  }
  function demoPessoas() {
    const N = ['Ana', 'Lucas', 'Maria', 'João', 'Bia', 'Pedro', 'Davi', 'Rute', 'Sara', 'Tiago', 'Lia', 'Caleb', 'Ester', 'Gabriel', 'Júlia', 'Miguel', 'Raquel', 'Samuel', 'Débora', 'Elias', 'Noemi', 'Paulo', 'Isabel', 'André', 'Talita', 'Rafael', 'Marta', 'Felipe', 'Joana', 'Daniel', 'Priscila', 'Mateus', 'Lídia', 'Josué', 'Rebeca', 'Arthur', 'Helena', 'Enzo', 'Laura', 'Benjamim', 'Alice', 'Heitor', 'Clara', 'Bernardo', 'Vitória', 'Diogo', 'Sofia', 'Levi', 'Eva', 'Natã'];
    const E = ['Estrela', 'Águia', 'Leão', 'Oliveira', 'Pomba', 'Baleia', 'Cedro', 'Ovelha', 'Lírio', 'Camelo', 'Golfinho', 'Girassol', 'Cervo', 'Videira', 'Coruja'];
    const pessoas = N.map((n, i) => { const e = n === 'Diogo' ? 'Águia' : E[hash(i + 3) % E.length]; return { id: i + 1, pioneiro: i < 12, forma: e, nome: n, escolha: e, plataforma: i % 3 ? 'instagram' : 'youtube', episodio: 1, trilha: ['Luz', e] }; });
    return { pessoas, estado: { dia: 2, titulo: 'O Jardim', seguidores: 54, meta: 200 }, demo: true };
  }

  // posições determinísticas de cada pessoa na cena
  function lugares(cena, pessoas) {
    const [x0, x1, y0, y1] = cena.banda, ci = CENAS.indexOf(cena) + 1;
    return pessoas.map(p => { const h = hash(p.id * 31 + ci), h2 = hash(p.id * 77 + ci * 13);
        const q = { p, x: x0 + (h % Math.max(1, x1 - x0)), y: y0 + (h2 % Math.max(1, y1 - y0)), f: (h % 628) / 100 };
        if (cena.tipo === 'formas') { const k = chave(p.forma);
          if (noCeu(k)) { q.x = 40 + (h % (cena.larg - 80)); q.y = 52 + (h2 % 30); if (k === 'sol') { q.x = 380; q.y = 40; } }
          else if (k === 'serpente') { q.x = 264; q.y = 98; }
          else if (/adao/.test((p.forma || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) { q.x = 236; q.y = 160; } }
        return q; })
      .sort((a, b) => a.y - b.y);
  }

  // desenha a cena inteira no contexto (em coordenadas de mundo); devolve as posições
  function desenhar(c, cena, t, pessoas, op) {
    op = op || {};
    const L = cena.larg; cena.fundo(c, t, L);
    if (op.anuncios) (cena.placas || []).forEach(pl => placa(c, pl, t));
    const lug = lugares(cena, pessoas), [bx0, bx1] = cena.banda;
    for (const q of lug) {
      const fixo = op.pos && op.pos[q.p.id];
      if (fixo) { q.x = fixo.x; q.y = fixo.y; }
      else if (cena.tipo !== 'luzes' && op.anda !== false && !(cena.tipo === 'formas' && (q.y < 90 || chave(q.p.forma) === 'serpente'))) {
        // passeio: cada um anda para lá e para cá no seu ritmo
        const amp = 10 + (hash(q.p.id * 5) % 22), vel = .12 + (hash(q.p.id * 9) % 10) / 60;
        q.x = Math.max(bx0, Math.min(bx1, q.x + Math.sin(t * vel + q.f) * amp));
      }
      q.sx = q.x; q.sy = q.y;
    }
    lug.sort((a, b) => a.y - b.y);
    for (const q of lug) {
      const forte = op.foco && q.p.id === op.foco;
      if (q.p.status === 'pendente') c.globalAlpha = .5;
      if (cena.tipo === 'luzes') luz(c, q.x, q.y, t, q.f, forte);
      else if (cena.tipo === 'formas') ser(c, q, t);
      else pessoa(c, q.x, q.y, q.p.id, t, op.anda !== false, q.p.aparencia);
      c.globalAlpha = 1;
    }
    return lug;
  }
  function placa(c, pl, t) {
    if (pl.lenha) { for (let i = 0; i < 4; i++) R(c, pl.x - 4, pl.y + 10 + i * 3, pl.w + 8, 2, i % 2 ? '#7a4a24' : '#8a5a2a'); }
    else { R(c, pl.x + 4, pl.y + pl.h, 2, 10, '#5e3a1c'); R(c, pl.x + pl.w - 6, pl.y + pl.h, 2, 10, '#5e3a1c'); }
    R(c, pl.x - 1, pl.y - 1, pl.w + 2, pl.h + 2, '#3a2414'); R(c, pl.x, pl.y, pl.w, pl.h, '#e8d3a0');
    const b = .5 + .5 * Math.sin(t * 3); c.globalAlpha = .25 * b; R(c, pl.x, pl.y, pl.w, pl.h, '#ffb238'); c.globalAlpha = 1;
  }

  G.BRPG = { CENAS, ALT, WA, hash, carregar, lugares, desenhar, pessoa, luz, chave, noCeu, PELES, CABELOS, ROUPAS, aparenciaPadrao, SB_URL, SB_KEY };
})(window);
