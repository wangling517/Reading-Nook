import {today,uid,saveReading,deleteReading,readingEntries,timedMinutes,bookStatuses,filterBooks,saveBook,saveShare,stats,achievements,validDate,bookWordRange,formatBookWords} from './core.js';
import {beijingInput,fromBeijing,summaryText,timerText,readingControls,readingsView,readingForm,updateReadingForm} from './reading-ui.js';
import {createStore} from './store.js';
import {client,apiFor,cloudError} from './cloud-api.js';
import {createSync} from './sync.js';
import {hasContent,validateRemote} from './sync-model.js';
import {loginView,accountView,conflictView} from './account-ui.js';
import {encodeBackup,decodeBackup} from './backup.js';
import {VoiceRecorder} from './recorder.js';
import {PETS,adoptPet,feedPet,petStage,buyPetItem,resetPetItem,claimReadingStars} from './pets-model.js';
import {petHome,collectionView,growthView,shopView,petRules,islandCompanion} from './pets-ui.js';
import {mountPetStage,clearPetStage,animatePet} from './pet-art.js';
import {renderIsland,chapterView,treasuresView} from './island.js';

const $=s=>document.querySelector(s), main=$('#main'), sheet=$('#sheet'), body=$('#sheet-body');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name,extra='')=>`<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${({book:'<path d="M16 8C10 4 5 6 3 7v20c5-3 9-2 13 0 4-2 8-3 13 0V7c-4-2-8-2-13 1Zm0 0v19M7 11l5 1m-5 4 5 1m8-5 5-1m-5 6 5-1"/>',mic:'<rect x="11" y="3" width="10" height="18" rx="5"/><path d="M7 15v2a9 9 0 0 0 18 0v-2M16 26v4m-5 0h10"/>',pen:'<path d="m6 23-1 5 5-1L27 10l-4-4Zm14-14 4 4M6 22l4 4M15 28h12"/>',seed:'<path d="M16 29V15m0 6C4 23 3 10 3 10s12-2 13 11Zm0-6C16 5 28 3 28 3s1 13-12 12"/>',sprout:'<path d="M16 27V12m0 7C5 21 5 8 5 8s11 0 11 11Zm0-5C16 5 27 3 27 3s1 12-11 11M5 29c7-3 15-3 22 0"/>',tree:'<path d="M16 28V14m0 6-5-6m5 3 5-5"/><path d="M9 22C0 20 5 12 7 12 4 3 18 0 21 7c10-2 12 11 5 13-4 6-13 6-17 2Z" fill="currentColor" fill-opacity=".15"/>',forest:'<path d="m10 4-8 12h5l-7 9h20l-7-9h5ZM10 25v5m13-24-7 11h4l-6 9h18l-6-9h4ZM23 26v4" fill="currentColor" fill-opacity=".15"/>',house:'<path d="m3 15 13-12 13 12M6 13v16h20V13M12 29V18h8v11M5 11l-3 3m25-3 3 3" fill="currentColor" fill-opacity=".1"/>',check:'<path d="m7 16 6 6L26 9"/>',star:'<path d="m16 3 4 9 10 1-8 7 2 10-8-5-8 5 2-10-8-7 10-1Z"/>'})[name]||''}</svg>`;
let storage=createStore(),user=null,syncer=null,loadedOwner,accountEpoch=0,legacyExists=false,syncTimer;
let syncStatus={kind:'local',message:'仅保存在这台设备'},conflictBackup=null;
let state,tab='tonight',shelfFilter='all',memoryFilter='all',memoryLimit=20,offlineReady=false,registration=null,installEvent=null,pendingReload=false;
let modalType='',modalDirty=false,editingShare=null,voice=null,voiceBlob=null,voiceDuration=0,originalAudio=null,removeAudio=false;
let draftTimer,draftPending=Promise.resolve(),toastTimer,busy=false,restoreCandidate=null,lastToday=today();
let activeReading=null,chooseFilter='reading',chooseQuery='';
const urls=new Set();
const colors=['#cedcc7','#e5d7b8','#cad8da','#ddcebf','#d6d7bb'];
const bookName=id=>state.books.find(b=>b.id===id)?.title||'未关联书籍';
function bookCover(b,big=false){const sum=[...(b?.title||'')].reduce((n,c)=>n+c.codePointAt(0),0);return `<div class="book-cover" style="background:${colors[sum%colors.length]}">${icon('book')}<span>${esc(b?.title||(big?'下一段故事':'一本新书'))}</span></div>`;}
function dateLabel(date){return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Shanghai'}).format(new Date(`${date}T12:00:00+08:00`));}
function shortDate(date){return date.replaceAll('-','.');}
function audioURL(blob){const url=URL.createObjectURL(blob);urls.add(url);return url;}
function releaseURLs(){for(const u of urls)URL.revokeObjectURL(u);urls.clear();}
function notify(message,undo=null){clearTimeout(toastTimer);const t=$('#toast');t.replaceChildren(document.createTextNode(message));if(undo){const b=document.createElement('button');b.textContent='撤销';b.onclick=async()=>{try{await undo();}catch(e){notify(e.message);}};t.append(b);}t.classList.add('show');toastTimer=setTimeout(()=>t.classList.remove('show'),undo?8500:4200);}
function failure(e){console.error(e);const message=e?.name==='QuotaExceededError'?'空间不足，未能保存。已有记录保留，请先导出备份。':e?.message||'这次未能保存，请重试。';const el=$('.form-error');if(el)el.textContent=message;notify(message);}
function stopPlayback(){document.querySelectorAll('audio').forEach(a=>a.pause());}
async function mutate(recipe,message='',adds=[],undo=null,timerId=null){
  let unlocked=[],earned=0;
  const writeStore=storage;
  await writeStore.commit((s,timer)=>{recipe(s,timer);earned=claimReadingStars(s);unlocked=achievements(s).filter(m=>m.done&&!s.celebrated.includes(m.id));s.celebrated.push(...unlocked.map(m=>m.id));},adds,true,true,timerId);
  if(writeStore!==storage)return;const local=await writeStore.readLocal();if(writeStore!==storage)return;state=local.state;activeReading=local.timer;scheduleSync(true);
  render();if(message)notify((unlocked.length?`${message} · ${unlocked[0].name}已点亮`:message)+(earned?` · +${earned} 颗星星`:''),undo);
}
function render(){
  clearPetStage();
  document.body.classList.toggle('account-locked',!state);
  document.body.classList.toggle('reading-active',!!state&&!!activeReading&&tab==='tonight');
  if(!state){main.innerHTML=loginView(legacyExists);document.title='登录 · 阅读小屋';return;}
  stopPlayback();if(!sheet.open)releaseURLs();
  main.innerHTML=tab==='tonight'?tonightView():tab==='memories'?memoriesView():tab==='island'?renderIsland(state):shelfView();
  mountPetStage(sheet.open?body:main);
  const banner=document.createElement('button');banner.className='cloud-banner';banner.dataset.action='account';banner.dataset.kind=syncStatus.kind;banner.textContent=syncStatus.message;main.prepend(banner);
  document.querySelectorAll('.bottom-nav button').forEach(b=>{if(b.dataset.tab===tab||(tab==='shelf'&&b.dataset.tab==='tonight'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  document.title=`${state.profile.name?state.profile.name+'的':''}阅读小屋`;
}
function weekView(){
  const now=new Date(`${today()}T12:00:00Z`),dow=(now.getUTCDay()+6)%7;
  return `<div class="week" aria-label="本周阅读日">${['一','二','三','四','五','六','日'].map((label,i)=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()-dow+i);const key=d.toISOString().slice(0,10),read=state.days.some(x=>x.date===key);return `<div class="week-day"><span>${label}</span><span class="week-dot ${read?'read':''} ${key===today()?'current':''}" aria-label="${key}${read?' 已阅读':''}">${read?'✓':d.getUTCDate()}</span></div>`;}).join('')}</div>`;
}
function tonightView(){
  const day=state.days.find(d=>d.date===today()),b=state.books.find(x=>x.id===state.selectedBook&&!x.archived);
  return `<div class="intro"><div><h1>故事，慢慢长大</h1><p class="small muted">${state.profile.name?`${esc(state.profile.name)}的`:'属于我们的'}阅读时光</p></div><span class="date-chip">${Number(today().slice(5,7))}月${Number(today().slice(8))}日</span></div>
  ${petHome(state)}
  <div class="section-head"><h2>枕边的一本书</h2><button class="text-btn" data-action="shelf">我的书架&nbsp; ›</button></div>
  <div class="book-card">${bookCover(b)}<div class="book-meta"><h3>${b?esc(b.title):'今晚，选一个故事'}</h3><span class="small muted">${b?esc(b.author||'慢慢读，不用着急'):'也可以先记录，稍后再选书'}</span>${formatBookWords(b)?`<p class="small muted">全书 ${formatBookWords(b)}</p>`:''}</div><button class="text-btn" data-action="choose-book">${b?'换一本':'选一本'}</button></div>
  ${readingControls(day,activeReading)}
  ${weekView()}<div class="sharing-title"><h2>今天想说……</h2><span>小想法，也值得收藏</span></div>
  <div class="share-actions"><button class="share-button" data-action="new-share">${icon('pen')}<strong>${state.draft?'继续写那句话':'记一句原话'}</strong><span class="arrow">↗</span></button><button class="share-button voice" data-action="new-voice">${icon('mic')}<strong>留一段声音</strong><span class="arrow">↗</span></button></div><p class="gentle-note">今天不想分享，也没关系。</p>`;
}
function memoriesView(){
  const shares=state.shares.filter(s=>memoryFilter!=='favorite'||s.favorite),days=memoryFilter==='favorite'?[]:state.days;
  const dates=[...new Set([...shares.map(s=>s.date),...days.map(d=>d.date)])].sort().reverse(),shown=dates.slice(0,memoryLimit);
  return `<div class="intro"><div><h1>把小时光，留下来</h1><p class="small muted">书里的故事，还有你的声音。</p></div></div><div class="label-row"><div class="filters"><button class="filter ${memoryFilter==='all'?'active':''}" data-action="memory-filter" data-filter="all">全部回忆</button><button class="filter ${memoryFilter==='favorite'?'active':''}" data-action="memory-filter" data-filter="favorite">收藏的话</button></div><button class="text-btn" data-action="backdate">补记阅读</button></div>
  ${!dates.length?`<div class="empty"><div class="empty-art">${icon('book')}</div><h3>${memoryFilter==='favorite'?'把喜欢的话，放在这里':'第一段回忆，等你来写'}</h3><p>${memoryFilter==='favorite'?'在回忆卡片上点“收藏”，下次就能轻松找到。':'读过的一页，问过的问题，<br>或者一句天马行空的话。'}</p><button class="primary" data-action="new-share">记一句原话</button></div>`:shown.map(date=>{const d=days.find(x=>x.date===date);return `<div class="memory-date">${dateLabel(date)}</div>${d?`<article class="memory-card reading"><div class="label-row"><h3 style="font-size:15px">✓ 这一天，读过书啦</h3><button class="text-btn" data-action="edit-day" data-date="${date}">编辑</button></div><p class="timeline-caption">${d.bookIds.length?d.bookIds.map(id=>esc(bookName(id))).join('、'):'没有填写书名'} · ${summaryText(d)}${d.mode?` · ${d.mode}`:''}</p></article>`:''}${shares.filter(s=>s.date===date).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(s=>`<article class="memory-card"><div class="memory-top"><span>${s.bookId?`读《${esc(bookName(s.bookId))}》时`:'今天想说的话'}</span><span>${s.audioId?'有声音':'孩子的原话'}</span></div>${s.text?`<p class="quote">${esc(s.text)}</p>`:''}${s.audioId?`<div class="audio-row" data-audio="${s.audioId}"><button class="audio-placeholder" data-action="play-audio" data-id="${s.audioId}"><span class="play-disc">▶</span><span>听听当时的声音</span></button></div>`:''}<div class="memory-actions"><button data-action="favorite" data-id="${s.id}" class="${s.favorite?'favorite-on':''}">${s.favorite?'★ 已收藏':'☆ 收藏'}</button><button data-action="edit-share" data-id="${s.id}">编辑</button><button data-action="delete-share" data-id="${s.id}">删除</button></div></article>`).join('')}`;}).join('')}
  ${dates.length>memoryLimit?'<button class="secondary" style="width:100%" data-action="more-memories">看看更早的回忆</button>':dates.length?'<p class="end-note">每一个小小的瞬间，都在这里。</p>':''}`;
}
function shelfView(){const list=filterBooks(state.books,shelfFilter);return `<div class="back-heading"><button class="icon-btn" data-action="nav" data-tab="tonight" aria-label="回到今晚">‹</button><h1>我的小书架</h1></div><p class="small muted" style="margin-top:8px">读到哪里，都有一个位置。</p>${bookFilters(shelfFilter,'shelf-filter')}<button class="secondary" style="width:100%" data-action="add-book">＋ 放一本书进来</button>${list.length?`<div class="book-grid">${list.map(b=>`<article class="shelf-book">${bookCover(b,true)}<span class="tag shelf-status">${bookStatuses.find(([key])=>key===b.status)[1]}</span><h3 class="shelf-title">${esc(b.title)}</h3><p class="shelf-author">${esc(b.author||'作者未填写')}${b.category?' · '+esc(b.category):''}</p><p class="shelf-author">${formatBookWords(b)?'全书 '+formatBookWords(b):'字数待补充'}</p><div class="shelf-bottom"><button class="text-btn" data-action="select-book" data-id="${b.id}">今晚读这本</button><button data-action="edit-book" data-id="${b.id}">编辑</button></div></article>`).join('')}</div>`:`<div class="empty"><div class="empty-art">${icon('book')}</div><h3>${shelfFilter==='want'?'把想读的故事放进来':shelfFilter==='done'?'读完一本，就留下足迹':'哪一本正在陪伴你？'}</h3><p>只填书名，就可以开始。</p></div>`}`;}

function openSheet(title,html,type=''){clearPetStage();stopPlayback();modalType=type;modalDirty=false;$('#sheet-title').textContent=title;body.innerHTML=html;body.scrollTop=0;if(!sheet.open)sheet.showModal();sheet.scrollTop=0;mountPetStage(body); }
function closeRaw(){clearPetStage();voice?.cancel();voice=null;clearTimeout(draftTimer);sheet.close();modalType='';modalDirty=false;voiceBlob=null;originalAudio=null;editingShare=null;removeAudio=false;restoreCandidate=null;body.innerHTML='';releaseURLs();scheduleSync();mountPetStage(main);}
async function closeSheet(){
  if(voice?.active||voice?.starting||voiceBlob){if(!confirm('这段新录音还未保存。要放弃录音并关闭吗？'))return;}
  if(modalType==='share'&&!editingShare)await stashDraft();
  else if(modalDirty&&!confirm('还有未保存的修改，要放弃修改并关闭吗？'))return;
  closeRaw();render();
}
function formFoot(label='保存'){return `<p class="form-error" role="alert"></p><div class="form-actions"><button class="primary" type="submit">${label}</button></div>`;}
function bookOptions(selected=null){return `<option value="">不关联书籍</option>${state.books.filter(b=>!b.archived||b.id===selected).map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.title)}${b.archived?'（已移除）':''}</option>`).join('')}`;}
function openBook(id=null){const b=state.books.find(x=>x.id===id),{min,max}=bookWordRange(b),countMode=min==null?(b?'unknown':'exact'):min===max?'exact':'range';openSheet(b?'编辑这本书':'放一本书进来',`<form id="book-form" data-id="${id||''}"><label class="field"><span>书名</span><input name="title" maxlength="120" value="${esc(b?.title)}" required placeholder="例如：夏洛的网"></label><label class="field"><span>作者 <em>选填</em></span><input name="author" maxlength="80" value="${esc(b?.author)}" placeholder="是谁写的呢"></label><label class="field"><span>分类 <em>选填</em></span><input name="category" maxlength="40" value="${esc(b?.category)}" placeholder="童话、科普、绘本……"></label><fieldset class="field word-field"><legend>整本书字数 <em>选填，单位：万字</em></legend><div class="word-mode">${[['exact','确定字数'],['range','字数范围'],['unknown','暂不清楚']].map(([value,label])=>`<label><input type="radio" name="wordCountMode" value="${value}" ${countMode===value?'checked':''}><span>${label}</span></label>`).join('')}</div><div id="word-exact-field" ${countMode!=='exact'?'hidden':''}><div class="wan-input"><input name="wordCountWan" aria-label="整本书字数（万字）" type="number" inputmode="decimal" min="0.0001" step="0.0001" value="${min!==null&&min===max?min/10000:''}" placeholder="例如：6.5" ${countMode!=='exact'?'disabled':''}><span>万字</span></div></div><div id="word-range-fields" class="range-fields" ${countMode!=='range'?'hidden':''}><label><small>最少</small><div class="wan-input"><input name="wordCountMinWan" aria-label="最少字数（万字）" type="number" inputmode="decimal" min="0.0001" step="0.0001" value="${min!==null?min/10000:''}" placeholder="例如：5" ${countMode!=='range'?'disabled':''}></div></label><span>—</span><label><small>最多</small><div class="wan-input"><input name="wordCountMaxWan" aria-label="最多字数（万字）" type="number" inputmode="decimal" min="0.0001" step="0.0001" value="${max!==null?max/10000:''}" placeholder="例如：8" ${countMode!=='range'?'disabled':''}><span>万字</span></div></label></div><p class="small muted" style="margin-top:9px">6万字填6，6万5千字填6.5。只知道范围时，选“字数范围”。</p></fieldset><label class="field"><span>读到哪里</span><select name="status">${[['want','想读'],['reading','正在读'],['done','已读完']].map(([v,l])=>`<option value="${v}" ${(b?.status||'reading')===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field" id="completion-field" ${b?.status!=='done'?'hidden':''}><span>读完的日期</span><input type="date" name="completedDate" value="${b?.completedDate||today()}" max="${today()}" min="1900-01-01"></label>${formFoot()}${b?`<button class="danger danger-link" type="button" data-action="archive-book" data-id="${b.id}">从书架移除</button>`:''}</form>`,'book');}
function bookFilters(selected,action){return '<div class="book-filters">'+bookStatuses.map(([key,label])=>`<button class="filter ${key===selected?'active':''}" data-action="${action}" data-filter="${key}" aria-pressed="${key===selected}">${label}<small>${filterBooks(state.books,key).length}</small></button>`).join('')+'</div>';}
function openChooseBook(){
  chooseFilter=state.books.some(b=>!b.archived&&b.status==='reading')?'reading':'all';chooseQuery='';
  openSheet('今晚，想读哪一本？','<div class="choose-top"><div class="book-search"><input id="choose-search" type="search" maxlength="120" placeholder="搜索书名" aria-label="搜索书名" autocomplete="off"><button data-action="clear-book-search" hidden>清空</button></div><div id="choose-filters"></div></div><div id="choose-results" class="choose-results" aria-live="polite"></div><button class="primary" data-action="add-book">＋ 添加一本书</button><button class="text-btn" style="width:100%;margin-top:12px" data-action="select-book" data-id="">先不选书</button>','choose');renderChooseResults();
}
function renderChooseResults(){
  const list=filterBooks(state.books,chooseFilter,chooseQuery);$('#choose-filters').innerHTML=bookFilters(chooseFilter,'choose-filter');
  $('[data-action=clear-book-search]').hidden=!chooseQuery;
  $('#choose-results').innerHTML=`<p class="choose-count">${bookStatuses.find(([key])=>key===chooseFilter)[1]} · ${list.length}本${chooseQuery?'匹配书籍':''}</p>`+(list.length?list.map(b=>`<button class="book-card" data-action="select-book" data-id="${b.id}" aria-pressed="${b.id===state.selectedBook}">${bookCover(b)}<span class="book-meta"><h3>${esc(b.title)}</h3><span class="small muted">${esc(b.author||'作者未填写')} · ${bookStatuses.find(([key])=>key===b.status)[1]}</span></span>${b.id===state.selectedBook?'<span class="chosen-mark">✓</span>':''}</button>`).join(''): `<div class="empty"><h3>${chooseQuery?'这里还没找到这本书':'这里暂时没有书'}</h3><p>${chooseQuery?'试试书名中的几个字，或者换个分类。':'可以换个分类看看，也可以添加新书。'}</p>${chooseFilter!=='all'?'<button class="secondary" data-action="choose-filter" data-filter="all">在全部书籍中查找</button>':''}</div>`);
}

function openDay(date=today()){
  const day=state.days.find(d=>d.date===date);if(!day){openReading(null,date);return;}
  openSheet(dateLabel(date)+'的阅读',readingsView(day,bookName),'reading-list');
}
function openReading(id=null,date=today(),timer=null){
  const day=id?state.days.find(d=>readingEntries(d).some(r=>r.id===id)):null,entry=readingEntries(day).find(r=>r.id===id);
  if(id&&!entry)throw new Error('这次阅读已不存在，请重新打开。');
  if(timer)date=beijingInput(timer.startedAt).slice(0,10);
  openSheet(timer?'把这段阅读记下来':entry?'编辑这次阅读':'记下一次阅读',readingForm({entry,date:day?.date||date,timer,books:state.books,selectedBook:state.selectedBook,id:entry?.id||timer?.id||uid()}),'reading');
  updateReadingForm($('#reading-form'));
}
async function refreshReadingLocal(){
  if(!state||busy||sheet.open)return;const source=storage,epoch=accountEpoch,local=await source.readLocal();if(source!==storage||epoch!==accountEpoch||sheet.open||busy)return;
  const changed=state.revision!==local.state.revision||activeReading?.id!==local.timer?.id;state=local.state;activeReading=local.timer;if(changed)render();
}

function draftFields(){const f=$('#share-form');if(!f)return null;return {date:validDate(f.elements.date.value)?f.elements.date.value:today(),text:f.elements.text.value,bookId:f.elements.bookId.value||null};}
async function stashDraft(){
  clearTimeout(draftTimer);if(modalType!=='share'||editingShare)return draftPending;
  const draft=draftFields();if(!draft)return draftPending;
  const draftStore=storage;
  draftPending=draftPending.catch(()=>{}).then(async()=>{const saved=await draftStore.commit(s=>{s.draft=draft.text.trim()?draft:null;},[],true,false);if(draftStore===storage)state=saved;const hint=$('#draft-state');if(hint&&draftStore===storage)hint.textContent=draft.text.trim()?'文字草稿已保存在这台设备':'分享是自愿的，空着也没关系';});
  return draftPending;
}
async function openShare(id=null,wantVoice=false){
  const epoch=accountEpoch;
  editingShare=id;voiceBlob=null;originalAudio=null;removeAudio=false;voiceDuration=0;
  const saved=state.shares.find(s=>s.id===id),draft=!id?state.draft:null,x=saved||draft||{date:today(),text:'',bookId:state.selectedBook};
  openSheet(id?'这一刻，想说的话':'今天想说……',`<form id="share-form"><label class="field"><span>哪一天的小想法</span><input type="date" name="date" value="${x.date}" max="${today()}" min="1900-01-01" required></label><label class="field"><span>读哪本书时想到的 <em>选填</em></span><select name="bookId">${bookOptions(x.bookId)}</select></label><label class="field"><span>记下孩子的原话</span><textarea name="text" maxlength="2000" placeholder="“我觉得……”\n书里的发现、一个问题，或者今天的心情。">${esc(x.text)}</textarea></label><div class="label-row"><span class="small muted" id="draft-state">${draft?'接着上次没写完的话':'不需要写成读后感，原话就很好'}</span><span class="small muted" id="word-count">${x.text.length}/2000</span></div><div id="voice-area"></div><p class="notice">不想写字，也可以留一段声音。只分享不会自动记为阅读日。</p>${formFoot('收藏这一刻')}</form>`,'share');
  if(saved?.audioId){const audio=await storage.getAudio(saved.audioId);if(epoch!==accountEpoch)return;originalAudio=audio;}
  if(modalType==='share'){renderVoice();if(wantVoice)$('#record-start')?.focus();}
}
function renderVoice(){const el=$('#voice-area');if(!el)return;const available=voiceBlob?{blob:voiceBlob,duration:voiceDuration}:!removeAudio?originalAudio:null;
  el.innerHTML=available?`<div class="record-panel"><div class="wave" aria-hidden="true">${'<i></i>'.repeat(9)}</div><p>${voiceBlob?'这段新声音还未保存':'当时的声音'} · ${Math.ceil(available.duration)}秒</p><div class="audio-row"><audio controls preload="metadata" src="${audioURL(available.blob)}"></audio></div><div class="speech-tools"><button type="button" data-action="rerecord">重新录一段</button><button type="button" data-action="remove-audio">移除声音</button>${originalAudio&&!voiceBlob?`<button type="button" data-action="download-audio" data-id="${originalAudio.id}">保存原始音频</button>`:''}</div><p>如果无法播放，可导出原始音频在其他播放器打开。</p></div>`:`<div class="record-panel"><button id="record-start" class="record-button" type="button" data-action="record" aria-label="开始录音">${icon('mic')}</button><p>点一下，把声音留下来</p><p>每段最多3分钟 · 请保持页面在前台</p></div>`;
}
async function startRecording(){
  stopPlayback();const el=$('#voice-area');
  el.innerHTML='<div class="record-panel"><button class="record-button" disabled type="button" aria-label="等待麦克风授权">…</button><p>等待麦克风授权……</p></div>';
  voice=new VoiceRecorder(seconds=>{const t=$('#record-clock');if(t)t.textContent=`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;},({blob,duration,interrupted})=>{voice=null;if(modalType!=='share')return;if(!blob.size){renderVoice();notify('没有录到声音，请再试一次。');return;}voiceBlob=blob;voiceDuration=duration;modalDirty=true;renderVoice();if(interrupted)notify('录音已中断，可能不完整。请先回听再保存。');$('#share-form button[type=submit]').disabled=false;});
  try {await voice.start();if(!voice?.active)return;modalDirty=true;el.innerHTML='<div class="record-panel"><button class="record-button active" type="button" data-action="stop-record" aria-label="结束录音"></button><div class="record-time" id="record-clock">0:00</div><p>正在录音，点一下结束</p><p>请保持页面在前台，最长3分钟</p></div>';$('#share-form button[type=submit]').disabled=true;}catch(e){voice=null;renderVoice();failure(e);}
}

function openSettings(){const n=stats(state),backup=state.backup,dirty=!backup||backup.revision!==state.revision;openSheet('小屋设置',`${accountView(user,syncStatus,legacyExists)}<form id="profile-form"><div class="label-row"><label class="field" style="flex:1"><span>孩子的昵称 <em>选填</em></span><input name="name" maxlength="30" value="${esc(state.profile.name)}" placeholder="我的阅读小屋"></label><label class="field" style="width:85px"><span>年龄</span><input name="age" type="number" min="1" max="18" step="1" value="${state.profile.age}" placeholder="选填"></label></div><p class="form-error" role="alert"></p><button class="secondary" type="submit" style="width:100%">保存资料</button></form><section class="settings-section"><h3>把回忆，好好保存</h3><p>${user?'记录和声音会同步到家庭账号，也保存在本机。同步不能替代备份；换手机或清理数据前，请导出一份。':'旧记录仅保存在这台设备，登录后可迁入家庭账号。'}</p><div class="settings-status"><span>上次生成备份</span><span>${backup?shortDate(backup.at.slice(0,10)):'还没有备份'}</span></div><p>${dirty?'有尚未备份的内容':'当前内容已生成过备份'} · ${n.days}个阅读日，${n.shares}条回忆</p><div class="settings-row"><button class="secondary" data-action="export">导出完整备份</button><button class="secondary" data-action="import">从备份恢复</button></div><input type="file" id="backup-file" accept=".json,application/json" hidden><p style="margin-top:10px">备份包含原始录音，请保存到“文件”或自己的网盘。当前完整备份支持累计100MB录音；备份生成不代表你已将文件妥善保存。</p></section><section class="settings-section"><h3>放在手机桌面</h3><p>iPhone：用Safari打开 → 分享 → 添加到主屏幕。安卓：在系统浏览器菜单中选择安装应用或添加到主屏幕，具体入口以浏览器为准。</p>${installEvent?'<button class="secondary" data-action="install">添加到桌面</button>':''}<p>首次添加后，请确认桌面入口中的记录可见；以后固定从这个入口使用。</p><div class="settings-status"><span><i class="status-dot"></i>${offlineReady?'已可离线使用':'离线资源准备中'}</span><span>${user?'家庭同步版':'本机旧记录'}</span></div>${registration?.waiting||pendingReload?'<button class="secondary" data-action="update">新版已准备好 · 更新</button>':''}</section><section class="settings-section"><h3>收起来的书</h3><p>移除书籍不会抹去之前的阅读经历。</p><button class="secondary" data-action="archived">查看已移除的书</button></section><p class="small muted">日期按北京时间记录。版本 2.2 · 愿每一次阅读，都有自己的节奏。</p>`,'settings');}
async function exportBackup(){
  const source=storage,epoch=accountEpoch,snap=await source.snapshot(),blob=await encodeBackup(snap.state,snap.audios),at=new Date().toISOString();
  if(epoch!==accountEpoch)throw new Error('账号已切换，请在当前账号重新导出备份。');
  download(blob,`阅读小屋备份-${today()}-${at.slice(11,19).replaceAll(':','')}.json`);
  const updated=await source.commit(s=>{s.backup={at,revision:snap.state.revision};},[],false);
  if(epoch!==accountEpoch)throw new Error('账号已切换，刚才生成的是原账号的备份。');state=updated;
  notify('备份文件已生成，请确认保存到手机文件或网盘。');if(modalType==='settings')openSettings();return snap.state.revision;
}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
async function previewImport(file){if(!file)return;restoreCandidate=await decodeBackup(file);const n=stats(restoreCandidate.state),hasData=hasContent(state);openSheet('恢复这份回忆',`<p class="notice">${n.days}个阅读日 · ${n.books}本已读完 · ${n.shares}条回忆 · ${restoreCandidate.audios.length}段声音</p><p class="small muted">恢复会完整替换当前记录，不会合并。${user?'登录状态下，恢复的内容也会上传并替换账号中的云端版本。':''}校验已通过，录音格式是否可播放仍取决于设备。</p>${hasData?'<button class="secondary" style="width:100%;margin-top:18px" data-action="backup-before-restore">先导出当前记录</button><label class="check-row" style="margin-top:14px"><input type="checkbox" id="restore-confirm" disabled>我已保存刚导出的当前备份</label>':''}<p class="form-error" role="alert"></p><button class="primary" style="margin-top:20px" data-action="restore" ${hasData?'disabled':''}>恢复并替换当前记录</button>`,'restore');}

document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled||busy)return;
  const a=b.dataset.action;try {
    if(!state&&!['close','retry','local-mode','login-help','show-login'].includes(a))return;
    switch(a){
      case 'pet-collection':openSheet('小伙伴收藏册',collectionView(state),'pets');break;
      case 'pet-rules':openSheet('星星从故事里来',petRules,'pets');break;
      case 'pet-shop':openSheet('给小屋一点甜',shopView(state),'pets');break;
      case 'pet-growth':openSheet('陪你慢慢长大',growthView(state),'pets');break;
      case 'pet-preview':openSheet('陪你慢慢长大',growthView(state,Number(b.dataset.stage)),'pets');break;
      case 'pet-adopt':busy=true;await mutate(s=>adoptPet(s,b.dataset.id),'小伙伴来陪你啦');closeRaw();break;
      case 'pet-feed':{busy=true;const id=b.dataset.id,pet=PETS.find(p=>p.id===id),before=petStage(state.pets.owned.find(p=>p.id===id).feeds.length);await mutate(s=>feedPet(s,id,uid()));const after=petStage(state.pets.owned.find(p=>p.id===id).feeds.length);animatePet();const greeting=$('#pet-message');if(greeting)greeting.textContent=after>before?pet.name+'长大啦！看看'+pet.stages[after]+'的新模样。':pet.words[0];$('.pet-home')?.classList.add('pet-celebrate');notify(after>before?'新的成长模样已收藏，可以在成长相册里回看。':'喂好啦 · 用掉 1 颗星星');break;}
      case 'pet-touch':animatePet();if($('#pet-message'))$('#pet-message').textContent=PETS.find(p=>p.id===state.pets.selected).words[1];break;
      case 'pet-buy':busy=true;await mutate(s=>buyPetItem(s,b.dataset.id),'小屋布置好啦');closeRaw();break;
      case 'pet-reset':busy=true;await mutate(s=>resetPetItem(s,b.dataset.type),'已换回原来的样子');closeRaw();break;
      case 'account':openSettings();break;
      case 'login-help':openSheet('家长账号怎么使用', '<p class="notice">这是家庭自用版，账号由项目管理员预先创建，不开放公众注册。</p><p class="small muted">请使用管理员为家庭设置的邮箱和密码。它与 GitHub 登录、Supabase 控制台和数据库密码无关。忘记密码时，请由项目管理员协助重置。</p>','login-help');break;
      case 'show-login':closeRaw();state=null;render();break;
      case 'local-mode':storage=createStore();{const local=await storage.snapshot();state=local.state;activeReading=local.timer;}syncStatus={kind:'local',message:'本机旧记录 · 登录后可迁入云端'};render();break;
      case 'sync-now':await closeSheet();if(!sheet.open)await syncer?.run();break;
      case 'logout':await logoutFamily();break;
      case 'migrate-old':busy=true;await migrateOld();break;
      case 'sync-conflict':if(syncer?.conflict){conflictBackup=null;const s=await storage.snapshot();openSheet('好好保留两份记录',conflictView(s.state,syncer.conflict),'conflict');}else notify('当前没有需要处理的冲突。');break;
      case 'conflict-backup-local':case 'conflict-backup-remote':busy=true;await exportConflict(a==='conflict-backup-local'?'local':'remote');break;
      case 'conflict-remote':case 'conflict-local':if(!$('#conflict-confirm')?.checked)break;if(!confirm(a==='conflict-local'?'用本机整份记录替换云端？请确认两份备份都已保存。':'载入云端整份记录替换本机？请确认两份备份都已保存。'))break;busy=true;await syncer.resolve(a==='conflict-local'?'local':'remote',conflictBackup);closeRaw();state=await storage.readState();render();break;
      case 'nav': tab=b.dataset.tab;render();window.scrollTo(0,0);break;
      case 'settings':openSettings();break;
      case 'close':await closeSheet();break;
      case 'shelf':tab='shelf';shelfFilter='all';render();window.scrollTo(0,0);break;
      case 'shelf-filter':shelfFilter=b.dataset.filter;render();break;
      case 'memory-filter':memoryFilter=b.dataset.filter;memoryLimit=20;render();break;
      case 'more-memories':memoryLimit+=20;render();break;
      case 'checkin':case 'backdate':openReading();break;
      case 'edit-today':openDay(today());break;
      case 'edit-day':openDay(b.dataset.date);break;
      case 'add-reading':openReading(null,b.dataset.date);break;
      case 'edit-reading':openReading(b.dataset.id);break;
      case 'delete-reading':if(confirm('删除这次阅读？当天其他阅读和分享仍会保留。')){busy=true;await mutate(s=>deleteReading(s,b.dataset.id),'这次阅读已删除');closeRaw();}break;
      case 'reading-mode':{const f=$('#reading-form');f.elements.timeMode.value=b.dataset.mode;f.elements.confirmLong.checked=false;updateReadingForm(f);modalDirty=true;break;}
      case 'reading-minutes':{const f=$('#reading-form');f.elements.minutes.value=b.dataset.value;updateReadingForm(f);modalDirty=true;break;}
      case 'start-reading':{busy=true;const source=storage,epoch=accountEpoch;const timer=await source.startTimer();if(source===storage&&epoch===accountEpoch){activeReading=timer;render();notify('开始啦。安心读书，回来后再确认时间。');}break;}
      case 'finish-reading':{busy=true;const source=storage,epoch=accountEpoch,local=await source.snapshot();if(source!==storage||epoch!==accountEpoch)break;activeReading=local.timer;state=local.state;if(!activeReading){render();throw new Error('这次计时已结束或取消。');}openReading(null,today(),activeReading);break;}
      case 'cancel-reading':if(activeReading&&confirm('取消这次计时？不会生成阅读记录。')){busy=true;const source=storage,epoch=accountEpoch;await source.cancelTimer(activeReading.id);if(source===storage&&epoch===accountEpoch){activeReading=null;render();}}break;
      case 'choose-filter':chooseFilter=b.dataset.filter;renderChooseResults();break;
      case 'clear-book-search':chooseQuery='';$('#choose-search').value='';renderChooseResults();$('#choose-search').focus();break;
      case 'choose-book':openChooseBook();break;
      case 'add-book':openBook();break;
      case 'edit-book':openBook(b.dataset.id);break;
      case 'select-book':await mutate((s,timer)=>{s.selectedBook=b.dataset.id||null;if(timer&&s.selectedBook&&!timer.bookIds.includes(s.selectedBook))timer.bookIds.push(s.selectedBook);},b.dataset.id?'枕边的书，换好啦':'可以不选书，直接记录');if(sheet.open)closeRaw();tab='tonight';render();break;
      case 'archive-book':if(confirm('将这本书从书架移除？历史记录、完成事实会保留，也可以恢复。')){await mutate(s=>{s.books.find(x=>x.id===b.dataset.id).archived=true;if(s.selectedBook===b.dataset.id)s.selectedBook=null;},'书已收起来，回忆还在');closeRaw();}break;
      case 'archived':openSheet('收起来的书',state.books.filter(x=>x.archived).map(x=>`<div class="book-card"><div class="book-meta"><h3>${esc(x.title)}</h3><span class="small muted">${x.status==='done'?'已读完':'已移除'}</span></div><button class="text-btn" data-action="restore-book" data-id="${x.id}">放回书架</button></div>`).join('')||'<p class="notice">暂时没有移除的书。</p>','archived');break;
      case 'restore-book':await mutate(s=>{s.books.find(x=>x.id===b.dataset.id).archived=false;},'已放回书架');closeRaw();tab='shelf';render();break;
      case 'new-share':await openShare();break;
      case 'new-voice':await openShare(null,true);break;
      case 'edit-share':await openShare(b.dataset.id);break;
      case 'record':await startRecording();break;
      case 'stop-record':voice?.stop();break;
      case 'rerecord':if(confirm('重新录一段？保存新声音之前，原有已保存录音仍会保留。'))await startRecording();break;
      case 'remove-audio':if(confirm('移除这条回忆中的声音？点击保存后生效。')){voiceBlob=null;removeAudio=true;modalDirty=true;renderVoice();}break;
      case 'favorite':await mutate(s=>{const x=s.shares.find(x=>x.id===b.dataset.id);x.favorite=!x.favorite;});break;
      case 'delete-share':if(confirm('删除这条回忆及其录音？删除后只能从已有备份恢复。'))await mutate(s=>{s.shares=s.shares.filter(x=>x.id!==b.dataset.id);},'这条回忆已删除');break;
      case 'play-audio': {const epoch=accountEpoch;const x=await storage.getAudio(b.dataset.id);if(epoch!==accountEpoch)break;if(!x)throw new Error('未找到录音，请尝试从完整备份恢复。');stopPlayback();const parent=b.parentElement;const audio=document.createElement('audio');audio.controls=true;audio.src=audioURL(x.blob);parent.replaceChildren(audio);audio.onerror=()=>{parent.replaceChildren(document.createTextNode('此设备无法播放这段声音。'));const btn=document.createElement('button');btn.className='text-btn';btn.dataset.action='download-audio';btn.dataset.id=x.id;btn.textContent='导出原音频';parent.append(btn);};await audio.play().catch(()=>{});break;}
      case 'download-audio':{const epoch=accountEpoch;const x=await storage.getAudio(b.dataset.id);if(epoch!==accountEpoch)break;if(!x)throw new Error('未找到这段声音。');const ext=x.blob.type.includes('mp4')?'m4a':x.blob.type.includes('ogg')?'ogg':x.blob.type.includes('wav')?'wav':'webm';download(x.blob,`孩子的声音-${x.id.slice(0,8)}.${ext}`);break;}
      case 'milestone':{const m=achievements(state).find(x=>x.id===b.dataset.id);if(m)openSheet(m.name,chapterView(m)+islandCompanion(state,m),'chapter');break;}
      case 'treasures':openSheet('我的探险宝藏',treasuresView(state),'treasures');break;
      case 'adventure-go':{const kind=b.dataset.kind;closeRaw();tab=kind==='books'?'shelf':'tonight';if(kind==='books')shelfFilter=state.books.some(x=>!x.archived&&x.status==='reading')?'reading':'want';render();window.scrollTo(0,0);break;}
      case 'milestone-evidence':{const m=achievements(state).find(x=>x.id===b.dataset.id);if(!m?.done)break;if(m.kind==='days'){closeRaw();tab='memories';memoryFilter='all';render();window.scrollTo(0,0);}else openSheet('读完的那些故事',state.books.filter(x=>x.status==='done').sort((a,b)=>b.completedDate.localeCompare(a.completedDate)).map(x=>`<div class="book-card">${bookCover(x)}<div class="book-meta"><h3>${esc(x.title)}</h3><p class="small muted">${shortDate(x.completedDate)} 读完${x.archived?' · 已收起':''}</p></div></div>`).join(''),'completed');break;}
      case 'export':busy=true;await exportBackup();break;
      case 'import':$('#backup-file').click();break;
      case 'backup-before-restore':busy=true;await exportBackup();$('#restore-confirm').disabled=false;notify('请先确认当前备份文件已保存，再勾选恢复。');break;
      case 'restore':{if(!restoreCandidate)throw new Error('请重新选择备份文件。');if(!confirm('确认用这份备份完整替换当前所有记录？'))break;busy=true;restoreCandidate.state.celebrated=[...new Set([...restoreCandidate.state.celebrated,...achievements(restoreCandidate.state).filter(m=>m.done).map(m=>m.id)])];state=await storage.replaceAll(restoreCandidate.state,restoreCandidate.audios);activeReading=null;scheduleSync();restoreCandidate=null;closeRaw();render();notify('回忆已恢复。请回听几段声音，确认都在。');break;}
      case 'install':if(installEvent){await installEvent.prompt();installEvent=null;openSettings();}break;
      case 'update':if(pendingReload){closeRaw();location.reload();}else if(registration?.waiting){closeRaw();registration.waiting.postMessage({type:'SKIP_WAITING'});}break;
      case 'retry':location.reload();break;
    }
  }catch(err){failure(err);}finally{busy=false;}
});

document.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const f=e.target;if(!(f instanceof HTMLFormElement))return;
  if(!f.reportValidity())return;busy=true;const submit=f.querySelector('[type=submit]');submit.disabled=true;
  try {
    const data=new FormData(f);
    if(f.id==='login-form'){
      const {data:result,error}=await client.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});
      if(error)throw cloudError(error);await applySession(result.session);
    }else if(f.id==='book-form'){
      const input=Object.fromEntries(data),id=f.dataset.id||null;
      if(state.books.some(b=>b.id!==id&&b.title===input.title.trim())&&!confirm('书架里有一本同名书，仍要保存这本吗？'))return;
      await mutate((s,timer)=>{saveBook(s,input,id);if(timer&&s.selectedBook&&!timer.bookIds.includes(s.selectedBook))timer.bookIds.push(s.selectedBook);},'书架已更新');closeRaw();
    }else if(f.id==='reading-form'){
      const input={...Object.fromEntries(data),bookIds:data.getAll('bookIds'),source:f.dataset.source,confirmLong:data.has('confirmLong')};
      if(input.timeMode==='clock'){input.startedAt=fromBeijing(input.startedAt);input.endedAt=fromBeijing(input.endedAt);input.minutes=timedMinutes(input.startedAt,input.endedAt);}else{input.startedAt=null;input.endedAt=null;if(input.timeMode==='none')input.minutes=null;}
      await mutate(s=>saveReading(s,input,f.dataset.id,f.dataset.editing==='true'),'这次阅读，已经记下',[],null,f.dataset.timer||null);closeRaw();
    }else if(f.id==='share-form'){
      if(voice?.active||voice?.starting)throw new Error('请先结束录音，再保存。');
      clearTimeout(draftTimer);await draftPending;
      const id=voiceBlob?uid():removeAudio?null:originalAudio?.id||null,adds=voiceBlob?[{id,blob:voiceBlob,duration:voiceDuration}]:[];
      await mutate(s=>saveShare(s,{...Object.fromEntries(data),audioId:id},editingShare),'这一刻，已经好好收藏',adds);closeRaw();
    }else if(f.id==='profile-form'){
      const name=String(data.get('name')).trim(),age=data.get('age')===''?'':Number(data.get('age'));
      if(name.length>30||(age!==''&&(!Number.isInteger(age)||age<1||age>18)))throw new Error('请检查昵称和年龄。');
      await mutate(s=>{s.profile={name,age};},'资料已保存');openSettings();
    }
  }catch(err){failure(err);}finally{busy=false;if(submit.isConnected)submit.disabled=false;}
});
body.addEventListener('input',e=>{
  if(e.target.id==='choose-search'){chooseQuery=e.target.value;renderChooseResults();return;}
  if(modalType==='reading'){const f=$('#reading-form');if(['startedAt','endedAt','minutes'].includes(e.target.name)){f.elements.confirmLong.checked=false;if(e.target.name==='startedAt'&&f.dataset.timer)f.elements.date.value=e.target.value.slice(0,10);}updateReadingForm(f);}
  modalDirty=true;
  if(modalType==='share'){
    const f=$('#share-form');$('#word-count').textContent=`${f.elements.text.value.length}/2000`;
    if(!editingShare){clearTimeout(draftTimer);draftTimer=setTimeout(()=>stashDraft().catch(failure),500);}
  }
});
body.addEventListener('change',async e=>{
  try {
    if(e.target.name==='wordCountMode'){for(const mode of ['exact','range']){const group=$('#word-'+(mode==='exact'?'exact-field':'range-fields'));group.hidden=e.target.value!==mode;group.querySelectorAll('input').forEach(input=>input.disabled=e.target.value!==mode);}}
    if(e.target.name==='status')$('#completion-field').hidden=e.target.value!=='done';
    if(e.target.id==='backup-file'){const file=e.target.files[0];e.target.value='';busy=true;await previewImport(file);}
    if(e.target.id==='conflict-confirm')body.querySelectorAll('[data-action=conflict-remote],[data-action=conflict-local]').forEach(b=>b.disabled=!e.target.checked);
    if(e.target.id==='restore-confirm')body.querySelector('[data-action=restore]').disabled=!e.target.checked;
  }catch(err){failure(err);}finally{busy=false;}
});
sheet.addEventListener('cancel',e=>{e.preventDefault();if(!busy)closeSheet().catch(failure);});
document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause();});},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voice?.stop(true);stopPlayback();if(modalType==='share'&&!editingShare)stashDraft().catch(()=>{});}else{scheduleSync();refreshReadingLocal().catch(failure);if(today()!==lastToday){lastToday=today();render();}}});
window.addEventListener('beforeunload',e=>{if(voice?.active||voiceBlob||modalDirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
window.addEventListener('hashchange',()=>{if(location.hash==='#tonight'){tab='tonight';render();}});

function updateSyncStatus(next){syncStatus=next;document.querySelectorAll('.cloud-banner,[data-cloud-message]').forEach(el=>{el.textContent=next.message;el.dataset.kind=next.kind;});const entry=$('#conflict-entry');if(entry)entry.hidden=next.kind!=='conflict';}
function scheduleSync(dirty=false){clearTimeout(syncTimer);if(!syncer||!user)return;if(dirty===true)updateSyncStatus({kind:navigator.onLine?'pending':'offline',message:navigator.onLine?'已保存在这台设备 · 等待同步':'离线 · 已保存在这台设备'});syncTimer=setTimeout(()=>syncer?.run(),650);}
async function applySession(session){
  const owner=session?.user?.id||null;if(loadedOwner===owner)return;loadedOwner=owner;const epoch=++accountEpoch;
  syncer?.stop();syncer=null;clearTimeout(syncTimer);
  if(modalType==='share'&&!editingShare){const draft=draftFields(),oldStore=storage;if(draft?.text.trim())await oldStore.commit(s=>{s.draft=draft;},[],true,false);}
  if(epoch!==accountEpoch)return;
  closeRaw();stopPlayback();releaseURLs();state=null;activeReading=null;user=session?.user||null;tab='tonight';render();
  if(!owner)return;
  const accountStore=createStore(owner);storage=accountStore;const local=await accountStore.snapshot();if(epoch!==accountEpoch)return;
  state=local.state;activeReading=local.timer;syncStatus={kind:'pending',message:'已登录 · 正在检查同步'};
  syncer=createSync(accountStore,apiFor(owner),{isCurrent:()=>accountEpoch===epoch,canPull:()=>!sheet.open&&!busy,
    changed:async()=>{const nextState=await accountStore.readState();if(accountEpoch===epoch){state=nextState;render();}},status:updateSyncStatus});
  render();scheduleSync();
}
async function logoutFamily(){
  const local=await storage.snapshot();
  if((local.sync.pending||local.sync.generation!==local.sync.synced)&&!confirm('还有未同步的记录。退出后会保留在这台设备，再次登录同一账号后可继续同步。仍要退出吗？'))return;
  busy=true;const {error}=await client.auth.signOut({scope:'local'});if(error)throw cloudError(error);await applySession(null);
}
async function migrateOld(){
  if(!user)throw new Error('请先登录家庭账号。');
  const targetStore=storage,targetUser=user.id;
  const local=await targetStore.snapshot(),api=apiFor(targetUser),remote=await api.read();
  if(remote||hasContent(local.state)||local.sync.pending)throw new Error('当前账号已有记录，不能直接覆盖。请先导出旧记录，再核对需要补充的内容。');
  const old=await createStore().snapshot();if(!hasContent(old.state))throw new Error('这台设备没有可迁入的旧记录。');
  if(storage!==targetStore||user?.id!==targetUser)throw new Error('账号已切换，请重新选择迁移。');
  if(!confirm('把这台设备的旧书架、阅读记录、分享及录音上传到当前家庭账号？原有本地副本会保留。'))return;
  const migrated=await targetStore.replaceAll(old.state,old.audios);if(storage!==targetStore)return;state=migrated;closeRaw();render();scheduleSync(true);notify('已迁入本机账号，正在等待云端同步；原有副本保留。');
}
async function exportConflict(kind){
  const remote=syncer?.conflict;if(!remote||!user)throw new Error('请重新检查同步状态。');
  const epoch=accountEpoch,owner=user.id;conflictBackup??={owner};
  if(kind==='local'){
    const local=await storage.snapshot(),blob=await encodeBackup(local.state,local.audios);if(epoch!==accountEpoch)return;
    download(blob,'阅读小屋-冲突本机备份-'+today()+'.json');Object.assign(conflictBackup,{generation:local.sync.generation,revision:local.state.revision});
  }else{
    const api=apiFor(owner);validateRemote(remote,owner);const audios=[];for(const meta of remote.audios)audios.push(await api.download(meta));
    const blob=await encodeBackup(remote.state,audios);if(epoch!==accountEpoch)return;
    download(blob,'阅读小屋-冲突云端备份-'+today()+'.json');conflictBackup.version=remote.version;
  }
  if($('#conflict-confirm'))$('#conflict-confirm').disabled=!(Number.isSafeInteger(conflictBackup.generation)&&conflictBackup.version);
  notify((kind==='local'?'本机':'云端')+'备份已生成，请确认保存到文件。');
}
setInterval(()=>{const el=$('#reading-clock');if(el&&activeReading)el.textContent=timerText(activeReading);},1000);
setInterval(()=>{if(!document.hidden)refreshReadingLocal().catch(failure);},5000);
window.addEventListener('focus',()=>refreshReadingLocal().catch(failure));
window.addEventListener('online',scheduleSync);
window.addEventListener('offline',()=>{if(user)updateSyncStatus({kind:'offline',message:'离线 · 新记录先保存在这台设备'});});
setInterval(()=>{if(!document.hidden)scheduleSync();},60000);

async function init(){
  try{legacyExists=hasContent((await createStore().snapshot()).state);const {data,error}=await client.auth.getSession();if(error)notify(cloudError(error).message);await applySession(data?.session||null);client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>applySession(session).catch(failure),0);});}catch(e){main.innerHTML='<div class="empty"><h2>小屋暂时打不开</h2><p>浏览器未能打开本地存储。请使用普通浏览模式，确认允许保存站点数据，再重试。</p><button class="primary" data-action="retry">重新打开</button></div>';return;}
  if('serviceWorker' in navigator&&window.isSecureContext){
    try {
      registration=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;offlineReady=true;
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)notify('小屋有新版本了，可在设置中空闲时更新。');});});
      let hadController=!!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController){if(sheet.open||voice?.active||busy){pendingReload=true;notify('新版已准备好，完成当前记录后可在设置中更新。');}else location.reload();}hadController=true;});
    }catch(e){console.warn('离线资源未准备好',e);}
  }
}
init();
