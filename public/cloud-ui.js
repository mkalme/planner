import {GoogleAccount,AuthError,RENEW_MARGIN} from './google.js';
import {DriveStore,ConflictError} from './drive.js';
import {documentFor,importDocument,documentFingerprint} from './document.js';
const HASH=/^[a-f0-9]{64}$/;
const SAVED='Saglabāts Google diskā.',OFFLINE='Nav savienojuma. Uzdevumi ir tikai lasāmi.';
export function startCloudPlanner({root,getTasks,setTasks,isBusy,notify}){
  const bar=document.querySelector('#account');
  // pending: the newest unsaved document and the Drive state it was edited from. job: the upload in progress.
  let state='disconnected',message='Pieslēdzieties Google kontam, lai atvērtu uzdevumus.',store=null,pending=null,job=null,inFlight=false,renewal=null,autoRenew=true;
  const account=new GoogleAccount(globalThis.PLANNER_CONFIG?.googleClientId,onTokenLost,onTokenAdopted);
  const key=()=>`mkalme-planner:pending:${account.user.id}`;
  // Edits stay open while a save runs or access renews. They queue and upload in order.
  const editable=()=>!!store&&navigator.onLine&&['ready','saving','error','reauth'].includes(state);
  const busy=()=>inFlight||!!job||state==='loading';
  function protect(){
    const locked=!editable();root.toggleAttribute('data-readonly',locked);
    root.querySelectorAll('input,textarea,select,button[type=submit],[data-action=new],[data-action=status],[data-action=quick-status],[data-action=order-up],[data-action=order-down],[data-action=delete],[data-action=post-comment],[data-action=color]').forEach(n=>{n.disabled=locked;});
  }
  function render(){
    bar.replaceChildren();
    bar.dataset.state=state;
    const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-label',message);status.title=message;status.textContent=state==='ready'?'Saglabāts':message;
    if(['error','conflict'].includes(state)||state==='reauth'&&!renewal)status.className='account-error';bar.append(status);
    const add=(parent,text,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;b.onclick=()=>{const menu=bar.querySelector('details');if(menu)menu.open=false;action();};parent.append(b);};
    const user=account.user;
    if(user&&(state==='reauth'||state==='error'&&!store))add(bar,account.valid?'Mēģināt vēlreiz':'Atjaunot piekļuvi',resumeAccess,busy());
    let actions=bar;
    if(user){
      const menu=document.createElement('details');menu.className='account-menu';
      const summary=document.createElement('summary');summary.className='account-email';summary.textContent=user.email;summary.title=user.email;
      const panel=document.createElement('div');panel.className='account-actions';menu.append(summary,panel);bar.append(menu);actions=panel;
      menu.onkeydown=event=>{if(event.key==='Escape'){menu.open=false;summary.focus();}};
    }
    add(actions,user?'Mainīt kontu':'Pieslēgt Google kontu',connect,busy());
    if(user){
      add(actions,'Atjaunot',()=>withAccess(()=>refresh(true)),busy()||!navigator.onLine||!store);
      add(actions,'Lejupielādēt',()=>download(pending?.doc||documentFor(getTasks())));
      add(actions,'Importēt',()=>input.click(),!editable()||isBusy());
      if(pending)add(actions,'Mēģināt saglabāt vēlreiz',()=>withAccess(retry),busy()||!navigator.onLine||!store);
      add(actions,'Iziet',disconnect,busy());
    }
    protect();
  }
  function setState(next,text){state=next;message=text;render();}
  function download(doc){
    const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`planner-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function remember(){
    try{localStorage.setItem(key(),JSON.stringify(pending));return true;}
    catch{setState('error','Pārlūks nevar paturēt nesaglabātās izmaiņas. Lejupielādējiet tās.');return false;}
  }
  function forget(){try{localStorage.removeItem(key());}catch{/* Storage may be disabled. */}}
  function needAccess(text){
    if(state==='conflict'||state==='offline')return render();
    setState('reauth',text||(pending?'Google piekļuve jāatjauno. Izmaiņas saglabāsies pēc tam.':'Google piekļuve jāatjauno.'));
  }
  // Must run synchronously inside a click or key press: browsers only then let Google's window open.
  // Google closes it by itself when this account granted access before.
  function renewAccess(next){
    const quiet=account.valid,attempt=account.renew();
    renewal=attempt;autoRenew=false;
    if(!quiet)needAccess('Atjauno Google piekļuvi…');
    attempt.then(()=>{
      if(renewal!==attempt)return;
      renewal=null;autoRenew=true;
      if(next)return next();
      if(!quiet)return resumeWork();
    },error=>{
      if(renewal!==attempt)return;
      renewal=null;
      // A renewal before expiry may fail quietly: the current token still works.
      if(!quiet)needAccess(error.message);
    }).finally(render);
  }
  function withAccess(action){if(account.valid)action();else renewAccess(action);}
  function resumeAccess(){
    if(!account.valid)return renewAccess();
    if(!store)return void start();
    void resumeWork();
  }
  function resumeWork(){
    if(!store)return load();
    if(state==='conflict')return;
    if(pending)return flush();
    setState('ready',SAVED);return refresh();
  }
  function onTokenLost(){if(store&&pending&&!job)needAccess();else render();}
  function onTokenAdopted(){
    renewal=null;autoRenew=true;
    if(state==='reauth')void resumeWork();else render();
  }
  async function start(){
    if(inFlight)return;
    inFlight=true;setState('loading','Atjauno Google savienojumu…');
    let user;
    try{user=await account.restore();}
    catch(error){
      inFlight=false;
      if(error instanceof AuthError&&account.user)needAccess(error.message);else setState('error',error.message);
      return;
    }
    inFlight=false;
    if(user)return load();
    if(account.user)needAccess('Noklikšķiniet “Atjaunot piekļuvi”, lai turpinātu.');
    else setState('disconnected','Pieslēdzieties Google kontam, lai atvērtu uzdevumus.');
  }
  async function load(){
    if(inFlight)return;
    inFlight=true;setState('loading','Ielādē Google diska datus…');
    try{
      const next=new DriveStore(account),doc=await next.load();
      const raw=localStorage.getItem(key());
      pending=null;
      if(raw){
        const saved=JSON.parse(raw);
        pending={doc:importDocument(JSON.stringify(saved.doc)),version:saved.version,fileId:saved.fileId,baseHash:saved.baseHash??null,sentHashes:Array.isArray(saved.sentHashes)?saved.sentHashes.filter(hash=>HASH.test(hash)):[]};
        if(pending.fileId!==next.fileId)throw new Error('Nesaglabātās izmaiņas pieder citam Drive failam. Lejupielādējiet tās pirms datu pārlādes.');
        if(next.baseHash===await documentFingerprint(pending.doc)){forget();pending=null;}
      }
      store=next;
      setTasks(pending?.doc.tasks||doc.tasks);
      setState(pending?'error':'ready',pending?'Atrastas nesaglabātas izmaiņas. Saglabājiet tās vēlreiz vai lejupielādējiet.':SAVED);
    }catch(error){if(error instanceof AuthError)needAccess(error.message);else setState('error',error.message);}
    finally{inFlight=false;render();}
  }
  function connect(){
    if(busy())return;
    if(isBusy()){notify('Vispirms aizveriet uzdevuma logu.');return;}
    if(pending)download(pending.doc);
    setTasks([]);store=null;pending=null;renewal=null;autoRenew=true;account.disconnect();
    const attempt=account.connect();
    inFlight=true;setState('loading','Pieslēdzas Google kontam…');
    attempt.then(()=>{inFlight=false;return load();},error=>{inFlight=false;setState('error',error.message);});
  }
  function disconnect(){
    if(busy())return;
    if(isBusy()){notify('Vispirms aizveriet uzdevuma logu.');return;}
    if(pending)download(pending.doc);
    account.disconnect();store=null;pending=null;renewal=null;autoRenew=true;setTasks([]);setState('disconnected','Jūs esat izgājis no konta.');
  }
  async function flush(force=false){
    if(job||inFlight||!pending||!store||state==='conflict'&&!force)return;
    if(!navigator.onLine)return setState('offline',OFFLINE);
    if(!account.valid)return renewal?render():needAccess();
    if(!navigator.locks)return setState('error','Šajā pārlūkā droša saglabāšana nav atbalstīta. Izmantojiet jaunāku pārlūku.');
    setState('saving','Saglabā Google diskā…');
    try{
      while(pending){
        if(!account.valid)return needAccess();
        const entry=pending;job={entry,hash:null};
        job.hash=await documentFingerprint(entry.doc);
        // Edits made meanwhile may find this upload already in Drive after a reload.
        if(pending!==entry&&!pending.sentHashes.includes(job.hash)){pending.sentHashes.push(job.hash);remember();}
        const expected=entry.baseHash===null?null:[entry.baseHash,...entry.sentHashes];
        await navigator.locks.request(`mkalme-planner:${account.user.id}`,()=>store.save(entry.doc,entry.version,expected));
        job=null;
        if(pending===entry){pending=null;forget();}
        // Edits made during the upload now build on the version that just landed.
        else{Object.assign(pending,{version:store.version,baseHash:store.baseHash,sentHashes:[]});remember();}
      }
      setState('ready',SAVED);notify('Izmaiņas saglabātas Google diskā.');
    }catch(error){
      job=null;
      if(error instanceof AuthError)needAccess();
      else setState(error instanceof ConflictError?'conflict':'error',error.message);
    }finally{job=null;render();}
  }
  function save(tasks){
    if(!editable())return;
    // Build on what Drive has, or will have once the upload in progress lands.
    const base=job?{version:job.entry.version,baseHash:job.entry.baseHash,sentHashes:[...job.entry.sentHashes,...(job.hash?[job.hash]:[])]}
      :pending?{version:pending.version,baseHash:pending.baseHash,sentHashes:[...pending.sentHashes]}
      :{version:store.version,baseHash:store.baseHash,sentHashes:[]};
    pending={doc:documentFor(tasks),fileId:store.fileId,...base};
    if(!remember())return;
    if(state==='ready')setState('saving','Saglabā Google diskā…');
    // An edit is a click or key press, so a token near expiry can renew now without a blocked window.
    if(account.needsRenewal(RENEW_MARGIN)&&autoRenew&&!renewal&&navigator.userActivation?.isActive!==false)renewAccess();
    void flush();
  }
  function retry(){
    if(busy()||!pending||!store||!navigator.onLine)return;
    if(!remember())return;
    void flush(true);
  }
  async function refresh(manual=false){
    if(busy()||!store||!account.valid||!navigator.onLine||isBusy())return;
    if(pending){
      if(!manual)return;
      if(!confirm('Nesaglabātās izmaiņas tiks lejupielādētas pirms Google diska datu ielādes. Turpināt?'))return;
      download(pending.doc);
    }
    // Background refreshes keep editing open; an edit made meanwhile wins and saves afterwards.
    const discard=pending;
    inFlight=true;if(manual)setState('loading','Ielādē Google diska datus…');
    try{
      const doc=await store.read();
      if(pending===discard){if(discard)forget();pending=null;setTasks(doc.tasks);setState('ready',SAVED);}
    }catch(error){if(error instanceof AuthError)needAccess(error.message);else setState('error',error.message);}
    finally{inFlight=false;render();if(pending&&pending!==discard)void flush();}
  }
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
  input.onchange=async()=>{
    try{
      const file=input.files[0];if(!file||!editable()||isBusy())return;
      if(file.size>10*1024*1024)throw new Error('Fails ir pārāk liels (maksimums 10 MB).');
      const doc=importDocument(await file.text());
      if(!confirm(`Importēt ${doc.tasks.length} uzdevumus? Esošie ${getTasks().length} uzdevumi tiks aizstāti. Pirms tam tiks lejupielādēta pašreizējā versija.`))return;
      download(documentFor(getTasks()));setTasks(doc.tasks);save(doc.tasks);
    }catch(error){notify(error.message);}finally{input.value='';}
  };
  const mutations=new Set(['new','status','quick-status','order-up','order-down','delete','post-comment','color']);
  // After the token expires, the next click renews it. Account controls and links have their own actions.
  document.addEventListener('click',event=>{
    if(!event.isTrusted||!autoRenew||renewal||!account.needsRenewal(0)||bar.contains(event.target)||event.target.closest?.('a[href]')||['disconnected','loading','conflict','offline'].includes(state))return;
    renewAccess();
  },true);
  root.addEventListener('click',event=>{if(!editable()&&mutations.has(event.target.closest('[data-action]')?.dataset.action)){event.preventDefault();event.stopImmediatePropagation();notify(message);}},true);
  for(const type of ['submit','dragstart','drop'])root.addEventListener(type,event=>{if(!editable()){event.preventDefault();event.stopImmediatePropagation();}},true);
  new MutationObserver(protect).observe(root,{childList:true,subtree:true});
  document.addEventListener('click',event=>{if(!bar.contains(event.target)){const menu=bar.querySelector('details');if(menu)menu.open=false;}});
  window.addEventListener('offline',()=>{if(store)setState('offline',OFFLINE);else render();});
  window.addEventListener('online',()=>{
    if(state==='offline')setState(inFlight?'loading':pending?'error':'ready',inFlight?'Ielādē Google diska datus…':pending?'Savienojums atjaunots. Saglabā izmaiņas…':SAVED);
    if(pending)void flush();else void refresh();
  });
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('beforeunload',event=>{if(pending||job){event.preventDefault();event.returnValue='';}});
  if(!account.clientId)message='Google pieslēgšanās vēl nav konfigurēta. Skatiet projekta README.';
  render();if(account.clientId)void start();return {save};
}
