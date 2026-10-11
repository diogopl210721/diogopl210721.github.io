import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
const ALLOWED=new Set(["https://www.ddsinovacao.com.br","https://ddsinovacao.com.br"]);
const LOGO="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";
const MONTHS=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const U=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const headers=(origin:string|null)=>({"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin&&ALLOWED.has(origin)?origin:"https://www.ddsinovacao.com.br","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Cache-Control":"no-store"});
const respond=(o:Record<string,unknown>,code=200,origin:string|null=null)=>new Response(JSON.stringify(o),{status:code,headers:headers(origin)});
const longDate=(v:string)=>{const x=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);return x?Number(x[3])+" de "+MONTHS[Number(x[2])-1]+" de "+x[1]:v};
const localDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const asBytes=(str:string)=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
const clean=(v:unknown)=>String(v??"").normalize("NFC").replace(/[\u0000-\u001f\u007f]/g," ").replace(/[–—]/g,"-").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\u0020-\u007e\u00a0-\u00ff]/g,"").replace(/\s+/g," ").trim();
function wrapped(page:any,font:any,t:string,x:number,y:number,w:number){
 let line="";const size=12,step=26;
 for(const word of clean(t).split(/\s+/)){
  const candidate=line?line+" "+word:word;
  if(line&&font.widthOfTextAtSize(candidate,size)>w){
    page.drawText(line,{x,y,size,font,color:rgb(.12,.14,.18)});y-=step;line=word;
  }else line=candidate;
 }
 if(line){page.drawText(line,{x,y,size,font,color:rgb(.12,.14,.18)});y-=step}
 return y;
}
async function makePdf(s:any,signature:Uint8Array|null){
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const logo=await pdf.embedPng(asBytes(LOGO)),dimensions=logo.scaleToFit(480,109);
 page.drawImage(logo,{x:(595.28-dimensions.width)/2,y:726,width:dimensions.width,height:dimensions.height});
 page.drawLine({start:{x:50,y:715},end:{x:545,y:715},thickness:.7,color:rgb(.87,.88,.90)});
 const title="DECLARAÇÃO";
 page.drawText(title,{x:(595.28-bold.widthOfTextAtSize(title,18))/2,y:663,size:18,font:bold});
 page.drawText("Campo Largo, "+longDate(s.issued_on),{x:55,y:611,size:11,font:regular});
 const identification=s.cpf?"portador do CPF nº "+s.cpf:"portador do RG nº "+s.rg;
 const opening="Declaro para devidos fins que o Sr "+s.name+", "+identification+", está em Programa Terapêutico nesta Comunidade, desde o dia "+longDate(s.admission_date)+", em regime integral.";
 let y=wrapped(page,regular,opening,65,548,460)-21;
 y=wrapped(page,regular,"Sem previsão de alta.",65,y,460)-21;
 wrapped(page,regular,"Estamos à disposição para quaisquer esclarecimentos.",65,y,460);
 page.drawText("Atenciosamente",{x:65,y:240,font:regular,size:12});
 if(signature){
  const sig=await pdf.embedPng(signature),sd=sig.scaleToFit(260,105);
  page.drawImage(sig,{x:165+(260-sd.width)/2,y:118,width:sd.width,height:sd.height});
 }
 page.drawLine({start:{x:165,y:122},end:{x:425,y:122},thickness:.6,color:rgb(.31,.32,.36)});
 page.drawText("Francielly",{x:270,y:105,size:11,font:bold});
 page.drawText("Administradora - CRL",{x:246,y:91,size:9,font:regular});
 page.drawText("Documento aprovado e emitido pela administração da CRL.",{x:55,y:42,size:8,font:regular,color:rgb(.44,.46,.49)});
 return pdf.save();
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return respond({error:"Método não permitido"},405,origin);
 if(origin&&!ALLOWED.has(origin))return respond({error:"Origem não permitida"},403,origin);
 const token=req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
 if(!token)return respond({error:"Autenticação exigida"},401,origin);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return respond({error:"Serviço indisponível"},503,origin);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:authErr}=await db.auth.getUser(token);
  if(authErr||!user)return respond({error:"Sessão inválida"},401,origin);
  const {data:member}=await db.from("crl_members").select("institution_id,role,active").eq("auth_user_id",user.id).eq("active",true).eq("role","admin").maybeSingle();
  if(!member)return respond({error:"Apenas ADM autorizado"},403,origin);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return respond({error:"Requisição inválida"},400,origin);
  const institution=member.institution_id;
  if(body.action==="signature_status"){
    const {data}=await db.from("crl_signatures").select("id,created_at").eq("institution_id",institution).eq("active",true).maybeSingle();
    return respond({configured:!!data,registered_at:data?.created_at??null},200,origin);
  }
  if(body.action==="signature_register"){
    const path=String(body.path||"");
    if(!new RegExp("^"+institution+"/signature-[a-f0-9-]{36}\\.png$","i").test(path))
      return respond({error:"Arquivo de assinatura inválido"},400,origin);
    const response=await db.storage.from("crl-signatures").download(path);
    if(response.error||!response.data)return respond({error:"Assinatura não encontrada"},404,origin);
    const bytes=new Uint8Array(await response.data.arrayBuffer());
    if(bytes.length<30||bytes.length>2097152||bytes[0]!==137||bytes[1]!==80)
      return respond({error:"Imagem PNG inválida"},400,origin);
    const previous=await db.from("crl_signatures").update({active:false,revoked_at:new Date().toISOString()}).eq("institution_id",institution).eq("active",true);
    if(previous.error)return respond({error:"Não foi possível substituir assinatura"},500,origin);
    const inserted=await db.from("crl_signatures").insert({institution_id:institution,storage_path:path,uploaded_by:user.id,active:true}).select("id").single();
    if(inserted.error)return respond({error:"Não foi possível cadastrar assinatura"},500,origin);
    await db.from("crl_audit_events").insert({institution_id:institution,actor_id:user.id,action:"signature_registered",entity_name:"crl_signatures",entity_id:inserted.data.id});
    return respond({success:true},200,origin);
  }
  if(body.action==="list"){
    const {data,error}=await db.from("crl_documents").select("id,stay_id,document_number,issued_on,approved_at,pdf_storage_path,template_type").eq("institution_id",institution).eq("status","approved").order("created_at",{ascending:false}).limit(40);
    if(error)return respond({error:"Documentos indisponíveis"},500,origin);
    return respond({documents:data??[]},200,origin);
  }
  if(body.action!=="issue")return respond({error:"Ação desconhecida"},400,origin);
  const stayId=String(body.stay_id||"");
  if(!U.test(stayId)||body.template_type!=="permanencia"||body.approve!==true)
    return respond({error:"Aprovação e acolhimento válidos são obrigatórios"},400,origin);
  const {data:stay}=await db.from("crl_stays").select("id,admission_date,status,institution_id,resident_id,crl_residents(full_name,cpf,rg)").eq("institution_id",institution).eq("id",stayId).maybeSingle();
  if(!stay||stay.status!=="active")return respond({error:"Acolhimento ativo não localizado"},404,origin);
  const person:any=Array.isArray(stay.crl_residents)?stay.crl_residents[0]:stay.crl_residents;
  if(!person?.full_name||(!person?.cpf&&!person?.rg))return respond({error:"Cadastre CPF ou RG no prontuário antes de emitir"},422,origin);
  // Assinatura: entra sozinha (guardada em armazenamento privado) quando o ADM deixa a opção marcada.
  const withSignature=body.with_signature!==false;
  let sign:any=null,signature:Uint8Array|null=null;
  if(withSignature){
    const found=await db.from("crl_signatures").select("id,storage_path").eq("institution_id",institution).eq("active",true).maybeSingle();
    sign=found.data;
    if(!sign)return respond({error:"Nenhuma assinatura guardada. Desmarque a opção de assinatura ou guarde uma em Trocar a assinatura guardada."},422,origin);
    const download=await db.storage.from("crl-signatures").download(sign.storage_path);
    if(download.error||!download.data)return respond({error:"Assinatura privada indisponível"},500,origin);
    signature=new Uint8Array(await download.data.arrayBuffer());
    if(signature.length>2097152)return respond({error:"Assinatura inválida"},422,origin);
  }
  const snapshot={name:clean(person.full_name),cpf:clean(person.cpf),rg:clean(person.rg),admission_date:stay.admission_date,issued_on:localDay(),with_signature:withSignature};
  const pdf=await makePdf(snapshot,signature);
  const id=crypto.randomUUID(),number="CRL-"+snapshot.issued_on.slice(0,4)+"-"+id.slice(0,8).toUpperCase();
  const path=institution+"/"+stay.id+"/"+id+".pdf";
  const upload=await db.storage.from("crl-documents").upload(path,pdf,{contentType:"application/pdf",upsert:false});
  if(upload.error)return respond({error:"PDF não pôde ser armazenado"},500,origin);
  const saved=await db.from("crl_documents").insert({
    id,institution_id:institution,stay_id:stay.id,template_type:"permanencia",status:"approved",
    pdf_storage_path:path,approved_by:user.id,approved_at:new Date().toISOString(),
    signature_id:sign?.id??null,issued_on:snapshot.issued_on,snapshot,document_number:number
  }).select("id,document_number,issued_on,pdf_storage_path").single();
  if(saved.error){
    await db.storage.from("crl-documents").remove([path]);
    return respond({error:"Falha ao registrar emissão"},500,origin);
  }
  await db.from("crl_audit_events").insert({institution_id:institution,actor_id:user.id,action:"document_approved",entity_name:"crl_documents",entity_id:id,data:{stay_id:stay.id,document_number:number,with_signature:withSignature}});
  return respond({success:true,document:saved.data},200,origin);
 }catch(error){
  console.error("crl-official-documents",String(error).slice(0,200));
  return respond({error:"Emissão não concluída. Tente novamente ou procure o suporte."},500,origin);
 }
});