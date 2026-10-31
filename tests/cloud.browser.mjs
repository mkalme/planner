import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let server;
try{await fetch('http://127.0.0.1:4173/planner/');}catch{server=spawn(process.execPath,['server.mjs'],{stdio:'ignore'});}
for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:4173/planner/');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true});
await fs.mkdir('artifacts',{recursive:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'lv-LV'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let doc=null,version=0,failSave=false,account=1,deny=false,unauthorized=false;
  const accounts=new Map();
  await context.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.PLANNER_CONFIG={googleClientId:"test.apps.googleusercontent.com"}'}));
  await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){setTimeout(()=>options.callback(window.mockDeny?{error:'access_denied'}:{access_token:'mock',expires_in:3600}),0);}}}}}};`}));
  await context.route('https://www.googleapis.com/**',async route=>{
    const url=new URL(route.request().url());const method=route.request().method();
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(unauthorized){unauthorized=false;return reply({},401);}
    if(url.pathname.endsWith('/userinfo'))return reply({sub:`account-${account}`,email:`account-${account}@example.test`});
    if(url.pathname.endsWith('/generateIds'))return reply({ids:[`file-${account}`]});
    if(url.pathname.includes('/upload/')&&method==='POST'){
      const body=route.request().postData(),part=body.split('Content-Type: application/json\r\n\r\n').at(-1).split('\r\n--')[0];doc=JSON.parse(part);version=1;return reply({id:`file-${account}`,version:String(version)});
    }
    if(method==='PATCH'){
      await new Promise(r=>setTimeout(r,150));
      if(failSave)return reply({},500);
      doc=route.request().postDataJSON();version++;return reply({id:`file-${account}`,version:String(version)});
    }
    if(url.searchParams.get('spaces'))return reply({files:doc?[{id:`file-${account}`,name:'planner.json'}]:[]});
    if(url.searchParams.get('alt')==='media')return reply(doc);
    return reply({id:`file-${account}`,version:String(version)});
  });
  async function accountAction(name){
    const b=page.getByRole('button',{name,exact:true});
    if(!await b.isVisible()){const summary=page.locator('#account summary');if(await summary.count())await summary.click();}
    await b.click();
  }
  const connect=async()=>{await accountAction('Pieslēgt Google kontu');await page.locator('#app:not([data-readonly])').waitFor();};
  const ready=()=>page.locator('#account [role=status]').filter({hasText:'Saglabāts'}).waitFor();
  await page.goto('http://127.0.0.1:4173/planner/');await page.locator('#app[data-readonly]').waitFor();
  assert.equal(await page.locator('[data-task-id]').count(),0);
  await page.evaluate(()=>window.mockDeny=true);await page.getByRole('button',{name:'Pieslēgt Google kontu'}).click();
  await page.getByRole('status').filter({hasText:'Google piekļuve nav piešķirta.'}).waitFor();
  await page.evaluate(()=>window.mockDeny=false);await connect();assert.deepEqual(doc.tasks,[]);
  for(const view of ['day','week','month','year']){await page.locator(`[data-view="${view}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  await page.locator('[data-view=week]').click();
  await page.locator('[data-action=new]').first().click();await page.locator('#task-title').fill('Pārbaudīt saglabāšanu');
  await page.locator('#task-priority').selectOption('high');await page.locator('#task-form button[type=submit]').click();
  await page.locator('#app[data-readonly]').waitFor();await ready();assert.equal(doc.tasks.length,1);assert.match(doc.tasks[0].comments[0].comment,/Prioritāte/);
  const id=doc.tasks[0].id,selector=`[data-task-id="${id}"]`;
  await page.locator(`${selector} [data-action=status]`).click();await page.locator('#quick-status [data-status=complete]').click();await ready();assert.equal(doc.tasks[0].status,'complete');
  await page.reload();await connect();assert.equal(await page.locator(`${selector}.is-complete`).count(),1);
  await page.locator(`${selector} [data-action=edit]`).click();await page.locator('#task-comment').fill('Saglabāta piezīme');
  await page.locator('[data-action=post-comment]').click();await ready();
  assert.equal(await page.locator('#task-dialog').evaluate(n=>n.open),true,'Saving a comment must preserve the open editor');
  assert.equal(doc.tasks[0].comments.at(-1).comment,'Saglabāta piezīme');await page.locator('[data-action=close-dialog]').first().click();
  // An upload failure preserves the account-scoped recovery copy across reload.
  failSave=true;await page.locator(`${selector} [data-action=status]`).click();await page.locator('#quick-status [data-status=new]').click();
  await page.locator('#account .account-error').waitFor();
  assert.ok(await page.evaluate(()=>localStorage.getItem('mkalme-planner:pending:account-1')));
  await page.reload();await accountAction('Pieslēgt Google kontu');await page.getByText('Atrastas nesaglabātas izmaiņas.',{exact:false}).waitFor();
  failSave=false;await accountAction('Mēģināt saglabāt vēlreiz');await ready();assert.equal(doc.tasks[0].status,'new');
  // Stale data must not overwrite a newer remote version.
  version++;doc={...doc,writeId:'another-device'};
  await page.locator(`${selector} [data-action=status]`).click();await page.locator('#quick-status [data-status=progress]').click();
  await page.getByText('Google diskā ir jaunāki dati.',{exact:false}).waitFor();assert.equal(doc.tasks[0].status,'new');
  page.once('dialog',d=>d.accept());const download=page.waitForEvent('download');await accountAction('Atjaunot');await download;await ready();
  // Invalid import leaves cloud data untouched.
  const previous=JSON.stringify(doc);await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await page.getByText('Fails nav derīgs JSON dokuments.',{exact:true}).waitFor();assert.equal(JSON.stringify(doc),previous);
  page.once('dialog',d=>d.accept());await page.locator('input[type=file]').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from('[]')});await ready();assert.deepEqual(doc.tasks,[]);
  await context.setOffline(true);await page.locator('#app[data-readonly]').waitFor();await context.setOffline(false);await ready();
  unauthorized=true;await accountAction('Atjaunot');await page.locator('#account[data-state=error],#account[data-state=expired]').waitFor();assert.equal(await page.locator('[data-action=new]').first().isDisabled(),true);
  await accountAction('Iziet');assert.equal(await page.locator('[data-task-id]').count(),0);assert.doesNotMatch(await page.locator('#account').innerText(),/account-1@/);
  accounts.set(1,{doc,version});account=2;doc=null;version=0;await connect();assert.deepEqual(doc.tasks,[]);
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.locator('[data-view=week]').click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.planner-header #account').count(),1,'Account controls stay inside the header after rerender');
    assert.equal(await page.locator('.planner-footer').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),true,'Empty week has no unnecessary page scrollbar');
    const edge=await page.locator('.sidebar').evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n,'::after');return {expected:r.right-1,left:parseFloat(s.left),top:s.top,bottom:s.bottom,position:s.position};});
    assert.equal(edge.position,'fixed');assert.equal(edge.top,'0px');assert.equal(edge.bottom,'0px');assert.ok(Math.abs(edge.left-edge.expected)<1);
    const actions=await page.locator('.header-actions').evaluate(n=>[...n.children].map(c=>{const r=c.getBoundingClientRect();return {y:r.y,h:r.height};}));
    assert.ok(Math.abs(actions[0].y+actions[0].h/2-actions[1].y-actions[1].h/2)<2,'Account controls align with create task button');
    await page.locator('#account summary').click();assert.equal(await page.getByRole('button',{name:'Lejupielādēt',exact:true}).isVisible(),true);
    await page.locator('#account summary').press('Escape');assert.equal(await page.locator('#account details').getAttribute('open'),null);
    if(viewport.width===1440)await page.screenshot({path:'artifacts/compact-header-desktop.png',fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  for(const view of ['day','week','month','year']){await page.locator(`[data-view="${view}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  await page.screenshot({path:'artifacts/mobile.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('Pages subpath, Google denial/expiry, Drive initialization/save/reload, recovery, conflicts, import/export, offline protection, account isolation and responsive views passed.');
}finally{await browser.close();server?.kill();}
