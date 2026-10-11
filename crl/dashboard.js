// Dashboard CRL: totais consolidados por função autenticada e cartões clicáveis.
// Todas as métricas respeitam o perfil do usuário; valores indisponíveis não são inventados.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1});
const currency=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const card=(icon,title,value,caption,go,filter='all')=>
 '<button type="button" class="dash-stat dash-click" data-go="'+go+'" data-filter="'+filter+'" aria-label="'+esc(title)+': '+esc(value)+'. Abrir módulo">'+
 '<span class="stat-icon">'+icon+'</span><span class="stat-label">'+esc(title)+'</span><strong>'+esc(value)+'</strong>'+
 '<span class="stat-detail">'+esc(caption)+' <span class="dash-chevron">↗</span></span></button>';
const row=(name,detail)=>'<div class="dash-activity"><span class="dot"></span><div><b>'+esc(name)+'</b><small>'+esc(detail)+'</small></div></div>';
export async function loadDashboard({db,member,stays,el,fmt,localTime,setView}){
 const root=el('dashboardArea');root.innerHTML='<section class="panel">Consultando indicadores...</section>';
 if(!member?.institution_id)return;
 const admin=member.role==='admin',tenant=member.institution_id;
 const day=localTime().slice(0,10);
 const dayStart=new Date(day+'T00:00:00').toISOString();
 const dayEnd=new Date(new Date(day+'T00:00:00').getTime()+86400000).toISOString();
 const [totals,tasks,last]=await Promise.all([
  db.rpc('crl_dashboard_cards',{p_institution:tenant}),
  db.from('crl_tasks').select('title,due_at,status').eq('institution_id',tenant).gte('due_at',dayStart).lt('due_at',dayEnd).neq('status','done').order('due_at',{ascending:true}).limit(8),
  db.from('crl_activities').select('title,presenter,starts_at').eq('institution_id',tenant).eq('type','devocional').order('starts_at',{ascending:false}).limit(1)
 ]);
 if(!root.isConnected)return;
 if(totals.error||!totals.data){root.innerHTML='<section class="panel"><h2>Indicadores indisponíveis</h2><p>Não foi possível consultar os totais. Entre em Verificar sistema (ADM) para diagnosticar a conexão.</p></section>';return}
 const m=totals.data;
 const main=[
  card('♙','Acolhidos ativos',number(m.active),'Ver acolhidos','students','active'),
  card('▤','Devocionais no mês',number(m.devotionals_month),'Sessões neste mês','devotionals','month'),
  card('☷','Escalas de tarefas',number(m.tasks_today),'Tarefas pendentes de hoje','tasks','today'),
  ...(admin?[card('R$','Contribuições em atraso',number(m.contributions_overdue),'Competências vencidas','contributions','overdue')]:[card('✎','Registros de rotina','Abrir','Registros da equipe','notes')]),
  card('♨','Refeições do mês',number(m.meals_month),'Porções servidas no mês','meals','month'),
  card('↗','Ressocializações em andamento',number(m.resocializations_open),'Saídas aguardando retorno','resocialization','open')
 ];
 const extras=[
  ...(admin?[card('✚','Receitas para conferência',number(m.medications_pending),'Aguardando ADM','medications','pending')]:[]),
  card('▣','Viagens do mês',number(m.trips_month),'Viagens registradas','trips','month'),
  card('↗','KM rodados no mês',number(m.kilometers_month),'Distância registrada','trips','month'),
  card('▤','Entradas de estoque',number(m.stock_entries_month),'Movimentações recebidas','stock','month_in'),
  card('◈','KG recebidos',number(m.kg_received_month),'Peso recebido neste mês','stock','month_in_kg'),
  card('◉','KG consumidos',number(m.kg_consumed_month),'Peso consumido neste mês','stock','month_out_kg'),
  ...(admin?[
   card('R$','Despesas do mês',currency(m.expenses_month),'Saídas do caixa','cash','month_expense'),
   card('✓','Conclusões no mês',number(m.concluded_month),'Acolhimentos concluídos','history','concluded_month'),
   card('↘','Desistências / abandonos',number(m.departures_month),'Saídas registradas neste mês','history','departures_month'),
   card('◷','Próximos dos 9 meses',number(m.near_nine_months),'Prazo em até 30 dias','students','near9')
  ]:[])
 ];
 const tasksHtml=tasks.error?'<p class="dash-empty">Tarefas temporariamente indisponíveis.</p>':tasks.data?.length?
  tasks.data.map(t=>row(new Date(t.due_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+' · '+t.title,'Pendente')).join(''):
  '<p class="dash-empty">Nenhuma tarefa pendente para hoje.</p>';
 const lastHtml=last.error?'<p class="dash-empty">Sem acesso às devocionais.</p>':last.data?.length?
  '<div class="dash-highlight"><b>'+esc(last.data[0].title)+'</b><p class="dash-subtle">Ministrante: '+esc(last.data[0].presenter||'Não informado')+' · '+esc(fmt(last.data[0].starts_at))+'</p></div>':
  '<p class="dash-empty">Nenhuma devocional registrada.</p>';
 const alerts=[];
 if(admin&&Number(m.contributions_overdue)>0)alerts.push(row(m.contributions_overdue+' contribuições vencidas','Consultar financeiro'));
 if(admin&&Number(m.medications_pending)>0)alerts.push(row(m.medications_pending+' receitas pendentes','Conferência administrativa'));
 if(Number(m.resocializations_open)>0)alerts.push(row(m.resocializations_open+' ressocializações abertas','Conferir retornos'));
 const quick='<div class="dash-actions">'+[
  ['students','Acolhidos'],['tasks','Escalas de tarefas'],['devotionals','Devocionais'],['meals','Refeições'],
  ['notes','Rotina'],['trips','Veículos'],['resocialization','Ressocialização'],['stock','Estoque'],
  ...(admin?[['contributions','Contribuições'],['cash','Caixa'],['documents','Declarações'],['evolution','Evolução mensal'],['diagnostic','Verificar sistema']]:[])
 ].map(([go,label])=>'<button type="button" data-go="'+go+'">'+label+'</button>').join('')+'</div>';
 root.innerHTML=
 '<section class="dash-section"><div class="dash-section-header"><h2>Visão geral</h2><p>Toque em qualquer indicador para consultar os registros</p></div><div class="dash-stats">'+main.join('')+'</div></section>'+
 '<section class="dash-section"><div class="dash-section-header"><h2>Indicadores complementares</h2><p>Gestão, movimentações e consumo</p></div><div class="dash-stats dash-stats-extra">'+extras.join('')+'</div></section>'+
 '<div class="dash-blocks">'+
 '<section class="panel"><div class="row"><h2>Escala de tarefas de hoje</h2><button type="button" class="dash-link" data-go="tasks" data-filter="today">Ver todas →</button></div>'+tasksHtml+'</section>'+
 '<section class="panel"><div class="row"><h2>Última devocional</h2><button type="button" class="dash-link" data-go="devotionals" data-filter="month">Ver mês →</button></div>'+lastHtml+'</section>'+
 '<section class="panel"><div class="row"><h2>Alertas e pendências</h2><button type="button" class="dash-link" data-go="'+(admin?'contributions':'resocialization')+'">Consultar →</button></div>'+
 (alerts.length?alerts.join(''):'<p class="dash-empty">Nenhuma pendência nos indicadores consultados.</p>')+'</section></div>'+
 '<section class="panel"><div class="row"><h2>Acesso rápido</h2><span class="dash-subtle">Todos os módulos</span></div>'+quick+'</section>';
 root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go,b.dataset.filter||'all'));
}