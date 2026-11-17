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
  function pessoa(c, x, y, id, t, anda) {
    const h = hash(id), pele = PELE[h % 5], cab = CABELO[(h >> 3) % 5], roupa = ROUPA[(h >> 6) % 8];
    const p = anda ? Math.floor(t * 4 + (h % 7)) % 2 : 0;
    x = Math.round(x); y = Math.round(y);
    R(c, x - 3, y - 13, 6, 2, cab); R(c, x - 3, y - 11, 6, 4, pele);
    R(c, x - 2, y - 10, 1, 1, '#2a1a10'); R(c, x + 1, y - 10, 1, 1, '#2a1a10');
    R(c, x - 4, y - 7, 8, 5, roupa); R(c, x - 4, y - 4, 8, 1, 'rgba(0,0,0,.25)');
    R(c, x - 3, y - 2, 2, 2 - p, '#3a2414'); R(c, x + 1, y - 2, 2, 1 + p, '#3a2414');
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
    if (k === 'gente') { pessoa(c, x, y, q.p.id, t, true); return; }
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
    { id: 'arca', cam0: 190, nome: 'A Arca de Noé', ref: 'Gênesis 6–9', status: 'breve', larg: 576, banda: [120, 300, 158, 186],
      voce: 'Todo mundo que comentou embarca. Seu nome na fila da Arca.',
      texto: 'O céu escurece, a chuva começa e a fila de pessoas e animais sobe a rampa da Arca.',
      placas: [{ x: 330, y: 92, w: 70, h: 18 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#3c4a63'); const r = rnd(4);
        for (let i = 0; i < 120; i++) { const x = (r() * L + t * 20) % L, y = (r() * 160 + t * 120) % 160; R(c, x, y, 1, 3, 'rgba(180,200,230,.45)'); }
        chao(c, L, 150, '#6b5a44', '#5a4a36', 8);
        R(c, 270, 70, 260, 50, '#7a4a24'); R(c, 260, 112, 280, 16, '#5e3a1c'); R(c, 300, 54, 200, 18, '#8a5a2a'); R(c, 380, 44, 60, 12, '#9a6a34');
        for (let x = 270; x < 530; x += 10) R(c, x, 70, 1, 50, '#5e3a1c');
        R(c, 290, 96, 18, 24, '#2a1a0e'); for (let i = 0; i < 26; i++) R(c, 262 - i, 120 + i * 1.2, 30, 2, '#6e4a24');
      } },
    { id: 'babel', cam0: 130, nome: 'A Torre de Babel', ref: 'Gênesis 11', status: 'breve', larg: 512, banda: [20, 492, 160, 186],
      voce: 'Você carrega tijolos com todo mundo, com seu nome na cabeça.',
      texto: 'Todos com uma só língua, construindo uma torre até o céu.',
      placas: [{ x: 360, y: 134, w: 52, h: 16 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#f0c27a'); R(c, 0, 0, L, 60, '#f6d9a0'); chao(c, L, 150, '#d8a960', '#c7954d', 5);
        for (let i = 0; i < 8; i++) { const w = 150 - i * 16, x = 256 - w / 2, y = 150 - (i + 1) * 15; R(c, x, y, w, 15, i % 2 ? '#b07a44' : '#c08a50'); for (let k = x + 4; k < x + w; k += 10) R(c, k, y + 4, 4, 5, '#3a2414'); }
        R(c, 340, 40, 2, 110, '#6e4a24'); R(c, 340, 70, 30, 2, '#6e4a24'); R(c, 362, 140, 14, 10, '#9a5a2a');
      } },
    { id: 'moria', cam0: 190, nome: 'O Monte Moriá', ref: 'Gênesis 22', status: 'breve', larg: 448, banda: [150, 290, 168, 188],
      voce: 'Você sobe o monte com Abraão e Isaque, no meio do povo.',
      texto: 'Abraão sobe o monte. Isaque leva a lenha nas costas. Deus proverá.',
      placas: [{ x: 300, y: 112, w: 40, h: 12, lenha: true }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#e8b48a'); R(c, 0, 0, L, 70, '#f3cfa8');
        for (let x = 0; x < L; x++) { const h = 150 - Math.max(0, 70 - Math.abs(x - 320) * .55); R(c, x, h, 1, ALT - h, '#9a7a56'); }
        chao(c, L, 170, '#8a6a46', '#7a5a38', 9);
        R(c, 306, 84, 26, 10, '#8a8478'); R(c, 304, 80, 30, 4, '#9a9488');
        pessoa(c, 290, 168, 11, t, false); pessoa(c, 276, 170, 13, t, false);
      } },
    { id: 'egito', cam0: 140, nome: 'José no Egito', ref: 'Gênesis 41', status: 'breve', larg: 512, banda: [20, 492, 162, 188],
      voce: 'Você chega ao Egito em tempo de fome e José dá o pão.',
      texto: 'Os celeiros cheios, as pirâmides ao fundo e o povo chegando ao Egito.',
      placas: [{ x: 210, y: 128, w: 54, h: 16 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#f7d18a'); chao(c, L, 152, '#e2b56a', '#d0a35a', 6);
        [[120, 70], [210, 52], [400, 64]].forEach(([x, h]) => { for (let i = 0; i < h; i++) R(c, x - h + i, 152 - i, (h - i) * 2, 1, i % 6 ? '#d9a95c' : '#c99a4f'); });
        [300, 340].forEach(x => { R(c, x, 120, 30, 32, '#b78a50'); R(c, x + 3, 112, 24, 8, '#c99a5c'); R(c, x + 11, 136, 8, 16, '#3a2414'); });
      } },
    { id: 'marvermelho', cam0: 190, nome: 'O Mar Vermelho', ref: 'Êxodo 14', status: 'breve', larg: 640, banda: [20, 620, 150, 186],
      voce: 'Você atravessa o mar a pé enxuto, com o povo inteiro.',
      texto: 'As águas se abrem em duas muralhas e o povo atravessa no meio do mar.',
      placas: [{ x: 560, y: 120, w: 52, h: 16 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#1d2a4a'); estrelas(c, L, 60, 12, t);
        for (let x = 0; x < L; x += 2) { const s = Math.sin(x * .05 + t * 2) * 3; R(c, x, 40 + s, 2, 100, x % 8 ? '#1e5aa0' : '#2a6ab4'); }
        R(c, 0, 140, L, 52, '#c9a46a'); chao(c, L, 146, '#c9a46a', '#b8935a', 12);
        for (let x = 0; x < L; x += 5) R(c, x, 136 + Math.round(Math.sin(x * .1 + t * 3)), 4, 2, '#cfe6ff');
      } },
    { id: 'deserto', cam0: 200, nome: 'O Povo no Deserto', ref: 'Êxodo 16', status: 'breve', larg: 640, banda: [20, 620, 150, 188],
      voce: 'Você caminha no deserto com o povo, com seu nome sobre a cabeça.',
      texto: 'Tendas, a coluna de fogo à noite e o maná caindo do céu. A grande caminhada.',
      placas: [{ x: 120, y: 120, w: 52, h: 16 }, { x: 470, y: 120, w: 52, h: 16 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#1a1630'); estrelas(c, L, 110, 21, t); chao(c, L, 140, '#c9965a', '#b5834a', 14);
        for (let x = 0; x < L; x += 2) R(c, x, 134 + Math.round(Math.sin(x * .02) * 4), 2, 8, '#b5834a');
        [60, 200, 260, 420, 560].forEach((x, i) => tenda(c, x, 140, i % 2 ? '#d6b07a' : '#c49a62'));
        const fx = 330; for (let i = 0; i < 40; i++) { const w = 8 + Math.sin(t * 6 + i) * 3; R(c, fx - w / 2, 100 - i * 2, w, 2, i % 3 ? '#ff9d2e' : '#ffd27a'); }
        const r = rnd(5); for (let i = 0; i < 40; i++) R(c, r() * L, (r() * 120 + t * 15) % 130, 1, 1, '#fff6d8');
      } },
    { id: 'jerico', cam0: 130, nome: 'Os Muros de Jericó', ref: 'Josué 6', status: 'breve', larg: 512, banda: [20, 492, 166, 188],
      voce: 'Você marcha em volta dos muros até eles caírem.',
      texto: 'Sete voltas, as trombetas tocam, o povo grita e os muros caem.',
      placas: [{ x: 60, y: 126, w: 52, h: 16 }],
      fundo(c, t, L) {
        R(c, 0, 0, L, ALT, '#9ec9e8'); chao(c, L, 156, '#d2b07a', '#bf9c66', 15);
        R(c, 170, 80, 180, 76, '#b88a5a'); for (let x = 170; x < 350; x += 12) R(c, x, 72, 8, 8, '#b88a5a');
        for (let y = 86; y < 156; y += 8) for (let x = 172 + (y % 16 ? 6 : 0); x < 348; x += 12) R(c, x, y, 10, 1, '#9a6e44');
        R(c, 248, 120, 24, 36, '#5a3a1c');
      } },
  ];

  // ---------- dados ----------
  async function carregar(demo) {
    if (demo) return demoPessoas();
    const H = { apikey: SB_KEY };
    const [l, f, e] = await Promise.all([
      fetch(SB_URL + '/rest/v1/biblia_luzes?select=id,nome,escolha,plataforma,episodio&order=id.asc&limit=20000', { headers: H }).then(r => r.json()),
      fetch(SB_URL + '/rest/v1/biblia_formas?select=luz_id,episodio,forma&order=episodio.asc&limit=50000', { headers: H }).then(r => r.json()),
      fetch(SB_URL + '/rest/v1/biblia_estado?select=*&id=eq.1', { headers: H }).then(r => r.json())
    ]);
    const formas = {}; (f || []).forEach(x => (formas[x.luz_id] = formas[x.luz_id] || []).push(x.forma));
    const pessoas = (l || []).map(p => ({ ...p, pioneiro: p.episodio === 1, forma: (formas[p.id] || []).slice(-1)[0] || 'Luz', trilha: formas[p.id] || ['Luz'], escolha: p.escolha && p.escolha !== 'Luz' ? p.escolha : (formas[p.id] || []).slice(-1)[0] || 'Luz' }));
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
          if (noCeu(k)) { q.x = 40 + (h % (cena.larg - 80)); q.y = 16 + (h2 % 50); if (k === 'sol') { q.x = 380; q.y = 26; } }
          else if (k === 'serpente') { q.x = 264; q.y = 98; }
          else if (/adao/.test((p.forma || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) { q.x = 236; q.y = 160; } }
        return q; })
      .sort((a, b) => a.y - b.y);
  }

  // desenha a cena inteira no contexto (em coordenadas de mundo); devolve as posições
  function desenhar(c, cena, t, pessoas, op) {
    op = op || {};
    const L = cena.larg; cena.fundo(c, t, L);
    (cena.placas || []).forEach(pl => placa(c, pl, t));
    const lug = lugares(cena, pessoas);
    for (const q of lug) {
      const forte = op.foco && q.p.id === op.foco;
      if (cena.tipo === 'luzes') luz(c, q.x, q.y, t, q.f, forte);
      else if (cena.tipo === 'formas') ser(c, q, t);
      else { pessoa(c, q.x + Math.sin(t * .6 + q.f) * (op.anda === false ? 0 : 2), q.y, q.p.id, t, op.anda !== false); }
    }
    return lug;
  }
  function placa(c, pl, t) {
    if (pl.lenha) { for (let i = 0; i < 4; i++) R(c, pl.x - 4, pl.y + 10 + i * 3, pl.w + 8, 2, i % 2 ? '#7a4a24' : '#8a5a2a'); }
    else { R(c, pl.x + 4, pl.y + pl.h, 2, 10, '#5e3a1c'); R(c, pl.x + pl.w - 6, pl.y + pl.h, 2, 10, '#5e3a1c'); }
    R(c, pl.x - 1, pl.y - 1, pl.w + 2, pl.h + 2, '#3a2414'); R(c, pl.x, pl.y, pl.w, pl.h, '#e8d3a0');
    const b = .5 + .5 * Math.sin(t * 3); c.globalAlpha = .25 * b; R(c, pl.x, pl.y, pl.w, pl.h, '#ffb238'); c.globalAlpha = 1;
  }

  G.BRPG = { CENAS, ALT, WA, hash, carregar, lugares, desenhar, pessoa, luz, chave };
})(window);
