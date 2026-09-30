import {validateState} from './core.js';
export const MAX_AUDIO_BYTES=100*1024*1024;
export const cloudState=state=>({...structuredClone(state),revision:0,draft:null,backup:null});
export const hasContent=state=>!!(state.books.length||state.days.length||state.shares.length||state.draft||state.profile.name||state.profile.age);
export function syncDecision(sync,remote){
  const version=remote?.version||0;
  if(sync.pending&&remote?.operation_id===sync.pending.operation)return 'acknowledge';
  const dirty=sync.generation!==sync.synced||!!sync.pending;
  if(dirty&&version!==sync.version)return 'conflict';
  if(dirty)return 'push';
  if(version!==sync.version)return remote?'pull':'missing';
  return 'idle';
}
export async function sha256(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function audioManifest(audios,owner){
  if(audios.reduce((n,a)=>n+a.blob.size,0)>MAX_AUDIO_BYTES)throw new Error('录音超过100MB，请先导出备份并整理后再同步。');
  const result=[];for(const a of audios){
    if(a.blob.size<1||a.blob.size>30*1024*1024||!a.blob.type.startsWith('audio/')||!(a.duration>0&&a.duration<=181))throw new Error('有录音格式或大小不符合要求。');
    const hash=await sha256(a.blob);result.push({id:a.id,sha256:hash,path:`${owner}/${hash}`,bytes:a.blob.size,type:a.blob.type,duration:a.duration});
  }return result;
}
export function validateRemote(remote,owner){
  if(!remote||remote.user_id!==owner||!Number.isSafeInteger(remote.version)||remote.version<1||!Array.isArray(remote.audios)||remote.audios.length>5000)throw new Error('云端记录格式不正确，保留本机记录。');
  let size=0;for(const a of remote.audios){
    if(!a||!/^[\w-]{1,80}$/.test(a.id)||!/^[a-f0-9]{64}$/.test(a.sha256)||a.path!==`${owner}/${a.sha256}`||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>30*1024*1024||!/^audio\/[\w.+-]+(?:;[\w= .,-]+)?$/.test(a.type)||!Number.isFinite(a.duration)||a.duration<=0||a.duration>181)throw new Error('云端录音信息不正确，保留本机记录。');
    size+=a.bytes;
  }
  if(size>MAX_AUDIO_BYTES)throw new Error('云端录音超过当前版本支持的100MB。');
  validateState(remote.state,remote.audios.map(a=>a.id));return remote;
}
