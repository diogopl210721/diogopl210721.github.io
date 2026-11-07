// Decodifica o número de série do medidor de gás. Padrão (ex.: C19L0001630D):
//  C = vazão (A 0,6 · B 1,0 · C 1,6 · D 2,5 · E 4,0 m³/h) · 19 = ano de fabricação
//  L = marca (L Lao · A Aépio · I Itron · D Daeflex) · 0001630 = nº de série · D = diafragma
// Validade: 10 anos a partir da fabricação (vale até 31/12 do ano de vencimento).
(function () {
  const VAZAO = { A: '0,6', B: '1,0', C: '1,6', D: '2,5', E: '4,0' };
  const MARCA = { L: 'Lao', A: 'Aépio', I: 'Itron', D: 'Daeflex' };
  const VALIDADE_ANOS = 10;

  window.decodificarSerie = function (serie, hoje) {
    const s = String(serie || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = s.match(/^([A-E])(\d{2})([A-Z])(\d{4,})([A-Z])?$/);
    if (!m) return null;
    const anoFab = 2000 + parseInt(m[2], 10);
    const anoVenc = anoFab + VALIDADE_ANOS;
    const anoAtual = (hoje || new Date()).getFullYear();
    let status = 'ok';
    if (anoAtual > anoVenc) status = 'vencido';
    else if (anoAtual === anoVenc) status = 'vence_este_ano';
    return {
      vazao: VAZAO[m[1]], marca: MARCA[m[3]] || ('código ' + m[3]),
      anoFab, anoVenc, status, sequencia: m[4], diafragma: m[5] || '',
      anosRestantes: anoVenc - anoAtual,
    };
  };

  window.textoValidadeMedidor = function (d) {
    if (!d) return '';
    if (d.status === 'vencido') return `VENCIDO em ${d.anoVenc}`;
    if (d.status === 'vence_este_ano') return `Vence este ano (${d.anoVenc})`;
    return `Válido até ${d.anoVenc}`;
  };
})();
