import {createClient} from './vendor/supabase.js';
import {cloudConfig} from './cloud-config.js';
import {sha256} from './sync-model.js';
export const client=createClient(cloudConfig.url,cloudConfig.key,{auth:{storageKey:'reading-nook-auth',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
export function cloudError(error){
  const text=error?.message||'';
  if(text.includes('SYNC_CONFLICT'))return Object.assign(new Error('另一台设备更新了记录，请先处理同步冲突。'),{conflict:true});
  if(/Invalid login credentials/i.test(text))return new Error('邮箱或密码不正确，请检查后重试。');
  if(/Email not confirmed/i.test(text))return new Error('这个家庭账号尚未确认，请联系项目管理员。');
  if(/rate limit|too many requests/i.test(text))return new Error('尝试太频繁，请稍后再试。');
  if(/reading_nook|schema cache|does not exist|permission denied/i.test(text))return new Error('云端尚未准备好，请先完成数据库初始化及权限配置。');
  if(/jwt|session|refresh.token|LOGIN_REQUIRED/i.test(text))return new Error('登录已过期，请重新登录；本机未同步记录会保留。');
  if(/fetch|network|timeout/i.test(text))return new Error('暂时连不上云端，记录仍在这台设备，请稍后重试。');
  if(/AUDIO_LIMIT|quota|exceed|size/i.test(text))return new Error('云端空间或文件大小达到限制，请先导出备份。');
  return new Error('云端操作未完成，记录仍在本机。请重试或联系项目管理员。');
}
export function apiFor(owner){
  // Capture the bearer token once. A later account switch must never relabel an in-flight write.
  async function request(path,{method='GET',body,type='application/json',binary=false}={}){
    const {data,error}=await client.auth.getSession();if(error)throw cloudError(error);
    if(data.session?.user.id!==owner)throw new Error('当前账号已改变，请重新打开页面。');
    const headers={apikey:cloudConfig.key,Authorization:`Bearer ${data.session.access_token}`};if(body!==undefined)headers['Content-Type']=type;
    let response;try{response=await fetch(cloudConfig.url+path,{method,headers,body,cache:'no-store',signal:AbortSignal.timeout(45000)});}catch(e){throw cloudError({message:'network '+e.message});}
    if(!response.ok){let detail;try{detail=await response.json();}catch{detail={};}throw Object.assign(cloudError(detail),{status:response.status,detail});}
    return binary?response.blob():response.json();
  }
  return {
    async read(){const rows=await request(`/rest/v1/reading_nook_snapshots?select=*&user_id=eq.${owner}`);if(!Array.isArray(rows)||rows.length>1)throw new Error('云端返回了无效的记录。');return rows[0]?.version?rows[0]:null;},
    async save(pending){const version=await request('/rest/v1/rpc/reading_nook_save',{method:'POST',body:JSON.stringify({expected_version:pending.version,operation:pending.operation,new_state:pending.state,new_audios:pending.manifest})});if(!Number.isSafeInteger(version)||version<1)throw new Error('同步回复格式不正确，请重试。');return version;},
    async upload(meta,blob){try{await request('/storage/v1/object/reading-nook-audio/'+meta.path,{method:'POST',body:blob,type:meta.type.split(';')[0]});}catch(e){if(e.status!==409&&!/already exists|duplicate/i.test(e.detail?.message||''))throw e;}},
    async download(meta){const data=await request('/storage/v1/object/authenticated/reading-nook-audio/'+meta.path,{binary:true});if(data.size!==meta.bytes||await sha256(data)!==meta.sha256)throw new Error('录音校验未通过，暂不替换本机记录。');return {id:meta.id,duration:meta.duration,blob:new Blob([data],{type:meta.type})};}
  };
}
