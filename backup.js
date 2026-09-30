import {validateState} from './core.js';
const FORMAT='reading-house-backup';
export const MAX_BACKUP_BYTES=150*1024*1024;
const encoder=new TextEncoder();
async function digest(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function base64(bytes) {let str='';for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(str);}
export async function encodeBackup(state,audios) {
  validateState(state,audios.map(a=>a.id));
  if(audios.reduce((n,a)=>n+a.blob.size,0)>100*1024*1024) throw new Error('录音超过100MB，当前版本无法打包。请先单独导出重要声音，再删除不需要的录音。');
  const encoded=[];
  for(const a of audios) {const bytes=new Uint8Array(await a.blob.arrayBuffer());encoded.push({id:a.id,type:a.blob.type,duration:a.duration,bytes:bytes.length,sha256:await digest(bytes),data:base64(bytes)});}
  const payload={state,audios:encoded};const text=JSON.stringify(payload);
  return new Blob([JSON.stringify({format:FORMAT,version:1,createdAt:new Date().toISOString(),sha256:await digest(encoder.encode(text)),payload})],{type:'application/json'});
}
export async function decodeBackup(file) {
  if(file.size>MAX_BACKUP_BYTES) throw new Error('备份文件超过150MB，无法在当前版本恢复。');
  let root;try {root=JSON.parse(await file.text());}catch {throw new Error('这不是有效的阅读小屋备份文件。');}
  if(root?.format!==FORMAT||root.version!==1||!root.payload||!Array.isArray(root.payload.audios)) throw new Error('备份版本或格式不受支持。');
  if(await digest(encoder.encode(JSON.stringify(root.payload)))!==root.sha256) throw new Error('备份校验未通过，文件可能已损坏。原有记录未改变。');
  const {state,audios}=root.payload,decoded=[],seen=new Set();let total=0;
  if(audios.length>50000) throw new Error('备份条目过多。');
  for(const a of audios) {
    if(!a||typeof a.id!=='string'||!/^[\w-]{1,80}$/.test(a.id)||seen.has(a.id)||typeof a.data!=='string'||!/^audio\/[\w.+-]+(?:;[\w= .,-]+)?$/.test(a.type)||!Number.isFinite(a.duration)||a.duration<=0||a.duration>181||!Number.isInteger(a.bytes)||a.bytes<=0||a.bytes>30*1024*1024||a.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)) throw new Error('备份中的录音格式不正确。');
    total+=a.bytes;if(total>100*1024*1024)throw new Error('备份中的录音超过100MB。');
    const raw=atob(a.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length!==a.bytes||await digest(bytes)!==a.sha256) throw new Error('有录音缺失或损坏，原有记录未改变。');
    decoded.push({id:a.id,blob:new Blob([bytes],{type:a.type}),duration:a.duration});seen.add(a.id);
  }
  validateState(state,[...seen]);
  return {state,audios:decoded};
}
