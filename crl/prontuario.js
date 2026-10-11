// CRL — prontuário operacional. Todos os dados são consultados sob RLS do Supabase.
// Monitores visualizam somente a passagem ativa; ADM pode consultar o histórico.
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateOnly=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const dateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const isValidId=id=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(id||''));
const node=(tag,text='',className='')=>{
 const n=document.createElement(tag);if(text!==null)n.textContent=String(text);if(className)n.className=className;return n
};
const detail=(title,content)=>{
 const box=node('section',null,'prontuario-section');
 box.append(node('h3',title));
 if(content&&content.nodeType)box.append(content);else box.append(node('p',content||'Nenhum registro disponível.','muted'));
 return box;
};
const line=(title,body,meta='')=>{
 const div=node('div',null,'record-line');
 div.append(node('strong',title));
 if(meta)div.append(node('small',meta));
 div.append(node('p',body||'—'));
 return div;
};
const listBox=rows=>{
 const box=node('div',null,'profile-items');
 rows.forEach(x=>box.append(x));
 return box;
};
const csvCell=v=>'"'+String(v??'').replace(/"/g,'""').replace(/\r?\n/g,' ')+'"';
function saveCsv(filename,items){
 const content='\uFEFF'+items.map(row=>row.map(csvCell).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function addPrintStyle(){
 if(document.getElementById('prontuarioPrintStyle'))return;
 const style=document.createElement('style');style.id='prontuarioPrintStyle';
 style.textContent='.prontuario-card{background:#fff;border:1px solid #e3e6ec;border-radius:15px;padding:16px;margin:10px 0 18px}.prontuario-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.prontuario-top h2{margin:0}.prontuario-controls{display:flex;gap:8px;flex-wrap:wrap}.prontuario-controls button{font-size:12px;min-height:36px}.prontuario-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:13px 0}.prontuario-kpi{background:#f7f8fa;border:1px solid #edf0f3;border-radius:10px;padding:12px}.prontuario-kpi span{display:block;color:#64748b;font-size:11px}.prontuario-kpi b{font-size:17px}.prontuario-section{padding:13px 0;border-top:1px solid #e7e9ef}.prontuario-section h3{font-size:14px;margin:0 0 9px}.profile-items{display:grid;gap:7px}.record-line{padding:10px 12px;background:#f8f9fb;border-radius:10px}.record-line strong{display:block;font-size:12px}.record-line small{display:block;font-size:11px;color:#707a87;margin-top:3px}.record-line p{margin:6px 0 0;font-size:13px;color:#273141;white-space:pre-wrap}.profile-warning{font-size:12px;color:#695013;background:#fff8e9;border-radius:9px;padding:8px 10px}.profile-files{display:flex;flex-wrap:wrap;gap:8px}.profile-files button{font-size:12px}.prontuario-print{font:13px Arial,sans-serif;padding:25px;color:#1f2430}.prontuario-print h1{font-size:21px;color:#d6283b}.prontuario-print h2{font-size:15px;border-bottom:1px solid #ddd;margin-top:22px}.prontuario-print p{white-space:pre-wrap;line-height:1.45}.prontuario-print .print-entry{border-bottom:1px solid #eee;padding:7px 0}.prontuario-print small{display:block;color:#666}@media(max-width:720px){.prontuario-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.prontuario-card{padding:12px}}';
 document.head.append(style);
}
export const prontuarioForm=stays=>'<h2>Prontuário do acolhido</h2><p class="muted">Consulte a passagem ativa, os registros e documentos autorizados. O histórico é preservado mesmo após a saída.</p><form id="dataForm"><label>Acolhido ativo</label><select id="profileStay" required>'+stays.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.crl_residents?.full_name||'Acolhido')+'</option>').join('')+'</select><button type="submit" '+(!stays.length?'disabled':'')+'>Abrir prontuário</button></form><p class="muted">Para ex-acolhidos, o ADM utiliza Histórico e retornos.</p>';
export async function loadProntuario({db,member,stays,stayId,root,status}){
 addPrintStyle();
 root.replaceChildren();
 if(!member?.institution_id||!isValidId(stayId)) {root.textContent='Selecione um acolhido para abrir o prontuário.';return}
 const active=stays.some(s=>s.id===stayId);
 if(!active&&member.role!=='admin'){root.textContent='Prontuário de passagem encerrada: acesso restrito ao ADM.';return}
 root.append(node('p','Carregando registros autorizados...','muted'));
 const tenant=member.institution_id;
 const stayRes=await db.from('crl_stays').select('id,resident_id,admission_date,departure_date,status,departure_reason,monthly_contribution,crl_residents(id,full_name,birth_date,cpf,rg,responsible_name,responsible_phone)').eq('id',stayId).eq('institution_id',tenant).maybeSingle();
 if(stayRes.error||!stayRes.data){root.textContent='Prontuário não encontrado ou acesso não autorizado.';return}
 const st=stayRes.data;
 if(member.role!=='admin'&&st.status!=='active'){root.textContent='Acesso restrito ao ADM.';return}
 const person=Array.isArray(st.crl_residents)?st.crl_residents[0]:st.crl_residents;
 if(!person){root.textContent='Cadastro não encontrado.';return}
 const queries={
  records:db.from('crl_records').select('id,category,original_text,created_at,correction_of,correction_reason').eq('institution_id',tenant).eq('stay_id',stayId).order('created_at',{ascending:false}).limit(250),
  attendance:db.from('crl_attendance').select('status,justification,crl_activities(title,type,starts_at,presenter)').eq('institution_id',tenant).eq('stay_id',stayId).limit(250),
  tasks:db.from('crl_tasks').select('title,status,due_at,recurrence').eq('institution_id',tenant).eq('stay_id',stayId).order('due_at',{ascending:false}).limit(250),
  files:db.from('crl_files').select('category,storage_path,created_at').eq('institution_id',tenant).eq('stay_id',stayId).order('created_at',{ascending:false}).limit(200),
  medications:db.from('crl_medication_records').select('medication_name,dose_text,schedule_text,verified_by').eq('institution_id',tenant).eq('stay_id',stayId).limit(80),
 };
 if(member.role==='admin'){
  queries.history=db.from('crl_stays').select('admission_date,departure_date,status,departure_reason').eq('institution_id',tenant).eq('resident_id',person.id).order('admission_date',{ascending:false}).limit(100);
  queries.documents=db.from('crl_documents').select('document_number,issued_on,pdf_storage_path,template_type').eq('institution_id',tenant).eq('stay_id',stayId).eq('status','approved').order('issued_on',{ascending:false}).limit(100);
  queries.contributions=db.from('crl_contributions').select('amount,paid_amount,due_date').eq('institution_id',tenant).eq('stay_id',stayId).order('due_date',{ascending:false}).limit(100);
 }
 const entries=Object.entries(queries);
 const promises=await Promise.allSettled(entries.map(([,q])=>q));
 const results={};const failed=[];
 entries.forEach(([key],i)=>{
  const a=promises[i];const result=a.status==='fulfilled'?a.value:{error:{message:'Falha de conexão'}};
  if(result.error){failed.push(key);results[key]=[]}else results[key]=result.data||[]
 });
 if(!root.isConnected||document.getElementById('profileStay')?.value!==stayId)return;
 root.replaceChildren();
 const card=node('div',null,'prontuario-card');
 const heading=node('div',null,'prontuario-top');
 const desc=node('div');desc.append(node('h2',person.full_name),node('p',st.status==='active'?'Acolhimento ativo':'Passagem encerrada: '+st.status,'muted'));
 const controls=node('div',null,'prontuario-controls');const csv=node('button','Exportar registros (CSV)');
 const print=node('button','Imprimir / salvar PDF');
 csv.type='button';print.type='button';
 controls.append(csv,print);heading.append(desc,controls);card.append(heading);
 const days=Math.max(0,Math.floor((new Date((st.departure_date||new Date().toISOString().slice(0,10))+'T12:00:00Z')-new Date(st.admission_date+'T12:00:00Z'))/86400000));
 const count=(key)=>failed.includes(key)?'Indisponível':String(results[key].length);
 const kpis=[
 ['Entrada',dateOnly(st.admission_date)],
 ['Dias de permanência',days],
 ['Registros',count('records')],
 ['Devocionais registradas',count('attendance')],
 ['Tarefas',count('tasks')],
 ['Anexos',count('files')]
 ];
 const grid=node('div',null,'prontuario-grid');
 kpis.forEach(([label,value])=>{let box=node('div',null,'prontuario-kpi');box.append(node('span',label),node('b',value));grid.append(box)});
 card.append(grid);
 if(failed.length)card.append(node('p','Algumas seções não puderam ser carregadas: '+failed.join(', ')+'. Exportações também poderão estar incompletas.','profile-warning'));
 let basic=['Responsável: '+(person.responsible_name||'Não informado')];
 if(member.role==='admin')basic.push('CPF: '+(person.cpf||'Não informado')+'  |  RG: '+(person.rg||'Não informado')+'  |  Telefone do responsável: '+(person.responsible_phone||'Não informado'));
 card.append(detail('Identificação e vínculo',basic.join('\n')));
 const records=results.records.map(x=>line((x.correction_of?'Retificação — ':'')+(x.category||'Registro'),x.original_text+(x.correction_reason?'\nMotivo da correção: '+x.correction_reason:''),dateTime(x.created_at)));
 card.append(detail('Registros do prontuário',records.length?listBox(records):null));
 const attend=results.attendance.map(x=>{
  const activity=Array.isArray(x.crl_activities)?x.crl_activities[0]:x.crl_activities;
  return line(activity?.title||'Devocional',x.status+(x.justification?' · Justificativa: '+x.justification:''),dateTime(activity?.starts_at)+' · '+(activity?.presenter||''));
 });
 card.append(detail('Participação em devocionais',attend.length?listBox(attend):null));
 if(!failed.includes('attendance')&&results.attendance.length){
   const statuses=results.attendance.reduce((m,a)=>(m[a.status]=(m[a.status]||0)+1,m),{});
   const p=(statuses.present||0),l=(statuses.late||0),a=(statuses.absent||0),e=(statuses.excused||0);
   const fraction=Math.round(100*(p+l)/results.attendance.length);
   card.append(node('p','Resumo das marcações consultadas: '+(p+l)+' de '+results.attendance.length+' presenças ('+fraction+'%). Faltas: '+a+'; justificadas: '+e+'. Este indicador não é uma avaliação clínica.','profile-warning'));
 }
 const tasks=results.tasks.map(x=>line(x.title,x.status||'Programada',dateTime(x.due_at)+(x.recurrence?' · '+x.recurrence:'')));
 card.append(detail('Tarefas atribuídas',tasks.length?listBox(tasks):null));
 const med=results.medications.map(x=>line(x.medication_name,(x.dose_text||'Dose não informada')+' · '+(x.schedule_text||'Horário não informado'),x.verified_by?'Conferido pelo ADM':'Pendente de conferência ADM'));
 card.append(detail('Medicamentos — registro operacional',med.length?listBox(med):null));
 card.append(node('p','Informações de medicamentos são somente registros operacionais e não substituem prescrição ou orientação profissional.','profile-warning'));
 const files=node('div',null,'profile-files');
 results.files.forEach(f=>{
  const b=node('button',f.category+' · '+dateTime(f.created_at));b.type='button';
  b.onclick=async()=>{
   const res=await db.storage.from('crl-private').createSignedUrl(f.storage_path,180);
   if(res.error||!res.data?.signedUrl){status('Arquivo indisponível ou acesso negado.',true);return}
   window.open(res.data.signedUrl,'_blank','noopener,noreferrer');
  };files.append(b)
 });
 card.append(detail('Documentos e fotografias',results.files.length?files:null));
 if(member.role==='admin'){
  const pdfList=node('div',null,'profile-files');
  results.documents.forEach(d=>{
   const b=node('button',(d.document_number||'Declaração')+' · '+dateOnly(d.issued_on));b.type='button';
   b.onclick=async()=>{
    const r=await db.storage.from('crl-documents').createSignedUrl(d.pdf_storage_path,180);
    if(r.error||!r.data?.signedUrl){status('PDF não encontrado ou acesso negado.',true);return}
    window.open(r.data.signedUrl,'_blank','noopener,noreferrer');
   };pdfList.append(b);
  });
  card.append(detail('Declarações oficiais (ADM)',results.documents.length?pdfList:null));
 }
 if(member.role==='admin'){
  const hist=results.history.map(x=>line('Entrada: '+dateOnly(x.admission_date),(x.departure_date?'Saída: '+dateOnly(x.departure_date):'Em andamento')+(x.departure_reason?' · '+x.departure_reason:''),x.status));
  card.append(detail('Histórico de passagens (ADM)',hist.length?listBox(hist):null));
  const cont=results.contributions.map(x=>line('Vencimento '+dateOnly(x.due_date),'Mensalidade: '+money(x.amount)+' · Recebido: '+money(x.paid_amount)+' · Saldo: '+money(Number(x.amount)-Number(x.paid_amount))));
  card.append(detail('Contribuições desta passagem (ADM)',cont.length?listBox(cont):null));
 }
 root.append(card);
 const exportRows=[['CRL — PRONTUÁRIO',''],['Acolhido',person.full_name],['Admissão',dateOnly(st.admission_date)],['Situação',st.status],['Exportação',new Date().toLocaleString('pt-BR')],['Categoria','Data','Descrição','Detalhe']];
 results.records.forEach(x=>exportRows.push(['Registro',dateTime(x.created_at),x.category,x.original_text+(x.correction_reason?' | Retificação: '+x.correction_reason:'')]));
 results.attendance.forEach(x=>{const ac=Array.isArray(x.crl_activities)?x.crl_activities[0]:x.crl_activities;exportRows.push(['Devocional',dateTime(ac?.starts_at),ac?.title,x.status+(x.justification?' | '+x.justification:'')])});
 results.tasks.forEach(x=>exportRows.push(['Tarefa',dateTime(x.due_at),x.title,x.status]));
 results.files.forEach(x=>exportRows.push(['Arquivo',dateTime(x.created_at),x.category,'Arquivo privado; não incluído na exportação CSV']));
 results.medications.forEach(x=>exportRows.push(['Medicamento — registro operacional','',x.medication_name,(x.dose_text||'')+' · '+(x.schedule_text||'')+(x.verified_by?' · Conferido ADM':' · Não conferido pelo ADM')]));
 if(member.role==='admin'){
  results.history.forEach(x=>exportRows.push(['Passagem',dateOnly(x.admission_date),x.status,dateOnly(x.departure_date)]));
  results.documents.forEach(x=>exportRows.push(['Declaração oficial',dateOnly(x.issued_on),x.document_number,'Arquivo PDF em armazenamento privado']));
  results.contributions.forEach(x=>exportRows.push(['Contribuição',dateOnly(x.due_date),money(x.amount),money(x.paid_amount)]));
 }
 csv.onclick=()=>{
  if(!confirm('Exportar informações confidenciais deste prontuário para este dispositivo?'))return;
  saveCsv('CRL_prontuario_'+st.id.slice(0,8)+'.csv',exportRows);
 };
 print.onclick=()=>{
  const cells=exportRows.map(row=>'<div class="print-entry">'+row.map(x=>'<p>'+esc(x)+'</p>').join('')+'</div>').join('');
  const w=window.open('about:blank','_blank');
  if(!w){status('Permita janelas pop-up para imprimir o prontuário.',true);return}
  try{w.opener=null}catch(_ignored){}
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prontuário CRL</title><style>body{font:13px Arial,sans-serif;margin:35px;color:#1f2937}h1{color:#dd2536}.print-entry{page-break-inside:avoid;border-bottom:1px solid #eee;padding:6px 0}.print-entry p{white-space:pre-wrap;margin:4px 0}</style></head><body><h1>CRL — Prontuário</h1><p>Uso interno. Contém dados pessoais. Não compartilhar sem autorização.</p>'+cells+'</body></html>';
  w.document.open();w.document.write(html);w.document.close();w.focus();w.print();
 };
}
