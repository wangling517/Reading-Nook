import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,saveDay,saveBook,saveReading,deleteReading,readingEntries,readingSummary,timedMinutes,stats,validateState,filterBooks} from '../core.js';
import {encodeBackup,decodeBackup} from '../backup.js';
test('multiple readings total known minutes but count one day; replay does not add a session',()=>{
  const s=emptyState(),date='2025-01-01';
  for(const [id,minutes] of [['one',15],['two',20],['three',null]])saveReading(s,{date,minutes},id);
  saveReading(s,{date,minutes:15},'one');
  assert.equal(stats(s).days,1);assert.equal(stats(s).minutes,35);assert.equal(stats(s).unknown,1);
  assert.deepEqual(readingSummary(s.days[0]),{count:3,known:2,unknown:1,minutes:35,legacy:false});assert.equal(validateState(s),true);
});
test('old totals remain a historical entry and survive edit, append, move, delete',()=>{
  const s=emptyState();saveDay(s,{date:'2025-01-01',minutes:30});const old=readingEntries(s.days[0])[0];assert.equal(old.source,'legacy');
  saveReading(s,{date:'2025-01-01',minutes:10},'new');assert.equal(stats(s).minutes,40);
  saveReading(s,{date:'2025-01-01',minutes:25},old.id,true);assert.equal(stats(s).minutes,35);
  saveReading(s,{date:'2025-01-02',minutes:12},'new',true);assert.equal(stats(s).days,2);assert.equal(stats(s).minutes,37);
  deleteReading(s,old.id);assert.equal(stats(s).days,1);assert.equal(stats(s).minutes,12);assert.equal(validateState(s),true);
  deleteReading(s,'new');assert.equal(stats(s).days,0);
});
test('invalid writes leave original readings unchanged',()=>{
  const s=emptyState();saveReading(s,{date:'2025-01-01',minutes:1400,confirmLong:true},'one');const before=structuredClone(s);
  for(const input of [{date:'2025-01-01',minutes:100},{date:'2099-01-01',minutes:5},{date:'2025-01-01',minutes:5,bookIds:['missing']}])assert.throws(()=>saveReading(s,input,'two'));
  assert.throws(()=>saveReading(s,{date:'2025-01-01',minutes:1},'missing',true));assert.deepEqual(s,before);
});
test('timer derives elapsed time across midnight and rejects reversed, future and unconfirmed long sessions',()=>{
  assert.equal(timedMinutes('2025-01-01T23:50:00+08:00','2025-01-02T00:15:00+08:00'),25);
  assert.equal(timedMinutes('2025-01-01T20:00:00+08:00','2025-01-01T20:00:10+08:00'),1);
  assert.throws(()=>timedMinutes('2025-01-02T00:15:00+08:00','2025-01-01T23:50:00+08:00'));
  assert.throws(()=>timedMinutes('2099-01-01T20:00:00+08:00','2099-01-01T20:10:00+08:00'));
  const s=emptyState(),input={date:'2025-01-01',startedAt:'2025-01-01T20:00:00+08:00',endedAt:'2025-01-01T23:00:00+08:00',minutes:180,source:'timer'};
  assert.throws(()=>saveReading(s,input,'timer'));saveReading(s,{...input,confirmLong:true},'timer');assert.equal(stats(s).minutes,180);
});
test('sessions round trip through backup; inconsistent totals and duplicate session ids are rejected',async()=>{
  const s=emptyState();saveReading(s,{date:'2025-01-01',minutes:null},'one');saveReading(s,{date:'2025-01-01',minutes:20},'two');
  assert.deepEqual((await decodeBackup(await encodeBackup(s,[]))).state,s);
  const bad=structuredClone(s);bad.days[0].minutes=99;assert.throws(()=>validateState(bad));
  bad.days[0].minutes=20;bad.days[0].readings.push({...bad.days[0].readings[0]});assert.throws(()=>validateState(bad));
});
test('all shelf and case insensitive partial title search exclude archived books',()=>{
  const s=emptyState();saveBook(s,{title:'Magic 校车',status:'want'});saveBook(s,{title:'夏洛的网',status:'reading'});saveBook(s,{title:'校车回家',status:'done',completedDate:'2025-01-01'});
  const b=saveBook(s,{title:'校车旧版',status:'reading'});b.archived=true;
  assert.deepEqual(filterBooks(s.books,'all').map(b=>b.title),['夏洛的网','Magic 校车','校车回家']);
  assert.equal(filterBooks(s.books,'all',' 校车 ').length,2);assert.equal(filterBooks(s.books,'reading','校车').length,0);assert.equal(filterBooks(s.books,'want','magic').length,1);
});
