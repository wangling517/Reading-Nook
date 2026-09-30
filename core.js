export const VERSION = 1;
export const uid = () => crypto.randomUUID();
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function emptyState() {
  return {version:VERSION,revision:0,profile:{name:'',age:''},books:[],days:[],shares:[],draft:null,selectedBook:null,celebrated:[],backup:null};
}
export function validDate(value, limit=today()) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0,10)===value && value<=limit && value>='1900-01-01';
}
export function requireDate(value) { if(!validDate(value)) throw new Error('请选择今天或过去的有效日期。'); }
export function minutesValue(value) {
  if(value==='' || value==null) return null;
  const n=Number(value);
  if(!Number.isInteger(n)||n<1||n>1440) throw new Error('时长请填写1—1440之间的整分钟，或留空。');
  return n;
}
export function saveDay(s, input, originalDate=null) {
  requireDate(input.date);
  if(originalDate && originalDate!==input.date && s.days.some(d=>d.date===input.date)) throw new Error('那一天已有阅读记录，请打开那天修改。');
  let item=s.days.find(d=>d.date===(originalDate||input.date));
  const fields={date:input.date,bookIds:[...new Set(input.bookIds||[])],minutes:minutesValue(input.minutes),mode:input.mode||'',updatedAt:new Date().toISOString()};
  if(fields.bookIds.some(id=>!s.books.some(b=>b.id===id))) throw new Error('这本书已发生变化，请重新选择。');
  if(!['','亲子共读','孩子自己读','轮流读'].includes(fields.mode)) throw new Error('请选择有效的阅读方式。');
  if(item) Object.assign(item,fields); else {item={id:uid(),createdAt:fields.updatedAt,...fields};s.days.push(item);}
  return item;
}
export function checkIn(s,date=today()) {
  requireDate(date);
  if(s.days.some(d=>d.date===date)) return false;
  saveDay(s,{date,bookIds:s.books.some(b=>b.id===s.selectedBook&&!b.archived)?[s.selectedBook]:[],minutes:null});
  return true;
}
export function bookWordRange(book) {
  return {min:book?.wordCountMin??book?.wordCount??null,max:book?.wordCountMax??book?.wordCount??null};
}
export function formatBookWords(book) {
  const {min,max}=bookWordRange(book),format=n=>(n/10000).toLocaleString('zh-CN',{maximumFractionDigits:4});
  return min==null?'':min===max?`${format(min)} 万字`:`约 ${format(min)}—${format(max)} 万字`;
}
function wanToCount(value) {
  const text=String(value??'').trim();if(!text)return null;
  const number=Number(text)*10000,rounded=Math.round(number);
  if(!/^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(text)||!Number.isSafeInteger(rounded)||rounded<1)throw new Error('字数按万字填写正数，最多4位小数，例如6.5。');
  return rounded;
}
function wordFields(input,book) {
  let {min,max}=bookWordRange(book);
  if(input.wordCountMode!==undefined){
    if(input.wordCountMode==='unknown'){min=max=null;}
    else if(input.wordCountMode==='exact'){min=max=wanToCount(input.wordCountWan);}
    else if(input.wordCountMode==='range'){
      min=wanToCount(input.wordCountMinWan);max=wanToCount(input.wordCountMaxWan);
      if((min==null)!==(max==null))throw new Error('请填写字数范围的两个数字，或都留空。');
      if(min!==null&&min>max)throw new Error('字数范围的起始值不能大于结束值。');
    }else throw new Error('请选择确定字数、字数范围或暂不清楚。');
  }else if(input.wordCount!==undefined){
    min=max=input.wordCount==null||String(input.wordCount).trim()===''?null:Number(input.wordCount);
    if(min!==null&&(!Number.isSafeInteger(min)||min<1))throw new Error('整本书字数请填写正整数，不清楚可以留空。');
  }
  return {wordCount:min===max?min:null,wordCountMin:min,wordCountMax:max};
}
export function saveBook(s,input,id=null) {
  const title=String(input.title||'').trim();
  if(!title||title.length>120) throw new Error('请填写书名（最多120字）。');
  if(!['want','reading','done'].includes(input.status)) throw new Error('请选择阅读状态。');
  if(input.status==='done') requireDate(input.completedDate);
  let b=s.books.find(x=>x.id===id);
  const fields={title,author:String(input.author||'').trim().slice(0,80),category:String(input.category||'').trim().slice(0,40),...wordFields(input,b),status:input.status,completedDate:input.status==='done'?input.completedDate:null};
  if(id&&!b) throw new Error('这本书已不存在，请重新打开书架。');
  if(b) Object.assign(b,fields); else {b={id:uid(),archived:false,...fields};s.books.push(b);}
  if(!s.selectedBook || b.status==='reading') s.selectedBook=b.id;
  return b;
}
export function saveShare(s,input,id=null) {
  requireDate(input.date);
  const text=String(input.text||'').trim();
  if(text.length>2000) throw new Error('这段话最多2000字，可以分成两条记录。');
  if(!text&&!input.audioId) throw new Error('写一句话，或留下一段声音后再保存。');
  if(input.bookId&&!s.books.some(b=>b.id===input.bookId)) throw new Error('请选择现有书籍，或不关联书。');
  let item=s.shares.find(x=>x.id===id);
  if(id&&!item) throw new Error('这条回忆已不存在，请重新打开。');
  const fields={date:input.date,text,bookId:input.bookId||null,audioId:input.audioId||null,updatedAt:new Date().toISOString()};
  if(item) Object.assign(item,fields);else {item={id:uid(),favorite:false,createdAt:fields.updatedAt,...fields};s.shares.push(item);}
  s.draft=null;
  return item;
}
export function stats(s) {
  return {days:s.days.length,books:s.books.filter(b=>b.status==='done').length,minutes:s.days.reduce((n,d)=>n+(d.minutes||0),0),unknown:s.days.filter(d=>d.minutes==null).length,shares:s.shares.length};
}
export const milestones=[
  {id:'start',name:'启航港',desc:'第一个阅读日',kind:'days',target:1,reward:'勇气小船',story:'小狐狸团团准备了一只纸船。带上你的第一段故事，我们出发吧！',found:'小船扬起了帆。你的第一个故事，已经让探险开始了。'},
  {id:'sprout',name:'风铃树屋',desc:'累计3个阅读日',kind:'days',target:3,reward:'叶子风铃',story:'树屋里藏着一串风铃。每来读一次书，就有一片叶子醒过来。',found:'三片叶子醒过来了。听，风铃在欢迎你来到树屋。'},
  {id:'friend',name:'萤火森林',desc:'累计7个阅读日',kind:'days',target:7,reward:'萤火小灯',story:'森林里的路有一点暗。和故事见面七天，就能点亮一盏萤火小灯。',found:'萤火虫点亮了小路。现在，你也有自己的故事小灯了。'},
  {id:'journey',name:'鲸鱼书湾',desc:'读完第一本书',kind:'books',target:1,reward:'海蓝贝壳',story:'大鲸鱼在等一本完整的故事。读完一本书，它会带来一枚海蓝色的贝壳。',found:'大鲸鱼听完了你的故事，把海蓝贝壳留在了岸边。'},
  {id:'forest',name:'云上营地',desc:'累计15个阅读日',kind:'days',target:15,reward:'云朵望远镜',story:'云上的帐篷已经搭好。带着十五天的故事，用望远镜看看更远的地方。',found:'你走到了云朵上。透过望远镜，还有好多新故事在等你。'},
  {id:'library',name:'星光图书馆',desc:'读完5本不同的书',kind:'books',target:5,reward:'星光钥匙',story:'五本读完的书，会变成打开星光图书馆的钥匙。里面的故事永远读不完。',found:'星光图书馆为你开门了。带着这把钥匙，继续自己的阅读冒险吧。'}
];
export function achievements(s) {const n=stats(s);return milestones.map(m=>({...m,current:n[m.kind],done:n[m.kind]>=m.target}));}
const bounded=(s,n)=>typeof s==='string'&&s.length<=n;
const isID=id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id);
const timestamp=value=>bounded(value,40)&&Number.isFinite(Date.parse(value));
const fail=()=>{throw new Error('备份内容不完整或格式不受支持，原有记录未改变。');};
export function validateState(s,audioIds=[]) {
  if(!s||s.version!==VERSION||!Number.isSafeInteger(s.revision)||s.revision<0||!s.profile||!bounded(s.profile.name,30)||!(s.profile.age===''||(Number.isInteger(s.profile.age)&&s.profile.age>=1&&s.profile.age<=18))) fail();
  if(!['books','days','shares','celebrated'].every(k=>Array.isArray(s[k])&&s[k].length<=50000)) fail();
  const ids=new Set();for(const item of [...s.books,...s.days,...s.shares]) {if(!item||!isID(item.id)||ids.has(item.id)) fail();ids.add(item.id);}
  const bookIds=new Set(s.books.map(b=>b.id)),audioSet=new Set(audioIds),dates=new Set();
  if(audioSet.size!==audioIds.length)fail();
  for(const b of s.books)if(b.wordCount!=null&&(!Number.isSafeInteger(b.wordCount)||b.wordCount<1))fail();
  for(const b of s.books)if(b.wordCountMin!==undefined||b.wordCountMax!==undefined){
    const min=b.wordCountMin,max=b.wordCountMax;
    if(min===null&&max===null){if(b.wordCount!=null)fail();}
    else if(!Number.isSafeInteger(min)||min<1||!Number.isSafeInteger(max)||max<min||b.wordCount!==(min===max?min:null))fail();
  }
  for(const b of s.books) if(!bounded(b.title,120)||!b.title.trim()||!bounded(b.author,80)||!bounded(b.category,40)||typeof b.archived!=='boolean'||!['want','reading','done'].includes(b.status)||(b.status==='done'?!validDate(b.completedDate):b.completedDate!==null)) fail();
  for(const item of [...s.days,...s.shares])if(!timestamp(item.createdAt)||!timestamp(item.updatedAt))fail();
  for(const d of s.days) {
    if(!validDate(d.date)||dates.has(d.date)||!Array.isArray(d.bookIds)||new Set(d.bookIds).size!==d.bookIds.length||d.bookIds.some(id=>!bookIds.has(id))||!(d.minutes===null||(Number.isInteger(d.minutes)&&d.minutes>=1&&d.minutes<=1440))||!['','亲子共读','孩子自己读','轮流读'].includes(d.mode)) fail();
    dates.add(d.date);
  }
  const referenced=new Set();
  for(const x of s.shares) {
    if(!validDate(x.date)||!bounded(x.text,2000)||(!x.text.trim()&&!x.audioId)||typeof x.favorite!=='boolean'||(x.bookId!==null&&!bookIds.has(x.bookId))||(x.audioId!==null&&!audioSet.has(x.audioId))) fail();
    if(x.audioId) {if(referenced.has(x.audioId)) fail();referenced.add(x.audioId);}
  }
  if(referenced.size!==audioSet.size || (s.selectedBook!==null&&!bookIds.has(s.selectedBook)) || s.celebrated.some(id=>!milestones.some(m=>m.id===id))) fail();
  if(s.draft!==null&&(!s.draft||!bounded(s.draft.text,2000)||!validDate(s.draft.date)||(s.draft.bookId!==null&&!bookIds.has(s.draft.bookId)))) fail();
  if(s.backup!==null&&(!s.backup||!timestamp(s.backup.at)||!Number.isSafeInteger(s.backup.revision)||s.backup.revision<0)) fail();
  return true;
}
