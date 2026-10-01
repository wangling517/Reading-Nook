import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,saveReading,deleteReading,validateState,validDate,saveDay} from '../core.js';
import {PETS,adoptPet,feedPet,petStage,petBalance,claimReadingStars,buyPetItem,selectPet,validatePets} from '../pets-model.js';
import {encodeBackup,decodeBackup} from '../backup.js';
test('any first pet is free; only recorded duration qualifies, first three then one through five',()=>{
  for(const pet of PETS){const s=emptyState();adoptPet(s,pet.id);assert.equal(petBalance(s.pets),3);assert.equal(s.pets.selected,pet.id);}
  const s=emptyState();adoptPet(s,'bunny');saveReading(s,{date:'2025-01-01',minutes:null},'unknown');assert.equal(claimReadingStars(s),0);
  for(let n=1;n<=6;n++){saveReading(s,{date:'2025-01-01',minutes:10},'read'+n);assert.equal(claimReadingStars(s),n===1?3:n<=5?1:0);assert.equal(claimReadingStars(s),0);}
  assert.equal(petBalance(s.pets),10);saveReading(s,{date:'2025-01-02',minutes:5},'tomorrow');assert.equal(claimReadingStars(s),3);
});
test('feed spends once, grows at three and nine, never starves or overspends',()=>{
  const s=emptyState();adoptPet(s,'phoenix');for(let n=0;n<3;n++)feedPet(s,'phoenix','bite'+n);assert.equal(petStage(s.pets.owned[0].feeds.length),1);assert.equal(petBalance(s.pets),0);assert.equal(feedPet(s,'phoenix','bite0'),false);assert.throws(()=>feedPet(s,'phoenix','extra'));
  for(const date of ['2025-01-01','2025-01-02'])saveReading(s,{date,minutes:10},date);claimReadingStars(s);for(let n=3;n<9;n++)feedPet(s,'phoenix','bite'+n);assert.equal(petStage(s.pets.owned[0].feeds.length),2);assert.equal(validatePets(s.pets,validDate),true);
});
test('adoption and decoration costs are deterministic and repeat purchases free',()=>{
  const s=emptyState();for(let n=1;n<=8;n++)saveReading(s,{date:`2025-01-0${n}`,minutes:10},'r'+n);adoptPet(s,'cat');assert.equal(petBalance(s.pets),27);adoptPet(s,'dog');assert.equal(petBalance(s.pets),21);adoptPet(s,'dog');assert.equal(petBalance(s.pets),21);selectPet(s,'cat');
  buyPetItem(s,'garden');buyPetItem(s,'heart-rug');assert.equal(petBalance(s.pets),12);buyPetItem(s,'garden');assert.equal(petBalance(s.pets),12);assert.equal(s.pets.equipped.scene,'garden');assert.equal(validatePets(s.pets,validDate),true);
});
test('pet progress and reward ledger survive backups; tampered pets refused',async()=>{
  const s=emptyState();adoptPet(s,'monkey');feedPet(s,'monkey','first');assert.deepEqual((await decodeBackup(await encodeBackup(s,[]))).state,s);
  for(const alter of [p=>p.owned.push({...p.owned[0]}),p=>p.rewardedDates.push('2099-01-01'),p=>p.equipped.scene='sky',p=>p.owned[0].feeds.push('first'),p=>p.owned[0].feeds.push('a','b','c','d')]){const copy=structuredClone(s);alter(copy.pets);assert.throws(()=>validateState(copy));}
  assert.equal(validateState(emptyState()),true);
});
test('adding duration awards once; edits, date moves and deleted awarded IDs do not repeat rewards',()=>{
  const s=emptyState();adoptPet(s,'bunny');const put=(date,minutes,editing=false)=>saveReading(s,{date,minutes},'stable',editing);
  put('2025-01-01',null);assert.equal(claimReadingStars(s),0);put('2025-01-01',10,true);assert.equal(claimReadingStars(s),3);
  put('2025-01-01',20,true);assert.equal(claimReadingStars(s),0);put('2025-01-02',20,true);assert.equal(claimReadingStars(s),0);
  put('2025-01-02',null,true);assert.equal(claimReadingStars(s),0);put('2025-01-02',20,true);assert.equal(claimReadingStars(s),0);
  deleteReading(s,'stable');assert.equal(claimReadingStars(s),0);put('2025-01-01',10);assert.equal(claimReadingStars(s),0);
  for(let n=0;n<7;n++){saveReading(s,{date:'2025-01-01',minutes:5},'new'+n);claimReadingStars(s);}
  assert.equal(petBalance(s.pets),10);
});
test('legacy daily stars are retained and topped up to seven without double-paying the first tier',async()=>{
  const s=emptyState();adoptPet(s,'dog');s.pets.version=1;delete s.pets.readingRewards;s.pets.rewardedDates=['2025-01-01','2025-01-02'];
  for(let n=0;n<6;n++)saveReading(s,{date:'2025-01-01',minutes:10},'legacy'+n);
  s.pets.owned[0].feeds=Array.from({length:9},(_,n)=>'spent'+n);assert.equal(petBalance(s.pets),0);assert.equal(validateState(s),true);
  assert.equal(claimReadingStars(s),4);assert.equal(petBalance(s.pets),4);assert.equal(s.pets.version,2);assert.equal(claimReadingStars(s),0);
  assert.deepEqual((await decodeBackup(await encodeBackup(s,[]))).state,s);
  for(const modify of [p=>p.readingRewards[0].ids.push('six'),p=>p.readingRewards.push({...p.readingRewards[0]}),p=>p.readingRewards.push({date:'2025-01-03',ids:['legacy0']}),p=>p.readingRewards[0].date='2099-01-01',p=>p.readingRewards[0].ids=[],p=>p.version=3]){const copy=structuredClone(s);modify(copy.pets);assert.throws(()=>validateState(copy));}
});
test('a historical day total counts as one reading, and its ID survives conversion to sessions',()=>{
  const s=emptyState();saveDay(s,{date:'2025-01-01',minutes:40});adoptPet(s,'cat');assert.equal(petBalance(s.pets),6);
  saveReading(s,{date:'2025-01-01',minutes:10},'new-session');assert.equal(claimReadingStars(s),1);assert.equal(petBalance(s.pets),7);
});
