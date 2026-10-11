// CRL — relatório mensal baseado em lançamentos rastreáveis, sem inferência de IA.
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const friendly=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'—';
const monthValue=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const count=(s,v)=>Number(s?.counts?.[v]||0);
const practicalSuggestions=snap=>{
 const c=snap?.counts||{},tips=[];
 const total=(c.present||0)+(c.late||0)+(c.absent||0)+(c.excused||0);
 if(total===0)tips.push('Não há marcações de devocionais neste período: conferir se as atividades e presenças foram lançadas.');
 else tips.push('Conferir as '+total+' marcações de devocionais e as justificativas de ausências antes de interpretar frequência.');
 if((c.records||0)===0)tips.push('Não há registros individuais do mês: solicitar à equipe a conferência de lançamentos, sem criar fatos retroativos.');
 else tips.push('Conferir os '+c.records+' registros individuais, inclusive retificações, usando os identificadores das fontes.');
 if((c.resocializations_started||0)>0)tips.push('Verificar as datas e justificativas das '+c.resocializations_started+' ressocializações iniciadas, inclusive retornos lançados posteriormente.');
 if((c.tasks_planned||0)===0)tips.push('Não há tarefas individuais com vencimento no mês: verificar se a escala foi atribuída corretamente.');
 tips.push('Descrever somente fatos observáveis e próximos acompanhamentos. Não inferir diagnóstico, recuperação, personalidade ou causa a partir de contagens.');
 return tips;
};
const stayOptions=stays=>stays.map(s=>'<option value="'+safe(s.id)+'">'+safe(s.crl_residents?.full_name||'Acolhido')+'</option>').join('');
export function evolutionForm(stays){
 return '<div class="row"><h2>Relatório mensal de evolução</h2><span class="admin-only-tag">Somente ADM</span></div>'+
 '<p class="muted">O sistema reúne indicadores e referências dos registros. O texto é uma base factual, não uma conclusão clínica ou uma avaliação por IA.</p>'+
 '<form id="dataForm"><label>Acolhido ativo</label><select id="evoStay">'+stayOptions(stays)+'</select>'+
 '<label>Competência</label><input type="month" id="evoMonth" value="'+monthValue()+'" required>'+
 '<button '+(!stays.length?'disabled':'')+'>Preparar / atualizar rascunho com evidências</button></form>'+
 '<p class="muted">Somente meses encerrados podem receber aprovação definitiva. Dados de medicamentos não são usados para inferir evolução.</p>';
}
export async function loadEvolution({db,member,stays,root,status}){
 root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Relatórios completos disponíveis somente para ADM.';return}
 const r=await db.from('crl_evolution_reports').select('id,stay_id,month_start,report_status,source_snapshot,generated_text,approved_text,reviewed_draft_text,reviewed_draft_at,created_at,approved_at')
 .eq('institution_id',member.institution_id).order('month_start',{ascending:false}).limit(60);
 if(r.error){root.textContent='Não foi possível consultar os relatórios.';return}
 if(!r.data?.length){root.textContent='Nenhum relatório preparado.';return}
 for(const item of r.data){
  const stay=stays.find(s=>s.id===item.stay_id);
  const container=document.createElement('section');container.className='item';
  const heading=document.createElement('strong');heading.textContent=(stay?.crl_residents?.full_name||'Acolhido em histórico')+' · '+friendly(item.month_start);
  const info=document.createElement('p');info.className='muted';info.textContent=item.report_status==='approved'?'Aprovado pela administração':'Rascunho — revisão necessária';
  const counts=item.source_snapshot?.counts||{};
  const stats=document.createElement('p');stats.className='muted';
  stats.textContent='Registros: '+(counts.records??0)+' · Presenças: '+(counts.present??0)+' · Tarefas: '+(counts.tasks_planned??0)+' · Ressocializações: '+(counts.resocializations_started??0);
  container.append(heading,info,stats);
  const evidence=document.createElement('details');
  const label=document.createElement('summary');label.textContent='Conferir fontes e evidências';evidence.append(label);
  const sources=item.source_snapshot?.evidence||[];
  if(!sources.length){const p=document.createElement('p');p.textContent='Nenhum registro individual localizado para esta competência.';evidence.append(p)}
  for(const source of sources){
   const entry=document.createElement('div');entry.className='record-line';
   const ref=document.createElement('small');ref.textContent='Registro '+source.id+' · '+new Date(source.created_at).toLocaleString('pt-BR')+' · '+source.category;
   const content=document.createElement('p');content.textContent=source.excerpt;
   entry.append(ref,content);evidence.append(entry);
  }
  if(item.source_snapshot?.evidence_truncated){const notice=document.createElement('p');notice.textContent='Mais registros existem no prontuário; consulte o histórico completo antes de aprovar.';evidence.append(notice)}
  container.append(evidence);
  const help=document.createElement('details');help.className='evolution-help';
  const summary=document.createElement('summary');summary.textContent='Sugestões de verificação (sem IA externa)';help.append(summary);
  const note=document.createElement('p');note.className='muted';note.textContent='Lista de conferência produzida apenas com as contagens armazenadas. Nenhum dado foi enviado a um modelo externo.';help.append(note);
  const suggestions=document.createElement('ul');
  for(const tip of practicalSuggestions(item.source_snapshot)){
   const li=document.createElement('li');li.textContent=tip;suggestions.append(li);
  }
  help.append(suggestions);container.append(help);
  if(item.reviewed_draft_at&&item.report_status!=='approved'){
   const saved=document.createElement('p');saved.className='muted';saved.textContent='Rascunho revisado salvo em '+new Date(item.reviewed_draft_at).toLocaleString('pt-BR');container.append(saved)
  }
  const textarea=document.createElement('textarea');textarea.rows=11;textarea.maxLength=15000;textarea.value=item.approved_text||item.reviewed_draft_text||item.generated_text||'';
  textarea.readOnly=item.report_status==='approved';
  textarea.setAttribute('aria-label','Texto do relatório mensal');
  container.append(textarea);
  const buttons=document.createElement('div');buttons.className='care-actions';
  if(item.report_status!=='approved'){
   const save=document.createElement('button');save.type='button';save.textContent='Salvar revisão sem aprovar';
   save.onclick=async()=>{
    if(textarea.value.trim().length<40){status('Revise o texto antes de salvar (mínimo 40 caracteres).',true);return}
    save.disabled=true;
    try{
     const r=await db.rpc('crl_save_evolution_review_draft',{p_report:item.id,p_text:textarea.value.trim()});
     if(r.error)throw r.error;
     status('Revisão salva. O relatório continua não aprovado.');
     await loadEvolution({db,member,stays,root,status});
    }catch(e){status(e.message||'Não foi possível salvar o rascunho.',true)}
    finally{save.disabled=false}
   };
   buttons.append(save);
   const approve=document.createElement('button');approve.type='button';approve.textContent='Revisar e aprovar definitivamente';
   approve.onclick=async()=>{
    if(textarea.value.trim().length<40){status('Revise e complete o texto antes de aprovar.',true);return}
    if(!confirm('Confirma a aprovação definitiva? O relatório aprovado não poderá ser alterado.'))return;
    approve.disabled=true;
    try{
     const r=await db.rpc('crl_approve_evolution_report',{p_report:item.id,p_final_text:textarea.value.trim()});
     if(r.error)throw r.error;
     status('Relatório mensal aprovado com registro de auditoria.');await loadEvolution({db,member,stays,root,status});
    }catch(e){status(e.message||'Aprovação não concluída.',true)}
    finally{approve.disabled=false}
   };
   buttons.append(approve);
  }
  const print=document.createElement('button');print.textContent='Imprimir / salvar PDF';print.type='button';
  print.onclick=()=>printEvolution(item,textarea.value);
  buttons.append(print);container.append(buttons);root.append(container);
 }
}
export async function prepareEvolution({db,member,el,stays,status,refresh}){
 if(member?.role!=='admin')return;
 const stay=el('evoStay')?.value;
 const m=el('evoMonth')?.value;
 if(!stay||!/^20\d{2}-\d{2}$/.test(m||'')){status('Selecione um acolhido e o mês.',true);return}
 const r=await db.rpc('crl_prepare_evolution_report',{p_stay:stay,p_month:m+'-01'});
 if(r.error){status(r.error.message||'Não foi possível preparar o relatório.',true);return}
 status('Rascunho atualizado com registros e indicadores do período.');await refresh();
}
function printEvolution(item,text){
 const w=window.open('about:blank','_blank');if(!w)return;
 try{w.opener=null}catch(_){}
 const logo=document.querySelector('body > header img')?.src||'';
 const safeLogo=logo.startsWith('data:image/png;base64,')?'<img style="max-width:340px" src="'+logo+'" alt="CRL">':'';
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório CRL</title><style>body{font:14px Arial,sans-serif;max-width:750px;margin:45px auto;padding:0 25px;color:#1f2937}h1{font-size:21px;color:#d9283a}p{line-height:1.6;white-space:pre-wrap}.note{color:#555;font-size:11px;border-top:1px solid #ddd;margin-top:30px;padding-top:10px}</style></head><body>'+safeLogo+'<h1>Relatório mensal de acompanhamento</h1><p>Competência: '+safe(item.month_start)+' · '+(item.report_status==='approved'?'Aprovado':'RASCUNHO NÃO APROVADO')+'</p><p>'+safe(text)+'</p><div class="note">Resumo baseado em registros. Não representa diagnóstico ou avaliação clínica. Documento sujeito ao sigilo institucional.</div></body></html>';
 w.document.open();w.document.write(html);w.document.close();w.focus();w.print();
}
