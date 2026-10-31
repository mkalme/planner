import test from 'node:test';
import assert from 'node:assert/strict';
import {documentFor,importDocument,documentFingerprint} from '../public/document.js';
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
test('metadata changes during a download do not invalidate the loaded document',async()=>{
  let version=0;const store=new DriveStore({request:async url=>url.includes('alt=media')?documentFor([]):{version:String(++version)}});store.fileId='f';
  const loaded=await store.read();assert.equal(store.baseHash,await documentFingerprint(loaded));
});

test('a metadata-only version change does not block saving the same planner baseline',async()=>{
  let remote=documentFor([]),version=1,uploads=0;
  const store=new DriveStore({request:async(url,options)=>{
    if(options){uploads++;remote=JSON.parse(options.body);version++;}
    return url.includes('alt=media')?structuredClone(remote):{id:'f',version:String(version)};
  }});store.fileId='f';
  await store.read();const baseline={version:store.version,hash:store.baseHash};version++;
  const draft=documentFor([]),saved=await store.save(draft,baseline.version,baseline.hash);
  assert.deepEqual(saved,draft);assert.equal(uploads,1);
});

test('changed planner content blocks a save and repeated retries retain the original baseline',async()=>{
  let remote=documentFor([]),version=1,uploads=0;
  const store=new DriveStore({request:async(url,options)=>{if(options)uploads++;return url.includes('alt=media')?structuredClone(remote):{id:'f',version:String(version)};}});store.fileId='f';
  await store.read();const baseline={version:store.version,hash:store.baseHash};
  remote=documentFor([]);version++;
  const draft=documentFor([]);
  for(let attempt=0;attempt<2;attempt++)await assert.rejects(()=>store.save(draft,baseline.version,baseline.hash),ConflictError);
  assert.equal(uploads,0);
});

test('content changed between its download and metadata is still detected before saving',async()=>{
  let remote=documentFor([]),version=1,changeAfterDownload=true,uploads=0;
  const store=new DriveStore({request:async(url,options)=>{
    if(options)uploads++;
    if(url.includes('alt=media')){
      const loaded=structuredClone(remote);
      if(changeAfterDownload){remote=documentFor([]);version++;changeAfterDownload=false;}
      return loaded;
    }
    return {id:'f',version:String(version)};
  }});store.fileId='f';
  await store.read();const baseline={version:store.version,hash:store.baseHash};
  await assert.rejects(()=>store.save(documentFor([]),baseline.version,baseline.hash),ConflictError);assert.equal(uploads,0);
});

test('a matching write ID cannot acknowledge different task data',async()=>{
  const draft=documentFor([]),remote={...draft,tasks:[{id:'another',title:'Jaunāks uzdevums',description:'',date:'2026-10-31',status:'new',priority:'normal',hue:20,order:0,comments:[]}]};let uploads=0;
  const store=new DriveStore({request:async(url,options)=>{if(options)uploads++;return url.includes('alt=media')?remote:{id:'f',version:'2'};}});store.fileId='f';
  await assert.rejects(()=>store.save(draft,'1'),ConflictError);assert.equal(uploads,0);
});

test('upload confirmation checks the complete document and rejects a subsequent edit',async()=>{
  let remote=documentFor([]),version=1;
  const store=new DriveStore({request:async(url,options)=>{
    if(options){remote={...JSON.parse(options.body),tasks:[{id:'another',title:'Cita izmaiņa',description:'',date:'2026-10-31',status:'new',priority:'normal',hue:20,order:0,comments:[]}]};version++;}
    return url.includes('alt=media')?structuredClone(remote):{id:'f',version:String(version)};
  }});store.fileId='f';
  await store.read();const baseline={version:store.version,hash:store.baseHash};
  await assert.rejects(()=>store.save(documentFor([]),baseline.version,baseline.hash),ConflictError);
});

test('document fingerprints ignore object property order but preserve actual data changes',async()=>{
  const original=documentFor([]),reordered={tasks:[],writeId:original.writeId,updatedAt:original.updatedAt,schemaVersion:1};
  assert.equal(await documentFingerprint(original),await documentFingerprint(reordered));
  assert.notEqual(await documentFingerprint(original),await documentFingerprint(documentFor([])));
});
