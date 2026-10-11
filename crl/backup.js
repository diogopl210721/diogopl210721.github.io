// CRL — backup feito pelo ADM: baixa um ZIP com todos os dados (planilhas + JSON) e os arquivos
// (fotos, documentos e declarações). Registra cada backup para o lembrete do painel.
export const BACKUP_EVERY_DAYS=3;
const JSZIP_URLS=['https://esm.sh/jszip@3.10.1','https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const NAMES={crl_institutions:'instituicao',crl_members:'equipe',crl_residents:'acolhidos-cadastro',crl_stays:'acolhimentos',
 crl_records:'rotina-ocorrencias',crl_files:'arquivos-lista',crl_activities:'devocionais',crl_attendance:'presencas',
 crl_tasks:'tarefas',crl_vehicle_trips:'viagens',crl_trip_rectifications:'viagens-retificacoes',crl_meals:'refeicoes',
 crl_contributions:'contribuicoes',crl_contribution_payments:'contribuicoes-pagamentos',crl_inventory_movements:'estoque',
 crl_financial_entries:'caixa',crl_medication_requests:'medicamentos-solicitacoes',crl_medication_records:'medicamentos-conferidos',
 crl_medication_administrations:'medicamentos-administracoes',crl_resocializations:'ressocializacoes',crl_documents:'declaracoes',
 crl_evolution_reports:'evolucao-mensal',crl_monitor_payroll:'salarios',crl_audit_events:'auditoria',crl_backups:'backups'};

// Último backup e se está atrasado (usado pelo painel do ADM)
export async function backupReminder({db,member}){
 if(member?.role!=='admin')return null;
 const r=await db.from('crl_backups').select('created_at').eq('institution_id',member.institution_id).order('created_at',{ascending:false}).limit(1);
 if(r.error)return {error:true};
 const last=r.data?.[0]?.created_at||null;
 const days=last?Math.floor((Date.now()-new Date(last).getTime())/86400000):null;
 return {last,days,overdue:last===null||days>=BACKUP_EVERY_DAYS};
}

export function backupForm(){
 return '<div class="row"><h2>Backup dos dados</h2><span class="admin-only-tag">Somente ADM</span></div>'+
 '<p class="muted">Baixa um arquivo ZIP com tudo: cadastros, prontuários, rotina, medicamentos, financeiro, planilhas para abrir no Excel e todas as fotos, documentos e declarações.</p>'+
 '<form id="dataForm"><button type="submit">Fazer backup agora</button></form>'+
 '<div class="note" style="margin-top:14px">Faça a cada '+BACKUP_EVERY_DAYS+' dias. Guarde o arquivo em local seguro (pendrive guardado ou Google Drive da instituição com verificação em duas etapas). Ele contém dados pessoais e de saúde: não envie por WhatsApp nem deixe em computador compartilhado.</div>';
}

export async function loadBackupList({db,member,root}){
 root.replaceChildren();
 if(member?.role!=='admin'){root.textContent='Acesso exclusivo do ADM.';return}
 const [b,m]=await Promise.all([
  db.from('crl_backups').select('created_at,created_by,files_count,files_failed,rows_count,size_bytes').eq('institution_id',member.institution_id).order('created_at',{ascending:false}).limit(30),
  db.from('crl_members').select('auth_user_id,display_name').eq('institution_id',member.institution_id)
 ]);
 if(b.error){root.textContent='Não foi possível consultar os backups.';return}
 const names=new Map((Array.isArray(m.data)?m.data:[]).map(x=>[x.auth_user_id,x.display_name]));
 if(!b.data.length){root.innerHTML='<p class="danger"><b>Nenhum backup feito ainda.</b> Clique em “Fazer backup agora”.</p>';return}
 for(const x of b.data){
  const item=document.createElement('div');item.className='item';
  const mb=(Number(x.size_bytes||0)/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1});
  item.innerHTML='<b>'+esc(when(x.created_at))+'</b><div class="muted">Por '+esc(names.get(x.created_by)||'ADM')+' · '+x.rows_count+' registros · '+x.files_count+' arquivos'+(x.files_failed?' · <span class="danger">'+x.files_failed+' arquivo(s) não baixado(s)</span>':'')+' · '+mb+' MB</div>';
  root.append(item);
 }
}

const csvCell=v=>{
 const raw=v!==null&&typeof v==='object'?JSON.stringify(v):String(v??'');
 const flat=raw.replace(/\r?\n/g,' ');
 return '"'+(/^\s*[=+\-@]/.test(flat)?"'"+flat:flat).replace(/"/g,'""')+'"';
};
function toCsv(rows){
 if(!rows.length)return '﻿';
 const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 return '﻿'+[cols.map(csvCell).join(';'),...rows.map(r=>cols.map(c=>csvCell(r[c])).join(';'))].join('\r\n');
}
const safeName=s=>String(s||'sem-nome').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 ._-]/g,'').trim().replace(/\s+/g,'-').slice(0,60)||'sem-nome';

export async function runBackup({db,member,status,root,refresh}){
 if(member?.role!=='admin'){status('Somente o ADM pode fazer backup.',true);return}
 const stamp=new Date();const pad=n=>String(n).padStart(2,'0');
 const label=stamp.getFullYear()+'-'+pad(stamp.getMonth()+1)+'-'+pad(stamp.getDate())+'_'+pad(stamp.getHours())+'h'+pad(stamp.getMinutes());
 status('Preparando backup: lendo os dados...');
 const exp=await db.rpc('crl_backup_export',{p_institution:member.institution_id});
 if(exp.error||!exp.data?.tables){status('Não foi possível ler os dados para o backup: '+(exp.error?.message||'resposta vazia'),true);return}
 let JSZip;
 for(const u of JSZIP_URLS){try{JSZip=(await import(u)).default;if(JSZip)break}catch(_){}}
 if(!JSZip){status('Não foi possível carregar o compactador. Confira a internet e tente de novo.',true);return}
 const zip=new JSZip();const T=exp.data.tables;
 let rowsCount=0;const tableNames=Object.keys(T);
 zip.file('dados-completos.json',JSON.stringify(exp.data,null,1));
 for(const t of tableNames){rowsCount+=T[t].length;zip.file('planilhas/'+(NAMES[t]||t)+'.csv',toCsv(T[t]))}
 // Nome do acolhido para organizar as pastas
 const residentName=new Map((T.crl_residents||[]).map(r=>[r.id,r.full_name]));
 const stayPerson=new Map((T.crl_stays||[]).map(s=>[s.id,residentName.get(s.resident_id)]));
 const files=[
  ...(T.crl_files||[]).map(f=>({bucket:'crl-private',path:f.storage_path,folder:safeName(stayPerson.get(f.stay_id)),name:(f.category||'arquivo')+'_'+String(f.created_at||'').slice(0,10)+'_'+String(f.id).slice(0,8)})),
  ...(T.crl_documents||[]).filter(d=>d.pdf_storage_path).map(d=>({bucket:'crl-documents',path:d.pdf_storage_path,folder:safeName(stayPerson.get(d.stay_id)),name:'declaracao_'+(d.document_number||String(d.id).slice(0,8))}))
 ];
 const failed=[];let done=0;
 for(const f of files){
  status('Baixando fotos e documentos: '+(done+failed.length+1)+' de '+files.length+'...');
  const ext=(String(f.path).match(/\.([a-z0-9]+)$/i)||[,'bin'])[1];
  try{
   const d=await db.storage.from(f.bucket).download(f.path);
   if(d.error||!d.data)throw new Error('download');
   zip.file('arquivos/'+f.folder+'/'+f.name+'.'+ext,d.data);done++;
  }catch(_){failed.push(f.folder+'/'+f.name)}
 }
 zip.file('LEIA-ME.txt',[
  'BACKUP CRL — '+stamp.toLocaleString('pt-BR'),'',
  'dados-completos.json  -> todos os dados do sistema (usado para restaurar).',
  'planilhas/            -> as mesmas informações em planilhas (abrem no Excel).',
  'arquivos/             -> fotos, documentos e declarações, uma pasta por acolhido.','',
  'Registros: '+rowsCount+' | Arquivos: '+done+(failed.length?' | NÃO baixados: '+failed.length:''),
  ...(failed.length?['','Arquivos que não foram baixados:',...failed]:[]),'',
  'ATENÇÃO: contém dados pessoais e de saúde. Guarde em local seguro e não compartilhe.',
  'A assinatura institucional não entra no backup por segurança.'
 ].join('\r\n'));
 status('Compactando o arquivo...');
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download='CRL-backup-'+label+'.zip';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 const reg=await db.rpc('crl_backup_register',{p_institution:member.institution_id,p_tables:tableNames.length,p_rows:rowsCount,p_files:done,p_failed:failed.length,p_bytes:blob.size});
 if(reg.error){status('Arquivo baixado, mas o registro do backup falhou. O lembrete pode continuar aparecendo.',true)}
 else if(failed.length){status('Backup baixado, mas '+failed.length+' arquivo(s) não vieram (lista no LEIA-ME). Tente de novo mais tarde.',true)}
 else status('Backup concluído: '+rowsCount+' registros e '+done+' arquivos. Confira o arquivo CRL-backup-'+label+'.zip nos seus downloads.');
 if(refresh){try{await refresh()}catch(_){/* a lista atualiza na próxima abertura */}}
}
