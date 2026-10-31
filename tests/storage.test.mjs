import test from 'node:test';
import assert from 'node:assert/strict';
import {documentFor,importDocument} from '../public/document.js';
import {DriveStore,ConflictError} from '../public/drive.js';
test('imports validate schema, preserve text and reject duplicate IDs and invalid data',()=>{
  const t={id:'a',title:'Darbs <b>',description:'Mana piezīme',date:'2026-10-31',hue:125,order:0,status:'new',priority:'normal',comments:[]};
  assert.deepEqual(importDocument(JSON.stringify([t])).tasks,[t]);
  assert.throws(()=>importDocument('{bad'));
  assert.throws(()=>importDocument(JSON.stringify({schemaVersion:2,tasks:[]})));
  assert.throws(()=>documentFor([t,t]));assert.throws(()=>documentFor([{...t,date:'2026-02-31'}]));
  assert.throws(()=>documentFor([{...t,comments:[{status:'new',comment:'x',at:'invalid'}]}]));
});
test('remote version mismatch rejects stale saves without uploading',async()=>{
  const remote=documentFor([]);let uploads=0;
  const store=new DriveStore({request:async(url,options)=>{if(options){uploads++;}return url.includes('alt=media')?remote:{id:'f',version:'2'};}});store.fileId='f';
  await assert.rejects(()=>store.save(documentFor([]),'1'),ConflictError);assert.equal(uploads,0);
});
test('lost upload acknowledgement reconciles the same write without a duplicate upload',async()=>{
  const remote=documentFor([]);let uploads=0;
  const store=new DriveStore({request:async(url,options)=>{if(options)uploads++;return url.includes('alt=media')?remote:{id:'f',version:'2'};}});store.fileId='f';
  const result=await store.save(remote,'1');assert.equal(result.writeId,remote.writeId);assert.equal(uploads,0);
});
test('load refuses duplicate Drive planner files',async()=>{
  const store=new DriveStore({request:async()=>({files:[{id:'a'},{id:'b'}]})});await assert.rejects(()=>store.load(),/vairāki/);
});
test('read rejects a document changed while downloading',async()=>{
  let version=0;const store=new DriveStore({request:async url=>url.includes('alt=media')?documentFor([]):{version:String(++version)}});store.fileId='f';
  await assert.rejects(()=>store.read(),ConflictError);
});
