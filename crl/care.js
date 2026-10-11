// CRL: controle administrativo de receitas e acompanhamento de ressocialização.
// Registros são históricos; a tela não prescreve medicamentos ou doses.
import {attachChanges,changeNote} from './changes.js';
const MED_STATUS=[['administrado','Administrado conforme receita'],['recusado','Recusado'],['nao_administrado','Não administrado'],['indisponivel','Medicamento indisponível']];
const RESOC_PURPOSES=['Visita familiar','Ressocialização programada','Compromisso pessoal autorizado','Culto','Outra atividade autorizada'];
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=s=>s?new Date(s).toLocaleString('pt-BR'):'—';
const optionStays=stays=>stays.map(st=>'<option value="'+h(st.id)+'">'+h(st.crl_residents?.full_name||'Acolhido')+'</option>').join('');
const csvSafe=s=>{const v=String(s??'').replace(/\r?\n/g,' ');return '"'+(/^\s*[=+\-@]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"'};
function exportCsv(name,rows){
 const content='\uFEFF'+rows.map(row=>row.map(csvSafe).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
let medicationExport=[],resocializationExport=[];
export function careForm(kind,stays){
 const options=optionStays(stays);
 const select='<label>Acolhido ativo</label><select id="careStay" required>'+options+'</select>';
 if(kind==='medications')return '<h2>Medicamentos e receitas</h2><p class="muted">Registre somente as informações que constam na prescrição. O ADM precisa conferir antes do monitor registrar uma administração.</p>'+
  '<form id="dataForm">'+select+
  '<label>Receita anexada ao prontuário</label><select id="carePrescription" required><option value="">Carregando receitas...</option></select>'+
  '<p class="muted">Se a receita ainda não foi enviada, abra o Prontuário do acolhido e use “Enviar foto da receita”.</p>'+
  '<label>Nome transcrito da receita</label><input id="careMedName" maxlength="180" required>'+
  '<label>Dose conforme a receita</label><input id="careDose" maxlength="200" required>'+
  '<label>Horário / frequência conforme a receita</label><input id="careSchedule" maxlength="500" required>'+
  '<label>Observações do registro</label><textarea id="careMedNotes" maxlength="1500" placeholder="Não faça recomendações de dose"></textarea>'+
  '<button '+(!stays.length?'disabled':'')+'>Enviar para conferência do ADM</button></form>';
 if(kind==='resocialization')return '<h2>Autorizar ressocialização</h2><p class="muted">O monitor pode abrir uma saída com justificativa, registrar quem busca o acolhido e confirmar seu retorno.</p>'+
  '<form id="dataForm">'+select+
  '<label>Finalidade</label><select id="carePurpose" required><option value="Visita familiar">Visita familiar</option><option value="Ressocialização programada">Ressocialização programada</option><option value="Compromisso pessoal autorizado">Compromisso pessoal autorizado</option><option value="Culto">Culto</option><option value="Outra atividade autorizada">Outra atividade autorizada</option></select>'+
  '<label>Justificativa da autorização</label><textarea id="careReason" maxlength="2000" required></textarea>'+
  '<label>Previsão de retorno (opcional)</label><input type="datetime-local" id="careExpected">'+
  '<label>Quem será o responsável pela busca?</label><input id="carePickup" maxlength="200" placeholder="Nome do responsável">'+
  '<label class="care-check"><input type="checkbox" id="careNoPickup"> Não haverá responsável para buscar (registrar sem acompanhante)</label>'+
  '<button '+(!stays.length?'disabled':'')+'>Autorizar e registrar saída</button></form>';
 return '';
}
export async function bindCare({db,member,el,kind,status}){
 if(kind==='medications'){
  const update=()=>loadPrescriptions({db,member,el,status});
  el('careStay')?.addEventListener('change',update);
  await update();
 }else if(kind==='resocialization'){
  const box=el('careNoPickup'),field=el('carePickup');
  if(box&&field)box.addEventListener('change',()=>{
   field.disabled=box.checked;if(box.checked)field.value='';
  });
 }
}
async function loadPrescriptions({db,member,el,status}){
 const input=el('carePrescription');if(!input)return;
 const stay=el('careStay')?.value;
 input.replaceChildren();
 const zero=document.createElement('option');zero.value='';zero.textContent='Selecione uma receita cadastrada';input.append(zero);
 if(!stay)return;
 const {data,error}=await db.from('crl_files')
  .select('id,created_at,category,description').eq('institution_id',member.institution_id)
  .eq('stay_id',stay).eq('category','receita').is('deleted_at',null).order('created_at',{ascending:false}).limit(100);
 if(error){status('Não foi possível consultar as receitas anexadas.',true);return}
 for(const file of data||[]){
  const opt=document.createElement('option');opt.value=file.id;
  opt.textContent=(file.description?file.description+' · ':'Receita · ')+'enviada em '+when(file.created_at);input.append(opt);
 }
 if(!data?.length)status('Nenhuma receita enviada para esse acolhido. Envie pelo Prontuário (Enviar foto da receita).',true);
}
export async function submitCare({db,member,el,kind,status,refresh}){
 if(!member?.institution_id)return;
 if(kind==='medications'){
  const data={
   p_stay:el('careStay').value,p_file:el('carePrescription').value||null,
   p_name:el('careMedName').value.trim(),p_dose:el('careDose').value.trim(),
   p_schedule:el('careSchedule').value.trim(),p_notes:el('careMedNotes').value.trim()||null
  };
  if(!data.p_file){status('Anexe uma receita antes de enviar à conferência.',true);return}
  const {error}=await db.rpc('crl_request_medication',data);
  if(error){status('Não foi possível registrar. Confira os dados da receita e a permissão.',true);return}
  status('Solicitação registrada. Aguarde conferência do ADM antes do acompanhamento.');
  el('careMedName').value='';el('careDose').value='';el('careSchedule').value='';el('careMedNotes').value='';
  await refresh();return;
 }
 if(kind==='resocialization'){
  const noPickup=el('careNoPickup').checked;
  const pickup=el('carePickup').value.trim();
  if(!noPickup&&pickup.length<3){status('Informe o responsável pela busca ou marque a ausência dele.',true);return}
  const expected=el('careExpected').value;
  const {error}=await db.rpc('crl_open_resocialization',{
   p_stay:el('careStay').value,p_purpose:el('carePurpose').value,
   p_justification:el('careReason').value.trim(),
   p_expected_return:expected?new Date(expected).toISOString():null,
   p_pickup:noPickup?null:pickup,p_no_pickup:noPickup
  });
  if(error){status('Não foi possível autorizar. Verifique se há outra saída aberta e os dados informados.',true);return}
  status('Saída autorizada, registrada e vinculada ao prontuário.');
  el('careReason').value='';el('carePickup').value='';el('careNoPickup').checked=false;el('carePickup').disabled=false;el('careExpected').value='';
  await refresh();
 }
}
function section(root,title){
 const wrap=document.createElement('section');wrap.className='care-list-section';
 const h3=document.createElement('h3');h3.textContent=title;wrap.append(h3);root.append(wrap);return wrap;
}
function item(root,title,body,detail){
 const el=document.createElement('div');el.className='item';
 const b=document.createElement('strong');b.textContent=title;
 const p=document.createElement('p');p.className='muted';p.textContent=body;
 el.append(b,p);if(detail){const s=document.createElement('small');s.textContent=detail;el.append(s)}
 root.append(el);return el;
}
function actionButton(container,label,callback){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=callback;container.append(b);return b;
}
function exportControls(root,name,rows,member){
 // Exportar/imprimir dados de saúde: somente ADM.
 if(member?.role!=='admin')return;
 const bar=document.createElement('div');bar.className='care-actions';
 const exp=actionButton(bar,'Exportar CSV',()=>{
  if(!confirm('Exportar dados pessoais e informações de saúde para este dispositivo?'))return;
  exportCsv(name,rows);
 });
 const print=actionButton(bar,'Imprimir / salvar PDF',()=>window.print());
 root.prepend(bar);
}
export async function loadCareList({db,member,user,stays,root,kind,status,filter='all'}){
 root.replaceChildren();
 if(kind==='medications')return loadMedicationList({db,member,user,stays,root,status,filter});
 if(kind==='resocialization')return loadResocializationList({db,member,user,stays,root,status,filter});
}
async function loadMedicationList({db,member,user,stays,root,status,filter='all'}){
 const reload=()=>loadCareList({db,member,user,stays,root,kind:'medications',status});
 if(!stays.length){root.textContent='Cadastre um acolhido ativo para acompanhar medicamentos.';return}
 const ids=stays.map(s=>s.id),lookup=id=>stays.find(s=>s.id===id)?.crl_residents?.full_name||'Acolhido';
 const [a,b]=await Promise.all([
  db.from('crl_medication_requests').select('id,stay_id,medication_name,dose_text,schedule_text,request_status,created_at,review_notes,prescription_file_id').eq('institution_id',member.institution_id).in('stay_id',ids).order('created_at',{ascending:false}).limit(100),
  db.from('crl_medication_records').select('id,stay_id,medication_name,dose_text,schedule_text,verified_by,created_at,corrected_at,correction_reason,suspended_at,suspension_reason').eq('institution_id',member.institution_id).in('stay_id',ids).order('created_at',{ascending:false}).limit(100)
 ]);
 if(a.error||b.error){root.textContent='Não foi possível consultar os medicamentos.';return}
 const requests=a.data||[],medications=b.data||[];
 const pending=section(root,'Aguardando conferência do ADM');
 if(!requests.filter(x=>x.request_status==='pending').length)pending.append(document.createTextNode('Nenhuma solicitação pendente.'));
 for(const req of requests.filter(x=>x.request_status==='pending')){
  const div=item(pending,lookup(req.stay_id)+' · '+req.medication_name,'Dose transcrita: '+req.dose_text+' · Horário: '+req.schedule_text,when(req.created_at));
  if(member.role==='admin'){
   actionButton(div,'Conferir receita e decidir',()=>reviewMedication({db,member,req,container:div,status,refresh:()=>loadCareList({db,member,stays,root,kind:'medications',status})}));
  }else div.append(document.createTextNode(' — Aguardando conferência administrativa.'));
 }
 if(filter==='pending')return;
 const approved=section(root,'Prescrições conferidas e acompanhamento');
 const activeMeds=medications.filter(m=>!m.suspended_at),suspendedMeds=medications.filter(m=>m.suspended_at);
 if(!activeMeds.length)approved.append(document.createTextNode('Nenhuma prescrição ativa.'));
 for(const med of activeMeds){
  const div=item(approved,lookup(med.stay_id)+' · '+med.medication_name,'Conforme receita: '+med.dose_text+' · '+med.schedule_text,(med.verified_by?'Conferido pelo ADM':'Sem conferência')+(med.corrected_at?' · '+changeNote(med):''));
  if(med.verified_by)actionButton(div,'Registrar administração / ocorrência',()=>logMedication({db,med,container:div,status,refresh:reload}));
  if(member.role==='admin')attachChanges(div,{db,status,entity:'medication',id:med.id,onDone:reload,
   edit:{label:'Corrigir',action:'correct',hint:'Corrija conforme a receita. O texto anterior fica guardado na Auditoria.',fields:[
    {key:'medication_name',label:'Nome do medicamento',value:med.medication_name,required:true},
    {key:'dose_text',label:'Dose conforme a receita',value:med.dose_text,required:true},
    {key:'schedule_text',label:'Horário / frequência',value:med.schedule_text,required:true}]},
   extra:[{label:'Suspender',action:'suspend',hint:'O medicamento deixa de aparecer para administração. O histórico continua no prontuário.',done:'Medicamento suspenso.'}]});
 }
 if(suspendedMeds.length){
  const susp=section(root,'Medicamentos suspensos');
  for(const med of suspendedMeds)item(susp,lookup(med.stay_id)+' · '+med.medication_name,med.dose_text+' · '+med.schedule_text,changeNote(med));
 }
 const recent=section(root,'Ocorrências recentes de medicamentos');
 if(medications.length){
  const {data,error}=await db.from('crl_medication_administrations').select('id,status,notes,occurred_at,medication_record_id,recorded_by,corrected_at,correction_reason')
   .eq('institution_id',member.institution_id).in('medication_record_id',medications.map(x=>x.id)).order('occurred_at',{ascending:false}).limit(60);
  if(!error){
   if(!data?.length)recent.append(document.createTextNode('Nenhuma ocorrência registrada.'));
   for(const evt of data||[]){const med=medications.find(x=>x.id===evt.medication_record_id);
    const label=(MED_STATUS.find(s=>s[0]===evt.status)||[,evt.status])[1];
    const div=item(recent,(med?lookup(med.stay_id)+' · '+med.medication_name:'Medicamento')+' · '+label,evt.notes||'Sem observação',when(evt.occurred_at)+(evt.corrected_at?' · '+changeNote(evt):''));
    if(member.role==='admin')attachChanges(div,{db,status,entity:'medication_event',id:evt.id,onDone:reload,
     edit:{label:'Corrigir',action:'correct',fields:[{key:'status',label:'O que aconteceu?',type:'select',value:evt.status,options:MED_STATUS},
      {key:'notes',label:'Observações ou justificativa',type:'textarea',value:evt.notes,max:1500}]}});
   }
  }else recent.append(document.createTextNode('Ocorrências indisponíveis.'));
 }
 const exportRows=[['Acolhido','Medicamento','Dose transcrita','Horários','Situação','Registrado em'],
  ...requests.map(x=>[lookup(x.stay_id),x.medication_name,x.dose_text,x.schedule_text,'Solicitação: '+x.request_status,when(x.created_at)]),
  ...medications.map(x=>[lookup(x.stay_id),x.medication_name,x.dose_text,x.schedule_text,'Conferido ADM',when(x.created_at)])];
 medicationExport=exportRows;exportControls(root,'CRL_medicamentos.csv',medicationExport,member);
}
function reviewMedication({db,member,req,container,status,refresh}){
 const prev=container.querySelector('form');if(prev){prev.remove();return}
 const form=document.createElement('form');
 form.innerHTML='<p class="muted">Confronte os dados digitados com a imagem da receita. Não aprove em caso de divergência; corrija o registro por nova solicitação.</p><label>Resultado da conferência</label><select name="decision"><option value="approve">Conferir e aprovar</option><option value="reject">Rejeitar</option></select><label>Justificativa da decisão</label><textarea name="note" minlength="3" maxlength="2000" required></textarea><div class="care-actions"><button type="button" name="viewFile">Visualizar receita</button><button type="submit">Confirmar decisão</button></div>';
 container.append(form);
 form.elements.viewFile.onclick=async()=>{
  const info=await db.from('crl_files').select('storage_path').eq('id',req.prescription_file_id).eq('institution_id',member.institution_id).maybeSingle();
  if(info.error||!info.data){status('Receita indisponível.',true);return}
  const r=await db.storage.from('crl-private').createSignedUrl(info.data.storage_path,180);
  if(r.error||!r.data?.signedUrl){status('Não foi possível abrir a receita.',true);return}
  window.open(r.data.signedUrl,'_blank','noopener,noreferrer');
 };
 form.onsubmit=async e=>{
  e.preventDefault();
  const approve=form.elements.decision.value==='approve';
  if(!confirm(approve?'Confirma que conferiu a prescrição original e aprovou os dados transcritos?':'Confirma a rejeição desta solicitação?'))return;
  const b=form.querySelector('button[type="submit"]');b.disabled=true;
  try{
   const r=await db.rpc('crl_review_medication_request',{p_request:req.id,p_approve:approve,p_review_note:form.elements.note.value.trim()});
   if(r.error)throw r.error;
   status(approve?'Prescrição conferida pelo ADM.':'Solicitação rejeitada com justificativa.');
   await refresh();
  }catch(_){status('Decisão não registrada. Verifique seus acessos.',true)}
  finally{b.disabled=false}
 };
}
function logMedication({db,med,container,status,refresh}){
 const old=container.querySelector('form');if(old){old.remove();return}
 const form=document.createElement('form');
 form.innerHTML='<label>O que aconteceu?</label><select name="event"><option value="administrado">Administrado conforme receita</option><option value="recusado">Recusado</option><option value="nao_administrado">Não administrado</option><option value="indisponivel">Medicamento indisponível</option></select><label>Observações ou justificativa</label><textarea name="notes" maxlength="1500" placeholder="Obrigatório em situações diferentes de administrado"></textarea><button type="submit">Salvar registro</button>';
 container.append(form);
 form.onsubmit=async e=>{
  e.preventDefault();
  const event=form.elements.event.value,note=form.elements.notes.value.trim();
  if(event!=='administrado'&&note.length<3){status('Explique por que a administração não ocorreu.',true);return}
  const b=form.querySelector('button');b.disabled=true;
  try{
   const r=await db.rpc('crl_record_medication_event',{p_medication:med.id,p_status:event,p_notes:note||null});
   if(r.error)throw r.error;
   status('Ocorrência registrada e arquivada no prontuário.');await refresh();
  }catch(_){status('Não foi possível registrar esta ocorrência.',true)}
  finally{b.disabled=false}
 };
}
async function loadResocializationList({db,member,user,stays,root,status,filter='all'}){
 const reload=()=>loadCareList({db,member,user,stays,root,kind:'resocialization',status});
 const ids=stays.map(x=>x.id);
 if(!ids.length){root.textContent='Não há acolhidos ativos.';return}
 const r=await db.from('crl_resocializations')
  .select('id,stay_id,purpose,justification,departure_at,expected_return_at,actual_return_at,picked_up_by,no_responsible_pickup,return_notes,authorization_by,created_at,corrected_at,correction_reason')
  .eq('institution_id',member.institution_id).in('stay_id',ids).order('departure_at',{ascending:false}).limit(120);
 if(r.error){root.textContent='Não foi possível consultar as ressocializações.';return}
 const lookup=id=>stays.find(s=>s.id===id)?.crl_residents?.full_name||'Acolhido';
 const list=r.data||[],open=section(root,'Saídas em andamento'),closed=section(root,'Últimos retornos');
 if(!list.some(x=>!x.actual_return_at))open.append(document.createTextNode('Nenhuma saída em andamento.'));
 if(!list.some(x=>x.actual_return_at))closed.append(document.createTextNode('Nenhum retorno registrado.'));
 for(const out of list){
  const responsible=out.no_responsible_pickup?'Sem responsável para buscar':(out.picked_up_by||'Não informado');
  if(filter==='open'&&out.actual_return_at)continue;
  const target=out.actual_return_at?closed:open;
  const el=item(target,lookup(out.stay_id)+' · '+out.purpose,
   'Saída: '+when(out.departure_at)+' · Previsto: '+when(out.expected_return_at)+' · '+responsible,
   'Justificativa: '+out.justification+(out.actual_return_at?' · Retorno: '+when(out.actual_return_at):'')+(out.corrected_at?' · '+changeNote(out):''));
  if(!out.actual_return_at)actionButton(el,'Registrar retorno',()=>showReturn({db,out,container:el,status,refresh:reload}));
  if(member.role==='admin'){
   const fields=[{key:'purpose',label:'Finalidade',type:'select',value:out.purpose,options:[...new Set([out.purpose,...RESOC_PURPOSES])].map(x=>[x,x])},
    {key:'justification',label:'Justificativa',type:'textarea',value:out.justification,required:true},
    {key:'departure_at',label:'Saída',type:'datetime-local',value:out.departure_at,required:true},
    {key:'expected_return_at',label:'Previsão de retorno',type:'datetime-local',value:out.expected_return_at},
    {key:'picked_up_by',label:'Quem buscou',value:out.picked_up_by},
    {key:'no_responsible_pickup',label:'Sem responsável para buscar',type:'checkbox',value:out.no_responsible_pickup}];
   if(out.actual_return_at)fields.push({key:'actual_return_at',label:'Retorno',type:'datetime-local',value:out.actual_return_at,required:true},{key:'return_notes',label:'Como foi o retorno',type:'textarea',value:out.return_notes});
   attachChanges(el,{db,status,entity:'resocialization',id:out.id,onDone:reload,edit:{label:'Corrigir',action:'correct',fields}});
  }
 }
 const rows=[['Acolhido','Finalidade','Saída','Retorno previsto','Retorno real','Responsável pela busca','Justificativa','Observações'],...list.map(x=>[
  lookup(x.stay_id),x.purpose,when(x.departure_at),when(x.expected_return_at),when(x.actual_return_at),
  x.no_responsible_pickup?'Sem responsável':x.picked_up_by,x.justification,x.return_notes
 ])];
 resocializationExport=rows;exportControls(root,'CRL_ressocializacoes.csv',resocializationExport,member);
}
function showReturn({db,out,container,status,refresh}){
 const previous=container.querySelector('form');if(previous){previous.remove();return}
 const form=document.createElement('form');
 form.innerHTML='<label>Como foi o retorno?</label><textarea name="returnNotes" minlength="3" maxlength="2000" required placeholder="Registre as informações relevantes, sem fazer diagnóstico"></textarea><button type="submit">Confirmar retorno</button>';
 container.append(form);
 form.onsubmit=async e=>{
  e.preventDefault();const b=form.querySelector('button');b.disabled=true;
  try{
   const r=await db.rpc('crl_close_resocialization',{p_id:out.id,p_return_notes:form.elements.returnNotes.value.trim()});
   if(r.error)throw r.error;
   status('Retorno registrado com data e hora e histórico preservado.');await refresh();
  }catch(_){status('Não foi possível registrar o retorno.',true)}
  finally{b.disabled=false}
 };
}
