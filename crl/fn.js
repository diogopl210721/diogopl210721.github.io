// CRL — chamada às funções do servidor (cadastro de monitores, declarações).
// Mostra a mensagem real do servidor em vez de um erro genérico e renova a sessão quando ela venceu.
export async function callFunction(db,name,body){
 for(let attempt=0;attempt<2;attempt++){
  const {data:s}=await db.auth.getSession();
  const token=s?.session?.access_token;
  if(!token)throw Error('Sua sessão terminou. Clique em Sair e entre de novo.');
  const {data,error}=await db.functions.invoke(name,{body,headers:{Authorization:'Bearer '+token}});
  if(!error){
   if(data?.error)throw Error(data.error);
   return data;
  }
  const code=error?.context?.status;
  let message='';
  try{const j=await error.context.json();message=j?.error||j?.message||''}catch(_){}
  if(code===401&&attempt===0){await db.auth.refreshSession().catch(()=>{});continue}
  if(code===401)throw Error('Sua sessão expirou. Clique em Sair e entre de novo.');
  if(message)throw Error(message);
  if(error?.name==='FunctionsFetchError')throw Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
  throw Error('O servidor não respondeu (código '+(code||'?')+'). Tente de novo em instantes.');
 }
}
