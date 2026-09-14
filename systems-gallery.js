// Galeria 3D de telas para os sistemas internos (cards sem link direto).
// Convenção de arquivos: screenshots/<slug>/1.jpg, 2.jpg, 3.jpg ... (até MAX_SHOTS).
// Se um arquivo não existir, ele simplesmente não aparece — não precisa ter todos prontos.
(() => {
  const MAX_SHOTS = 8;
  const modal = document.querySelector('#sys-modal');
  if (!modal) return;
  const titleEl = modal.querySelector('#sys-modal-title');
  const scrollEl = modal.querySelector('#sys-modal-scroll');
  const emptyEl = modal.querySelector('#sys-modal-empty');
  let lastFocused = null;
  let revealObserver = null;

  function openGallery(slug, title) {
    titleEl.textContent = title || slug;
    scrollEl.replaceChildren();
    emptyEl.hidden = true;
    scrollEl.hidden = false;
    let loaded = 0, settled = 0;
    if (revealObserver) revealObserver.disconnect();
    revealObserver = ('IntersectionObserver' in window)
      ? new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); }), {root: scrollEl, threshold: 0.2})
      : null;
    for (let i = 1; i <= MAX_SHOTS; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'sys-shot';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = `${title} — tela ${i}`;
      img.src = `screenshots/${slug}/${i}.jpg`;
      img.onerror = () => { settled++; wrap.remove(); checkEmpty(); };
      img.onload = () => { settled++; loaded++; if (revealObserver) revealObserver.observe(wrap); checkEmpty(); };
      wrap.appendChild(img);
      scrollEl.appendChild(wrap);
    }
    function checkEmpty() {
      if (settled === MAX_SHOTS && loaded === 0) { scrollEl.hidden = true; emptyEl.hidden = false; }
    }
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.sys-modal-close').focus();
  }

  function closeGallery() {
    modal.hidden = true;
    document.body.style.overflow = '';
    scrollEl.replaceChildren();
    if (revealObserver) revealObserver.disconnect();
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.querySelectorAll('[data-gallery]').forEach(card => {
    card.addEventListener('click', () => openGallery(card.dataset.gallery, card.dataset.galleryTitle));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openGallery(card.dataset.gallery, card.dataset.galleryTitle); }
    });
  });
  modal.querySelectorAll('[data-sys-close]').forEach(el => el.addEventListener('click', closeGallery));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeGallery(); });
})();
