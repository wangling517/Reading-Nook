// Isolated browser integration tests. The cloud is mocked; no family data is uploaded.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.READING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/Reading-Nook\//,'')||'index.html';const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!mime[path.extname(file)])throw Error();res.setHeader('Content-Type',mime[path.extname(file)]);res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
const records=new Map(),objects=new Map(),checks=[],errors=[];let lostReply=false,refreshCount=0;
function token(id){return [Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'testsignature'].join('.');}
const user=id=>({id,aud:'authenticated',role:'authenticated',email:id===owner?'family@example.invalid':'other@example.invalid',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}});
async function mock(route){
  const req=route.request(),u=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  const reply=(data,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let id;try{id=JSON.parse(Buffer.from((req.headers().authorization||'').split('.')[1],'base64url')).sub;}catch{}
  if(u.pathname==='/auth/v1/token'){
    const body=req.postDataJSON(),refresh=u.searchParams.get('grant_type')==='refresh_token';if(!refresh&&body.password!=='test-only-password')return reply({error_code:'invalid_credentials',msg:'Invalid login credentials'},400);
    const who=refresh?body.refresh_token.replace('test-refresh-',''):body.email==='family@example.invalid'?owner:other;if(refresh)refreshCount++;
    return reply({access_token:token(who),refresh_token:'test-refresh-'+who,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(who)});
  }
  if(u.pathname==='/auth/v1/logout')return reply({});
  if(u.pathname==='/auth/v1/user')return id?reply(user(id)):reply({},401);
  if(!id)return reply({message:'LOGIN_REQUIRED'},401);
  if(u.pathname==='/rest/v1/reading_nook_snapshots')return reply(records.has(id)?[records.get(id)]:[]);
  if(u.pathname==='/rest/v1/rpc/reading_nook_save'){
    const p=req.postDataJSON(),current=records.get(id);
    if(current?.operation_id===p.operation)return reply(current.version);
    if((current?.version||0)!==p.expected_version)return reply({message:'SYNC_CONFLICT',code:'P0001'},400);
    const next={user_id:id,version:p.expected_version+1,operation_id:p.operation,state:p.new_state,audios:p.new_audios};records.set(id,next);
    if(lostReply){lostReply=false;return route.abort('failed');}return reply(next.version);
  }
  const match=u.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?reading-nook-audio\/(.+)$/);
  if(match){const key=match[1];if(!key.startsWith(id+'/'))return reply({},403);if(req.method()==='POST'){if(objects.has(key))return reply({statusCode:'409',error:'Duplicate',message:'The resource already exists'},409);objects.set(key,req.postDataBuffer());return reply({Key:key});}const blob=objects.get(key);return blob?route.fulfill({status:200,headers,body:blob,contentType:'audio/webm'}):reply({},404);}
  throw Error('Unexpected request: '+u.pathname);
}
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);console.log('PASS: '+label);};
async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/Reading-Nook/`;
  const browser=await chromium.launch({headless:true,channel:'msedge'}),contexts=[];
  async function device(serviceWorkers='block'){const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers,acceptDownloads:true});contexts.push(ctx);await ctx.route('https://lweczcelqhujnhjpbfhg.supabase.co/**',mock);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(url);return p;}
  async function login(p,email='family@example.invalid'){await p.locator('#login-form input[name=email]').fill(email);await p.locator('#login-form input[name=password]').fill('test-only-password');await p.locator('#login-form button[type=submit]').click();await p.getByRole('heading',{name:'故事，慢慢长大'}).waitFor();await p.locator('.cloud-banner[data-kind=synced]').waitFor();}
  async function sync(p){await p.locator('[data-action=settings]').click();await p.locator('[data-action=sync-now]').click();await p.locator('.cloud-banner[data-kind=synced]').waitFor();}
  async function addBook(p,title){await p.locator('.bottom-nav [data-tab=tonight]').click();await p.locator('[data-action=shelf]').click();await p.locator('[data-action=add-book]').click();await p.locator('input[name=title]').fill(title);await p.getByRole('radio',{name:'字数范围',exact:true}).check();await p.locator('input[name=wordCountMinWan]').fill('5');await p.locator('input[name=wordCountMaxWan]').fill('8');await p.locator('#book-form button[type=submit]').click();await p.locator('#sheet').waitFor({state:'hidden'});}
  const a=await device();
  try{
    check(await a.locator('#login-form').isVisible(),'fresh device opens real account login');
    await a.screenshot({path:path.join(root,'tests/login-mobile.png'),fullPage:true});
    await a.locator('#login-form input[name=email]').fill('family@example.invalid');await a.locator('#login-form input[name=password]').fill('wrong');await a.locator('#login-form button[type=submit]').click();await a.getByText('邮箱或密码不正确，请检查后重试。',{exact:true}).first().waitFor();check(true,'invalid credentials stay on login');
    await login(a);await addBook(a,'测试：第一本书');await a.locator('.cloud-banner[data-kind=synced]').waitFor();check(records.get(owner).state.books[0].wordCountMin===50000,'range book reaches cloud');
    const b=await device();await login(b);await b.locator('[data-action=shelf]').click();await b.getByText('测试：第一本书',{exact:true}).first().waitFor();check(true,'second device receives first device bookshelf');
    await a.reload();await a.getByRole('heading',{name:'故事，慢慢长大'}).waitFor();check(true,'session and local data survive reload');
    await a.evaluate(()=>{const key='reading-nook-auth',s=JSON.parse(localStorage.getItem(key));s.expires_at=Math.floor(Date.now()/1000)-60;localStorage.setItem(key,JSON.stringify(s));});await a.reload();await a.locator('.cloud-banner[data-kind=synced]').waitFor();check(refreshCount>0,'expired access session refreshes and keeps the same account');
    await a.context().setOffline(true);await a.locator('[data-action=new-share]').click();await a.locator('textarea[name=text]').fill('离线记录测试');await a.locator('#share-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});check(records.get(owner).state.shares.length===0,'offline edit does not report cloud persistence');
    await a.context().setOffline(false);await sync(a);check(records.get(owner).state.shares.length===1,'offline edit uploads after reconnect');await sync(b);
    // Durable outbox must recognize a committed write when its HTTP response is lost.
    lostReply=true;await a.locator('[data-action=new-share]').click();await a.locator('textarea[name=text]').fill('回复丢失测试');await a.locator('#share-form button[type=submit]').click();await a.locator('.cloud-banner[data-kind=error]').waitFor();await sync(a);check(records.get(owner).state.shares.length===2,'lost reply retry never duplicates a share');await sync(b);
    await a.context().setOffline(true);await b.context().setOffline(true);await addBook(a,'甲设备新书');await addBook(b,'乙设备新书');
    await a.context().setOffline(false);await sync(a);await b.context().setOffline(false);await b.locator('.cloud-banner[data-kind=conflict]').waitFor();check(records.get(owner).state.books.some(x=>x.title==='甲设备新书')&&!records.get(owner).state.books.some(x=>x.title==='乙设备新书'),'concurrent offline edits produce conflict without overwrite');
    await b.locator('[data-action=settings]').click();await b.locator('[data-action=sync-conflict]').click();check(await b.locator('[data-action=conflict-remote]').isDisabled(),'conflict choice requires backups first');
    for(const kind of ['local','remote']){const download=b.waitForEvent('download');await b.locator('[data-action=conflict-backup-'+kind+']').click();await download;}await b.locator('#conflict-confirm:not([disabled])').waitFor();check(true,'both conflict snapshots can be exported');await b.locator('#conflict-confirm').check();await b.locator('[data-action=conflict-remote]').click();await b.locator('#sheet').waitFor({state:'hidden'});await b.getByText('甲设备新书',{exact:true}).first().waitFor();check(true,'explicit cloud selection loads correct version');
    await a.locator('[data-action=settings]').click();await a.locator('[data-action=logout]').click();await a.locator('#login-form').waitFor();check(!await a.getByText('甲设备新书',{exact:true}).count(),'logout removes account content from the UI');
    await login(a,'other@example.invalid');await a.locator('[data-action=shelf]').click();check(!await a.getByText('测试：第一本书',{exact:true}).count(),'other account gets a separate local database');
    for(const width of [320,360,390,430]){await a.setViewportSize({width,height:844});check(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px account shelf fits`);}
    await a.locator('[data-action=settings]').click();await a.screenshot({path:path.join(root,'tests/account-mobile.png'),fullPage:true});await a.getByRole('button',{name:'关闭',exact:true}).click();
    const storageChecks=await a.evaluate(async()=>{
      const {createStore}=await import('./store.js'),{emptyState}=await import('./core.js');const s=createStore('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
      await s.commit(x=>{x.profile.name='first';});const first=await s.snapshot();await s.setPending(first.sync.generation,{operation:'stable-op',generation:first.sync.generation,version:0,state:first.state,audios:[],manifest:[]});
      await s.commit(x=>{x.profile.name='second';});await s.acknowledge('stable-op',1);const next=await s.snapshot();
      const pendingPreserved=next.sync.generation>next.sync.synced&&next.state.profile.name==='second';
      const guarded=await s.acceptRemote({version:2,state:emptyState()},[],first.sync.generation);
      const before=await s.snapshot();const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('test quota','QuotaExceededError');};let rejected=false;try{await s.replaceAll(emptyState(),[]);}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}
      const after=await s.snapshot();return {pendingPreserved,guarded:!guarded,rollback:rejected&&after.state.profile.name===before.state.profile.name&&after.sync.generation===before.sync.generation};
    });for(const [label,result]of Object.entries(storageChecks))check(result,'IndexedDB '+label);
    // A short generated WAV, not a real family recording.
    await b.evaluate(async(owner)=>{const {createStore}=await import('./store.js'),{saveShare,today}=await import('./core.js');const buffer=new ArrayBuffer(16044),view=new DataView(buffer);const text=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};text(0,'RIFF');view.setUint32(4,16036,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,16000,true);const id=crypto.randomUUID();await createStore(owner).commit(s=>saveShare(s,{date:today(),text:'合成录音测试',audioId:id}),[{id,duration:1,blob:new Blob([buffer],{type:'audio/wav'})}]);},owner);
    await sync(b);check(records.get(owner).audios.length===1&&objects.size===1,'private audio upload creates a manifest after the file');
    const c=await device('allow');await login(c);await c.locator('.bottom-nav [data-tab=memories]').click();await c.locator('[data-action=play-audio]').click();await c.locator('audio').waitFor();await c.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);check(true,'other device downloads and decodes synthetic recording');
    await c.evaluate(()=>navigator.serviceWorker.ready);await c.waitForFunction(()=>!!navigator.serviceWorker.controller);await c.context().setOffline(true);await c.reload();await c.getByRole('heading',{name:'故事，慢慢长大'}).waitFor();await c.locator('.bottom-nav [data-tab=memories]').click();await c.locator('[data-action=play-audio]').click();await c.locator('audio').waitFor();check(true,'project subpath PWA reloads offline with cached account and audio');
    // Old local data stays separate, then migrates only on explicit action.
    await a.evaluate(async()=>{const {createStore}=await import('./store.js'),{saveBook}=await import('./core.js');await createStore().commit(s=>saveBook(s,{title:'旧版本机书籍',status:'reading'}));});await a.reload();await a.getByRole('heading',{name:'故事，慢慢长大'}).waitFor();await a.locator('[data-action=settings]').click();await a.locator('[data-action=migrate-old]').click();await a.locator('#sheet').waitFor({state:'hidden'});await a.locator('.cloud-banner[data-kind=synced]').waitFor();check(records.get(other).state.books[0].title==='旧版本机书籍','legacy data migrates to empty account explicitly');
    check(await a.evaluate(async()=>{const {createStore}=await import('./store.js');return(await createStore().snapshot()).state.books[0].title==='旧版本机书籍';}),'legacy migration retains the original local copy');
    check(!errors.length,'no uncaught browser exceptions');console.log(JSON.stringify({checks,errors},null,2));
  }catch(e){await a.screenshot({path:path.join(root,'tests/cloud-failure.png'),fullPage:true});console.error(e);process.exitCode=1;}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;server.close();});
