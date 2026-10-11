// CRL — Refeições do dia. Depois da janta, o monitor marca o que foi servido
// (café da manhã, almoço, café da tarde, janta) e confirma de uma vez (crl_save_day_meals).
// Mudar um dia já registrado pede motivo e fica na Auditoria.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const MEALS=[['cafe','Café da manhã','☕'],['almoco','Almoço','🍽'],['lanche','Café da tarde','☕'],['jantar','Janta','🍲']];
export const MEAL_LABEL={cafe:'Café da manhã',almoco:'Almoço',lanche:'Café da tarde',jantar:'Janta',outro:'Outros'};
const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dayOf=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(iso));
const longDay=iso=>{const d=new Date(iso+'T12:00:00Z');return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',timeZone:'UTC'})};
const startOf=iso=>new Date(iso+'T00:00:00-03:00').toISOString();
const errText=e=>String(e?.message||e||'').replace(/^CRL:\s*/,'')||'Não foi possível salvar.';
let existing=[];

export function mealsForm(stays){
 const today=todaySP();
 return '<h2>Refeições do dia</h2><p class="muted">Depois da janta, marque o que foi servido no dia e confirme.</p><form id="dataForm">'+
  '<label for="mealDay">Dia</label><input id="mealDay" type="date" value="'+today+'" max="'+today+'" required>'+
  '<div class="meal-checks">'+MEALS.map(([k,l,i])=>'<label class="meal-check"><input type="checkbox" name="'+k+'" checked><span>'+i+' '+l+'</span></label>').join('')+'</div>'+
  '<label for="mealPeople">Quantas pessoas comeram</label><input id="mealPeople" type="number" min="1" max="10000" step="1" value="'+Math.max(1,stays.length)+'" required>'+
  '<p class="muted">Já vem com o número de acolhidos ativos ('+stays.length+'). Ajuste se teve visita, equipe ou alguém fora.</p>'+
  '<label for="mealNote">Observação (opcional)</label><input id="mealNote" maxlength="1000" placeholder="Ex.: almoço com visitas">'+
  '<p id="mealDayInfo" class="meal-info hide"></p>'+
  '<div id="mealReasonBox" class="hide"><label for="mealReason">Motivo da mudança</label><input id="mealReason" maxlength="300" placeholder="Ex.: marquei errado"></div>'+
  '<button type="submit">Confirmar refeições do dia</button></form>';
}

// Carrega o que já foi lançado no dia escolhido e preenche as caixas
export async function bindMeals({db,member,el}){
 const day=el('mealDay');if(!day)return;
 const load=async()=>{
  const d=day.value;if(!d)return;
  const next=new Date(new Date(d+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10);
  const r=await db.from('crl_meals').select('id,meal_type,servings,served_at,notes,recorded_by,created_at').eq('institution_id',member.institution_id)
   .is('deleted_at',null).gte('served_at',startOf(d)).lt('served_at',startOf(next));
  existing=r.error?[]:(r.data||[]).filter(m=>dayOf(m.served_at)===d);
  const info=el('mealDayInfo');
  if(existing.length){
   const types=new Set(existing.map(m=>m.meal_type));
   document.querySelectorAll('.meal-check input').forEach(c=>{c.checked=types.has(c.name)});
   el('mealPeople').value=existing[0].servings;
   const n=existing.find(m=>m.notes)?.notes;if(n)el('mealNote').value=n;
   info.textContent='Este dia já foi registrado. Se mudar algo, informe o motivo (fica na Auditoria).';
   info.classList.remove('hide');el('mealReasonBox').classList.remove('hide');
  }else{
   document.querySelectorAll('.meal-check input').forEach(c=>{c.checked=true});
   el('mealNote').value='';
   info.classList.add('hide');el('mealReasonBox').classList.add('hide');
  }
 };
 day.onchange=load;
 await load();
}

export async function submitMealsDay({db,member,el,status,refresh}){
 const meals={};document.querySelectorAll('.meal-check input').forEach(c=>{meals[c.name]=c.checked});
 const people=Number(el('mealPeople').value);
 if(!Number.isInteger(people)||people<1){status('Informe quantas pessoas comeram.',true);return}
 if(!Object.values(meals).some(Boolean)&&!existing.length){status('Marque pelo menos uma refeição.',true);return}
 const r=await db.rpc('crl_save_day_meals',{p_institution:member.institution_id,p_day:el('mealDay').value,p_meals:meals,p_servings:people,
  p_notes:el('mealNote').value.trim()||null,p_reason:el('mealReason')?.value.trim()||null});
 if(r.error){status(errText(r.error),true);return}
 const {added=0,changed=0,removed=0}=r.data||{};
 status(added+changed+removed?'Refeições do dia confirmadas.':'Nada mudou: o dia já estava registrado assim.');
 if(el('mealReason'))el('mealReason').value='';
 await refresh();
}

// Lista: um cartão por dia, com as 4 refeições marcadas ou não
export async function loadMealsList({db,member,root,filter,el}){
 root.replaceChildren();
 const now=new Date();
 const from=filter==='month'?new Date(now.getFullYear(),now.getMonth(),1):new Date(now.getTime()-45*86400000);
 const r=await db.from('crl_meals').select('meal_type,servings,served_at').eq('institution_id',member.institution_id).is('deleted_at',null)
  .gte('served_at',from.toISOString()).order('served_at',{ascending:false}).limit(400);
 if(r.error){root.textContent='Falha ao consultar refeições.';return}
 const month=todaySP().slice(0,7);
 const monthTotal=(r.data||[]).filter(m=>dayOf(m.served_at).startsWith(month)).reduce((s,m)=>s+Number(m.servings||0),0);
 const top=document.createElement('div');top.className='meal-total';
 top.innerHTML='<b>'+monthTotal.toLocaleString('pt-BR')+'</b><span>porções servidas neste mês</span>';root.append(top);
 const byDay=new Map();
 for(const m of r.data||[]){const d=dayOf(m.served_at);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(m)}
 if(!byDay.size){root.append(Object.assign(document.createElement('p'),{className:'muted',textContent:'Nenhuma refeição registrada ainda.'}));return}
 for(const [d,list] of byDay){
  const types=new Set(list.map(m=>m.meal_type));
  const card=document.createElement('div');card.className='item meal-day';
  const people=Math.max(...list.map(m=>Number(m.servings||0)));
  card.innerHTML='<div class="row"><b>'+esc(longDay(d))+'</b><span class="muted">'+people+' pessoas</span></div><div class="meal-tags">'+
   MEALS.map(([k,l])=>'<span class="'+(types.has(k)?'ok':'off')+'">'+(types.has(k)?'✓ ':'— ')+l+'</span>').join('')+
   (types.has('outro')?'<span class="ok">✓ Outros</span>':'')+'</div>';
  const open=document.createElement('button');open.type='button';open.className='secondary';open.textContent='Abrir este dia';
  open.onclick=()=>{const input=el('mealDay');if(!input)return;input.value=d;input.dispatchEvent(new Event('change'));input.scrollIntoView({behavior:'smooth',block:'center'})};
  card.append(open);root.append(card);
 }
}
