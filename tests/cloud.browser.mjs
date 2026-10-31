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
  const accounts=new Map(),heldReads=[];let holdReads=false,mediaReads=0;
  await context.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.PLANNER_CONFIG={googleClientId:"test.apps.googleusercontent.com"}'}));
  await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.oauthRequests=0;window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){window.oauthRequests++;setTimeout(()=>options.callback(window.mockDeny?{error:'access_denied'}:{access_token:'mock',expires_in:3600}),0);}}}}}};`}));
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
    if(url.searchParams.get('alt')==='media'){mediaReads++;if(holdReads)await new Promise(resolve=>heldReads.push(resolve));return reply(doc);}
    // Drive metadata can advance independently of planner JSON, even with one client.
    return reply({id:`file-${account}`,version:String(++version)});
  });
  async function accountAction(name){
    const b=page.getByRole('button',{name,exact:true});
    if(!await b.isVisible()){const summary=page.locator('#account summary');if(await summary.count())await summary.click();}
    await b.click();
  }
  const connect=async()=>{await accountAction('Pieslēgt Google kontu');await page.locator('#app:not([data-readonly])').waitFor();};
  const ready=()=>page.locator('#account [role=status]').filter({hasText:'Saglabāts'}).waitFor();
  async function frame(){
    await page.waitForFunction(()=>{
      const side=document.querySelector('.sidebar'),head=document.querySelector('.planner-header');
      return side&&head&&Math.abs(side.getBoundingClientRect().top+parseFloat(getComputedStyle(side).paddingTop)+parseFloat(getComputedStyle(side,'::before').height)-head.getBoundingClientRect().bottom)<1;
    },null,{timeout:5000});
    const metrics=await page.evaluate(()=>{
      const rect=selector=>document.querySelector(selector)?.getBoundingClientRect();
      const side=rect('.sidebar'),header=rect('.planner-header'),calendar=rect('.sidebar .mini-calendar'),privacy=rect('#privacy'),create=rect('.header-actions>.primary-btn');
      const login=rect('#account summary')||rect('#account>button');
      return {w:innerWidth,h:innerHeight,dw:document.documentElement.scrollWidth,dh:document.documentElement.scrollHeight,app:rect('.app-shell').width,side:side.toJSON(),line:side.top+parseFloat(getComputedStyle(document.querySelector('.sidebar')).paddingTop)+parseFloat(getComputedStyle(document.querySelector('.sidebar'),'::before').height),header:header.toJSON(),calendar:calendar.toJSON(),privacy:privacy.toJSON(),create:create.toJSON(),login:login?.toJSON()};
    });
    const pageInset=metrics.w<=450?8:metrics.w<=760?12:24;
    const plannerWidth=Math.min(1440,metrics.w-pageInset*2),sideMargin=(metrics.w-plannerWidth)/2;
    assert.equal(metrics.dw,metrics.w);assert.equal(metrics.dh,metrics.h);assert.equal(metrics.app,plannerWidth,'Match the centered prototype width, including zoomed-out layouts');
    assert.equal(metrics.side.top,0);assert.equal(metrics.side.left,sideMargin);assert.equal(metrics.side.bottom,metrics.h-24);assert.equal(metrics.header.right,metrics.w-sideMargin,'Left and right page margins match the prototype');
    assert.ok(Math.abs(metrics.line-metrics.header.bottom)<1,`Calendar and header dividers align: ${metrics.line}, ${metrics.header.bottom}, width ${metrics.w}`);
    assert.ok(Math.abs(metrics.calendar.left-metrics.privacy.left)<1,'Privacy and calendar share a left edge');
    assert.ok(Math.abs(metrics.calendar.left-metrics.side.left)<1,'Calendar follows the plain directory sidebar left edge');
    assert.equal(metrics.login.height,metrics.create.height,'Account and create controls have equal heights');
    assert.ok(metrics.create.right<=metrics.w&&metrics.login.left>=metrics.header.left);
  }
  await page.goto('http://127.0.0.1:4173/planner/');await page.locator('#app[data-readonly]').waitFor();
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);await frame();}
  await page.setViewportSize({width:1440,height:1000});
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
  await page.locator(`${selector} [data-action=status]`).click();
  const statusMenuStyle=await page.locator('#quick-status [data-status=progress]').evaluate(n=>{const s=getComputedStyle(n);return {font:s.font,padding:s.padding,border:s.borderWidth};});
  await page.locator('#quick-status [data-status=complete]').click();await ready();assert.equal(doc.tasks[0].status,'complete');
  await page.locator('#account summary').click();
  assert.deepEqual(await page.getByRole('button',{name:'Atjaunot',exact:true}).evaluate(n=>{const s=getComputedStyle(n);return {font:s.font,padding:s.padding,border:s.borderWidth};}),statusMenuStyle,'Account actions use the quick status menu row style');
  await page.screenshot({path:'artifacts/account-menu.png',fullPage:true});
  await page.locator('#account summary').press('Escape');
  // A colored band must not cover the drag outline, and dragging must not move the source slot.
  const sourceRect=await page.locator(selector).boundingBox();
  await page.locator(selector).evaluate(n=>{window.testDragTransfer=new DataTransfer();n.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.testDragTransfer}));});
  await page.locator('.drag-placeholder').waitFor();
  await page.locator('.day-column:not(.is-today) .completed-stack').first().evaluate(n=>{const r=n.getBoundingClientRect();n.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.testDragTransfer,clientX:r.left+10,clientY:r.top+5}));});
  const dragOutline=await page.locator('.drag-placeholder').evaluate(n=>{const s=getComputedStyle(n);return {style:s.outlineStyle,width:s.outlineWidth};});
  assert.deepEqual(dragOutline,{style:'dashed',width:'2px'});assert.deepEqual(await page.locator(selector).boundingBox(),sourceRect);
  await page.screenshot({path:'artifacts/drag-preview.png',fullPage:true});
  await page.locator(selector).evaluate(n=>n.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:window.testDragTransfer})));
  const originalExpiry=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mkalme-planner:google-session')).expiresAt);
  await page.reload();await ready();assert.equal(await page.locator(`${selector}.is-complete`).count(),1);
  assert.equal(await page.evaluate(()=>window.oauthRequests),0,'Refresh restores the session without opening Google authorization');
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mkalme-planner:google-session')).expiresAt),originalExpiry,'Refresh does not extend token lifetime');
  await page.locator(`${selector} [data-action=edit]`).click();await page.locator('#task-comment').fill('Saglabāta piezīme');
  await page.locator('[data-action=post-comment]').click();await ready();
  assert.equal(await page.locator('#task-dialog').evaluate(n=>n.open),true,'Saving a comment must preserve the open editor');
  assert.equal(doc.tasks[0].comments.at(-1).comment,'Saglabāta piezīme');await page.locator('[data-action=close-dialog]').first().click();
  // An upload failure preserves the account-scoped recovery copy across reload.
  failSave=true;await page.locator(`${selector} [data-action=status]`).click();await page.locator('#quick-status [data-status=new]').click();
  await page.locator('#account .account-error').waitFor();
  assert.ok(await page.evaluate(()=>localStorage.getItem('mkalme-planner:pending:account-1')));
  assert.match(await page.evaluate(()=>JSON.parse(localStorage.getItem('mkalme-planner:pending:account-1')).baseHash),/^[a-f0-9]{64}$/);
  await page.reload();await page.getByText('Atrastas nesaglabātas izmaiņas.',{exact:false}).waitFor();
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
  // Connectivity and focus events must not start another read while refresh is still running.
  holdReads=true;const readsBefore=mediaReads;await accountAction('Atjaunot');
  for(let i=0;i<100&&!heldReads.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(heldReads.length,1);
  await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});
  await page.waitForTimeout(75);assert.equal(mediaReads,readsBefore+1,'Background refreshes are serialized across connectivity changes');
  assert.equal(await page.locator('[data-action=new]').first().isDisabled(),true);
  holdReads=false;for(const release of heldReads.splice(0))release();await ready();
  unauthorized=true;await accountAction('Atjaunot');await page.locator('#account[data-state=error],#account[data-state=expired]').waitFor();assert.equal(await page.locator('[data-action=new]').first().isDisabled(),true);
  await accountAction('Iziet');assert.equal(await page.locator('[data-task-id]').count(),0);assert.doesNotMatch(await page.locator('#account').innerText(),/account-1@/);
  accounts.set(1,{doc,version});account=2;doc=null;version=0;await connect();assert.deepEqual(doc.tasks,[]);
  for(const viewport of [{width:2560,height:1440},{width:1920,height:1080},{width:1440,height:900},{width:1024,height:600},{width:640,height:480},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.locator('[data-view=week]').click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.planner-header #account').count(),1,'Account controls stay inside the header after rerender');
    assert.equal(await page.locator('.planner-footer').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),true,'Empty week has no unnecessary page scrollbar');
    await frame();
    const actions=await page.locator('.header-actions').evaluate(n=>[...n.children].map(c=>{const r=c.getBoundingClientRect();return {y:r.y,h:r.height};}));
    assert.ok(Math.abs(actions[0].y+actions[0].h/2-actions[1].y-actions[1].h/2)<2,'Account controls align with create task button');
    await page.locator('#account summary').click();assert.equal(await page.getByRole('button',{name:'Lejupielādēt',exact:true}).isVisible(),true);
    await page.locator('#account summary').press('Escape');assert.equal(await page.locator('#account details').getAttribute('open'),null);
    if(viewport.width===1440)await page.screenshot({path:'artifacts/compact-header-desktop.png',fullPage:true});
  }
  const today=await page.locator('.day-column.is-today').getAttribute('data-drop-date');
  doc.tasks=Array.from({length:35},(_,i)=>({id:`dense-${i}`,title:`Garāks uzdevums ${i}`,description:'',date:today,status:'new',priority:'normal',hue:i*10,order:i,comments:[]}));version++;
  await accountAction('Atjaunot');await ready();
  for(const view of ['week','day','month','year']){
    await page.locator(`[data-view="${view}"]`).click();await frame();
    assert.equal(await page.locator('#planner-content').evaluate(n=>getComputedStyle(n).scrollbarWidth),'none');
  }
  await page.locator('[data-view=week]').click();
  const column=page.locator('.day-column.is-today .column-tasks');
  assert.equal(await column.evaluate(n=>n.scrollHeight>n.clientHeight),true,'Long task lists scroll inside their column');
  await column.evaluate(n=>n.scrollTop=n.scrollHeight);
  assert.equal(await page.locator('[data-task-id="dense-34"]').evaluate(n=>{const a=n.getBoundingClientRect(),b=n.closest('.column-tasks').getBoundingClientRect();return a.bottom<=b.bottom+1}),true,'Last task remains reachable');
  await page.setViewportSize({width:390,height:844});
  for(const view of ['day','week','month','year']){await page.locator(`[data-view="${view}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
  // A weekday public holiday is marked in the calendar, not merely weekend columns.
  await page.setViewportSize({width:1440,height:900});await page.locator('[data-view=year]').click();
  const year=Number(await page.locator('.date-controls h2').innerText()),holidayKey=`${year}-11-18`;
  const holiday=page.locator(`.year-grid .mini-date[data-date="${holidayKey}"]`);
  assert.match(await holiday.getAttribute('class'),/is-holiday/);assert.match(await holiday.getAttribute('title'),/Proklamēšanas/);
  await holiday.click();await page.locator('[data-view=week]').click();
  assert.equal(await page.locator(`.day-column.is-holiday[data-drop-date="${holidayKey}"]`).count(),1);
  await page.locator('[data-view=month]').click();assert.equal(await page.locator(`.month-cell.is-holiday[data-drop-date="${holidayKey}"]`).count(),1);
  await page.locator('[data-view=day]').click();assert.equal(await page.locator(`.daily-list.is-holiday[data-drop-date="${holidayKey}"]`).count(),1);
  // An expired or revoked saved grant must never expose tasks or start a popup automatically.
  await page.evaluate(()=>{const key='mkalme-planner:google-session',saved=JSON.parse(sessionStorage.getItem(key));saved.expiresAt=Date.now()-1;sessionStorage.setItem(key,JSON.stringify(saved));});
  await page.reload();await page.locator('#account[data-state=disconnected]').waitFor();
  assert.equal(await page.locator('[data-task-id]').count(),0);assert.equal(await page.evaluate(()=>window.oauthRequests),0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('mkalme-planner:google-session')),null);
  await connect();unauthorized=true;await page.reload();await page.locator('#account[data-state=error]').waitFor();
  assert.equal(await page.locator('[data-task-id]').count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('mkalme-planner:google-session')),null);
  await connect();await accountAction('Iziet');await page.reload();await page.locator('#account[data-state=disconnected]').waitFor();
  assert.equal(await page.locator('[data-task-id]').count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('mkalme-planner:google-session')),null);
  assert.deepEqual(errors,[]);
  console.log('Pages subpath, Google denial/expiry, session restore, Drive saves with metadata drift, recovery fingerprints, genuine conflicts, serialized refresh, import/export, offline protection, account isolation and responsive views passed.');
}finally{await browser.close();server?.kill();}
