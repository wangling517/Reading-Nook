export const PETS=[
  {id:'bunny',name:'棉棉',kind:'小兔子',food:'胡萝卜',color:'#e9bbd0',stages:['团子幼兔','长耳朵兔','花园小兔'],words:['咔嚓，今天的胡萝卜好甜呀！','想和你一起听下一段故事。']},
  {id:'cat',name:'奶糖',kind:'小猫咪',food:'小鱼餐',color:'#d9c7ec',stages:['奶团幼猫','软爪小猫','月亮长毛猫'],words:['喵呜，吃饱了，蹭蹭你。','给你留了一个暖暖的位置。']},
  {id:'dog',name:'布丁',kind:'小狗',food:'骨头饼干',color:'#e9c299',stages:['布丁幼犬','垂耳小狗','卷尾小伙伴'],words:['汪！尾巴已经开心地摇起来啦。','今天也想陪在你身边。']},
  {id:'monkey',name:'桃桃',kind:'小猴子',food:'香蕉',color:'#d7af99',stages:['桃子幼猴','灵巧小猴','森林小伙伴'],words:['啊呜，香蕉分你一半！','我在树枝上，等你的新故事。']},
  {id:'phoenix',name:'啾啾',kind:'小凤凰',food:'星星果',color:'#eda8be',stages:['绒绒小鸟','彩羽小凤凰','流光凤凰'],words:['啾！羽毛里亮起了一颗小星星。','下次一起飞到云朵上吧。']}
];
export const PET_ITEMS=[
  {id:'garden',name:'草莓花园',type:'scene',cost:6,desc:'花朵、草莓和柔软的草地'},
  {id:'sky',name:'星糖夜空',type:'scene',cost:8,desc:'在云朵上，看看弯弯的月亮'},
  {id:'heart-rug',name:'爱心地毯',type:'rug',cost:3,desc:'一块软软的草莓色小地毯'},
  {id:'flower-bowl',name:'小花餐碗',type:'bowl',cost:3,desc:'每一餐，都开着一朵小花'}
];
const createPets=()=>({version:1,selected:null,owned:[],rewardedDates:[],items:[],equipped:{scene:'room',rug:'basic',bowl:'basic'}});
export function claimReadingStars(state){
  if(!state.pets)return 0;const dates=new Set(state.pets.rewardedDates),before=dates.size;
  for(const day of state.days)dates.add(day.date);state.pets.rewardedDates=[...dates].sort();return (dates.size-before)*3;
}
function ensure(state){state.pets??=createPets();claimReadingStars(state);return state.pets;}
export function petStage(feeds){return feeds>=9?2:feeds>=3?1:0;}
export function petBalance(pets){if(!pets)return 3;return 3+pets.rewardedDates.length*3-Math.max(0,pets.owned.length-1)*6-pets.owned.reduce((sum,p)=>sum+p.feeds.length,0)-pets.items.reduce((sum,id)=>sum+(PET_ITEMS.find(i=>i.id===id)?.cost||0),0);}
export function petSnapshot(state){const p=structuredClone(state.pets||createPets());const virtual={pets:p,days:state.days};claimReadingStars(virtual);return {...p,balance:petBalance(p)};}
export function adoptPet(state,id){
  if(!PETS.some(p=>p.id===id))throw new Error('这位小伙伴还不存在。');
  const p=ensure(state);if(p.owned.some(p=>p.id===id)){p.selected=id;return;}
  if(p.owned.length&&petBalance(p)<6)throw new Error('还需要攒一点星星，读过书再来接它吧。');
  p.owned.push({id,feeds:[]});p.selected=id;
}
export function selectPet(state,id){const p=ensure(state);if(!p.owned.some(p=>p.id===id))throw new Error('先把这位小伙伴接回家吧。');p.selected=id;}
export function feedPet(state,id,operation){
  if(typeof operation!=='string'||!/^[-\w]{1,80}$/.test(operation))throw new Error('请重新试着喂一口。');
  const p=ensure(state),pet=p.owned.find(x=>x.id===id);if(!pet)throw new Error('先选择一位小伙伴吧。');
  if(p.owned.some(x=>x.feeds.includes(operation)))return false;
  if(petBalance(p)<1)throw new Error('星星用完啦。记下今天读过的书，就有新的星星。');
  pet.feeds.push(operation);return true;
}
export function buyPetItem(state,id){
  const item=PET_ITEMS.find(i=>i.id===id);if(!item)throw new Error('这件物品还不存在。');
  const p=ensure(state);if(!p.owned.length)throw new Error('先接一位小伙伴回家吧。');
  if(!p.items.includes(id)){if(petBalance(p)<item.cost)throw new Error('星星还不够，先把喜欢的东西记在心里吧。');p.items.push(id);}
  p.equipped[item.type]=id;
}
export function resetPetItem(state,type){if(!['scene','rug','bowl'].includes(type))throw new Error('无法更换这件物品。');ensure(state).equipped[type]=type==='scene'?'room':'basic';}
export function validatePets(p,validDate){
  if(p===undefined)return true;
  const bad=()=>{throw new Error('宠物记录不完整或格式不正确，原有记录未改变。');};
  if(!p||p.version!==1||!Array.isArray(p.owned)||p.owned.length>PETS.length||!Array.isArray(p.rewardedDates)||p.rewardedDates.length>50000||new Set(p.rewardedDates).size!==p.rewardedDates.length||p.rewardedDates.some(d=>!validDate(d))||!Array.isArray(p.items)||new Set(p.items).size!==p.items.length||p.items.some(id=>!PET_ITEMS.some(i=>i.id===id)))bad();
  const ids=new Set(),feeds=new Set();for(const pet of p.owned){if(!pet||!PETS.some(x=>x.id===pet.id)||ids.has(pet.id)||!Array.isArray(pet.feeds)||pet.feeds.length>150003)bad();ids.add(pet.id);for(const id of pet.feeds){if(typeof id!=='string'||!/^[-\w]{1,80}$/.test(id)||feeds.has(id))bad();feeds.add(id);}}
  if((p.owned.length?!ids.has(p.selected):p.selected!==null||p.items.length>0)||!p.equipped||petBalance(p)<0)bad();
  for(const type of ['scene','rug','bowl']){const id=p.equipped[type];if(id!==(type==='scene'?'room':'basic')&&(!p.items.includes(id)||!PET_ITEMS.some(i=>i.id===id&&i.type===type)))bad();}
  return true;
}
