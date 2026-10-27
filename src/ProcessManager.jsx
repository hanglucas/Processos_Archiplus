import {useState} from 'react';
import {validateProcess} from './process-registry.mjs';
const empty=()=>({title:'',number:'',source:'sei',group:'SUBCLA',url:'',reportResponsible:'',note:''});
const lifecycleLabel=value=>value==='approved'?'Aprovado':value==='archived'?'Arquivado':'Ativo';
const sourceLabel=value=>value==='both'?'SEI + SMU':value==='smu'?'SMU':'SEI';
export default function ProcessManager({processes,revision,ready,api,onReload,onSaved,onDeleted,onClose,mode='edit'}){
 const [draft,setDraft]=useState(()=>mode==='create'?empty():null),[query,setQuery]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const groups=[...new Set(processes.map(p=>p.group))];
 function change(key,value){setDraft(prev=>({...prev,[key]:value}));setError('');setSuccess('')}
 function edit(p){setDraft({...empty(),...p});setError('');setSuccess('')}
 async function save(event){event.preventDefault();if(saving||!ready||!draft||(mode==='edit'&&!draft.id))return;setError('');setSuccess('');
  let checked;try{checked=validateProcess(draft,draft.id?processes.find(p=>p.id===draft.id):undefined)}catch(e){setError(e.message);return}
  setSaving(true);try{
   const response=await api({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({process:{...checked,id:draft.id},revision:draft.version})});const body=await response.json();if(!response.ok)throw Error(body.error||'Não foi possível salvar.');
   onSaved(body);setDraft(mode==='create'?empty():{...empty(),...body.process});setSuccess('Cadastro salvo no servidor. Já está disponível na equipe.');
  }catch(e){setError(e.message||'Não foi possível conectar ao servidor.')}finally{setSaving(false)}
 }
 async function remove(){if(saving||!ready||!draft?.id)return;const label=`${draft.title} (${draft.number})`;if(!window.confirm(`Excluir definitivamente o processo ${label}?\n\nEssa ação remove o cadastro do servidor e não pode ser desfeita pelo painel.`))return;
  setSaving(true);setError('');setSuccess('');try{
   const response=await api({method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:draft.id,revision:draft.version})});const body=await response.json();if(!response.ok)throw Error(body.error||'Não foi possível excluir.');
   onDeleted?.(body);setDraft(null);setSuccess('Processo excluído do servidor.');
  }catch(e){setError(e.message||'Não foi possível conectar ao servidor.')}finally{setSaving(false)}
 }
 return <div className="overlay managerOverlay" onClick={()=>{if(!saving)onClose()}}><section className={'processManager'+(mode==='create'?' createManager':'')} role="dialog" aria-modal="true" aria-label={mode==='create'?'Novo processo':'Gerenciar processos'} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!saving){e.stopPropagation();onClose()}}}>
  <div className="managerHeader"><div><div className="eyebrow">CADASTROS DO SERVIDOR</div><h2>{mode==='create'?'Novo processo':'Gerenciar processos'}</h2><p>{mode==='create'?'Preencha os dados para adicionar um novo processo.':'Selecione um processo existente para editar ou excluir o cadastro.'}</p></div><button className="printClose" autoFocus aria-label="Fechar gerenciamento" onClick={onClose} disabled={saving}>Fechar ×</button></div>
  <div className={'managerGrid'+(mode==='create'?' managerCreate':'')}>{mode==='edit'&&<section className="managerList"><input aria-label="Buscar cadastro" placeholder="Buscar nome ou número…" value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" className="captureExpand" onClick={onReload} disabled={saving}>Recarregar cadastros</button><div className="managerRows">{processes.filter(p=>(p.title+' '+p.number+' '+p.group).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map(p=><button className={draft?.id===p.id?'selected':''} key={p.id} disabled={saving} type="button" onClick={()=>edit(p)}><strong>{p.title}</strong><small>{p.number} · {p.group}</small><span>{sourceLabel(p.source)} · {lifecycleLabel(p.lifecycle)} · Editar →</span></button>)}</div></section>}
  {draft?<form className="managerForm" onSubmit={save}><h3>{mode==='create'?'Cadastrar novo processo':'Editar processo'}</h3>{mode==='edit'&&draft.lifecycle&&draft.lifecycle!=='active'&&<div className={'managerLifecycle '+draft.lifecycle}>{lifecycleLabel(draft.lifecycle)}{draft.finalizedAt?` · ${new Date(draft.finalizedAt).toLocaleDateString('pt-BR')}`:''}</div>}<div className="managerFields">
   <label>Nome do processo<input required maxLength={180} value={draft.title} onChange={e=>change('title',e.target.value)} disabled={saving}/></label>
   <div className="managerPair"><label>Sistema de consulta<select value={draft.source} onChange={e=>change('source',e.target.value)} disabled={saving}><option value="sei">Somente SEI Rio</option><option value="smu">Somente SMU</option><option value="both">SEI + SMU · um único processo</option></select></label><label>Grupo<input required list="process-groups" maxLength={80} value={draft.group} onChange={e=>change('group',e.target.value)} disabled={saving}/><datalist id="process-groups">{groups.map(group=><option value={group} key={group}/>)}</datalist></label></div>
   {draft.source==='both'?<>
    <label>Número do processo<input required maxLength={45} value={draft.number} onChange={e=>change('number',e.target.value)} disabled={saving}/></label>
    <label>Link público do SEI<input type="url" required value={draft.url} maxLength={8192} placeholder="https://prefeitura.sei.rio/sei/modulos/pesquisa/…" onChange={e=>change('url',e.target.value)} disabled={saving}/></label>
    <p className="managerHint">O mesmo número será usado nas consultas SEI e SMU. Este cadastro aparecerá uma única vez no painel.</p>
   </>:<>
    <label>Número do processo<input required maxLength={45} value={draft.number} onChange={e=>change('number',e.target.value)} disabled={saving}/></label>
    {draft.source==='sei'?<label>Link público do SEI<input type="url" required value={draft.url} maxLength={8192} placeholder="https://prefeitura.sei.rio/sei/modulos/pesquisa/…" onChange={e=>change('url',e.target.value)} disabled={saving}/></label>:<p className="managerHint">Abra a SMU no portal oficial e informe o número e o CAPTCHA lá.</p>}
   </>}
   <label>Responsável (opcional)<input maxLength={100} value={draft.reportResponsible||''} onChange={e=>change('reportResponsible',e.target.value)} disabled={saving}/></label>
   <label>Observação (opcional)<textarea rows={3} maxLength={2000} value={draft.note||''} onChange={e=>change('note',e.target.value)} disabled={saving}/></label>
  </div>{error&&<p className="managerError" role="alert">{error}</p>}{success&&<p className="managerSuccess" role="status">✓ {success}</p>}<div className="managerFormActions"><button className="primary" type="submit" disabled={saving||!ready}>{!ready?'Conectando ao servidor…':saving?'Salvando…':'Salvar cadastro'}</button>{mode==='edit'&&<button className="dangerButton" type="button" onClick={remove} disabled={saving||!ready}>Excluir processo</button>}</div><small className="managerHint">Você pode escolher um grupo existente ou digitar um novo. Os cadastros ficam salvos neste servidor, mesmo ao fechar o navegador.</small></form>:<section className="managerEmpty"><h3>Editar processo</h3><p>Escolha um cadastro na lista para editar nome, grupo, número, links e observações — ou excluí-lo definitivamente.</p></section>}</div>
 </section></div>
}
