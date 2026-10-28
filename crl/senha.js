// CRL — Senhas.
// • "🔑 Minha senha": qualquer pessoa (ADM inclusive) troca a própria senha.
// • Senha provisória: o sistema sugere uma fácil de ditar; o ADM pode trocar antes de salvar.
// • Quem entra com senha provisória vê um convite para criar a própria (pode deixar para depois).
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Regra única (a mesma do servidor): 8 a 72 caracteres, letras e números, sem conter o usuário
export function passwordProblem(p,username=''){
 p=String(p||'');
 if(p.length<8)return 'A senha precisa ter pelo menos 8 caracteres.';
 if(p.length>72)return 'Senha longa demais (máximo 72 caracteres).';
 if(!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))return 'Use letras e números na senha.';
 if(username&&p.toLowerCase().includes(String(username).toLowerCase()))return 'A senha não pode conter o nome de usuário.';
 return '';
}

// Senha provisória fácil de ditar por telefone: Crl-kmtp-4827 (sem letras que confundem, como l e o)
export function provisionalPassword(){
 const L='abcdefghjkmnpqrstuvwxyz',r=new Uint32Array(8);crypto.getRandomValues(r);
 return 'Crl-'+Array.from(r.slice(0,4),x=>L[x%L.length]).join('')+'-'+Array.from(r.slice(4),x=>String(x%10)).join('');
}

// Texto pronto para mandar à pessoa (WhatsApp, papel…)
export function accessText(username,password){
 return 'Acesso ao sistema da CRL\nSite: www.ddsinovacao.com.br/crl\nUsuário: '+username+'\nSenha provisória: '+password+'\nDepois de entrar, toque em "🔑 Minha senha" para criar a sua.';
}

// Caixa com usuário e senha provisória + botão copiar
export function credentialsBox(username,password,title='Acesso pronto'){
 const box=document.createElement('div');box.className='cred-box';box.setAttribute('role','status');
 box.innerHTML='<strong>'+esc(title)+'</strong><p>Usuário: <code>'+esc(username)+'</code></p><p>Senha provisória: <code>'+esc(password)+'</code></p>'+
  '<p class="muted">Passe para a pessoa. Quando ela entrar, o sistema convida a criar a própria senha (se ela quiser). Esta senha some da tela quando você sair daqui.</p>'+
  '<button type="button" class="secondary">📋 Copiar acesso</button>';
 const b=box.querySelector('button');
 b.onclick=async()=>{try{await navigator.clipboard.writeText(accessText(username,password));b.textContent='Copiado ✓ — cole no WhatsApp ou onde preferir'}catch(_){b.textContent='Selecione e copie o texto acima'}};
 return box;
}

function friendly(e){
 const c=String(e?.code||''),m=String(e?.message||'').toLowerCase();
 if(c==='same_password'||m.includes('different from the old'))return 'A nova senha precisa ser diferente da atual.';
 if(c==='weak_password'||m.includes('password should'))return 'O sistema achou a senha fraca. Misture letra maiúscula, minúscula, número e um símbolo (ex.: ! ou -).';
 if(c==='reauthentication_needed'||m.includes('reauthenticat'))return 'Por segurança, saia, entre de novo e troque a senha logo em seguida.';
 return 'Não foi possível trocar a senha agora. Tente de novo.';
}

let ctx=null;
export function showTempNotice(on){el('tempPasswordNotice')?.classList.toggle('hide',!on)}

// ctx: {db, getUser(), isFresh(), isPreview(), onChanged(user), status(msg,erro)}
export function bindMyPassword(c){
 ctx=c;
 el('myPasswordButton').onclick=openPasswordDialog;
 el('tempPwCreate').onclick=openPasswordDialog;
 el('tempPwLater').onclick=()=>showTempNotice(false);
}

export function closePasswordDialog(){el('pwOverlay')?.remove();document.removeEventListener('keydown',onKey)}
function onKey(e){if(e.key==='Escape')closePasswordDialog()}

export function openPasswordDialog(){
 if(!ctx)return;
 if(ctx.isPreview()){ctx.status('Volte ao ADM para trocar a senha.',true);return}
 const user=ctx.getUser();if(!user?.email)return;
 const username=String(user.email).split('@')[0];
 const needCurrent=!ctx.isFresh();
 closePasswordDialog();
 const wrap=document.createElement('div');wrap.className='pw-overlay';wrap.id='pwOverlay';
 wrap.innerHTML='<form class="pw-card" novalidate aria-labelledby="pwTitle"><h2 id="pwTitle">🔑 Minha senha</h2><p class="muted">Usuário: <b>'+esc(username)+'</b></p>'+
  (needCurrent?'<label for="pwCurrent">Senha atual</label><input id="pwCurrent" type="password" autocomplete="current-password">':'')+
  '<label for="pwNew">Nova senha</label><input id="pwNew" type="password" autocomplete="new-password" maxlength="72">'+
  '<label for="pwNew2">Repita a nova senha</label><input id="pwNew2" type="password" autocomplete="new-password" maxlength="72">'+
  '<label class="care-check"><input type="checkbox" id="pwShow"> Mostrar as senhas</label>'+
  '<p class="muted">Pelo menos 8 caracteres, com letras e números. Escolha algo fácil de lembrar e difícil de adivinhar (evite data de nascimento).</p>'+
  '<p id="pwMsg" class="pw-msg" role="alert"></p>'+
  '<div class="pw-actions"><button type="submit" id="pwSave">Salvar nova senha</button><button type="button" class="secondary" id="pwCancel">Cancelar</button></div></form>';
 document.body.append(wrap);
 const form=wrap.querySelector('form'),msg=t=>{el('pwMsg').textContent=t};
 wrap.addEventListener('click',e=>{if(e.target===wrap)closePasswordDialog()});
 document.addEventListener('keydown',onKey);
 el('pwCancel').onclick=closePasswordDialog;
 el('pwShow').onchange=e=>wrap.querySelectorAll('input[type=password],input[data-pw]').forEach(i=>{i.dataset.pw='1';i.type=e.target.checked?'text':'password'});
 (el('pwCurrent')||el('pwNew')).focus();
 form.onsubmit=async e=>{
  e.preventDefault();
  const next=el('pwNew').value,again=el('pwNew2').value,cur=el('pwCurrent')?.value||'';
  if(needCurrent&&!cur){msg('Digite a senha atual.');return}
  const prob=passwordProblem(next,username);if(prob){msg(prob);return}
  if(next!==again){msg('As duas senhas novas não estão iguais.');return}
  if(needCurrent&&cur===next){msg('A nova senha precisa ser diferente da atual.');return}
  const btn=el('pwSave');btn.disabled=true;msg('Salvando...');
  try{
   if(needCurrent){
    const r=await ctx.db.auth.signInWithPassword({email:user.email,password:cur});
    if(r.error){msg('A senha atual não confere.');return}
   }
   const u=await ctx.db.auth.updateUser({password:next,data:{temp_password:false}});
   if(u.error){msg(friendly(u.error));return}
   closePasswordDialog();showTempNotice(false);
   ctx.onChanged?.(u.data?.user||null);
   ctx.status('Senha trocada! No próximo acesso, use a senha nova.');
  }catch(_){msg('Não foi possível trocar agora. Tente de novo.')}
  finally{btn.disabled=false}
 };
}
