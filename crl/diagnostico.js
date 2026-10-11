// CRL - diagnóstico de acesso executado somente após login ADM.
// Todas as verificações são leituras, sem criar residentes ou alterar dados.
const checks=[
 ['Acolhimentos','crl_stays'],
 ['Registros diários','crl_records'],
 ['Tarefas','crl_tasks'],
 ['Arquivos do prontuário','crl_files'],
 ['Devocionais','crl_activities'],
 ['Receitas e medicamentos','crl_medication_requests'],
 ['Ressocializações','crl_resocializations'],
 ['Estoque','crl_inventory_movements'],
 ['Contribuições','crl_contributions'],
 ['Caixa','crl_financial_entries'],
 ['Declarações','crl_documents'],
 ['Evolução mensal','crl_evolution_reports'],
 ['Auditoria','crl_audit_events']
];
export function diagnosticForm(){
 return '<h2>Diagnóstico do sistema</h2>'+
 '<p class="muted">Confere login, permissões, leituras do banco e serviços do ADM. Nenhum dado é criado ou alterado por este teste.</p>'+
 '<form id="dataForm"><button type="submit">Verificar conexões agora</button></form>'+
 '<p class="muted">Este teste não comprova envio de arquivos, assinatura de documentos nem funcionamento de todos os botões. Para uso com dados sensíveis, essas operações exigem homologação adicional.</p>';
}
export async function runDiagnostic({db,member,user,root,status}){
 root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Verificação disponível somente ao ADM.';return}
 const loading=document.createElement('p');loading.className='muted';loading.textContent='Verificando conexões...';root.append(loading);
 const items=[];
 const add=(name,ok,detail)=>items.push({name,ok,detail});
 try{
  const response=await db.auth.getUser();
  add('Autenticação',!!response.data?.user&&!response.error&&response.data.user.id===user.id,
    response.error?'Falha de autenticação':'Sessão vinculada ao usuário conectado');
 }catch(e){add('Autenticação',false,'Erro ao consultar sessão')}
 try{
  const response=await db.from('crl_members').select('role,active,institution_id').eq('auth_user_id',user.id).maybeSingle();
  add('Permissão do ADM',!response.error&&response.data?.role==='admin'&&response.data?.active===true&&response.data?.institution_id===member.institution_id,
    response.error?.message||'Papel administrativo verificado');
 }catch(e){add('Permissão do ADM',false,'Falha ao consultar vínculo')}
 const promises=checks.map(async([label,table])=>{
  try{
   const r=await db.from(table).select('id').eq('institution_id',member.institution_id).limit(1);
   return {name:label,ok:!r.error,detail:r.error?.message||'Leitura permitida'};
  }catch(e){return{name:label,ok:false,detail:'Falha de comunicação'}}
 });
 const results=await Promise.all(promises);
 items.push(...results);
 const rpcChecks=[
  ['Saldos do estoque','crl_stock_balances',{p_institution:member.institution_id}],
  ['Resumo de caixa','crl_cash_summary',{p_institution:member.institution_id}]
 ];
 for(const [label,name,args] of rpcChecks){
  try{
   const r=await db.rpc(name,args);
   add(label,!r.error,r.error?.message||'Função respondeu corretamente');
  }catch(e){add(label,false,'Serviço indisponível')}
 }
 const functions=[
  ['Gerenciamento de monitores','crl-admin-monitors',{action:'list'}],
  ['Emissão de declarações','crl-official-documents',{action:'signature_status'}]
 ];
 for(const [label,name,body] of functions){
  try{
   const r=await db.functions.invoke(name,{body});
   add(label,!r.error&&!r.data?.error,r.data?.error||r.error?.message||'Serviço respondeu corretamente');
  }catch(e){add(label,false,'Serviço administrativo indisponível')}
 }
 root.replaceChildren();
 const ok=items.filter(x=>x.ok).length,failed=items.length-ok;
 const header=document.createElement('div');header.className='item';
 const strong=document.createElement('strong');strong.textContent='Verificações: '+ok+'/'+items.length+' funcionando';
 const note=document.createElement('p');note.className='muted';note.textContent=failed?'Foram encontradas '+failed+' falhas. Consulte os detalhes antes de cadastrar informações pessoais.':'Todas as verificações de leitura e serviços responderam. Ainda faltam os testes operacionais de gravação e documentos.';
 header.append(strong,note);root.append(header);
 for(const c of items){
  const card=document.createElement('div');card.className='item';
  const title=document.createElement('strong');title.textContent=(c.ok?'✓ ':'⚠ ')+c.name;
  title.style.color=c.ok?'#15734c':'#bb2436';
  const small=document.createElement('p');small.className='muted';small.textContent=c.detail;
  card.append(title,small);root.append(card);
 }
 const stamp=document.createElement('p');stamp.className='muted';
 stamp.textContent='Conferência realizada em '+new Date().toLocaleString('pt-BR')+'. Não grava dados nem substitui teste funcional com usuários.';
 root.append(stamp);
 status(failed?'Diagnóstico concluiu com '+failed+' falha(s).':'Diagnóstico de conexões concluído.',failed>0);
}