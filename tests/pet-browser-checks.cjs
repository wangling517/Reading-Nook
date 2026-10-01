const path=require('node:path');
module.exports=async({a,b,owner,check,records,sync,root})=>{
  const state=()=>a.evaluate(async owner=>(await(await import('./store.js')).createStore(owner).snapshot()).state,owner);
  const close=()=>a.getByRole('button',{name:'关闭',exact:true}).click();
  await a.locator('.bottom-nav [data-tab=tonight]').click();
  await a.locator('[data-action=pet-collection]').first().click();await a.locator('[data-action=pet-adopt][data-id=bunny]').click();await a.locator('#sheet').waitFor({state:'hidden'});
  check((await state()).pets.selected==='bunny','first pet adopted via UI');
  await a.locator('.pet-stage canvas').waitFor();check(true,'home has a real WebGL companion');
  await a.screenshot({path:path.join(root,'tests/pet-home-mobile.png'),fullPage:true});
  const before=(await state()).pets.rewardedDates.length;
  await a.locator('[data-action=checkin]').click();await a.locator('#reading-form button[type=submit]').click();await a.locator('#sheet').waitFor({state:'hidden'});
  check((await state()).pets.rewardedDates.length===before,'same-day extra reading does not farm stars');
  for(let n=1;n<=3;n++){await a.locator('[data-action=pet-feed]').click();await a.waitForFunction(async({owner,n})=>(await(await import('./store.js')).createStore(owner).snapshot()).state.pets.owned[0].feeds.length===n,{owner,n});}
  await a.getByText('棉棉，长耳朵兔',{exact:true}).waitFor();check(true,'three feeds reveal the next 3D growth stage');
  await a.locator('[data-action=pet-growth]').click();await a.locator('[data-action=pet-preview][data-stage="0"]').click();check(await a.getByText('小时候的模样 · 只是回看，不会改变成长',{exact:true}).isVisible(),'unlocked growth forms can be revisited');check(await a.locator('[data-action=pet-preview][data-stage="2"]').isDisabled(),'future growth preview stays locked');await close();
  await sync(a);await sync(b);await b.locator('.bottom-nav [data-tab=tonight]').click();await b.getByText('棉棉，长耳朵兔',{exact:true}).waitFor();check(records.get(owner).state.pets.owned[0].feeds.length===3,'pet growth syncs to second device through snapshot');
  const atomic=await a.evaluate(async()=>{const {createStore}=await import('./store.js'),{emptyState}=await import('./core.js'),{adoptPet,feedPet,petBalance}=await import('./pets-model.js');const store=createStore('dddddddd-dddd-4ddd-8ddd-dddddddddddd');await store.commit(s=>adoptPet(s,'dog'));await Promise.all([store.commit(s=>feedPet(s,'dog','same')),store.commit(s=>feedPet(s,'dog','same'))]);const first=await store.snapshot();await store.replaceAll(emptyState(),[]);return {once:first.state.pets.owned[0].feeds.length===1&&petBalance(first.state.pets)===2,restore:!(await store.snapshot()).state.pets};});
  check(atomic.once,'duplicate concurrent feed is charged once in IndexedDB');check(atomic.restore,'restoring legacy backup removes optional pet data');
  // Isolated fixture reading days fund the collection without touching real accounts.
  await a.evaluate(async owner=>{const {createStore}=await import('./store.js'),{saveReading}=await import('./core.js'),{claimReadingStars}=await import('./pets-model.js');await createStore(owner).commit(s=>{for(let n=1;n<=20;n++)saveReading(s,{date:`2025-02-${String(n).padStart(2,'0')}`,minutes:null},'pet-fixture-'+n);claimReadingStars(s);});},owner);await a.reload();await a.locator('[data-action=pet-feed]').waitFor();
  for(const id of ['cat','dog','monkey','phoenix']){await a.locator('[data-action=pet-collection]').click();await a.locator(`[data-action=pet-adopt][data-id=${id}]`).click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).pets.selected===id,'collect and select '+id);}
  for(let n=1;n<=9;n++){await a.locator('[data-action=pet-feed]').click();await a.waitForFunction(async({owner,n})=>(await(await import('./store.js')).createStore(owner).snapshot()).state.pets.owned.find(p=>p.id==='phoenix').feeds.length===n,{owner,n});}
  await a.getByText('啾啾，流光凤凰',{exact:true}).waitFor();check(true,'nine feeds reveal full phoenix plumage');
  for(const id of ['garden','sky','heart-rug','flower-bowl']){await a.locator('[data-action=pet-shop]').click();await a.locator(`[data-action=pet-buy][data-id="${id}"]`).click();await a.locator('#sheet').waitFor({state:'hidden'});}
  check((await state()).pets.items.length===4,'all four scene and decoration purchases persist');
  await a.locator('[data-action=pet-shop]').click();await a.locator('[data-action=pet-buy][data-id=garden]').click();await a.locator('#sheet').waitFor({state:'hidden'});check((await state()).pets.items.length===4,'re-equipping an owned scene adds no extra purchase');
  for(const width of [320,360,390,430]){await a.setViewportSize({width,height:844});check(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px pet home fits`);await a.locator('[data-action=pet-collection]').click();check(await a.evaluate(()=>document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth),`${width}px pet collection fits`);await close();}
  await a.setViewportSize({width:390,height:844});await a.screenshot({path:path.join(root,'tests/pet-grown-mobile.png'),fullPage:true});
  await a.locator('.bottom-nav [data-tab=island]').click();await a.locator('[data-action=milestone][data-id=forest]').click();await a.getByText('啾啾也来探险啦',{exact:true}).waitFor();check(await a.locator('#sheet .pet-stage[data-scene=sky] canvas').count()===1,'unlocked cloud island includes the selected 3D companion');await close();await a.locator('.bottom-nav [data-tab=tonight]').click();
  await a.locator('[data-action=pet-collection]').click();await a.screenshot({path:path.join(root,'tests/pet-collection-mobile.png'),fullPage:true});await close();
  await a.context().setOffline(true);await a.locator('[data-action=pet-feed]').click();await a.waitForFunction(async owner=>(await(await import('./store.js')).createStore(owner).snapshot()).state.pets.owned.find(p=>p.id==='phoenix').feeds.length===10,owner);check(true,'feeding works offline');const snapshot=await state();
  await a.evaluate(()=>{const canvas=document.querySelector('.pet-stage canvas');canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();});await a.locator('.pet-stage:not(.has-3d)').waitFor();check(await a.locator('.pet-stage>.pet-picture').evaluate(img=>img.complete&&img.naturalWidth>0),'WebGL context loss shows the pre-rendered 3D portrait');
  await a.context().setOffline(false);await sync(a);await a.reload();await a.locator('[data-action=pet-feed]').waitFor();check(JSON.stringify((await state()).pets)===JSON.stringify(snapshot.pets),'reload preserves offline pet care and purchases');await sync(b);
};
