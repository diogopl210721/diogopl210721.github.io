// Módulos CRL de estoque e caixa. Caixa somente para administradores.
// Caixa: extrato do mês (entradas, saídas, saldo) — crl_cash_statement.
// Estoque: o que entrou e saiu no mês por produto e a lista do que pedir para o próximo mês — crl_stock_month.
import {attachChanges,canChange} from './changes.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const qty=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const dayBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const monthName=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m-1,15)).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})};
const nextMonth=ym=>{const [y,m]=ym.split('-').map(Number);return m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0')};
const options=['un','kg','litro','caixa','pacote'];
const errText=e=>String(e?.message||e||'').replace(/^CRL:\s*/,'')||'Não foi possível salvar.';
let cashMonth=null,stockMonth=null;
const csvCell=v=>{const raw=String(v??'').replace(/\r?\n/g,' ');const safe=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;return '"'+safe.replace(/"/g,'""')+'"'};
function saveCsv(filename,rows){
 const url=URL.createObjectURL(new Blob(['﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function printHtml(title,body,status){
 const w=window.open('about:blank','_blank');
 if(!w){status?.('Permita janelas pop-up para imprimir.',true);return}
 try{w.opener=null}catch(_){}
 w.document.open();
 w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font:13px Arial,sans-serif;margin:28px;color:#1f2430}h1{font-size:19px;margin:0 0 4px}p{color:#555;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}th{background:#f3f3f3}td.n,th.n{text-align:right}tfoot td{font-weight:700}</style></head><body>'+body+'</body></html>');
 w.document.close();w.focus();w.print();
}
function monthPicker(id,value,label){
 return '<div class="op-month"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="month" value="'+value+'" max="'+todaySP().slice(0,7)+'"></div>';
}

export function operationsForm(kind,member){
 if(kind==='stock')return '<h2>Entrada e saída de estoque</h2><p class="muted">Registre o que chegou (doação ou compra) e o que foi usado. No fim do mês, a lista abaixo mostra o que pedir.</p><form id="dataForm">'+
  '<label for="opProduct">Produto</label><input id="opProduct" maxlength="150" list="opProducts" placeholder="Ex.: Arroz" required><datalist id="opProducts"></datalist>'+
  '<div class="two"><div><label for="opUnit">Unidade</label><select id="opUnit">'+options.map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+
  '<div><label for="opQuantity">Quantidade</label><input id="opQuantity" type="number" min="0.01" step="0.01" required></div></div>'+
  '<label for="opDirection">Movimentação</label><select id="opDirection"><option value="in">Entrou (doação / compra)</option><option value="out">Saiu (consumo / uso)</option></select>'+
  '<label for="opSource">Origem ou motivo</label><input id="opSource" maxlength="300" placeholder="Ex.: Doação da igreja / Almoço de domingo" required><button>Registrar movimentação</button></form>';
 if(kind==='cash')return member?.role!=='admin'?'<p>Disponível somente ao ADM.</p>':'<h2>Novo lançamento no caixa</h2><p class="muted">Cada entrada ou saída aparece no extrato abaixo, com a descrição e o saldo.</p><form id="dataForm">'+
  '<label for="opType">Tipo</label><select id="opType"><option value="expense">Saída (despesa / pagamento)</option><option value="income">Entrada (doação / receita)</option></select>'+
  '<label for="opDescription">Descrição</label><input id="opDescription" maxlength="300" placeholder="Ex.: Conta de luz de setembro" required>'+
  '<div class="two"><div><label for="opAmount">Valor em R$</label><input id="opAmount" type="number" min="0.01" step="0.01" required></div>'+
  '<div><label for="opDate">Data</label><input id="opDate" type="date" value="'+todaySP()+'" max="'+todaySP()+'" required></div></div>'+
  '<p class="muted">As contribuições recebidas dos acolhidos (aba Contribuições) já entram sozinhas no extrato. Não lance de novo aqui.</p><button>Registrar lançamento</button></form>';
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
 if(result.error){status(errText(result.error),true);return}
 if(kind==='stock'){el('opQuantity').value='';el('opSource').value=''}
 else{el('opDescription').value='';el('opAmount').value=''}
 status('Lançamento registrado.');await refresh();
}
export async function loadOperations(args){
 if(args.kind==='stock')return loadStock(args);
 return loadCash(args);
}

// ---------------- CAIXA ----------------
async function loadCash({db,member,root,filter='all',status=()=>{},refresh=null}){
 const again=refresh||(()=>loadCash({db,member,root,filter,status}));
 root.replaceChildren();if(!member?.institution_id)return;
 if(member.role!=='admin'){root.textContent='Disponível somente ao ADM.';return}
 if(!cashMonth)cashMonth=todaySP().slice(0,7);
 const head=document.createElement('div');head.className='op-head';
 head.innerHTML=monthPicker('cashMonth',cashMonth,'Mês do extrato');root.append(head);
 head.querySelector('input').onchange=e=>{if(e.target.value){cashMonth=e.target.value;again()}};
 const r=await db.rpc('crl_cash_statement',{p_institution:member.institution_id,p_month:cashMonth+'-01'});
 if(r.error||!r.data){root.append(Object.assign(document.createElement('p'),{className:'danger',textContent:'Não foi possível consultar o caixa: '+errText(r.error)}));return}
 const d=r.data;
 const kpi=document.createElement('div');kpi.className='op-kpis';
 kpi.innerHTML='<div class="in"><span>Entradas do mês</span><b>'+money(d.income)+'</b></div><div class="out"><span>Saídas do mês</span><b>'+money(d.expense)+'</b></div><div class="bal"><span>Saldo em caixa hoje</span><b>'+money(d.balance_now)+'</b></div>';
 root.append(kpi);
 const onlyOut=filter==='month_expense';
 const list=document.createElement('div');list.className='op-statement';
 list.innerHTML='<div class="op-row op-row-head"><span>Data</span><span>Descrição</span><span class="n">Entrada</span><span class="n">Saída</span><span class="n">Saldo</span></div>';
 let running=Number(d.opening||0);
 const open=document.createElement('div');open.className='op-row op-opening';
 open.innerHTML='<span>'+dayBR(d.month)+'</span><span>Saldo que veio do mês anterior</span><span></span><span></span><span class="n">'+fmt(running)+'</span>';
 if(!onlyOut)list.append(open);
 const csv=[['Data','Descrição','Entrada','Saída','Saldo'],[dayBR(d.month),'Saldo que veio do mês anterior','','',fmt(running)]];
 for(const x of d.rows||[]){
  running+=x.type==='income'?Number(x.amount):-Number(x.amount);
  csv.push([dayBR(x.day),x.description,x.type==='income'?fmt(x.amount):'',x.type==='expense'?fmt(x.amount):'',fmt(running)]);
  if(onlyOut&&x.type!=='expense')continue;
  const row=document.createElement('div');row.className='op-row '+(x.type==='income'?'is-in':'is-out');
  row.innerHTML='<span>'+dayBR(x.day)+'</span><span>'+esc(x.description)+(x.kind==='payment'?' <em class="op-tag">Contribuição</em>':'')+'</span>'+
   '<span class="n">'+(x.type==='income'?fmt(x.amount):'')+'</span><span class="n">'+(x.type==='expense'?fmt(x.amount):'')+'</span><span class="n">'+fmt(running)+'</span>';
  if(x.kind==='cash'){
   attachChanges(row,{db,status,entity:'cash',id:x.id,onDone:again,
    edit:{fields:[{key:'description',label:'Descrição',value:x.description,required:true},
     {key:'entry_type',label:'Tipo',type:'select',value:x.type,options:[['income','Entrada'],['expense','Saída']]},
     {key:'amount',label:'Valor em R$',type:'number',step:'0.01',min:0.01,value:x.amount,required:true},
     {key:'date',label:'Data',type:'date',value:x.day,required:true}]},
    del:{hint:'O lançamento sai do extrato e do saldo, mas fica na Auditoria. Se for salário de monitor, a competência pode ser lançada de novo.'}});
  }else{
   attachChanges(row,{db,status,entity:'payment',id:x.id,onDone:again,
    del:{label:'Estornar recebimento',hint:'Use se o pagamento voltou ou foi lançado errado. A contribuição do acolhido volta a ficar em aberto.'}});
  }
  list.append(row);
 }
 const close=document.createElement('div');close.className='op-row op-closing';
 close.innerHTML='<span></span><span>Saldo no fim de '+esc(monthName(cashMonth))+'</span><span class="n">'+fmt(d.income)+'</span><span class="n">'+fmt(d.expense)+'</span><span class="n">'+fmt(d.closing)+'</span>';
 list.append(close);
 csv.push(['','Saldo no fim do mês',fmt(d.income),fmt(d.expense),fmt(d.closing)]);
 if(!(d.rows||[]).length)list.insertBefore(Object.assign(document.createElement('p'),{className:'muted',textContent:'Nenhum lançamento neste mês.'}),close);
 root.append(list);
 const actions=document.createElement('div');actions.className='op-actions';
 const b1=document.createElement('button');b1.type='button';b1.className='secondary';b1.textContent='Baixar planilha (CSV)';
 b1.onclick=()=>saveCsv('CRL_caixa_'+cashMonth+'.csv',csv);
 const b2=document.createElement('button');b2.type='button';b2.className='secondary';b2.textContent='Imprimir extrato';
 b2.onclick=()=>printHtml('Extrato do caixa','<h1>CRL — Extrato do caixa</h1><p>'+esc(monthName(cashMonth))+'</p><table><thead><tr><th>Data</th><th>Descrição</th><th class="n">Entrada</th><th class="n">Saída</th><th class="n">Saldo</th></tr></thead><tbody>'+
  csv.slice(1).map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td class="n">'+esc(r[2])+'</td><td class="n">'+esc(r[3])+'</td><td class="n">'+esc(r[4])+'</td></tr>').join('')+'</tbody></table>',status);
 actions.append(b1,b2);root.append(actions);
}

// ---------------- ESTOQUE ----------------
async function loadStock({db,member,user,root,filter='all',status=()=>{},refresh=null}){
 const again=refresh||(()=>loadStock({db,member,user,root,filter,status}));
 root.replaceChildren();if(!member?.institution_id)return;
 if(!stockMonth)stockMonth=todaySP().slice(0,7);
 const head=document.createElement('div');head.className='op-head';
 head.innerHTML=monthPicker('stockMonth',stockMonth,'Mês');root.append(head);
 head.querySelector('input').onchange=e=>{if(e.target.value){stockMonth=e.target.value;again()}};
 const start=new Date(stockMonth+'-01T00:00:00-03:00').toISOString(),end=new Date(nextMonth(stockMonth)+'-01T00:00:00-03:00').toISOString();
 const [sum,mov]=await Promise.all([
  db.rpc('crl_stock_month',{p_institution:member.institution_id,p_month:stockMonth+'-01'}),
  db.from('crl_inventory_movements').select('id,product,unit,quantity,direction,source,occurred_at,created_by').eq('institution_id',member.institution_id)
   .is('deleted_at',null).gte('occurred_at',start).lt('occurred_at',end).order('occurred_at',{ascending:false}).limit(1000)
 ]);
 if(sum.error||mov.error){root.append(Object.assign(document.createElement('p'),{className:'danger',textContent:'Não foi possível consultar o estoque: '+errText(sum.error||mov.error)}));return}
 const products=sum.data||[];
 const dl=document.getElementById('opProducts');
 if(dl)dl.innerHTML=[...new Set(products.map(p=>p.product))].map(p=>'<option value="'+esc(p)+'">').join('');
 const monthLabel=monthName(stockMonth);
 // 1) Resumo por produto
 const h1=document.createElement('h3');h1.textContent='Resumo de '+monthLabel;root.append(h1);
 const table=document.createElement('div');table.className='op-statement op-stock';
 table.innerHTML='<div class="op-row op-row-head"><span>Produto</span><span class="n">Tinha no início</span><span class="n">Entrou</span><span class="n">Saiu</span><span class="n">Ficou no fim</span></div>'+
  (products.length?products.map(p=>'<div class="op-row'+(Number(p.closing)<=0?' is-out':'')+'"><span><b>'+esc(p.product)+'</b> <small>'+esc(p.unit)+'</small></span><span class="n">'+qty(p.opening)+'</span><span class="n">'+qty(p.entered)+'</span><span class="n">'+qty(p.used)+'</span><span class="n">'+qty(p.closing)+'</span></div>').join(''):'<p class="muted">Nenhum produto registrado ainda.</p>');
 root.append(table);
 // 2) Pedido do próximo mês: consumo do mês menos o que sobrou
 const order=products.filter(p=>Number(p.used)>0||Number(p.closing)<=0).map(p=>({...p,suggest:Math.max(0,Math.ceil((Number(p.used)-Math.max(0,Number(p.closing)))*100)/100)}));
 const h2=document.createElement('h3');h2.textContent='O que pedir para '+monthName(nextMonth(stockMonth));root.append(h2);
 const help=document.createElement('p');help.className='muted';help.textContent='Sugestão = o que saiu no mês menos o que ficou no estoque. Ajuste as quantidades antes de imprimir ou copiar.';root.append(help);
 const orderBox=document.createElement('div');orderBox.className='op-order';
 orderBox.innerHTML=order.length?order.map((p,i)=>'<label class="op-order-row"><input type="checkbox" data-i="'+i+'"'+(p.suggest>0?' checked':'')+'><span>'+esc(p.product)+'</span><input type="number" min="0" step="0.01" data-q="'+i+'" value="'+p.suggest+'" aria-label="Quantidade de '+esc(p.product)+'"><small>'+esc(p.unit)+'</small></label>').join('')+
  '<label for="opOrderExtra">Outros itens (um por linha)</label><textarea id="opOrderExtra" maxlength="2000" placeholder="Ex.: 2 pacotes de esponja"></textarea>':
  '<p class="muted">Ainda não há saídas registradas neste mês para calcular o pedido.</p>';
 root.append(orderBox);
 const orderLines=()=>{
  const lines=[];
  orderBox.querySelectorAll('input[data-i]').forEach(c=>{if(!c.checked)return;const p=order[Number(c.dataset.i)];const q=Number(orderBox.querySelector('input[data-q="'+c.dataset.i+'"]').value||0);if(q>0)lines.push([p.product,qty(q),p.unit])});
  (orderBox.querySelector('#opOrderExtra')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(s=>lines.push([s,'','']));
  return lines;
 };
 if(order.length){
  const actions=document.createElement('div');actions.className='op-actions';
  const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Copiar lista (WhatsApp)';
  copy.onclick=async()=>{
   const text='*CRL — Pedido para '+monthName(nextMonth(stockMonth))+'*\n'+orderLines().map(l=>'• '+l[0]+(l[1]?' — '+l[1]+' '+l[2]:'')).join('\n');
   try{await navigator.clipboard.writeText(text);status('Lista copiada. Cole no WhatsApp ou onde precisar.')}catch(_){status('Não foi possível copiar automaticamente. Use Imprimir.',true)}
  };
  const print=document.createElement('button');print.type='button';print.className='secondary';print.textContent='Imprimir pedido';
  print.onclick=()=>printHtml('Pedido CRL','<h1>CRL — Pedido para '+esc(monthName(nextMonth(stockMonth)))+'</h1><p>Com base no consumo de '+esc(monthLabel)+'</p><table><thead><tr><th>Item</th><th class="n">Quantidade</th><th>Unidade</th></tr></thead><tbody>'+
   orderLines().map(l=>'<tr><td>'+esc(l[0])+'</td><td class="n">'+esc(l[1])+'</td><td>'+esc(l[2])+'</td></tr>').join('')+'</tbody></table>',status);
  const csv=document.createElement('button');csv.type='button';csv.className='secondary';csv.textContent='Baixar planilha (CSV)';
  csv.onclick=()=>saveCsv('CRL_pedido_'+nextMonth(stockMonth)+'.csv',[['Item','Quantidade','Unidade'],...orderLines()]);
  actions.append(copy,print,csv);root.append(actions);
 }
 // 3) Tudo que entrou e tudo que saiu no mês
 const rows=mov.data||[];
 for(const [dir,title] of [['in','Tudo que entrou'],['out','Tudo que saiu']]){
  if(filter==='month_in'&&dir==='out')continue;
  if(filter==='month_in_kg'&&dir==='out')continue;
  if(filter==='month_out_kg'&&dir==='in')continue;
  const part=rows.filter(x=>x.direction===dir&&(!filter.endsWith('_kg')||x.unit==='kg'));
  const h=document.createElement('h3');h.textContent=title+' em '+monthLabel+' ('+part.length+')';root.append(h);
  if(!part.length){root.append(Object.assign(document.createElement('p'),{className:'muted',textContent:'Nenhum lançamento.'}));continue}
  for(const x of part){
   const row=document.createElement('div');row.className='item op-move '+(dir==='in'?'is-in':'is-out');
   const t=document.createElement('div');t.innerHTML='<b>'+esc(x.product)+' — '+qty(x.quantity)+' '+esc(x.unit)+'</b><span class="muted"> · '+esc(date(x.occurred_at))+'</span><div class="muted">'+esc(x.source||'')+'</div>';row.append(t);
   if(canChange(member,user,x.created_by,x.occurred_at))attachChanges(row,{db,status,entity:'stock',id:x.id,onDone:again,
    edit:{fields:[{key:'product',label:'Produto',value:x.product,required:true},
     {key:'unit',label:'Unidade',type:'select',value:x.unit,options:options.map(u=>[u,u])},
     {key:'direction',label:'Movimentação',type:'select',value:x.direction,options:[['in','Entrou'],['out','Saiu']]},
     {key:'quantity',label:'Quantidade',type:'number',step:'0.01',min:0.01,value:x.quantity,required:true},
     {key:'source',label:'Origem ou motivo',value:x.source,required:true}]},
    del:{hint:'A movimentação sai do saldo e das listas, mas fica na Auditoria. Se deixar o saldo negativo, o sistema avisa.'}});
   root.append(row);
  }
 }
}
