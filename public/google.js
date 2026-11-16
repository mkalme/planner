const SESSION_KEY='mkalme-planner:google-session';
const SCOPE='openid email https://www.googleapis.com/auth/drive.appdata';
const USERINFO='https://www.googleapis.com/oauth2/v3/userinfo';
// Renew during an edit when less than this remains, so saves rarely meet an expired token.
export const RENEW_MARGIN=10*60*1000;
export class AuthError extends Error{}
const validUser=user=>!!user&&typeof user.id==='string'&&!!user.id&&typeof user.email==='string'&&!!user.email;
function readSaved(area){try{return JSON.parse(globalThis[area].getItem(SESSION_KEY)||'null');}catch{return null;}}
function removeSaved(area){try{globalThis[area].removeItem(SESSION_KEY);}catch{/* Storage may be disabled. */}}
export class GoogleAccount{
  constructor(clientId,onExpire=()=>{},onAdopt=()=>{}){
    this.clientId=clientId;this.onExpire=onExpire;this.onAdopt=onAdopt;this.token=null;this.expiresAt=0;this.timer=null;this.user=null;
    // Another tab renewed the same account: reuse its token instead of asking Google again.
    globalThis.addEventListener?.('storage',event=>{if(event.key===SESSION_KEY)this.adopt();});
  }
  get valid(){return !!this.token&&Date.now()<this.expiresAt;}
  needsRenewal(margin=0){return !!this.user&&(!this.valid||this.expiresAt-Date.now()<=margin);}
  // Full sign-in with the account chooser. Call it from a click so the Google window may open.
  async connect(){
    const grant=await this.authorize({prompt:'select_account'});
    this.user=null;this.useToken(grant.token,grant.expiresAt);
    try{await this.identify();}catch(error){this.disconnect();throw error;}
    this.persist();return this.user;
  }
  // Renewal for the remembered account. Google closes its window by itself when access was granted
  // before. Call it from a click or key press so the browser allows the window.
  async renew(){
    const expected=this.user;
    if(!expected)throw new AuthError('Pieslēdzieties Google kontam.');
    const grant=await this.authorize({prompt:'',login_hint:expected.email});
    const info=await this.fetchJson(USERINFO,grant.token);
    // Never use one account's grant for another account's tasks.
    if(info.sub!==expected.id)throw new AuthError('Google piekļuvi piešķīra citam kontam. Izmantojiet “Mainīt kontu”.');
    this.useToken(grant.token,grant.expiresAt);this.user={id:info.sub,email:info.email};this.persist();return this.user;
  }
  authorize({prompt,login_hint}){
    if(!this.clientId)return Promise.reject(new Error('Google pieslēgšanās vēl nav konfigurēta.'));
    if(!globalThis.google?.accounts?.oauth2)return Promise.reject(new Error('Google pieslēgšanās nav ielādēta. Pārbaudiet savienojumu un mēģiniet vēlreiz.'));
    // The Promise executor runs synchronously, so the Google window opens inside the caller's click.
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:SCOPE,...(login_hint?{login_hint}:{}),
        callback:r=>r.error?reject(new Error('Google piekļuve nav piešķirta.')):resolve(r),
        error_callback:e=>reject(new Error(e?.type==='popup_failed_to_open'?'Pārlūks neatvēra Google logu. Atļaujiet uznirstošos logus šai vietnei.':'Google pieslēgšanās atcelta.'))});
      client.requestAccessToken({prompt});
    }).then(token=>{
      const expiresAt=Date.now()+(Number(token.expires_in)-60)*1000;
      if(typeof token.access_token!=='string'||!token.access_token||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('Google piekļuves pilnvara nav derīga. Pieslēdzieties vēlreiz.');
      return {token:token.access_token,expiresAt};
    });
  }
  async restore(){
    // Older releases kept the grant in this tab only. Move it over once.
    const legacy=readSaved('sessionStorage');removeSaved('sessionStorage');
    const saved=readSaved('localStorage')??legacy;
    if(!this.clientId||!saved||saved.clientId!==this.clientId){this.disconnect();return null;}
    this.user=validUser(saved.user)?{id:saved.user.id,email:saved.user.email}:null;
    if(typeof saved.token!=='string'||!saved.token||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now()){
      // Keep only the remembered account, so one click renews access without the account chooser.
      this.dropToken();if(!this.user)this.disconnect();return null;
    }
    this.useToken(saved.token,saved.expiresAt);
    // Verify the account with Google before loading any account-scoped task data.
    return this.identify();
  }
  adopt(){
    const saved=readSaved('localStorage');
    if(!this.user||saved?.clientId!==this.clientId||saved.user?.id!==this.user.id||typeof saved.token!=='string'||saved.token===this.token||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Math.max(Date.now(),this.expiresAt))return false;
    this.useToken(saved.token,saved.expiresAt);this.onAdopt();return true;
  }
  useToken(token,expiresAt){
    this.token=token;this.expiresAt=expiresAt;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.expire(),expiresAt-Date.now());
  }
  async identify(){
    const user=await this.request(USERINFO);
    if(!user.sub||!user.email)throw new Error('Google kontu neizdevās noteikt.');
    if(this.user&&this.user.id!==user.sub){this.dropToken();throw new AuthError('Saglabātā Google piekļuve pieder citam kontam. Atjaunojiet piekļuvi.');}
    this.user={id:user.sub,email:user.email};this.persist();return this.user;
  }
  // The short-lived token and the remembered account are shared by this browser's tabs. Reload never extends the token.
  persist(){
    if(!this.user)return;
    try{localStorage.setItem(SESSION_KEY,JSON.stringify({clientId:this.clientId,user:this.user,...(this.valid?{token:this.token,expiresAt:this.expiresAt}:{})}));}catch{/* Storage may be disabled; the current in-memory connection still works. */}
  }
  dropToken(){
    const dropped=this.token,saved=readSaved('localStorage');
    this.token=null;this.expiresAt=0;clearTimeout(this.timer);
    // Leave a newer token that another tab stored for this account in place.
    if(typeof saved?.token==='string'&&saved.token!==dropped&&saved.user?.id===this.user?.id&&saved.expiresAt>Date.now())return;
    this.persist();
  }
  expire(){if(this.adopt())return;this.dropToken();this.onExpire();}
  disconnect(){this.token=null;this.expiresAt=0;this.user=null;clearTimeout(this.timer);removeSaved('localStorage');removeSaved('sessionStorage');}
  async fetchJson(url,token,options={}){
    let response;try{response=await fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw new Error('Savienojums neizdevās. Izmaiņas vēl nav saglabātas.');}
    if(response.status===401)throw new AuthError('Google piekļuve beigusies. Atjaunojiet piekļuvi.');
    if(!response.ok)throw new Error(response.status===403?'Google disks liedza piekļuvi vai sasniegts pieprasījumu limits.':`Google diska pieprasījums neizdevās (${response.status}).`);
    return response.status===204?null:response.json();
  }
  async request(url,options={}){
    if(this.token&&Date.now()>=this.expiresAt)this.expire();
    if(!this.token)throw new AuthError('Google piekļuve jāatjauno.');
    const token=this.token;
    try{return await this.fetchJson(url,token,options);}
    catch(error){if(error instanceof AuthError&&this.token===token)this.expire();throw error;}
  }
}
