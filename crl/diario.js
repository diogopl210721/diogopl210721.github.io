// CRL — Diário da casa.
// O monitor ou o ADM conta o que aconteceu no dia (pode ditar 🎤), marca quem aparece no relato
// e, para cada um, as etiquetas e uma frase. Tudo entra no histórico do acolhido e nas estatísticas.
// Regras no banco (crl_diary_*): monitor registra e não altera; ADM altera e exclui com motivo, ou
// reabre para quem escreveu corrigir. A sugestão da IA (crl-diario-ia) troca os nomes antes de enviar.
import {callFunction} from './fn.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TAGS=[['positivo','Destaque positivo'],['ocorrencia','Ocorrência'],['saude','Saúde'],['familia','Família / visita'],['atividade','Atividade / trabalho'],['comportamento','Comportamento'],['espiritual','Vida espiritual']];
export const TAG_LABEL=Object.fromEntries(TAGS);
const SHIFTS=[['dia','Dia todo'],['manha','Manhã'],['tarde','Tarde'],['noite','Noite']];
const SHIFT_LABEL=Object.fromEntries(SHIFTS);
const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const longDay=iso=>new Date(iso+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',timeZone:'UTC'});
const errText=e=>String(e?.message||e||'').replace(/^CRL:\s*/,'')||'Não foi possível salvar.';
let st=null; // estado do formulário
let ctx=null,filterStay='';
const extraNames=new Map(); // acolhidos que já saíram, mas estão num diário em alteração

function fresh(){return {id:null,reopenedForMe:false,picked:new Map(),raw:null,aiUsed:false}}

export function diaryForm(stays,member){
 const today=todaySP(),admin=member?.role==='admin';
 return '<h2 id="diaryTitle">Diário do dia</h2><p class="muted">Conte o que aconteceu na casa e marque quem aparece no relato. Depois de salvo, só o ADM altera.</p>'+
  '<div id="diaryEditBanner"></div>'+
  '<div class="two"><div><label for="diaryDay">Dia</label><input id="diaryDay" type="date" value="'+today+'" max="'+today+'"'+(admin?'':' min="'+addDays(today,-7)+'"')+'></div>'+
  '<div><label for="diaryShift">Turno</label><select id="diaryShift">'+SHIFTS.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('')+'</select></div></div>'+
  '<label for="diaryText">O que aconteceu na casa</label>'+
  '<div class="diary-tools"><button type="button" id="diaryMic" class="secondary">🎤 Ditar</button><button type="button" id="diaryAI" class="secondary">✨ Sugerir com IA</button><span id="diaryMicState" class="muted"></span></div>'+
  '<textarea id="diaryText" maxlength="20000" placeholder="Ex.: Manhã tranquila, todos no devocional. À tarde o João recebeu visita da mãe. À noite houve uma discussão na sala, resolvida com conversa."></textarea>'+
  '<div id="diaryAIBox"></div>'+
  '<h3 class="form-section">Quem aparece no relato</h3><p class="muted">Toque nos nomes. Para cada um, marque as etiquetas e, se quiser, escreva uma frase. Isso vai para o histórico e as estatísticas do acolhido.</p>'+
  '<div class="diary-people" id="diaryPeople">'+stays.map(s=>'<button type="button" class="escala-chip" data-stay="'+esc(s.id)+'" aria-pressed="false">+ '+esc(s.crl_residents?.full_name||'Acolhido')+'</button>').join('')+'</div>'+
  '<div id="diaryEntries"></div>'+
  '<div id="diaryReasonBox" class="hide"><label for="diaryReason">Motivo da alteração (ADM)</label><input id="diaryReason" maxlength="300" placeholder="Ex.: corrigir nome / faltou informação"></div>'+
  '<div class="escala-actions"><button type="button" id="diarySave" class="primary">Salvar diário</button><button type="button" id="diaryCancel" class="secondary hide">Cancelar alteração</button></div>';
}

export function bindDiary(context){
 ctx=context;st=fresh();
 const el=id=>document.getElementById(id);
 if(!el('diaryText'))return;
 el('diaryPeople').querySelectorAll('[data-stay]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.stay;
  if(st.picked.has(id))st.picked.delete(id);else st.picked.set(id,{tags:new Set(),note:''});
  renderPicked();
 });
 el('diarySave').onclick=save;
 el('diaryCancel').onclick=()=>{resetForm()};
 el('diaryAI').onclick=suggest;
 setupMic();
 renderPicked();
}
function nameOf(stayId){return ctx.stays.find(s=>s.id===stayId)?.crl_residents?.full_name||extraNames.get(stayId)||'Acolhido'}
function renderPicked(){
 const el=id=>document.getElementById(id);
 el('diaryPeople').querySelectorAll('[data-stay]').forEach(b=>{const on=st.picked.has(b.dataset.stay);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));b.textContent=(on?'✓ ':'+ ')+nameOf(b.dataset.stay)});
 const box=el('diaryEntries');box.replaceChildren();
 for(const [id,v] of st.picked){
  const row=document.createElement('div');row.className='diary-entry';
  row.innerHTML='<b>'+esc(nameOf(id))+'</b><div class="diary-tags">'+TAGS.map(([k,l])=>'<button type="button" class="diary-tag'+(v.tags.has(k)?' on tag-'+k:'')+'" data-tag="'+k+'">'+esc(l)+'</button>').join('')+'</div>'+
   '<input maxlength="2000" placeholder="O que aconteceu com ele (opcional)" value="'+esc(v.note)+'">';
  row.querySelectorAll('[data-tag]').forEach(t=>t.onclick=()=>{const k=t.dataset.tag;if(v.tags.has(k))v.tags.delete(k);else v.tags.add(k);t.classList.toggle('on',v.tags.has(k));t.classList.toggle('tag-'+k,v.tags.has(k))});
  row.querySelector('input').oninput=e=>{v.note=e.target.value};
  box.append(row);
 }
}
function resetForm(){
 st=fresh();
 const el=id=>document.getElementById(id);
 el('diaryText').value='';el('diaryDay').value=todaySP();el('diaryShift').value='dia';
 el('diaryReason').value='';el('diaryReasonBox').classList.add('hide');el('diaryCancel').classList.add('hide');
 el('diaryEditBanner').replaceChildren();el('diaryAIBox').replaceChildren();
 el('diaryTitle').textContent='Diário do dia';el('diarySave').textContent='Salvar diário';
 el('diaryDay').disabled=false;
 el('diaryPeople').querySelectorAll('[data-left]').forEach(b=>b.remove());extraNames.clear();
 renderPicked();
}
// Carrega um diário no formulário para alterar (ADM) ou corrigir (autor, quando reaberto)
function loadIntoForm(d){
 const el=id=>document.getElementById(id);
 st=fresh();st.id=d.id;
 const admin=ctx.member.role==='admin';
 el('diaryText').value=d.general_text;el('diaryDay').value=d.day;el('diaryShift').value=d.shift;
 el('diaryDay').disabled=!admin;
 for(const e of d.entries||[])st.picked.set(e.stay_id,{tags:new Set(e.tags||[]),note:e.note||''});
 // acolhidos que saíram continuam no diário (o ADM vê o nome)
 for(const e of d.entries||[])if(!ctx.stays.some(s=>s.id===e.stay_id)&&!extraNames.has(e.stay_id)){extraNames.set(e.stay_id,e.resident);const b=document.createElement('button');b.type='button';b.className='escala-chip';b.dataset.stay=e.stay_id;b.dataset.left='1';b.onclick=()=>{if(st.picked.has(e.stay_id))st.picked.delete(e.stay_id);else st.picked.set(e.stay_id,{tags:new Set(),note:''});renderPicked()};el('diaryPeople').append(b)}
 el('diaryReasonBox').classList.toggle('hide',!admin);
 el('diaryCancel').classList.remove('hide');
 el('diaryTitle').textContent=admin?'Alterar diário (ADM)':'Corrigir diário reaberto';
 el('diarySave').textContent=admin?'Salvar alteração':'Salvar correção';
 el('diaryEditBanner').innerHTML='<p class="doses-warn">'+(admin?'Alterando o diário de '+esc(longDay(d.day))+' escrito por '+esc(d.author)+'. O texto anterior fica na Auditoria.':'O ADM reabriu este diário: '+esc(d.reopen_reason||'')+'. Corrija e salve; depois ele fecha de novo.')+'</p>';
 renderPicked();
 document.getElementById('diaryTitle').scrollIntoView({behavior:'smooth',block:'start'});
}
async function save(){
 if(ctx.preview){ctx.status('Prévia apenas visual: volte ao ADM para salvar.',true);return}
 const el=id=>document.getElementById(id);
 const text=el('diaryText').value.trim();
 if(text.length<10){ctx.status('Escreva o que aconteceu no dia (pelo menos uma frase).',true);return}
 if(st.id&&ctx.member.role==='admin'&&el('diaryReason').value.trim().length<3){ctx.status('Informe o motivo da alteração.',true);return}
 if(!st.id&&!confirm('Salvar o diário? Depois de salvo, só o ADM consegue alterar.'))return;
 const entries=[...st.picked].map(([id,v])=>({stay_id:id,tags:[...v.tags],note:v.note.trim()||null}));
 const btn=el('diarySave');btn.disabled=true;
 const r=await ctx.db.rpc('crl_diary_save',{p_institution:ctx.member.institution_id,p_day:el('diaryDay').value,p_shift:el('diaryShift').value,
  p_general:text,p_entries:entries,p_raw:st.raw,p_ai_used:st.aiUsed,p_diary:st.id,p_reason:el('diaryReason').value.trim()||null});
 btn.disabled=false;
 if(r.error){ctx.status(errText(r.error),true);return}
 ctx.status(st.id?'Diário alterado. A versão anterior ficou na Auditoria.':'Diário salvo'+(entries.length?' com '+entries.length+' acolhido(s)':'')+'.');
 resetForm();
 await loadDiaries(ctx);
}

// 🎤 Ditado pelo navegador (Chrome no celular e no computador). Onde não houver, o microfone do teclado resolve.
let rec=null,listening=false;
function setupMic(){
 const btn=document.getElementById('diaryMic'),state=document.getElementById('diaryMicState'),area=document.getElementById('diaryText');
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){btn.onclick=()=>{ctx.status('Este navegador não dita direto. No celular, toque no microfone do teclado para ditar.',true);area.focus()};return}
 btn.onclick=()=>{
  if(listening){rec?.stop();return}
  rec=new SR();rec.lang='pt-BR';rec.continuous=true;rec.interimResults=true;
  let base=area.value.trim();
  rec.onresult=ev=>{
   let finals='',interim='';
   for(let i=ev.resultIndex;i<ev.results.length;i++){const t=ev.results[i][0].transcript;if(ev.results[i].isFinal)finals+=t;else interim+=t}
   if(finals){base=(base?base+' ':'')+finals.trim();base=base.replace(/(^|[.!?]\s+)([a-zà-ú])/g,(m,a,b)=>a+b.toUpperCase())}
   area.value=base+(interim?' '+interim:'');
  };
  rec.onstart=()=>{listening=true;btn.textContent='⏹ Parar';btn.classList.add('recording');state.textContent='Ouvindo... fale normalmente.'};
  rec.onend=()=>{listening=false;btn.textContent='🎤 Ditar';btn.classList.remove('recording');state.textContent='';area.value=base};
  rec.onerror=e=>{state.textContent=e.error==='not-allowed'?'Permita o uso do microfone para ditar.':'O ditado parou. Toque em Ditar de novo.'};
  rec.start();
 };
}

// ✨ Sugestão da IA: organiza o texto e sugere apontamentos/etiquetas. Só entra no diário se você aceitar.
async function suggest(){
 const el=id=>document.getElementById(id);
 const text=el('diaryText').value.trim();
 if(text.length<10){ctx.status('Dite ou escreva o que aconteceu antes de pedir a sugestão.',true);return}
 const box=el('diaryAIBox'),btn=el('diaryAI');
 btn.disabled=true;box.innerHTML='<p class="muted">✨ A IA está organizando o texto (os nomes vão trocados por códigos)...</p>';
 try{
  const r=await callFunction(ctx.db,'crl-diario-ia',{text});
  const entries=(r.entries||[]).filter(e=>ctx.stays.some(s=>s.id===e.stay_id));
  box.innerHTML='<div class="diary-ai"><b>Sugestão da IA</b><p class="muted">Confira antes de usar. Você pode mudar tudo depois.</p><div class="diary-ai-text"></div>'+
   (entries.length?'<div class="diary-ai-people">'+entries.map(e=>'<div><b>'+esc(nameOf(e.stay_id))+'</b> '+(e.tags||[]).map(t=>'<span class="diary-tag on tag-'+esc(t)+'">'+esc(TAG_LABEL[t]||t)+'</span>').join(' ')+(e.note?'<div class="muted">'+esc(e.note)+'</div>':'')+'</div>').join('')+'</div>':'<p class="muted">Nenhum acolhido identificado no texto.</p>')+
   '<div class="escala-actions"><button type="button" class="primary" data-use="1">Usar sugestão</button><button type="button" class="secondary" data-drop="1">Descartar</button></div></div>';
  box.querySelector('.diary-ai-text').textContent=r.general||'';
  box.querySelector('[data-drop]').onclick=()=>box.replaceChildren();
  box.querySelector('[data-use]').onclick=()=>{
   if(!st.raw)st.raw=text;st.aiUsed=true;
   el('diaryText').value=r.general||text;
   for(const e of entries){const cur=st.picked.get(e.stay_id)||{tags:new Set(),note:''};(e.tags||[]).forEach(t=>cur.tags.add(t));if(e.note&&!cur.note)cur.note=e.note;st.picked.set(e.stay_id,cur)}
   box.replaceChildren();renderPicked();
   ctx.status('Sugestão aplicada. Confira e salve. O texto ditado original fica guardado para o ADM.');
  };
 }catch(e){box.innerHTML='<p class="doses-warn">'+esc(errText(e))+'</p>'}
 finally{btn.disabled=false}
}

// Lista: diários recentes, com filtro por acolhido
export async function loadDiaries(context){
 ctx=context;const root=ctx.listRoot;root.replaceChildren();
 const head=document.createElement('div');head.className='op-head';
 head.innerHTML='<div class="op-month"><label for="diaryFilter">Ver o histórico de</label><select id="diaryFilter"><option value="">Todos os acolhidos</option>'+ctx.stays.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===filterStay?' selected':'')+'>'+esc(s.crl_residents?.full_name||'Acolhido')+'</option>').join('')+'</select></div>';
 root.append(head);
 head.querySelector('select').onchange=e=>{filterStay=e.target.value;loadDiaries(ctx)};
 const r=await ctx.db.rpc('crl_diary_list',{p_institution:ctx.member.institution_id,p_stay:filterStay||null,p_from:addDays(todaySP(),-60)});
 if(r.error){root.append(Object.assign(document.createElement('p'),{className:'danger',textContent:'Não foi possível abrir o diário: '+errText(r.error)}));return}
 const list=r.data||[];
 if(filterStay)root.append(statsBox(list,filterStay));
 if(!list.length){root.append(Object.assign(document.createElement('p'),{className:'muted',textContent:'Nenhum diário nos últimos 60 dias.'}));return}
 for(const d of list)root.append(diaryCard(d));
}
export function statsBox(list,stayId){
 const counts={},month=todaySP().slice(0,7);let mentions=0,monthMentions=0;
 for(const d of list)for(const e of d.entries||[])if(e.stay_id===stayId){mentions++;if(String(d.day).startsWith(month))monthMentions++;for(const t of e.tags||[])counts[t]=(counts[t]||0)+1}
 const box=document.createElement('div');box.className='diary-stats';
 box.innerHTML='<b>Perfil no diário</b><span class="muted"> · citado em '+mentions+' diário(s) nos últimos 60 dias ('+monthMentions+' neste mês)</span><div class="diary-tags">'+
  TAGS.map(([k,l])=>'<span class="diary-tag'+(counts[k]?' on tag-'+k:'')+'">'+esc(l)+': '+(counts[k]||0)+'</span>').join('')+'</div>';
 return box;
}
function diaryCard(d){
 const card=document.createElement('article');card.className='item diary-card'+(d.status==='reopened'?' is-reopened':'');
 const me=ctx.user?.id,admin=ctx.member.role==='admin';
 card.innerHTML='<div class="row"><b>'+esc(longDay(d.day))+' · '+esc(SHIFT_LABEL[d.shift]||d.shift)+'</b><span class="muted">por '+esc(d.author)+(d.ai_used?' · com ajuda da IA':'')+(d.edited?' · alterado':'')+'</span></div>'+
  (d.status==='reopened'?'<p class="doses-warn">Reaberto pelo ADM: '+esc(d.reopen_reason||'')+'</p>':'')+
  '<p class="diary-general"></p>'+
  ((d.entries||[]).length?'<div class="diary-card-people">'+d.entries.map(e=>'<div><b>'+esc(e.resident)+'</b> '+(e.tags||[]).map(t=>'<span class="diary-tag on tag-'+esc(t)+'">'+esc(TAG_LABEL[t]||t)+'</span>').join(' ')+(e.note?'<div class="muted">'+esc(e.note)+'</div>':'')+'</div>').join('')+'</div>':'');
 card.querySelector('.diary-general').textContent=d.general_text;
 if(admin&&d.raw_text&&d.raw_text!==d.general_text){
  const det=document.createElement('details');det.className='diary-raw';det.innerHTML='<summary>Ver o texto ditado original</summary><p></p>';det.querySelector('p').textContent=d.raw_text;card.append(det);
 }
 const bar=document.createElement('div');bar.className='change-actions';
 const add=(label,fn,cls='')=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;b.onclick=fn;bar.append(b)};
 if(admin){
  add('Alterar',()=>loadIntoForm(d));
  if(d.status!=='reopened')add('Reabrir para '+d.author,()=>askReason(card,'Por que reabrir? (quem escreveu vai ver)',async reason=>{const r=await ctx.db.rpc('crl_diary_reopen',{p_diary:d.id,p_reason:reason});if(r.error)throw r.error;ctx.status('Diário reaberto para '+d.author+' corrigir.')}));
  add('Excluir',()=>askReason(card,'Motivo da exclusão (fica na Auditoria)',async reason=>{const r=await ctx.db.rpc('crl_diary_delete',{p_diary:d.id,p_reason:reason});if(r.error)throw r.error;ctx.status('Diário excluído. Ele fica guardado na Auditoria.')}),'change-delete');
 }else if(d.status==='reopened'&&d.author_id===me){
  add('Corrigir agora',()=>loadIntoForm(d));
 }
 if(bar.children.length)card.append(bar);
 return card;
}
function askReason(card,label,run){
 const old=card.querySelector('.change-panel');if(old){old.remove();return}
 const p=document.createElement('div');p.className='change-panel';
 p.innerHTML='<label>'+esc(label)+'</label><input maxlength="300"><div class="change-buttons"><button type="button" class="change-danger">Confirmar</button><button type="button" class="change-cancel">Cancelar</button></div>';
 p.querySelector('.change-cancel').onclick=()=>p.remove();
 p.querySelector('.change-danger').onclick=async e=>{
  const reason=p.querySelector('input').value.trim();
  if(reason.length<3){ctx.status('Informe o motivo.',true);return}
  e.target.disabled=true;
  try{await run(reason);await loadDiaries(ctx)}catch(err){ctx.status(errText(err),true);e.target.disabled=false}
 };
 card.append(p);p.querySelector('input').focus();
}
