/* Bíblia RPG — o mapa único do mundo bíblico (visto de cima), com as cidades nas posições reais.
   Israel em destaque no centro; Egito e Sinai ao sul; Mesopotâmia (Éden, Babel, Ur) a leste.
   Tudo fica na névoa até a comunidade chegar lá. */
(function (G) {
  const MW = 2000, MH = 2360;
  const { hash, rnd } = G.BRPG;
  function R(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(Math.round(x), Math.round(y), w, h); }
  // projeção: Israel ampliado; oeste e sul comprimidos
  function px(lon) { return lon >= 34.2 ? 330 + (lon - 34.2) * 420 : 330 + (lon - 34.2) * 160; }
  function py(lat) { return lat >= 30.5 ? 160 + (33.7 - lat) * 500 : 1760 + (30.5 - lat) * 230; }

  // [id, nome, lat, lon, ref, texto, tipo]  tipo: c=cidade, m=monte, e=especial
  const CID = [
    ['sidom', 'Sidom', 33.56, 35.37, 'Gênesis 10:19', 'Cidade fenícia do litoral.', 'c'],
    ['tiro', 'Tiro', 33.27, 35.20, 'Ezequiel 27', 'O grande porto dos fenícios.', 'c'],
    ['hermom', 'Monte Hermom', 33.42, 35.86, 'Salmo 133', 'O monte coberto de neve no norte.', 'm'],
    ['da', 'Dã', 33.25, 35.65, 'Juízes 18', 'A cidade mais ao norte: "de Dã a Berseba".', 'c'],
    ['cesareiafilipe', 'Cesareia de Filipe', 33.30, 35.72, 'Mateus 16', '"Tu és o Cristo, o Filho do Deus vivo."', 'c'],
    ['hazor', 'Hazor', 33.02, 35.57, 'Josué 11', 'A grande cidade cananeia do norte.', 'c'],
    ['cafarnaum', 'Cafarnaum', 32.88, 35.57, 'Marcos 2', 'A casa de Pedro e o centro do ministério de Jesus.', 'c'],
    ['betsaida', 'Betsaida', 32.91, 35.64, 'João 1:44', 'A cidade de Pedro, André e Filipe.', 'c'],
    ['corazim', 'Corazim', 32.92, 35.55, 'Mateus 11:21', 'Cidade da Galileia.', 'c'],
    ['magdala', 'Magdala', 32.83, 35.51, 'Lucas 8:2', 'A cidade de Maria Madalena.', 'c'],
    ['tiberiades', 'Tiberíades', 32.79, 35.53, 'João 6:23', 'À beira do mar da Galileia.', 'c'],
    ['cana', 'Caná', 32.75, 35.34, 'João 2', 'Onde a água virou vinho.', 'c'],
    ['nazare', 'Nazaré', 32.70, 35.30, 'Lucas 4', 'Onde Jesus cresceu.', 'c'],
    ['tabor', 'Monte Tabor', 32.69, 35.39, 'Juízes 4', 'O monte de Débora e Baraque.', 'm'],
    ['naim', 'Naim', 32.63, 35.35, 'Lucas 7', 'O filho da viúva ressuscitou.', 'c'],
    ['carmelo', 'Monte Carmelo', 32.73, 35.05, '1 Reis 18', 'Elias e o fogo do céu.', 'm'],
    ['megido', 'Megido', 32.58, 35.18, 'Apocalipse 16:16', 'Armagedom.', 'c'],
    ['jezreel', 'Jezreel', 32.56, 35.33, '1 Reis 21', 'A vinha de Nabote.', 'c'],
    ['betsea', 'Bete-Seã', 32.50, 35.50, '1 Samuel 31', 'Onde Saul caiu.', 'c'],
    ['gadara', 'Gadara', 32.65, 35.68, 'Mateus 8:28', 'Os porcos que se lançaram no mar.', 'c'],
    ['cesareia', 'Cesareia', 32.50, 34.89, 'Atos 10', 'Pedro e Cornélio.', 'c'],
    ['dor', 'Dor', 32.62, 34.92, 'Josué 12', 'Porto na costa.', 'c'],
    ['samaria', 'Samaria', 32.28, 35.20, '1 Reis 16', 'A capital do reino do norte.', 'c'],
    ['siquem', 'Siquém', 32.21, 35.28, 'Gênesis 12:6', 'O primeiro altar de Abraão em Canaã; o poço de Jacó.', 'c'],
    ['silo', 'Siló', 32.06, 35.29, '1 Samuel 1', 'O tabernáculo; Ana e Samuel.', 'c'],
    ['betel', 'Betel', 31.93, 35.22, 'Gênesis 28', 'A escada de Jacó.', 'c'],
    ['ai', 'Ai', 31.92, 35.27, 'Josué 8', 'A segunda cidade conquistada.', 'c'],
    ['jope', 'Jope', 32.05, 34.75, 'Jonas 1 · Atos 9', 'Jonas fugiu daqui; Pedro ressuscitou Dorcas.', 'c'],
    ['lida', 'Lida', 31.95, 34.89, 'Atos 9:32', 'Pedro curou Eneias.', 'c'],
    ['emaus', 'Emaús', 31.84, 34.99, 'Lucas 24', 'O caminho de Emaús.', 'c'],
    ['gibeom', 'Gibeom', 31.85, 35.18, 'Josué 10', 'O sol parou.', 'c'],
    ['jerico', 'Jericó', 31.87, 35.44, 'Josué 6', 'Os muros que caíram; Zaqueu.', 'e'],
    ['gilgal', 'Gilgal', 31.85, 35.50, 'Josué 4:20', 'As doze pedras tiradas do Jordão.', 'e'],
    ['betabara', 'Betânia além do Jordão', 31.84, 35.56, 'João 1:28', 'Onde João batizava.', 'c'],
    ['betania', 'Betânia', 31.77, 35.26, 'João 11', 'Lázaro, Marta e Maria.', 'c'],
    ['jerusalem', 'Jerusalém', 31.78, 35.23, '2 Samuel 5', 'A cidade de Davi, o monte Moriá e o templo.', 'e'],
    ['belem', 'Belém', 31.70, 35.20, 'Lucas 2', 'Onde Jesus nasceu; a cidade de Davi.', 'e'],
    ['qumran', 'Qumran', 31.74, 35.46, '—', 'À beira do mar Morto.', 'c'],
    ['nebo', 'Monte Nebo', 31.77, 35.73, 'Deuteronômio 34', 'Moisés viu a terra prometida.', 'm'],
    ['raba', 'Rabá (Amom)', 31.95, 35.93, '2 Samuel 11', 'A capital dos amonitas.', 'c'],
    ['gerasa', 'Gerasa', 32.28, 35.89, 'Marcos 5', 'Cidade de Decápolis.', 'c'],
    ['ramote', 'Ramote-Gileade', 32.55, 36.00, '1 Reis 22', 'Cidade de refúgio em Gileade.', 'c'],
    ['hebrom', 'Hebrom', 31.53, 35.10, 'Gênesis 23', 'Abraão, Isaque e Jacó sepultados; Davi rei.', 'c'],
    ['engedi', 'En-Gedi', 31.46, 35.39, '1 Samuel 24', 'Davi poupou Saul.', 'c'],
    ['massada', 'Massada', 31.31, 35.35, '—', 'A fortaleza sobre o mar Morto.', 'c'],
    ['sodoma', 'Sodoma', 31.05, 35.42, 'Gênesis 19', 'Fogo e enxofre; a mulher de Ló.', 'c'],
    ['asdode', 'Asdode', 31.80, 34.65, '1 Samuel 5', 'A arca no templo de Dagom.', 'c'],
    ['ecrom', 'Ecrom', 31.78, 34.85, '1 Samuel 5:10', 'Cidade filisteia.', 'c'],
    ['gate', 'Gate', 31.70, 34.85, '1 Samuel 17', 'A cidade de Golias.', 'c'],
    ['asquelom', 'Asquelom', 31.67, 34.57, 'Juízes 14', 'Sansão e os filisteus.', 'c'],
    ['laquis', 'Laquis', 31.56, 34.85, '2 Reis 18', 'Cercada pelos assírios.', 'c'],
    ['gaza', 'Gaza', 31.50, 34.47, 'Juízes 16', 'Sansão derruba o templo.', 'c'],
    ['berseba', 'Berseba', 31.24, 34.79, 'Gênesis 21', 'O poço de Abraão; "de Dã a Berseba".', 'c'],
    ['arade', 'Arade', 31.28, 35.13, 'Números 21', 'No Neguebe.', 'c'],
    ['cades', 'Cades-Barneia', 30.65, 34.42, 'Números 13', 'Os doze espias.', 'c'],
    ['damasco', 'Damasco', 33.51, 36.30, 'Atos 9', 'Paulo no caminho de Damasco.', 'c'],
    ['eziongeber', 'Eziom-Geber', 29.55, 34.97, '1 Reis 9:26', 'Os navios de Salomão.', 'c'],
    ['petra', 'Sela (Petra)', 30.33, 35.44, '2 Reis 14:7', 'Em Edom.', 'c'],
  ];

  // lugares fora da escala de Israel (posição esquemática em px)
  const EXTRA = [
    ['eden', 'O Jardim do Éden', 1560, 1000, 150, 'Gênesis 2–3', 'O jardim com os quatro rios. Depois da queda, querubins com uma espada flamejante guardam a porta do oriente.', 'agora'],
    ['acampamento', 'Fora do Éden', 1745, 1010, 70, 'Gênesis 3:23', 'Quem saiu do jardim acampa aqui, a leste. É daqui que a primeira cidade vai nascer.', 'agora'],
    ['enoque', 'Cidade de Enoque', 1880, 1110, 85, 'Gênesis 4:17', 'A primeira cidade, construída por Caim. Cada pessoa que entra ganha uma casa. Abre no Ep. 3.', 'proxima'],
    ['ararat', 'Montes Ararate', 1720, 190, 110, 'Gênesis 8:4', 'Onde a arca de Noé repousou depois do dilúvio.', 'breve'],
    ['hara', 'Harã', 1430, 340, 50, 'Gênesis 12:4', 'De onde Abraão partiu para Canaã.', 'breve'],
    ['ninive', 'Nínive', 1760, 520, 60, 'Jonas 3', 'A grande cidade que se arrependeu.', 'breve'],
    ['babel', 'Babel', 1650, 1380, 80, 'Gênesis 11', 'A torre que queria chegar ao céu, e as línguas confundidas.', 'breve'],
    ['ur', 'Ur dos Caldeus', 1820, 1730, 70, 'Gênesis 11:31', 'A cidade de onde Abraão foi chamado.', 'breve'],
    ['egito', 'Egito', 130, 1700, 140, 'Gênesis 41 · Êxodo 1', 'O Nilo, as pirâmides, José governador e o povo escravo.', 'breve'],
    ['gosen', 'Gósen', 210, 1560, 60, 'Gênesis 47', 'Onde Israel morou no Egito.', 'breve'],
    ['marvermelho', 'Mar Vermelho', 250, 1960, 80, 'Êxodo 14', 'O mar que se abriu.', 'breve'],
    ['sinai', 'Monte Sinai', 430, 2200, 90, 'Êxodo 19', 'O maná, o deserto e as tábuas da lei.', 'breve'],
  ];

  const LUGARES = [];
  EXTRA.forEach(([id, nome, x, y, r, ref, texto, status]) => LUGARES.push({ id, nome, x, y, r, ref, texto, status, grande: true }));
  const IMPORTANTES = ['jerusalem', 'belem', 'nazare', 'cafarnaum', 'jerico', 'damasco', 'samaria', 'hebrom', 'berseba', 'gaza', 'tiro', 'betel', 'siquem', 'sodoma'];
  CID.forEach(([id, nome, lat, lon, ref, texto, tipo]) => LUGARES.push({ id, nome, x: px(lon), y: py(lat), r: 26, ref, texto, status: 'breve', tipo, importante: IMPORTANTES.includes(id) }));
  const L = Object.fromEntries(LUGARES.map(l => [l.id, l]));

  // regiões (só rótulo grande, quando o mapa está afastado)
  const REGIOES = [['FENÍCIA', 33.45, 35.05], ['GALILEIA', 32.85, 35.35], ['SAMARIA', 32.2, 35.1], ['JUDEIA', 31.45, 35.2], ['FILÍSTIA', 31.75, 34.5],
    ['GILEADE', 32.3, 35.75], ['MOABE', 31.4, 35.75], ['EDOM', 30.6, 35.5], ['NEGUEBE', 30.9, 34.85], ['ARÃ', 33.2, 36.45]]
    .map(([n, lat, lon]) => ({ n, x: px(lon), y: py(lat) }))
    .concat([{ n: 'MESOPOTÂMIA', x: 1600, y: 700 }, { n: 'SINAI', x: 420, y: 2000 }, { n: 'DESERTO DA ARÁBIA', x: 1250, y: 1300 }, { n: 'MAR GRANDE', x: 200, y: 700 }]);

  // ---------- terreno ----------
  const COSTA = [[34.5, 35.95], [33.9, 35.48], [33.56, 35.37], [33.27, 35.19], [33.0, 35.1], [32.83, 35.0], [32.7, 34.95], [32.5, 34.88], [32.08, 34.77], [31.8, 34.63], [31.5, 34.45], [31.25, 34.22], [31.1, 33.9], [31.1, 33.0], [31.3, 32.4], [31.4, 31.5], [31.5, 30.5]];
  function costaX(y) { // x da costa do Mediterrâneo para cada y (só no norte)
    for (let i = 0; i < COSTA.length - 1; i++) { const y0 = py(COSTA[i][0]), y1 = py(COSTA[i + 1][0]); if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) { const k = (y - y0) / (y1 - y0); return px(COSTA[i][1]) + (px(COSTA[i + 1][1]) - px(COSTA[i][1])) * k; } }
    return y < py(COSTA[0][0]) ? px(COSTA[0][1]) : -1;
  }
  function montar() {
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH; const c = cv.getContext('2d');
    const r = rnd(42);
    R(c, 0, 0, MW, MH, '#d4b07a');
    for (let i = 0; i < 26000; i++) R(c, r() * MW, r() * MH, 2, 1, r() < .5 ? '#c9a46e' : '#dcbc88');
    const mancha = (x, y, rx, ry, cor, dens) => { for (let i = 0; i < dens; i++) { const a = r() * 6.28, d = Math.sqrt(r()); R(c, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, 3, 2, cor); } };
    // verde: Israel (mais verde no norte), Crescente Fértil, Nilo, Éden
    mancha(px(35.2), py(32.7), 230, 300, '#a6ae68', 16000); mancha(px(35.25), py(32.75), 170, 220, '#93a65a', 9000);
    mancha(px(35.1), py(31.9), 170, 230, '#b9b276', 9000);
    mancha(px(35.8), py(32.3), 120, 220, '#b4ad72', 5000);
    mancha(1560, 900, 330, 600, '#b7b07a', 14000); mancha(1600, 1000, 240, 300, '#a6aa6a', 8000);
    mancha(1560, 1000, 170, 170, '#6fa040', 14000); mancha(1560, 1000, 150, 150, '#5f9636', 10000);
    // Mediterrâneo (norte, até a costa do Egito)
    for (let y = 0; y < py(31.1) + 4; y++) { const cx = costaX(y); if (cx > 0) { R(c, 0, y, cx, 1, '#3c78b4'); R(c, cx - 4, y, 4, 1, '#e8d9a8'); } }
    for (let y = py(31.1); y < py(31.5) + 30; y++) R(c, 0, y, Math.max(0, px(33.9) - (y - py(31.1)) * .5), 1, '#3c78b4');
    for (let i = 0; i < 2500; i++) { const y = r() * py(31.2), x = r() * (costaX(y) - 15); if (x > 0) R(c, x, y, 4, 1, '#5a92c8'); }
    // Nilo e o delta
    const ny0 = py(31.25);
    for (let y = ny0; y < MH; y++) { const x = 70 + Math.sin(y * .012) * 14; R(c, x - 14, y, 9, 1, '#7aa04a'); R(c, x + 5, y, 9, 1, '#7aa04a'); R(c, x - 4, y, 9, 1, '#3c78b4'); }
    for (let k = 0; k < 3; k++) for (let y = ny0 - 40; y < ny0 + 60; y++) { const x = 70 + (k - 1) * (ny0 + 60 - y) * .6; R(c, x - 2, y, 4, 1, '#3c78b4'); }
    // golfos do Mar Vermelho (Suez e Ácaba) e o Mar Vermelho ao sul
    for (let y = py(30.0); y < MH; y++) { const k = (y - py(30.0)) / (MH - py(30.0)); R(c, 180 + k * 160, y, 26 + k * 40, 1, '#4a6fae'); }
    for (let y = py(29.6); y < MH; y++) { const k = (y - py(29.6)) / (MH - py(29.6)); R(c, px(34.95) - k * 70, y, 22 + k * 20, 1, '#4a6fae'); }
    for (let y = MH - 90; y < MH; y++) R(c, 300, y, 260, 1, '#4a6fae');
    // Mar da Galileia, Jordão, Mar Morto
    c.fillStyle = '#3c78b4'; c.beginPath(); c.ellipse(px(35.585), py(32.82), 26, 46, 0, 0, 6.28); c.fill();
    c.beginPath(); c.ellipse(px(35.6), py(33.07), 8, 10, 0, 0, 6.28); c.fill();
    for (let y = py(33.25); y < py(33.07); y++) R(c, px(35.62) + Math.sin(y * .1) * 3 - 2, y, 4, 1, '#3c78b4');
    for (let y = py(32.71); y < py(31.77); y++) { const x = px(35.56) + Math.sin(y * .06) * 7; R(c, x - 2, y, 5, 1, '#3c78b4'); }
    c.fillStyle = '#4c88b8'; c.beginPath(); c.ellipse(px(35.49), py(31.42), 30, 168, 0, 0, 6.28); c.fill();
    // os rios do Éden: Eufrates (Harã e Babel), Tigre (Nínive), Pisom e Giom
    const rio = (pts, larg) => { c.strokeStyle = '#3c78b4'; c.lineWidth = larg; c.lineJoin = 'round'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => c.lineTo(p[0], p[1])); c.stroke(); };
    rio([[1560, 1000], [1480, 820], [1420, 600], [1430, 340], [1560, 220], [1660, 120], [1700, 0]], 8);
    rio([[1560, 1000], [1600, 1200], [1650, 1380], [1760, 1600], [1820, 1730], [1930, 1900], [2000, 1960]], 9);
    rio([[1560, 1000], [1690, 820], [1760, 520], [1800, 300], [1830, 0]], 7);
    rio([[1760, 520], [1880, 900], [1950, 1500], [1960, 1900]], 6);
    rio([[1560, 1000], [1460, 1150], [1400, 1300]], 5); rio([[1560, 1000], [1500, 1180], [1520, 1400]], 4);
    rio([[px(36.3) + 0, py(33.51)], [px(36.3) - 40, py(33.45)]], 3);
    for (let y = 1880; y < MH; y++) R(c, MW - (y - 1880) * 1.2, y, (y - 1880) * 1.2, 1, '#3c78b4');
    // montanhas
    const monte = (x, y, s, neve) => { c.fillStyle = '#8c7a62'; c.beginPath(); c.moveTo(x - 30 * s, y); c.lineTo(x, y - 38 * s); c.lineTo(x + 30 * s, y); c.fill();
      c.fillStyle = '#6e5e4a'; c.beginPath(); c.moveTo(x, y - 38 * s); c.lineTo(x + 30 * s, y); c.lineTo(x + 6 * s, y); c.fill();
      if (neve) { c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(x - 9 * s, y - 27 * s); c.lineTo(x, y - 38 * s); c.lineTo(x + 9 * s, y - 27 * s); c.fill(); } };
    monte(1680, 200, 1.6, true); monte(1770, 190, 2, true); monte(1840, 220, 1.2, true); monte(1600, 230, 1, false);
    monte(px(35.86), py(33.42) + 10, 1.3, true); monte(px(35.05), py(32.73) + 8, .7, false); monte(px(35.39), py(32.69) + 6, .6, false); monte(px(35.73), py(31.77) + 8, .6, false);
    monte(430, 2220, 1.6, false); monte(380, 2250, 1, false); monte(490, 2260, 1.1, false);
    for (let i = 0; i < 14; i++) monte(px(35.15) + (i % 2) * 20, py(32.4) + i * 45, .45, false); // montes centrais
    for (let i = 0; i < 10; i++) monte(px(35.85) + (i % 2) * 18, py(32.2) + i * 70, .5, false);  // planalto da Transjordânia
    for (let i = 0; i < 40; i++) { const x = 300 + r() * 1700, y = 900 + r() * 1300; if (x > 1100 || y > 1800) R(c, x, y, 18, 3, '#c49a62'); } // dunas
    // estradas
    c.strokeStyle = 'rgba(150,115,70,.55)'; c.lineWidth = 3; c.setLineDash([6, 5]);
    const P = id => [L[id].x, L[id].y];
    [['egito', 'gaza', 'asquelom', 'asdode', 'jope', 'cesareia', 'dor', 'megido', 'hazor', 'damasco'], ['berseba', 'hebrom', 'belem', 'jerusalem', 'betel', 'silo', 'siquem', 'samaria', 'jezreel', 'nazare'],
     ['jerusalem', 'jerico', 'gilgal'], ['nazare', 'cana', 'tiberiades', 'cafarnaum', 'da', 'cesareiafilipe', 'damasco'], ['damasco', 'hara'], ['hara', 'ninive'], ['hara', 'eden'], ['eden', 'acampamento', 'enoque'], ['eden', 'babel', 'ur'],
     ['raba', 'gerasa', 'ramote', 'damasco'], ['gosen', 'marvermelho', 'sinai', 'cades', 'berseba']].forEach(rota => { c.beginPath(); rota.forEach((id, i) => { const [x, y] = P(id); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); });
    c.setLineDash([]);

    // ---------- marcos ----------
    const casa = (x, y, cor, teto) => { R(c, x - 5, y - 5, 10, 5, cor || '#d2b07e'); R(c, x + 2, y - 5, 3, 5, '#b8966a'); R(c, x - 6, y - 8, 12, 3, teto || '#963c32'); R(c, x - 1, y - 3, 2, 3, '#46301a'); };
    const vila = (x, y, n, s) => { const rr = rnd(hash(Math.round(x * 7 + y))); for (let i = 0; i < n; i++) casa(x + (rr() - .5) * 26 * (s || 1), y + (rr() - .5) * 16 * (s || 1), null, ['#963c32', '#8c5a32', '#a87a42'][i % 3]); };
    const muralha = (x, y, w, h) => { c.strokeStyle = '#a08060'; c.lineWidth = 3; c.strokeRect(x - w / 2, y - h / 2, w, h); for (let i = 0; i < w; i += 7) R(c, x - w / 2 + i, y - h / 2 - 3, 3, 3, '#a08060'); };
    const arv = (x, y, s) => { R(c, x - 1, y - 2, 2, 4, '#5a3c1e'); c.fillStyle = '#3f7a2a'; c.beginPath(); c.arc(x, y - 5, 5 * s, 0, 6.28); c.fill(); c.fillStyle = '#5a9a36'; c.beginPath(); c.arc(x - 1, y - 6, 3 * s, 0, 6.28); c.fill(); };
    CID.forEach(([id, , , , , , tipo]) => { const l = L[id]; if (tipo === 'c') vila(l.x, l.y, l.importante ? 6 : 3); });
    // especiais
    { const l = L.jerusalem; muralha(l.x, l.y, 40, 32); R(c, l.x - 8, l.y - 12, 16, 9, '#e8d8a0'); R(c, l.x - 4, l.y - 16, 8, 4, '#d4c088'); vila(l.x, l.y + 6, 4, .6); }
    { const l = L.jerico; muralha(l.x, l.y, 26, 20); vila(l.x, l.y, 2, .4); }
    { const l = L.gilgal; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; R(c, l.x + Math.cos(a) * 9, l.y + Math.sin(a) * 9, 3, 3, '#9a9a9a'); } }
    { const l = L.belem; vila(l.x, l.y, 4, .6); R(c, l.x, l.y - 26, 3, 3, '#fff6c0'); R(c, l.x - 2, l.y - 25, 7, 1, '#fff6c0'); }
    // barcos na Galileia
    R(c, px(35.58) - 10, py(32.85), 8, 3, '#6e4a24'); R(c, px(35.58) + 6, py(32.78), 8, 3, '#6e4a24');
    // Éden: jardim murado
    c.fillStyle = '#4f8f30'; c.beginPath(); c.arc(1560, 1000, 128, 0, 6.28); c.fill();
    c.strokeStyle = '#3a6a22'; c.lineWidth = 8; c.beginPath(); c.arc(1560, 1000, 132, .25, 6.03); c.stroke();
    const re = rnd(7); for (let i = 0; i < 140; i++) { const a = re() * 6.28, d = 20 + re() * 100; arv(1560 + Math.cos(a) * d, 1000 + Math.sin(a) * d, .8 + re() * .5); }
    for (let i = 0; i < 60; i++) { const a = re() * 6.28, d = re() * 110; R(c, 1560 + Math.cos(a) * d, 1000 + Math.sin(a) * d, 2, 2, ['#e04a3a', '#ffd27a', '#f08ac0', '#ffffff'][i % 4]); }
    c.fillStyle = '#2f6a1e'; c.beginPath(); c.arc(1560, 995, 18, 0, 6.28); c.fill(); c.fillStyle = '#4a9a2a'; c.beginPath(); c.arc(1556, 990, 11, 0, 6.28); c.fill();
    R(c, 1550, 986, 3, 3, '#ffd27a'); R(c, 1566, 992, 3, 3, '#e04a3a');
    // acampamento
    [[1720, 990], [1760, 1040], [1780, 985], [1710, 1040]].forEach(([x, y]) => { c.fillStyle = '#c49a62'; c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x, y - 12); c.lineTo(x + 10, y); c.fill(); R(c, x - 2, y - 5, 4, 5, '#4a3020'); });
    // Enoque: casas e lotes
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = 1830 + i * 20, y = 1080 + j * 20; if ((i + j) % 3 === 0) casa(x, y); else { R(c, x - 6, y - 1, 1, 3, '#7a5a34'); R(c, x + 5, y - 1, 1, 3, '#7a5a34'); } }
    // Ararate + arca, Babel, Ur, Nínive, Harã
    R(c, 1700, 150, 46, 12, '#6e4a24'); R(c, 1708, 142, 30, 8, '#8c5a2e');
    for (let k = 0; k < 7; k++) R(c, 1630 + k * 4, 1390 - k * 9, 44 - k * 8, 9, k % 2 ? '#c09a62' : '#b08a52');
    for (let k = 0; k < 3; k++) R(c, 1805 + k * 5, 1740 - k * 8, 30 - k * 10, 8, '#b08a52'); vila(1820, 1755, 4);
    muralha(1760, 520, 44, 30); vila(1760, 520, 5, .7); vila(1430, 340, 4);
    // Egito: pirâmides e Gósen
    const pir = (x, y, s) => { c.fillStyle = '#e0c080'; c.beginPath(); c.moveTo(x - 20 * s, y); c.lineTo(x, y - 22 * s); c.lineTo(x + 20 * s, y); c.fill(); c.fillStyle = '#c4a060'; c.beginPath(); c.moveTo(x, y - 22 * s); c.lineTo(x + 20 * s, y); c.lineTo(x + 4 * s, y); c.fill(); };
    pir(130, 1720, 1.3); pir(160, 1745, 1); pir(105, 1755, .8); vila(210, 1560, 6);
    return cv;
  }

  function nevoa() {
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(10,12,26,.58)'; c.fillRect(0, 0, MW, MH);
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
    const ch = G.BRPG.chave, out = [], cont = {}, E = L.eden, A = L.acampamento, N = L.enoque;
    pessoas.forEach(p => {
      const k = ch(p.forma), z = zona(p, k), h = hash(p.id * 31 + 7), h2 = hash(p.id * 77 + 3), n = (cont[z] = (cont[z] || 0) + 1) - 1;
      let x, y, anda = true;
      if (z === 'sol') { x = E.x; y = E.y - 160; anda = false; }
      else if (z === 'cosmos') { x = E.x - 80; y = E.y - 130; anda = false; }
      else if (z === 'querubim') { x = E.x + 130; y = E.y - 15 + n * 26; anda = false; }
      else if (z === 'arvore') { x = E.x + 12; y = E.y; anda = false; }
      else if (z === 'jardim') { const a = (h % 628) / 100, d = 40 + (h2 % 70); x = E.x + Math.cos(a) * d; y = E.y + Math.sin(a) * d * .9; }
      else if (z === 'portao') { x = N.x - 75 + (n % 6) * 9; y = N.y + 60 + Math.floor(n / 6) * 12; }
      else { const a = (h % 628) / 100, d = 10 + (h2 % 55); x = A.x + Math.cos(a) * d; y = A.y + 5 + Math.sin(a) * d * .7; }
      out.push({ p, k, z, x, y, bx: x, by: y, f: (h % 628) / 100, anda });
    });
    return out;
  }
  function lugarEm(x, y) {
    let best = null, d = 1e9;
    LUGARES.forEach(l => { const dd = Math.hypot(l.x - x, l.y - y) / l.r; if (dd < d) { d = dd; best = l; } });
    return d < 1.5 ? best : null;
  }

  G.BRPG_MAPA = { MW, MH, LUGARES, L, REGIOES, montar, nevoa, posicionar, lugarEm };
})(window);
