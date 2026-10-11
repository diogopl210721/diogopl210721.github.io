// CRL — Escala semanal de tarefas.
// 1) Painel: escolha as tarefas da semana.  2) Ao lado de cada tarefa, escolha quem faz.  3) Finalize.
// Depois: a semana inteira numa tela larga, com ✓ fez / ✗ não fez (com justificativa) em cada dia.
// Regras no banco (crl_task_*): mudar escala finalizada pede motivo; marcação só até hoje;
// marcação já feita só muda pelo ADM ou por quem marcou, no mesmo dia. Tudo vai para a Auditoria.
import {canChange} from './changes.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAYS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const DAYS_FULL=['segunda','terça','quarta','quinta','sexta','sábado','domingo'];
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const br=iso=>iso?iso.slice(8,10)+'/'+iso.slice(5,7):'';
const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const mondayOf=iso=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)};
const errText=e=>String(e?.message||e||'').replace(/^CRL:\s*/,'')||'Não foi possível salvar.';

let week=null;          // segunda-feira da semana aberta
let data=null;          // resposta de crl_task_week_view
let draft=null;         // Map(tipo -> [stay_id,...]) enquanto monta/edita
let editing=false;
let ctx=null;

export function escalaForm(){return '<div id="escalaBuilder"><p class="muted">Carregando a escala...</p></div>'}

export async function loadEscala(context){
 ctx=context;
 if(!week)week=mondayOf(todaySP());
 const box=document.getElementById('escalaBuilder');
 if(box)box.innerHTML='<p class="muted">Carregando a escala...</p>';
 ctx.listRoot.replaceChildren(Object.assign(document.createElement('p'),{className:'muted',textContent:'Carregando a semana...'}));
 const r=await ctx.db.rpc('crl_task_week_view',{p_institution:ctx.member.institution_id,p_week_start:week});
 if(r.error||!r.data){
  if(box)box.innerHTML='<p class="danger">Não foi possível abrir a escala: '+esc(errText(r.error))+'</p>';
  ctx.listRoot.textContent='';return;
 }
 data=r.data;
 editing=!data.week||data.week.status!=='final';
 draft=draftFromData();
 renderBuilder();renderWeek();
}

function draftFromData(){
 const m=new Map();
 for(const a of data.assignments||[]){
  if(!a.task_type_id)continue;
  if(!m.has(a.task_type_id))m.set(a.task_type_id,[]);
  m.get(a.task_type_id).push(a.stay_id);
 }
 return m;
}
// Tarefas do painel + tarefas que estão na escala mas saíram do painel
function typeList(){
 const list=[...(data.types||[])];
 for(const a of data.assignments||[])if(a.task_type_id&&!list.some(t=>t.id===a.task_type_id))list.push({id:a.task_type_id,name:a.task_name});
 return list;
}
function stayOptions(selected){
 const opts=['<option value="">— escolha quem faz —</option>'];
 for(const s of ctx.stays)opts.push('<option value="'+esc(s.id)+'"'+(s.id===selected?' selected':'')+'>'+esc(s.crl_residents?.full_name||'Acolhido')+'</option>');
 return opts.join('');
}

function renderBuilder(){
 const box=document.getElementById('escalaBuilder');if(!box)return;
 const final=data.week?.status==='final';
 const thisWeek=mondayOf(todaySP());
 const head='<div class="escala-week-nav"><button type="button" data-nav="-7" aria-label="Semana anterior">◀</button>'+
  '<div><h2>Semana de '+br(week)+' a '+br(addDays(week,6))+'</h2><span class="escala-badge '+(final?'ok':data.week?'draft':'none')+'">'+
  (final?'Escala finalizada':data.week?'Rascunho — ainda não finalizada':'Escala ainda não montada')+'</span></div>'+
  '<button type="button" data-nav="7" aria-label="Próxima semana">▶</button></div>'+
  (week!==thisWeek?'<button type="button" class="escala-link" data-nav="today">Voltar para esta semana</button>':'');
 if(!editing){
  const n=(data.assignments||[]).length;
  box.innerHTML=head+'<p class="muted">'+n+' tarefa(s) na escala. Marque abaixo, em cada dia, se a pessoa fez ou não fez.</p>'+
   '<div class="escala-actions"><button type="button" id="escalaEdit" class="secondary">Editar escala</button><button type="button" id="escalaPrint" class="secondary">Imprimir para o mural</button></div>';
  bindNav(box);
  box.querySelector('#escalaEdit').onclick=()=>{editing=true;renderBuilder()};
  box.querySelector('#escalaPrint').onclick=printWeek;
  return;
 }
 const types=typeList();
 const chips=types.map(t=>'<button type="button" class="escala-chip'+(draft.has(t.id)?' on':'')+'" data-type="'+esc(t.id)+'" aria-pressed="'+draft.has(t.id)+'">'+(draft.has(t.id)?'✓ ':'+ ')+esc(t.name)+'</button>').join('');
 const chosen=types.filter(t=>draft.has(t.id));
 const rows=chosen.map(t=>{
  const people=draft.get(t.id);
  return '<div class="escala-assign" data-type="'+esc(t.id)+'"><b>'+esc(t.name)+'</b><div class="escala-people">'+
   people.map((sid,i)=>'<div class="escala-person"><select data-type="'+esc(t.id)+'" data-index="'+i+'" aria-label="Quem faz '+esc(t.name)+'">'+stayOptions(sid)+'</select>'+
    (people.length>1?'<button type="button" class="escala-x" data-type="'+esc(t.id)+'" data-remove="'+i+'" aria-label="Tirar esta pessoa">×</button>':'')+'</div>').join('')+
   '<button type="button" class="escala-link" data-type="'+esc(t.id)+'" data-more="1">+ mais uma pessoa nesta tarefa</button></div></div>';
 }).join('');
 box.innerHTML=head+
  '<h3 class="escala-step">1. Escolha as tarefas da semana</h3><p class="muted">Toque para marcar ou desmarcar.</p><div class="escala-chips">'+(chips||'<p class="muted">Nenhuma tarefa no painel. Crie uma abaixo.</p>')+'</div>'+
  '<details class="escala-manage"><summary>Arrumar a lista de tarefas</summary><div class="escala-new"><input id="escalaNewType" maxlength="80" placeholder="Nova tarefa (ex.: Galinheiro)"><button type="button" id="escalaAddType">Adicionar</button></div>'+
  '<div class="escala-remove-list">'+(data.types||[]).map(t=>'<span>'+esc(t.name)+' <button type="button" class="escala-x" data-deltype="'+esc(t.id)+'" aria-label="Tirar '+esc(t.name)+' do painel">×</button></span>').join('')+'</div></details>'+
  '<h3 class="escala-step">2. Ao lado de cada tarefa, escolha quem faz</h3>'+
  (rows||'<p class="muted">Marque pelo menos uma tarefa no passo 1.</p>')+
  (!ctx.stays.length?'<p class="danger">Nenhum acolhido ativo para colocar na escala.</p>':'')+
  (final?'<label for="escalaReason">Motivo da mudança</label><input id="escalaReason" maxlength="300" placeholder="Ex.: troca combinada com a equipe">':'')+
  '<div class="escala-actions">'+
   (final?'<button type="button" id="escalaSave" class="primary">Salvar alterações</button><button type="button" id="escalaCancel" class="secondary">Cancelar</button>':
    '<button type="button" id="escalaFinish" class="primary">Finalizar escala</button><button type="button" id="escalaDraft" class="secondary">Salvar rascunho</button>')+
   (!data.week&&!(data.assignments||[]).length?'<button type="button" id="escalaCopy" class="secondary">Copiar a escala da semana passada</button>':'')+
  '</div>';
 bindNav(box);
 box.querySelectorAll('.escala-chip').forEach(b=>b.onclick=()=>{
  const id=b.dataset.type;
  if(draft.has(id))draft.delete(id);else draft.set(id,['']);
  renderBuilder();
 });
 box.querySelectorAll('select[data-type]').forEach(s=>s.onchange=()=>{draft.get(s.dataset.type)[Number(s.dataset.index)]=s.value});
 box.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{draft.get(b.dataset.type).push('');renderBuilder()});
 box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{draft.get(b.dataset.type).splice(Number(b.dataset.remove),1);renderBuilder()});
 box.querySelector('#escalaAddType').onclick=addType;
 box.querySelector('#escalaNewType').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addType()}};
 box.querySelectorAll('[data-deltype]').forEach(b=>b.onclick=()=>removeType(b.dataset.deltype));
 box.querySelector('#escalaFinish')?.addEventListener('click',()=>save(true));
 box.querySelector('#escalaDraft')?.addEventListener('click',()=>save(false));
 box.querySelector('#escalaSave')?.addEventListener('click',()=>save(true));
 box.querySelector('#escalaCancel')?.addEventListener('click',()=>{editing=false;draft=draftFromData();renderBuilder()});
 box.querySelector('#escalaCopy')?.addEventListener('click',copyLastWeek);
}
function bindNav(box){
 box.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
  week=b.dataset.nav==='today'?mondayOf(todaySP()):addDays(week,Number(b.dataset.nav));
  loadEscala(ctx);
 });
}
async function addType(){
 const input=document.getElementById('escalaNewType');const name=input.value.trim();
 if(name.length<2){ctx.status('Escreva o nome da tarefa.',true);return}
 const r=await ctx.db.rpc('crl_task_type_add',{p_institution:ctx.member.institution_id,p_name:name});
 if(r.error){ctx.status(errText(r.error),true);return}
 ctx.status('Tarefa "'+name+'" adicionada ao painel.');
 const keep=draft;
 const v=await ctx.db.rpc('crl_task_week_view',{p_institution:ctx.member.institution_id,p_week_start:week});
 if(!v.error&&v.data){data=v.data}
 draft=keep;if(!draft.has(r.data))draft.set(r.data,['']);
 renderBuilder();
 document.querySelector('.escala-manage')?.setAttribute('open','');
}
async function removeType(id){
 const t=(data.types||[]).find(x=>x.id===id);
 if(!confirm('Tirar "'+(t?.name||'tarefa')+'" da lista de tarefas? O que já foi marcado continua guardado.'))return;
 const r=await ctx.db.rpc('crl_task_type_remove',{p_id:id});
 if(r.error){ctx.status(errText(r.error),true);return}
 data.types=(data.types||[]).filter(x=>x.id!==id);
 if(!(data.assignments||[]).some(a=>a.task_type_id===id))draft.delete(id);
 ctx.status('Tarefa tirada do painel.');
 renderBuilder();document.querySelector('.escala-manage')?.setAttribute('open','');
}
async function copyLastWeek(){
 const r=await ctx.db.rpc('crl_task_week_view',{p_institution:ctx.member.institution_id,p_week_start:addDays(week,-7)});
 if(r.error){ctx.status(errText(r.error),true);return}
 const active=new Set(ctx.stays.map(s=>s.id));
 const m=new Map();let skipped=0;
 for(const a of r.data.assignments||[]){
  if(!a.task_type_id)continue;
  if(!active.has(a.stay_id)){skipped++;continue}
  if(!m.has(a.task_type_id))m.set(a.task_type_id,[]);
  m.get(a.task_type_id).push(a.stay_id);
 }
 if(!m.size){ctx.status('A semana passada não tem escala para copiar.',true);return}
 draft=m;renderBuilder();
 ctx.status('Escala da semana passada copiada'+(skipped?' ('+skipped+' pessoa(s) que saíram ficaram de fora)':'')+'. Confira e finalize.');
}
async function save(finalize){
 if(ctx.preview){ctx.status('Prévia apenas visual: volte ao ADM para salvar.',true);return}
 const items=[];
 for(const [type,people] of draft)for(const sid of people){
  if(!sid){const name=typeList().find(t=>t.id===type)?.name||'tarefa';ctx.status('Escolha quem faz: '+name+'.',true);return}
  items.push({task_type_id:type,stay_id:sid});
 }
 if(finalize&&!items.length){ctx.status('Escolha pelo menos uma tarefa e quem vai fazer.',true);return}
 const reason=document.getElementById('escalaReason')?.value.trim()||null;
 const buttons=document.querySelectorAll('#escalaBuilder .escala-actions button');buttons.forEach(b=>b.disabled=true);
 const r=await ctx.db.rpc('crl_task_week_save',{p_institution:ctx.member.institution_id,p_week_start:week,p_items:items,p_finalize:finalize,p_reason:reason});
 buttons.forEach(b=>b.disabled=false);
 if(r.error){ctx.status(errText(r.error),true);return}
 ctx.status(finalize?(data.week?.status==='final'?'Escala alterada. A mudança ficou na Auditoria.':'Escala finalizada. Agora é só marcar, dia a dia, quem fez.'):'Rascunho salvo.');
 await loadEscala(ctx);
}

function checksMap(){
 const m=new Map();
 for(const c of data.checks||[])m.set(c.assignment_id+'|'+c.day,c);
 return m;
}
function renderWeek(){
 const root=ctx.listRoot;root.replaceChildren();
 const list=data.assignments||[];
 const today=data.today||todaySP();
 if(!list.length){
  root.innerHTML='<p class="muted">A escala da semana de '+br(week)+' ainda não tem tarefas. Monte no painel acima: escolha as tarefas e, ao lado de cada uma, quem faz.</p>';
  return;
 }
 const marks=checksMap();
 const days=[...Array(7)].map((_,i)=>addDays(week,i));
 if(days.includes(today)){
  let done=0,missed=0,open=0;
  for(const a of list){const c=marks.get(a.id+'|'+today);if(!c)open++;else if(c.done)done++;else missed++}
  const sum=document.createElement('div');sum.className='escala-summary';
  sum.innerHTML='<span class="ok">✓ '+done+' feitas hoje</span><span class="no">✗ '+missed+' não feitas</span><span class="open">'+open+' sem marcar</span>';
  root.append(sum);
 }
 const wrap=document.createElement('div');wrap.className='escala-scroll';
 const table=document.createElement('table');table.className='escala-table';
 table.innerHTML='<thead><tr><th scope="col">Tarefa · quem faz</th>'+days.map((d,i)=>'<th scope="col" class="'+(d===today?'today':'')+'">'+DAYS[i]+'<small>'+br(d)+'</small></th>').join('')+'</tr></thead>';
 const body=document.createElement('tbody');
 for(const a of list){
  const tr=document.createElement('tr');
  const th=document.createElement('th');th.scope='row';
  th.innerHTML='<b>'+esc(a.task_name)+'</b><span>'+esc(a.resident)+'</span>';
  tr.append(th);
  days.forEach((d,i)=>{
   const td=document.createElement('td');if(d===today)td.className='today';
   const c=marks.get(a.id+'|'+d);
   if(c){
    const tag=document.createElement(canChange(ctx.member,ctx.user,c.checked_by,c.checked_at)&&a.active?'button':'span');
    tag.className='escala-mark '+(c.done?'ok':'no');
    tag.textContent=c.done?'✓ Fez':'✗ Não fez';
    tag.title=(c.done?'Fez':'Não fez: '+(c.justification||''))+' — marcado por '+(c.by||'equipe');
    if(tag.tagName==='BUTTON'){tag.type='button';tag.onclick=()=>askMark(a,d,i,c)}
    td.append(tag);
    if(!c.done&&c.justification){const s=document.createElement('small');s.className='escala-why';s.textContent=c.justification;td.append(s)}
   }else if(d<=today&&a.active){
    const ok=document.createElement('button');ok.type='button';ok.className='escala-btn ok';ok.textContent='✓';ok.title='Fez';ok.setAttribute('aria-label',a.resident+' fez '+a.task_name+' na '+DAYS_FULL[i]);
    ok.onclick=()=>mark(a,d,true,null,ok);
    const no=document.createElement('button');no.type='button';no.className='escala-btn no';no.textContent='✗';no.title='Não fez';no.setAttribute('aria-label',a.resident+' não fez '+a.task_name+' na '+DAYS_FULL[i]);
    no.onclick=()=>askMark(a,d,i,null,true);
    td.append(ok,no);
   }else{td.innerHTML='<span class="escala-future">·</span>'}
   tr.append(td);
  });
  body.append(tr);
 }
 table.append(body);wrap.append(table);root.append(wrap);
 // No celular, a tabela já abre mostrando o dia de hoje
 const todayHead=table.querySelector('thead th.today'),first=table.querySelector('thead th');
 if(todayHead&&wrap.scrollWidth>wrap.clientWidth)wrap.scrollLeft=Math.max(0,todayHead.offsetLeft-first.offsetWidth-8);
 const box=document.createElement('div');box.id='escalaAsk';root.append(box);
 const note=document.createElement('p');note.className='muted';
 note.textContent='Toque em ✓ quando a pessoa fez e em ✗ quando não fez (pede justificativa). Dá para marcar até o dia de hoje. Uma marcação feita só pode ser trocada pelo ADM ou por quem marcou, no mesmo dia.';
 root.append(note);
}
function askMark(a,day,i,current,startNo=false){
 const box=document.getElementById('escalaAsk');if(!box)return;
 box.className='escala-ask';
 box.innerHTML='<b>'+esc(a.task_name)+' — '+esc(a.resident)+'</b><span class="muted"> · '+DAYS_FULL[i]+', '+br(day)+'</span>'+
  (startNo?'':'<div class="escala-actions"><button type="button" data-v="1" class="secondary">✓ Fez</button><button type="button" data-v="0" class="secondary">✗ Não fez</button></div>')+
  '<div class="escala-why-box'+(startNo?'':' hide')+'"><label for="escalaWhy">Por que não fez?</label><input id="escalaWhy" maxlength="500" placeholder="Ex.: estava na consulta médica" value="'+esc(current&&!current.done?current.justification:'')+'">'+
  '<div class="escala-actions"><button type="button" id="escalaWhySave" class="primary">Salvar “não fez”</button><button type="button" id="escalaWhyCancel" class="secondary">Cancelar</button></div></div>';
 box.scrollIntoView({behavior:'smooth',block:'center'});
 const why=box.querySelector('.escala-why-box');
 box.querySelector('[data-v="1"]')?.addEventListener('click',e=>mark(a,day,true,null,e.target));
 box.querySelector('[data-v="0"]')?.addEventListener('click',()=>{why.classList.remove('hide');box.querySelector('#escalaWhy').focus()});
 box.querySelector('#escalaWhyCancel').onclick=()=>{box.className='';box.replaceChildren()};
 box.querySelector('#escalaWhySave').onclick=e=>{
  const text=box.querySelector('#escalaWhy').value.trim();
  if(text.length<3){ctx.status('Escreva a justificativa de não ter feito.',true);return}
  mark(a,day,false,text,e.target);
 };
 if(startNo)box.querySelector('#escalaWhy').focus();
}
async function mark(a,day,done,justification,button){
 if(ctx.preview){ctx.status('Prévia apenas visual: volte ao ADM para salvar.',true);return}
 if(button)button.disabled=true;
 const r=await ctx.db.rpc('crl_task_check',{p_assignment:a.id,p_day:day,p_done:done,p_justification:justification});
 if(r.error){if(button)button.disabled=false;ctx.status(errText(r.error),true);return}
 ctx.status(done?'Marcado: '+a.resident+' fez '+a.task_name+'.':'Marcado como não feito, com a justificativa.');
 const v=await ctx.db.rpc('crl_task_week_view',{p_institution:ctx.member.institution_id,p_week_start:week});
 if(!v.error&&v.data)data=v.data;
 renderWeek();
}
function printWeek(){
 const days=[...Array(7)].map((_,i)=>addDays(week,i));
 const marks=checksMap();
 const rows=(data.assignments||[]).map(a=>'<tr><th>'+esc(a.task_name)+'<br><span>'+esc(a.resident)+'</span></th>'+days.map(d=>{const c=marks.get(a.id+'|'+d);return '<td>'+(c?(c.done?'✓':'✗'):'')+'</td>'}).join('')+'</tr>').join('');
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Escala de tarefas</title><style>body{font:14px Arial,sans-serif;margin:28px;color:#1f2430}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:9px 6px;text-align:center}thead th{background:#f1f1f1}tbody th{text-align:left;font-size:15px}tbody th span{font-weight:400;color:#444}td{width:11%;font-size:18px}</style></head><body>'+
  '<h1>CRL — Escala de tarefas</h1><p>Semana de '+br(week)+' a '+br(addDays(week,6))+' · marque ✓ fez ou ✗ não fez</p>'+
  '<table><thead><tr><th>Tarefa · quem faz</th>'+days.map((d,i)=>'<th>'+DAYS[i]+'<br>'+br(d)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></body></html>';
 const w=window.open('about:blank','_blank');
 if(!w){ctx.status('Permita janelas pop-up para imprimir a escala.',true);return}
 try{w.opener=null}catch(_){}
 w.document.open();w.document.write(html);w.document.close();w.focus();w.print();
}
