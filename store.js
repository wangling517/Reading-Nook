import {emptyState,uid} from './core.js';
const emptySync=()=>({generation:0,synced:0,version:0,pending:null,lastSync:null});
export function createStore(owner=null){
  if(owner!==null&&!/^[a-f0-9-]{36}$/i.test(owner))throw new Error('无效的账号标识。');
  const name=owner?`reading-nook-user-${owner}`:'reading-house-v1';let dbPromise;
  function open(){return dbPromise ||= new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('meta');req.result.createObjectStore('audio',{keyPath:'id'});};
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();dbPromise=null;};resolve(req.result);};
    req.onerror=()=>{dbPromise=null;reject(req.error);};
    req.onblocked=()=>{dbPromise=null;reject(new Error('请关闭其他阅读小屋窗口后重试。'));};
  });}
  async function snapshot(){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta','audio'],'readonly');let state,audios,sync,timer;const meta=tx.objectStore('meta');
    meta.get('state').onsuccess=e=>state=e.target.result||emptyState();
    meta.get('sync').onsuccess=e=>sync=e.target.result||emptySync();
    meta.get('timer').onsuccess=e=>timer=e.target.result||null;
    tx.objectStore('audio').getAll().onsuccess=e=>audios=e.target.result;
    tx.oncomplete=()=>resolve({state,audios,sync,timer});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}
  async function readLocal(){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readonly'),meta=tx.objectStore('meta');let state,timer;
    meta.get('state').onsuccess=e=>state=e.target.result||emptyState();meta.get('timer').onsuccess=e=>timer=e.target.result||null;
    tx.oncomplete=()=>resolve({state,timer});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}
  async function transaction(recipe){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta','audio'],'readwrite'),meta=tx.objectStore('meta');let state,sync,timer,result,error,read=0;
    const run=()=>{if(++read!==3)return;try{const context={state,sync,timer,audio:tx.objectStore('audio')};result=recipe(context);meta.put(state,'state');meta.put(sync,'sync');meta.put(context.timer,'timer');}catch(e){error=e;tx.abort();}};
    meta.get('state').onsuccess=e=>{state=e.target.result||emptyState();run();};
    meta.get('sync').onsuccess=e=>{sync=e.target.result||emptySync();run();};
    meta.get('timer').onsuccess=e=>{timer=e.target.result||null;run();};
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||tx.error||new Error('未能保存，请重试。'));tx.onerror=()=>{error||=tx.error;};
  });}
  async function commit(recipe,adds=[],content=true,cloud=true,timerId=null){return transaction(context=>{
    const {state,sync,audio}=context;
    if(timerId&&context.timer?.id!==timerId)throw new Error('这次计时已在其他窗口结束或取消，请重新打开。');
    recipe(state,context.timer);if(timerId)context.timer=null;if(content)state.revision++;if(content&&cloud)sync.generation++;
    const used=new Set(state.shares.map(x=>x.audioId).filter(Boolean));
    for(const item of adds)if(used.has(item.id))audio.put(item);
    audio.openKeyCursor().onsuccess=e=>{const cursor=e.target.result;if(cursor){if(!used.has(cursor.key))audio.delete(cursor.key);cursor.continue();}};
    return state;
  });}
  async function startTimer(){return transaction(context=>{
    if(context.timer)throw new Error('已经有一次阅读正在计时，请先结束或取消。');
    const book=context.state.books.find(b=>b.id===context.state.selectedBook&&!b.archived);
    return context.timer={id:uid(),startedAt:new Date().toISOString(),bookIds:book?[book.id]:[]};
  });}
  async function cancelTimer(id){return transaction(context=>{
    if(context.timer?.id!==id)throw new Error('计时已发生变化，请重新打开。');context.timer=null;
  });}
  function replaceData(target,incoming,audios,audio){delete target.pets;Object.assign(target,structuredClone(incoming));audio.clear();for(const a of audios)audio.put(a);}
  async function replaceAll(next,audios){return transaction(context=>{const {state,sync,audio}=context;replaceData(state,next,audios,audio);context.timer=null;sync.generation++;return state;});}
  async function setPending(generation,pending){return transaction(({sync})=>{if(sync.pending)return sync.pending;if(sync.generation!==generation)return null;sync.pending=pending;return pending;});}
  async function acknowledge(operation,version){return transaction(({sync})=>{
    if(sync.pending?.operation!==operation)return false;
    sync.synced=sync.pending.generation;sync.version=version;sync.pending=null;sync.lastSync=new Date().toISOString();return true;
  });}
  async function acceptRemote(remote,audios,generation,force=false){return transaction(({state,sync,audio})=>{
    if(sync.generation!==generation||(!force&&(sync.pending||sync.generation!==sync.synced)))return false;
    const draft=state.draft,revision=state.revision+1;replaceData(state,remote.state,audios,audio);state.revision=revision;state.backup=null;
    state.draft=draft&&(!draft.bookId||state.books.some(b=>b.id===draft.bookId))?draft:null;
    sync.version=remote.version;sync.synced=sync.generation;sync.pending=null;sync.lastSync=new Date().toISOString();return true;
  });}
  async function keepLocal(version,generation){return transaction(({sync})=>{if(sync.generation!==generation)return false;sync.version=version;sync.pending=null;sync.generation++;return true;});}
  async function getAudio(id){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('audio').objectStore('audio').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  return {owner,name,snapshot,readLocal,readState:async()=>(await readLocal()).state,getAudio,commit,replaceAll,setPending,acknowledge,acceptRemote,keepLocal,startTimer,cancelTimer};
}
const legacy=createStore();
export const snapshot=(...a)=>legacy.snapshot(...a);
export const readState=(...a)=>legacy.readState(...a);
export const getAudio=(...a)=>legacy.getAudio(...a);
export const commit=(...a)=>legacy.commit(...a);
export const replaceAll=(...a)=>legacy.replaceAll(...a);
