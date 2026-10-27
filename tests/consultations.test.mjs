import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../supabase/functions/consult-process/index.ts',import.meta.url),'utf8');
const {createHandler,officialURL,parseSEI,parseSmuResult,parseLegacyHTTP,legacyPortalFetch,completeRaster}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const W='10000000-0000-0000-0000-000000000001',U='20000000-0000-0000-0000-000000000001';
const env={get:n=>({SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test-only'})[n]};
const p={id:'p1',title:'Fixture',number:'000230.000001/2026-00',source:'sei',group:'Grupo',lifecycle:'active',url:'https://prefeitura.sei.rio/sei/modulos/pesquisa/md_pesq_processo_exibir.php?fixture'};
const seiHTML='<table id="tblCabecalho"><tr><td>'+p.number+'</td></tr></table><table id="tblHistorico"><tr class="andamentoAberto"><td>27/10/2026 10:00</td><td>Unidade</td><td>Em análise</td></tr></table><table id="tblDocumentos"><tr><td></td><td>1</td><td>Ofício</td><td>27/10/2026</td><td>27/10/2026</td><td>Unidade</td></tr></table>';
function fixture(options={}){
 const state={saved:[],external:[],sessions:new Map()};
 const transport=async(url,init={})=>{
  if(url.includes('/auth/v1/user'))return Response.json({id:U},{status:options.badAuth?401:200});
  if(url.includes('/rest/v1/memberships?'))return Response.json(options.outsider?[]:[{role:options.role||'admin'}]);
  if(url.includes('/rest/v1/processes?'))return Response.json([{data:options.process||p,version:7}]);
  if(url.endsWith('/rpc/reserve_consultation'))return Response.json(null);
  if(url.endsWith('/rpc/save_process')){state.saved.push(JSON.parse(init.body));return options.conflict?Response.json({message:'Outra pessoa alterou o cadastro.'},{status:409}):Response.json({...JSON.parse(init.body).p,version:8});}
  if(url.includes('/rest/v1/consultation_sessions')){
   if(init.method==='POST'){const s=JSON.parse(init.body);state.sessions.set(s.id,s);return new Response(null,{status:201});}
   if(init.method==='DELETE'&&url.includes('expires_at=lt.'))return new Response(null,{status:204});
   if(init.method==='DELETE'){const q=new URL(url).searchParams,key=q.get('id').slice(3),session=state.sessions.get(key);if(session&&q.get('user_id')==='eq.'+U&&q.get('workspace_id')==='eq.'+W){state.sessions.delete(key);return Response.json([{payload:session.payload}]);}return Response.json([]);}
   return Response.json([...state.sessions.values()].map(s=>({id:s.id})));
  }
  state.external.push(url);
  if(options.redirect)return new Response(null,{status:302,headers:{location:'https://untrusted.example/private'}});
  if(url.includes('img.asp'))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  if(url.includes('consultaPrincipal.asp'))return new Response('<form id="formConsultaProcesso"><input type="hidden" name="csrf" value="hidden-fixture"></form><img id="imgCaptcha" src="/img.asp">',{headers:{'set-cookie':'SESSION=fixture-cookie; Path=/'}});
  if(url.includes('ConsultaTramites.asp'))return new Response('Trâmites do processo: '+p.number+'<table><tr><th>Origem</th><th>Parecer</th><th>Data do parecer</th><th>Prazo</th><th>Destino</th></tr><tr><td>A</td><td>Em prosseguimento</td><td>27/10/2026</td><td></td><td>B</td></tr></table>Não existe(m) documento(s)');
  return new Response(options.invalidHTML?'Validação indisponível':seiHTML);
 };
 const handler=createHandler(env,transport),call=async(body,auth=true)=>handler(new Request('https://function.example',{method:'POST',headers:{origin:'https://hanglucas.github.io',...(auth?{authorization:'Bearer user-test-token'}:{})},body:JSON.stringify({workspace:W,id:'p1',action:'sei',...body})}));
 return {state,call};
}
test('Consulta SEI autentica e salva pelo escopo e versão corretos',async()=>{
 const {state,call}=fixture();const response=await call({});assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.movements[0].description,'Em análise');assert.equal(data.result.documents.length,1);assert.equal(state.saved[0].w,W);assert.equal(state.saved[0].p.id,'p1');assert.equal(state.saved[0].expected_version,7);assert.equal(state.saved[0].p.consultations.sei.status,'ok');
});
test('Sem login, token inválido, leitor e não-membro não consultam o portal',async()=>{
 for(const options of [{badAuth:true},{outsider:true},{role:'viewer'}]){const {call,state}=fixture(options);const res=await call({});assert.ok([401,403].includes(res.status));assert.equal(state.external.length,0);assert.equal(state.saved.length,0);}
 const {call,state}=fixture();assert.equal((await call({},false)).status,401);assert.equal(state.external.length,0);
});
test('Redirecionamento para outro domínio, HTML inválido e conflito não viram sucesso',async()=>{
 for(const options of [{redirect:true},{invalidHTML:true},{conflict:true}]){const {call,state}=fixture(options);const res=await call({url:'https://evil.example'});assert.ok(res.status>=400);assert.ok(state.external.every(url=>url.startsWith('https://prefeitura.sei.rio/')));if(!options.conflict)assert.equal(state.saved.length,0);}
 assert.throws(()=>officialURL('https://prefeitura.sei.rio.evil.test/','sei'));
 assert.throws(()=>officialURL('http://prefeitura.sei.rio/','sei'));
 assert.throws(()=>officialURL('https://user:pass@prefeitura.sei.rio/','sei'));
});
test('SMU preserva sessão cifrada entre invocações e consome CAPTCHA uma vez',async()=>{
 const {call,state}=fixture({process:{...p,source:'smu',url:'https://consultasmu.rio.gov.br/consultaPrincipal.asp?o=n'}});
 const start=await call({action:'smu-start'});assert.equal(start.status,200);const challenge=await start.json();assert.ok(challenge.image.startsWith('data:image/png;base64,'));
 const stored=state.sessions.get(challenge.token);assert.ok(stored);assert.ok(!stored.payload.includes('fixture-cookie'));assert.ok(!JSON.stringify(challenge).includes('hidden-fixture'));
 const submit=await call({action:'smu-submit',token:challenge.token,code:'USERINPUT'});assert.equal(submit.status,200);assert.equal((await submit.json()).result.lastUnit,'B');assert.equal(state.sessions.size,0);assert.equal(state.saved.length,1);
 assert.equal((await call({action:'smu-submit',token:challenge.token,code:'USERINPUT'})).status,400);
 assert.equal(state.saved.length,1);
});


test('Resposta HTTP legada exige corpo completo e decodifica blocos',()=>{
 const encode=s=>new TextEncoder().encode(s);
 assert.equal(new TextDecoder().decode(parseLegacyHTTP(encode('HTTP/1.0 200 OK\r\nContent-Length: 5\r\nSet-Cookie: A=1\r\nSet-Cookie: B=2\r\n\r\nhello')).bytes),'hello');
 assert.equal(new TextDecoder().decode(parseLegacyHTTP(encode('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n')).bytes),'hello');
 assert.throws(()=>parseLegacyHTTP(encode('HTTP/1.0 200 OK\r\nContent-Length: 10\r\n\r\nshort')));
 assert.throws(()=>parseLegacyHTTP(encode('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n10\r\nshort')));
});


test('TLS sem close_notify só é aceito com resposta HTTP completa',async()=>{
 const previous=globalThis.Deno;
 let response='HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello';
 let tlsOptions;
 globalThis.Deno={connectTls:async options=>{tlsOptions=options;let sent=false;return {write:async bytes=>bytes.length,read:async buffer=>{if(sent)throw Error('peer closed connection without sending TLS close_notify');sent=true;const bytes=new TextEncoder().encode(response);buffer.set(bytes);return bytes.length;},close(){}};}};
 try{
  assert.equal(await (await legacyPortalFetch('https://consultasmu.rio.gov.br/test')).text(),'hello');
  assert.deepEqual(tlsOptions,{hostname:'consultasmu.rio.gov.br',port:443});
  response='HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort';
  await assert.rejects(()=>legacyPortalFetch('https://consultasmu.rio.gov.br/test'));
  response='HTTP/1.1 200 OK\r\n\r\nunframed';
  await assert.rejects(()=>legacyPortalFetch('https://consultasmu.rio.gov.br/test'));
 }finally{if(previous===undefined)delete globalThis.Deno;else globalThis.Deno=previous;}
});


test('Imagem CAPTCHA tem término estrutural completo; prefixos truncados são recusados',()=>{
 const gif=Uint8Array.from(Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64'));
 assert.equal(completeRaster(gif,'image/gif'),true);
 for(let n=1;n<gif.length;n++)assert.equal(completeRaster(gif.slice(0,n),'image/gif'),false);
 const jpeg=new Uint8Array([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,33,44,255,0,55,255,217]);
 assert.equal(completeRaster(jpeg,'image/jpeg'),true);
 for(let n=1;n<jpeg.length;n++)assert.equal(completeRaster(jpeg.slice(0,n),'image/jpeg'),false);
});

