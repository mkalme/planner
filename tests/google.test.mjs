import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleAccount,AuthError} from '../public/google.js';

const key='mkalme-planner:google-session';
const storage=data=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
function setup(t,{sub='user-1'}={}){
  const local=new Map(),session=new Map(),requests=[],oauthCalls=[],clients=[];
  const originals=new Map(['localStorage','sessionStorage','google','fetch'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage(local)});
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage(session)});
  let grant=0;
  Object.defineProperty(globalThis,'google',{configurable:true,value:{accounts:{oauth2:{initTokenClient:options=>{clients.push(options);return {requestAccessToken:config=>{oauthCalls.push(config);options.callback({access_token:`test-token-${++grant}`,expires_in:3600});}};}}}}});
  const identity={sub};
  Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:async(url,options)=>{
    requests.push({url,options});return new Response(JSON.stringify({sub:identity.sub,email:`${identity.sub}@example.test`}));
  }});
  let expirations=0;
  const account=new GoogleAccount('test-client',()=>expirations++);
  t.after(()=>{account.disconnect();for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {account,local,session,requests,oauthCalls,clients,identity,expired:()=>expirations,saved:()=>JSON.parse(local.get(key)??'null')};
}

test('sign-in is shared by new tabs and restore verifies the account without OAuth',async t=>{
  const {account,requests,oauthCalls,saved}=setup(t);
  await account.connect();
  const record=saved();
  assert.equal(record.clientId,'test-client');assert.equal(record.token,'test-token-1');assert.deepEqual(record.user,{id:'user-1',email:'user-1@example.test'});
  assert.ok(record.expiresAt>Date.now()+3500_000&&record.expiresAt<Date.now()+3600_000);
  const tab=new GoogleAccount('test-client');t.after(()=>clearTimeout(tab.timer));
  assert.deepEqual(await tab.restore(),{id:'user-1',email:'user-1@example.test'});
  assert.equal(oauthCalls.length,1);assert.equal(requests.length,2);
  assert.equal(requests[1].options.headers.Authorization,'Bearer test-token-1');
  assert.equal(tab.expiresAt,record.expiresAt,'Restoring never extends the token lifetime');assert.equal(saved().expiresAt,record.expiresAt);
});

test('an expired token keeps the remembered account for a one-click renewal',async t=>{
  const {account,requests,oauthCalls,clients,saved}=setup(t);
  await account.connect();
  const record=saved();localStorage.setItem(key,JSON.stringify({...record,expiresAt:Date.now()-1}));
  const tab=new GoogleAccount('test-client');t.after(()=>clearTimeout(tab.timer));
  assert.equal(await tab.restore(),null);
  assert.deepEqual(tab.user,{id:'user-1',email:'user-1@example.test'});assert.equal(tab.valid,false);assert.equal(tab.needsRenewal(),true);
  assert.equal(saved().token,undefined,'The expired token is erased');assert.deepEqual(saved().user,record.user);
  assert.equal(requests.length,1,'Nothing is sent to Google with an expired token');
  assert.deepEqual(await tab.renew(),{id:'user-1',email:'user-1@example.test'});
  assert.equal(clients.at(-1).login_hint,'user-1@example.test','Renewal skips the account chooser');assert.equal(oauthCalls.at(-1).prompt,'');
  assert.equal(tab.token,'test-token-2');assert.equal(saved().token,'test-token-2');assert.equal(oauthCalls.length,2);
});

test('renewal refuses a grant for a different Google account',async t=>{
  const {account,identity,saved}=setup(t);
  await account.connect();identity.sub='user-2';
  await assert.rejects(()=>account.renew(),AuthError);
  assert.equal(account.token,'test-token-1');assert.equal(account.user.id,'user-1');assert.equal(saved().token,'test-token-1');
});

test('missing, malformed, expired and other-client sessions restore nothing',async t=>{
  const {account,local,requests,oauthCalls}=setup(t);
  for(const raw of [null,'{bad','null','{}',JSON.stringify({clientId:'other',token:'test-token',expiresAt:Date.now()+10000}),JSON.stringify({clientId:'test-client',token:'test-token',expiresAt:Date.now()-1}),JSON.stringify({clientId:'test-client',token:123,expiresAt:Date.now()+10000})]){
    if(raw===null)local.delete(key);else local.set(key,raw);
    assert.equal(await account.restore(),null);assert.equal(local.has(key),false);assert.equal(account.token,null);assert.equal(account.user,null);
  }
  assert.equal(requests.length,0);assert.equal(oauthCalls.length,0);
});

test('a session from the previous per-tab storage moves over once',async t=>{
  const {account,session,saved}=setup(t);
  session.set(key,JSON.stringify({clientId:'test-client',token:'old-token',expiresAt:Date.now()+600_000}));
  assert.deepEqual(await account.restore(),{id:'user-1',email:'user-1@example.test'});
  assert.equal(session.has(key),false);assert.equal(saved().token,'old-token');
});

test('sign-out erases the grant and the remembered account; expiry erases only the token',async t=>{
  const {account,local,saved,expired}=setup(t);
  await account.connect();account.disconnect();
  assert.equal(local.has(key),false);assert.equal(account.user,null);assert.equal(await account.restore(),null);
  await account.connect();account.expire();
  assert.equal(account.token,null);assert.equal(saved().token,undefined);assert.equal(saved().user.id,'user-1');assert.equal(expired(),1);
});

test('expiry adopts a newer token that another tab stored instead of erasing it',async t=>{
  const {account,saved,expired}=setup(t);
  await account.connect();
  const newer={...saved(),token:'other-tab',expiresAt:Date.now()+3590_000};localStorage.setItem(key,JSON.stringify(newer));
  account.expire();
  assert.equal(account.token,'other-tab');assert.equal(saved().token,'other-tab');assert.equal(expired(),0);
});

test('a revoked grant is erased before any Drive access but the account stays remembered',async t=>{
  const {account,requests,saved,expired}=setup(t);
  await account.connect();
  globalThis.fetch=async()=>new Response('{}',{status:401});
  await assert.rejects(()=>account.restore(),/piekļuve beigusies/);
  assert.equal(account.token,null);assert.equal(saved().token,undefined);assert.equal(account.user.id,'user-1');assert.equal(expired(),1);assert.equal(requests.length,1);
});

test('an elapsed deadline blocks requests even when a sleeping tab delayed its timer',async t=>{
  const {account,requests,saved,expired}=setup(t);
  await account.connect();account.expiresAt=Date.now()-1;
  await assert.rejects(()=>account.request('https://www.googleapis.com/drive/v3/files'),AuthError);
  assert.equal(saved().token,undefined);assert.equal(requests.length,1);assert.equal(expired(),1);
});

test('blocked browser storage keeps manual sign-in functional',async t=>{
  const {account}=setup(t);
  for(const name of ['localStorage','sessionStorage'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw new Error('Blocked');}});
  assert.deepEqual(await account.connect(),{id:'user-1',email:'user-1@example.test'});
  assert.equal(account.token,'test-token-1');account.disconnect();assert.equal(await account.restore(),null);
});
