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
export async function loadDashboard({db,member,stays,el,fmt,localTime,setView,canView=()=>true,backupReminder=null}){
 const root=el('dashboardArea');root.innerHTML='<section class="panel">Consultando indicadores...</section>';
 if(!member?.institution_id)return;
 const admin=member.role==='admin',tenant=member.institution_id;
 const day=localTime().slice(0,10);
 const [totals,tasks,last,backup]=await Promise.all([
  db.rpc('crl_dashboard_cards',{p_institution:tenant}),
  db.rpc('crl_task_week_view',{p_institution:tenant,p_week_start:day}),
  db.from('crl_activities').select('title,presenter,starts_at').eq('institution_id',tenant).eq('type','devocional').is('deleted_at',null).order('starts_at',{ascending:false}).limit(1),
  admin&&backupReminder?backupReminder({db,member}):Promise.resolve(null)
 ]);
 if(!root.isConnected)return;
 if(totals.error||!totals.data){root.innerHTML='<section class="panel"><h2>Indicadores indisponíveis</h2><p>Não foi possível consultar os totais. Entre em Verificar sistema (ADM) para diagnosticar a conexão.</p></section>';return}
 const m=totals.data;
 const main=[
  card('♙','Acolhidos ativos',number(m.active),'Ver acolhidos','students','active'),
  ...(canView('doses')?[card('✚','Remédios atrasados',number(m.meds_late),m.meds_late?'Doses que passaram da hora':'Nenhuma dose atrasada','doses','late')]:[]),
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
 // Escala de hoje: cada tarefa com quem faz e se já foi marcada
 const week=tasks.data,today=week?.today;
 const marks=new Map((week?.checks||[]).filter(c=>c.day===today).map(c=>[c.assignment_id,c]));
 const todayList=(week?.assignments||[]).filter(a=>a.active);
 const tasksHtml=tasks.error?'<p class="dash-empty">Escala temporariamente indisponível.</p>':todayList.length?
  todayList.slice(0,10).map(a=>{const c=marks.get(a.id);return row(a.task_name+' · '+a.resident,!c?'Ainda não marcada':c.done?'✓ Fez':'✗ Não fez')}).join('')+(todayList.length>10?'<p class="dash-empty">e mais '+(todayList.length-10)+'…</p>':''):
  '<p class="dash-empty">A escala desta semana ainda não foi montada.</p>';
 const lastHtml=last.error?'<p class="dash-empty">Sem acesso às devocionais.</p>':last.data?.length?
  '<div class="dash-highlight"><b>'+esc(last.data[0].title)+'</b><p class="dash-subtle">Ministrante: '+esc(last.data[0].presenter||'Não informado')+' · '+esc(fmt(last.data[0].starts_at))+'</p></div>':
  '<p class="dash-empty">Nenhuma devocional registrada.</p>';
 const alerts=[];
 // Lembrete de backup (ADM): vermelho a partir de 3 dias sem backup
 let backupHtml='';
 if(admin&&backup&&!backup.error){
  const lastTxt=backup.last?new Date(backup.last).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):null;
  if(backup.overdue){
   const msg=backup.last?'Último backup em '+lastTxt+' (há '+backup.days+' dias).':'Nenhum backup feito ainda.';
   backupHtml='<section class="backup-banner late" role="alert"><div><b>Hora de fazer o backup</b>'+esc(msg)+' Faça a cada 3 dias.</div><button type="button" data-go="backup">Fazer backup agora</button></section>';
   alerts.push(row('Backup atrasado',backup.last?'Há '+backup.days+' dias':'Nenhum backup ainda'));
  }else{
   const next=3-backup.days;
   backupHtml='<section class="backup-banner ok"><div><b>Backup em dia</b>Último em '+esc(lastTxt)+' · próximo '+(next<=1?'amanhã':'em '+next+' dias')+'.</div><button type="button" data-go="backup">Ver backups</button></section>';
  }
 }
 if(admin&&Number(m.contributions_overdue)>0)alerts.push(row(m.contributions_overdue+' contribuições vencidas','Consultar financeiro'));
 if(admin&&Number(m.medications_pending)>0)alerts.push(row(m.medications_pending+' receitas pendentes','Conferência administrativa'));
 if(canView('resocialization')&&Number(m.resocializations_open)>0)alerts.push(row(m.resocializations_open+' ressocializações abertas','Conferir retornos'));
 const quick='<div class="dash-actions">'+[
  ['students','Acolhidos'],['tasks','Escalas de tarefas'],['devotionals','Devocionais'],['meals','Refeições'],
  ['notes','Rotina'],['trips','Veículos'],['resocialization','Ressocialização'],['stock','Estoque'],
  ...(admin?[['contributions','Contribuições'],['cash','Caixa'],['documents','Declarações'],['evolution','Evolução mensal'],['diagnostic','Verificar sistema']]:[])
 ].map(([go,label])=>'<button type="button" data-go="'+go+'">'+label+'</button>').join('')+'</div>';
 root.innerHTML=backupHtml+
 '<section class="dash-section"><div class="dash-section-header"><h2>Visão geral</h2><p>Toque em qualquer indicador para consultar os registros</p></div><div class="dash-stats">'+main.join('')+'</div></section>'+
 '<section class="dash-section"><div class="dash-section-header"><h2>Indicadores complementares</h2><p>Gestão, movimentações e consumo</p></div><div class="dash-stats dash-stats-extra">'+extras.join('')+'</div></section>'+
 '<div class="dash-blocks">'+
 '<section class="panel"><div class="row"><h2>Escala de tarefas de hoje</h2><button type="button" class="dash-link" data-go="tasks" data-filter="today">Ver todas →</button></div>'+tasksHtml+'</section>'+
 '<section class="panel"><div class="row"><h2>Última devocional</h2><button type="button" class="dash-link" data-go="devotionals" data-filter="month">Ver mês →</button></div>'+lastHtml+'</section>'+
 '<section class="panel"><div class="row"><h2>Alertas e pendências</h2><button type="button" class="dash-link" data-go="'+(admin?'contributions':'resocialization')+'">Consultar →</button></div>'+
 (alerts.length?alerts.join(''):'<p class="dash-empty">Nenhuma pendência nos indicadores consultados.</p>')+'</section></div>'+
 '<section class="panel"><div class="row"><h2>Acesso rápido</h2><span class="dash-subtle">Todos os módulos</span></div>'+quick+'</section>';
 // Cartões e atalhos de módulos que o perfil não acessa não aparecem.
 root.querySelectorAll('[data-go]').forEach(b=>{if(!canView(b.dataset.go))b.remove()});
 root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go,b.dataset.filter||'all'));
}