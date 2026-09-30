import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeBackup,decodeBackup} from '../backup.js';
import {emptyState,saveShare,checkIn,saveBook} from '../core.js';
test('three audio files and metadata survive backup byte for byte',async()=>{
  const state=emptyState(),audios=[];checkIn(state);
  for(let i=0;i<3;i++){const id=crypto.randomUUID();audios.push({id,blob:new Blob([new Uint8Array([0,255,20,i,45,0,92])],{type:'audio/webm;codecs=opus'}),duration:i+1});saveShare(state,{date:'2025-01-01',text:`原话${i}`,audioId:id});}
  state.draft={date:'2025-01-02',text:'还没说完的话',bookId:null};state.shares[1].favorite=true;
  const file=await encodeBackup(state,audios),out=await decodeBackup(file);
  assert.deepEqual(out.state,state);assert.equal(out.audios.length,3);
  for(let i=0;i<3;i++)assert.deepEqual(await out.audios[i].blob.arrayBuffer(),await audios[i].blob.arrayBuffer());
});
test('corrupt backup and unsupported schema cannot enter restore',async()=>{
  const blob=await encodeBackup(emptyState(),[]),obj=JSON.parse(await blob.text());obj.payload.state.profile.name='altered';
  await assert.rejects(()=>decodeBackup(new Blob([JSON.stringify(obj)])),/校验/);
  await assert.rejects(()=>decodeBackup(new Blob(['invalid'])),/有效/);
  obj.version=9;await assert.rejects(()=>decodeBackup(new Blob([JSON.stringify(obj)])),/版本/);
});
test('missing audio and duplicate IDs are refused at export boundary',async()=>{
  const s=emptyState();saveShare(s,{date:'2025-01-01',text:'',audioId:'missing'});await assert.rejects(()=>encodeBackup(s,[]));
  const other=emptyState();checkIn(other);other.days.push({...other.days[0]});await assert.rejects(()=>encodeBackup(other,[]));
});
test('larger audio backup validates without regular-expression stack overflow',async()=>{
  const s=emptyState(),id=crypto.randomUUID(),bytes=new Uint8Array(400000).fill(255);
  saveShare(s,{date:'2025-01-01',text:'长一点的声音',audioId:id});
  const out=await decodeBackup(await encodeBackup(s,[{id,blob:new Blob([bytes],{type:'audio/mp4'}),duration:90}]));
  assert.equal(out.audios[0].blob.size,400000);
});
test('word counts survive backup; legacy books without counts still restore',async()=>{
  const s=emptyState();const b=saveBook(s,{title:'测试书',status:'want',wordCount:'60000'});
  assert.equal((await decodeBackup(await encodeBackup(s,[]))).state.books[0].wordCount,60000);
  delete b.wordCountMin;delete b.wordCountMax;
  assert.equal((await decodeBackup(await encodeBackup(s,[]))).state.books[0].wordCount,60000);
  delete b.wordCount;assert.equal((await decodeBackup(await encodeBackup(s,[]))).state.books[0].title,'测试书');
  for(const invalid of [-1,0,1.5,'60000']){b.wordCount=invalid;await assert.rejects(()=>encodeBackup(s,[]));}
});
test('word count ranges survive backup and malformed ranges are rejected',async()=>{
  const s=emptyState(),b=saveBook(s,{title:'范围测试',status:'reading',wordCountMode:'range',wordCountMinWan:'5.5',wordCountMaxWan:'8'});
  const out=await decodeBackup(await encodeBackup(s,[]));assert.equal(out.state.books[0].wordCountMin,55000);assert.equal(out.state.books[0].wordCountMax,80000);assert.equal(out.state.books[0].wordCount,null);
  b.wordCountMax=30000;await assert.rejects(()=>encodeBackup(s,[]));
});
