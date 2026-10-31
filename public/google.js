export class GoogleAccount{
  constructor(clientId,onExpire){this.clientId=clientId;this.onExpire=onExpire;this.token=null;this.timer=null;this.user=null;}
  async connect(){
    if(!this.clientId)throw new Error('Google pieslēgšanās vēl nav konfigurēta.');
    if(!globalThis.google?.accounts?.oauth2)throw new Error('Google pieslēgšanās nav ielādēta. Pārbaudiet savienojumu un mēģiniet vēlreiz.');
    const token=await new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:'openid email https://www.googleapis.com/auth/drive.appdata',callback:r=>r.error?reject(new Error('Google piekļuve nav piešķirta.')):resolve(r),error_callback:()=>reject(new Error('Google pieslēgšanās atcelta.'))});
      client.requestAccessToken({prompt:'select_account'});
    });
    this.token=token.access_token;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.expire(),Math.max(1,Number(token.expires_in)-60)*1000);
    try{
      const user=await this.request('https://www.googleapis.com/oauth2/v3/userinfo');
      if(!user.sub||!user.email)throw new Error('Google kontu neizdevās noteikt.');
      this.user={id:user.sub,email:user.email};return this.user;
    }catch(error){this.disconnect();throw error;}
  }
  expire(){this.token=null;clearTimeout(this.timer);this.onExpire();}
  disconnect(){this.token=null;this.user=null;clearTimeout(this.timer);}
  async request(url,options={}){
    if(!this.token)throw new Error('Atkārtoti pieslēdzieties Google kontam.');
    let response;try{response=await fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw new Error('Savienojums neizdevās. Izmaiņas vēl nav saglabātas.');}
    if(response.status===401){this.expire();throw new Error('Google piekļuve beigusies. Pieslēdzieties vēlreiz.');}
    if(!response.ok)throw new Error(response.status===403?'Google disks liedza piekļuvi vai sasniegts pieprasījumu limits.':`Google diska pieprasījums neizdevās (${response.status}).`);
    return response.status===204?null:response.json();
  }
}
