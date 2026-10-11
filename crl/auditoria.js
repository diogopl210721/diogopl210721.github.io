// CRL - trilha administrativa de auditoria, somente leitura.
const fmt=ts=>ts?new Date(ts).toLocaleString('pt-BR'):'—';
export function auditForm(){
 return '<h2>Auditoria administrativa</h2><p class="muted">Histórico de eventos administrativos e operacionais gravados pelo sistema. Acesso exclusivo do ADM.</p>'+
 '<form id="dataForm"><label>Filtrar por ação</label><input id="auditAction" type="text" maxlength="80" placeholder="Ex.: task_completed">'+
 '<label>Quantidade máxima</label><select id="auditLimit"><option value="50">50</option><option value="100">100</option><option value="200">200</option></select>'+
 '<button type="submit">Consultar auditoria</button></form>'+
 '<p class="muted">A consulta mostra no máximo 200 eventos recentes por vez; não é exportação integral.</p>';
}
export async function loadAudit({db,member,el,root,status}){
 root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Acesso exclusivo do ADM.';return}
 const limit=Math.min(200,Math.max(1,Number(el('auditLimit')?.value)||50));
 const term=(el('auditAction')?.value||'').trim();
 let query=db.from('crl_audit_events').select('id,actor_id,action,entity_name,entity_id,occurred_at')
  .eq('institution_id',member.institution_id).order('occurred_at',{ascending:false}).limit(limit);
 if(term)query=query.ilike('action','%'+term.replace(/[%_,]/g,'')+'%');
 const r=await query;
 if(r.error){root.textContent='Não foi possível carregar a auditoria.';status(r.error.message,true);return}
 if(!r.data?.length){root.textContent='Nenhuma ocorrência encontrada para o filtro.';return}
 const head=document.createElement('p');head.className='muted';head.textContent=r.data.length+' eventos consultados. Identificadores de usuário e registro permitem conferência técnica.';root.append(head);
 for(const e of r.data){
  const card=document.createElement('article');card.className='item';
  const title=document.createElement('strong');title.textContent=e.action||'Evento';
  const detail=document.createElement('p');detail.className='muted';
  detail.textContent=fmt(e.occurred_at)+' · '+(e.entity_name||'Registro')+' · Autor: '+(e.actor_id||'Sistema');
  const reference=document.createElement('small');reference.textContent='Referência: '+(e.entity_id||'—');
  card.append(title,detail,reference);root.append(card);
 }
}
