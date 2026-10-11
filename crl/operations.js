// Módulos CRL de estoque e caixa. Caixa somente para administradores.
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
  result=await db.from('crl_inventory_movements').insert({
    institution_id:member.institution_id,product:el('opProduct').value.trim(),
    unit:el('opUnit').value,quantity,direction:el('opDirection').value,
    source:el('opSource').value.trim(),occurred_at:new Date().toISOString(),created_by:user.id
  });
 }else if(kind==='cash'&&member.role==='admin'){
  const amount=Number(el('opAmount').value);
  if(!Number.isFinite(amount)||amount<=0){status('Valor inválido.',true);return}
  result=await db.from('crl_financial_entries').insert({
    institution_id:member.institution_id,description:el('opDescription').value.trim(),
    entry_type:el('opType').value,amount,date:el('opDate').value,created_by:user.id
  });
 }else{status('Acesso não autorizado.',true);return}
 if(result.error){status('Não foi possível salvar o lançamento. Confira as informações.',true);return}
 status('Lançamento registrado no sistema.');await refresh();
}
export async function loadOperations({db,kind,member,root}){
 root.replaceChildren();if(!member?.institution_id)return;
 if(kind==='cash'&&member.role!=='admin'){root.textContent='Disponível somente ao ADM.';return}
 if(kind==='stock'){
  const r=await db.from('crl_inventory_movements')
    .select('product,unit,quantity,direction,source,occurred_at').eq('institution_id',member.institution_id)
    .order('occurred_at',{ascending:false}).limit(300);
  if(r.error){root.textContent='Não foi possível consultar o estoque.';return}
  const products=new Map();
  for(const x of r.data||[]){
   const key=x.product.trim().toLowerCase()+'|'+x.unit;
   const current=products.get(key)||{name:x.product,unit:x.unit,total:0};
   current.total+=(x.direction==='in'?1:-1)*Number(x.quantity);products.set(key,current);
  }
  const head=document.createElement('h3');head.textContent='Saldo por produto (movimentos consultados)';root.append(head);
  const warning=document.createElement('p');warning.className='muted';warning.textContent='Saldo calculado com até 300 movimentos recentes. Para conferência integral, consulte todos os movimentos antes de inventariar.';root.append(warning);
  for(const p of products.values()){const row=document.createElement('div');row.className='item';row.textContent=p.name+' · '+fmt(p.total)+' '+p.unit;root.append(row)}
  const history=document.createElement('h3');history.textContent='Últimas movimentações';root.append(history);
  for(const x of r.data||[]){const row=document.createElement('div');row.className='item';row.textContent=(x.direction==='in'?'Entrada: ':'Saída: ')+x.product+' · '+fmt(x.quantity)+' '+x.unit+' · '+date(x.occurred_at)+' · '+(x.source||'');root.append(row)}
  if(!r.data?.length)root.append(document.createTextNode('Nenhum movimento registrado.'));
  return;
 }
 const r=await db.from('crl_financial_entries')
 .select('description,entry_type,amount,date').eq('institution_id',member.institution_id)
 .order('date',{ascending:false}).limit(300);
 if(r.error){root.textContent='Não foi possível consultar o caixa.';return}
 let inTotal=0,outTotal=0;
 for(const x of r.data||[]){if(x.entry_type==='income')inTotal+=Number(x.amount);else outTotal+=Number(x.amount)}
 const intro=document.createElement('p');intro.className='muted';
 intro.textContent='Movimentos consultados: receitas R$ '+fmt(inTotal)+' · despesas R$ '+fmt(outTotal)+' · diferença R$ '+fmt(inTotal-outTotal)+'. Valores limitados aos últimos 300 registros.';
 root.append(intro);
 for(const x of r.data||[]){const row=document.createElement('div');row.className='item';row.textContent=(x.entry_type==='income'?'Receita':'Despesa')+' · '+x.description+' · R$ '+fmt(x.amount)+' · '+x.date;root.append(row)}
 if(!r.data?.length)root.append(document.createTextNode('Nenhum lançamento registrado.'));
}
