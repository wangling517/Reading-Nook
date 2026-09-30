import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../core.js';
import {syncDecision,cloudState,audioManifest,validateRemote} from '../sync-model.js';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const base=()=>({generation:3,synced:3,version:2,pending:null});
test('sync distinguishes pull, dirty push and concurrent changes without overwriting',()=>{
  assert.equal(syncDecision(base(),{version:3}),'pull');
  assert.equal(syncDecision({...base(),generation:4},{version:2}),'push');
  assert.equal(syncDecision({...base(),generation:4},{version:3}),'conflict');
  assert.equal(syncDecision(base(),null),'missing');
  assert.equal(syncDecision({generation:0,synced:0,version:0,pending:null},null),'idle');
});
test('a lost reply is acknowledged by operation id even with newer local edits',()=>{
  const sync={...base(),generation:5,pending:{operation:'retry-1',generation:4,version:2}};
  assert.equal(syncDecision(sync,{version:3,operation_id:'retry-1'}),'acknowledge');
  assert.equal(syncDecision(sync,{version:3,operation_id:'other'}),'conflict');
});
test('local drafts, backup metadata and device revision are not cloud data',()=>{
  const local=emptyState();local.draft={text:'private draft'};local.backup={at:'today'};local.revision=19;
  const remote=cloudState(local);assert.equal(remote.draft,null);assert.equal(remote.backup,null);assert.equal(remote.revision,0);assert.equal(local.draft.text,'private draft');
});
test('audio manifests use immutable content hashes and enforce owner prefix',async()=>{
  const blob=new Blob(['synthetic audio'],{type:'audio/webm'});
  const list=await audioManifest([{id:'test-audio',duration:1,blob}],owner);
  assert.equal(list[0].bytes,blob.size);assert.match(list[0].path,new RegExp('^'+owner+'/[a-f0-9]{64}$'));
  assert.deepEqual(await audioManifest([{id:'test-audio',duration:1,blob}],owner),list);
  const remote={user_id:owner,version:1,state:emptyState(),audios:[]};assert.equal(validateRemote(remote,owner),remote);
  assert.throws(()=>validateRemote({...remote,user_id:'other'},owner));
  assert.throws(()=>validateRemote({...remote,audios:[{...list[0],path:'someone-else/file'}]},owner));
  await assert.rejects(audioManifest([{id:'x',duration:1,blob:new Blob([],{type:'audio/webm'})}],owner));
});
