const smuUrl='https://consultasmu.rio.gov.br/consultaPrincipal.asp?o=n';
export const builtinProcesses=[];
export const supportsSei=p=>p?.source==='sei'||p?.source==='both';
export const supportsSmu=p=>p?.source==='smu'||p?.source==='both';
export const seiNumberOf=p=>supportsSei(p)?p.number:'';
export const smuNumberOf=p=>supportsSmu(p)?p.number:'';
export function asSmuProcess(p){
 if(!supportsSmu(p))return null;
 const number=smuNumberOf(p);
 return {...p,source:'smu',number,url:smuUrl,lookup:number.replace(/[^A-Z0-9]/gi,'').toUpperCase()};
}
export function asSeiProcess(p){
 if(!supportsSei(p))return null;
 return {...p,source:'sei',number:p.number,url:p.url};
}
export function catalogFromState(state){
 const overrides=state?.overrides||{},deleted=new Set(state?.deleted||[]);
 return [...builtinProcesses.map(p=>({...p,...overrides[p.id]})),...(state?.custom||[])]
  .filter(p=>!deleted.has(p.id))
  .map(p=>({...p,...(p.source==='both'?{smuNumber:undefined}:{}),lifecycle:['approved','archived'].includes(p.lifecycle)?p.lifecycle:'active'}));
}
const field=(value,label,max,required=false)=>{const text=typeof value==='string'?value.trim():'';if(required&&!text)throw Error('Informe '+label+'.');if(text.length>max)throw Error(label+' excede o tamanho permitido.');return text};
const validateNumber=(value,label)=>{const number=field(value,label,45,true).toUpperCase();if(!/^[A-Z0-9./\-]+$/.test(number))throw Error(label+' deve conter apenas letras, números, pontos, barras e hífens.');return number};
const validateSeiUrl=value=>{let url=field(value,'o link público do SEI',8192,true),parsed;try{parsed=new URL(url)}catch{throw Error('Informe um link válido do SEI Rio.')}if(parsed.protocol!=='https:'||parsed.hostname!=='prefeitura.sei.rio'||parsed.port||parsed.username||parsed.password||!/^\/sei\/modulos\/pesquisa\/md_?pesq_processo_exibir\.php$/i.test(parsed.pathname))throw Error('Use o link público de consulta do SEI Rio (prefeitura.sei.rio).');return parsed.href};
const validateLookup=number=>{const lookup=number.replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{8,20}$/.test(lookup))throw Error('O número SMU deve ter de 8 a 20 letras ou números, sem contar a pontuação.');return lookup};
export function validateProcess(input,previous){
 const source=input.source;if(!['sei','smu','both'].includes(source))throw Error('Selecione SEI, SMU ou SEI + SMU.');
 const title=field(input.title,'o nome do processo',180,true),group=field(input.group,'o grupo',80,true);
 if(group.toLocaleLowerCase('pt-BR')==='todos')throw Error('Escolha outro nome para o grupo. “Todos” é reservado à visão geral.');
 const note=field(input.note,'a observação',2000),reportResponsible=field(input.reportResponsible,'o responsável',100);
 let number,url,lookup;
 if(source==='sei'){
  number=validateNumber(input.number,'O número do processo');url=validateSeiUrl(input.url);
 }else if(source==='smu'){
  number=validateNumber(input.number,'O número do processo');lookup=validateLookup(number);url=smuUrl;
 }else{
  number=validateNumber(input.number,'O número do processo');url=validateSeiUrl(input.url);lookup=validateLookup(number);
 }
 return {...previous,source,title,group,number,note,reportResponsible,url,smuNumber:undefined,...(lookup?{lookup}:{lookup:undefined})};
}
