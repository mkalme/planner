const SESSION_KEY='mkalme-planner:google-session';
export class GoogleAccount{
  constructor(clientId,onExpire){this.clientId=clientId;this.onExpire=onExpire;this.token=null;this.expiresAt=0;this.timer=null;this.user=null;}
  async connect(){
    if(!this.clientId)throw new Error('Google pieslēgšanās vēl nav konfigurēta.');
    if(!globalThis.google?.accounts?.oauth2)throw new Error('Google pieslēgšanās nav ielādēta. Pārbaudiet savienojumu un mēģiniet vēlreiz.');
    const token=await new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:'openid email https://www.googleapis.com/auth/drive.appdata',callback:r=>r.error?reject(new Error('Google piekļuve nav piešķirta.')):resolve(r),error_callback:()=>reject(new Error('Google pieslēgšanās atcelta.'))});
      client.requestAccessToken({prompt:'select_account'});
    });
    const expiresAt=Date.now()+(Number(token.expires_in)-60)*1000;
    if(typeof token.access_token!=='string'||!token.access_token||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('Google piekļuves pilnvara nav derīga. Pieslēdzieties vēlreiz.');
    this.useToken(token.access_token,expiresAt);
    const user=await this.identify();
    // Keep only this short-lived grant in this tab. Reload must not extend its lifetime.
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({clientId:this.clientId,token:this.token,expiresAt:this.expiresAt}));}catch{/* Storage may be disabled; the current in-memory connection still works. */}
    return user;
  }
  async restore(){
    let saved;
    try{saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{this.disconnect();return null;}
    if(!this.clientId||saved?.clientId!==this.clientId||typeof saved.token!=='string'||!saved.token||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now()){
      this.disconnect();return null;
    }
    this.useToken(saved.token,saved.expiresAt);
    // Verify the account with Google before loading any account-scoped task data.
    return this.identify();
  }
  useToken(token,expiresAt){
    this.token=token;this.expiresAt=expiresAt;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.expire(),expiresAt-Date.now());
  }
  async identify(){
    try{
      const user=await this.request('https://www.googleapis.com/oauth2/v3/userinfo');
      if(!user.sub||!user.email)throw new Error('Google kontu neizdevās noteikt.');
      this.user={id:user.sub,email:user.email};return this.user;
    }catch(error){this.disconnect();throw error;}
  }
  clearSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{/* Storage may be disabled. */}}
  expire(){this.token=null;this.expiresAt=0;clearTimeout(this.timer);this.clearSession();this.onExpire();}
  disconnect(){this.token=null;this.expiresAt=0;this.user=null;clearTimeout(this.timer);this.clearSession();}
  async request(url,options={}){
    if(this.token&&Date.now()>=this.expiresAt)this.expire();
    if(!this.token)throw new Error('Atkārtoti pieslēdzieties Google kontam.');
    let response;try{response=await fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw new Error('Savienojums neizdevās. Izmaiņas vēl nav saglabātas.');}
    if(response.status===401){this.expire();throw new Error('Google piekļuve beigusies. Pieslēdzieties vēlreiz.');}
    if(!response.ok)throw new Error(response.status===403?'Google disks liedza piekļuvi vai sasniegts pieprasījumu limits.':`Google diska pieprasījums neizdevās (${response.status}).`);
    return response.status===204?null:response.json();
  }
}
