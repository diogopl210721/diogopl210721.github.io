const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), {threshold: 0.08});
  document.querySelectorAll('.reveal').forEach(el => { el.classList.add('will-reveal'); observer.observe(el); });
}
const form = document.querySelector('#briefing');
document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  form.elements.servico.value = link.dataset.service;
}));
form.addEventListener('submit', event => {
  event.preventDefault();
  const name = form.elements.nome.value.trim();
  const idea = form.elements.mensagem.value.trim();
  form.elements.nome.setCustomValidity(name ? '' : 'Digite seu nome.');
  form.elements.mensagem.setCustomValidity(idea.length >= 10 ? '' : 'Conte um pouco mais: use pelo menos 10 caracteres.');
  if (!form.reportValidity()) return;
  const message = `Olá, Diogo! Vim pelo site da DDS.\n\nMeu nome: ${name}\nPreciso de: ${form.elements.servico.value}\nMinha ideia: ${idea}\nPrazo: ${form.elements.prazo.value}\n\nVamos conversar sobre esse projeto?`;
  const phone = window.DDS_CONFIG?.whatsapp || '5541991542931';
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const status = document.querySelector('#form-status');
  status.replaceChildren(document.createTextNode('Sua mensagem está pronta. '));
  const fallback = document.createElement('a');
  fallback.href = url; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer'; fallback.textContent = 'Abrir ou tentar novamente no WhatsApp ↗';
  status.append(fallback);
  window.open(url, '_blank', 'noopener,noreferrer');
});
['nome','mensagem'].forEach(name => form.elements[name].addEventListener('input', () => form.elements[name].setCustomValidity('')));
const socials = document.querySelector('#social-links');
socials.replaceChildren();
for (const [key, label] of [['instagram','Instagram ↗'],['linkedin','LinkedIn ↗']]) {
  const value = window.DDS_CONFIG?.[key];
  if (!value) continue;
  try { const url = new URL(value); if (url.protocol !== 'https:') continue;
    const a = document.createElement('a'); a.href = url.href; a.textContent = label; a.target = '_blank'; a.rel = 'noopener noreferrer'; socials.append(a); socials.hidden = false;
  } catch { /* Keep incomplete social links hidden. */ }
}
document.querySelectorAll('[data-social]').forEach(slot => {
  const value = window.DDS_CONFIG?.[slot.dataset.social];
  if (!value) return;
  try {
    const url=new URL(value); if(url.protocol!=='https:')return;
    if(slot.tagName==='A'){slot.href=url.href;return;}
    const link=document.createElement('a');link.className=slot.className.replace('social-pending','');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
    link.innerHTML='<span class="social-icon">in</span><span><strong>LinkedIn</strong><small>Vamos nos conectar</small></span><span>↗</span>';
    slot.replaceWith(link);
  } catch { /* Keep the pending label for an incomplete address. */ }
});
document.querySelector('#year').textContent = new Date().getFullYear();
if (document.querySelector('.hero-art') && !reducedMotion && window.matchMedia('(pointer: fine)').matches) {
  const art = document.querySelector('.hero-art');
  art.addEventListener('pointermove', event => { const r = art.getBoundingClientRect(); art.style.setProperty('--mx', `${(event.clientX-r.left-r.width/2)/35}px`); art.style.setProperty('--my', `${(event.clientY-r.top-r.height/2)/35}px`); });
  art.addEventListener('pointerleave', () => { art.style.setProperty('--mx','0px'); art.style.setProperty('--my','0px'); });
}
