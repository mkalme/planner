import {documentFor,validateDocument,documentFingerprint} from './document.js';
const API='https://www.googleapis.com/drive/v3/files';
export class ConflictError extends Error{constructor(){super('Google diskā ir jaunāki dati. Lejupielādējiet nesaglabātās izmaiņas un pārlādējiet datus.');}}
export class DriveStore{
  constructor(account){this.account=account;this.fileId=null;this.version=null;this.baseHash=null;}
  metadata(){return this.account.request(`${API}/${encodeURIComponent(this.fileId)}?fields=id,version`);}
  async read(){
    const doc=validateDocument(await this.account.request(`${API}/${this.fileId}?alt=media`));
    const metadata=await this.metadata(),hash=await documentFingerprint(doc);
    // Drive versions also change for metadata. Track the exact document actually displayed.
    this.version=metadata.version;this.baseHash=hash;return doc;
  }
  async load(){
    let files=[],pageToken;
    do{
      const params=new URLSearchParams({spaces:'appDataFolder',q:"name = 'planner.json' and trashed = false",fields:'nextPageToken,files(id,name)',pageSize:'1000'});
      if(pageToken)params.set('pageToken',pageToken);
      const page=await this.account.request(`${API}?${params}`);files.push(...(page.files||[]));pageToken=page.nextPageToken;
    }while(pageToken);
    if(files.length>1)throw new Error('Google diskā ir vairāki planner.json faili. Pirms turpināšanas jānovērš datu dublēšanās.');
    if(!files.length){
      const ids=await this.account.request(`${API}/generateIds?count=1&space=appDataFolder&type=files`);
      this.fileId=ids.ids[0];const doc=documentFor([]);
      // Reconcile a lost create response using the pre-generated ID; never create a second file.
      try{await this.create(doc);}catch(error){try{await this.metadata();}catch{throw error;}}
    }else this.fileId=files[0].id;
    return this.read();
  }
  async create(doc){
    const boundary=`planner_${crypto.randomUUID()}`;
    const metadata={id:this.fileId,name:'planner.json',mimeType:'application/json',parents:['appDataFolder']};
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(doc)}\r\n--${boundary}--`;
    await this.account.request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  }
  // expectedHash: the fingerprint the edit was based on, or a list of them. A queued edit may also
  // build on this browser's own earlier upload whose result is not known yet.
  async save(doc,expectedVersion,expectedHash=null){
    const targetHash=await documentFingerprint(doc),expected=expectedHash===null?null:[].concat(expectedHash);
    if(expected&&(!expected.length||expected.some(hash=>!/^[a-f0-9]{64}$/.test(hash))))throw new Error('Nederīga nesaglabāto izmaiņu atkopšanas informācija. Lejupielādējiet izmaiņas un pārlādējiet datus.');
    const remote=await this.read();
    // An upload may have succeeded even if its response was lost. Verify all data, not only writeId.
    if(this.baseHash===targetHash)return remote;
    if(expected?!expected.includes(this.baseHash):this.version!==expectedVersion)throw new ConflictError();
    await this.account.request(`https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media&fields=id,version`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});
    const saved=await this.read();if(this.baseHash!==targetHash)throw new ConflictError();return saved;
  }
}
