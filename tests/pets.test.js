import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,saveReading,validateState,validDate} from '../core.js';
import {PETS,adoptPet,feedPet,petStage,petBalance,claimReadingStars,buyPetItem,selectPet,validatePets} from '../pets-model.js';
import {encodeBackup,decodeBackup} from '../backup.js';
test('any first pet is free; reading without minutes earns once per date',()=>{
  for(const pet of PETS){const s=emptyState();adoptPet(s,pet.id);assert.equal(petBalance(s.pets),3);assert.equal(s.pets.selected,pet.id);}
  const s=emptyState();adoptPet(s,'bunny');saveReading(s,{date:'2025-01-01',minutes:null},'one');assert.equal(claimReadingStars(s),3);
  saveReading(s,{date:'2025-01-01',minutes:20},'two');assert.equal(claimReadingStars(s),0);s.days=[];assert.equal(claimReadingStars(s),0);saveReading(s,{date:'2025-01-01',minutes:10},'three');assert.equal(claimReadingStars(s),0);assert.equal(petBalance(s.pets),6);
});
test('feed spends once, grows at three and nine, never starves or overspends',()=>{
  const s=emptyState();adoptPet(s,'phoenix');for(let n=0;n<3;n++)feedPet(s,'phoenix','bite'+n);assert.equal(petStage(s.pets.owned[0].feeds.length),1);assert.equal(petBalance(s.pets),0);assert.equal(feedPet(s,'phoenix','bite0'),false);assert.throws(()=>feedPet(s,'phoenix','extra'));
  for(const date of ['2025-01-01','2025-01-02'])saveReading(s,{date,minutes:null},date);claimReadingStars(s);for(let n=3;n<9;n++)feedPet(s,'phoenix','bite'+n);assert.equal(petStage(s.pets.owned[0].feeds.length),2);assert.equal(validatePets(s.pets,validDate),true);
});
test('adoption and decoration costs are deterministic and repeat purchases free',()=>{
  const s=emptyState();for(let n=1;n<=8;n++)saveReading(s,{date:`2025-01-0${n}`,minutes:null},'r'+n);adoptPet(s,'cat');assert.equal(petBalance(s.pets),27);adoptPet(s,'dog');assert.equal(petBalance(s.pets),21);adoptPet(s,'dog');assert.equal(petBalance(s.pets),21);selectPet(s,'cat');
  buyPetItem(s,'garden');buyPetItem(s,'heart-rug');assert.equal(petBalance(s.pets),12);buyPetItem(s,'garden');assert.equal(petBalance(s.pets),12);assert.equal(s.pets.equipped.scene,'garden');assert.equal(validatePets(s.pets,validDate),true);
});
test('pet progress and reward ledger survive backups; tampered pets refused',async()=>{
  const s=emptyState();adoptPet(s,'monkey');feedPet(s,'monkey','first');assert.deepEqual((await decodeBackup(await encodeBackup(s,[]))).state,s);
  for(const alter of [p=>p.owned.push({...p.owned[0]}),p=>p.rewardedDates.push('2099-01-01'),p=>p.equipped.scene='sky',p=>p.owned[0].feeds.push('first'),p=>p.owned[0].feeds.push('a','b','c','d')]){const copy=structuredClone(s);alter(copy.pets);assert.throws(()=>validateState(copy));}
  assert.equal(validateState(emptyState()),true);
});
