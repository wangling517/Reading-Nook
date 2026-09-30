const path=require('node:path');
module.exports=async({a,b,owner,check,records,sync,root})=>{
  async function home(p=a){await p.locator('.bottom-nav [data-tab=tonight]').click();}
  async function close(p=a){await p.getByRole('button',{name:'关闭',exact:true}).click();}
  async function manual(minutes){await a.locator('[data-action=checkin]').click();if(minutes!==null){await a.locator('[data-action=reading-mode][data-mode=minutes]').click();await a.locator('input[name=minutes]').fill(String(minutes));}await a.locator('#reading-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});}
  async function state(){return a.evaluate(async owner=>(await(await import('./store.js')).createStore(owner).snapshot()),owner);}
  for(const [title,status]of [['神奇校车 想读版','want'],['神奇校车 已读版','done']]){
    await a.locator('[data-action=shelf]').click();await a.locator('[data-action=add-book]').click();await a.locator('input[name=title]').fill(title);await a.locator('select[name=status]').selectOption(status);await a.locator('#book-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});await home();
  }
  await a.locator('[data-action=shelf]').click();check(await a.locator('[data-action=shelf-filter][data-filter=all]').getAttribute('aria-pressed')==='true'&&await a.locator('.shelf-book').count()===3,'shelf defaults to all reading states');
  for(const status of ['reading','want','done']){await a.locator(`[data-action=shelf-filter][data-filter=${status}]`).click();check(await a.locator('.shelf-book').count()===1,'shelf filter '+status);}
  await a.locator('[data-action=shelf-filter][data-filter=all]').click();await a.screenshot({path:path.join(root,'tests/shelf-all-mobile.png'),fullPage:true});await home();
  await a.locator('[data-action=choose-book]').click();await a.locator('#choose-search').fill('校车');check(await a.getByText('这里还没找到这本书',{exact:true}).isVisible(),'search respects current reading status');
  await a.getByRole('button',{name:'在全部书籍中查找',exact:true}).click();check(await a.locator('#choose-results .book-card').count()===2,'partial title search finds matches across all books');
  await a.screenshot({path:path.join(root,'tests/search-mobile.png'),fullPage:true});
  for(const width of [320,360,390,430]){await a.setViewportSize({width,height:844});check(await a.evaluate(()=>document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth),`${width}px searchable book chooser fits`);}
  await a.setViewportSize({width:390,height:844});await a.locator('[data-action=clear-book-search]').click();check(await a.locator('#choose-results .book-card').count()===3,'clear search restores category results');await a.locator('#choose-search').fill('已读版');await a.locator('#choose-results .book-card').click();await a.locator('#sheet').waitFor({state:'hidden'});check(await a.locator('#sheet').isVisible()===false,'choosing a finished book returns to tonight');
  check((await state()).state.books.find(x=>x.title.includes('已读版')).status==='done','rereading selection preserves finished status');
  for(const minutes of [15,20,null])await manual(minutes);await a.getByText('读了3次 · 已记录35分钟 · 1次未记时长',{exact:true}).waitFor();
  const d=(await state()).state.days[0];check(d.readings.length===3&&d.minutes===35,'15 plus 20 plus unknown totals 35 minutes and three sessions');
  await sync(a);await sync(b);await home(b);check(await b.getByText('读了3次 · 已记录35分钟 · 1次未记时长',{exact:true}).isVisible(),'confirmed reading sessions synchronize to second device');
  await a.locator('[data-action=edit-today]').click();await a.locator('[data-action=edit-reading]').first().click();await a.locator('input[name=minutes]').fill('17');await a.locator('#reading-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).state.days[0].minutes===37,'editing one reading replaces its minutes without duplicating it');
  await a.locator('[data-action=edit-today]').click();const unknown=(await state()).state.days[0].readings.find(r=>r.minutes===null);await a.locator(`[data-action=edit-reading][data-id="${unknown.id}"]`).click();await a.locator('[data-action=delete-reading]').click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).state.days[0].readings.length===2,'deleting a reading preserves other sessions');
  await sync(a);const count=records.get(owner).state.days[0].readings.length;
  await a.locator('[data-action=start-reading]').click();await a.locator('#reading-clock').waitFor();const running=(await state()).timer;check(!!running&&records.get(owner).state.days[0].readings.length===count,'starting timer does not record minutes in cloud');
  await a.reload();await a.locator('#reading-clock').waitFor();check((await state()).timer.id===running.id,'timer survives page reload');
  await a.locator('[data-action=choose-book]').click();await a.locator('#choose-search').fill('第一本书');await a.locator('#choose-results .book-card').click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).timer.bookIds.length===2,'switching books during a timer retains both books');
  await sync(b);await home(b);check(await b.locator('[data-action=start-reading]').isVisible(),'in-progress timer remains only on the starting device');
  const prevented=await a.evaluate(async owner=>{const s=(await import('./store.js')).createStore(owner);try{await s.startTimer();return false;}catch{return true;}},owner);check(prevented,'another tab cannot start a second timer for the same account');
  // Move only the synthetic timer's timestamp, to simulate returning after forgetting to stop.
  const timerStart=new Date(Date.now()-3*3600000);timerStart.setMilliseconds(0);
  await a.evaluate(async({owner,startedAt})=>{const s=(await import('./store.js')).createStore(owner);await s.commit((_state,timer)=>{timer.startedAt=startedAt;},[],false,false);},{owner,startedAt:timerStart.toISOString()});
  await a.reload();await a.locator('#reading-clock').waitFor();await a.screenshot({path:path.join(root,'tests/timer-mobile.png'),fullPage:true});
  await a.locator('[data-action=finish-reading]').click();await a.locator('#reading-form').waitFor();check(await a.locator('#reading-long').isVisible(),'forgotten long timer requires explicit confirmation');
  await a.locator('#reading-form button[type=submit]').click();check(!!(await state()).timer,'unconfirmed long session cannot be saved');
  const end=new Date(timerStart.getTime()+25*60000),endInput=new Date(end.getTime()+8*3600000).toISOString().slice(0,19);
  await a.locator('input[name=endedAt]').fill(endInput);await a.getByText('本次 25 分钟 · 保存后计入当天',{exact:true}).waitFor();
  await a.screenshot({path:path.join(root,'tests/finish-mobile.png'),fullPage:true});
  for(const width of [320,390]){await a.setViewportSize({width,height:844});check(await a.evaluate(()=>document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth),`${width}px timer correction form fits`);}
  await a.setViewportSize({width:390,height:844});await a.locator('#reading-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});
  const finished=await state();check(finished.timer===null&&finished.state.days.flatMap(d=>d.readings||[]).some(r=>r.id===running.id&&r.minutes===25),'manual end time saves 25 minutes and atomically clears timer');
  check(finished.state.days.flatMap(d=>d.readings||[]).find(r=>r.id===running.id).bookIds.length===2,'confirmed timer retains all selected books');
  const retry=await a.evaluate(async({owner,id})=>{const s=(await import('./store.js')).createStore(owner);try{await s.commit(()=>{},[],true,true,id);return false;}catch{return true;}},{owner,id:running.id});check(retry,'a stale second tab cannot finish the same timer twice');
  await a.locator('[data-action=start-reading]').click();await a.locator('#reading-clock').waitFor();await a.locator('[data-action=cancel-reading]').click();await a.locator('[data-action=start-reading]').waitFor();check((await state()).timer===null,'cancelled timer creates no reading');
  // Finish a session without minutes, preserving its reading occurrence.
  await a.locator('[data-action=start-reading]').click();await a.locator('#reading-clock').waitFor();await a.locator('[data-action=finish-reading]').click();await a.locator('#reading-form').waitFor();await a.locator('[data-action=reading-mode][data-mode=none]').click();await a.locator('#reading-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).timer===null,'timer can finish as read without recording duration');
  // Existing daily totals must retain their meaning rather than becoming an invented session history.
  await a.evaluate(async owner=>{const {createStore}=await import('./store.js'),{saveDay}=await import('./core.js');await createStore(owner).commit(s=>saveDay(s,{date:'2025-01-01',minutes:30}));},owner);await a.reload();await a.locator('[data-action=start-reading]').waitFor();await a.locator('.bottom-nav [data-tab=memories]').click();await a.locator('[data-action=edit-day][data-date="2025-01-01"]').click();await a.getByText('历史阅读记录',{exact:true}).waitFor();check(true,'old day totals are explicitly labelled historical');
  await a.locator('[data-action=add-reading]').click();await a.locator('[data-action=reading-mode][data-mode=minutes]').click();await a.locator('input[name=minutes]').fill('10');await a.locator('#reading-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).state.days.find(d=>d.date==='2025-01-01').minutes===40,'adding a new session preserves the old total');
  const backupValid=await a.evaluate(async owner=>{const {createStore}=await import('./store.js'),{encodeBackup,decodeBackup}=await import('./backup.js');const snap=await createStore(owner).snapshot();const decoded=await decodeBackup(await encodeBackup(snap.state,snap.audios));return JSON.stringify(decoded.state)===JSON.stringify(snap.state);},owner);check(backupValid,'multi-session data survives complete backup round trip');
  const guards=await a.evaluate(async()=>{
    const {createStore}=await import('./store.js'),{emptyState,saveReading,today}=await import('./core.js'),s=createStore('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    const timer=await s.startTimer(),before=await s.snapshot();const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){if(key==='timer')throw new DOMException('synthetic quota failure','QuotaExceededError');return put.apply(this,arguments);};
    let rejected=false;try{await s.commit(state=>saveReading(state,{date:today(),minutes:10},timer.id),[],true,true,timer.id);}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}
    const after=await s.snapshot();const rollback=rejected&&after.timer.id===timer.id&&after.state.days.length===0&&after.sync.generation===before.sync.generation;
    await s.acceptRemote({version:1,state:emptyState()},[],after.sync.generation);const retained=(await s.snapshot()).timer.id===timer.id;
    return {rollback,retained};
  });check(guards.rollback,'failed finish transaction preserves timer and does not add a reading');check(guards.retained,'remote pull preserves this devices pending timer');
  await home();await sync(a);await sync(b);
};
