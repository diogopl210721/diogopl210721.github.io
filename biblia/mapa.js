/* Bíblia RPG — o mapa único do mundo bíblico (visto de cima).
   O Éden no centro; as regiões futuras em volta, cobertas de névoa até a comunidade chegar lá. */
(function (G) {
  const MW = 1600, MH = 1200;
  const { hash, rnd } = G.BRPG;
  function R(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(Math.round(x), Math.round(y), w, h); }

  // status: agora (aberto), proxima (aparece meio apagada), breve (névoa)
  const LUGARES = [
    { id: 'eden', nome: 'O Jardim do Éden', ref: 'Gênesis 2–3', x: 800, y: 600, r: 150, status: 'agora',
      texto: 'O jardim com os quatro rios. Depois da queda, querubins com uma espada flamejante guardam a porta do oriente.' },
    { id: 'acampamento', nome: 'Fora do Éden', ref: 'Gênesis 3:23', x: 985, y: 610, r: 70, status: 'agora',
      texto: 'Quem saiu do jardim acampa aqui, a leste. É daqui que a primeira cidade vai nascer.' },
    { id: 'enoque', nome: 'Cidade de Enoque', ref: 'Gênesis 4:17', x: 1140, y: 640, r: 95, status: 'proxima',
      texto: 'A primeira cidade, construída por Caim. Cada pessoa que entra ganha uma casa. Abre no Ep. 3.' },
    { id: 'ararat', nome: 'Montes Ararate', ref: 'Gênesis 8:4', x: 1150, y: 230, r: 120, status: 'breve',
      texto: 'Onde a arca de Noé repousou depois do dilúvio.' },
    { id: 'babel', nome: 'Babel', ref: 'Gênesis 11', x: 1390, y: 640, r: 90, status: 'breve',
      texto: 'A torre que queria chegar ao céu, e as línguas confundidas.' },
    { id: 'ur', nome: 'Ur dos Caldeus', ref: 'Gênesis 11:31', x: 1430, y: 960, r: 80, status: 'breve',
      texto: 'A cidade de onde Abraão foi chamado.' },
    { id: 'canaa', nome: 'Canaã', ref: 'Gênesis 12', x: 500, y: 560, r: 120, status: 'breve',
      texto: 'A terra prometida a Abraão.' },
    { id: 'jerico', nome: 'Jericó', ref: 'Josué 6', x: 575, y: 655, r: 45, status: 'breve',
      texto: 'Os muros que caíram depois de sete voltas.' },
    { id: 'gilgal', nome: 'Gilgal', ref: 'Josué 4:20', x: 625, y: 610, r: 35, status: 'breve',
      texto: 'As doze pedras tiradas do Jordão.' },
    { id: 'jerusalem', nome: 'Jerusalém', ref: '2 Samuel 5', x: 470, y: 700, r: 60, status: 'breve',
      texto: 'A cidade de Davi e o monte Moriá.' },
    { id: 'belem', nome: 'Belém', ref: 'Lucas 2', x: 455, y: 790, r: 40, status: 'breve',
      texto: 'Onde Jesus nasceu.' },
    { id: 'galileia', nome: 'Galileia', ref: 'Mateus 4', x: 560, y: 340, r: 110, status: 'breve',
      texto: 'O mar da Galileia, Cafarnaum e Nazaré.' },
    { id: 'nazare', nome: 'Nazaré', ref: 'Lucas 4', x: 495, y: 370, r: 35, status: 'breve', texto: 'Onde Jesus cresceu.' },
    { id: 'cafarnaum', nome: 'Cafarnaum', ref: 'Marcos 2', x: 650, y: 315, r: 35, status: 'breve', texto: 'A cidade de Pedro, à beira do mar.' },
    { id: 'egito', nome: 'Egito', ref: 'Gênesis 41 · Êxodo', x: 220, y: 960, r: 150, status: 'breve',
      texto: 'O rio Nilo, as pirâmides, José governador e o povo escravo.' },
    { id: 'marvermelho', nome: 'Mar Vermelho', ref: 'Êxodo 14', x: 450, y: 1050, r: 90, status: 'breve',
      texto: 'O mar que se abriu.' },
    { id: 'sinai', nome: 'Monte Sinai', ref: 'Êxodo 19', x: 640, y: 1010, r: 100, status: 'breve',
      texto: 'O deserto, o maná e as tábuas da lei.' },
  ];
  const L = Object.fromEntries(LUGARES.map(l => [l.id, l]));

  // ---------- terreno ----------
  function costaMed(y) { return 300 + Math.sin(y * .008) * 40 + Math.sin(y * .021) * 12; }
  function montar() {
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH; const c = cv.getContext('2d');
    const r = rnd(42);
    // areia de base
    R(c, 0, 0, MW, MH, '#d4b07a');
    for (let i = 0; i < 9000; i++) R(c, r() * MW, r() * MH, 2, 1, r() < .5 ? '#c9a46e' : '#dcbc88');
    // manchas verdes: Crescente Fértil, Canaã, Galileia, Nilo, Éden
    const verde = (x, y, rx, ry, cor, dens) => { for (let i = 0; i < dens; i++) { const a = r() * 6.28, d = Math.sqrt(r()); R(c, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, 3, 2, cor); } };
    verde(540, 450, 170, 330, '#a9b06a', 9000); verde(540, 450, 140, 290, '#97a85c', 5000);
    verde(1150, 650, 380, 260, '#b9b07a', 7000);
    verde(560, 340, 110, 90, '#86a650', 4000);
    verde(800, 600, 170, 170, '#6fa040', 12000); verde(800, 600, 150, 150, '#5f9636', 9000);
    // Mediterrâneo
    for (let y = 0; y < 900; y++) { const cx = costaMed(y) - (y > 760 ? (y - 760) * 1.2 : 0); R(c, 0, y, cx, 1, '#3c78b4'); R(c, cx - 4, y, 4, 1, '#e8d9a8'); }
    for (let i = 0; i < 1500; i++) { const y = r() * 900, x = r() * (costaMed(y) - 20); R(c, x, y, 4, 1, '#5a92c8'); }
    // Nilo (do sul até o delta)
    for (let y = 860; y < MH; y++) { const x = 230 + Math.sin(y * .02) * 14; R(c, x - 3, y, 7, 1, '#3c78b4'); R(c, x - 14, y, 9, 1, '#7aa04a'); R(c, x + 4, y, 9, 1, '#7aa04a'); }
    for (let k = -1; k <= 1; k++) for (let y = 800; y < 870; y++) { const x = 230 + k * (870 - y) * .5; R(c, x - 2, y, 4, 1, '#3c78b4'); }
    // Mar Vermelho (golfo diagonal)
    for (let y = 860; y < MH; y++) { const x = 380 + (y - 860) * .25 + Math.sin(y * .03) * 6, w = 40 + (y - 860) * .18; R(c, x, y, w, 1, '#4a6fae'); }
    for (let y = 860; y < 1000; y++) { const x = 520 + (y - 860) * .1; R(c, x, y, 16, 1, '#4a6fae'); }
    // Mar da Galileia, Jordão, Mar Morto
    c.fillStyle = '#3c78b4'; c.beginPath(); c.ellipse(615, 330, 26, 36, 0, 0, 6.28); c.fill();
    for (let y = 366; y < 660; y++) { const x = 612 + Math.sin(y * .05) * 6; R(c, x - 2, y, 4, 1, '#3c78b4'); }
    c.fillStyle = '#4c88b8'; c.beginPath(); c.ellipse(612, 720, 22, 62, 0, 0, 6.28); c.fill();
    // os quatro rios do Éden (Gn 2:10): Pisom, Giom, Tigre, Eufrates
    const rio = (pts, larg) => { c.strokeStyle = '#3c78b4'; c.lineWidth = larg; c.lineJoin = 'round'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => c.lineTo(p[0], p[1])); c.stroke(); };
    rio([[800, 600], [880, 520], [1000, 430], [1080, 330], [1120, 150], [1180, 0]], 7);           // Tigre, ao norte
    rio([[800, 600], [900, 700], [1060, 760], [1250, 820], [1400, 900], [1600, 1080]], 8);         // Eufrates, sudeste
    rio([[800, 600], [720, 520], [690, 420], [700, 300], [760, 160]], 5);                          // Pisom
    rio([[800, 600], [760, 720], [720, 840], [700, 940]], 5);                                      // Giom
    rio([[1080, 330], [1300, 520], [1450, 780], [1600, 1000]], 6);                                 // Tigre ao golfo
    // golfo pérsico no canto
    for (let y = 1000; y < MH; y++) R(c, 1600 - (y - 1000) * 1.4, y, (y - 1000) * 1.4, 1, '#3c78b4');
    // montanhas
    const monte = (x, y, s, neve) => { c.fillStyle = '#8c7a62'; c.beginPath(); c.moveTo(x - 40 * s, y); c.lineTo(x, y - 50 * s); c.lineTo(x + 40 * s, y); c.fill();
      c.fillStyle = '#6e5e4a'; c.beginPath(); c.moveTo(x, y - 50 * s); c.lineTo(x + 40 * s, y); c.lineTo(x + 8 * s, y); c.fill();
      if (neve) { c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(x - 12 * s, y - 35 * s); c.lineTo(x, y - 50 * s); c.lineTo(x + 12 * s, y - 35 * s); c.fill(); } };
    monte(1100, 260, 1.4, true); monte(1190, 250, 1.8, true); monte(1250, 280, 1.1, true); monte(1030, 290, .9, false);
    monte(640, 1030, 1.6, false); monte(590, 1050, 1, false); monte(700, 1060, 1.1, false);
    monte(470, 700, .5, false);
    // estradas
    c.strokeStyle = 'rgba(150,115,70,.55)'; c.lineWidth = 3; c.setLineDash([6, 5]);
    [[[985, 610], [1140, 640], [1390, 640], [1430, 960]], [[1140, 640], [1150, 300]], [[700, 600], [575, 655], [470, 700], [455, 790], [450, 1000], [260, 980]],
     [[575, 655], [625, 610], [612, 400], [560, 340], [495, 370]], [[470, 700], [640, 1000]]].forEach(p => { c.beginPath(); c.moveTo(p[0][0], p[0][1]); p.slice(1).forEach(q => c.lineTo(q[0], q[1])); c.stroke(); });
    c.setLineDash([]);

    // ---------- marcos de cada lugar ----------
    const casa = (x, y, cor, teto) => { R(c, x - 6, y - 6, 12, 6, cor || '#d2b07e'); R(c, x + 2, y - 6, 4, 6, '#b8966a'); R(c, x - 7, y - 9, 14, 3, teto || '#963c32'); R(c, x - 1, y - 3, 2, 3, '#46301a'); };
    const muralha = (x, y, w, h) => { c.strokeStyle = '#a08060'; c.lineWidth = 4; c.strokeRect(x - w / 2, y - h / 2, w, h); for (let i = 0; i < w; i += 8) R(c, x - w / 2 + i, y - h / 2 - 4, 4, 3, '#a08060'); };
    const arv = (x, y, s) => { R(c, x - 1, y - 2, 2, 4, '#5a3c1e'); c.fillStyle = '#3f7a2a'; c.beginPath(); c.arc(x, y - 5, 5 * s, 0, 6.28); c.fill(); c.fillStyle = '#5a9a36'; c.beginPath(); c.arc(x - 1, y - 6, 3 * s, 0, 6.28); c.fill(); };
    // Éden: jardim murado com árvores e a árvore da vida no centro
    c.fillStyle = '#4f8f30'; c.beginPath(); c.arc(800, 600, 128, 0, 6.28); c.fill();
    c.strokeStyle = '#3a6a22'; c.lineWidth = 8; c.beginPath(); c.arc(800, 600, 132, .25, 6.03); c.stroke();
    const rr = rnd(7); for (let i = 0; i < 140; i++) { const a = rr() * 6.28, d = 20 + rr() * 100; arv(800 + Math.cos(a) * d, 600 + Math.sin(a) * d, .8 + rr() * .5); }
    for (let i = 0; i < 60; i++) { const a = rr() * 6.28, d = rr() * 110; R(c, 800 + Math.cos(a) * d, 600 + Math.sin(a) * d, 2, 2, ['#e04a3a', '#ffd27a', '#f08ac0', '#ffffff'][i % 4]); }
    c.fillStyle = '#2f6a1e'; c.beginPath(); c.arc(800, 595, 18, 0, 6.28); c.fill(); c.fillStyle = '#4a9a2a'; c.beginPath(); c.arc(796, 590, 11, 0, 6.28); c.fill();
    R(c, 790, 586, 3, 3, '#ffd27a'); R(c, 806, 592, 3, 3, '#e04a3a');
    // acampamento
    [[960, 590], [1000, 640], [1020, 585], [950, 640]].forEach(([x, y]) => { c.fillStyle = '#c49a62'; c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x, y - 12); c.lineTo(x + 10, y); c.fill(); R(c, x - 2, y - 5, 4, 5, '#4a3020'); });
    // Enoque: casas e lotes
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = 1090 + i * 20, y = 610 + j * 20; if ((i + j) % 3 === 0) casa(x, y); else { R(c, x - 6, y - 1, 1, 3, '#7a5a34'); R(c, x + 5, y - 1, 1, 3, '#7a5a34'); } }
    // Ararate + arca
    R(c, 1150, 190, 46, 12, '#6e4a24'); R(c, 1158, 182, 30, 8, '#8c5a2e'); R(c, 1150, 200, 46, 2, '#4a3018');
    // Babel: zigurate
    for (let k = 0; k < 6; k++) R(c, 1370 + k * 4, 650 - k * 8, 40 - k * 8, 8, k % 2 ? '#c09a62' : '#b08a52');
    // Ur
    for (let k = 0; k < 3; k++) R(c, 1415 + k * 5, 970 - k * 8, 30 - k * 10, 8, '#b08a52');
    casa(1395, 985); casa(1455, 980);
    // Jericó e Gilgal
    muralha(575, 655, 34, 26); casa(570, 655); casa(582, 660);
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; R(c, 625 + Math.cos(a) * 12, 610 + Math.sin(a) * 12, 3, 3, '#9a9a9a'); }
    // Jerusalém
    muralha(470, 700, 44, 36); R(c, 462, 688, 16, 10, '#e8d8a0'); casa(460, 708); casa(480, 708);
    // Belém (+ estrela)
    casa(450, 792); casa(462, 788); R(c, 455, 760, 3, 3, '#fff6c0');
    // Galileia: Nazaré, Cafarnaum, barcos
    casa(490, 372); casa(502, 368); casa(645, 318); casa(658, 322); R(c, 610, 330, 8, 3, '#6e4a24'); R(c, 622, 345, 8, 3, '#6e4a24');
    // Egito: pirâmides
    const pir = (x, y, s) => { c.fillStyle = '#e0c080'; c.beginPath(); c.moveTo(x - 20 * s, y); c.lineTo(x, y - 22 * s); c.lineTo(x + 20 * s, y); c.fill(); c.fillStyle = '#c4a060'; c.beginPath(); c.moveTo(x, y - 22 * s); c.lineTo(x + 20 * s, y); c.lineTo(x + 4 * s, y); c.fill(); };
    pir(160, 980, 1.3); pir(195, 1000, 1); pir(130, 1010, .8); casa(270, 940); casa(285, 950);
    return cv;
  }

  // névoa: as regiões que ainda não abriram ficam apagadas
  function nevoa() {
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(10,12,26,.62)'; c.fillRect(0, 0, MW, MH);
    c.globalCompositeOperation = 'destination-out';
    const furo = (x, y, rad, forca) => { const g = c.createRadialGradient(x, y, rad * .55, x, y, rad); g.addColorStop(0, 'rgba(0,0,0,' + forca + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 6.28); c.fill(); };
    LUGARES.forEach(l => { if (l.status === 'agora') furo(l.x, l.y, l.r * 1.35, 1); else if (l.status === 'proxima') furo(l.x, l.y, l.r * 1.3, .55); });
    return cv;
  }

  // ---------- onde cada pessoa fica ----------
  function zona(p, k) {
    if (p.status === 'pendente') return 'portao';
    if (k === 'sol' || k === 'cosmos') return k;
    if (/querub/i.test(p.forma || '')) return 'querubim';
    if (k === 'serpente') return 'arvore';
    if (['camelo', 'raposa', 'tigre', 'onca', 'cao', 'aguia', 'leao', 'ovelha', 'pomba'].includes(k)) return 'jardim';
    return 'acampamento';
  }
  function posicionar(pessoas) {
    const ch = G.BRPG.chave, out = [];
    const cont = {};
    pessoas.forEach(p => {
      const k = ch(p.forma), z = zona(p, k), h = hash(p.id * 31 + 7), h2 = hash(p.id * 77 + 3), n = (cont[z] = (cont[z] || 0) + 1) - 1;
      let x, y, anda = true;
      if (z === 'sol') { x = 800; y = 440; anda = false; }
      else if (z === 'cosmos') { x = 720; y = 470; anda = false; }
      else if (z === 'querubim') { x = 930; y = 585 + n * 26; anda = false; }
      else if (z === 'arvore') { x = 812; y = 600; anda = false; }
      else if (z === 'jardim') { const a = (h % 628) / 100, d = 40 + (h2 % 70); x = 800 + Math.cos(a) * d; y = 600 + Math.sin(a) * d * .9; }
      else if (z === 'portao') { x = 1065 + (n % 6) * 9; y = 700 + Math.floor(n / 6) * 12; }
      else { const a = (h % 628) / 100, d = 10 + (h2 % 55); x = 985 + Math.cos(a) * d; y = 615 + Math.sin(a) * d * .7; }
      out.push({ p, k, z, x, y, bx: x, by: y, f: (h % 628) / 100, anda });
    });
    return out;
  }

  function lugarEm(x, y) {
    let best = null, d = 1e9;
    LUGARES.forEach(l => { const dd = Math.hypot(l.x - x, l.y - y) / l.r; if (dd < d) { d = dd; best = l; } });
    return d < 1.3 ? best : null;
  }

  G.BRPG_MAPA = { MW, MH, LUGARES, L, montar, nevoa, posicionar, lugarEm };
})(window);
