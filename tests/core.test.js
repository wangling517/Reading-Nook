import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,checkIn,saveDay,saveBook,saveShare,stats,achievements,validateState,today,minutesValue,validDate,bookWordRange,formatBookWords} from '../core.js';
test('one reading day per date, unknown time remains unknown',()=>{
  const s=emptyState();assert.equal(checkIn(s),true);assert.equal(checkIn(s),false);
  assert.equal(s.days.length,1);assert.equal(s.days[0].minutes,null);assert.equal(stats(s).unknown,1);
  assert.equal(validateState(s),true);
});
test('updating minutes replaces daily total and a move cannot overwrite another day',()=>{
  const s=emptyState();saveDay(s,{date:'2025-01-01',minutes:20});saveDay(s,{date:'2025-01-01',minutes:30});saveDay(s,{date:'2025-01-02',minutes:10});
  assert.equal(stats(s).minutes,40);assert.throws(()=>saveDay(s,{date:'2025-01-02',minutes:50},'2025-01-01'));
  assert.equal(stats(s).minutes,40);assert.throws(()=>minutesValue(0));assert.throws(()=>minutesValue(1.2));assert.throws(()=>minutesValue(1441));
});
test('sharing alone does not add reading, changing share date leaves reading unchanged',()=>{
  const s=emptyState();const x=saveShare(s,{date:'2025-01-01',text:'为什么月亮会跟着我？'});assert.equal(stats(s).days,0);assert.equal(achievements(s).some(m=>m.done),false);
  checkIn(s,'2025-01-01');saveShare(s,{date:'2025-01-02',text:'我想再听一遍'},x.id);assert.equal(s.days[0].date,'2025-01-01');assert.equal(s.shares.length,1);
});
test('finishing the same book is idempotent, archive retains completed history',()=>{
  const s=emptyState();const b=saveBook(s,{title:'夏洛的网',status:'done',completedDate:'2025-01-01'});
  saveBook(s,{title:b.title,status:'reading'},b.id);assert.equal(stats(s).books,0);
  saveBook(s,{title:b.title,status:'done',completedDate:'2025-01-02'},b.id);b.archived=true;assert.equal(stats(s).books,1);
  assert.equal(achievements(s).find(m=>m.id==='journey').done,true);assert.equal(validateState(s),true);
});
test('seven nonconsecutive reading days unlock milestone, deletion recomputes evidence',()=>{
  const s=emptyState();for(let i=1;i<=13;i+=2)checkIn(s,`2025-01-${String(i).padStart(2,'0')}`);
  assert.equal(achievements(s).find(m=>m.id==='friend').done,true);
  s.days.pop();assert.equal(achievements(s).find(m=>m.id==='friend').done,false);
});
test('invalid/future dates and dangling references are rejected',()=>{
  assert.equal(validDate('2025-02-30'),false);assert.equal(validDate('2099-01-01'),false);assert.equal(validDate(today()),true);
  const s=emptyState();assert.throws(()=>saveDay(s,{date:today(),bookIds:['missing']}));assert.throws(()=>saveShare(s,{date:today(),text:' '}));
  checkIn(s);s.days.push({...s.days[0],id:crypto.randomUUID()});assert.throws(()=>validateState(s));
});
test('book word count is optional, editable and never becomes reading progress',()=>{
  const s=emptyState();const input={title:'测试书',status:'reading',wordCount:'60000'};
  const b=saveBook(s,input);assert.equal(b.wordCount,60000);assert.equal(stats(s).days,0);assert.equal(stats(s).minutes,0);
  saveBook(s,{...input,wordCount:'85000'},b.id);assert.equal(b.wordCount,85000);
  saveBook(s,{title:input.title,status:'done',completedDate:today()},b.id);assert.equal(b.wordCount,85000);
  saveBook(s,{...input,wordCount:''},b.id);assert.equal(b.wordCount,null);assert.equal(validateState(s),true);
  for(const value of ['-1','0','12.5','不清楚','9007199254740992'])assert.throws(()=>saveBook(s,{...input,wordCount:value},b.id),/字数/);
  assert.equal(b.wordCount,null);
});
test('wan units preserve exact counts, ranges remain ranges without an invented average',()=>{
  const s=emptyState(),input={title:'测试书',status:'reading'};
  const b=saveBook(s,{...input,wordCountMode:'exact',wordCountWan:'6.5'});
  assert.equal(b.wordCount,65000);assert.equal(formatBookWords(b),'6.5 万字');
  saveBook(s,{...input,wordCountMode:'range',wordCountMinWan:'5',wordCountMaxWan:'8'},b.id);
  assert.equal(b.wordCount,null);assert.deepEqual(bookWordRange(b),{min:50000,max:80000});assert.equal(formatBookWords(b),'约 5—8 万字');
  assert.equal(validateState(s),true);saveBook(s,{...input,wordCountMode:'unknown'},b.id);assert.equal(formatBookWords(b),'');
  assert.equal(formatBookWords({wordCount:65432}),'6.5432 万字');
});
test('inverted and partial ranges fail before altering saved book',()=>{
  const s=emptyState(),base={title:'测试书',status:'want'};const b=saveBook(s,{...base,wordCountMode:'range',wordCountMinWan:'4',wordCountMaxWan:'7'});
  const before=structuredClone(b);
  for(const pair of [['8','5'],['','5'],['5',''],['-1','2'],['1.00001','2']])assert.throws(()=>saveBook(s,{...base,wordCountMode:'range',wordCountMinWan:pair[0],wordCountMaxWan:pair[1]},b.id));
  assert.deepEqual(b,before);assert.equal(stats(s).days,0);assert.equal(stats(s).minutes,0);
});
