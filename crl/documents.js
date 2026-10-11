// CRL — emissão de declarações oficiais, acesso restrito ao ADM.
import {callFunction} from './fn.js';
const ptDate=date=>{
 if(!date)return '—';
 const parts=String(date).slice(0,10).split('-').map(Number);
 return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'})
  .format(new Date(Date.UTC(parts[0],parts[1]-1,parts[2],12)));
};
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signCall=(db,action,additional={})=>callFunction(db,'crl-official-documents',{action,...additional});
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
  '<div class="doc-inputs"><div><label>Tipo do documento</label><select id="docIdentityType"><option value="cpf">CPF</option><option value="rg">RG</option></select></div><div><label>CPF ou RG</label><input id="docIdentityValue" maxlength="30" placeholder="Número do documento"></div></div>'+
  '<button type="button" id="docSaveIdentity" class="secondary">Salvar identificação no prontuário</button>'+
  '<div id="docPreview" class="document-sheet"><p>Selecione um acolhido para visualizar a declaração.</p></div>'+
  '<label class="care-check doc-sign-option"><input type="checkbox" id="docWithSignature" checked> Incluir a assinatura da Francielly no PDF</label>'+
  '<p id="docSignatureStatus" class="muted">Verificando a assinatura guardada...</p>'+
  '<button type="submit" id="docIssueButton" '+(!stays.length?'disabled':'')+'>Aprovar e gerar PDF</button>'+
  '</form>'+
  '<details class="doc-sign-replace"><summary>Trocar a assinatura guardada</summary>'+
  '<p class="muted">Só use se a assinatura mudar. Ela fica em armazenamento privado; não aparece no site nem no GitHub.</p>'+
  '<input type="file" id="docSignatureFile" accept="image/png">'+
  '<button type="button" id="docRegisterSignature" class="secondary">Guardar nova assinatura</button></details>';
}
export async function bindDocuments({db,member,el,status,stays}){
 if(member?.role!=='admin')return;
 el('docStay')?.addEventListener('change',()=>loadPreview({db,member,el,status}));
 el('docWithSignature')?.addEventListener('change',()=>{const n=document.querySelector('#docPreview .signature-note');if(n)n.textContent=el('docWithSignature').checked?'Assinatura da Francielly entra no PDF ao aprovar.':'Sem assinatura digital: espaço para assinar à mão.'});
 el('docRegisterSignature')?.addEventListener('click',()=>registerSignature({db,member,el,status}));
 el('docSaveIdentity')?.addEventListener('click',()=>saveIdentity({db,member,el,status}));
 await Promise.allSettled([signatureStatus({db,el}),loadPreview({db,member,el,status})]);
}
async function signatureStatus({db,el}){
 try{
  const r=await signCall(db,'signature_status');
  const box=el('docWithSignature');
  if(r.configured){
   el('docSignatureStatus').textContent='✓ Assinatura da Francielly já guardada. Ela entra sozinha no PDF quando a opção acima estiver marcada.';
  }else{
   el('docSignatureStatus').textContent='Nenhuma assinatura guardada ainda. Desmarque a opção para gerar sem assinatura, ou guarde uma em “Trocar a assinatura guardada”.';
   if(box)box.checked=false;
  }
 }catch(e){el('docSignatureStatus').textContent='Não foi possível verificar a assinatura: '+(e?.message||'tente de novo.')}
}
async function loadPreview({db,member,el,status}){
 const id=el('docStay')?.value;
 const box=el('docPreview');if(!box)return;
 box.replaceChildren();
 if(!id){box.textContent='Cadastre ou selecione um acolhido ativo.';return}
 const r=await db.from('crl_stays').select('id,resident_id,admission_date,crl_residents(full_name)')
   .eq('id',id).eq('institution_id',member.institution_id).eq('status','active').maybeSingle();
 if(r.error||!r.data){box.textContent='Prontuário não encontrado ou sem permissão.';return}
 const named=Array.isArray(r.data.crl_residents)?r.data.crl_residents[0]:r.data.crl_residents;
 if(!named){box.textContent='Dados do acolhido indisponíveis.';return}
 // CPF e RG só chegam ao navegador do ADM, pela função crl_residents_private.
 const priv=await db.rpc('crl_residents_private',{p_residents:[r.data.resident_id]});
 if(priv.error){box.textContent='Não foi possível consultar CPF/RG.';return}
 const docs=(priv.data||[])[0]||{};
 const res={full_name:named.full_name,cpf:docs.cpf||null,rg:docs.rg||null};
 const label=res.cpf?'CPF nº '+res.cpf:res.rg?'RG nº '+res.rg:'CPF/RG não cadastrado';
 el('docIdentity').value=label;el('docAdmission').value=ptDate(r.data.admission_date);
 el('docIdentityType').value=res.cpf?'cpf':res.rg?'rg':'cpf';el('docIdentityValue').value=res.cpf||res.rg||'';
 const brand=document.querySelector('body > header img');
 if(brand){const logo=document.createElement('img');logo.src=brand.src;logo.alt='Logomarca original da CRL';logo.style.cssText='display:block;width:92%;max-width:420px;height:auto;margin:0 auto 15px;object-fit:contain';box.append(logo)}
 const sections=[
 ['div','DECLARAÇÃO','doc-title'],
 ['div','Campo Largo, '+ptDate(today()),'doc-date'],
 ['p','Declaro para devidos fins que o Sr '+res.full_name+', portador do '+label+', está em Programa Terapêutico nesta Comunidade, desde o dia '+ptDate(r.data.admission_date)+', em regime integral.'],
 ['p','Sem previsão de alta.'],
 ['p','Estamos à disposição para quaisquer esclarecimentos.'],
 ['p','Atenciosamente'],
 ['div',el('docWithSignature')?.checked===false?'Sem assinatura digital: espaço para assinar à mão.':'Assinatura da Francielly entra no PDF ao aprovar.','signature-note']
 ];
 for(const [tag,content,cl] of sections){
  const node=document.createElement(tag);node.textContent=content;if(cl)node.className=cl;box.append(node);
 }
 if(!res.cpf&&!res.rg) status('Cadastre CPF ou RG do acolhido antes de gerar a declaração.',true);
}
async function saveIdentity({db,member,el,status}){
 if(member?.role!=='admin')return;
 const type=el('docIdentityType').value,number=el('docIdentityValue').value.trim();
 if(!number){status('Informe o número do documento.',true);return}
 if(!confirm('Confirma a atualização deste documento no prontuário do acolhido?'))return;
 const button=el('docSaveIdentity');button.disabled=true;
 try{
  const r=await db.rpc('crl_set_identity_document',{
   p_stay_id:el('docStay').value,p_document_type:type,p_number:number
  });
  if(r.error)throw new Error(r.error.message||'Documento inválido');
  status('Identificação atualizada, com registro de auditoria.');
  await loadPreview({db,member,el,status});
 }catch(e){status(e.message||'Não foi possível atualizar o documento.',true)}
 finally{button.disabled=false}
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
  const d=document.querySelector('.doc-sign-replace');if(d)d.open=false;
  await signatureStatus({db,el});
  status('Assinatura institucional registrada no armazenamento privado.');
 }catch(e){status(e.message||'Falha no cadastro da assinatura.',true)}
 finally{btn.disabled=false}
}
export async function issueDocument({db,member,el,status,loadDocuments}){
 if(member?.role!=='admin')return;
 const id=el('docStay')?.value;if(!id){status('Selecione o acolhido.',true);return}
 const withSignature=el('docWithSignature')?.checked!==false;
 if(!confirm(withSignature?'Aprovar a declaração com a assinatura da Francielly?':'Aprovar a declaração SEM assinatura (para assinar à mão)?'))return;
 const btn=el('docIssueButton');btn.disabled=true;
 try{
  const result=await signCall(db,'issue',{stay_id:id,template_type:'permanencia',approve:true,with_signature:withSignature});
  status('Declaração '+result.document.document_number+' gerada '+(withSignature?'com':'sem')+' assinatura. Abra ou compartilhe na lista ao lado.');
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
   const share=document.createElement('button');share.type='button';share.textContent='Compartilhar PDF';share.style.marginLeft='7px';
   share.onclick=()=>sharePdf({db,path:d.pdf_storage_path,status,filename:(d.document_number||'Declaracao-CRL')+'.pdf'});
   item.append(title,details,button,share);root.append(item);
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
 const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Toque para abrir o PDF';document.getElementById('listArea')?.prepend(a);
}

async function sharePdf({db,path,status,filename}){
 try{
  const {data,error}=await db.storage.from('crl-documents').createSignedUrl(path,180);
  if(error||!data?.signedUrl)throw new Error('Acesso ao PDF não autorizado');
  const response=await fetch(data.signedUrl);
  if(!response.ok)throw new Error('Não foi possível carregar o PDF');
  const blob=await response.blob();
  const file=new File([blob],filename,{type:'application/pdf'});
  if(navigator.share && navigator.canShare?.({files:[file]})){
   await navigator.share({title:'Declaração CRL',files:[file]});
   return;
  }
  const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Toque para abrir o PDF e compartilhar manualmente.';
  document.getElementById('listArea')?.prepend(link);
  status('O navegador não permite anexar automaticamente. Abra o PDF e compartilhe pelo celular.');
 }catch(e){
  if(e?.name==='AbortError')return;
  status(e.message||'Não foi possível compartilhar o arquivo.',true);
 }
}
