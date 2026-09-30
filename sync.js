import {cloudState,syncDecision,audioManifest,validateRemote,sha256} from './sync-model.js';
export function createSync(store,api,{changed=()=>{},status=()=>{},canPull=()=>true,isCurrent=()=>true}={}){
  let running=null,stopped=false,conflict=null;
  const current=()=>!stopped&&isCurrent();
  const emit=(kind,message)=>{if(current())status({kind,message,conflict});};
  async function getAudios(remote,local){const result=[];for(const meta of remote.audios){
    if(!current())throw new Error('账号已切换。');const cached=local.audios.find(a=>a.id===meta.id);
    if(cached&&cached.blob.size===meta.bytes&&await sha256(cached.blob)===meta.sha256)result.push(cached);else result.push(await api.download(meta));
  }return result;}
  async function cycle(){
    if(!current())return;if(!navigator.onLine){emit('offline','离线 · 已保存在这台设备');return;}emit('syncing','正在同步……');
    for(let attempt=0;attempt<5&&current();attempt++){
      const local=await store.snapshot(),remote=await api.read();if(!current())return;if(remote)validateRemote(remote,store.owner);
      const decision=syncDecision(local.sync,remote);
      if(decision==='acknowledge'){await store.acknowledge(local.sync.pending.operation,remote.version);continue;}
      if(decision==='conflict'){conflict=remote;emit('conflict','两台设备都有改动 · 请处理');return;}
      if(decision==='missing')throw new Error('云端记录暂不可用，本机记录已保留。');
      if(decision==='pull'){
        if(!canPull()){emit('pending','云端有更新 · 完成编辑后同步');return;}
        const audios=await getAudios(remote,local);if(!current()||!canPull())return;
        if(await store.acceptRemote(remote,audios,local.sync.generation))await changed();continue;
      }
      if(decision==='idle'){conflict=null;emit('synced',remote?'已同步到云端':'账号已连接 · 等待第一段故事');return;}
      let pending=local.sync.pending;
      if(!pending){const manifest=await audioManifest(local.audios,store.owner);pending=await store.setPending(local.sync.generation,{operation:crypto.randomUUID(),generation:local.sync.generation,version:local.sync.version,state:cloudState(local.state),manifest,audios:local.audios});if(!pending)continue;}
      for(const meta of pending.manifest){if(!current())return;await api.upload(meta,pending.audios.find(a=>a.id===meta.id).blob);}
      if(!current())return;
      try{const version=await api.save(pending);await store.acknowledge(pending.operation,version);}
      catch(e){if(e.conflict){conflict=await api.read();emit('conflict','两台设备都有改动 · 请处理');return;}throw e;}
    }
    if(current())emit('pending','本机有新记录 · 等待下次同步');
  }
  function run(){
    if(running||!current())return running||Promise.resolve();const work=()=>cycle().catch(e=>emit('error',e.message));
    running=(navigator.locks?navigator.locks.request(`reading-nook-sync-${store.owner}`,{ifAvailable:true},lock=>lock?work():emit('pending','另一个窗口正在同步')):work()).finally(()=>{running=null;});return running;
  }
  async function resolve(choice,backup){
    if(running)await running;if(!current()||!conflict)throw new Error('请重新检查同步状态。');
    const local=await store.snapshot(),remote=await api.read();if(!current())return;
    if(!backup||backup.owner!==store.owner||backup.generation!==local.sync.generation||backup.revision!==local.state.revision||backup.version!==remote?.version)throw new Error('备份后记录又有变化，请重新导出两份备份。');
    if(!remote||remote.version!==conflict.version){conflict=remote;throw new Error('云端又有新记录，请重新查看后选择。');}validateRemote(remote,store.owner);
    if(choice==='remote'){
      const audios=await getAudios(remote,local);if(!current())return;
      if(!await store.acceptRemote(remote,audios,local.sync.generation,true))throw new Error('本机又有改动，请重新导出备份后再处理。');await changed();
    }else if(!await store.keepLocal(remote.version,local.sync.generation))throw new Error('本机又有改动，请重新处理。');
    conflict=null;await run();
  }
  return {run,resolve,stop:()=>{stopped=true;},get conflict(){return conflict;}};
}
