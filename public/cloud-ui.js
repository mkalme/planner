import {GoogleAccount} from './google.js';
import {DriveStore} from './drive.js';
import {documentFor,importDocument} from './document.js';
export function startCloudPlanner({root,getTasks,setTasks,isBusy,notify}){
  const bar=document.querySelector('#account');
  let state='disconnected',message='Pieslēdzieties Google kontam, lai atvērtu uzdevumus.',user=null,store=null,pending=null,inFlight=false;
  const account=new GoogleAccount(globalThis.PLANNER_CONFIG?.googleClientId,()=>setState('expired','Google piekļuve beigusies. Pieslēdzieties vēlreiz.'));
  const key=()=>`mkalme-planner:pending:${user.id}`;
  const editable=()=>state==='ready'&&navigator.onLine&&!pending&&!!account.token;
  function protect(){
    const locked=!editable();root.toggleAttribute('data-readonly',locked);
    root.querySelectorAll('input,textarea,select,button[type=submit],[data-action=new],[data-action=status],[data-action=quick-status],[data-action=order-up],[data-action=order-down],[data-action=delete],[data-action=post-comment],[data-action=color]').forEach(n=>{n.disabled=locked;});
  }
  function render(){
    bar.replaceChildren();
    const status=document.createElement('span');status.setAttribute('role','status');status.textContent=message;if(['error','conflict','expired'].includes(state))status.className='account-error';bar.append(status);
    if(user){const email=document.createElement('span');email.className='account-email';email.textContent=user.email;bar.append(email);}
    const button=(text,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;b.onclick=action;bar.append(b);};
    const busy=inFlight||state==='saving'||state==='loading';
    button(account.token?'Mainīt kontu':'Pieslēgt Google kontu',connect,busy);
    if(user){
      button('Atjaunot',()=>refresh(true),busy||!navigator.onLine||!account.token);
      button('Lejupielādēt',()=>download(pending?.doc||documentFor(getTasks())));
      button('Importēt',()=>input.click(),!editable()||isBusy());
      if(pending)button('Mēģināt saglabāt vēlreiz',retry,busy||!account.token||!navigator.onLine);
      button('Iziet',disconnect,busy);
    }
    protect();
  }
  function setState(next,text){state=next;message=text;render();}
  function download(doc){
    const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`planner-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function connect(){
    if(inFlight)return;
    if(isBusy()){notify('Vispirms aizveriet uzdevuma logu.');return;}
    if(pending)download(pending.doc);
    setTasks([]);user=null;store=null;pending=null;account.disconnect();setState('loading','Pieslēdzas Google kontam…');
    try{
      user=await account.connect();store=new DriveStore(account);
      const doc=await store.load();
      const raw=localStorage.getItem(key());
      if(raw){
        const saved=JSON.parse(raw);
        pending={doc:importDocument(JSON.stringify(saved.doc)),version:saved.version,fileId:saved.fileId};
        if(pending.fileId!==store.fileId)throw new Error('Nesaglabātās izmaiņas pieder citam Drive failam. Lejupielādējiet tās pirms datu pārlādes.');
        if(doc.writeId===pending.doc.writeId){localStorage.removeItem(key());pending=null;}
      }
      setTasks(pending?.doc.tasks||doc.tasks);
      setState(pending?'error':'ready',pending?'Atrastas nesaglabātas izmaiņas. Saglabājiet tās vēlreiz vai lejupielādējiet.':'Saglabāts Google diskā.');
    }catch(error){setState('error',error.message);}
  }
  function disconnect(){
    if(inFlight)return;
    if(isBusy()){notify('Vispirms aizveriet uzdevuma logu.');return;}
    if(pending)download(pending.doc);
    account.disconnect();user=null;store=null;pending=null;setTasks([]);setState('disconnected','Jūs esat izgājis no konta.');
  }
  async function commit(){
    if(inFlight)return;inFlight=true;
    setState('saving','Saglabā Google diskā…');
    try{
      const work=()=>store.save(pending.doc,pending.version);
      if(!navigator.locks)throw new Error('Šajā pārlūkā droša saglabāšana nav atbalstīta. Izmantojiet jaunāku pārlūku.');
      const doc=await navigator.locks.request(`mkalme-planner:${user.id}`,work);
      localStorage.removeItem(key());pending=null;setTasks(doc.tasks);setState('ready','Saglabāts Google diskā.');notify('Izmaiņas saglabātas Google diskā.');
    }catch(error){setState(error.constructor.name==='ConflictError'?'conflict':'error',error.message);}
    finally{inFlight=false;render();}
  }
  function save(tasks){
    if(!editable())return;
    pending={doc:documentFor(tasks),version:store.version,fileId:store.fileId};
    try{localStorage.setItem(key(),JSON.stringify(pending));}catch{setState('error','Pārlūks nevar paturēt nesaglabātās izmaiņas. Lejupielādējiet tās.');return;}
    void commit();
  }
  async function retry(){
    if(inFlight||!pending||!account.token||!navigator.onLine)return;
    try{localStorage.setItem(key(),JSON.stringify(pending));}catch{setState('error','Nesaglabātās izmaiņas jālejupielādē.');return;}
    await commit();
  }
  async function refresh(manual=false){
    if(inFlight||!store||!account.token||!navigator.onLine||state==='saving'||state==='loading'||isBusy())return;
    if(pending){
      if(!manual)return;
      if(!confirm('Nesaglabātās izmaiņas tiks lejupielādētas pirms Google diska datu ielādes. Turpināt?'))return;
      download(pending.doc);
    }
    setState('loading','Ielādē Google diska datus…');
    try{const doc=await store.read();localStorage.removeItem(key());pending=null;setTasks(doc.tasks);setState('ready','Saglabāts Google diskā.');}
    catch(error){setState('error',error.message);}
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
  root.addEventListener('click',event=>{if(!editable()&&mutations.has(event.target.closest('[data-action]')?.dataset.action)){event.preventDefault();event.stopImmediatePropagation();notify('Lai mainītu uzdevumus, pieslēdzieties un sagaidiet saglabāšanu.');}},true);
  for(const type of ['submit','dragstart','drop'])root.addEventListener(type,event=>{if(!editable()){event.preventDefault();event.stopImmediatePropagation();}},true);
  new MutationObserver(protect).observe(root,{childList:true,subtree:true});
  window.addEventListener('offline',()=>setState('offline','Nav savienojuma. Uzdevumi ir tikai lasāmi.'));
  window.addEventListener('online',()=>{if(pending)setState('error','Savienojums atjaunots. Mēģiniet saglabāt izmaiņas vēlreiz.');else void refresh();});
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
  if(!account.clientId)message='Google pieslēgšanās vēl nav konfigurēta. Skatiet projekta README.';
  render();return {save};
}
