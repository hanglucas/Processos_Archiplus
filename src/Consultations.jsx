import {useEffect,useRef,useState} from 'react';
import {db} from './backend.js';
const fmt=s=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export async function invokeConsultation(workspace,id,action,extra={}){
 const {data,error}=await db.functions.invoke('consult-process',{body:{workspace,id,action,...extra}});
 if(error){let message=data?.error;try{const json=await error.context?.json();message=json?.error||message;}catch{}throw Error(message||error.message||'Não foi possível conectar ao serviço de consultas.');}
 if(data?.error)throw Error(data.error);return data;
}
export function ConsultationResults({process}){
 const entries=Object.values(process.consultations||{});
 if(!entries.length)return null;
 return <section className="consultationResults"><h3>Últimas consultas dos portais</h3>{entries.map(r=><article key={r.source}><strong>{r.source.toUpperCase()} · {fmt(r.checkedAt)}</strong><p className="muted">{r.lastUnit||r.units?.join(' · ')||'Unidade não informada'}</p><h4>Últimos andamentos</h4>{(r.movements||[]).slice(0,5).map((m,i)=><div className="event" key={i}><small>{m.date} · {m.unit}</small><strong>{m.description}</strong></div>)}<details><summary>Histórico completo ({r.movements?.length||0}) e documentos ({r.documents?.length||0})</summary>{(r.movements||[]).slice(5).map((m,i)=><div className="event" key={i}><small>{m.date} · {m.unit}</small><strong>{m.description}</strong></div>)}{(r.documents||[]).map((doc,i)=><div className="event" key={'doc'+i}><small>{doc.added||doc.date} · {doc.unit}</small><strong>{doc.type}</strong><span>Documento {doc.id}</span>{doc.signatures?.map((s,j)=><span key={j}>{s.name} · {s.date}</span>)}</div>)}</details></article>)}</section>;
}
export function ConsultationDialog({workspace,processes,onClose,onChanged}){
 const [jobs,setJobs]=useState({}),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[summary,setSummary]=useState('');
 const lock=useRef(false),done=useRef(new Set());
 const sei=processes.filter(p=>['sei','both'].includes(p.source)),smu=processes.filter(p=>['smu','both'].includes(p.source));
 const patch=(key,values)=>setJobs(prev=>({...prev,[key]:{...prev[key],...values}}));
 async function start(){
  if(lock.current)return;lock.current=true;setBusy(true);setStarted(true);setSummary('');
  const tasks=[...sei.map(p=>({p,source:'sei'})),...smu.map(p=>({p,source:'smu'}))];
  let cursor=0,success=0,failed=0;
  async function worker(){for(;;){const task=tasks[cursor++];if(!task)break;const {p,source}=task,key=p.id+':'+source;if(done.current.has(key))continue;patch(key,{loading:true,error:''});try{const response=await invokeConsultation(workspace,p.id,source==='sei'?'sei':'smu-start');if(source==='sei'){done.current.add(key);success++;patch(key,{loading:false,done:true,result:response.result});}else patch(key,{loading:false,challenge:response,code:''});}catch(e){failed++;patch(key,{loading:false,error:e.message});}}}
  try{await Promise.all([worker(),worker()]);if(success)await onChanged();setSummary(success+' consulta(s) SEI salva(s).'+(smu.length?' Preencha os códigos da SMU abaixo.':'')+(failed?' '+failed+' consulta(s) com erro; veja os detalhes.':''));}
  finally{lock.current=false;setBusy(false);}
 }
 async function refresh(p){const key=p.id+':smu';patch(key,{loading:true,error:'',challenge:null,code:''});try{patch(key,{loading:false,challenge:await invokeConsultation(workspace,p.id,'smu-start')});}catch(e){patch(key,{loading:false,error:e.message});}}
 async function submit(e){
  e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);let success=0,failed=0;
  try{for(const p of smu){const key=p.id+':smu',job=jobs[key];if(done.current.has(key)||!job?.challenge||!job.code?.trim())continue;
   patch(key,{loading:true,error:''});try{const response=await invokeConsultation(workspace,p.id,'smu-submit',{token:job.challenge.token,code:job.code.trim()});done.current.add(key);success++;patch(key,{loading:false,done:true,result:response.result,challenge:null,code:''});}
   catch(err){failed++;patch(key,{loading:false,error:err.message,challenge:null,code:''});}}
   if(success)await onChanged();setSummary(success+' consulta(s) SMU salva(s).'+(failed?' '+failed+' consulta(s) com erro; gere novas imagens para tentar novamente.':''));
  }finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{start();},[]);
 return <div className="overlay managerOverlay"><section className="dlfDialog" role="dialog" aria-modal="true" aria-label="Consulta rápida"><button className="close" disabled={busy} onClick={onClose} aria-label="Fechar consulta rápida">×</button><div className="eyebrow">CONSULTA NOS PORTAIS OFICIAIS</div><h2>Consulta rápida · {processes.length} processo(s)</h2><p className="dlfHelp">O SEI é consultado automaticamente. Na SMU, preencha o código da imagem; o número do processo já está informado.</p>{!started?<p role="status">Iniciando consultas…</p>:<><p role="status">{busy?'Consultando os portais…':summary}</p><div className="consultationJobs">{sei.map(p=>{const job=jobs[p.id+':sei'];return <div className="queryJob" key={p.id}><strong>{p.title} · SEI</strong><span>{job?.loading?'Consultando…':job?.done?'✓ Consulta salva':job?.error||'Aguardando'}</span>{job?.result?.movements?.[0]&&<small>{job.result.movements[0].date} · {job.result.movements[0].description}</small>}</div>;})}</div><form onSubmit={submit}><div className="dlfGrid">{smu.map(p=>{const key=p.id+':smu',job=jobs[key]||{};return <article key={p.id} className={'dlfCard'+(job.done?' dlfDone':'')}><h3>{p.title}</h3><p className="number">{p.number}</p>{job.loading&&<p>Consultando…</p>}{job.done?<p>✓ Consulta SMU salva.</p>:<>{job.challenge&&<><img className="captchaImage" src={job.challenge.image} alt={'Código de validação para '+p.title}/><label className="captchaLabel">Código da imagem<input aria-label={'Código de '+p.title} required maxLength={12} autoComplete="off" value={job.code||''} disabled={busy} onChange={e=>patch(key,{code:e.target.value})}/></label></>}{job.error&&<p className="managerError">{job.error}</p>}<button type="button" disabled={busy||job.loading} onClick={()=>refresh(p)}>↻ {job.error?'Gerar nova imagem':'Trocar imagem'}</button></>}</article>;})}</div>{smu.some(p=>jobs[p.id+':smu']?.challenge)&&<button className="primary" disabled={busy}>Consultar SMU e salvar resultados</button>}</form>{sei.some(p=>jobs[p.id+':sei']?.error)&&<button className="manageProcesses" disabled={busy} onClick={start}>Repetir consultas com erro</button>}<p className="dlfHelp">Os resultados ficam salvos no banco da equipe. Uma consulta que falhou não altera os resultados anteriores.</p></>}</section></div>;
}

