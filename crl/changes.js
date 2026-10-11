// CRL — Editar / Excluir / Corrigir / Suspender em qualquer lista.
// Regra (a mesma do banco, em crl_change): ADM altera tudo; quem lançou altera só no mesmo dia.
// Toda alteração pede o motivo e fica registrada na Auditoria com o antes e o depois.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const spDay=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(d));
const toLocalInput=iso=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};

// Pode alterar? ADM sempre; autor só no mesmo dia (horário de Brasília)
export function canChange(member,user,authorId,createdAt){
 if(member?.role==='admin')return true;
 if(!authorId||authorId!==user?.id||!createdAt)return false;
 return spDay(createdAt)===spDay(new Date());
}

// Texto curto para registros corrigidos/suspensos
export function changeNote(row){
 const parts=[];
 if(row?.corrected_at)parts.push('Corrigido em '+new Date(row.corrected_at).toLocaleString('pt-BR')+(row.correction_reason?' — '+row.correction_reason:''));
 if(row?.suspended_at)parts.push('Suspenso em '+new Date(row.suspended_at).toLocaleString('pt-BR')+(row.suspension_reason?' — '+row.suspension_reason:''));
 return parts.join(' · ');
}

let seq=0;
function fieldHtml(f){
 const id='chg'+(++seq)+'_'+f.key;
 const req=f.required?' required':'';
 if(f.type==='select')return '<label for="'+id+'">'+esc(f.label)+'</label><select id="'+id+'" name="'+f.key+'">'+f.options.map(([v,l])=>'<option value="'+esc(v)+'"'+(String(v)===String(f.value??'')?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>';
 if(f.type==='textarea')return '<label for="'+id+'">'+esc(f.label)+'</label><textarea id="'+id+'" name="'+f.key+'" maxlength="'+(f.max||2000)+'"'+req+'>'+esc(f.value)+'</textarea>';
 if(f.type==='checkbox')return '<label class="care-check"><input type="checkbox" name="'+f.key+'"'+(f.value?' checked':'')+'> '+esc(f.label)+'</label>';
 const val=f.type==='datetime-local'?toLocalInput(f.value):(f.value??'');
 return '<label for="'+id+'">'+esc(f.label)+'</label><input id="'+id+'" name="'+f.key+'" type="'+(f.type||'text')+'" value="'+esc(val)+'"'+(f.step?' step="'+f.step+'"':'')+(f.min!=null?' min="'+f.min+'"':'')+req+'>';
}
function readForm(form,fields){
 const out={};
 for(const f of fields){
  const el=form.elements[f.key];if(!el)continue;
  if(f.type==='checkbox'){out[f.key]=el.checked;continue}
  let v=el.value;
  if(f.type==='datetime-local')v=v?new Date(v).toISOString():'';
  else if(f.type==='number')v=v===''?'':String(Number(v));
  else v=String(v).trim();
  out[f.key]=v;
 }
 return out;
}

/**
 * Adiciona os botões ao item da lista.
 * opts: {db,status,onDone,entity,id,
 *   edit:{label,fields|loadFields,action:'edit'|'correct'}, del:{label,hint}, extra:[{label,action,hint}]}
 */
export function attachChanges(item,opts){
 const bar=document.createElement('div');bar.className='change-actions';
 const panel=document.createElement('div');panel.className='change-panel';
 const open=(html,submit)=>{
  if(panel.dataset.open===html.slice(0,40)){panel.replaceChildren();panel.dataset.open='';return}
  panel.dataset.open=html.slice(0,40);
  panel.innerHTML='<form class="change-form">'+html+'<label>Motivo</label><input name="__reason" required minlength="3" maxlength="1000" placeholder="Ex.: digitei errado"><div class="change-buttons"><button type="submit"></button><button type="button" class="change-cancel">Cancelar</button></div></form>';
  const form=panel.querySelector('form');
  form.querySelector('button[type=submit]').textContent=submit.label;
  if(submit.danger)form.querySelector('button[type=submit]').classList.add('change-danger');
  form.querySelector('.change-cancel').onclick=()=>{panel.replaceChildren();panel.dataset.open=''};
  form.onsubmit=async e=>{
   e.preventDefault();
   const reason=form.elements.__reason.value.trim();
   if(reason.length<3){opts.status('Informe o motivo.',true);return}
   const btn=form.querySelector('button[type=submit]');btn.disabled=true;
   try{
    const r=await opts.db.rpc('crl_change',{p_entity:opts.entity,p_id:opts.id,p_action:submit.action,p_changes:submit.read?submit.read(form):{},p_reason:reason});
    if(r.error)throw r.error;
    opts.status(submit.done);
    panel.replaceChildren();panel.dataset.open='';
    if(opts.onDone)await opts.onDone();
   }catch(err){opts.status(err?.message||'Não foi possível salvar a alteração.',true)}
   finally{btn.disabled=false}
  };
 };
 if(opts.edit){
  const b=document.createElement('button');b.type='button';b.textContent=opts.edit.label||'Editar';
  b.onclick=async()=>{
   const fields=opts.edit.loadFields?await opts.edit.loadFields():opts.edit.fields;
   if(!fields)return;
   const action=opts.edit.action||'edit';
   open((opts.edit.hint?'<p class="muted">'+esc(opts.edit.hint)+'</p>':'')+fields.map(fieldHtml).join(''),
    {label:action==='correct'?'Salvar correção':'Salvar alteração',action,read:form=>readForm(form,fields),done:action==='correct'?'Correção registrada; o original fica na auditoria.':'Alteração salva.'});
  };
  bar.append(b);
 }
 for(const x of opts.extra||[]){
  const b=document.createElement('button');b.type='button';b.textContent=x.label;
  b.onclick=()=>open('<p class="muted">'+esc(x.hint||'')+'</p>',{label:'Confirmar',action:x.action,danger:true,done:x.done||'Registrado.'});
  bar.append(b);
 }
 if(opts.del){
  const b=document.createElement('button');b.type='button';b.className='change-delete';b.textContent=opts.del.label||'Excluir';
  b.onclick=()=>open('<p class="muted">'+esc(opts.del.hint||'O registro sai das listas e dos totais, mas fica na Auditoria com o motivo.')+'</p>',
   {label:'Confirmar exclusão',action:'delete',danger:true,done:'Excluído. Fica registrado na Auditoria.'});
  bar.append(b);
 }
 if(bar.children.length){item.append(bar,panel)}
}
