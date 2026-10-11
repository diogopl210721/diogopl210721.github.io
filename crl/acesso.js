import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://kwadhzmdaakxkztggigm.supabase.co','sb_publishable_8kEj3zY3ebOMZDYutUBv5A_wbLELNIM',{auth:{autoRefreshToken:true,persistSession:true}});
const el=id=>document.getElementById(id);
let member=null,user=null,stays=[],view='students',openTrips=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=iso=>{try{return new Date(iso).toLocaleString('pt-BR')}catch{return iso}};
const localTime=(date=new Date())=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
function status(s,error=false){let n=el('notice');n.textContent=s;n.className=error?'danger':'success'}
function field(label,id,type='text',required=true,value=''){return '<label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" '+(required?'required':'')+' value="'+esc(value)+'">'}
function stayOptions(){return stays.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.crl_residents?.full_name||'Acolhido')+'</option>').join('')}
function authenticated(){return Boolean(member?.active!==false && member?.institution_id && user?.id)}
async function signOut(){await db.auth.signOut();member=null;user=null;stays=[];el('appPanel').classList.add('hide');el('loginPanel').classList.remove('hide');el('password').value=''}
el('logout').onclick=signOut;
async function init(){
 const {data:{user:current},error}=await db.auth.getUser();
 if(error||!current)return;
 const m=await db.from('crl_members').select('institution_id,display_name,role,active').eq('auth_user_id',current.id).eq('active',true).maybeSingle();
 if(m.error||!m.data){await signOut();el('loginMessage').textContent='Conta não habilitada para a CRL. Procure o ADM.';return}
 user=current;member=m.data;
 el('loginPanel').classList.add('hide');el('appPanel').classList.remove('hide');
 el('identity').textContent=member.display_name+' · '+(member.role==='admin'?'Administrador':'Monitor');
 el('tabStats').style.display=member.role==='admin'?'':'none';
 el('tabHistory').style.display=member.role==='admin'?'':'none';
 await refresh();
}
el('loginForm').onsubmit=async e=>{
 e.preventDefault();
 const username=el('username').value.trim().toLowerCase();
 if(!/^[a-z0-9._-]{3,60}$/.test(username)){el('loginMessage').textContent='Nome de usuário inválido.';return}
 el('loginButton').disabled=true;el('loginMessage').textContent='Verificando acesso...';
 try{
 const r=await db.auth.signInWithPassword({email:username+'@crl.ddsinovacao.com.br',password:el('password').value});
 if(r.error){el('loginMessage').textContent='Usuário ou senha inválidos.';return}
 el('loginMessage').textContent='';await init();
 }finally{el('loginButton').disabled=false}
};
async function refresh(){
 if(!authenticated())return;
 const r=await db.from('crl_stays').select('id,resident_id,admission_date,crl_residents(full_name)').eq('institution_id',member.institution_id).eq('status','active').order('admission_date',{ascending:false});
 if(r.error){status('Não foi possível consultar os acolhidos.',true);return}
 stays=r.data||[];
 draw();
 await loadList();
}
function draw(){
 const forms={
 history:'<h2>Buscar ex-acolhidos</h2><p class="muted">Somente ADM. Pesquise o cadastro permanente por nome, confira as passagens e abra um novo período sem apagar o anterior.</p><form id="dataForm">'+field('Nome ou parte do nome','searchName','text',true)+'<button>Pesquisar histórico</button></form>',
 students:'<h2>Novo acolhimento</h2><form id="dataForm">'+field('Nome completo','name')+field('Data de entrada','date','date',true,new Date().toISOString().slice(0,10))+'<button>Cadastrar acolhido</button></form>',
 notes:'<h2>Registro individual</h2><form id="dataForm"><label>Acolhido</label><select id="stay" required>'+stayOptions()+'</select><label>Tipo</label><select id="category"><option value="rotina">Rotina</option><option value="ocorrencia">Ocorrência</option><option value="observacao">Observação</option></select><label>Relato</label><textarea id="description" required maxlength="10000"></textarea><p class="muted">Pode utilizar o ditado do teclado do celular. O texto original será preservado.</p><button>Registrar</button></form>',
 trips:'<h2>Abrir viagem</h2><form id="dataForm">'+field('Motorista','driver')+'<label>Finalidade</label><select id="purpose"><option>Buscar doações</option><option>Culto</option><option>Consulta médica</option><option>Ressocialização</option><option>Compras</option><option>Serviços</option><option>Outros</option></select>'+field('Destino','destination','text',false)+field('Acompanhantes','companions','text',false)+field('KM inicial','km','number')+field('Saída','departure','datetime-local',true,localTime())+'<button>Abrir viagem</button></form>',
 devotionals:'<h2>Nova devocional</h2><form id="dataForm">'+field('Tema / passagem bíblica','theme')+field('Quem ministrou','presenter')+field('Início','start','datetime-local',true,localTime())+field('Término','end','datetime-local',true,localTime(new Date(Date.now()+45*60000)))+'<h3>Presença dos acolhidos ativos</h3>'+(
 stays.length?stays.map(s=>'<div class="item"><b>'+esc(s.crl_residents?.full_name||'Acolhido')+'</b><div class="radio-group"><label><input type="radio" name="status_'+esc(s.id)+'" value="present" checked> Presente</label><label><input type="radio" name="status_'+esc(s.id)+'" value="absent"> Ausente</label><label><input type="radio" name="status_'+esc(s.id)+'" value="late"> Atrasou</label></div><input data-reason="'+esc(s.id)+'" placeholder="Justificativa quando houver falta"></div>').join(''):'<p>Nenhum acolhido ativo encontrado.</p>')+'<button '+(!stays.length?'disabled':'')+'>Finalizar e registrar presenças</button></form>',
 meals:'<h2>Registrar refeições servidas</h2><form id="dataForm"><label>Tipo de refeição</label><select id="mealType"><option value="cafe">Café da manhã</option><option value="almoco">Almoço</option><option value="jantar">Jantar</option><option value="lanche">Lanche</option><option value="outro">Outros</option></select>'+field('Quantidade de refeições servidas','servings','number')+field('Data e hora','servedAt','datetime-local',true,localTime())+field('Observações','mealNotes','text',false)+'<p class="muted">Registrar o número realmente servido, não uma estimativa.</p><button>Salvar refeições</button></form>',
 stats:'<h2>Indicadores gerais (ADM)</h2><form id="dataForm"><label>Mês</label><select id="month">'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'" '+(i===new Date().getMonth()?'selected':'')+'>'+['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][i]+'</option>').join('')+'</select>'+field('Ano','year','number',true,new Date().getFullYear())+'<button>Consultar dashboard</button></form>'
 };
 el('formArea').innerHTML=forms[view];
 el('listTitle').textContent=({history:'Resultados da busca',students:'Acolhidos ativos',notes:'Registros recentes',trips:'Viagens e quilômetros',devotionals:'Devocionais realizadas',meals:'Refeições registradas',stats:'Resumo do período'})[view];
 el('dataForm').onsubmit=submit;
}
function addItem(title,details){const item=document.createElement('div');item.className='item';const b=document.createElement('b');b.textContent=title;const p=document.createElement('div');p.className='muted';p.textContent=details;item.append(b,p);el('listArea').append(item);return item}
async function loadList(){
 const root=el('listArea');root.replaceChildren();
 if(view==='students'){
  if(!stays.length)root.textContent='Nenhum acolhido ativo cadastrado.';
  for(const st of stays){
    const item=addItem(st.crl_residents?.full_name||'Acolhido','Entrada: '+st.admission_date);
    if(member.role==='admin'){
      const b=document.createElement('button');b.textContent='Encerrar acolhimento';b.type='button';
      b.onclick=()=>showCloseStay(st,item);item.append(b);
    }
  }
  return;
 }
 if(view==='history'){
  root.textContent='Digite um nome para pesquisar as passagens anteriores.';
  return;
 }
 if(view==='stats'){root.textContent='Selecione mês e ano e consulte os indicadores administrativos.';return}
 if(view==='meals'){
  const r=await db.from('crl_meals').select('meal_type,servings,served_at').eq('institution_id',member.institution_id).order('served_at',{ascending:false}).limit(40);
  if(r.error){root.textContent='Falha ao consultar refeições.';return}
  if(!r.data.length)root.textContent='Nenhuma refeição registrada.';
  for(const m of r.data)addItem(m.meal_type+' • '+m.servings+' refeições',fmt(m.served_at));
  return;
 }
 if(view==='notes'){
  if(!stays.length){root.textContent='Nenhum registro ainda.';return}
  const r=await db.from('crl_records').select('id,category,original_text,created_at,stay_id,author_id,correction_of,correction_reason').eq('institution_id',member.institution_id).in('stay_id',stays.map(s=>s.id)).order('created_at',{ascending:false}).limit(25);
  if(r.error){root.textContent='Falha ao consultar registros.';return}
  if(!r.data.length)root.textContent='Nenhuma rotina registrada.';
  for(const x of r.data){const name=stays.find(s=>s.id===x.stay_id)?.crl_residents?.full_name||'Acolhido';const item=addItem(name+' • '+x.category+(x.correction_of?' (retificação)':''),fmt(x.created_at)+' — '+x.original_text+(x.correction_reason?' | Motivo: '+x.correction_reason:''));if(x.author_id===user.id||member.role==='admin'){const b=document.createElement('button');b.type='button';b.textContent='Retificar registro';b.onclick=()=>showNoteCorrection(x,item);item.append(b)}}
  return;
 }
 if(view==='devotionals'){
  const r=await db.from('crl_activities').select('title,presenter,starts_at,ends_at').eq('institution_id',member.institution_id).eq('type','devocional').order('starts_at',{ascending:false}).limit(25);
  if(r.error){root.textContent='Falha ao consultar devocionais.';return}
  if(!r.data.length)root.textContent='Nenhuma devocional finalizada.';
  for(const a of r.data)addItem(a.title,(a.presenter||'Ministrante não informado')+' • '+fmt(a.starts_at)+' a '+fmt(a.ends_at));
  return;
 }
 if(view==='trips'){
  const r=await db.from('crl_vehicle_trips').select('id,driver_name,purpose,destination,departure_at,arrival_at,km_initial,km_final,km_driven,created_by').eq('institution_id',member.institution_id).order('departure_at',{ascending:false}).limit(40);
  if(r.error){root.textContent='Falha ao consultar viagens.';return}
  if(!r.data.length)root.textContent='Nenhuma viagem cadastrada.';
  for(const t of r.data){
   const distance=t.km_driven==null?'Em andamento':Number(t.km_driven).toLocaleString('pt-BR')+' km';
   const item=addItem(t.purpose+' — '+t.driver_name,fmt(t.departure_at)+' • '+distance);
   if(!t.arrival_at && t.created_by===user.id){
    const bt=document.createElement('button');bt.textContent='Finalizar viagem';bt.type='button';
    bt.onclick=()=>showTripFinish(t,item);item.append(bt);
   }
   if(t.arrival_at && member.role==='admin'){
    const b=document.createElement('button');b.type='button';b.textContent='Retificar viagem (ADM)';b.onclick=()=>showTripRectification(t,item);item.append(b);
   }
  }
 }
}


function showCloseStay(st,item){
 if(member?.role!=='admin')return;
 const old=item.querySelector('form');if(old){old.remove();return}
 const form=document.createElement('form');
 form.innerHTML='<label>Tipo de saída</label><select name="exitType" required><option value="concluded">Conclusão de 9 meses</option><option value="requested">Alta pedida / desistência</option><option value="administrative">Alta administrativa</option><option value="abandoned">Fuga ou abandono</option><option value="other">Outro encerramento</option></select><label>Data de saída</label><input type="date" name="exitDate" required><label>Justificativa e informações da saída</label><textarea name="reason" required minlength="5" maxlength="4000"></textarea><p class="muted">Somente o ADM pode confirmar. A passagem encerrada e seus registros serão preservados.</p><button type="submit">Confirmar encerramento</button>';
 form.elements.exitDate.value=new Date().toISOString().slice(0,10);item.append(form);
 form.onsubmit=async e=>{
  e.preventDefault();if(!confirm('Confirma o encerramento deste período? O histórico não poderá ser apagado.'))return;
  const button=form.querySelector('button');button.disabled=true;
  try{
   const r=await db.rpc('crl_close_stay',{p_stay:st.id,p_status:form.elements.exitType.value,p_date:form.elements.exitDate.value,p_reason:form.elements.reason.value.trim()});
   if(r.error)throw r.error;
   status('Acolhimento encerrado; histórico preservado.');await refresh();
  }catch(e){status('Encerramento não realizado: '+(e?.message||'erro de validação'),true)}
  finally{button.disabled=false}
 };
}
async function searchHistory(query){
 if(member?.role!=='admin')return;
 const root=el('listArea');root.replaceChildren();
 if(query.length<3){root.textContent='Digite pelo menos três letras.';return}
 const r=await db.from('crl_residents').select('id,full_name').eq('institution_id',member.institution_id).ilike('full_name','%'+query+'%').order('full_name').limit(25);
 if(r.error){root.textContent='Não foi possível consultar o histórico.';return}
 if(!r.data?.length){root.textContent='Nenhum cadastro encontrado.';return}
 for(const person of r.data){
  const item=addItem(person.full_name,'Verificando períodos de acolhimento…');
  const history=await db.from('crl_stays').select('id,admission_date,departure_date,departure_reason,status').eq('institution_id',member.institution_id).eq('resident_id',person.id).order('admission_date',{ascending:false}).limit(30);
  const description=item.querySelector('.muted');description.textContent=history.error?'Histórico indisponível.':
    (history.data||[]).map(st=>st.admission_date+' → '+(st.departure_date||'ativo')+' · '+({
      active:'Ativo',concluded:'Concluiu',requested:'Alta pedida',administrative:'Administrativa',abandoned:'Abandono',other:'Outra saída'
    }[st.status]||st.status)).join(' | ')||'Sem passagens';
  if(!history.error && !(history.data||[]).some(st=>st.status==='active')){
   const b=document.createElement('button');b.type='button';b.textContent='Iniciar nova passagem';b.onclick=()=>showReadmission(person,item);item.append(b)
  }
 }
}
function showReadmission(person,item){
 if(member?.role!=='admin')return;
 const old=item.querySelector('form');if(old){old.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>Nova data de entrada</label><input type="date" name="admission" required><label>Contribuição mensal (R$) — zero = G5</label><input name="monthly" type="number" min="0" step="0.01" value="0" required><label>Dia do vencimento (opcional)</label><input name="due" type="number" min="1" max="31"><p class="muted">A contagem dos nove meses reinicia. As passagens anteriores permanecem disponíveis ao ADM.</p><button type="submit">Confirmar retorno</button>';
 f.elements.admission.value=new Date().toISOString().slice(0,10);item.append(f);
 f.onsubmit=async e=>{
  e.preventDefault();if(!confirm('Abrir um novo período de nove meses para este acolhido?'))return;
  const btn=f.querySelector('button');btn.disabled=true;
  try{
   const r=await db.rpc('crl_readmit_resident',{p_resident:person.id,p_date:f.elements.admission.value,p_monthly:Number(f.elements.monthly.value),p_due_day:f.elements.due.value===''?null:Number(f.elements.due.value)});
   if(r.error)throw r.error;
   status('Novo período iniciado e histórico anterior preservado.');
   view='students';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));await refresh();
  }catch(e){status('Não foi possível iniciar o retorno: '+(e?.message||'erro de validação'),true)}
  finally{btn.disabled=false}
 };
}

function showNoteCorrection(record,item){
 const existing=item.querySelector('form');if(existing){existing.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>Relato corrigido</label><textarea name="amendedText" required maxlength="10000"></textarea><label>Motivo da retificação</label><textarea name="reason" required maxlength="1200"></textarea><p class="muted">O registro anterior será preservado. Esta correção terá autor e horário próprios.</p><button>Salvar retificação</button>';
 f.elements.amendedText.value=record.original_text;item.append(f);
 f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
 const r=await db.rpc('crl_amend_record',{p_record:record.id,p_text:f.elements.amendedText.value.trim(),p_reason:f.elements.reason.value.trim()});
 b.disabled=false;if(r.error){status('Retificação não autorizada ou inválida.',true);return}status('Retificação registrada e original preservado.');await loadList();
 };
}
function showTripRectification(trip,item){
 const existing=item.querySelector('form');if(existing){existing.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>KM final corrigido (opcional)</label><input name="km" type="number" step="0.1" min="0" placeholder="Informe somente se precisar corrigir"><label>Chegada corrigida (opcional)</label><input name="arrival" type="datetime-local"><label>Observação corrigida (opcional)</label><textarea name="notes"></textarea><label>Justificativa da retificação</label><textarea name="reason" required></textarea><p class="muted">O histórico original não será apagado. A retificação fica separada e auditável.</p><button>Registrar retificação</button>';
 item.append(f);
 f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
 const km=f.elements.km.value.trim();const arrival=f.elements.arrival.value;const r=await db.rpc('crl_rectify_trip',{p_trip:trip.id,p_reason:f.elements.reason.value.trim(),p_km_final:km===''?null:Number(km),p_arrival:arrival?new Date(arrival).toISOString():null,p_notes:f.elements.notes.value.trim()||null});
 b.disabled=false;if(r.error){status('Não foi possível registrar a retificação.',true);return}status('Retificação registrada; viagem original preservada.');await loadList();
 };
}

function showTripFinish(trip,item){
 const existing=item.querySelector('form');if(existing){existing.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>KM inicial</label><div class="meter">'+esc(Number(trip.km_initial).toLocaleString('pt-BR'))+' km</div>'+field('KM final','final_'+trip.id,'number')+field('Chegada','arrive_'+trip.id,'datetime-local',true,localTime())+'<label>Devolvido limpo?</label><select id="clean_'+trip.id+'"><option value="true">Sim</option><option value="false">Não</option></select><label>Observações</label><textarea id="tripnote_'+trip.id+'"></textarea><div class="meter"><span>Distância percorrida: </span><strong id="distance_'+trip.id+'">—</strong></div><button>Confirmar chegada</button>';
 item.append(f);
 const k=el('final_'+trip.id);k.min=trip.km_initial;k.step='0.1';k.addEventListener('input',()=>{let km=Number(k.value)-Number(trip.km_initial);el('distance_'+trip.id).textContent=k.value!==''&&km>=0?km.toLocaleString('pt-BR')+' km':'—'});
 f.onsubmit=async e=>{
 e.preventDefault();const km=Number(k.value),arrive=el('arrive_'+trip.id).value;
 if(!Number.isFinite(km)||km<Number(trip.km_initial)||!arrive){status('Quilometragem ou horário inválido.',true);return}
 const btn=f.querySelector('button');btn.disabled=true;
 const r=await db.rpc('crl_finish_trip',{p_trip:trip.id,p_km_final:km,p_arrival:new Date(arrive).toISOString(),p_clean:el('clean_'+trip.id).value==='true',p_notes:el('tripnote_'+trip.id).value.trim()});
 btn.disabled=false;
 if(r.error){status('Não foi possível encerrar a viagem. Confira os dados e sua permissão.',true);return}
 status('Viagem finalizada: '+Number(r.data).toLocaleString('pt-BR')+' km rodados.');
 await loadList();
 }
}
document.querySelectorAll('[data-view]').forEach(btn=>btn.onclick=async()=>{view=btn.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===btn));draw();await loadList()});
function renderSummary(d){
 const list=el('listArea');list.replaceChildren();
 const rows=[
  ['Acolhidos ativos ao final do período',d.active_at_end],['Novas entradas',d.admissions],
  ['Acolhimentos encerrados',d.closed],['Conclusões registradas',d.concluded],
  ['Conclusões com 9 meses completos',d.concluded_nine_months],
  ['Desistências a pedido',d.requested_departures],['Abandonos',d.abandonments],
  ['Saídas administrativas',d.administrative_departures],['Quilômetros percorridos',d.kilometers+' km'],
  ['Alimentos recebidos',d.received_kg+' kg'],['Alimentos consumidos',d.consumed_kg+' kg'],
  ['Refeições servidas',d.meals_served],['Devocionais',d.devotionals]
 ];
 const grid=document.createElement('div');grid.className='metric-grid';
 for(const [label,val] of rows){const box=document.createElement('div');box.className='metric';const b=document.createElement('b');b.textContent=String(val??'—');const small=document.createElement('small');small.textContent=label;box.append(b,small);grid.append(box)}list.append(grid);
 const rate=document.createElement('div');rate.className='meter';rate.style.marginTop='12px';
 rate.textContent=d.closed===0?'Ainda não há acolhimentos encerrados no período para calcular a taxa.':'A cada 10 acolhimentos encerrados, '+d.nine_months_per_ten+' concluíram os nove meses ('+d.nine_month_completion_rate+'%).';
 list.append(rate);
 const note=document.createElement('p');note.className='muted';note.textContent='Taxa descritiva baseada em acolhimentos encerrados; não prevê a recuperação de ninguém. A interpretação por IA ainda não está conectada. Valores de contribuições exigem controle das datas efetivas de pagamento.';list.append(note);
}

async function submit(e){
 e.preventDefault();if(!authenticated())return;const form=el('dataForm'),btn=form.querySelector('button');btn.disabled=true;status('Salvando...');
 try{
  let result;
  if(view==='history'){
   if(member.role!=='admin')throw Error('permission');
   await searchHistory(el('searchName').value.trim());status('Pesquisa concluída.');return;
  }else if(view==='students'){
   result=await db.rpc('crl_admit_resident',{p_institution:member.institution_id,p_name:el('name').value.trim(),p_date:el('date').value});
  }else if(view==='notes'){
   result=await db.from('crl_records').insert({institution_id:member.institution_id,stay_id:el('stay').value,category:el('category').value,original_text:el('description').value.trim(),author_id:user.id});
  }else if(view==='trips'){
   const km=Number(el('km').value);if(!Number.isFinite(km)||km<0)throw Error('km');
   result=await db.from('crl_vehicle_trips').insert({institution_id:member.institution_id,driver_name:el('driver').value.trim(),purpose:el('purpose').value,destination:el('destination').value.trim(),companions:el('companions').value.trim(),km_initial:km,departure_at:new Date(el('departure').value).toISOString(),created_by:user.id});
  }else if(view==='meals'){
   const amount=Number(el('servings').value);if(!Number.isInteger(amount)||amount<=0)throw Error('quantity');
   result=await db.from('crl_meals').insert({institution_id:member.institution_id,meal_type:el('mealType').value,servings:amount,served_at:new Date(el('servedAt').value).toISOString(),notes:el('mealNotes').value.trim(),recorded_by:user.id});
  }else if(view==='stats'){
   if(member.role!=='admin')throw Error('permission');
   const year=Number(el('year').value),month=Number(el('month').value);if(year<2020||year>2100)throw Error('invalid_year');
   const start=year+'-'+String(month).padStart(2,'0')+'-01';const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
   result=await db.rpc('crl_dashboard_summary',{p_institution:member.institution_id,p_start:start,p_end:end});
   if(result.error)throw result.error;
   renderSummary(result.data);status('Indicadores consultados.');return;
  }else if(view==='devotionals'){
   const attendance=stays.map(s=>{const selected=document.querySelector('input[name="status_'+s.id+'"]:checked');return {stay_id:s.id,status:selected?.value||'present',justification:document.querySelector('[data-reason="'+s.id+'"]')?.value.trim()||''}});
   if(attendance.some(a=>a.status==='absent'&&a.justification.length<3)){status('Informe a justificativa de cada falta.',true);return}
   result=await db.rpc('crl_complete_devotional',{p_institution:member.institution_id,p_title:el('theme').value.trim(),p_presenter:el('presenter').value.trim(),p_starts_at:new Date(el('start').value).toISOString(),p_ends_at:new Date(el('end').value).toISOString(),p_attendance:attendance});
  }
  if(result?.error)throw result.error;
  status('Registro salvo com sucesso.');
  await refresh();
 }catch(error){status('Não foi possível salvar. Confira as informações ou consulte o ADM.',true)}
 finally{btn.disabled=false}
}
init();