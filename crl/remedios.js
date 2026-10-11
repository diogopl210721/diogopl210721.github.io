// CRL — Remédios de hoje.
// O ADM confere a receita e define os horários (e a foto da caixa). O monitor vê, por horário,
// quem toma, qual remédio e qual dose, confere com a foto/caixa e marca: Dei, Recusou, Não deu ou Não tinha.
// Regras no banco: crl_doses_day, crl_record_dose (conferir a caixa é obrigatório para "Dei";
// a mesma dose não é registrada duas vezes; correção só pelo ADM) e crl_med_schedule_set (só ADM).
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const hhmm=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const longDay=iso=>new Date(iso+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',timeZone:'UTC'});
const errText=e=>String(e?.message||e||'').replace(/^CRL:\s*/,'')||'Não foi possível salvar.';
const STATUS={administrado:['ok','✓ Dado'],recusado:['warn','Recusou'],nao_administrado:['no','Não deu'],indisponivel:['no','Não tinha o remédio']};
let day=null,ctx=null;

// Sugere horários a partir do texto da receita: "8h e 20h" → 08:00, 20:00; "de 8 em 8 horas" / "8/8h" → 06:00, 14:00, 22:00
export function suggestTimes(text){
 const t=String(text||'').toLowerCase();
 const every=t.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*h/)||t.match(/de\s*(\d{1,2})\s*em\s*(\d{1,2})\s*h/);
 if(every&&every[1]===every[2]){
  const n=Number(every[1]);
  if([4,6,8,12,24].includes(n)){const start=n===12||n===24?8:6;return [...Array(24/n)].map((_,i)=>String((start+i*n)%24).padStart(2,'0')+':00').sort()}
 }
 const out=new Set();
 for(const m of t.matchAll(/(?<![\d/])(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?!\s*\/)/g)){
  const h=Number(m[1]),min=Number(m[2]||0);
  if(h<=23&&min<=59)out.add(String(h).padStart(2,'0')+':'+String(min).padStart(2,'0'));
 }
 return [...out].sort();
}

export function dosesForm(member){
 const today=todaySP();
 return '<h2>Remédios de hoje</h2><p class="muted">Na hora de dar o remédio: confira a pessoa, o nome e a dose na caixa (compare com a foto) e marque.</p>'+
  '<div class="doses-day"><button type="button" class="secondary" data-dd="-1" aria-label="Dia anterior">◀</button><input id="dosesDay" type="date" value="'+today+'" max="'+today+'" min="'+addDays(today,-7)+'" aria-label="Dia"><button type="button" class="secondary" data-dd="1" aria-label="Próximo dia">▶</button><button type="button" class="secondary" id="dosesRefresh">Atualizar</button></div>'+
  '<div id="dosesSummary" class="doses-summary"></div><div id="dosesUnscheduled"></div>'+
  (member?.role==='admin'?'<p class="muted">Os horários de cada remédio são definidos pelo ADM em Medicamentos (botão “Horários e foto”) ou aqui, quando aparecer um remédio sem horário.</p>':'');
}

export async function loadDoses(context){
 ctx=context;
 const input=document.getElementById('dosesDay');
 if(!day)day=todaySP();
 if(input){
  input.value=day;
  input.onchange=()=>{if(input.value){day=input.value;loadDoses(ctx)}};
  document.querySelectorAll('[data-dd]').forEach(b=>b.onclick=()=>{const next=addDays(day,Number(b.dataset.dd));if(next>todaySP()||next<addDays(todaySP(),-7))return;day=next;loadDoses(ctx)});
  document.getElementById('dosesRefresh').onclick=()=>loadDoses(ctx);
 }
 const root=ctx.listRoot;root.replaceChildren(Object.assign(document.createElement('p'),{className:'muted',textContent:'Carregando os remédios...'}));
 const r=await ctx.db.rpc('crl_doses_day',{p_institution:ctx.member.institution_id,p_day:day});
 if(r.error||!r.data){root.innerHTML='<p class="danger">Não foi possível abrir os remédios: '+esc(errText(r.error))+'</p>';return}
 const data=r.data,now=new Date(data.now||Date.now()).getTime();
 // Fotos da caixa e receitas: links temporários (10 minutos), só para quem tem acesso
 const paths=[...new Set([...(data.doses||[]),...(data.as_needed||[])].flatMap(x=>[x.box_path,x.prescription_path]).filter(Boolean))];
 const urls=new Map();
 if(paths.length){
  const s=await ctx.db.storage.from('crl-private').createSignedUrls(paths,600);
  for(const x of s.data||[])if(x.signedUrl)urls.set(x.path,x.signedUrl);
 }
 const doses=data.doses||[];
 const late=doses.filter(d=>!d.status&&now>new Date(d.scheduled_for).getTime()+3600000);
 const done=doses.filter(d=>d.status==='administrado').length;
 const other=doses.filter(d=>d.status&&d.status!=='administrado').length;
 const sum=document.getElementById('dosesSummary');
 if(sum)sum.innerHTML=doses.length?'<span class="ok">✓ '+done+' dadas</span>'+(other?'<span class="warn">'+other+' não dadas / recusadas</span>':'')+
  '<span class="'+(late.length?'no':'open')+'">'+(late.length?'⚠ '+late.length+' atrasada(s)':(doses.length-done-other)+' a dar')+'</span>':'';
 renderUnscheduled(data.unscheduled||[]);
 root.replaceChildren();
 const head=document.createElement('p');head.className='doses-dayname';head.textContent=(day===data.today?'Hoje, ':'')+longDay(day);root.append(head);
 if(!doses.length&&!(data.as_needed||[]).length){
  root.append(Object.assign(document.createElement('p'),{className:'muted',textContent:'Nenhum remédio com horário para este dia.'}));
 }
 // Agrupa por horário
 const bySlot=new Map();for(const d of doses){if(!bySlot.has(d.slot))bySlot.set(d.slot,[]);bySlot.get(d.slot).push(d)}
 for(const [slot,list] of bySlot){
  const sec=document.createElement('section');sec.className='doses-slot';
  const t=new Date(list[0].scheduled_for).getTime();
  const pending=list.filter(d=>!d.status).length;
  sec.innerHTML='<h3><span class="doses-hour">'+esc(slot)+'</span>'+(pending?'<small>'+pending+' a dar</small>':'<small class="ok">tudo registrado</small>')+'</h3>';
  for(const d of list)sec.append(doseCard(d,now,urls,data.today));
  root.append(sec);
  if(pending&&now>t+3600000)sec.classList.add('is-late');
 }
 if((data.as_needed||[]).length){
  const sec=document.createElement('section');sec.className='doses-slot';
  sec.innerHTML='<h3><span class="doses-hour">SOS</span><small>só se necessário — registre quando der</small></h3>';
  for(const m of data.as_needed)sec.append(sosCard(m,urls));
  root.append(sec);
 }
 // A tela mostra de novo os atrasos sem precisar recarregar
 clearTimeout(window.__crlDosesTimer);
 window.__crlDosesTimer=setTimeout(()=>{if(document.getElementById('dosesDay')&&ctx.listRoot.isConnected)loadDoses(ctx)},5*60*1000);
}

function photoBlock(x,urls){
 const box=x.box_path&&urls.get(x.box_path);
 const rx=x.prescription_path&&urls.get(x.prescription_path);
 return (box?'<a class="dose-photo" href="'+esc(box)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(box)+'" alt="Foto do remédio '+esc(x.medication_name)+'"></a>':'<div class="dose-photo none">sem foto<br>da caixa</div>')+
  (rx?'<a class="dose-rx" href="'+esc(rx)+'" target="_blank" rel="noopener noreferrer">Ver receita</a>':'');
}
function doseCard(d,now,urls,today){
 const card=document.createElement('article');
 const t=new Date(d.scheduled_for).getTime();
 const isLate=!d.status&&now>t+3600000,tooEarly=!d.status&&t>now+2*3600000;
 card.className='dose-card'+(d.status?' is-'+STATUS[d.status][0]:isLate?' is-late':'');
 const info='<div class="dose-info"><b class="dose-person">'+esc(d.resident)+'</b><span class="dose-med">'+esc(d.medication_name)+'</span><span class="dose-amount">'+esc(d.dose_text||'')+'</span>'+
  (d.instructions?'<span class="dose-instr">'+esc(d.instructions)+'</span>':'')+'</div>';
 card.innerHTML='<div class="dose-media">'+photoBlock(d,urls)+'</div>'+info;
 const foot=document.createElement('div');foot.className='dose-foot';
 if(d.status){
  foot.innerHTML='<span class="dose-tag '+STATUS[d.status][0]+'">'+STATUS[d.status][1]+'</span><span class="muted"> às '+esc(hhmm(d.recorded_at))+' por '+esc(d.recorded_by||'equipe')+'</span>'+(d.notes?'<div class="dose-note">'+esc(d.notes)+'</div>':'');
 }else if(tooEarly){
  foot.innerHTML='<span class="muted">Ainda não é a hora (libera 2 horas antes).</span>';
 }else{
  if(isLate)foot.innerHTML='<span class="dose-tag no">⚠ Atrasada</span>';
  const id='chk'+d.medication_id.slice(0,8)+d.slot.replace(':','');
  const form=document.createElement('div');form.className='dose-actions';
  form.innerHTML='<label class="dose-check" for="'+id+'"><input type="checkbox" id="'+id+'"> Conferi: é esta pessoa, o remédio da foto, com o nome e a dose certos</label>'+
   '<div class="dose-buttons"><button type="button" class="primary" data-s="administrado" disabled>✓ Dei</button><button type="button" class="secondary" data-s="recusado">Recusou</button><button type="button" class="secondary" data-s="nao_administrado">Não deu</button><button type="button" class="secondary" data-s="indisponivel">Não tinha</button></div>'+
   '<div class="dose-why hide"><label>Motivo</label><input maxlength="500" placeholder="Ex.: disse que estava enjoado"><div class="dose-buttons"><button type="button" class="primary" data-save="1">Salvar</button><button type="button" class="secondary" data-cancel="1">Cancelar</button></div></div>';
  const chk=form.querySelector('input[type=checkbox]'),give=form.querySelector('[data-s=administrado]');
  chk.onchange=()=>{give.disabled=!chk.checked};
  let chosen=null;const why=form.querySelector('.dose-why');
  give.onclick=()=>record(d,'administrado',true,null,give);
  form.querySelectorAll('[data-s]:not([data-s=administrado])').forEach(b=>b.onclick=()=>{chosen=b.dataset.s;why.classList.remove('hide');why.querySelector('label').textContent=b.textContent==='Recusou'?'Por que recusou?':b.textContent==='Não tinha'?'O que aconteceu? (ex.: acabou o remédio)':'Por que não deu?';why.querySelector('input').focus()});
  form.querySelector('[data-cancel]').onclick=()=>{why.classList.add('hide');chosen=null};
  form.querySelector('[data-save]').onclick=e=>{
   const txt=why.querySelector('input').value.trim();
   if(txt.length<3){ctx.status('Escreva o motivo.',true);return}
   record(d,chosen,chk.checked,txt,e.target);
  };
  foot.append(form);
  if(d.slot&&today&&day<addDays(today,-1)&&ctx.member.role!=='admin')foot.innerHTML='<span class="muted">Dose de mais de um dia atrás: só o ADM registra.</span>';
 }
 card.append(foot);
 return card;
}
function sosCard(m,urls){
 const card=document.createElement('article');card.className='dose-card';
 card.innerHTML='<div class="dose-media">'+photoBlock(m,urls)+'</div><div class="dose-info"><b class="dose-person">'+esc(m.resident)+'</b><span class="dose-med">'+esc(m.medication_name)+'</span><span class="dose-amount">'+esc(m.dose_text||'')+'</span>'+
  (m.instructions?'<span class="dose-instr">'+esc(m.instructions)+'</span>':'')+'<span class="muted">'+(m.given_today?'Dado '+m.given_today+' vez(es) neste dia':'Ainda não foi dado neste dia')+'</span></div>';
 if(day!==todaySP())return card;
 const foot=document.createElement('div');foot.className='dose-foot';
 const id='sos'+m.medication_id.slice(0,8);
 foot.innerHTML='<div class="dose-actions"><label class="dose-check" for="'+id+'"><input type="checkbox" id="'+id+'"> Conferi a pessoa, o remédio e a dose</label><label>Por que deu?</label><input maxlength="500" placeholder="Ex.: dor de cabeça"><div class="dose-buttons"><button type="button" class="primary" disabled>Dei agora</button></div></div>';
 const chk=foot.querySelector('input[type=checkbox]'),btn=foot.querySelector('button'),why=foot.querySelector('input:not([type])');
 chk.onchange=()=>{btn.disabled=!chk.checked};
 btn.onclick=async()=>{
  if(ctx.preview){ctx.status('Prévia apenas visual: volte ao ADM para salvar.',true);return}
  const txt=why.value.trim();if(txt.length<3){ctx.status('Escreva por que deu o remédio.',true);return}
  btn.disabled=true;
  const r=await ctx.db.rpc('crl_record_medication_event',{p_medication:m.medication_id,p_status:'administrado',p_notes:'SOS: '+txt});
  if(r.error){btn.disabled=false;ctx.status(errText(r.error),true);return}
  ctx.status('Registrado: '+m.medication_name+' para '+m.resident+'.');await loadDoses(ctx);
 };
 card.append(foot);return card;
}
async function record(d,statusValue,checked,notes,button){
 if(ctx.preview){ctx.status('Prévia apenas visual: volte ao ADM para salvar.',true);return}
 if(button)button.disabled=true;
 const r=await ctx.db.rpc('crl_record_dose',{p_medication:d.medication_id,p_scheduled_for:d.scheduled_for,p_status:statusValue,p_checked:!!checked,p_notes:notes});
 if(r.error){if(button)button.disabled=false;ctx.status(errText(r.error),true);return}
 ctx.status(statusValue==='administrado'?'Registrado: '+d.resident+' tomou '+d.medication_name+' ('+d.slot+').':'Registrado, com o motivo.');
 await loadDoses(ctx);
}

function renderUnscheduled(list){
 const box=document.getElementById('dosesUnscheduled');if(!box)return;
 box.replaceChildren();
 if(!list.length)return;
 if(ctx.member.role!=='admin'){
  box.innerHTML='<p class="doses-warn">'+list.length+' remédio(s) conferido(s) ainda sem horário. Avise o ADM para definir os horários.</p>';
  return;
 }
 const w=document.createElement('div');w.className='doses-warn';
 w.innerHTML='<b>Defina os horários destes remédios</b><p class="muted">Sem horário, eles não aparecem na lista do monitor.</p>';
 for(const m of list){
  const it=document.createElement('div');it.className='doses-unsched';
  it.innerHTML='<div><b>'+esc(m.resident)+'</b> · '+esc(m.medication_name)+' <span class="muted">('+esc(m.dose_text||'')+' · receita: '+esc(m.schedule_text||'')+')</span></div>';
  const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Definir horários';
  b.onclick=()=>openScheduleForm(it,{id:m.medication_id,stay_id:m.stay_id,medication_name:m.medication_name,schedule_text:m.schedule_text,times:[]},ctx,()=>loadDoses(ctx));
  it.append(b);w.append(it);
 }
 box.append(w);
}

// Formulário do ADM: horários, "só se necessário", instruções, até quando e foto da caixa
export function openScheduleForm(container,med,c,onDone){
 const old=container.querySelector('.sched-form');if(old){old.remove();return}
 const form=document.createElement('form');form.className='sched-form';
 const times=(med.times||[]).map(t=>String(t).slice(0,5));
 const initial=times.length?times:suggestTimes(med.schedule_text);
 form.innerHTML='<p class="muted">Receita: '+esc(med.schedule_text||'—')+'</p>'+
  '<label class="care-check"><input type="checkbox" name="sos"'+(med.as_needed?' checked':'')+'> Só se necessário (SOS) — sem horário fixo</label>'+
  '<div class="sched-times"><label>Horários do dia</label><div class="sched-list"></div><button type="button" class="escala-link" data-add="1">+ outro horário</button></div>'+
  '<label>Instrução para quem dá (opcional)</label><input name="instr" maxlength="300" value="'+esc(med.instructions||'')+'" placeholder="Ex.: depois do café, com água">'+
  '<label>Tomar até (opcional)</label><input name="end" type="date" value="'+esc(med.end_date||'')+'" min="'+todaySP()+'">'+
  '<label>Foto da caixa ou cartela'+(med.box_file_id?' (já tem — envie só para trocar)':'')+'</label><input name="box" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">'+
  '<div class="dose-buttons"><button type="submit" class="primary">Salvar horários</button><button type="button" class="secondary" data-cancel="1">Cancelar</button></div>';
 const list=form.querySelector('.sched-list');
 const addRow=v=>{const row=document.createElement('div');row.className='sched-row';row.innerHTML='<input type="time" value="'+esc(v||'')+'" required><button type="button" class="escala-x" aria-label="Tirar horário">×</button>';row.querySelector('button').onclick=()=>{row.remove()};list.append(row)};
 (initial.length?initial:['08:00']).forEach(addRow);
 form.querySelector('[data-add]').onclick=()=>addRow('');
 const sos=form.elements.sos,timesBox=form.querySelector('.sched-times');
 const sync=()=>{timesBox.classList.toggle('hide',sos.checked);list.querySelectorAll('input').forEach(i=>i.required=!sos.checked)};
 sos.onchange=sync;sync();
 form.querySelector('[data-cancel]').onclick=()=>form.remove();
 form.onsubmit=async e=>{
  e.preventDefault();
  if(c.preview){c.status('Prévia apenas visual: volte ao ADM para salvar.',true);return}
  const btn=form.querySelector('button[type=submit]');btn.disabled=true;
  try{
   let boxId=null;const f=form.elements.box.files?.[0];
   if(f){
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[f.type];
    if(!ext||f.size>10*1024*1024){c.status('Use foto JPG, PNG ou WebP de até 10 MB.',true);return}
    const path=c.member.institution_id+'/'+med.stay_id+'/'+crypto.randomUUID()+'.'+ext;
    const up=await c.db.storage.from('crl-private').upload(path,f,{contentType:f.type,upsert:false});
    if(up.error){c.status('Não foi possível enviar a foto.',true);return}
    const row=await c.db.from('crl_files').insert({institution_id:c.member.institution_id,stay_id:med.stay_id,storage_path:path,category:'remedio',description:'Foto do remédio: '+med.medication_name,uploaded_by:c.user.id}).select('id').single();
    if(row.error){c.status('A foto subiu, mas não foi ligada ao remédio. Tente de novo.',true);return}
    boxId=row.data.id;
   }
   const ts=[...list.querySelectorAll('input')].map(i=>i.value).filter(Boolean);
   const r=await c.db.rpc('crl_med_schedule_set',{p_medication:med.id,p_times:ts,p_as_needed:sos.checked,p_instructions:form.elements.instr.value.trim()||null,p_box_file:boxId,p_end_date:form.elements.end.value||null});
   if(r.error){c.status(errText(r.error),true);return}
   c.status(sos.checked?'Remédio marcado como “só se necessário”.':'Horários salvos. O remédio já aparece em Remédios de hoje.');
   form.remove();if(onDone)await onDone();
  }finally{btn.disabled=false}
 };
 container.append(form);
 form.scrollIntoView({behavior:'smooth',block:'nearest'});
}
