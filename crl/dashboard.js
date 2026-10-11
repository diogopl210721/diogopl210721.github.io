// Painel CRL: indicadores extraídos de registros autorizados no Supabase.
// Não exibe dados fictícios quando não existem registros.
const integer=r=>r?.error?'—':Number(r?.count??0).toLocaleString('pt-BR');
const metric=(icon,label,val,detail)=>'<article class="dash-stat"><span class="stat-icon">'+icon+'</span><span class="stat-label">'+label+'</span><strong>'+val+'</strong><span class="stat-detail">'+detail+'</span></article>';
function row(message,detail,esc){
 return '<div class="dash-activity"><span class="dot"></span><div><b>'+esc(message)+'</b><small>'+esc(detail)+'</small></div></div>';
}
export async function loadDashboard({db,member,stays,el,esc,fmt,localTime,setView}){
 const root=el('dashboardArea');
 root.innerHTML='<div class="panel"><p>Carregando indicadores da CRL...</p></div>';
 if(!member?.institution_id)return;
 const day=localTime().slice(0,10);
 const start=new Date(day+'T00:00:00').toISOString();
 const end=new Date(new Date(day+'T00:00:00').getTime()+86400000).toISOString();
 const institution=member.institution_id;
 const admin=member.role==='admin';
 const queries=[
   db.from('crl_activities').select('id',{count:'exact',head:true}).eq('institution_id',institution).eq('type','devocional').gte('starts_at',start).lt('starts_at',end),
   db.from('crl_vehicle_trips').select('id',{count:'exact',head:true}).eq('institution_id',institution).is('arrival_at',null),
   db.from('crl_tasks').select('title,due_at,status,stay_id').eq('institution_id',institution).gte('due_at',start).lt('due_at',end).order('due_at',{ascending:true}).limit(8),
   db.from('crl_activities').select('title,presenter,starts_at').eq('institution_id',institution).eq('type','devocional').order('starts_at',{ascending:false}).limit(1),
   db.from('crl_records').select('id',{count:'exact',head:true}).eq('institution_id',institution).gte('created_at',start).lt('created_at',end),
   db.from('crl_resocializations').select('id',{count:'exact',head:true}).eq('institution_id',institution).is('actual_return_at',null)
 ];
 if(admin){
   queries.push(db.from('crl_contributions').select('amount,paid_amount,due_date').eq('institution_id',institution).lt('due_date',day).limit(1000));
   queries.push(db.from('crl_medication_requests').select('id',{count:'exact',head:true}).eq('institution_id',institution).eq('request_status','pending'));
 }
 const settled=await Promise.allSettled(queries);
 const get=i=>settled[i]?.status==='fulfilled'?settled[i].value:{error:true};
 const [devs,trips,tasks,last,records]=[get(0),get(1),get(2),get(3),get(4)];
 const resocializations=get(5),contributions=admin?get(6):null,medications=admin?get(7):null;
 if(!root.isConnected)return;
 const overdue=contributions?.error?'—':String((contributions?.data||[]).filter(c=>Number(c.amount)>Number(c.paid_amount||0)).length);
 const metrics=[
 metric('♙','Acolhidos ativos',String(stays.length),'Períodos abertos'),
 metric('▤','Devocionais hoje',integer(devs),'Sessões registradas'),
 metric('▣','Viagens abertas',integer(trips),'Aguardando retorno'),
 admin?metric('R$','Contribuições em atraso',overdue,'Competências vencidas'):metric('☷','Tarefas hoje',tasks.error?'—':String(tasks.data?.length??0),'Atividades programadas'),
 admin?metric('✚','Receitas pendentes',integer(medications),'Conferência do ADM'):metric('✎','Registros hoje',integer(records),'Anotações realizadas'),
 metric('↗','Ressocializações em andamento',integer(resocializations),'Saídas aguardando retorno')
 ];
 const taskRows=tasks.error?'<p class="dash-empty">Não foi possível carregar a escala.</p>':
 (tasks.data?.length?tasks.data.map(t=>{
 const time=t.due_at?new Date(t.due_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—';
 return row(time+' · '+t.title,t.status||'Programada',esc);
 }).join(''):'<p class="dash-empty">Nenhuma tarefa programada para hoje.</p>');
 const lastDev=last.error?'<p class="dash-empty">Devocionais indisponíveis.</p>':
 (last.data?.length?'<div class="dash-highlight"><b>'+esc(last.data[0].title)+'</b><p class="dash-subtle">Ministrante: '+esc(last.data[0].presenter||'Não informado')+' · '+esc(fmt(last.data[0].starts_at))+'</p></div>':'<p class="dash-empty">Nenhuma devocional registrada.</p>');
 const notices=[];
 if(admin&&!contributions?.error&&Number(overdue)>0) notices.push(row(overdue+' contribuições vencidas','Verificar no financeiro',esc));
 if(admin&&!medications?.error&&Number(medications.count)>0) notices.push(row(integer(medications)+' prescrições sem conferência','Requer avaliação do ADM',esc));
 if(!trips?.error&&Number(trips.count)>0) notices.push(row(integer(trips)+' viagens em aberto','Conferir horário e quilometragem',esc));
 if(!resocializations?.error&&Number(resocializations.count)>0) notices.push(row(integer(resocializations)+' ressocializações sem retorno registrado','Consultar horários e justificativas',esc));
 const alerts=notices.length?notices.join(''):'<p class="dash-empty">Nenhuma pendência identificada nos indicadores disponíveis.</p>';
 root.innerHTML='<div class="dash-stats">'+metrics.join('')+'</div>'+
 '<div class="dash-blocks">'+
 '<section class="panel"><div class="row"><h2>Escala de tarefas de hoje</h2><button class="dash-link" data-go="tasks">Ver todas →</button></div>'+taskRows+'</section>'+
 '<section class="panel"><div class="row"><h2>Última devocional</h2><button class="dash-link" data-go="devotionals">Ver todas →</button></div>'+lastDev+'</section>'+
 '<section class="panel"><div class="row"><h2>Alertas e pendências</h2><button class="dash-link" data-go="'+(admin?'contributions':'trips')+'">Consultar →</button></div>'+alerts+'</section></div>'+
 '<section class="panel"><div class="row"><div><h2>Ações rápidas</h2><p class="dash-subtle">Acesso às atividades diárias</p></div></div>'+
 '<div class="dash-actions"><button data-go="students">Novo acolhimento</button><button data-go="devotionals">Nova devocional</button><button data-go="notes">Registrar rotina</button><button data-go="trips">Abrir viagem</button><button data-go="resocialization">Ressocialização</button><button data-go="medications">Medicamentos</button><button data-go="stock">Movimentar estoque</button>'+
 (admin?'<button data-go="documents">Gerar declaração</button><button data-go="evolution">Relatório de evolução</button><button data-go="cash">Caixa da casa</button><button data-go="stats">Dashboard mensal</button><button data-go="monitors">Monitores</button>':'')+'</div></section>'+
 '<section class="panel"><div class="row"><h2>Resumo inteligente</h2><span class="muted">IA ainda não conectada</span></div><p class="dash-subtle">A análise de desenvolvimento será exibida apenas quando houver dados suficientes, acesso autorizado e revisão humana.</p></section>';
 root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go));
}