// CRL — Quadro de assinatura do acolhido (dedo no celular, mouse ou caneta no computador).
// A imagem vai para o armazenamento privado como arquivo "assinatura"; só o ADM consegue ver a imagem.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const SIGN_TEXT='Confirmo que as informações deste cadastro são verdadeiras.';

export function signaturePadHtml(id,{name='',text=SIGN_TEXT}={}){
 return '<div class="sig-pad" id="'+id+'Box">'+
  (text?'<p class="sig-text">'+esc(text)+'</p>':'')+
  '<div class="sig-area"><canvas id="'+id+'" aria-label="Quadro para assinar com o dedo ou o mouse"></canvas>'+
  '<span class="sig-hint" aria-hidden="true">✍ Assine aqui</span><span class="sig-name" id="'+id+'Name">'+esc(name||'Assinatura do acolhido')+'</span></div>'+
  '<div class="sig-tools"><button type="button" class="secondary sig-clear" data-clear="'+id+'">Limpar e assinar de novo</button></div></div>';
}

// Liga o quadro: devolve {isEmpty, clear, toFile}
export function bindSignaturePad(id){
 const canvas=document.getElementById(id);if(!canvas)return null;
 const box=document.getElementById(id+'Box');
 const ctx=canvas.getContext('2d');
 let strokes=[],current=null;
 const size=()=>{
  const r=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);redraw();
 };
 const redraw=()=>{
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1b2a4a';ctx.lineWidth=2.4;
  for(const s of strokes){
   if(s.length===1){ctx.beginPath();ctx.arc(s[0][0],s[0][1],1.3,0,Math.PI*2);ctx.fillStyle='#1b2a4a';ctx.fill();continue}
   ctx.beginPath();ctx.moveTo(s[0][0],s[0][1]);
   for(let i=1;i<s.length;i++){const [x0,y0]=s[i-1],[x1,y1]=s[i];ctx.quadraticCurveTo(x0,y0,(x0+x1)/2,(y0+y1)/2)}
   ctx.stroke();
  }
  box?.classList.toggle('has-ink',strokes.length>0);
 };
 const point=e=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture?.(e.pointerId);current=[point(e)];strokes.push(current);redraw()});
 canvas.addEventListener('pointermove',e=>{if(!current)return;e.preventDefault();current.push(point(e));redraw()});
 const end=()=>{current=null};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);
 document.querySelector('[data-clear="'+id+'"]')?.addEventListener('click',()=>{strokes=[];redraw()});
 size();
 let last=canvas.getBoundingClientRect().width;
 const ro=new ResizeObserver(()=>{const w=canvas.getBoundingClientRect().width;if(Math.abs(w-last)>1){last=w;size()}});ro.observe(canvas);
 return {
  isEmpty:()=>!strokes.some(s=>s.length>1)&&strokes.length<3,
  clear:()=>{strokes=[];redraw()},
  // PNG recortado na área assinada, fundo transparente
  toFile:async(filename='assinatura.png')=>{
   const pts=strokes.flat();if(!pts.length)return null;
   const pad=12,minX=Math.max(0,Math.min(...pts.map(p=>p[0]))-pad),minY=Math.max(0,Math.min(...pts.map(p=>p[1]))-pad);
   const r=canvas.getBoundingClientRect(),maxX=Math.min(r.width,Math.max(...pts.map(p=>p[0]))+pad),maxY=Math.min(r.height,Math.max(...pts.map(p=>p[1]))+pad);
   const scale=2,out=document.createElement('canvas');
   out.width=Math.max(1,Math.round((maxX-minX)*scale));out.height=Math.max(1,Math.round((maxY-minY)*scale));
   const o=out.getContext('2d');o.scale(scale,scale);o.translate(-minX,-minY);
   o.lineCap='round';o.lineJoin='round';o.strokeStyle='#1b2a4a';o.lineWidth=2.4;
   for(const s of strokes){
    if(s.length===1)continue;
    o.beginPath();o.moveTo(s[0][0],s[0][1]);
    for(let i=1;i<s.length;i++){const [x0,y0]=s[i-1],[x1,y1]=s[i];o.quadraticCurveTo(x0,y0,(x0+x1)/2,(y0+y1)/2)}
    o.stroke();
   }
   const blob=await new Promise(res=>out.toBlob(res,'image/png'));
   return blob?new File([blob],filename,{type:'image/png'}):null;
  }
 };
}
