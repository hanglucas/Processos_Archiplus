const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',atilde:'ã',otilde:'õ',ccedil:'ç',ordm:'º'};
export const clean=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(m,k)=>k[0]==='#'?String.fromCodePoint(k[1]==='x'?parseInt(k.slice(2),16):Number(k.slice(1))):(entities[k.toLowerCase()]?(k[0]===k[0].toUpperCase()?entities[k.toLowerCase()].toUpperCase():entities[k.toLowerCase()]):m)).replace(/\s+/g,' ').trim();
const table=(html,id)=>html.match(new RegExp('<table\\b[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</table>','i'))?.[1];
const cells=row=>row.split(/<td\b[^>]*>/i).slice(1).map(s=>clean(s.split(/<\/td>/i)[0]));
function signatureDescription(raw){
 const description=clean(raw||'');
 if(!/^Assinado Documento\b/i.test(description))return {description};
 const match=raw.match(/\bpor\s+(<a\b([^>]*)>([\s\S]*?)<\/a>)/i);
 if(!match)return {description};
 const attribute=match[2].match(/\btitle\s*=\s*(["'])([\s\S]*?)\1/i)||match[2].match(/\balt\s*=\s*(["'])([\s\S]*?)\1/i);
 const name=attribute?clean(attribute[2]):'',identifier=clean(match[3]);
 if(!name||name===identifier)return {description};
 const anchorStart=match.index+match[0].indexOf(match[1]);
 return {description:clean(raw.slice(0,anchorStart))+` ${name} (${identifier}) `+clean(raw.slice(anchorStart+match[1].length)),signer:{name,identifier},documentId:description.match(/^Assinado Documento\s+(\d+)/i)?.[1]};
}
export function parseSEI(html){
 const history=table(html,'tblHistorico'),docs=table(html,'tblDocumentos');
 if(history===undefined||docs===undefined) throw Error(/captcha|código da imagem/i.test(clean(html))?'SEI solicitou validação ou não exibiu as tabelas públicas. Abra o link para conferir.':'O SEI não exibiu as tabelas esperadas. Confira o link.');
 const movements=[...history.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map(m=>{const c=cells(m[2]),rawDescription=m[2].split(/<td\b[^>]*>/i)[3]?.split(/<\/td>/i)[0]||'';return {date:c[0],unit:c[1],...signatureDescription(rawDescription),open:/andamentoAberto/.test(m[1])}}).filter(r=>/^\d{2}\/\d{2}\/\d{4}/.test(r.date||''));
 const documents=[...docs.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>{const c=cells(m[1]);return {id:c[1],type:c[2],date:c[3],added:c[4],unit:c[5]}}).filter(r=>/^\d{2}\/\d{2}\/\d{4}$/.test(r.date||''));
 if(!movements.length)throw Error('Histórico sem datas legíveis; consulta não confirmada.');
 for(const doc of documents)doc.signatures=movements.filter(m=>m.documentId===doc.id&&m.signer).map(m=>({...m.signer,date:m.date}));
 return {movements,documents,units:[...new Set(movements.filter(m=>m.open).map(m=>m.unit))]};
}

// Keep rows scoped to their own table, including nested layout tables in ASP pages.
function readTables(html){
 html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const output=[],stack=[];
 const finishCell=t=>{if(t.cell!==null){t.row.push(clean(t.cell));t.cell=null}};
 const finishRow=t=>{finishCell(t);if(t.row.length)t.rows.push(t.row);t.row=[]};
 for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){
  if(/^<table\b/i.test(token)){const table={rows:[],row:[],cell:null};stack.push(table);output.push(table);continue}
  const t=stack.at(-1);if(!t)continue;
  if(/^<\/table\b/i.test(token)){finishRow(t);stack.pop()}
  else if(/^<tr\b/i.test(token)||/^<\/tr\b/i.test(token))finishRow(t);
  else if(/^<t[dh]\b/i.test(token)){finishCell(t);t.cell=''}
  else if(/^<\/t[dh]\b/i.test(token))finishCell(t);
  else if(t.cell!==null)t.cell+=token;
 }
 for(const t of stack)finishRow(t);
 return output.map(t=>t.rows);
}
const heading=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function findTable(tables,required){
 for(const rows of tables){const index=rows.findIndex(row=>required.every(name=>row.some(cell=>heading(cell).includes(name))));
  if(index>=0)return {rows:rows.slice(index+1),headers:rows[index].map(heading)};
 }
}
const column=(table,label,fallback)=>{const i=table.headers.findIndex(h=>h===label||h.startsWith(label));return i>=0?i:fallback};
const cellDate=value=>(value||'').match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0]||'';
export function parseSmuResult(html,p){
 const text=clean(html),compact=s=>s.replace(/[^a-z0-9]/gi,'').toUpperCase();
 const number=text.match(/tr[âa]mites do processo:\s*([A-Z0-9.\/-]+)/i)?.[1];
 if(!number||compact(number)!==compact(p.number))throw Error(/captcha|verifica[çc][ãa]o|c[óo]digo/i.test(text)?'Código não aceito ou sessão expirada. Gere outra imagem e tente novamente.':'O site não retornou o processo esperado. Confira a consulta no site da SMU.');
 const allTables=readTables(html),history=findTable(allTables,['datadoparecer','destino']);
 if(!history)throw Error('Não foi possível ler o histórico retornado pela SMU.');
 const dateColumn=column(history,'datadoparecer',2),descriptionColumn=column(history,'parecer',1),originColumn=column(history,'origem',0),destinationColumn=column(history,'destino',4),deadlineColumn=column(history,'prazo',3);
 const movements=history.rows.filter(c=>cellDate(c[dateColumn])).map(c=>({date:cellDate(c[dateColumn]),description:c[descriptionColumn]||'',unit:c[destinationColumn]||c[originColumn]||'',origin:c[originColumn]||'',deadline:cellDate(c[deadlineColumn])}));
 if(!movements.length)throw Error('A consulta não retornou datas de movimentação.');
 const docTable=findTable(allTables,['emissao','validade']);
 const docDate=docTable?column(docTable,'dtemissao',2):2,docId=docTable?column(docTable,'nodocto',1):1,docExpiry=docTable?column(docTable,'validade',3):3,docType=docTable?column(docTable,'tipodocumento',0):0,docInfo=docTable?column(docTable,'informacoescomplementares',4):4;
 const documents=docTable?docTable.rows.filter(c=>cellDate(c[docDate])).map(c=>({id:c[docId],type:c[docInfo]||c[docType],date:cellDate(c[docDate]),added:cellDate(c[docDate]),expires:cellDate(c[docExpiry]),unit:''})):[];
 if(!docTable&&!/N[ãa]o existe\(m\).*documento\(s\)/i.test(text))throw Error('A relação de documentos não pôde ser confirmada. Confira a consulta na SMU.');
 return {status:'ok',schemaVersion:2,source:'smu',checkedAt:new Date().toISOString(),movements,documents,units:[],lastUnit:movements[0].unit,historyLimited:false};
}

const allowedOrigins=new Set(['https://hanglucas.github.io','http://127.0.0.1:5173']);
const smuURL='https://consultasmu.rio.gov.br/consultaPrincipal.asp?o=n';
const utf8=new TextEncoder();
class RequestError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fingerprint=p=>JSON.stringify([p.number,p.url,p.source]);
export function officialURL(value,source){
 let u;try{u=new URL(value);}catch{throw new RequestError('Endereço oficial inválido.');}
 const host=source==='sei'?'prefeitura.sei.rio':'consultasmu.rio.gov.br';
 if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password)throw new RequestError('A consulta aceita somente o portal oficial cadastrado.');
 return u.href;
}
async function readBytes(res,max=3000000){
 const reader=res.body?.getReader();if(!reader)return new Uint8Array();const parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new RequestError('O portal retornou uma resposta grande demais.');}parts.push(value);}}
 finally{reader.releaseLock();}
 const all=new Uint8Array(length);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}return all;
}
export function decodeHTML(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}}
const b64=bytes=>{let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw);};
const unb64=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
async function sessionKey(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',utf8.encode(secret)),'AES-GCM',false,['encrypt','decrypt']);}
async function seal(value,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},await sessionKey(secret),utf8.encode(JSON.stringify(value)));return b64(iv)+'.'+b64(new Uint8Array(body));}
async function unseal(value,secret){const [iv,body]=value.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await sessionKey(secret),unb64(body))));}
export function createHandler(env,transport=fetch){
 const base=env.get('SUPABASE_URL'),anon=env.get('SUPABASE_ANON_KEY'),service=env.get('SUPABASE_SERVICE_ROLE_KEY');
 return async request=>{
 const origin=request.headers.get('origin')||'';
 const cors={'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://hanglucas.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
 if(origin&&!allowedOrigins.has(origin))return reply({error:'Origem não autorizada.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return reply({error:'Método não permitido.'},405);
 try{
  if(!base||!anon||!service)throw new RequestError('Configuração do servidor indisponível.',503);
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/i.test(auth))throw new RequestError('Entre novamente para consultar.',401);
  const identity=await transport(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!identity.ok)throw new RequestError('Sua sessão expirou. Entre novamente.',401);
  const user=await identity.json();if(!user.id)throw new RequestError('Usuário não identificado.',401);
  const raw=await request.text();if(raw.length>4096)throw new RequestError('Solicitação muito grande.');
  let body;try{body=JSON.parse(raw);}catch{throw new RequestError('Solicitação inválida.');}
  const {workspace,id,action}=body;
  if(!/^[a-f0-9-]{36}$/i.test(workspace||'')||typeof id!=='string'||!id||id.length>100||!['sei','smu-start','smu-submit'].includes(action))throw new RequestError('Informe a equipe e o processo.');
  const api=async(path,options={},admin=false)=>{
   const res=await transport(base+'/rest/v1/'+path,{...options,headers:{apikey:admin?service:anon,Authorization:admin?'Bearer '+service:auth,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(15000)});
   const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}
   if(!res.ok){const error=new RequestError(data?.message||'Não foi possível acessar o banco privado.',res.status===409?409:400);error.code=data?.code;throw error;}return data;
  };
  const q=new URLSearchParams({workspace_id:'eq.'+workspace,user_id:'eq.'+user.id,select:'role'});
  const members=await api('memberships?'+q);
  if(!members?.some(m=>['admin','editor'].includes(m.role)))throw new RequestError('Você não tem permissão para consultar esta equipe.',403);
  const rows=await api('processes?'+new URLSearchParams({workspace_id:'eq.'+workspace,id:'eq.'+id,select:'data,version'}));
  const row=rows?.[0];if(!row)throw new RequestError('Processo não encontrado nesta equipe.',404);
  const p={...row.data,id};
  if(p.lifecycle!=='active')throw new RequestError('Reabra o processo antes de consultar.');
  if(action==='sei'&&!['sei','both'].includes(p.source)||action.startsWith('smu')&&!['smu','both'].includes(p.source))throw new RequestError('Esta consulta não se aplica ao processo.');
  if(action!=='smu-submit')await api('rpc/reserve_consultation',{method:'POST',body:JSON.stringify({w:workspace,pid:id,portal_name:action==='sei'?'sei':'smu'})});
  const external=async(url,source,options={},jar=new Map())=>{
   let current=officialURL(url,source),opts=options;const deadline=Date.now()+35000;
   for(let hop=0;hop<4;hop++){
    const cookie=[...jar].map(([k,v])=>k+'='+v).join('; ');
    const res=await transport(current,{...opts,redirect:'manual',headers:{...(opts.headers||{}),...(cookie?{Cookie:cookie}:{}),'Cache-Control':'no-cache, no-store',Pragma:'no-cache'},signal:AbortSignal.timeout(Math.max(1,Math.min(25000,deadline-Date.now())))});
    for(const line of res.headers.getSetCookie?.()||[]){const pair=line.split(';')[0],i=pair.indexOf('=');if(i>0)jar.set(pair.slice(0,i),pair.slice(i+1));}
    if(res.status>=300&&res.status<400){const location=res.headers.get('location');if(!location)throw new RequestError('Redirecionamento inválido do portal.');current=officialURL(new URL(location,current).href,source);opts={};await res.body?.cancel();continue;}
    if(!res.ok)throw new RequestError('O portal '+source.toUpperCase()+' retornou HTTP '+res.status+'.');
    return res;
   }
   throw new RequestError('O portal redirecionou a consulta muitas vezes.');
  };
  let result;
  if(action==='sei'){
   const html=decodeHTML(await readBytes(await external(officialURL(p.url,'sei'),'sei')));
   const parsed=parseSEI(html),header=html.match(/<table\b[^>]*id=["']tblCabecalho["'][^>]*>([\s\S]*?)<\/table>/i)?.[1]||'';
   if(!clean(header).includes(p.number))throw new RequestError('O SEI retornou um número diferente do cadastro. Confira o link oficial.');
   result={...parsed,status:'ok',schemaVersion:2,source:'sei',checkedAt:new Date().toISOString()};
  }else if(action==='smu-start'){
   await api('consultation_sessions?'+new URLSearchParams({expires_at:'lt.'+new Date().toISOString()}),{method:'DELETE'},true);
   const existing=await api('consultation_sessions?'+new URLSearchParams({user_id:'eq.'+user.id,select:'id',limit:'25'}),{},true);
   if(existing.length>=24)throw new RequestError('Há muitas validações abertas. Aguarde alguns minutos.');
   for(let attempt=0;attempt<3;attempt++){
    const jar=new Map(),html=decodeHTML(await readBytes(await external(smuURL,'smu',{},jar)));
    const form=html.match(/<form\b[^>]*(?:id|name)=["']formConsultaProcesso["'][^>]*>([\s\S]*?)<\/form>/i);
    if(!form)throw new RequestError('O formulário da SMU não está disponível.');
    const attr=(tag,name)=>{const m=tag.match(new RegExp('\\b'+name+'\\s*=\\s*(["\\x27])([\\s\\S]*?)\\1','i'));return m?clean(m[2]):'';};
    const hidden={};for(const input of form[0].match(/<input\b[^>]*>/gi)||[])if(attr(input,'type').toLowerCase()==='hidden'&&attr(input,'name'))hidden[attr(input,'name')]=attr(input,'value');
    const img=html.match(/<img\b[^>]*id=["']imgCaptcha["'][^>]*>/i)?.[0],src=img?attr(img,'src'):'';
    if(!src)throw new RequestError('A SMU não exibiu a imagem de validação.');
    const imageURL=new URL(src,smuURL);imageURL.searchParams.set('_archiplus',crypto.randomUUID());
    const imageResponse=await external(imageURL.href,'smu',{},jar),type=imageResponse.headers.get('content-type')?.split(';')[0]||'';
    if(!['image/png','image/jpeg','image/gif','image/bmp'].includes(type))throw new RequestError('A imagem de validação não foi carregada.');
    const bytes=await readBytes(imageResponse,300000),hash=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
    const token=crypto.randomUUID(),expires=new Date(Date.now()+5*60000).toISOString();
    const payload=await seal({cookies:[...jar],hidden,fingerprint:fingerprint(p)},service);
    try{await api('consultation_sessions',{method:'POST',body:JSON.stringify({id:token,workspace_id:workspace,user_id:user.id,process_id:id,payload,captcha_hash:hash,expires_at:expires})},true);}
    catch(error){if(error.code==='23505')continue;throw error;}
    return reply({token,image:'data:'+type+';base64,'+b64(bytes),expiresAt:expires});
   }
   throw new RequestError('A SMU repetiu a imagem. Aguarde alguns segundos e tente novamente.');
  }else{
   if(!/^[a-f0-9-]{36}$/i.test(body.token||'')||typeof body.code!=='string'||!body.code.trim()||body.code.length>12)throw new RequestError('Preencha o código da imagem.');
   const sessions=await api('consultation_sessions?'+new URLSearchParams({id:'eq.'+body.token,workspace_id:'eq.'+workspace,user_id:'eq.'+user.id,process_id:'eq.'+id,expires_at:'gt.'+new Date().toISOString(),select:'payload'}),{method:'DELETE',headers:{Prefer:'return=representation'}},true);
   if(!sessions?.[0])throw new RequestError('Validação expirada ou já utilizada. Gere outra imagem.');
   const session=await unseal(sessions[0].payload,service);
   if(session.fingerprint!==fingerprint(p))throw new RequestError('O cadastro mudou. Gere outra imagem.');
   const form=new URLSearchParams({...session.hidden,txtProcesso:p.number.replace(/[^A-Z0-9]/gi,'').toUpperCase(),captchacode:body.code.trim()});
   const res=await external('https://consultasmu.rio.gov.br/ConsultaTramites.asp','smu',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:smuURL},body:form.toString()},new Map(session.cookies));
   result=parseSmuResult(decodeHTML(await readBytes(res)),p);
  }
  const next={...row.data,id,consultations:{...(row.data.consultations||{}),[result.source]:result}};
  const saved=await api('rpc/save_process',{method:'POST',body:JSON.stringify({w:workspace,p:next,expected_version:row.version})});
  return reply({process:saved,result});
 }catch(error){
  const timed=error?.name==='TimeoutError'||error?.name==='AbortError';
  return reply({error:timed?'O portal demorou a responder. Tente novamente.':error?.message||'Não foi possível consultar o portal.'},error.status>=400&&error.status<600?error.status:400);
 }
 };
}
if(typeof Deno!=='undefined')Deno.serve(createHandler(Deno.env));
