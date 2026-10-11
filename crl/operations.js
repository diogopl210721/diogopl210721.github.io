// Módulos CRL de estoque e caixa. Caixa somente para administradores.
import {attachChanges,canChange} from './changes.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const options=['un','kg','litro','caixa','pacote'];
export function operationsForm(kind,member){
 if(kind==='stock')return '<h2>Entrada e saída de estoque</h2><p class="muted">Cada movimentação fica registrada. Não altere lançamentos anteriores; ajustes precisam de novo movimento justificado.</p><form id="dataForm"><label>Produto</label><input id="opProduct" maxlength="150" required><label>Unidade</label><select id="opUnit">'+options.map(x=>'<option>'+x+'</option>').join('')+'</select><label>Movimentação</label><select id="opDirection"><option value="in">Entrada / doação</option><option value="out">Saída / consumo</option></select><label>Quantidade</label><input id="opQuantity" type="number" min="0.01" step="0.01" required><label>Origem / motivo</label><input id="opSource" maxlength="300" required><button>Registrar movimentação</button></form>';
 if(kind==='cash')return member?.role!=='admin'?'<p>Disponível somente ao ADM.</p>':'<h2>Fluxo financeiro da casa</h2><p class="muted">Caixa operacional, separado das contribuições individuais dos acolhidos.</p><form id="dataForm"><label>Descrição</label><input id="opDescription" maxlength="300" required><label>Tipo</label><select id="opType"><option value="income">Receita</option><option value="expense">Despesa</option></select><label>Valor em R$</label><input id="opAmount" type="number" min="0.01" step="0.01" required><label>Data</label><input id="opDate" type="date" required><button>Registrar lançamento</button></form>';
 return '';
}
export async function submitOperations({db,kind,member,user,el,status,refresh}){
 if(!member?.institution_id||!user?.id)return;
 let result;
 if(kind==='stock'){
  const quantity=Number(el('opQuantity').value);
  if(!Number.isFinite(quantity)||quantity<=0){status('Quantidade inválida.',true);return}
  result=await db.rpc('crl_register_stock_movement',{
    p_institution:member.institution_id,p_product:el('opProduct').value.trim(),
    p_unit:el('opUnit').value,p_quantity:quantity,p_direction:el('opDirection').value,
    p_source:el('opSource').value.trim()
  });
 }else if(kind==='cash'&&member.role==='admin'){
  const amount=Number(el('opAmount').value);
  if(!Number.isFinite(amount)||amount<=0){status('Valor inválido.',true);return}
  result=await db.from('crl_financial_entries').insert({
    institution_id:member.institution_id,description:el('opDescription').value.trim(),
    entry_type:el('opType').value,amount,date:el('opDate').value,created_by:user.id
  });
 }else{status('Acesso não autorizado.',true);return}
 if(result.error){status(result.error.message||'Não foi possível salvar o lançamento. Confira as informações.',true);return}
 status('Lançamento registrado no sistema.');await refresh();
}
export async function loadOperations({db,kind,member,user,root,filter='all',status=()=>{},refresh=null}){
 const again=refresh||(()=>loadOperations({db,kind,member,user,root,filter,status}));
 root.replaceChildren();if(!member?.institution_id)return;
 if(kind==='cash'&&member.role!=='admin'){root.textContent='Disponível somente ao ADM.';return}
 if(kind==='stock'){
  let q=db.from('crl_inventory_movements')
    .select('id,product,unit,quantity,direction,source,occurred_at,created_by').eq('institution_id',member.institution_id).is('deleted_at',null);
  if(filter.startsWith('month_')){
   const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1).toISOString(),end=new Date(now.getFullYear(),now.getMonth()+1,1).toISOString();
   q=q.gte('occurred_at',start).lt('occurred_at',end);
   if(filter==='month_in'||filter==='month_in_kg')q=q.eq('direction','in');
   if(filter==='month_out_kg')q=q.eq('direction','out');
   if(filter.endsWith('_kg'))q=q.eq('unit','kg');
  }
  const r=await q.order('occurred_at',{ascending:false}).limit(300);
  if(r.error){root.textContent='Não foi possível consultar o estoque.';return}
  const balances=await db.rpc('crl_stock_balances',{p_institution:member.institution_id});
  if(balances.error){root.textContent='Não foi possível calcular os saldos completos.';return}
  const products=new Map();
  for(const x of balances.data||[]){
   products.set(x.product+'|'+x.unit,{name:x.product,unit:x.unit,total:Number(x.balance)});
  }
  const head=document.createElement('h3');head.textContent='Saldo total por produto';root.append(head);
  const warning=document.createElement('p');warning.className='muted';warning.textContent='Saldo consolidado a partir de todos os lançamentos no banco. A lista abaixo mostra somente os 300 movimentos mais recentes.';root.append(warning);
  for(const p of products.values()){const row=document.createElement('div');row.className='item';row.textContent=p.name+' · '+fmt(p.total)+' '+p.unit;root.append(row)}
  const history=document.createElement('h3');history.textContent='Últimas movimentações';root.append(history);
  for(const x of r.data||[]){
   const row=document.createElement('div');row.className='item';
   const t=document.createElement('div');t.textContent=(x.direction==='in'?'Entrada: ':'Saída: ')+x.product+' · '+fmt(x.quantity)+' '+x.unit+' · '+date(x.occurred_at)+' · '+(x.source||'');row.append(t);
   if(canChange(member,user,x.created_by,x.occurred_at))attachChanges(row,{db,status,entity:'stock',id:x.id,onDone:again,
    edit:{fields:[{key:'product',label:'Produto',value:x.product,required:true},
     {key:'unit',label:'Unidade',type:'select',value:x.unit,options:options.map(u=>[u,u])},
     {key:'direction',label:'Movimentação',type:'select',value:x.direction,options:[['in','Entrada / doação'],['out','Saída / consumo']]},
     {key:'quantity',label:'Quantidade',type:'number',step:'0.01',min:0.01,value:x.quantity,required:true},
     {key:'source',label:'Origem / motivo',value:x.source,required:true}]},
    del:{hint:'A movimentação sai do saldo e das listas, mas fica na Auditoria. Se deixar o saldo negativo, o sistema avisa.'}});
   root.append(row);
  }
  if(!r.data?.length)root.append(document.createTextNode('Nenhum movimento registrado.'));
  return;
 }
 let q=db.from('crl_financial_entries').select('id,description,entry_type,amount,date').eq('institution_id',member.institution_id).is('deleted_at',null);
 if(filter==='month_expense'){
  const now=new Date(),start=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01';
  const next=new Date(now.getFullYear(),now.getMonth()+1,1),end=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-01';
  q=q.eq('entry_type','expense').gte('date',start).lt('date',end);
 }
 const r=await q.order('date',{ascending:false}).limit(300);
 if(r.error){root.textContent='Não foi possível consultar o caixa.';return}
 const summary=await db.rpc('crl_cash_summary',{p_institution:member.institution_id});
 if(summary.error){root.textContent='Não foi possível consultar o resumo do caixa.';return}
 let inTotal=Number(summary.data.income),outTotal=Number(summary.data.expense);
 
 const intro=document.createElement('p');intro.className='muted';
 intro.textContent='Totais de todos os lançamentos: receitas R$ '+fmt(inTotal)+' · despesas R$ '+fmt(outTotal)+' · diferença R$ '+fmt(inTotal-outTotal)+'. Histórico abaixo limitado aos últimos 300 registros.';
 root.append(intro);
 for(const x of r.data||[]){
  const row=document.createElement('div');row.className='item';
  const t=document.createElement('div');t.textContent=(x.entry_type==='income'?'Receita':'Despesa')+' · '+x.description+' · R$ '+fmt(x.amount)+' · '+String(x.date).split('-').reverse().join('/');row.append(t);
  attachChanges(row,{db,status,entity:'cash',id:x.id,onDone:again,
   edit:{fields:[{key:'description',label:'Descrição',value:x.description,required:true},
    {key:'entry_type',label:'Tipo',type:'select',value:x.entry_type,options:[['income','Receita'],['expense','Despesa']]},
    {key:'amount',label:'Valor em R$',type:'number',step:'0.01',min:0.01,value:x.amount,required:true},
    {key:'date',label:'Data',type:'date',value:x.date,required:true}]},
   del:{hint:'O lançamento sai dos totais do caixa, mas fica na Auditoria. Se for salário de monitor, a competência pode ser lançada de novo.'}});
  root.append(row);
 }
 if(!r.data?.length)root.append(document.createTextNode('Nenhum lançamento registrado.'));
}
