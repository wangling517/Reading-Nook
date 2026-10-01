import {today,readingEntries,readingSummary,timedMinutes} from './core.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const beijingInput=value=>new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,19);
export const fromBeijing=value=>new Date(value+'+08:00').toISOString();
export function summaryText(day){
  const n=readingSummary(day);return `${n.legacy?`${n.count}条记录（含历史总量）`:`读了${n.count}次`} · ${n.known?`已记录${n.minutes}分钟`:'未记录时长'}${n.unknown&&n.known?` · ${n.unknown}次未记时长`:''}`;
}
export function timerText(timer){
  const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(timer.startedAt))/1000)),hours=Math.floor(seconds/3600);
  return `${hours?String(hours).padStart(2,'0')+':':''}${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
export function readingControls(day,timer){return `${timer?`<section class="reading-timer"><div class="label-row"><span class="timer-label">● 阅读进行中</span><button class="text-btn" data-action="cancel-reading">取消计时</button></div><div class="timer-digits" id="reading-clock" aria-label="本次经过时间">${timerText(timer)}</div><p class="small muted">开始于 ${beijingInput(timer.startedAt).replace('T',' ').slice(0,16)} · 北京时间</p><p class="timer-hint">回来后确认时长，这段时光才会记入。</p><button class="primary" data-action="finish-reading">结束阅读 · 确认时间</button></section>`:`<button class="primary" data-action="start-reading">${day?'再读一会儿':'开始今日阅读'} <span aria-hidden="true">↗</span></button><button class="reading-quick text-btn" data-action="checkin">读过了，记一下 <span>时长选填</span></button>`}${day?`<button class="today-reading" data-action="edit-today"><span><strong>今天的阅读</strong><small>${summaryText(day)}</small></span><span aria-hidden="true">›</span></button>`:'<p class="after-cta">不计时，也可以留下今天读过的足迹。</p>'}`;}
export function readingsView(day,bookName){return `<p class="notice">${summaryText(day)}</p><div class="reading-list">${readingEntries(day).map((r,i)=>`<article class="reading-entry"><div class="label-row"><h3>${r.source==='legacy'?'历史阅读记录':`第${i+1}次阅读`}</h3><button class="text-btn" data-action="edit-reading" data-id="${r.id}">编辑</button></div><p>${r.minutes===null?'未记录时长':`${r.minutes}分钟`}${r.mode?' · '+esc(r.mode):''}</p>${r.startedAt?`<p class="small muted">${beijingInput(r.startedAt).replace('T',' ').slice(0,16)} — ${beijingInput(r.endedAt).replace('T',' ').slice(0,16)}</p>`:''}<p class="small muted">${r.bookIds.length?r.bookIds.map(id=>esc(bookName(id))).join('、'):'未关联书籍'}</p>${r.source==='legacy'?'<p class="small muted">保留旧版当天总量，不代表当时只读了一次。</p>':''}</article>`).join('')}</div><button class="secondary reading-add" data-action="add-reading" data-date="${day.date}">＋ 再记一次阅读</button>`;}
export function readingForm({entry,date,timer,books,selectedBook,id}){
  const start=entry?.startedAt||timer?.startedAt||null,end=entry?.endedAt||(timer?new Date().toISOString():null),mode=start?'clock':entry?.minutes!=null?'minutes':'none';
  const selected=entry?.bookIds||timer?.bookIds||(selectedBook?[selectedBook]:[]);
  return `<form id="reading-form" data-id="${id}" data-editing="${!!entry}" data-timer="${timer?.id||''}" data-source="${entry?.source||(timer?'timer':'manual')}">
  ${timer?'<p class="notice">忘记结束了？修改实际结束时间即可。想不起来，也可以只记读过。</p>':entry?.source==='legacy'?'<p class="notice">这是旧版保存的当天总量。修改会替换这条历史记录。</p>':'<p class="small muted">每一次阅读都值得留下。时间不记，也很好。</p>'}
  <label class="field"><span>阅读日期</span><input type="date" name="date" min="1900-01-01" max="${today()}" value="${date}" required></label>
  <div class="reading-modes" role="group" aria-label="记录时长方式">${[['clock','起止时间'],['minutes','大约分钟'],['none','不记时长']].map(([key,label])=>`<button type="button" data-action="reading-mode" data-mode="${key}" aria-pressed="${key===mode}">${label}</button>`).join('')}</div><input type="hidden" name="timeMode" value="${mode}">
  <div id="reading-times"><label class="field"><span>开始时间 <em>北京时间</em></span><input type="datetime-local" name="startedAt" step="1" value="${start?beijingInput(start):date+'T20:00:00'}" required></label><label class="field"><span>实际结束时间 <em>可以修改</em></span><input type="datetime-local" name="endedAt" step="1" value="${end?beijingInput(end):''}" required></label></div>
  <div id="reading-minutes"><label class="field"><span>这一次大约读了多久 <em>分钟</em></span><input type="number" name="minutes" inputmode="numeric" min="1" max="1440" step="1" value="${entry?.minutes??''}" placeholder="例如：20" required></label><div class="choices">${[5,10,20,30,60].map(n=>`<button class="choice" type="button" data-action="reading-minutes" data-value="${n}">${n}分钟</button>`).join('')}</div></div>
  <p class="reading-estimate" id="reading-estimate" role="status"></p><label class="check-row reading-long" id="reading-long"><input type="checkbox" name="confirmLong">这次超过2小时，我已核对实际时长</label>
  <label class="field"><span>怎么读的 <em>选填</em></span><select name="mode">${['','亲子共读','孩子自己读','轮流读'].map(v=>`<option value="${v}" ${entry?.mode===v?'selected':''}>${v||'暂不填写'}</option>`).join('')}</select></label>
  <details class="reading-books"><summary>这次读的书 · 可选多本</summary><div>${books.filter(b=>!b.archived||selected.includes(b.id)).map(b=>`<label class="check-row"><input type="checkbox" name="bookIds" value="${b.id}" ${selected.includes(b.id)?'checked':''}>${esc(b.title)}</label>`).join('')||'<p class="small muted">还没有添加书籍，也可以直接记录。</p>'}</div></details>
  <p class="form-error" role="alert"></p><button class="primary reading-save" type="submit">${entry?'保存修改':'保存这次阅读'}</button>${entry?`<button class="danger danger-link" type="button" data-action="delete-reading" data-id="${entry.id}">删除这次阅读</button>`:''}</form>`;
}
export function updateReadingForm(form){
  const mode=form.elements.timeMode.value;
  for(const [id,visible] of [['reading-times',mode==='clock'],['reading-minutes',mode==='minutes']]){const el=form.querySelector('#'+id);el.hidden=!visible;el.querySelectorAll('input').forEach(input=>input.disabled=!visible);}
  form.querySelectorAll('[data-action=reading-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));
  let minutes=null,message='只记读过，本次不计入分钟数，也不奖励星星。';
  try{if(mode==='clock'){minutes=timedMinutes(fromBeijing(form.elements.startedAt.value),fromBeijing(form.elements.endedAt.value));message=`本次 ${minutes} 分钟 · 保存后计入当天`;}else if(mode==='minutes'){minutes=Number(form.elements.minutes.value)||null;message=minutes?`本次 ${minutes} 分钟`:'填一个大约的分钟数就好。';}}catch(e){message=e.message==='Invalid time value'?'请填写完整的开始和结束时间。':e.message;}
  form.querySelector('#reading-estimate').textContent=message;
  const long=minutes>120,checkbox=form.elements.confirmLong;form.querySelector('#reading-long').hidden=!long;checkbox.disabled=!long;checkbox.required=long;
}
