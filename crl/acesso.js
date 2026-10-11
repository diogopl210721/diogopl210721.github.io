import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {loadDashboard} from './dashboard.js';
import {documentForm,bindDocuments,listDocuments,issueDocument} from './documents.js';
import {prontuarioForm,loadProntuario} from './prontuario.js';
import {careForm,bindCare,loadCareList,submitCare} from './care.js';
import {evolutionForm,loadEvolution,prepareEvolution} from './evolution.js';
import {operationsForm,loadOperations,submitOperations} from './operations.js';
import {auditForm,loadAudit} from './auditoria.js';
import {diagnosticForm,runDiagnostic} from './diagnostico.js';
const db=createClient('https://kwadhzmdaakxkztggigm.supabase.co','sb_publishable_8kEj3zY3ebOMZDYutUBv5A_wbLELNIM',{auth:{autoRefreshToken:true,persistSession:true}});
const el=id=>document.getElementById(id);
let member=null,user=null,stays=[],view='dashboard',moduleFilter='all',openTrips=[],lastMetrics=null;
let monitorPreview=false,originalAdminMember=null;
// Quem vê o quê. Para mudar o acesso de um perfil, altere só estas duas listas
// (o banco aplica as mesmas regras; a tela apenas esconde o que não está liberado).
const ADMIN_ONLY=['history','stats','contributions','monitors','documents','evolution','cash','audit','diagnostic'];
const NOT_FOR_STUDENT_MONITOR=['profile','files','notes','medications','resocialization'];
const isStudentMonitor=()=>member?.role==='monitor'&&member?.monitor_vinculo==='aluno';
function canView(v){
 if(member?.role==='admin')return true;
 if(ADMIN_ONLY.includes(v))return false;
 if(isStudentMonitor()&&NOT_FOR_STUDENT_MONITOR.includes(v))return false;
 return true;
}
function applyTabs(){
 document.querySelectorAll('[data-view]').forEach(b=>{b.style.display=canView(b.dataset.view)?'':'none'});
 document.querySelectorAll('[data-jump]').forEach(b=>{b.style.display=canView(b.dataset.jump)?'':'none'});
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=iso=>{try{return new Date(iso).toLocaleString('pt-BR')}catch{return iso}};
const localTime=(date=new Date())=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
function status(s,error=false){let n=el('notice');n.textContent=s;n.className=error?'danger':'success'}
function field(label,id,type='text',required=true,value=''){return '<label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" '+(required?'required':'')+' value="'+esc(value)+'">'}
function stayOptions(){return stays.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.crl_residents?.full_name||'Acolhido')+'</option>').join('')}
function authenticated(){return Boolean(member?.active!==false && member?.institution_id && user?.id)}
async function signOut(){await db.auth.signOut();monitorPreview=false;originalAdminMember=null;member=null;user=null;stays=[];el('appPanel').classList.add('hide');el('loginPanel').classList.remove('hide');el('password').value=''}
el('logout').onclick=signOut;

async function toggleMonitorPreview(){
 if(!authenticated()||(!monitorPreview&&member.role!=='admin'))return;
 if(!monitorPreview){
  originalAdminMember=member;
  member={...member,role:'monitor',monitor_vinculo:null,display_name:'Prévia do monitor'};
  monitorPreview=true;
 }else{
  member=originalAdminMember;
  originalAdminMember=null;
  monitorPreview=false;
 }
 applyTabs();
 el('identity').textContent=monitorPreview?'PRÉVIA: tela do monitor (sessão ADM)':
  member.display_name+' · Administrador';
 el('monitorPreviewButton').textContent=monitorPreview?'Voltar ao ADM':'Ver tela do monitor';
 el('monitorPreviewButton').setAttribute('aria-pressed',String(monitorPreview));
 el('monitorPreviewNotice').classList.toggle('hide',!monitorPreview);
 el('appPanel').classList.toggle('monitor-preview',monitorPreview);
 view='dashboard';moduleFilter='all';
 await refresh();
}
el('monitorPreviewButton').onclick=toggleMonitorPreview;

async function init(){
 const {data:{user:current},error}=await db.auth.getUser();
 if(error||!current)return;
 const m=await db.from('crl_members').select('institution_id,display_name,role,active,monitor_vinculo').eq('auth_user_id',current.id).eq('active',true).maybeSingle();
 if(m.error||!m.data){await signOut();el('loginMessage').textContent='Conta não habilitada para a CRL. Procure o ADM.';return}
 user=current;member=m.data;monitorPreview=false;originalAdminMember=null;
 el('appPanel').classList.remove('monitor-preview');el('monitorPreviewNotice').classList.add('hide');
 el('monitorPreviewButton').style.display=member.role==='admin'?'':'none';
 el('monitorPreviewButton').textContent='Ver tela do monitor';
 el('loginPanel').classList.add('hide');el('appPanel').classList.remove('hide');
 el('identity').textContent=member.display_name+' · '+(member.role==='admin'?'Administrador':isStudentMonitor()?'Monitor (aluno)':'Monitor');
 applyTabs();
 view='dashboard';
 await refresh();
 const requestedView=new URLSearchParams(window.location.search).get('view');
 if(member.role==='admin'&&['monitors','diagnostic'].includes(requestedView))
  await setView(requestedView);
}
el('loginForm').onsubmit=async e=>{
 e.preventDefault();
 const username=el('username').value.trim().toLowerCase();
 if(!/^[a-z0-9._-]{3,60}$/.test(username)){el('loginMessage').textContent='Nome de usuário inválido.';return}
 el('loginButton').disabled=true;el('loginMessage').textContent='Verificando acesso...';
 try{
 const r=await db.auth.signInWithPassword({email:username+'@crl.ddsinovacao.com.br',password:el('password').value});
 if(r.error){el('loginMessage').textContent='Usuário ou senha inválidos.';return}
 el('loginMessage').textContent='';await init();
 }finally{el('loginButton').disabled=false}
};
async function refresh(){
 if(!authenticated())return;
 const r=await db.from('crl_stays').select('id,resident_id,admission_date,crl_residents(id,full_name)').eq('institution_id',member.institution_id).eq('status','active').order('admission_date',{ascending:false});
 if(r.error){status('Não foi possível consultar os acolhidos.',true);return}
 stays=r.data||[];
 draw();
 await loadList();
}
function draw(){
 const isDashboard=view==='dashboard';
 el('moduleGrid').classList.toggle('profile-layout',view==='profile');
 el('dashboardArea').classList.toggle('hide',!isDashboard);
 el('moduleGrid').classList.toggle('hide',isDashboard);
 el('welcomeTitle').textContent=isDashboard?(member?.role==='admin'?'Painel Geral':'Resumo do dia'):viewTitle(view);
 el('welcomeText').textContent=isDashboard?'Acompanhamento diário da CRL':'Registros organizados conforme seu perfil de acesso';
 const quickSearch=document.querySelector('#welcome .quick-search');
 if(quickSearch)quickSearch.style.display=(isDashboard||view==='students')?'':'none';
 document.querySelectorAll('[data-jump]').forEach(b=>b.classList.toggle('current',b.dataset.jump===view));
 if(isDashboard)return;
 const forms={
 history:'<h2>Buscar ex-acolhidos</h2><p class="muted">Somente ADM. Pesquise o cadastro permanente por nome, confira as passagens e abra um novo período sem apagar o anterior.</p><form id="dataForm">'+field('Nome ou parte do nome','searchName','text',true)+'<button>Pesquisar histórico</button></form>',
 files:'<h2>Foto ou documento do acolhido</h2><form id="dataForm"><label>Acolhido ativo</label><select id="stay" required>'+stayOptions()+'</select><label>Categoria do arquivo</label><select id="fileCategory"><option value="documento">RG / CPF / documento</option><option value="receita">Receita médica</option><option value="pertences">Pertences</option><option value="foto">Fotografia</option><option value="outro">Outro anexo</option></select><label>Tirar foto ou selecionar arquivo</label><input id="attachedFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><p class="muted">Apenas JPG, PNG, WebP ou PDF até 10 MB. Arquivo privado. Fotos de RG/CPF (categoria documento) ficam visíveis só para o ADM.</p><button '+(!stays.length?'disabled':'')+'>Enviar e vincular ao prontuário</button></form>',
 profile:prontuarioForm(stays),
 medications:careForm('medications',stays),
 resocialization:careForm('resocialization',stays),
 students:admissionForm(),
 tasks:'<h2>Programar tarefa</h2><form id="dataForm"><label>Descrição da atividade</label><input id="taskTitle" maxlength="200" placeholder="Ex.: limpeza da cozinha" required><label>Acolhido responsável</label><select id="taskStay"><option value="">Equipe / geral</option>'+stayOptions()+'</select>'+field('Data e hora programada','taskDue','datetime-local',true,localTime())+'<label>Periodicidade</label><select id="taskRecurrence"><option value="unica">Única</option><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option></select><p class="muted">A próxima ocorrência semanal, quinzenal ou mensal será criada automaticamente quando você concluir a tarefa.</p><button>Agendar tarefa</button></form>',
 notes:'<h2>Registro individual</h2><form id="dataForm"><label>Acolhido</label><select id="stay" required>'+stayOptions()+'</select><label>Tipo</label><select id="category"><option value="rotina">Rotina</option><option value="ocorrencia">Ocorrência</option><option value="observacao">Observação</option></select><label>Relato</label><textarea id="description" required maxlength="10000"></textarea><p class="muted">Pode utilizar o ditado do teclado do celular. O texto original será preservado.</p><button>Registrar</button></form>',
 trips:'<h2>Abrir viagem</h2><form id="dataForm">'+field('Motorista','driver')+'<label>Finalidade</label><select id="purpose"><option>Buscar doações</option><option>Culto</option><option>Consulta médica</option><option>Ressocialização</option><option>Compras</option><option>Serviços</option><option>Outros</option></select>'+field('Destino','destination','text',false)+field('Acompanhantes','companions','text',false)+field('KM inicial','km','number')+field('Saída','departure','datetime-local',true,localTime())+'<button>Abrir viagem</button></form>',
 devotionals:'<h2>Nova devocional</h2><form id="dataForm">'+field('Tema / passagem bíblica','theme')+field('Quem ministrou','presenter')+field('Início','start','datetime-local',true,localTime())+field('Término','end','datetime-local',true,localTime(new Date(Date.now()+45*60000)))+'<h3>Presença dos acolhidos ativos</h3>'+(
 stays.length?stays.map(s=>'<div class="item"><b>'+esc(s.crl_residents?.full_name||'Acolhido')+'</b><div class="radio-group"><label><input type="radio" name="status_'+esc(s.id)+'" value="present" checked> Presente</label><label><input type="radio" name="status_'+esc(s.id)+'" value="absent"> Ausente</label><label><input type="radio" name="status_'+esc(s.id)+'" value="late"> Atrasou</label></div><input data-reason="'+esc(s.id)+'" placeholder="Justificativa quando houver falta"></div>').join(''):'<p>Nenhum acolhido ativo encontrado.</p>')+'<button '+(!stays.length?'disabled':'')+'>Finalizar e registrar presenças</button></form>',
 meals:'<h2>Registrar refeições servidas</h2><form id="dataForm"><label>Tipo de refeição</label><select id="mealType"><option value="cafe">Café da manhã</option><option value="almoco">Almoço</option><option value="jantar">Jantar</option><option value="lanche">Lanche</option><option value="outro">Outros</option></select>'+field('Quantidade de refeições servidas','servings','number')+field('Data e hora','servedAt','datetime-local',true,localTime())+field('Observações','mealNotes','text',false)+'<p class="muted">Registrar o número realmente servido, não uma estimativa.</p><button>Salvar refeições</button></form>',
 documents:documentForm(stays),
 evolution:evolutionForm(stays),
 audit:auditForm(),
 diagnostic:diagnosticForm(),
 stock:operationsForm('stock',member),
 cash:operationsForm('cash',member),
 monitors:'<div id="monitorQuickCard"><h3>Acesso rápido: Diogo (voluntário)</h3><p>Um toque cria o acesso do monitor e gera uma senha forte para você copiar. O administrador ativa e gerencia os acessos dos monitores.</p><label for="quickMonitorVinculo">Vínculo do monitor</label><select id="quickMonitorVinculo"><option value="voluntario">Voluntário</option></select><button id="activateDiogo" type="button">Ativar monitor Diogo</button><p id="monitorQuickStatus" role="status"></p><div id="monitorCreatedCredentials" role="status"></div></div><h2>Cadastrar monitor</h2><p class="muted">Escolha Aluno (vinculado ao cadastro do acolhido), Voluntário ou Contratado (com salário mensal). Todos terão perfil de acesso Monitor. A senha curta informada anteriormente não atende à política do sistema.</p><form id="dataForm"><label>Nome completo</label><input id="monitorName" type="text" maxlength="120" value="Diogo" required><label>Vínculo</label><select id="monitorVinculo" required><option value="voluntario">Voluntário</option><option value="aluno">Aluno</option><option value="contratado">Contratado</option></select><div id="monitorStudentBox" style="display:none"><label>Aluno existente</label><select id="monitorResident">'+stays.map(st=>'<option value="'+st.crl_residents?.id+'">'+esc(st.crl_residents?.full_name||'')+'</option>').join('')+'</select></div><div id="monitorSalaryBox" style="display:none"><label>Salário mensal (R$)</label><input id="monitorSalary" type="number" min="0.01" step="0.01"></div><label>Telefone</label><input id="monitorPhone" type="tel" maxlength="40"><label>Usuário para login</label><input id="monitorUsername" type="text" value="diogo" pattern="[a-z][a-z0-9._-]{2,39}" maxlength="40" autocapitalize="none" required><label>Senha inicial</label><input id="monitorPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><label>Confirmar senha</label><input id="monitorConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><p class="muted">Use 12 ou mais caracteres, com maiúscula, minúscula, número e símbolo.</p><button type="button" id="generateMonitorPassword" class="secondary">Gerar senha forte</button><button type="submit">Cadastrar monitor</button><p id="monitorGeneratedHint" class="muted" role="status"></p></form>',
 contributions:'<h2>Nova contribuição (ADM)</h2><form id="dataForm"><label>Acolhido ativo</label><select id="stay" required>'+stayOptions()+'</select>'+field('Valor do mês em reais — 0 para vaga G5','amount','number')+field('Vencimento','dueDate','date',true,localTime().slice(0,10))+'<p class="muted">O valor será dividido por 30 para calcular a diária administrativa.</p><button '+(!stays.length?'disabled':'')+'>Registrar contribuição</button></form>',
 stats:'<h2>Indicadores gerais (ADM)</h2><form id="dataForm"><label>Mês</label><select id="month">'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'" '+(i===new Date().getMonth()?'selected':'')+'>'+['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][i]+'</option>').join('')+'</select>'+field('Ano','year','number',true,new Date().getFullYear())+'<button>Consultar dashboard</button></form>'
 };
 el('formArea').innerHTML=forms[view];

 if(view==='monitors'){
  const syncResident=()=>{
   const st=stays.find(x=>x.crl_residents?.id===el('monitorResident').value);
   if(st){
    el('monitorName').value=st.crl_residents.full_name;
    el('monitorUsername').value='aluno.'+st.id.slice(0,8);
   }
  };
  const toggle=()=>{
   const v=el('monitorVinculo').value;
   el('monitorStudentBox').style.display=v==='aluno'?'':'none';
   el('monitorSalaryBox').style.display=v==='contratado'?'':'none';
   el('monitorName').readOnly=v==='aluno';
   if(v==='aluno')syncResident();
  };
  el('monitorVinculo').onchange=toggle;toggle();
  el('monitorResident').onchange=syncResident;
  const activate=el('activateDiogo');
  activate.onclick=async()=>{
   if(member?.role!=='admin'||monitorPreview)return;
   if(el('quickMonitorVinculo').value!=='voluntario'){status('Para aluno ou contratado, use o cadastro completo abaixo.',true);return}
   if(!confirm('Ativar Diogo como monitor voluntário?'))return;
   const password=makeSecureMonitorPassword();
   activate.disabled=true;
   el('monitorQuickStatus').textContent='Criando usuário monitor no Supabase...';
   try{
    const r=await adminMonitors({action:'create',username:'diogo',display_name:'Diogo',monitor_vinculo:el('quickMonitorVinculo').value,password});
    if(!r.success)throw Error('O servidor não confirmou a criação do usuário.');
    showMonitorCredentials('diogo',password);
    activate.textContent='Monitor Diogo ativado';
    el('monitorQuickStatus').textContent='Monitor criado. Copie a senha antes de sair desta tela.';
    status('Usuário diogo ativado! Copie e guarde a senha gerada.');
    await loadMonitors();
   }catch(e){
    el('monitorQuickStatus').textContent=e.message||'Falha na ativação';
    status(e.message||'Não foi possível ativar o monitor.',true);
    activate.disabled=false;
   }
  };
  el('generateMonitorPassword').onclick=()=>{
   const generated=makeSecureMonitorPassword();
   el('monitorPassword').value=generated;
   el('monitorConfirm').value=generated;
   el('monitorPassword').type='text';
   el('monitorGeneratedHint').textContent='Senha forte gerada somente neste navegador. Copie e guarde antes de cadastrar; ela não será mostrada novamente.';
  };
 }

 el('listTitle').textContent=({diagnostic:'Verificação de conexões',audit:'Eventos de auditoria',stock:'Estoque e consumo',cash:'Caixa institucional',evolution:'Relatórios de evolução',medications:'Medicamentos e receitas',resocialization:'Ressocialização',profile:'Prontuário do acolhido',documents:'Declarações emitidas',tasks:'Escala de tarefas',monitors:'Monitores cadastrados',history:'Resultados da busca',files:'Arquivos recentes',students:'Acolhidos ativos',contributions:'Contribuições e pagamentos',notes:'Registros recentes',trips:'Viagens e quilômetros',devotionals:'Devocionais realizadas',meals:'Refeições registradas',stats:'Resumo do período'})[view];
 const dataForm=el('dataForm');if(dataForm)dataForm.onsubmit=submit;
 if(view==='medications'||view==='resocialization')void bindCare({db,member,el,kind:view,status});
 if(view==='documents')void bindDocuments({db,member,el,status,stays});
}
function addItem(title,details){const item=document.createElement('div');item.className='item';const b=document.createElement('b');b.textContent=title;const p=document.createElement('div');p.className='muted';p.textContent=details;item.append(b,p);el('listArea').append(item);return item}
async function loadList(){
 if(view==='dashboard'){
  await loadDashboard({db,member,user,stays,el,esc,fmt,localTime,setView,canView});
  return;
 }
 const root=el('listArea');root.replaceChildren();
 if(moduleFilter!=='all'){
  const info=document.createElement('div');info.className='filter-banner';
  const labels={today:'Hoje',month:'Mês atual',overdue:'Em atraso',open:'Em andamento',pending:'Pendentes',month_in:'Entradas do mês',month_in_kg:'KG recebidos no mês',month_out_kg:'KG consumidos no mês',month_expense:'Despesas do mês',near9:'Próximos 9 meses',concluded_month:'Conclusões do mês',departures_month:'Desistências e abandonos do mês'};
  info.textContent='Filtro: '+(labels[moduleFilter]||'Seleção atual')+' · ';
  const clear=document.createElement('button');clear.type='button';clear.textContent='Limpar';clear.onclick=()=>setView(view);
  info.append(clear);root.append(info);
 }
 if(view==='diagnostic'){root.textContent='Clique em “Verificar conexões agora” para iniciar os testes sem alterar dados.';return}
 if(view==='audit'){await loadAudit({db,member,el,root,status});return}
 if(view==='stock'||view==='cash'){await loadOperations({db,kind:view,member,root,filter:moduleFilter});return}
 if(view==='evolution'){await loadEvolution({db,member,stays,root,status});return}
 if(view==='medications'||view==='resocialization'){await loadCareList({db,member,stays,root,kind:view,status,filter:moduleFilter});return}
 if(view==='tasks'){await loadTasks();return}
 if(view==='profile'){await loadProntuario({db,member,stays,stayId:el('profileStay')?.value,root,status});return}
 if(view==='documents'){await listDocuments({db,member,el,status,stays});return}
 if(view==='monitors'){await loadMonitors();return}
 if(view==='files'){await loadAttachments();return}
 if(view==='students'){
  if(!stays.length)root.textContent='Nenhum acolhido ativo cadastrado.';
  const term=el('globalSearch').value.trim().toLocaleLowerCase('pt-BR');
  for(const st of stays.filter(st=>(st.crl_residents?.full_name||'').toLocaleLowerCase('pt-BR').includes(term)&&(moduleFilter!=='near9'||(()=>{const due=new Date(st.admission_date+'T12:00:00Z');due.setUTCMonth(due.getUTCMonth()+9);const remaining=(due-new Date())/86400000;return remaining>=-1&&remaining<=30})()))){
    const item=addItem(st.crl_residents?.full_name||'Acolhido','Entrada: '+st.admission_date);
    const profileButton=document.createElement('button');profileButton.type='button';profileButton.textContent='Abrir prontuário';
    profileButton.style.marginRight='7px';
    profileButton.onclick=async()=>{await setView('profile');if(el('profileStay')){el('profileStay').value=st.id;await loadList()}};
    if(canView('profile'))item.append(profileButton);
    if(member.role==='admin'){
      const doc=document.createElement('button');doc.type='button';doc.textContent='Gerar declaração';
      doc.style.marginRight='7px';doc.onclick=async()=>{
       await setView('documents');
       if(el('docStay')){el('docStay').value=st.id;el('docStay').dispatchEvent(new Event('change'));}
      };
      item.append(doc);
      const b=document.createElement('button');b.textContent='Encerrar acolhimento';b.type='button';
      b.onclick=()=>showCloseStay(st,item);item.append(b);
    }
  }
  return;
 }
 if(view==='history'){
  if(moduleFilter==='concluded_month'||moduleFilter==='departures_month'){
   const beginning=new Date(),year=beginning.getFullYear(),month=String(beginning.getMonth()+1).padStart(2,'0');
   const first=year+'-'+month+'-01',next=new Date(year,beginning.getMonth()+1,1).toISOString().slice(0,10);
   let q=db.from('crl_stays').select('admission_date,departure_date,status,crl_residents(full_name)').eq('institution_id',member.institution_id).gte('departure_date',first).lt('departure_date',next);
   q=moduleFilter==='concluded_month'?q.eq('status','concluded'):q.in('status',['requested','abandoned']);
   const r=await q.order('departure_date',{ascending:false}).limit(100);
   if(r.error){root.textContent='Não foi possível consultar as saídas.';return}
   if(!r.data?.length)root.textContent='Nenhum registro de saída no mês.';
   for(const row of r.data||[])addItem(row.crl_residents?.full_name||'Acolhido',row.status+' · Saída: '+row.departure_date);
   return;
  }
  root.textContent='Digite um nome para pesquisar as passagens anteriores.';
  return;
 }
 if(view==='stats'){root.textContent='Selecione mês e ano e consulte os indicadores administrativos.';return}
 if(view==='contributions'){await loadContributions();return}
 if(view==='meals'){
  const base=db.from('crl_meals').select('meal_type,servings,served_at').eq('institution_id',member.institution_id);
  const r=await (moduleFilter==='month'?base.gte('served_at',new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()).lt('served_at',new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toISOString()):base).order('served_at',{ascending:false}).limit(100);
  if(r.error){root.textContent='Falha ao consultar refeições.';return}
  if(!r.data.length)root.textContent='Nenhuma refeição registrada.';
  for(const m of r.data)addItem(m.meal_type+' • '+m.servings+' refeições',fmt(m.served_at));
  return;
 }
 if(view==='notes'){
  if(!stays.length){root.textContent='Nenhum registro ainda.';return}
  const r=await db.from('crl_records').select('id,category,original_text,created_at,stay_id,author_id,correction_of,correction_reason').eq('institution_id',member.institution_id).in('stay_id',stays.map(s=>s.id)).order('created_at',{ascending:false}).limit(25);
  if(r.error){root.textContent='Falha ao consultar registros.';return}
  if(!r.data.length)root.textContent='Nenhuma rotina registrada.';
  for(const x of r.data){const name=stays.find(s=>s.id===x.stay_id)?.crl_residents?.full_name||'Acolhido';const item=addItem(name+' • '+x.category+(x.correction_of?' (retificação)':''),fmt(x.created_at)+' — '+x.original_text+(x.correction_reason?' | Motivo: '+x.correction_reason:''));if(x.author_id===user.id||member.role==='admin'){const b=document.createElement('button');b.type='button';b.textContent='Retificar registro';b.onclick=()=>showNoteCorrection(x,item);item.append(b)}}
  return;
 }
 if(view==='devotionals'){
  const base=db.from('crl_activities').select('title,presenter,starts_at,ends_at').eq('institution_id',member.institution_id).eq('type','devocional');
  const r=await (moduleFilter==='month'?base.gte('starts_at',new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()).lt('starts_at',new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toISOString()):base).order('starts_at',{ascending:false}).limit(100);
  if(r.error){root.textContent='Falha ao consultar devocionais.';return}
  if(!r.data.length)root.textContent='Nenhuma devocional finalizada.';
  for(const a of r.data)addItem(a.title,(a.presenter||'Ministrante não informado')+' • '+fmt(a.starts_at)+' a '+fmt(a.ends_at));
  return;
 }
 if(view==='trips'){
  const base=db.from('crl_vehicle_trips').select('id,driver_name,purpose,destination,departure_at,arrival_at,km_initial,km_final,km_driven,created_by').eq('institution_id',member.institution_id);
  const r=await (moduleFilter==='month'?base.gte('departure_at',new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()).lt('departure_at',new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toISOString()):base).order('departure_at',{ascending:false}).limit(100);
  if(r.error){root.textContent='Falha ao consultar viagens.';return}
  if(!r.data.length)root.textContent='Nenhuma viagem cadastrada.';
  for(const t of r.data){
   const distance=t.km_driven==null?'Em andamento':Number(t.km_driven).toLocaleString('pt-BR')+' km';
   const item=addItem(t.purpose+' — '+t.driver_name,fmt(t.departure_at)+' • '+distance);
   if(!t.arrival_at && t.created_by===user.id){
    const bt=document.createElement('button');bt.textContent='Finalizar viagem';bt.type='button';
    bt.onclick=()=>showTripFinish(t,item);item.append(bt);
   }
   if(t.arrival_at && member.role==='admin'){
    const b=document.createElement('button');b.type='button';b.textContent='Retificar viagem (ADM)';b.onclick=()=>showTripRectification(t,item);item.append(b);
   }
  }
 }
}



async function loadTasks(){
 const root=el('listArea');root.replaceChildren();
 const base=db.from('crl_tasks').select('id,title,stay_id,recurrence,due_at,status,completed_at').eq('institution_id',member.institution_id);
 const r=await (moduleFilter==='today'?base.gte('due_at',new Date(new Date().toDateString()).toISOString()).lt('due_at',new Date(new Date(new Date().toDateString()).getTime()+86400000).toISOString()).neq('status','done'):base).order('due_at',{ascending:moduleFilter==='today'}).limit(100);
 if(r.error){root.textContent='Não foi possível carregar as tarefas.';return}
 if(!r.data?.length){root.textContent='Nenhuma tarefa cadastrada.';return}
 for(const t of r.data){
   const resident=stays.find(s=>s.id===t.stay_id)?.crl_residents?.full_name||(t.stay_id?'Acolhido não ativo':'Equipe / geral');
   const item=addItem(t.title,'Responsável: '+resident+' · '+fmt(t.due_at)+' · '+(t.recurrence||'Única')+' · '+(t.status==='done'?'Concluída':'Programada'));
   if(t.status==='planned'){
    const button=document.createElement('button');button.type='button';button.textContent='Concluir tarefa';
    button.onclick=async()=>{
     if(!confirm('Confirmar conclusão desta tarefa?'))return;
     button.disabled=true;
     const answer=prompt('Observação da conclusão (opcional):');
     if(answer===null){button.disabled=false;return}
     const note=answer;
     const result=await db.rpc('crl_complete_task',{p_task:t.id,p_notes:note});
     if(result.error){status('Não foi possível concluir: '+result.error.message,true);button.disabled=false;return}
     status('Tarefa concluída e próximo agendamento criado quando recorrente.');
     await loadTasks();
    };
    item.append(button);
   }
 }
}

async function loadAttachments(){
 const root=el('listArea');root.replaceChildren();
 if(!stays.length){root.textContent='Nenhum acolhido ativo com acesso a arquivos.';return}
 const r=await db.from('crl_files').select('id,stay_id,category,storage_path,created_at')
 .eq('institution_id',member.institution_id).in('stay_id',stays.map(x=>x.id))
 .order('created_at',{ascending:false}).limit(60);
 if(r.error){root.textContent='Não foi possível consultar os anexos.';return}
 if(!r.data.length){root.textContent='Nenhum arquivo anexado.';return}
 for(const file of r.data){
  const name=stays.find(st=>st.id===file.stay_id)?.crl_residents?.full_name||'Acolhido';
  const item=addItem(name+' — '+file.category,fmt(file.created_at));
  const b=document.createElement('button');b.type='button';b.textContent='Abrir documento (5 minutos)';
  b.onclick=async()=>{
   b.disabled=true;const signed=await db.storage.from('crl-private').createSignedUrl(file.storage_path,300);
   b.disabled=false;
   if(signed.error||!signed.data?.signedUrl){status('Acesso ao arquivo não autorizado.',true);return}
   window.open(signed.data.signedUrl,'_blank','noopener,noreferrer');
  };item.append(b);
 }
}
// Cadastro completo do acolhido: feito pelo ADM ou pelo monitor da equipe (não pelo monitor aluno).
// Depois de salvo, CPF, RG, telefones e endereço ficam visíveis só para o ADM.
function admissionForm(){
 if(!canView('files'))return '<h2>Acolhidos</h2><p class="muted">O cadastro de novos acolhidos é feito pela equipe (ADM ou monitor).</p>';
 const admin=member?.role==='admin';
 return '<h2>Novo acolhimento</h2><p class="muted">Só nome e data de entrada são obrigatórios; preencha o que tiver em mãos.'+(admin?'':' Depois de salvo, CPF, RG, telefones e endereço ficam visíveis só para o ADM.')+'</p><form id="dataForm">'+
 '<h3 class="form-section">Acolhido</h3>'+field('Nome completo','name')+
 '<div class="two">'+field('Data de entrada','date','date',true,localTime().slice(0,10))+field('Data de nascimento','birth','date',false)+'</div>'+
 '<div class="two">'+field('CPF','cpf','text',false)+field('RG','rg','text',false)+'</div>'+
 field('Telefone do acolhido','phone','tel',false)+field('Endereço','address','text',false)+
 '<h3 class="form-section">Responsável / família</h3>'+field('Nome do responsável','responsible','text',false)+field('Telefone do responsável','rphone','tel',false)+
 '<h3 class="form-section">Fotos e documentos</h3>'+
 '<label for="admPhoto">Foto do acolhido</label><input id="admPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">'+
 '<label for="admDocs">Documentos (RG, CPF, outros) — pode escolher vários</label><input id="admDocs" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple>'+
 '<p class="muted">JPG, PNG, WebP ou PDF até 10 MB cada. A foto do acolhido aparece no prontuário; documentos ficam visíveis só para o ADM.</p>'+
 '<label for="admNotes">Observações da entrada</label><textarea id="admNotes" maxlength="4000" placeholder="Pertences, como chegou, informações importantes"></textarea>'+
 (admin?'<h3 class="form-section">Contribuição (ADM)</h3><div class="two">'+field('Valor mensal em R$ (0 = vaga G5)','monthly','number',false)+field('Dia do vencimento','dueday','number',false)+'</div>':'')+
 '<button type="submit">Cadastrar acolhido</button></form>';
}
const FILE_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
async function storeFile(f,stayId,category){
 const ext=FILE_TYPES[f.type];
 if(!ext||f.size<=0||f.size>10*1024*1024)return {ok:false,reason:f.name+': use JPG, PNG, WebP ou PDF até 10 MB'};
 const path=member.institution_id+'/'+stayId+'/'+crypto.randomUUID()+'.'+ext;
 const up=await db.storage.from('crl-private').upload(path,f,{contentType:f.type,upsert:false});
 if(up.error)return {ok:false,reason:f.name+': falha no envio'};
 const row=await db.from('crl_files').insert({institution_id:member.institution_id,stay_id:stayId,storage_path:path,category,uploaded_by:user.id});
 if(row.error)return {ok:false,reason:f.name+': enviado, mas sem vínculo (avise o ADM)'};
 return {ok:true};
}
async function submitAdmission(){
 const val=id=>(el(id)?.value||'').trim();
 if(val('name').length<3){status('Informe o nome completo.',true);return}
 const admin=member.role==='admin';
 const params={p_institution:member.institution_id,p_full_name:val('name'),p_admission_date:val('date'),
  p_birth_date:val('birth')||null,p_cpf:val('cpf')||null,p_rg:val('rg')||null,p_phone:val('phone')||null,
  p_address:val('address')||null,p_responsible_name:val('responsible')||null,p_responsible_phone:val('rphone')||null,
  p_notes:val('admNotes')||null,
  p_monthly:admin&&val('monthly')!==''?Number(val('monthly')):null,
  p_due_day:admin&&val('dueday')!==''?Number(val('dueday')):null};
 const photo=el('admPhoto')?.files?.[0]||null;
 const docs=Array.from(el('admDocs')?.files||[]);
 status('Salvando cadastro...');
 const r=await db.rpc('crl_register_admission',params);
 if(r.error){status(r.error.message||'Não foi possível cadastrar. Confira os dados.',true);return}
 const stayId=r.data?.stay_id;
 const failures=[];let sent=0;
 const uploads=[...(photo?[[photo,'foto']]:[]),...docs.map(d=>[d,'documento'])];
 for(const [f,cat] of uploads){
  status('Enviando arquivos... ('+(sent+failures.length+1)+' de '+uploads.length+')');
  const res=await storeFile(f,stayId,cat);
  if(res.ok)sent++;else failures.push(res.reason);
 }
 await refresh();
 if(failures.length)status('Acolhido cadastrado. '+sent+' arquivo(s) enviado(s); não enviados: '+failures.join('; ')+'. Reenvie pela aba Arquivos.',true);
 else status('Acolhido cadastrado'+(sent?' com '+sent+' arquivo(s)':'')+'.');
}
async function uploadAttachment(){
 if(!authenticated()||!stays.length)throw Error('no_stay');
 const f=el('attachedFile')?.files?.[0];if(!f)throw Error('no_file');
 const accepted={
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'
 };
 const ext=accepted[f.type];
 if(!ext||f.size<=0||f.size>10*1024*1024){status('Use JPG, PNG, WebP ou PDF com tamanho máximo de 10 MB.',true);return}
 const stayId=el('stay').value;if(!stays.some(st=>st.id===stayId))throw Error('stay_invalid');
 const path=member.institution_id+'/'+stayId+'/'+crypto.randomUUID()+'.'+ext;
 const up=await db.storage.from('crl-private').upload(path,f,{contentType:f.type,upsert:false});
 if(up.error){status('Falha no envio. Verifique conexão e permissão.',true);return}
 const row=await db.from('crl_files').insert({
  institution_id:member.institution_id,stay_id:stayId,
  storage_path:path,category:el('fileCategory').value,uploaded_by:user.id
 });
 if(row.error){status('Foto enviada, mas vínculo pendente. Não envie novamente; peça conferência ao ADM.',true);return}
 status('Arquivo privado associado ao prontuário.');
 await refresh();
}


const passwordStrong=s=>s.length>=12&&s.length<=128&&/[a-z]/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s)&&/[^A-Za-z0-9]/.test(s);
function makeSecureMonitorPassword(){
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
 const random=new Uint32Array(20);
 crypto.getRandomValues(random);
 return 'Aa7!'+Array.from(random,x=>alphabet[x%alphabet.length]).join('');
}
function showMonitorCredentials(username,password){
 const root=el('monitorCreatedCredentials');
 if(!root)return;
 root.replaceChildren();
 const title=document.createElement('strong');title.textContent='Acesso criado com sucesso';
 const login=document.createElement('p');login.textContent='Usuário: '+username;
 const pwd=document.createElement('p');pwd.textContent='Senha inicial: ';
 const span=document.createElement('code');span.textContent=password;pwd.append(span);
 const note=document.createElement('p');note.textContent='Guarde agora: esta senha não fica salva em texto no sistema e será ocultada ao sair da tela.';
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar usuário e senha';
 copy.onclick=async()=>{
  try{
   await navigator.clipboard.writeText('Usuário: '+username+'\nSenha: '+password);
   status('Acesso copiado. Guarde em um local seguro.');
  }catch(_){status('Selecione e copie o texto da senha exibida acima.',true)}
 };
 root.append(title,login,pwd,note,copy);
}
async function adminMonitors(body){
 if(member?.role!=='admin')throw Error('Acesso restrito ao ADM');
 const {data,error}=await db.functions.invoke('crl-admin-monitors',{body});
 if(error)throw Error(data?.error||'Serviço administrativo indisponível');
 if(data?.error)throw Error(data.error);
 return data;
}
async function loadMonitors(){
 const root=el('listArea');root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Acesso exclusivo do ADM.';return}
 root.textContent='Consultando monitores...';
 try{
  const result=await adminMonitors({action:'list'});
  root.replaceChildren();
  if(!result.monitors?.length){root.textContent='Nenhum monitor cadastrado. Utilize o formulário Cadastrar monitor acima.';return}
  const diogo=result.monitors.find(m=>m.username==='diogo');
  if(diogo){const quickBtn=el('activateDiogo');if(quickBtn){quickBtn.disabled=true;quickBtn.textContent=diogo.active?'Diogo já está ativo':'Diogo bloqueado — reative pela lista';}}

  for(const m of result.monitors){
   const label={aluno:'Aluno',voluntario:'Voluntário',contratado:'Contratado'}[m.monitor_vinculo]||'Vínculo não informado';
   const item=addItem(m.display_name,(m.active?'Ativo':'Bloqueado')+' · '+label+(m.monitor_vinculo==='contratado'?' · Salário R$ '+Number(m.salary_monthly||0).toLocaleString('pt-BR',{minimumFractionDigits:2}):''));
   const username=document.createElement('div');username.className='code-label';username.textContent='Login: '+m.username;item.append(username);
   const vinculo=document.createElement('select');vinculo.setAttribute('aria-label','Vínculo de '+m.display_name);
   [['aluno','Aluno'],['voluntario','Voluntário'],['contratado','Contratado']].forEach(([value,label])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;vinculo.append(opt)});
   vinculo.value=m.monitor_vinculo||'voluntario';
   const studentPick=document.createElement('select');
   for(const st of stays){
    const opt=document.createElement('option');
    opt.value=st.crl_residents?.id||'';
    opt.textContent=st.crl_residents?.full_name||'Acolhido';
    studentPick.append(opt);
   }
   studentPick.value=m.resident_id||'';
   const salaryInput=document.createElement('input');
   salaryInput.type='number';salaryInput.min='0.01';salaryInput.step='0.01';
   salaryInput.placeholder='Salário mensal em reais';
   salaryInput.value=m.salary_monthly||'';
   const updateLinkedFields=()=>{
    studentPick.style.display=vinculo.value==='aluno'?'':'none';
    salaryInput.style.display=vinculo.value==='contratado'?'':'none';
   };
   vinculo.onchange=updateLinkedFields;
   updateLinkedFields();
   const saveLink=document.createElement('button');
   saveLink.type='button';saveLink.textContent='Salvar vínculo e salário';
   saveLink.onclick=async()=>{
    saveLink.disabled=true;
    try{
     await adminMonitors({action:'change_vinculo',member_id:m.id,
      monitor_vinculo:vinculo.value,
      resident_id:vinculo.value==='aluno'?studentPick.value:null,
      salary_monthly:vinculo.value==='contratado'?Number(salaryInput.value):null});
     status('Vínculo e salário atualizados.');
     await loadMonitors();
    }catch(e){status(e.message,true);saveLink.disabled=false}
   };
   item.append(vinculo,studentPick,salaryInput,saveLink);
   if(!m.active){
    const activate=document.createElement('button');activate.type='button';activate.textContent='Reativar monitor';
    activate.onclick=async()=>{
     if(!confirm('Reativar o acesso de '+m.display_name+'?'))return;
     activate.disabled=true;
     try{await adminMonitors({action:'unblock',member_id:m.id});status('Monitor reativado.');await loadMonitors()}
     catch(e){status(e.message||'Reativação não concluída.',true);activate.disabled=false}
    };
    item.append(activate);continue;
   }
   const controls=document.createElement('div');controls.className='manager-actions';
   const reset=document.createElement('button');reset.type='button';reset.textContent='Redefinir senha';reset.onclick=()=>showMonitorReset(m,item);
   const block=document.createElement('button');block.type='button';block.className='warn';block.textContent='Bloquear monitor';
   block.onclick=async()=>{
    if(!confirm('Bloquear o acesso de '+m.display_name+'? O histórico permanecerá arquivado.'))return;
    block.disabled=true;
    try{
     const result=await adminMonitors({action:'block',member_id:m.id});
     status(result.auth_ban_applied?'Monitor bloqueado.':'Perfil CRL bloqueado; verifique a suspensão de sessão no Supabase.');
     await loadMonitors();
    }catch(e){status(e.message,true)}finally{block.disabled=false}
   };
   if(m.monitor_vinculo==='contratado'){
    const pay=document.createElement('button');pay.type='button';pay.textContent='Lançar salário nas despesas';
    pay.onclick=async()=>{
     const suggested=new Date().toISOString().slice(0,7);
     const selected=prompt('Competência do salário (AAAA-MM):',suggested);
     if(selected===null)return;
     if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(selected)){status('Use o formato AAAA-MM.',true);return}
     const competency=selected+'-01';
     if(!confirm('Registrar a despesa de salário de '+m.display_name+' da competência '+selected+'?'))return;
     pay.disabled=true;
     const r=await db.rpc('crl_register_monitor_salary',{p_member:m.id,p_competence:competency});
     if(r.error){status(r.error.message||'Não foi possível lançar salário.',true);pay.disabled=false}
     else {status('Salário lançado nas despesas sem duplicidade.');await loadMonitors()}
    };controls.append(pay);
   }
   controls.append(reset,block);item.append(controls);
  }
  const payroll=await db.from('crl_monitor_payroll')
   .select('member_id,competence,amount,created_at')
   .eq('institution_id',member.institution_id)
   .order('competence',{ascending:false}).limit(80);
  if(!payroll.error&&payroll.data?.length){
   const heading=document.createElement('h3');heading.textContent='Histórico de salários lançados';root.append(heading);
   for(const row of payroll.data){
    const person=result.monitors.find(m=>m.id===row.member_id);
    addItem((person?.display_name||'Monitor contratado')+' · '+row.competence.slice(0,7),
      Number(row.amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' · Registrado nas despesas');
   }
  }
 }catch(e){root.textContent='Não foi possível carregar a equipe.';status(e.message||'Erro administrativo',true)}
}
async function createMonitor(){
 if(member?.role!=='admin')throw Error('Sem autorização');
 const fullName=el('monitorName').value.trim();
 const username=el('monitorUsername').value.trim().toLowerCase();
 const pwd=el('monitorPassword').value;
 const confirmation=el('monitorConfirm').value;
 if(!/^[a-z][a-z0-9._-]{2,39}$/.test(username)||fullName.length<3){status('Nome ou usuário inválido.',true);return}
 if(!passwordStrong(pwd)||pwd!==confirmation){status('Senhas diferentes ou fora do padrão mínimo de segurança.',true);return}
 try{
  const r=await adminMonitors({action:'create',username,display_name:fullName,monitor_vinculo:el('monitorVinculo').value,password:pwd,resident_id:el('monitorVinculo').value==='aluno'?el('monitorResident').value:null,salary_monthly:el('monitorVinculo').value==='contratado'?Number(el('monitorSalary').value):null,monitor_phone:el('monitorPhone').value});
  el('monitorPassword').value='';el('monitorConfirm').value='';
  el('monitorPassword').type='password';
  el('monitorGeneratedHint').textContent='A senha foi definida. Guarde-a em local seguro; o sistema não a exibe novamente.';
  if(!r.success)throw Error('Cadastro não confirmado');
  status('Monitor '+username+' cadastrado.');await loadMonitors();
 }catch(e){status(e.message||'Não foi possível cadastrar.',true)}
}
function showMonitorReset(m,item){
 const old=item.querySelector('form');if(old){old.remove();return}
 const form=document.createElement('form');
 form.innerHTML='<label>Nova senha de '+esc(m.display_name)+'</label><input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required><label>Confirmar senha</label><input type="password" name="confirm" autocomplete="new-password" required><p class="muted">Inclua maiúscula, minúscula, número e símbolo.</p><button>Salvar nova senha</button>';
 item.append(form);
 form.onsubmit=async e=>{
  e.preventDefault();
  const password=form.elements.password.value;
  if(password!==form.elements.confirm.value||!passwordStrong(password)){status('Confira a confirmação e o padrão da senha.',true);return}
  const button=form.querySelector('button');button.disabled=true;
  try{
   await adminMonitors({action:'reset_password',member_id:m.id,password});
   form.remove();status('Senha redefinida com sucesso.');
  }catch(e){status(e.message||'Redefinição não concluída.',true)}
  finally{button.disabled=false}
 };
}

function showCloseStay(st,item){
 if(member?.role!=='admin')return;
 const old=item.querySelector('form');if(old){old.remove();return}
 const form=document.createElement('form');
 form.innerHTML='<label>Tipo de saída</label><select name="exitType" required><option value="concluded">Conclusão de 9 meses</option><option value="requested">Alta pedida / desistência</option><option value="administrative">Alta administrativa</option><option value="abandoned">Fuga ou abandono</option><option value="other">Outro encerramento</option></select><label>Data de saída</label><input type="date" name="exitDate" required><label>Justificativa e informações da saída</label><textarea name="reason" required minlength="5" maxlength="4000"></textarea><p class="muted">Somente o ADM pode confirmar. A passagem encerrada e seus registros serão preservados.</p><button type="submit">Confirmar encerramento</button>';
 form.elements.exitDate.value=new Date().toISOString().slice(0,10);item.append(form);
 form.onsubmit=async e=>{
  e.preventDefault();if(!confirm('Confirma o encerramento deste período? O histórico não poderá ser apagado.'))return;
  const button=form.querySelector('button');button.disabled=true;
  try{
   const r=await db.rpc('crl_close_stay',{p_stay:st.id,p_status:form.elements.exitType.value,p_date:form.elements.exitDate.value,p_reason:form.elements.reason.value.trim()});
   if(r.error)throw r.error;
   status('Acolhimento encerrado; histórico preservado.');await refresh();
  }catch(e){status('Encerramento não realizado: '+(e?.message||'erro de validação'),true)}
  finally{button.disabled=false}
 };
}
async function searchHistory(query){
 if(member?.role!=='admin')return;
 const root=el('listArea');root.replaceChildren();
 if(query.length<3){root.textContent='Digite pelo menos três letras.';return}
 const r=await db.from('crl_residents').select('id,full_name').eq('institution_id',member.institution_id).ilike('full_name','%'+query+'%').order('full_name').limit(25);
 if(r.error){root.textContent='Não foi possível consultar o histórico.';return}
 if(!r.data?.length){root.textContent='Nenhum cadastro encontrado.';return}
 for(const person of r.data){
  const item=addItem(person.full_name,'Verificando períodos de acolhimento…');
  const history=await db.from('crl_stays').select('id,admission_date,departure_date,departure_reason,status').eq('institution_id',member.institution_id).eq('resident_id',person.id).order('admission_date',{ascending:false}).limit(30);
  const description=item.querySelector('.muted');description.textContent=history.error?'Histórico indisponível.':
    (history.data||[]).map(st=>st.admission_date+' → '+(st.departure_date||'ativo')+' · '+({
      active:'Ativo',concluded:'Concluiu',requested:'Alta pedida',administrative:'Administrativa',abandoned:'Abandono',other:'Outra saída'
    }[st.status]||st.status)).join(' | ')||'Sem passagens';
  if(!history.error && member.role==='admin'){
   for(const historical of history.data||[]){
    const b=document.createElement('button');b.type='button';
    b.textContent='Prontuário '+historical.admission_date+(historical.status==='active'?' (atual)':' (histórico)');
    b.style.margin='5px 5px 0 0';
    b.onclick=async()=>{
      await setView('profile');
      const selector=el('profileStay');
      if(selector&&!Array.from(selector.options).some(opt=>opt.value===historical.id)){
       const option=document.createElement('option');option.value=historical.id;
       option.textContent=person.full_name+' — '+historical.admission_date;selector.append(option);
      }
      if(selector){selector.value=historical.id;await loadList()}
    };item.append(b);
   }
  }
  if(!history.error && !(history.data||[]).some(st=>st.status==='active')){
   const b=document.createElement('button');b.type='button';b.textContent='Iniciar nova passagem';b.onclick=()=>showReadmission(person,item);item.append(b)
  }
 }
}
function showReadmission(person,item){
 if(member?.role!=='admin')return;
 const old=item.querySelector('form');if(old){old.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>Nova data de entrada</label><input type="date" name="admission" required><label>Contribuição mensal (R$) — zero = G5</label><input name="monthly" type="number" min="0" step="0.01" value="0" required><label>Dia do vencimento (opcional)</label><input name="due" type="number" min="1" max="31"><p class="muted">A contagem dos nove meses reinicia. As passagens anteriores permanecem disponíveis ao ADM.</p><button type="submit">Confirmar retorno</button>';
 f.elements.admission.value=new Date().toISOString().slice(0,10);item.append(f);
 f.onsubmit=async e=>{
  e.preventDefault();if(!confirm('Abrir um novo período de nove meses para este acolhido?'))return;
  const btn=f.querySelector('button');btn.disabled=true;
  try{
   const r=await db.rpc('crl_readmit_resident',{p_resident:person.id,p_date:f.elements.admission.value,p_monthly:Number(f.elements.monthly.value),p_due_day:f.elements.due.value===''?null:Number(f.elements.due.value)});
   if(r.error)throw r.error;
   status('Novo período iniciado e histórico anterior preservado.');
   view='students';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));await refresh();
  }catch(e){status('Não foi possível iniciar o retorno: '+(e?.message||'erro de validação'),true)}
  finally{btn.disabled=false}
 };
}

function showNoteCorrection(record,item){
 const existing=item.querySelector('form');if(existing){existing.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>Relato corrigido</label><textarea name="amendedText" required maxlength="10000"></textarea><label>Motivo da retificação</label><textarea name="reason" required maxlength="1200"></textarea><p class="muted">O registro anterior será preservado. Esta correção terá autor e horário próprios.</p><button>Salvar retificação</button>';
 f.elements.amendedText.value=record.original_text;item.append(f);
 f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
 const r=await db.rpc('crl_amend_record',{p_record:record.id,p_text:f.elements.amendedText.value.trim(),p_reason:f.elements.reason.value.trim()});
 b.disabled=false;if(r.error){status('Retificação não autorizada ou inválida.',true);return}status('Retificação registrada e original preservado.');await loadList();
 };
}
function showTripRectification(trip,item){
 const existing=item.querySelector('form');if(existing){existing.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>KM final corrigido (opcional)</label><input name="km" type="number" step="0.1" min="0" placeholder="Informe somente se precisar corrigir"><label>Chegada corrigida (opcional)</label><input name="arrival" type="datetime-local"><label>Observação corrigida (opcional)</label><textarea name="notes"></textarea><label>Justificativa da retificação</label><textarea name="reason" required></textarea><p class="muted">O histórico original não será apagado. A retificação fica separada e auditável.</p><button>Registrar retificação</button>';
 item.append(f);
 f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
 const km=f.elements.km.value.trim();const arrival=f.elements.arrival.value;const r=await db.rpc('crl_rectify_trip',{p_trip:trip.id,p_reason:f.elements.reason.value.trim(),p_km_final:km===''?null:Number(km),p_arrival:arrival?new Date(arrival).toISOString():null,p_notes:f.elements.notes.value.trim()||null});
 b.disabled=false;if(r.error){status('Não foi possível registrar a retificação.',true);return}status('Retificação registrada; viagem original preservada.');await loadList();
 };
}

function showTripFinish(trip,item){
 const existing=item.querySelector('form');if(existing){existing.remove();return}
 const f=document.createElement('form');
 f.innerHTML='<label>KM inicial</label><div class="meter">'+esc(Number(trip.km_initial).toLocaleString('pt-BR'))+' km</div>'+field('KM final','final_'+trip.id,'number')+field('Chegada','arrive_'+trip.id,'datetime-local',true,localTime())+'<label>Devolvido limpo?</label><select id="clean_'+trip.id+'"><option value="true">Sim</option><option value="false">Não</option></select><label>Observações</label><textarea id="tripnote_'+trip.id+'"></textarea><div class="meter"><span>Distância percorrida: </span><strong id="distance_'+trip.id+'">—</strong></div><button>Confirmar chegada</button>';
 item.append(f);
 const k=el('final_'+trip.id);k.min=trip.km_initial;k.step='0.1';k.addEventListener('input',()=>{let km=Number(k.value)-Number(trip.km_initial);el('distance_'+trip.id).textContent=k.value!==''&&km>=0?km.toLocaleString('pt-BR')+' km':'—'});
 f.onsubmit=async e=>{
 e.preventDefault();const km=Number(k.value),arrive=el('arrive_'+trip.id).value;
 if(!Number.isFinite(km)||km<Number(trip.km_initial)||!arrive){status('Quilometragem ou horário inválido.',true);return}
 const btn=f.querySelector('button');btn.disabled=true;
 const r=await db.rpc('crl_finish_trip',{p_trip:trip.id,p_km_final:km,p_arrival:new Date(arrive).toISOString(),p_clean:el('clean_'+trip.id).value==='true',p_notes:el('tripnote_'+trip.id).value.trim()});
 btn.disabled=false;
 if(r.error){status('Não foi possível encerrar a viagem. Confira os dados e sua permissão.',true);return}
 status('Viagem finalizada: '+Number(r.data).toLocaleString('pt-BR')+' km rodados.');
 await loadList();
 }
}
function viewTitle(id){
 return ({dashboard:'Painel Geral',students:'Acolhidos',profile:'Prontuários',files:'Arquivos e fotos',
 history:'Histórico e retornos',notes:'Rotina diária',trips:'Veículo',devotionals:'Devocionais',medications:'Medicamentos e receitas',resocialization:'Ressocialização',
 tasks:'Escala de tarefas',meals:'Refeições',contributions:'Contribuições',
 monitors:'Usuários e monitores',documents:'Declarações',evolution:'Evolução mensal',stock:'Estoque',cash:'Caixa da casa',audit:'Auditoria',diagnostic:'Verificar sistema',stats:'Estatísticas gerais'})[id]||'CRL';
}
async function setView(next,filter='all'){
 if(!authenticated()||!canView(next))return;
 view=next;moduleFilter=filter;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
 el('appPanel').querySelector('.tabs').classList.remove('expanded');
 draw();await loadList();
 if(next==='monitors')el('formArea').scrollIntoView({behavior:'smooth',block:'start'});
 else window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>setView(b.dataset.jump));
el('moreMenu').onclick=()=>el('appPanel').querySelector('.tabs').classList.toggle('expanded');
el('globalSearch').addEventListener('input',async()=>{
 if(!authenticated())return;
 if(view!=='students')await setView('students');else await loadList();
});

function exportSummaryCsv(){
 if(member?.role!=='admin'||!lastMetrics)return;
 const d=lastMetrics;
 const keys=[
 ['Período inicial',d.period_start],['Período final',d.period_end],
 ['Acolhidos ativos ao final',d.active_at_end],['Entradas',d.admissions],
 ['Acolhimentos encerrados',d.closed],['Conclusões',d.concluded],
 ['Conclusões após nove meses',d.concluded_nine_months],
 ['Desistências a pedido',d.requested_departures],['Abandonos',d.abandonments],
 ['Saídas administrativas',d.administrative_departures],
 ['Taxa de conclusão (% dos encerrados)',d.nine_month_completion_rate??'Não calculável'],
 ['Concluem a cada 10 encerrados',d.nine_months_per_ten??'Não calculável'],
 ['KM rodados',d.kilometers],['Kg recebidos',d.received_kg],
 ['Kg consumidos',d.consumed_kg],['Refeições servidas',d.meals_served],
 ['Devocionais',d.devotionals],['Contribuições recebidas (R$)',d.paid_contributions]
 ];
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const text='\uFEFFIndicador;Valor\r\n'+keys.map(a=>a.map(quote).join(';')).join('\r\n');
 const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='CRL_indicadores_'+d.period_start+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function loadContributions(){
 const root=el('listArea');root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Acesso reservado ao ADM.';return}
 const r=await db.from('crl_contributions')
 .select('id,stay_id,amount,paid_amount,due_date,crl_stays(resident_id,crl_residents(full_name))')
 .eq('institution_id',member.institution_id).order('due_date',{ascending:false}).limit(moduleFilter==='overdue'?500:60);
 if(r.error){root.textContent='Não foi possível consultar contribuições.';return}
 if(!r.data.length){root.textContent='Nenhuma contribuição lançada.';return}
 const residentIds=[...new Set(r.data.map(c=>c.crl_stays?.resident_id).filter(Boolean))];
 const priv=residentIds.length?await db.rpc('crl_residents_private',{p_residents:residentIds}):{data:[]};
 const phoneOf=new Map((priv.data||[]).map(p=>[p.id,p.responsible_phone]));
 const brl=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 for(const c of r.data){
  const balance=Number(c.amount)-Number(c.paid_amount||0);
  if(moduleFilter==='overdue'&&!(c.due_date<localTime().slice(0,10)&&balance>0))continue;
  const name=c.crl_stays?.crl_residents?.full_name||'Acolhido';
  const details='Vencimento: '+c.due_date+' · Mensal: '+brl(c.amount)+' · Diária: '+brl(Number(c.amount)/30)+' · Recebido: '+brl(c.paid_amount)+' · Saldo: '+brl(balance);
  const item=addItem(name,details+(Number(c.amount)===0?' · G5 (vaga sustentada)':''));
  if(balance>0){
   const button=document.createElement('button');button.textContent='Registrar recebimento';button.type='button';
   button.onclick=()=>showPayment(c,item);item.append(button);
   const phone=String(phoneOf.get(c.crl_stays?.resident_id)||'').replace(/\D/g,'');
   if(phone.length>=10){
    const whats=document.createElement('button');whats.textContent='WhatsApp do responsável';whats.type='button';
    whats.onclick=()=>{
      let digits=phone;if(!digits.startsWith('55'))digits='55'+digits;
      const msg='Olá! Gostaríamos de conversar sobre a contribuição com vencimento em '+c.due_date+'. Valor pendente: '+brl(balance)+'.';
      window.open('https://wa.me/'+digits+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
    };item.append(whats);
   }
  }
 }
}
function showPayment(c,item){
 if(member?.role!=='admin')return;
 const old=item.querySelector('form');if(old){old.remove();return}
 const max=Number(c.amount)-Number(c.paid_amount||0);
 const f=document.createElement('form');
 f.innerHTML='<label>Valor recebido (R$)</label><input name="value" type="number" min="0.01" step="0.01" required><label>Data do pagamento</label><input name="date" type="date" required><label>Forma de pagamento</label><select name="method"><option>PIX</option><option>Dinheiro</option><option>Transferência</option><option>Outros</option></select><label>Observações</label><textarea name="notes"></textarea><p class="muted">Pagamento parcial permitido. Saldo disponível: '+max.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'.</p><button type="submit">Confirmar recebimento</button>';
 f.elements.date.value=localTime().slice(0,10);f.elements.value.max=String(max.toFixed(2));item.append(f);
 f.onsubmit=async e=>{
  e.preventDefault();const amount=Number(f.elements.value.value);
  if(!Number.isFinite(amount)||amount<=0||amount>max){status('Valor acima do saldo pendente.',true);return}
  const b=f.querySelector('button');b.disabled=true;
  const r=await db.rpc('crl_register_contribution_payment',{
   p_contribution:c.id,p_amount:amount,p_paid_on:f.elements.date.value,
   p_method:f.elements.method.value,p_notes:f.elements.notes.value.trim()
  });b.disabled=false;
  if(r.error){status('Não foi possível registrar o pagamento.',true);return}
  status('Pagamento registrado. Saldo recalculado.');await loadContributions();
 };
}

function renderSummary(d){
 lastMetrics=d;
 const list=el('listArea');list.replaceChildren();
 const rows=[
  ['Acolhidos ativos ao final do período',d.active_at_end],['Novas entradas',d.admissions],
  ['Acolhimentos encerrados',d.closed],['Conclusões registradas',d.concluded],
  ['Conclusões com 9 meses completos',d.concluded_nine_months],
  ['Desistências a pedido',d.requested_departures],['Abandonos',d.abandonments],
  ['Saídas administrativas',d.administrative_departures],['Quilômetros percorridos',d.kilometers+' km'],
  ['Alimentos recebidos',d.received_kg+' kg'],['Alimentos consumidos',d.consumed_kg+' kg'],
  ['Refeições servidas',d.meals_served],['Devocionais',d.devotionals],['Contribuições recebidas',Number(d.paid_contributions||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})]
 ];
 const grid=document.createElement('div');grid.className='metric-grid';
 for(const [label,val] of rows){const box=document.createElement('div');box.className='metric';const b=document.createElement('b');b.textContent=String(val??'—');const small=document.createElement('small');small.textContent=label;box.append(b,small);grid.append(box)}list.append(grid);
 const rate=document.createElement('div');rate.className='meter';rate.style.marginTop='12px';
 rate.textContent=d.closed===0?'Ainda não há acolhimentos encerrados no período para calcular a taxa.':'A cada 10 acolhimentos encerrados, '+d.nine_months_per_ten+' concluíram os nove meses ('+d.nine_month_completion_rate+'%).';
 list.append(rate);
 const note=document.createElement('p');note.className='muted';note.textContent='Taxa descritiva baseada em acolhimentos encerrados; não prevê a recuperação de ninguém. A interpretação por IA ainda não está conectada. Valores de contribuições exigem controle das datas efetivas de pagamento.';list.append(note);
 const actions=document.createElement('div');actions.className='row';
 const csv=document.createElement('button');csv.type='button';csv.textContent='Exportar CSV';csv.onclick=exportSummaryCsv;
 const print=document.createElement('button');print.type='button';print.textContent='Imprimir / salvar PDF';print.onclick=()=>window.print();actions.append(csv,print);list.append(actions);
}

async function submit(e){
 e.preventDefault();if(!authenticated())return;
 if(monitorPreview){status('Prévia apenas visual: volte ao ADM para salvar dados.',true);return}const form=el('dataForm'),btn=form.querySelector('button[type="submit"]')||form.querySelector('button');btn.disabled=true;status('Salvando...');
 try{
  let result;
  if(view==='diagnostic'){
   await runDiagnostic({db,member,user,root:el('listArea'),status});return;
  }else if(view==='audit'){
   await loadAudit({db,member,el,root:el('listArea'),status});return;
  }else if(view==='stock'||view==='cash'){
   await submitOperations({db,kind:view,member,user,el,status,refresh:loadList});return;
  }else if(view==='evolution'){
   await prepareEvolution({db,member,el,stays,status,refresh:loadList});return;
  }else if(view==='medications'||view==='resocialization'){
   await submitCare({db,member,el,kind:view,status,refresh:loadList});return;
  }else if(view==='documents'){
   await issueDocument({db,member,el,status,loadDocuments:()=>listDocuments({db,member,el,status,stays})});return;
  }else if(view==='monitors'){
   await createMonitor();return;
  }else if(view==='files'){
   await uploadAttachment();return;
  }else if(view==='contributions'){
   if(member.role!=='admin')throw Error('permission');
   const value=Number(el('amount').value);if(!Number.isFinite(value)||value<0)throw Error('amount');
   result=await db.from('crl_contributions').insert({institution_id:member.institution_id,stay_id:el('stay').value,amount:value,due_date:el('dueDate').value});
  }else if(view==='history'){
   if(member.role!=='admin')throw Error('permission');
   await searchHistory(el('searchName').value.trim());status('Pesquisa concluída.');return;
  }else if(view==='profile'){
   await loadProntuario({db,member,stays,stayId:el('profileStay')?.value,root:el('listArea'),status});return;
  }else if(view==='students'){
   await submitAdmission();return;
  }else if(view==='tasks'){
   const title=el('taskTitle').value.trim();
   if(title.length<3||!el('taskDue').value){status('Informe atividade e horário.',true);return}
   result=await db.from('crl_tasks').insert({
    institution_id:member.institution_id,title,
    stay_id:el('taskStay').value||null,
    recurrence:el('taskRecurrence').value,
    due_at:new Date(el('taskDue').value).toISOString(),
    status:'planned',created_by:user.id
   });
  }else if(view==='notes'){
   result=await db.from('crl_records').insert({institution_id:member.institution_id,stay_id:el('stay').value,category:el('category').value,original_text:el('description').value.trim(),author_id:user.id});
  }else if(view==='trips'){
   const km=Number(el('km').value);if(!Number.isFinite(km)||km<0)throw Error('km');
   result=await db.from('crl_vehicle_trips').insert({institution_id:member.institution_id,driver_name:el('driver').value.trim(),purpose:el('purpose').value,destination:el('destination').value.trim(),companions:el('companions').value.trim(),km_initial:km,departure_at:new Date(el('departure').value).toISOString(),created_by:user.id});
  }else if(view==='meals'){
   const amount=Number(el('servings').value);if(!Number.isInteger(amount)||amount<=0)throw Error('quantity');
   result=await db.from('crl_meals').insert({institution_id:member.institution_id,meal_type:el('mealType').value,servings:amount,served_at:new Date(el('servedAt').value).toISOString(),notes:el('mealNotes').value.trim(),recorded_by:user.id});
  }else if(view==='stats'){
   if(member.role!=='admin')throw Error('permission');
   const year=Number(el('year').value),month=Number(el('month').value);if(year<2020||year>2100)throw Error('invalid_year');
   const start=year+'-'+String(month).padStart(2,'0')+'-01';const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
   result=await db.rpc('crl_dashboard_summary',{p_institution:member.institution_id,p_start:start,p_end:end});
   if(result.error)throw result.error;
   renderSummary(result.data);status('Indicadores consultados.');return;
  }else if(view==='devotionals'){
   const attendance=stays.map(s=>{const selected=document.querySelector('input[name="status_'+s.id+'"]:checked');return {stay_id:s.id,status:selected?.value||'present',justification:document.querySelector('[data-reason="'+s.id+'"]')?.value.trim()||''}});
   if(attendance.some(a=>a.status==='absent'&&a.justification.length<3)){status('Informe a justificativa de cada falta.',true);return}
   result=await db.rpc('crl_complete_devotional',{p_institution:member.institution_id,p_title:el('theme').value.trim(),p_presenter:el('presenter').value.trim(),p_starts_at:new Date(el('start').value).toISOString(),p_ends_at:new Date(el('end').value).toISOString(),p_attendance:attendance});
  }
  if(result?.error)throw result.error;
  status('Registro salvo com sucesso.');
  await refresh();
 }catch(error){status('Não foi possível salvar. Confira as informações ou consulte o ADM.',true)}
 finally{btn.disabled=false}
}
init();