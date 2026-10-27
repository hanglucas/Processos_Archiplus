import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const recoveryRequested=location.hash.includes('type=recovery');
export const configured=Boolean(url?.startsWith('https://')&&key?.startsWith('sb_publishable_')&&!key.includes('SUBSTITUIR'));
export const db=configured?createClient(url,key,{auth:{persistSession:false,detectSessionInUrl:true,autoRefreshToken:true}}):null;
export async function result(request){const {data,error}=await request;if(error)throw Error(error.message);return data;}
export const rpc=(name,args={})=>result(db.rpc(name,args));
export const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['prefeitura.sei.rio','consultasmu.rio.gov.br'].includes(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}};
export function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
