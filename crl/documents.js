// CRL — emissão de declarações oficiais, acesso restrito ao ADM.
const ptDate=date=>{
 if(!date)return '—';
 const parts=String(date).slice(0,10).split('-').map(Number);
 return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'})
  .format(new Date(Date.UTC(parts[0],parts[1]-1,parts[2],12)));
};
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signCall=async(db,action,additional={})=>{
 const {data,error}=await db.functions.invoke('crl-official-documents',{body:{action,...additional}});
 if(error||data?.error)throw new Error(data?.error||'Serviço de declarações indisponível');
 return data;
};
export function documentForm(stays){
 const options=stays.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.crl_residents?.full_name||'Acolhido')+'</option>').join('');
 return '<div class="row"><h2>Declaração de permanência</h2><span class="admin-only-tag">Somente ADM</span></div>'+
  '<p class="muted">Selecione um acolhido. Nome, CPF ou RG, entrada e data atual são preenchidos a partir do banco.</p>'+
  '<form id="dataForm">'+
  '<label>Acolhido ativo</label><select id="docStay" required>'+options+'</select>'+
  '<label>Tipo de documento</label><select id="docType"><option value="permanencia">Declaração de permanência</option></select>'+
  '<div class="doc-inputs">'+
  '<div><label>Documento de identificação</label><input id="docIdentity" value="Carregando..." disabled></div>'+
  '<div><label>Data de entrada</label><input id="docAdmission" disabled></div>'+
  '<div class="full"><label>Data de emissão</label><input id="docIssueDay" value="'+esc(ptDate(today()))+'" disabled></div>'+
  '</div>'+
  '<div id="docPreview" class="document-sheet"><p>Selecione um acolhido para visualizar a declaração.</p></div>'+
  '<p class="muted">Prévia sem assinatura. A assinatura autorizada será aplicada somente depois da aprovação do ADM.</p>'+
  '<button type="submit" id="docIssueButton" '+(!stays.length?'disabled':'')+'>Aprovar e gerar PDF privado</button>'+
  '</form>'+
  '<hr style="border:0;border-top:1px solid #e9edf1;margin:22px 0">'+
  '<h2>Assinatura autorizada</h2><p id="docSignatureStatus" class="muted">Verificando cadastro da assinatura...</p>'+
  '<label>Registrar ou substituir assinatura (PNG)</label>'+
  '<input type="file" id="docSignatureFile" accept="image/png">'+
  '<p class="muted">Armazenamento privado; o arquivo não é publicado no GitHub nem na página.</p>'+
  '<button type="button" id="docRegisterSignature" class="secondary">Cadastrar assinatura com autorização</button>';
}
export async function bindDocuments({db,member,el,status,stays}){
 if(member?.role!=='admin')return;
 el('docStay')?.addEventListener('change',()=>loadPreview({db,member,el,status}));
 el('docRegisterSignature')?.addEventListener('click',()=>registerSignature({db,member,el,status}));
 await Promise.allSettled([signatureStatus({db,el}),loadPreview({db,member,el,status})]);
}
async function signatureStatus({db,el}){
 try{
  const r=await signCall(db,'signature_status');
  el('docSignatureStatus').textContent=r.configured?'Assinatura institucional cadastrada e protegida.':'Assinatura ainda não cadastrada. É necessária para a emissão oficial.';
 }catch(e){el('docSignatureStatus').textContent='Não foi possível verificar a assinatura.'}
}
async function loadPreview({db,member,el,status}){
 const id=el('docStay')?.value;
 const box=el('docPreview');if(!box)return;
 box.replaceChildren();
 if(!id){box.textContent='Cadastre ou selecione um acolhido ativo.';return}
 const r=await db.from('crl_stays').select('id,admission_date,crl_residents(full_name,cpf,rg)')
   .eq('id',id).eq('institution_id',member.institution_id).eq('status','active').maybeSingle();
 if(r.error||!r.data){box.textContent='Prontuário não encontrado ou sem permissão.';return}
 const res=Array.isArray(r.data.crl_residents)?r.data.crl_residents[0]:r.data.crl_residents;
 if(!res){box.textContent='Dados do acolhido indisponíveis.';return}
 const label=res.cpf?'CPF nº '+res.cpf:res.rg?'RG nº '+res.rg:'CPF/RG não cadastrado';
 el('docIdentity').value=label;el('docAdmission').value=ptDate(r.data.admission_date);
 const sections=[
 ['div','COMUNIDADE TERAPÊUTICA CRL','doc-emblem'],
 ['div','DECLARAÇÃO','doc-title'],
 ['div','Campo Largo, '+ptDate(today()),'doc-date'],
 ['p','Declaro para devidos fins que o Sr '+res.full_name+', portador do '+label+', está em Programa Terapêutico nesta Comunidade, desde o dia '+ptDate(r.data.admission_date)+', em regime integral.'],
 ['p','Sem previsão de alta.'],
 ['p','Estamos à disposição para quaisquer esclarecimentos.'],
 ['p','Atenciosamente'],
 ['div','Assinatura de Francielly aplicada após aprovação do ADM.','signature-note']
 ];
 for(const [tag,content,cl] of sections){
  const node=document.createElement(tag);node.textContent=content;if(cl)node.className=cl;box.append(node);
 }
 if(!res.cpf&&!res.rg) status('Cadastre CPF ou RG do acolhido antes de gerar a declaração.',true);
}
async function registerSignature({db,member,el,status}){
 const f=el('docSignatureFile')?.files?.[0];
 if(!f||f.type!=='image/png'||f.size<30||f.size>2*1024*1024){
  status('Selecione a assinatura em PNG de até 2 MB.',true);return;
 }
 if(!confirm('Confirmar cadastro da assinatura autorizada de Francielly para uso em declarações aprovadas pelo ADM?'))return;
 const btn=el('docRegisterSignature');btn.disabled=true;
 try{
  const path=member.institution_id+'/signature-'+crypto.randomUUID()+'.png';
  const upload=await db.storage.from('crl-signatures').upload(path,f,{upsert:false,contentType:'image/png'});
  if(upload.error)throw new Error('Não foi possível enviar a assinatura privada.');
  await signCall(db,'signature_register',{path});
  el('docSignatureFile').value='';
  await signatureStatus({db,el});
  status('Assinatura institucional registrada no armazenamento privado.');
 }catch(e){status(e.message||'Falha no cadastro da assinatura.',true)}
 finally{btn.disabled=false}
}
export async function issueDocument({db,member,el,status,loadDocuments}){
 if(member?.role!=='admin')return;
 const id=el('docStay')?.value;if(!id){status('Selecione o acolhido.',true);return}
 if(!confirm('Aprova a emissão desta declaração oficial com a assinatura cadastrada de Francielly?'))return;
 const btn=el('docIssueButton');btn.disabled=true;
 try{
  const result=await signCall(db,'issue',{stay_id:id,template_type:'permanencia',approve:true});
  status('Documento '+result.document.document_number+' aprovado e arquivado em PDF privado.');
  await loadDocuments();
 }catch(e){status(e.message||'Não foi possível emitir a declaração.',true)}
 finally{btn.disabled=false}
}
export async function listDocuments({db,member,el,status,stays}){
 const root=el('listArea');root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Apenas ADM pode consultar documentos.';return}
 try{
  const data=await signCall(db,'list');
  if(!data.documents?.length){root.textContent='Nenhuma declaração emitida ainda.';return}
  for(const d of data.documents){
   const item=document.createElement('div');item.className='item';
   const title=document.createElement('b');title.textContent='Declaração '+(d.document_number||'');
   const details=document.createElement('p');details.className='muted';
   const student=stays.find(x=>x.id===d.stay_id);
   details.textContent=(student?.crl_residents?.full_name||'Acolhido em histórico')+' • Emissão: '+ptDate(d.issued_on);
   const button=document.createElement('button');button.type='button';button.textContent='Abrir / baixar PDF';
   button.onclick=()=>openPdf({db,path:d.pdf_storage_path,status});
   item.append(title,details,button);root.append(item);
  }
 }catch(e){root.textContent='Não foi possível consultar documentos.';status(e.message,true)}
}
async function openPdf({db,path,status}){
 const win=window.open('about:blank','_blank');
 if(win)win.document.body.textContent='Preparando documento privado...';
 const {data,error}=await db.storage.from('crl-documents').createSignedUrl(path,180);
 if(error||!data?.signedUrl){
  if(win)win.close();status('Documento indisponível. Confirme suas permissões.',true);return;
 }
 if(win){win.location.assign(data.signedUrl);return}
 const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Toque para abrir o PDF';el('listArea').prepend(a);
}
