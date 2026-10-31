import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleAccount} from '../public/google.js';

const key='mkalme-planner:google-session';
function setup(t){
  const data=new Map(),requests=[],oauthCalls=[];
  const originals=new Map(['sessionStorage','google','fetch'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});
  Object.defineProperty(globalThis,'google',{configurable:true,value:{accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:config=>{oauthCalls.push(config);options.callback({access_token:'test-token',expires_in:3600});}})}}}});
  Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:async(url,options)=>{
    requests.push({url,options});return new Response(JSON.stringify({sub:'user-1',email:'user@example.test'}));
  }});
  let expirations=0;
  const account=new GoogleAccount('test-client',()=>expirations++);
  t.after(()=>{account.disconnect();for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {account,data,requests,oauthCalls,expired:()=>expirations};
}

test('successful sign-in remembers a bounded grant and restore verifies the account without OAuth',async t=>{
  const {account,data,requests,oauthCalls}=setup(t);
  await account.connect();
  const saved=JSON.parse(data.get(key));
  assert.equal(saved.clientId,'test-client');assert.equal(saved.token,'test-token');
  assert.ok(saved.expiresAt>Date.now()+3500_000&&saved.expiresAt<Date.now()+3600_000);
  clearTimeout(account.timer);account.token=null;account.user=null;
  assert.deepEqual(await account.restore(),{id:'user-1',email:'user@example.test'});
  assert.equal(oauthCalls.length,1);assert.equal(requests.length,2);
  assert.equal(requests[1].options.headers.Authorization,'Bearer test-token');
  assert.equal(account.expiresAt,saved.expiresAt);assert.equal(JSON.parse(data.get(key)).expiresAt,saved.expiresAt);
});

test('missing, malformed, expired and other-client sessions restore nothing',async t=>{
  const {account,data,requests,oauthCalls}=setup(t);
  for(const raw of [null,'{bad','null','{}',JSON.stringify({clientId:'other',token:'test-token',expiresAt:Date.now()+10000}),JSON.stringify({clientId:'test-client',token:'test-token',expiresAt:Date.now()-1}),JSON.stringify({clientId:'test-client',token:123,expiresAt:Date.now()+10000})]){
    if(raw===null)data.delete(key);else data.set(key,raw);
    assert.equal(await account.restore(),null);assert.equal(data.has(key),false);assert.equal(account.token,null);
  }
  assert.equal(requests.length,0);assert.equal(oauthCalls.length,0);
});

test('sign-out and expiry erase the saved grant',async t=>{
  const {account,data,expired}=setup(t);
  await account.connect();account.disconnect();
  assert.equal(data.has(key),false);assert.equal(account.user,null);assert.equal(await account.restore(),null);
  await account.connect();account.expire();
  assert.equal(data.has(key),false);assert.equal(account.token,null);assert.equal(expired(),1);
});

test('a revoked grant is erased before any Drive access',async t=>{
  const {account,data,requests,expired}=setup(t);
  await account.connect();
  globalThis.fetch=async()=>new Response('{}',{status:401});
  await assert.rejects(()=>account.restore(),/piekļuve beigusies/);
  assert.equal(data.has(key),false);assert.equal(account.user,null);assert.equal(expired(),1);assert.equal(requests.length,1);
});

test('an elapsed deadline blocks requests even when a sleeping tab delayed its timer',async t=>{
  const {account,data,requests,expired}=setup(t);
  await account.connect();account.expiresAt=Date.now()-1;
  await assert.rejects(()=>account.request('https://www.googleapis.com/drive/v3/files'),/Atkārtoti pieslēdzieties/);
  assert.equal(data.has(key),false);assert.equal(requests.length,1);assert.equal(expired(),1);
});

test('blocked browser storage keeps manual sign-in functional',async t=>{
  const {account}=setup(t);
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw new Error('Blocked');}});
  assert.deepEqual(await account.connect(),{id:'user-1',email:'user@example.test'});
  assert.equal(account.token,'test-token');account.disconnect();assert.equal(await account.restore(),null);
});
