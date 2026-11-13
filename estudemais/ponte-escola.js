/* Ponte com o EstudeUp Escola: quem veio do app da escola (mesmo login) ganha um botão para voltar
   para a escola, e um atalho para o plano quando a IA do dia acaba. */
(function () {
  let volta = null, nome = '';
  try { volta = localStorage.getItem('eu-escola-volta'); nome = localStorage.getItem('eu-escola-nome') || ''; } catch (_) { /* */ }
  const css = document.createElement('style');
  css.textContent = '.eu-ponte{position:fixed;z-index:9999;left:14px;top:calc(10px + env(safe-area-inset-top));display:flex;gap:6px}' +
    '.eu-ponte a{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:999px;font:700 13px/1 inherit;text-decoration:none;' +
    'background:#1F4BFF;color:#fff;box-shadow:0 4px 0 #0D2397,0 8px 22px rgba(13,35,151,.25)}' +
    '.eu-ponte a.plano{background:#FFE34D;color:#0D2397;box-shadow:0 4px 0 #c9a800}' +
    '@media (min-width:1000px){.eu-ponte{left:auto;right:18px;top:14px}}';
  document.head.appendChild(css);
  const box = document.createElement('div');
  box.className = 'eu-ponte';
  if (volta && /\/(estudeup|saidaescola)\//.test(volta)) {
    const a = document.createElement('a');
    a.href = volta; a.textContent = '← ' + (nome ? nome.slice(0, 28) : 'Minha escola');
    a.title = 'Voltar para o app da escola';
    box.appendChild(a);
  }
  // quando a energia (IA) do dia zera, mostra o atalho para o plano
  const plano = document.createElement('a');
  plano.className = 'plano'; plano.href = '../estudeup/#/assinar'; plano.textContent = '⚡ Mais IA'; plano.hidden = true;
  box.appendChild(plano);
  const confere = () => {
    const el = document.getElementById('home-energia') || document.getElementById('sidebar-energia');
    plano.hidden = !(el && el.textContent.trim() === '0');
  };
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(box); confere(); });
  if (document.readyState !== 'loading') { document.body.appendChild(box); confere(); }
  setInterval(confere, 4000);
})();
